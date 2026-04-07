"""
InsightFlow v5.1 — Redis 分布式任务池后端
==========================================

对应意见.txt 中提到的：
"通信机制：使用 Redis 作为共享的任务池和状态存储，所有 Agent 都通过它来读写任务和结果"

设计原则：
1. 可选接入 — 通过环境变量 INSIGHTFLOW_REDIS_URL 启用，不设置则继续用内存
2. 接口兼容 — RedisTaskPoolBackend 与内存 TaskPool 完全兼容
3. 发布/订阅 — 任务状态变更通过 Redis Pub/Sub 实时通知
4. 过期机制 — 任务数据自动过期（TTL），防止内存泄漏
5. 连接池 — 复用 Redis 连接，避免频繁创建

使用方式：
    # 环境变量启用
    export INSIGHTFLOW_REDIS_URL=redis://localhost:6379/0
    
    # 代码中使用
    from .redis_backend import get_redis_backend, RedisTaskPoolBackend
    
    backend = get_redis_backend()
    if backend:
        # 使用 Redis
        await backend.add_task(task_dict)
        tasks = await backend.get_ready_tasks()
    else:
        # 降级到内存 TaskPool
        pool = TaskPool()
        pool.add_task(task)

Author: InsightFlow AI Team
"""

import json
import logging
import os
import time
from typing import Dict, Any, List, Optional, Callable

logger = logging.getLogger(__name__)


