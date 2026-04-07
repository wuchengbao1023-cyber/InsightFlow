"""
InsightFlow Auto-Analyze API
==============================

v4: 对话驱动模式
  POST /api/v1/insightflow/upload
    上传文件到DuckDB + 数据扫描，返回SSE事件流
  POST /api/v1/insightflow/ask
    用户提问，多Agent并行流式分析，返回SSE事件流

v3: 兼容旧版
  POST /api/v1/insightflow/upload-and-analyze
    上传文件并自动分析（v3兼容）
  POST /api/v1/insightflow/analyze/{table_name}
    对已加载的表触发分析（v3兼容）

  GET /api/v1/insightflow/status
    检查模块状态
"""

import logging
import time
import json
import math
from typing import Any, AsyncGenerator, List, Optional, Tuple

from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()


# ── v4: 对话管理器单例 ──────────────────────────────────
_conv_manager = None

def get_conversation_manager():
    global _conv_manager
    if _conv_manager is None:
        from ...insightflow.conversation_manager import ConversationManager
        _conv_manager = ConversationManager()
    return _conv_manager


# ── v4: 请求模型 ────────────────────────────────────────

class AskRequest(BaseModel):
    question: str
    table_name: Optional[str] = None


class MultiUploadRequest(BaseModel):
    """多文件批量上传请求（可选，用于复杂场景）"""
    pass


def _safe_json(obj: Any) -> str:
    """安全JSON序列化"""
    def default(o):
        try:
            import numpy as np
            if isinstance(o, (np.integer,)): return int(o)
            if isinstance(o, (np.floating,)): return float(o)
            if isinstance(o, np.ndarray): return o.tolist()
        except ImportError:
            pass
        if isinstance(o, float) and (math.isnan(o) or math.isinf(o)):
            return None
        return f"<{type(o).__name__}>"
    return json.dumps(obj, default=default, ensure_ascii=False)


