"""
InsightFlow AI 2026 - MCP & 数据上传 API 路由
支持文件上传到 DuckDB + MCP 数据源管理 + 记忆层查询
"""

import logging
from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from typing import Dict, Any, List, Optional
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()

# ── 文件上传到 DuckDB ──────────────────────────────────────────

@router.post("/upload", summary="上传数据文件到 DuckDB")
async def upload_file(
    file: UploadFile = File(...),
    table_name: Optional[str] = Query(None, description="目标表名，默认使用文件名"),
):
    """
    上传 CSV / Excel / JSON 文件到 DuckDB 进行分析

    - 文件大小限制：10MB
    - 支持格式：.csv / .xlsx / .xls / .json
    - 数据将被导入内存数据库，智能体可直接 SQL 查询
    """
    from ...core.duckdb_engine import get_duckdb_engine, FileSizeError, ConcurrencyError

    # 文件格式检查
    allowed_ext = {".csv", ".xlsx", ".xls", ".json"}
    filename = file.filename or "upload.csv"
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext not in allowed_ext:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件格式 '{ext}'，请上传 CSV / Excel / JSON 文件"
        )

    # 读取文件内容
    content = await file.read()

    try:
        engine = get_duckdb_engine()
        result = await engine.load_file(
            file_content=content,
            filename=filename,
            table_name=table_name,
        )
        return {
            "success": True,
            "message": f"文件 '{filename}' 已成功导入 DuckDB",
            "table_name": result["table_name"],
            "rows": result["rows"],
            "columns": result["columns"],
            "schema": result.get("schema", {}),
            "engine": result.get("engine", "duckdb"),
            "size_kb": result.get("size_kb", 0),
        }

    except FileSizeError as e:
        raise HTTPException(status_code=413, detail=str(e))
    except ConcurrencyError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except Exception as e:
        logger.error("❌ 文件上传失败: %s", e)
        raise HTTPException(status_code=500, detail=f"文件处理失败: {str(e)}")


@router.get("/tables", summary="列出 DuckDB 中的所有表")
async def list_tables():
    """列出已上传并加载到 DuckDB 的所有数据表"""
    from ...core.duckdb_engine import get_duckdb_engine

    engine = get_duckdb_engine()
    return {
        "tables": engine.list_tables(),
        "tables_info": engine.get_tables_info(),
        "engine": "duckdb",
    }


@router.post("/query", summary="在 DuckDB 上执行 SQL 查询")
async def sql_query(body: Dict[str, Any]):
    """
    直接在 DuckDB 上执行 SELECT SQL 查询

    示例: {"sql": "SELECT region, SUM(amount) as total FROM sales GROUP BY region"}
    """
    from ...core.duckdb_engine import get_duckdb_engine

    sql = body.get("sql", "").strip()
    if not sql:
        raise HTTPException(status_code=400, detail="SQL 不能为空")

    if not sql.upper().startswith(("SELECT", "WITH")):
        raise HTTPException(status_code=400, detail="只允许 SELECT 查询")

    try:
        engine = get_duckdb_engine()
        result = await engine.query(sql)
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "查询失败"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── MCP 协议 API ───────────────────────────────────────────────

@router.get("/mcp/servers", summary="MCP: 列出已连接的数据源")
async def mcp_list_servers():
    """
    列出所有通过 MCP 协议连接的外部数据源

    MCP (Model Context Protocol) 是 Anthropic 推出的 AI 应用标准接口
    让智能体能够连接任意外部数据库、工具和服务
    """
    from ...core.mcp_connector import get_mcp_client

    client = get_mcp_client()
    return {
        "protocol": "MCP (Model Context Protocol)",
        "version": "2024-11-05",
        "servers": client.get_servers_info(),
        "total": len(client.get_servers_info()),
    }


@router.get("/mcp/resources", summary="MCP: 列出所有可用资源")
async def mcp_list_resources():
    """列出所有 MCP Server 提供的数据资源"""
    from ...core.mcp_connector import get_mcp_client

    client = get_mcp_client()
    resources = await client.list_all_resources()
    return {
        "resources": resources,
        "count": len(resources),
    }


@router.post("/mcp/call-tool", summary="MCP: 调用数据源工具")
async def mcp_call_tool(body: Dict[str, Any]):
    """
    通过 MCP 协议调用外部数据源工具

    示例: {"server_id": "sqlite_local", "tool": "execute_query", "arguments": {"sql": "SELECT * FROM sales_demo LIMIT 10"}}
    """
    from ...core.mcp_connector import get_mcp_client

    server_id = body.get("server_id", "")
    tool_name = body.get("tool", "")
    arguments = body.get("arguments", {})

    if not server_id or not tool_name:
        raise HTTPException(status_code=400, detail="server_id 和 tool 不能为空")

    client = get_mcp_client()
    result = await client.call_tool(server_id, tool_name, arguments)

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return result


# ── 记忆层 API ─────────────────────────────────────────────────

@router.get("/memory/stats", summary="记忆层统计")
async def memory_stats():
    """获取记忆层（Memory Layer）统计信息"""
    from ...core.memory import get_memory_layer

    mem = get_memory_layer()
    return mem.get_stats()


@router.get("/memory/context", summary="获取对话上下文")
async def get_memory_context(
    session_id: str = Query("default", description="会话ID"),
    user_id: str = Query("default", description="用户ID"),
):
    """
    获取指定会话的记忆上下文

    返回最近对话历史 + 关键洞察 + 用户偏好，供 LLM 使用
    """
    from ...core.memory import get_memory_layer

    mem = get_memory_layer()
    context = mem.get_context(session_id=session_id, user_id=user_id)
    recent = mem.get_recent_conversations(session_id=session_id)
    insights = mem.get_user_insights(user_id=user_id)

    return {
        "session_id": session_id,
        "context_text": context,
        "recent_conversations": recent,
        "insights": insights,
        "has_memory": bool(context),
    }