class RedisTaskPoolBackend:
    """
    Redis 分布式任务池后端。
    
    与内存 TaskPool 接口对齐，支持：
    - add_task / get_task / complete_task / fail_task / correct_task
    - get_ready_tasks / get_progress / get_dag_data
    - Pub/Sub 状态变更通知
    
    数据结构：
    - insflow:tasks:{task_id} → HASH（任务属性）
    - insflow:task_list → SET（所有任务ID）
    - insflow:tasks_by_status:{status} → SET（按状态索引）
    - insflow:deps:{task_id} → SET（依赖关系）
    - insflow:task_channel → Pub/Sub channel（状态变更通知）
    """

    # Redis Key 前缀
    KEY_PREFIX = "insflow:tasks:"
    LIST_KEY = "insflow:task_list"
    CHANNEL = "insflow:task_channel"

    def __init__(self, redis_url: Optional[str] = None):
        """
        初始化 Redis 后端。
        
        Args:
            redis_url: Redis 连接 URL。为 None 时从环境变量读取。
        """
        self._url = redis_url or os.environ.get("INSIGHTFLOW_REDIS_URL", "")
        self._client = None
        self._pubsub = None
        self._connected = False

    async def connect(self) -> bool:
        """建立 Redis 连接。返回是否成功。"""
        if not self._url:
            logger.info("[Redis] INSIGHTFLOW_REDIS_URL 未设置，使用内存模式")
            return False

        try:
            import aioredis
            self._client = await aioredis.from_url(
                self._url,
                encoding="utf-8",
                decode_responses=True,
                max_connections=10,
            )
            # 测试连接
            await self._client.ping()
            self._connected = True
            logger.info(f"[Redis] 连接成功: {self._url[:50]}...")
            return True
        except ImportError:
            logger.warning("[Redis] aioredis 未安装，降级为内存模式。安装: pip install aioredis")
            return False
        except Exception as e:
            logger.error(f"[Redis] 连接失败: {e}，降级为内存模式")
            return False

    @property
    def is_connected(self) -> bool:
        return self._connected and self._client is not None

    async def close(self):
        """关闭 Redis 连接。"""
        if self._pubsub:
            await self._pubsub.close()
            self._pubsub = None
        if self._client:
            await self._client.close()
            self._client = None
        self._connected = False

    # ═══════════════════════════════════════════════════════
    # 任务操作（与 TaskPool 接口对齐）
    # ═══════════════════════════════════════════════════════

    async def add_task(self, task_data: Dict[str, Any]) -> str:
        """
        添加任务到 Redis。
        
        Args:
            task_data: 任务字典（含 id, type, description, depends_on, assigned_to, status, priority 等）
        
        Returns:
            task_id
        """
        if not self.is_connected:
            raise RuntimeError("Redis 未连接")

        task_id = task_data["id"]
        task_key = f"{self.KEY_PREFIX}{task_id}"

        # 序列化存储（HASH）
        await self._client.hset(task_key, mapping={
            "id": task_id,
            "type": task_data.get("type", ""),
            "description": task_data.get("description", ""),
            "assigned_to": task_data.get("assigned_to", ""),
            "status": task_data.get("status", "pending"),
            "priority": str(task_data.get("priority", 10)),
            "result": json.dumps(task_data.get("result", {}), ensure_ascii=False),
            "error": task_data.get("error", ""),
            "depends_on": json.dumps(task_data.get("depends_on", [])),
            "created_at": task_data.get("created_at", ""),
        })

        # 设置 TTL（24小时自动过期）
        await self._client.expire(task_key, 86400)

        # 加入全局列表
        await self._client.sadd(self.LIST_KEY, task_id)

        # 按状态索引
        status = task_data.get("status", "pending")
        await self._client.sadd(f"insflow:tasks_by_status:{status}", task_id)

        # 依赖关系
        for dep_id in task_data.get("depends_on", []):
            await self._client.sadd(f"insflow:deps:{dep_id}", task_id)

        # 发布通知
        await self._publish("task_created", task_id)

        logger.info(f"[Redis] 添加任务: {task_id} ({task_data.get('type')}) → {task_data.get('assigned_to')}")
        return task_id

    async def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        """获取单个任务。"""
        if not self.is_connected:
            return None

        task_key = f"{self.KEY_PREFIX}{task_id}"
        data = await self._client.hgetall(task_key)
        if not data:
            return None

        return self._deserialize_task(data)

    async def get_all_tasks(self) -> Dict[str, Dict[str, Any]]:
        """获取所有任务。"""
        if not self.is_connected:
            return {}

        task_ids = await self._client.smembers(self.LIST_KEY)
        tasks = {}
        for tid in task_ids:
            task = await self.get_task(tid)
            if task:
                tasks[tid] = task
        return tasks

    async def get_ready_tasks(self) -> List[Dict[str, Any]]:
        """
        获取可执行的任务（依赖已满足且状态为 pending）。
        """
        if not self.is_connected:
            return []

        ready_tasks = []
        pending_ids = await self._client.smembers("insflow:tasks_by_status:pending")

        for task_id in pending_ids:
            task = await self.get_task(task_id)
            if not task:
                continue

            # 检查依赖是否全部成功
            depends_on = json.loads(task.get("depends_on", "[]"))
            all_deps_met = True
            for dep_id in depends_on:
                dep = await self.get_task(dep_id)
                if not dep or dep.get("status") != "success":
                    all_deps_met = False
                    break

            if all_deps_met:
                task["status"] = "ready"
                await self._update_status(task_id, "ready")
                ready_tasks.append(task)

        # 按优先级排序
        ready_tasks.sort(key=lambda t: int(t.get("priority", 10)))
        return ready_tasks

    async def start_task(self, task_id: str) -> bool:
        """标记任务开始执行。"""
        return await self._update_status(task_id, "running")

    async def complete_task(self, task_id: str, result: Dict[str, Any]) -> bool:
        """标记任务完成。"""
        if not self.is_connected:
            return False

        task_key = f"{self.KEY_PREFIX}{task_id}"
        await self._client.hset(task_key, "result", json.dumps(result, ensure_ascii=False))
        success = await self._update_status(task_id, "success")

        if success:
            # 通知依赖此任务的其他任务
            dependents = await self._client.smembers(f"insflow:deps:{task_id}")
            for dep_id in dependents:
                await self._publish("dependency_met", dep_id)

        return success

    async def fail_task(self, task_id: str, error: str) -> bool:
        """标记任务失败。"""
        if not self.is_connected:
            return False

        task_key = f"{self.KEY_PREFIX}{task_id}"
        await self._client.hset(task_key, "error", error)
        return await self._update_status(task_id, "failed")

    async def correct_task(self, original_task_id: str, correction_description: str) -> Optional[Dict[str, Any]]:
        """创建修正任务。"""
        if not self.is_connected:
            return None

        original = await self.get_task(original_task_id)
        if not original:
            return None

        # 标记原任务为 correcting
        await self._update_status(original_task_id, "correcting")

        # 创建修正任务
        correction_id = f"{original_task_id}_corrected"
        correction = {
            "id": correction_id,
            "type": "correct_analysis",
            "description": f"修正: {correction_description}\n原始任务: {original.get('description', '')}",
            "depends_on": [original_task_id],
            "assigned_to": original.get("assigned_to", ""),
            "status": "ready",  # 原任务已成功，修正任务立即可执行
            "priority": str(int(original.get("priority", 10)) - 1),
            "result": {},
            "error": "",
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "metadata": {"original_task_id": original_task_id},
        }

        await self.add_task(correction)
        logger.info(f"[Redis] 创建修正任务: {correction_id}")
        return correction

    async def get_progress(self) -> Dict[str, Any]:
        """获取任务池进度。"""
        if not self.is_connected:
            return {"total": 0, "completed": 0, "running": 0, "pending": 0, "failed": 0}

        all_tasks = await self.get_all_tasks()
        total = len(all_tasks)

        counts = {"pending": 0, "ready": 0, "running": 0, "success": 0, "failed": 0, "cancelled": 0, "correcting": 0}
        for task in all_tasks.values():
            status = task.get("status", "pending")
            if status in counts:
                counts[status] += 1

        return {
            "total": total,
            **counts,
            "tasks": sorted(
                all_tasks.values(),
                key=lambda t: (int(t.get("priority", 10)), t.get("created_at", ""))
            ),
        }

    async def get_dag_data(self) -> Dict[str, Any]:
        """获取 DAG 数据（供前端可视化）。"""
        if not self.is_connected:
            return {"nodes": [], "edges": []}

        all_tasks = await self.get_all_tasks()
        nodes = []
        edges = []

        for task_id, task in all_tasks.items():
            nodes.append({
                "id": task_id,
                "type": task.get("type", ""),
                "assigned_to": task.get("assigned_to", ""),
                "status": task.get("status", "pending"),
                "description": (task.get("description", "") or "")[:60],
            })
            for dep_id in json.loads(task.get("depends_on", "[]")):
                edges.append({"from": dep_id, "to": task_id})

        return {"nodes": nodes, "edges": edges}

    # ═══════════════════════════════════════════════════════
    # Pub/Sub 通知
    # ═══════════════════════════════════════════════════════

    async def subscribe(self, callback: Callable[[str, str], Any]):
        """
        订阅任务状态变更通知。
        
        Args:
            callback: 回调函数 (event_type, task_id)
        """
        if not self.is_connected:
            return

        self._pubsub = self._client.pubsub()
        await self._pubsub.subscribe(self.CHANNEL)

        async for message in self._pubsub.listen():
            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    event_type = data.get("event", "")
                    task_id = data.get("task_id", "")
                    callback(event_type, task_id)
                except Exception as e:
                    logger.debug(f"[Redis] Pub/Sub 消息解析失败: {e}")

    # ═══════════════════════════════════════════════════════
    # 内部方法
    # ═══════════════════════════════════════════════════════

    async def _update_status(self, task_id: str, new_status: str) -> bool:
        """更新任务状态。"""
        if not self.is_connected:
            return False

        task = await self.get_task(task_id)
        if not task:
            return False

        old_status = task.get("status", "")
        if old_status == new_status:
            return True

        # 更新 HASH
        task_key = f"{self.KEY_PREFIX}{task_id}"
        await self._client.hset(task_key, "status", new_status)

        # 更新状态索引
        if old_status:
            await self._client.srem(f"insflow:tasks_by_status:{old_status}", task_id)
        await self._client.sadd(f"insflow:tasks_by_status:{new_status}", task_id)

        # 发布通知
        await self._publish("status_change", task_id, {"old_status": old_status, "new_status": new_status})

        return True

    async def _publish(self, event_type: str, task_id: str, extra: Dict[str, Any] = None):
        """发布状态变更事件。"""
        if not self._client:
            return

        message = json.dumps({
            "event": event_type,
            "task_id": task_id,
            "timestamp": time.time(),
            **(extra or {}),
        }, ensure_ascii=False)

        await self._client.publish(self.CHANNEL, message)

    def _deserialize_task(self, data: Dict[str, str]) -> Dict[str, Any]:
        """从 Redis HASH 反序列化任务。"""
        return {
            "id": data.get("id", ""),
            "type": data.get("type", ""),
            "description": data.get("description", ""),
            "assigned_to": data.get("assigned_to", ""),
            "status": data.get("status", "pending"),
            "priority": data.get("priority", "10"),
            "result": json.loads(data.get("result", "{}")),
            "error": data.get("error", ""),
            "depends_on": json.loads(data.get("depends_on", "[]")),
            "created_at": data.get("created_at", ""),
        }


# ── 单例 + 自动初始化 ──

_redis_backend: Optional[RedisTaskPoolBackend] = None


def get_redis_backend() -> Optional[RedisTaskPoolBackend]:
    """
    获取 Redis 后端单例。
    
    注意：使用前需要先调用 await backend.connect()。
    返回 None 表示 Redis 不可用（未配置或连接失败）。
    """
    global _redis_backend
    if _redis_backend is None:
        _redis_backend = RedisTaskPoolBackend()
    return _redis_backend
