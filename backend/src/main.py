#!/usr/bin/env python3
"""
InsightFlow AI 2026 - 企业级智能BI平台
=============================================

多Agent协同编排分析引擎 · 自然语言查询 · SSE流式 · 自动报告

启动方式:
    python -m src.main          # 开发模式
    uvicorn src.main:app --host 0.0.0.0 --port 8001  # 生产模式

API文档:
    http://localhost:8001/docs     # Swagger UI
    http://localhost:8001/redoc    # ReDoc
"""

import sys
import logging
import asyncio
import time
import uuid
from pathlib import Path
from typing import Optional

# 确保src目录在Python路径中
sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

from .core.duckdb_engine import get_duckdb_engine
from .api.routers import data as data_router
from .api.routers import settings as settings_router
from .api.routers import insightflow as insightflow_router

# ==================== 日志配置 ====================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("insightflow")

# ==================== 应用配置 ====================
app = FastAPI(
    title="InsightFlow AI 2026",
    description="""
    ## 🧠 InsightFlow AI - 企业级智能BI平台

    多Agent协同编排分析，支持自然语言查询、SSE流式输出、自动报告生成。

    ### 核心能力
    - 🎯 **自然语言查询**：用中文直接问数据问题
    - 🤖 **六智能体协作**：老陈(数据) · 老林(分析) · 老王(预测) · 小赵(策略) · 质检官(质控) · 小李(报告)
    - 🔀 **DAG任务编排**：Supervisor分解 → TaskPool调度 → 并行执行 → Debate审查
    - 📝 **麦肯锡式报告**：执行摘要 + 核心发现 + 分析论证 + 风险提示 + 策略建议
    - 🔮 **趋势预测**：线性回归 + 置信区间
    - 🛡️ **辩论质控**：对抗性审查 + 自动修正
    """,
    version="3.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# ==================== 安全阀中间件 ====================
GLOBAL_TIMEOUT_SECONDS = 90

@app.middleware("http")
async def timeout_middleware(request: Request, call_next):
    """全局请求超时中间件：超过 90 秒自动返回 504
    
    SSE 流式端点不走超时限制（分析可能需要 2-3 分钟）
    """
    sse_paths = (
        "/api/insightflow/ask",
        "/api/insightflow/ask/stream",
        "/api/insightflow/upload",
        "/api/insightflow/upload/multi",
    )
    if request.url.path.startswith("/api/insightflow") and request.url.path != "/api/insightflow/status":
        return await call_next(request)
    
    try:
        return await asyncio.wait_for(call_next(request), timeout=GLOBAL_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        logger.warning("Request timeout (>%ds): %s %s", GLOBAL_TIMEOUT_SECONDS,
                       request.method, request.url.path)
        return JSONResponse(
            status_code=504,
            content={
                "error": "请求超时",
                "message": f"处理时间超过 {GLOBAL_TIMEOUT_SECONDS} 秒",
                "code": "TIMEOUT"
            },
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
                "Access-Control-Allow-Headers": "*",
            }
        )

MAX_BODY_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB

@app.middleware("http")
async def body_size_limit_middleware(request: Request, call_next):
    """请求体大小限制中间件"""
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_BODY_SIZE_BYTES:
        logger.warning("Request body too large: %s bytes (limit %s bytes)",
                       content_length, MAX_BODY_SIZE_BYTES)
        return JSONResponse(
            status_code=413,
            content={
                "error": "请求体过大",
                "message": f"文件大小不能超过 {MAX_BODY_SIZE_BYTES // (1024*1024)} MB",
                "code": "PAYLOAD_TOO_LARGE"
            },
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
                "Access-Control-Allow-Headers": "*",
            }
        )
    return await call_next(request)


# ==================== 启动 ====================

@app.on_event("startup")
async def startup_event():
    """应用启动时初始化"""
    logger.info("=" * 60)
    logger.info("  InsightFlow AI 2026 (Demo)")
    logger.info("  Tech: FastAPI + DuckDB + DeepSeek LLM + SSE")
    logger.info("=" * 60)

    # 初始化 DuckDB 引擎
    duckdb_engine = get_duckdb_engine()
    logger.info("DuckDB OLAP Engine ready")

    # ── Demo 模式：自动加载预置演示数据 ──
    demo_csv_path = Path(__file__).parent.parent / "data" / "China_Tech_HK.csv"
    demo_table_name = "china_tech_hk"
    demo_filename = "China_Tech_HK.csv"
    
    if demo_csv_path.exists():
        try:
            from .insightflow.session_store import get_session_store
            store = get_session_store()
            
            # 只在 session 不存在时初始化
            if not store.exists or store.table_name != demo_table_name:
                duckdb_engine = get_duckdb_engine()
                existing_tables = duckdb_engine.list_tables()
                
                if demo_table_name not in existing_tables:
                    content = demo_csv_path.read_bytes()
                    result = await duckdb_engine.load_file(content, demo_filename)
                    if result.get("success"):
                        logger.info("Demo data loaded: %s (%d rows x %d cols)",
                                    result["table_name"], result["rows"], result["columns"])
                        
                        # 老陈扫描数据画像
                        from .insightflow.orchestrator import get_orchestrator
                        orch = get_orchestrator()
                        async for _ in orch.scan_data(result["table_name"]):
                            pass
                        
                        chen_profile = orch.state.chen_profile or {}
                    else:
                        logger.warning("Demo data load failed: %s", result.get("error"))
                        chen_profile = {}
                        result = {"table_name": demo_table_name}
                else:
                    logger.info("Demo table already exists in DuckDB")
                    # 表已存在，需要获取 chen_profile
                    from .insightflow.orchestrator import get_orchestrator
                    orch = get_orchestrator()
                    chen_profile = orch.state.chen_profile or {}
                    result = {"table_name": demo_table_name}
                
                # 写入 session 持久化
                import uuid
                session_id = str(uuid.uuid4())[:8]
                store.save(
                    session_id,
                    result["table_name"],
                    demo_filename,
                    chen_profile,
                )
                logger.info("Demo session saved: %s", session_id)
            else:
                logger.info("Demo session already active: %s", store.session_id)
        except Exception as e:
            logger.warning("Demo data init failed (non-fatal): %s", e)
    else:
        logger.info("No demo CSV found at %s, skipping", demo_csv_path)

    # v6.2: Session 恢复由前端通过 /api/insightflow/session/restore 触发
    # 后端 startup 只负责加载 DuckDB 数据表 + 写 session.json

    # 初始化记忆层
    try:
        from .core.memory import get_memory_layer
        memory = get_memory_layer()
        stats = memory.get_stats()
        logger.info("Memory Layer ready (%d conversations)", stats["conversations"])
    except Exception as e:
        logger.warning("Memory Layer init failed (non-fatal): %s", e)

    logger.info("API Docs: http://localhost:8001/docs")
    logger.info("=" * 60)


