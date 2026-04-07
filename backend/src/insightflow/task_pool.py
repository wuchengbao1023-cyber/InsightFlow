"""
InsightFlow v5 — 任务池与 DAG 依赖图
======================================

核心概念（来自 ReWOO 范式）：
- TaskPool: 中央任务池，所有Agent通过它领取和提交任务
- Task: 可执行的子任务，包含类型、输入、依赖、结果
- TaskDAG: 有向无环图，管理任务间的依赖关系
- 事件驱动：任务状态变化时通知监听者

技术选型：纯 Python asyncio（兼容 Python 3.7，不依赖 Redis）
内存队列实现，适合单进程部署。如需分布式，可替换为 Redis。

Author: InsightFlow AI Team
"""

import asyncio
import logging
import time
from typing import Dict, Any, List, Optional, Callable, Awaitable, Set
from enum import Enum
from datetime import datetime

logger = logging.getLogger(__name__)


# ── 任务状态枚举 ──────────────────────────────────────────────

class TaskStatus(Enum):
    PENDING = "pending"          # 等待执行（依赖未满足）
    READY = "ready"              # 依赖已满足，可以执行
    RUNNING = "running"          # 正在执行
    SUCCESS = "success"          # 执行成功
    FAILED = "failed"            # 执行失败
    CANCELLED = "cancelled"      # 已取消（被修正任务替代）
    CORRECTING = "correcting"    # 正在被修正（辩论框架用）


class TaskType(Enum):
    """任务类型（对应各Agent的专长领域）"""
    DATA_PROFILE = "data_profile"       # 老陈：数据画像
    DATA_QUERY = "data_query"           # 老陈：数据查询（SQL执行）
    ANALYZE_DATA = "analyze_data"       # 老林：数据分析
    PREDICT_TREND = "predict_trend"     # 老王：趋势预测
    VALIDATE_RESULT = "validate_result" # 质检官：结果验证
    GENERATE_INSIGHT = "generate_insight" # 小赵：策略洞察
    WRITE_REPORT = "write_report"       # 小李：报告生成
    CORRECT_ANALYSIS = "correct_analysis" # 修正任务（辩论框架）
    CUSTOM = "custom"                   # 自定义任务


# ── 任务定义 ──────────────────────────────────────────────────

class Task:
    """
    单个子任务。
    
    属性：
        id: 唯一标识（如 "task_1", "task_2_corrected"）
        type: 任务类型（决定哪个Agent执行）
        description: 任务描述（给Agent看的prompt片段）
        depends_on: 依赖的任务ID列表
        assigned_to: 分配的Agent角色
        input_data: 输入数据（其他任务的结果、原始数据等）
        result: 执行结果
        status: 当前状态
        priority: 优先级（数字越小越先执行）
        retries: 重试次数
        max_retries: 最大重试次数
        created_at: 创建时间
        started_at: 开始执行时间
        completed_at: 完成时间
        error: 错误信息
        metadata: 额外元数据
    """

    _counter = 0

    def __init__(
        self,
        task_type: TaskType,
        description: str,
        depends_on: Optional[List[str]] = None,
        assigned_to: str = "",
        input_data: Optional[Dict[str, Any]] = None,
        priority: int = 10,
        task_id: Optional[str] = None,
    ):
        if task_id:
            self.id = task_id
        else:
            Task._counter += 1
            self.id = f"task_{Task._counter}"

        self.type = task_type
        self.description = description
        self.depends_on = depends_on or []
        self.assigned_to = assigned_to
        self.input_data = input_data or {}
        self.result: Optional[Dict[str, Any]] = None
        self.status = TaskStatus.PENDING
        self.priority = priority
        self.retries = 0
        self.max_retries = 2
        self.created_at = datetime.now()
        self.started_at: Optional[datetime] = None
        self.completed_at: Optional[datetime] = None
        self.error: Optional[str] = None
        self.metadata: Dict[str, Any] = {}

        # v5.1 fix: 实例变量（之前是类变量，导致所有Task共享同一个字典，DAG依赖计算完全混乱）
        self._dependency_statuses: Dict[str, TaskStatus] = {}

    @property
    def is_terminal(self) -> bool:
        """是否已到达终态"""
        return self.status in (
            TaskStatus.SUCCESS, TaskStatus.FAILED,
            TaskStatus.CANCELLED, TaskStatus.CORRECTING,
        )

    @property
    def dependencies_met(self) -> bool:
        """所有依赖是否已成功完成"""
        if not self.depends_on:
            return True  # 无依赖，直接就绪
        return all(
            dep_status == TaskStatus.SUCCESS
            for dep_status in self._dependency_statuses.values()
        )

    def to_dict(self) -> Dict[str, Any]:
        """序列化为字典"""
        return {
            "id": self.id,
            "type": self.type.value,
            "description": self.description,
            "depends_on": self.depends_on,
            "assigned_to": self.assigned_to,
            "status": self.status.value,
            "priority": self.priority,
            "retries": self.retries,
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "duration_seconds": (
                (self.completed_at - self.started_at).total_seconds()
                if self.started_at and self.completed_at else None
            ),
        }