def sse(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {_safe_json(data)}\n\n"


@router.get("/status")
async def insightflow_status():
    """检查InsightFlow模块状态"""
    try:
        from ...insightflow.orchestrator import get_orchestrator
        orch = get_orchestrator()
        conv = get_conversation_manager()
        return {
            "status": "ready",
            "version": "v5",
            "mode": "parliament",
            "features": [
                "多Agent协作分析（ReWOO + Debate）",
                "主管AI任务分解（Supervisor）",
                "DAG依赖图驱动并行执行",
                "任务池状态驱动调度",
                "Debate辩论框架（对抗性审查）",
                "多Agent并行流式输出",
                "论文级报告",
                "PDF导出",
                "Token追踪",
                "Agent自进化",
            ],
            "agents": [
                {"role": "DATA_ENGINEER", "name": "数据工程师", "type": "code"},
                {"role": "DATA_ANALYST", "name": "数据分析师", "type": "llm"},
                {"role": "FORECAST_ANALYST", "name": "预测分析师", "type": "llm"},
                {"role": "STRATEGY_ADVISOR", "name": "策略顾问", "type": "llm"},
                {"role": "QUALITY_REVIEWER", "name": "质量审查员", "type": "llm"},
                {"role": "REPORT_EDITOR", "name": "报告主编", "type": "code"},
            ],
            "session": conv.state.to_dict() if conv.is_ready() else None,
            "description": "v4对话驱动模式：上传文件→提问→多Agent并行分析→论文级报告"
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/memory/stats")
async def agent_memory_stats():
    """获取Agent自进化记忆统计"""
    try:
        from ...insightflow.agent_memory import get_agent_memory
        memory = get_agent_memory()
        return memory.get_stats()
    except Exception as e:
        return {"error": str(e)}


@router.get("/memory/lessons")
async def agent_memory_lessons():
    """获取所有经验教训（按confidence排序）"""
    try:
        from ...insightflow.agent_memory import get_agent_memory
        memory = get_agent_memory()
        return {"lessons": memory.get_all_lessons()}
    except Exception as e:
        return {"error": str(e)}


@router.delete("/memory/lessons/{lesson_id}")
async def delete_lesson(lesson_id: str):
    """删除单条经验教训"""
    try:
        from ...insightflow.agent_memory import get_agent_memory
        memory = get_agent_memory()
        before = len(memory._lessons)
        memory._lessons = [l for l in memory._lessons if l.id != lesson_id]
        memory._persist()
        return {"deleted": before - len(memory._lessons)}
    except Exception as e:
        return {"error": str(e)}


@router.delete("/memory")
async def clear_all_memory():
    """清空所有经验教训（谨慎使用）"""
    try:
        from ...insightflow.agent_memory import get_agent_memory
        memory = get_agent_memory()
        count = len(memory._lessons)
        memory._lessons = []
        memory._persist()
        return {"cleared": count}
    except Exception as e:
        return {"error": str(e)}


@router.post("/detective/query")
async def detective_query(request: dict):
    """
    数据侦探：前端追问接口。

    Body: {"question": "Q3各区域销售额是多少?", "context": "可选上下文"}
    Returns: {"success": bool, "sql": str, "result": {...}, "explanation": str}
    """
    from starlette.responses import StreamingResponse
    import asyncio

    question = request.get("question", "").strip()
    if not question:
        return {"success": False, "error": "问题不能为空"}

    context = request.get("context", "")

    # 流式返回
    from ...insightflow.nl2sql import get_detective
    detective = get_detective()

    async def event_stream():
        try:
            async for event in detective.query_stream(question, context):
                yield f"data: {json.dumps(event, ensure_ascii=False, default=str)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'done', 'data': {'success': False, 'error': str(e)}}, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/detective/query/sync")
async def detective_query_sync(request: dict):
    """
    数据侦探：同步版本（用于Agent内部调用）。
    """
    question = request.get("question", "").strip()
    if not question:
        return {"success": False, "error": "问题不能为空"}

    context = request.get("context", "")

    from ...insightflow.nl2sql import get_detective
    detective = get_detective()

    try:
        result = await detective.query(question, context)
        return result
    except Exception as e:
        return {"success": False, "error": str(e)}


# ═══════════════════════════════════════════════════════════
# v4: 对话驱动端点
# ═══════════════════════════════════════════════════════════

@router.post("/ask")
async def ask_question(request: AskRequest):
    """
    v4核心端点：用户提问 → 多Agent并行流式分析。
    要求会话已初始化（先调用/upload）。

    SSE事件流：
    - team_selected: 选中的Agent团队
    - thinking_start: Agent开始思考
    - thinking_delta: 流式文本增量（打字机效果）
    - thinking_end: Agent思考完成
    - collaboration: Agent间协作
    - review_start/review_result: 质量审查
    - report_ready: 最终报告
    - analysis_complete: 分析完成
    - error: 错误
    """
    conv = get_conversation_manager()

    if not conv.is_ready():
        yield_sse = _error_stream("请先上传文件", "session_not_ready")
        return StreamingResponse(yield_sse, media_type="text/event-stream", headers=_sse_headers())

    question = request.question.strip()
    if not question:
        yield_sse = _error_stream("问题不能为空", "empty_question")
        return StreamingResponse(yield_sse, media_type="text/event-stream", headers=_sse_headers())

    import asyncio

    async def event_stream():
        try:
            from ...insightflow.orchestrator import get_orchestrator
            orch = get_orchestrator()

            async for event in orch.analyze_question_v5(question, conv_manager=conv):
                chunk = sse(event["type"], event["data"])
                yield chunk

        except Exception as e:
            logger.error(f"[v5/ask] 分析失败: {e}", exc_info=True)
            yield sse("error", {"message": str(e)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream; charset=utf-8",
        headers=_sse_headers()
    )


@router.get("/ask/stream")
async def ask_question_stream(
    question: str = Query(..., description="用户问题"),
    table_name: str = Query("", description="表名"),
    session_id: str = Query("", description="会话ID"),
):
    """
    GET版本的 /ask，用于 EventSource API（浏览器原生支持SSE）。
    EventSource 只支持 GET 请求，所以提供此端点。
    """
    conv = get_conversation_manager()

    if not conv.is_ready():
        async def err_gen():
            yield sse("app_error", {"message": "请先上传文件", "type": "session_not_ready"})
        return StreamingResponse(err_gen(), media_type="text/event-stream", headers=_sse_headers())

    q = question.strip()
    if not q:
        async def err_gen2():
            yield sse("app_error", {"message": "问题不能为空", "type": "empty_question"})
        return StreamingResponse(err_gen2(), media_type="text/event-stream", headers=_sse_headers())

    async def event_stream():
        try:
            from ...insightflow.orchestrator import get_orchestrator
            orch = get_orchestrator()

            async for event in orch.analyze_question_v5(q, conv_manager=conv):
                # EventSource 中 "error" 是保留事件类型，需要改名
                etype = "app_error" if event["type"] == "error" else event["type"]
                yield sse(etype, event["data"])

        except Exception as e:
            logger.error(f"[v5/ask/stream] 分析失败: {e}", exc_info=True)
            yield sse("app_error", {"message": str(e)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream; charset=utf-8",
        headers=_sse_headers()
    )


@router.post("/upload/multi")
async def upload_multi(files: List[UploadFile] = File(...)):
    """
    v4: 多文件批量上传 — 支持对比分析。
    多个文件各自加载为独立DuckDB表，同时创建一个合并视图。
    返回SSE事件流。
    """
    async def event_stream() -> AsyncGenerator[str, None]:
        try:
            if not files or len(files) < 2:
                yield sse("error", {"message": "请至少上传2个文件进行对比分析"})
                return

            if len(files) > 10:
                yield sse("error", {"message": "最多同时上传10个文件"})
                return

            table_names = []
            file_names = []
            total_rows = 0
            total_cols = 0

            # 逐个加载文件
            for i, file in enumerate(files):
                yield sse("agent_start", {"agent": "系统", "step": i, "desc": f"正在读取文件 {i+1}/{len(files)}: {file.filename}..."})

                content = await file.read()
                table_name, load_err = await _load_file_to_duckdb(file.filename, content)

                if not table_name:
                    yield sse("error", {"message": f"文件加载失败: {file.filename}（{load_err or '未知错误'}）"})
                    return

                table_names.append(table_name)
                file_names.append(file.filename)

                # 获取基本信息
                from ...core.duckdb_engine import get_duckdb_engine
                duck = get_duckdb_engine()
                try:
                    info = duck.execute_query(f'SELECT COUNT(*) as cnt FROM "{table_name}"')
                    rows = info.get("data", [{}])[0].get("cnt", 0) if info.get("data") else 0
                    # 用 DESCRIBE 获取列数
                    try:
                        desc = duck.execute_query(f'DESCRIBE "{table_name}"')
                        cols = desc.get("row_count", 0) or len(desc.get("data", []))
                    except:
                        cols = 0
                    total_rows += rows
                    total_cols = max(total_cols, cols)
                except:
                    pass

                yield sse("file_loaded", {
                    "index": i, "filename": file.filename,
                    "table_name": table_name, "total": len(files),
                })

            # 创建合并视图（UNION ALL所有表）
            # 注意：直接用底层连接执行DDL，绕过execute_query的安全过滤（只允许SELECT）
            from ...core.duckdb_engine import get_duckdb_engine
            duck = get_duckdb_engine()
            merge_view = f"_merge_view_{int(time.time())}"

            try:
                union_parts = [f"SELECT *, '{file_names[i]}' as _source_file FROM {tn}" for i, tn in enumerate(table_names)]
                union_sql = f'CREATE VIEW "{merge_view}" AS {" UNION ALL ".join(union_parts)}'
                # 直接用底层conn执行DDL（execute_query只允许SELECT）
                if hasattr(duck, '_conn') and duck._conn:
                    duck._conn.execute(union_sql)
                    logger.info(f"合并视图已创建: {merge_view}")
                else:
                    merge_view = None
            except Exception as e:
                logger.warning(f"合并视图创建失败（列不兼容），将使用独立表模式: {e}")
                merge_view = None

            # 老陈扫描数据画像（扫描合并视图或第一个表）
            from ...insightflow.orchestrator import get_orchestrator
            orch = get_orchestrator()

            scan_target = merge_view or table_names[0]
            async for event in orch.scan_data(scan_target):
                yield sse(event["type"], event["data"])

            # 初始化对话管理器（多文件模式）
            chen_profile = orch.state.chen_profile or {}
            conv = get_conversation_manager()
            conv.init_session(
                scan_target,
                " + ".join(file_names),
                chen_profile,
                table_names=table_names,
                file_names=file_names,
                merge_view=merge_view,
            )

            yield sse("data_ready", {
                "table_name": scan_target,
                "filename": " + ".join(file_names),
                "total_rows": chen_profile.get("shape", [total_rows, total_cols])[0],
                "total_columns": chen_profile.get("shape", [total_rows, total_cols])[1],
                "quality_score": (chen_profile.get("quality") or {}).get("score"),
                "key_columns": chen_profile.get("key_columns", []),
                "warnings": chen_profile.get("warnings", []),
                "session_id": conv.state.session_id,
                "multi_file": True,
                "file_names": file_names,
                "table_names": table_names,
                "files_count": len(files),
            })

        except Exception as e:
            logger.error(f"[Upload/Multi] 批量上传失败: {e}")
            yield sse("error", {"message": str(e)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers=_sse_headers()
    )


@router.post("/upload")
async def upload_only(file: UploadFile = File(...)):
    """
    v4: 上传文件到DuckDB + 老陈扫描数据画像。
    初始化对话会话，前端收到 data_ready 后显示提问输入框。
    """
    async def event_stream() -> AsyncGenerator[str, None]:
        try:
            yield sse("agent_start", {"agent": "系统", "step": 0, "desc": f"正在读取文件 {file.filename}..."})

            content = await file.read()

            # PDF/Word 文件可能需要 LLM 智能提取，提前告知前端
            if file.filename and file.filename.lower().endswith(('.pdf', '.docx')):
                yield sse("agent_start", {"agent": "系统", "step": 0, "desc": "检测到文档文件，正在智能提取结构化数据..."})

            table_name, load_err = await _load_file_to_duckdb(file.filename, content)

            if not table_name:
                yield sse("error", {"message": f"文件加载失败: {file.filename}（{load_err or '未知错误'}）"})
                return

            yield sse("agent_start", {"agent": "系统", "step": 0, "desc": f"文件已加载（表名: {table_name})"})

            # 老陈扫描数据画像
            from ...insightflow.orchestrator import get_orchestrator
            orch = get_orchestrator()

            async for event in orch.scan_data(table_name):
                yield sse(event["type"], event["data"])

            # 扫描完成后，初始化对话管理器
            chen_profile = orch.state.chen_profile or {}
            conv = get_conversation_manager()
            conv.init_session(table_name, file.filename, chen_profile)

            yield sse("data_ready", {
                "table_name": table_name,
                "filename": file.filename,
                "total_rows": chen_profile.get("shape", [0, 0])[0],
                "total_columns": chen_profile.get("shape", [0, 0])[1],
                "quality_score": (chen_profile.get("quality") or {}).get("score"),
                "key_columns": chen_profile.get("key_columns", []),
                "warnings": chen_profile.get("warnings", []),
                "session_id": conv.state.session_id,
            })

        except Exception as e:
            logger.error(f"[Upload] 上传失败: {e}")
            yield sse("error", {"message": str(e)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers=_sse_headers()
    )


@router.post("/upload-and-analyze")
async def upload_and_analyze(file: UploadFile = File(...)):
    """
    上传文件并立即触发五人自动分析。
    返回 SSE 事件流：
      - agent_start: 某员工开始工作
      - agent_done:  某员工完成
      - report_ready: 最终报告
      - error: 出错
    """
    async def event_stream() -> AsyncGenerator[str, None]:
        try:
            # ── 1. 加载文件到DuckDB ──────────────────────────────────
            yield sse("agent_start", {"agent": "系统", "step": 0, "desc": f"正在读取文件 {file.filename}..."})

            content = await file.read()
            table_name, load_err = await _load_file_to_duckdb(file.filename, content)

            if not table_name:
                yield sse("error", {"message": f"文件加载失败: {file.filename}（{load_err or '未知错误'}）"})
                return

            yield sse("agent_start", {"agent": "系统", "step": 0, "desc": f"文件已加载（表名: {table_name}）"})

            # ── 2. 启动五人分析 ──────────────────────────────────────
            from ...insightflow.orchestrator import get_orchestrator
            orch = get_orchestrator()

            async for event in orch.run(table_name):
                yield sse(event["type"], event["data"])

        except Exception as e:
            logger.error(f"[AutoAnalyze] 分析失败: {e}")
            yield sse("error", {"message": str(e)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers=_sse_headers()
    )


@router.post("/analyze/{table_name}")
async def analyze_table(table_name: str, task: Optional[str] = Query(None, description="用户分析任务")):
    """
    对已上传的表触发讨论室分析。
    如果提供了task，跳过scan_data（已在上传阶段完成）。
    如果没有task，自动生成默认任务（向后兼容）。
    返回 SSE 事件流。
    """
    async def event_stream() -> AsyncGenerator[str, None]:
        try:
            # 验证表存在
            from ...core.duckdb_engine import get_duckdb_engine
            duck = get_duckdb_engine()
            tables = duck.list_tables()
            if table_name not in tables:
                yield sse("error", {"message": f"表 '{table_name}' 不存在，请先上传文件"})
                return

            from ...insightflow.orchestrator import get_orchestrator
            orch = get_orchestrator()

            if task:
                # 用户已下达任务，直接启动讨论（chen_profile已在上传阶段生成）
                yield sse("agent_start", {"agent": "系统", "step": 0, "desc": f"开始分析: {task}"})
                async for event in orch.start_discussion(task, table_name):
                    yield sse(event["type"], event["data"])
            else:
                # 无任务，使用run()走完整流程（向后兼容）
                yield sse("agent_start", {"agent": "系统", "step": 0, "desc": f"开始自动分析表: {table_name}"})
                async for event in orch.run(table_name):
                    yield sse(event["type"], event["data"])

        except Exception as e:
            logger.error(f"[AutoAnalyze] 分析失败: {e}")
            yield sse("error", {"message": str(e)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers=_sse_headers()
    )


async def _load_file_to_duckdb(filename: str, content: bytes) -> Tuple[str, Optional[str]]:
    """
    将上传的文件内容加载到DuckDB，返回 (表名, 错误信息)。
    复用现有 DuckDB 引擎的 load_file 方法。
    """
    from ...core.duckdb_engine import get_duckdb_engine

    duck = get_duckdb_engine()

    try:
        result = await duck.load_file(content, filename)
        if result and result.get("success"):
            table_name = result.get("table_name", "")
            logger.info(f"[AutoAnalyze] 文件加载成功: {filename} → {table_name}")
            return table_name, None
        else:
            error = result.get("error", "未知错误") if result else "加载返回空"
            logger.error(f"[AutoAnalyze] 文件加载失败: {filename}: {error}")
            return None, error
    except Exception as e:
        logger.error(f"[AutoAnalyze] 文件加载异常: {filename}: {e}")
        return None, str(e)


# ═══════════════════════════════════════════════════════════
# v6.2: 文档管理 API
# ═══════════════════════════════════════════════════════════

@router.get("/files")
async def list_uploaded_files():
    """列出所有已上传的持久化文件（表）"""
    from ...core.duckdb_engine import get_duckdb_engine
    from ...insightflow.session_store import get_session_store

    duck = get_duckdb_engine()
    store = get_session_store()

    try:
        tables = duck.list_tables()
        # 排除系统临时表和合并视图
        user_tables = [t for t in tables if not t.startswith("_") and not t.startswith("__temp_")]

        files = []
        for tname in user_tables:
            info = duck.get_table_summary(tname)
            files.append({
                "table_name": tname,
                "filename": info.get("filename", tname) if info else tname,
                "rows": info.get("rows", 0) if info else 0,
                "columns": info.get("columns", 0) if info else 0,
                "source": "persistent",
            })

        return {
            "files": files,
            "session": {
                "active": store.exists,
                "session_id": store.session_id,
                "filename": store.filename,
                "table_name": store.table_name,
                "is_multi_file": store.is_multi_file,
                "file_names": store.file_names,
            },
        }
    except Exception as e:
        logger.error("[Files] 列出文件失败: %s", e)
        return {"files": [], "session": {"active": False}, "error": str(e)}


@router.delete("/files/{table_name}")
async def delete_file(table_name: str):
    """删除指定的持久化文件（表）+ 清除 session"""
    from ...core.duckdb_engine import get_duckdb_engine
    from ...insightflow.session_store import get_session_store

    duck = get_duckdb_engine()
    store = get_session_store()
    conv = get_conversation_manager()

    # 清理合并视图
    if store.merge_view:
        duck.drop_table(store.merge_view)

    # 删除主表
    success = duck.drop_table(table_name)

    # 如果删除的是当前 session 的表，清除 session
    if table_name == store.table_name:
        store.clear()
        conv.reset()
        logger.info("[Files] 当前 session 表已删除，session 已重置")

    return {
        "success": success,
        "message": f"文件 {table_name} 已删除" if success else "删除失败",
    }


@router.post("/session/clear")
async def clear_session_endpoint():
    """前端清除数据时调用：重置后端 session（不删表，只清会话状态）"""
    conv = get_conversation_manager()
    conv.reset()
    logger.info("[Session] session 已被前端主动清除")
    return {"success": True, "message": "session 已清除"}


@router.post("/session/restore")
async def restore_session_endpoint():
    """前端刷新时调用：检查后端是否有可恢复的 session"""
    conv = get_conversation_manager()

    # 如果已初始化，直接返回
    if conv.is_ready():
        store_data = {}
        try:
            from ...insightflow.session_store import get_session_store
            store = get_session_store()
            store_data = {
                "session_id": store.session_id,
                "table_name": store.table_name,
                "filename": store.filename,
                "total_rows": store.chen_profile.get("shape", [0, 0])[0],
                "total_columns": store.chen_profile.get("shape", [0, 0])[1],
                "quality_score": (store.chen_profile.get("quality") or {}).get("score"),
                "key_columns": store.chen_profile.get("key_columns", []),
                "is_multi_file": store.is_multi_file,
                "file_names": store.file_names,
                "table_names": store.table_names,
            }
        except Exception:
            pass

        return {
            "restored": True,
            "session": {
                **conv.state.to_dict(),
                **store_data,
            }
        }

    # 尝试恢复
    restored = conv.restore_session()
    if restored:
        from ...insightflow.session_store import get_session_store
        store = get_session_store()

        # 同时恢复 orchestrator 的 chen_profile
        try:
            from ...insightflow.orchestrator import get_orchestrator
            orch = get_orchestrator()
            orch.state.chen_profile = store.chen_profile
            orch.state.table_name = store.table_name
        except Exception:
            pass

        return {
            "restored": True,
            "session": {
                "session_id": store.session_id,
                "table_name": store.table_name,
                "filename": store.filename,
                "total_rows": store.chen_profile.get("shape", [0, 0])[0],
                "total_columns": store.chen_profile.get("shape", [0, 0])[1],
                "quality_score": (store.chen_profile.get("quality") or {}).get("score"),
                "key_columns": store.chen_profile.get("key_columns", []),
                "is_multi_file": store.is_multi_file,
                "file_names": store.file_names,
                "table_names": store.table_names,
            }
        }

    return {"restored": False}


@router.post("/files/{table_name}/switch")
async def switch_to_file(table_name: str):
    """切换到历史已上传的文件，重建 session"""
    from ...core.duckdb_engine import get_duckdb_engine
    from ...insightflow.session_store import get_session_store

    duck = get_duckdb_engine()
    store = get_session_store()
    conv = get_conversation_manager()

    # 确认表存在
    tables = duck.list_tables()
    user_tables = [t for t in tables if not t.startswith("_") and not t.startswith("__temp_")]
    if table_name not in user_tables:
        return {"error": f"文件 {table_name} 不存在或已被删除"}

    # 获取表信息
    info = duck.get_table_summary(table_name)
    if not info:
        return {"error": f"无法读取文件 {table_name} 的信息"}

    filename = info.get("filename", table_name)
    rows = info.get("rows", 0)
    columns = info.get("columns", 0)

    # 构建 chen_profile
    chen_profile = {
        "shape": [rows, columns],
        "filename": filename,
        "key_columns": info.get("key_columns", []),
        "quality": {"score": info.get("quality_score", 0)},
    }

    # 重建 session
    import uuid
    session_id = str(uuid.uuid4())[:8]
    conv.init_session(table_name, filename, chen_profile)
    store.save(session_id, table_name, filename, chen_profile)

    # 恢复 orchestrator 状态
    try:
        from ...insightflow.orchestrator import get_orchestrator
        orch = get_orchestrator()
        orch.state.chen_profile = chen_profile
        orch.state.table_name = table_name
    except Exception:
        pass

    return {
        "switched": True,
        "session": {
            "session_id": session_id,
            "table_name": table_name,
            "filename": filename,
            "total_rows": rows,
            "total_columns": columns,
            "file_names": [filename],
            "table_names": [table_name],
        }
    }





# ── 辅助函数 ────────────────────────────────────────────

def _sse_headers():
    """SSE响应头"""
    return {
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    }


def _error_stream(message: str, error_type: str = "unknown"):
    """生成错误SSE流的生成器"""
    async def gen():
        yield sse("error", {"message": message, "type": error_type})
    return gen()