@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭时清理"""
    logger.info("InsightFlow AI shut down safely")


# ==================== 注册路由 ====================
app.include_router(data_router.router, prefix="/api/data", tags=["DuckDB Data"])
app.include_router(settings_router.router, tags=["Settings"])  # prefix 已在 router 内定义
app.include_router(insightflow_router.router, prefix="/api/insightflow", tags=["InsightFlow AI"])


# ==================== 系统端点 ====================
@app.get("/", tags=["System"])
async def root():
    """平台信息"""
    return {
        "name": "InsightFlow AI 2026",
        "version": "3.0.0",
        "description": "Multi-Agent BI Analysis Platform",
        "docs": "/docs",
        "health": "/api/health"
    }


@app.get("/api/health", tags=["System"])
async def health_check():
    """健康检查"""
    return {
        "status": "healthy",
        "timestamp": time.time(),
        "duckdb_enabled": True,
    }


@app.get("/api/info", tags=["System"])
async def system_info():
    """系统信息"""
    return {
        "platform": "InsightFlow AI 2026",
        "version": "3.0.0",
        "agents": {
            "data_engineer": {"name": "老陈", "role": "数据画像 + 列识别 + 统计摘要"},
            "data_analyst": {"name": "老林", "role": "6规则自动分析 + SQL补充"},
            "forecaster": {"name": "老王", "role": "线性回归预测 + 置信区间"},
            "strategist": {"name": "小赵", "role": "LLM洞察生成 + 共识确认"},
            "quality_guard": {"name": "质检官", "role": "LLM-as-Judge质控 + 辩论审查"},
            "report_editor": {"name": "小李", "role": "麦肯锡式专业报告组装"},
        },
        "features": [
            "natural_language_query",
            "multi_agent_orchestration",
            "dag_task_pool",
            "debate_framework",
            "sse_streaming",
            "professional_report",
            "session_persistence",
        ],
        "tech_stack": {
            "backend": "Python 3.7+ / FastAPI / Uvicorn",
            "frontend": "React 18 / TypeScript / Vite / Ant Design",
            "ai": "DeepSeek API (OpenAI compatible)",
            "data": "DuckDB (OLAP In-Memory)",
            "protocol": "SSE (Server-Sent Events)",
        },
    }


# ==================== Demo 登录 ====================
# Demo credentials - change in production!
DEMO_ACCOUNT = {"username": "demo", "password": "demo"}


@app.post("/api/auth/login", tags=["Auth"])
async def login(request: Request):
    """简单登录验证"""
    try:
        body = await request.json()
    except Exception:
        body = {}
    username = (body.get("username") or "").strip()
    password = (body.get("password") or "").strip()
    
    if username == DEMO_ACCOUNT["username"] and password == DEMO_ACCOUNT["password"]:
        return {
            "success": True,
            "token": f"demo-token-{uuid.uuid4().hex[:12]}",
            "user": {"name": "Demo User", "role": "demo"},
        }
    return JSONResponse(
        status_code=401,
        content={"success": False, "message": "账号或密码错误"},
        headers={"Access-Control-Allow-Origin": "*"},
    )


@app.get("/api/auth/check", tags=["Auth"])
async def auth_check():
    """前端检查是否需要登录（demo模式下始终返回需要）"""
    return {"need_login": True}


@app.get("/api/demo/data-info", tags=["Demo"])
async def demo_data_info():
    """获取演示数据的表信息（供前端生成提问建议）"""
    try:
        duck = get_duckdb_engine()
        tables = duck.list_tables()
        # 找演示表
        demo_table = None
        for t in tables:
            if not t.startswith("_") and not t.startswith("__temp_"):
                info = duck.get_table_summary(t)
                if info and "schema" in info:
                    demo_table = {
                        "table_name": t,
                        "filename": info.get("filename", t),
                        "rows": info.get("rows", 0),
                        "columns": info.get("columns", 0),
                        "schema": info.get("schema", {}),
                    }
                    break
        
        if demo_table:
            return {"success": True, "data": demo_table}
        return {"success": False, "message": "暂无可用数据"}
    except Exception as e:
        return {"success": False, "message": str(e)}


# ==================== 启动入口 ====================
if __name__ == "__main__":
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
        log_level="info"
    )