# ── 任务池 ─────────────────────────────────────────────────────

class TaskPool:
    """
    中央任务池 — ReWOO 范式的核心组件。
    
    职责：
    1. 管理所有子任务的生命周期
    2. DAG 依赖管理 — 自动计算哪些任务可以执行
    3. 事件通知 — 任务状态变化时回调监听者
    4. 状态查询 — 供前端可视化展示
    
    使用方式：
        pool = TaskPool()
        pool.on_status_change(my_callback)
        
        task1 = pool.add_task(Task(TaskType.DATA_QUERY, "查询销售数据", assigned_to="DATA_ENGINEER"))
        task2 = pool.add_task(Task(TaskType.ANALYZE_DATA, "分析数据", depends_on=[task1.id], assigned_to="DATA_ANALYST"))
        
        ready = pool.get_ready_tasks()  # 返回依赖已满足的任务
    """

    def __init__(self):
        self._tasks: Dict[str, Task] = {}
        self._listeners: List[Callable] = []
        self._lock = asyncio.Lock()

    def add_task(self, task: Task) -> Task:
        """添加任务到池中"""
        self._tasks[task.id] = task
        # 初始化依赖状态
        for dep_id in task.depends_on:
            if dep_id in self._tasks:
                # 依赖任务已存在，记录其当前状态
                task._dependency_statuses[dep_id] = self._tasks[dep_id].status
            else:
                # 依赖任务尚未添加，先标记为 PENDING
                # 后续当依赖任务被 complete_task() 时会自动更新此状态
                task._dependency_statuses[dep_id] = TaskStatus.PENDING
        logger.info(f"[任务池] 添加任务: {task.id} ({task.type.value}) → {task.assigned_to}, 依赖={task.depends_on}, 状态初始化={task._dependency_statuses}")
        self._notify("task_created", task)
        return task

    def get_task(self, task_id: str) -> Optional[Task]:
        """获取任务"""
        return self._tasks.get(task_id)

    def get_all_tasks(self) -> Dict[str, Task]:
        """获取所有任务"""
        return dict(self._tasks)

    def get_ready_tasks(self) -> List[Task]:
        """
        获取可执行的任务（依赖已满足且状态为PENDING）。
        按优先级排序。
        """
        ready = []
        for task in self._tasks.values():
            if task.status == TaskStatus.PENDING and task.dependencies_met:
                task.status = TaskStatus.READY
                self._notify("task_ready", task)
                ready.append(task)
        ready.sort(key=lambda t: t.priority)
        return ready

    def start_task(self, task_id: str) -> Optional[Task]:
        """标记任务开始执行"""
        task = self._tasks.get(task_id)
        if task and task.status == TaskStatus.READY:
            task.status = TaskStatus.RUNNING
            task.started_at = datetime.now()
            self._notify("task_started", task)
            return task
        return None

    def complete_task(self, task_id: str, result: Dict[str, Any]) -> Optional[Task]:
        """
        标记任务完成。
        自动更新依赖此任务的其他任务的状态。
        """
        task = self._tasks.get(task_id)
        if not task:
            return None

        task.status = TaskStatus.SUCCESS
        task.result = result
        task.completed_at = datetime.now()

        # 更新所有依赖此任务的任务
        for other in self._tasks.values():
            if task_id in other.depends_on:
                other._dependency_statuses[task_id] = TaskStatus.SUCCESS

        self._notify("task_completed", task)
        return task

    def fail_task(self, task_id: str, error: str) -> Optional[Task]:
        """标记任务失败"""
        task = self._tasks.get(task_id)
        if not task:
            return None

        task.status = TaskStatus.FAILED
        task.error = error
        task.completed_at = datetime.now()

        # 更新依赖状态
        for other in self._tasks.values():
            if task_id in other.depends_on:
                other._dependency_statuses[task_id] = TaskStatus.FAILED

        self._notify("task_failed", task)
        return task

    def correct_task(self, original_task_id: str, correction_description: str) -> Optional[Task]:
        """
        创建修正任务（辩论框架用）。
        将原任务标记为 CORRECTING，创建新的修正任务依赖原任务的结果。
        """
        original = self._tasks.get(original_task_id)
        if not original:
            return None

        original.status = TaskStatus.CORRECTING

        # 创建修正任务
        correction_id = f"{original_task_id}_corrected"
        correction = Task(
            task_type=TaskType.CORRECT_ANALYSIS,
            description=f"修正: {correction_description}\n原始任务: {original.description}",
            depends_on=[original_task_id],
            assigned_to=original.assigned_to,
            input_data={
                "original_result": original.result,
                "correction_reason": correction_description,
                **original.input_data,
            },
            priority=original.priority - 1,  # 修正任务优先级更高
            task_id=correction_id,
        )
        correction.metadata["original_task_id"] = original_task_id

        self._tasks[correction.id] = correction
        correction._dependency_statuses[original_task_id] = TaskStatus.SUCCESS

        self._notify("task_correcting", original)
        self._notify("task_created", correction)

        return correction

    def get_progress(self) -> Dict[str, Any]:
        """获取任务池进度（供前端展示）"""
        total = len(self._tasks)
        if total == 0:
            return {"total": 0, "completed": 0, "running": 0, "pending": 0, "failed": 0}

        counts = {}
        for status in TaskStatus:
            counts[status.value] = sum(
                1 for t in self._tasks.values() if t.status == status
            )

        return {
            "total": total,
            **counts,
            "tasks": [
                t.to_dict() for t in sorted(
                    self._tasks.values(),
                    key=lambda x: (x.priority, x.created_at)
                )
            ],
        }

    def get_dag_data(self) -> Dict[str, Any]:
        """
        获取 DAG 数据（供前端可视化）。
        返回节点和边，匹配前端 D3/SVG 渲染格式。
        """
        nodes = []
        edges = []
        for task in self._tasks.values():
            nodes.append({
                "id": task.id,
                "type": task.type.value,
                "assigned_to": task.assigned_to,
                "status": task.status.value,
                "description": task.description[:60],
            })
            for dep_id in task.depends_on:
                edges.append({
                    "from": dep_id,
                    "to": task.id,
                })
        return {"nodes": nodes, "edges": edges}

    def on_status_change(self, callback: Callable[[str, Task], Any]):
        """注册状态变化监听器"""
        self._listeners.append(callback)

    def _notify(self, event_type: str, task: Task):
        """通知所有监听器"""
        for listener in self._listeners:
            try:
                listener(event_type, task)
            except Exception as e:
                logger.debug(f"[任务池] 监听器回调失败: {e}")

    def reset(self):
        """重置任务池"""
        self._tasks.clear()
        Task._counter = 0
