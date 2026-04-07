"""
Settings Router — /api/settings
=================================
提供 API Key 的读取、保存和连接测试能力。
.env 文件路径：backend/.env

端点：
    GET  /api/settings/config        读取当前配置（Key 打码）
    POST /api/settings/config        保存配置到 .env 文件
    POST /api/settings/test-api      测试 DeepSeek / OpenAI 连接
"""

import os
import re
import logging
import asyncio
import json
from pathlib import Path
from typing import Optional, List, Dict, Any
from datetime import datetime

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logger = logging.getLogger("datamind.settings")

router = APIRouter(prefix="/api/settings", tags=["settings"])

# .env 文件位置：backend/.env
ENV_PATH = Path(__file__).parent.parent.parent.parent / ".env"

# KPI配置文件位置：backend/.kpi_config.json
KPI_CONFIG_PATH = Path(__file__).parent.parent.parent.parent / ".kpi_config.json"

# 项目设置文件位置：backend/.project_settings.json
PROJECT_SETTINGS_PATH = Path(__file__).parent.parent.parent.parent / ".project_settings.json"


# ──────────────── 工具函数 ────────────────

def _read_env() -> dict:
    """读取 .env 文件，返回 key→value 字典（不存在则返回空字典）"""
    env = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip()
    return env


def _write_env(updates: dict) -> None:
    """
    将 updates 中的 key 写入 .env 文件：
    - 如果 key 已存在则替换值
    - 如果 key 不存在则追加
    - 空字符串值会保留（保持 KEY= 格式）
    """
    # 先读现有内容
    lines: list[str] = []
    if ENV_PATH.exists():
        lines = ENV_PATH.read_text(encoding="utf-8").splitlines()

    updated_keys = set()

    # 替换已有行
    new_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            k, _, _ = stripped.partition("=")
            k = k.strip()
            if k in updates:
                new_lines.append(f"{k}={updates[k]}")
                updated_keys.add(k)
                continue
        new_lines.append(line)

    # 追加新 key
    for k, v in updates.items():
        if k not in updated_keys:
            new_lines.append(f"{k}={v}")

    ENV_PATH.write_text("\n".join(new_lines) + "\n", encoding="utf-8")


def _mask_key(key: str) -> str:
    """把 API Key 打码，只显示前4位和最后4位"""
    if not key or len(key) < 10:
        return "" if not key else "****"
    return key[:4] + "****" + key[-4:]


# ──────────────── 数据模型 ────────────────

class ConfigPayload(BaseModel):
    deepseek_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    deepseek_model: Optional[str] = None
    request_timeout: Optional[int] = None
    max_tokens: Optional[int] = None
    max_concurrent: Optional[int] = None
    stream_enabled: Optional[bool] = None
    retry_count: Optional[int] = None


class KPIItem(BaseModel):
    """KPI项目"""
    id: str
    name: str
    description: str
    unit: str
    target_direction: str  # "up", "down", "neutral"
    baseline_value: Optional[float] = None
    target_value: Optional[float] = None


class ProjectSettings(BaseModel):
    """项目设置"""
    project_name: str
    project_description: str
    industry: str
    kpis: List[KPIItem]
    data_update_frequency: str  # "daily", "weekly", "monthly"
    report_format: str  # "executive", "detailed", "technical"
    primary_metrics: List[str]
    secondary_metrics: List[str]


class UpdateKPIsPayload(BaseModel):
    """更新KPI配置"""
    kpis: List[KPIItem]
    project_name: Optional[str] = None


class TestApiPayload(BaseModel):
    provider: str   # "deepseek" | "openai"
    api_key: Optional[str] = None   # 明文 Key；为空时自动使用 .env 中已保存的 Key
    model: Optional[str] = None


# ──────────────── 端点 ────────────────

@router.get("/config")
async def get_config():
    """
    读取当前配置（Key 已打码）。
    如果 .env 不存在，返回空配置（前端显示空输入框）。
    """
    env = _read_env()
    return {
        "deepseek_api_key_masked": _mask_key(env.get("DEEPSEEK_API_KEY", "")),
        "deepseek_api_key_set": bool(env.get("DEEPSEEK_API_KEY")),
        "openai_api_key_masked": _mask_key(env.get("OPENAI_API_KEY", "")),
        "openai_api_key_set": bool(env.get("OPENAI_API_KEY")),
        "deepseek_model": env.get("DEEPSEEK_MODEL", "deepseek-chat"),
        "request_timeout": int(env.get("REQUEST_TIMEOUT", "60")),
        "max_tokens": int(env.get("MAX_TOKENS", "4096")),
        "max_concurrent": int(env.get("MAX_CONCURRENT", "1")),
        "stream_enabled": env.get("STREAM_ENABLED", "true").lower() == "true",
        "retry_count": int(env.get("RETRY_COUNT", "3")),
        "env_file_exists": ENV_PATH.exists(),
        "env_file_path": str(ENV_PATH),
    }


@router.post("/config")
async def save_config(payload: ConfigPayload):
    """
    保存配置到 backend/.env 文件。
    - 空字符串 / None 的字段不会覆盖（保留原值）
    - Key 值如果是打码字符串（包含 ****）则跳过（用户没改）
    """
    updates = {}

    if payload.deepseek_api_key and "****" not in payload.deepseek_api_key:
        updates["DEEPSEEK_API_KEY"] = payload.deepseek_api_key.strip()

    if payload.openai_api_key and "****" not in payload.openai_api_key:
        updates["OPENAI_API_KEY"] = payload.openai_api_key.strip()

    if payload.deepseek_model:
        updates["DEEPSEEK_MODEL"] = payload.deepseek_model

    if payload.request_timeout is not None:
        updates["REQUEST_TIMEOUT"] = str(payload.request_timeout)

    if payload.max_tokens is not None:
        updates["MAX_TOKENS"] = str(payload.max_tokens)

    if payload.max_concurrent is not None:
        updates["MAX_CONCURRENT"] = str(payload.max_concurrent)

    if payload.stream_enabled is not None:
        updates["STREAM_ENABLED"] = "true" if payload.stream_enabled else "false"

    if payload.retry_count is not None:
        updates["RETRY_COUNT"] = str(payload.retry_count)

    if not updates:
        return {"success": True, "message": "没有需要更新的配置项", "updated_keys": []}

    try:
        _write_env(updates)
        # 同步更新当前进程的环境变量（热重载，无需重启后端）
        for k, v in updates.items():
            os.environ[k] = v
        logger.info("✅ 配置已保存: %s", list(updates.keys()))
        return {
            "success": True,
            "message": f"已保存 {len(updates)} 个配置项，立即生效（无需重启）",
            "updated_keys": list(updates.keys()),
            "env_file_path": str(ENV_PATH),
        }
    except Exception as e:
        logger.error("❌ 保存配置失败: %s", e)
        raise HTTPException(status_code=500, detail=f"保存失败: {str(e)}")


@router.post("/test-api")
async def test_api_connection(payload: TestApiPayload):
    """
    用提供的 API Key 测试连接（不保存 Key）。
    支持 DeepSeek 和 OpenAI。
    """
    # 如果前端没传 key，尝试从 .env 中读取已保存的 key
    if not payload.api_key:
        env = _read_env()
        if payload.provider == "deepseek":
            payload.api_key = env.get("DEEPSEEK_API_KEY", "")
        elif payload.provider == "openai":
            payload.api_key = env.get("OPENAI_API_KEY", "")

    if not payload.api_key or len(payload.api_key) < 10:
        raise HTTPException(status_code=400, detail="API Key 未提供且 .env 中未找到已保存的 Key")

    if payload.provider == "deepseek":
        url = "https://api.deepseek.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {payload.api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": payload.model or "deepseek-chat",
            "messages": [{"role": "user", "content": "hi"}],
            "max_tokens": 5,
        }
    elif payload.provider == "openai":
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {payload.api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": payload.model or "gpt-3.5-turbo",
            "messages": [{"role": "user", "content": "hi"}],
            "max_tokens": 5,
        }
    else:
        raise HTTPException(status_code=400, detail=f"不支持的 provider: {payload.provider}")

    try:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=body, headers=headers, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                if resp.status == 200:
                    return {"success": True, "message": f"{payload.provider.upper()} API 连接成功 ✓", "status_code": 200}
                elif resp.status == 401:
                    return {"success": False, "message": "API Key 无效或已过期（401 Unauthorized）", "status_code": 401}
                elif resp.status == 429:
                    # 429 说明 Key 有效但超频，也算成功
                    return {"success": True, "message": f"API Key 有效（{payload.provider} 请求频率限制，但连接正常）", "status_code": 429}
                else:
                    text = await resp.text()
                    return {"success": False, "message": f"API 返回错误 {resp.status}: {text[:200]}", "status_code": resp.status}
    except asyncio.TimeoutError:
        return {"success": False, "message": "连接超时（15s），请检查网络或 API 地址"}
    except Exception as e:
        return {"success": False, "message": f"连接失败: {str(e)}"}


# ──────────────── KPI 配置相关函数 ────────────────

def _read_kpi_config() -> Dict[str, Any]:
    """读取KPI配置文件"""
    if KPI_CONFIG_PATH.exists():
        try:
            content = KPI_CONFIG_PATH.read_text(encoding="utf-8")
            return json.loads(content)
        except Exception as e:
            logger.error(f"读取KPI配置文件失败: {e}")
    return {"kpis": [], "last_updated": None}


def _save_kpi_config(config: Dict[str, Any]) -> None:
    """保存KPI配置"""
    config["last_updated"] = datetime.now().isoformat()
    KPI_CONFIG_PATH.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")


def _read_project_settings() -> Dict[str, Any]:
    """读取项目设置"""
    if PROJECT_SETTINGS_PATH.exists():
        try:
            content = PROJECT_SETTINGS_PATH.read_text(encoding="utf-8")
            return json.loads(content)
        except Exception as e:
            logger.error(f"读取项目设置文件失败: {e}")
    return {
        "project_name": "未命名项目",
        "project_description": "未设置项目描述",
        "industry": "通用",
        "data_update_frequency": "daily",
        "report_format": "executive",
        "primary_metrics": ["revenue", "profit"],
        "secondary_metrics": ["conversion_rate", "retention_rate"],
        "last_updated": None
    }


def _save_project_settings(settings: Dict[str, Any]) -> None:
    """保存项目设置"""
    settings["last_updated"] = datetime.now().isoformat()
    PROJECT_SETTINGS_PATH.write_text(json.dumps(settings, ensure_ascii=False, indent=2), encoding="utf-8")


# ──────────────── KPI和项目设置端点 ────────────────

@router.get("/kpis")
async def get_kpis():
    """获取当前KPI配置"""
    config = _read_kpi_config()
    project_settings = _read_project_settings()
    return {
        "kpis": config.get("kpis", []),
        "project_settings": project_settings,
        "last_updated": config.get("last_updated"),
        "config_file_exists": KPI_CONFIG_PATH.exists()
    }


@router.post("/kpis")
async def update_kpis(payload: UpdateKPIsPayload):
    """更新KPI配置"""
    try:
        config = _read_kpi_config()
        config["kpis"] = [kpi.dict() for kpi in payload.kpis]
        
        if payload.project_name:
            project_settings = _read_project_settings()
            project_settings["project_name"] = payload.project_name
            _save_project_settings(project_settings)
        
        _save_kpi_config(config)
        
        logger.info(f"✅ KPI配置已保存: {len(payload.kpis)} 个KPI项目")
        
        return {
            "success": True,
            "message": f"已保存 {len(payload.kpis)} 个KPI项目",
            "updated_at": config["last_updated"],
            "kpis_count": len(payload.kpis)
        }
        
    except Exception as e:
        logger.error(f"❌ 保存KPI配置失败: {e}")
        raise HTTPException(status_code=500, detail=f"保存KPI配置失败: {str(e)}")


@router.post("/project-settings")
async def save_project_settings(payload: ProjectSettings):
    """保存项目设置"""
    try:
        settings_dict = payload.dict()
        _save_project_settings(settings_dict)
        
        logger.info(f"✅ 项目设置已保存: {payload.project_name}")
        
        return {
            "success": True,
            "message": f"项目 '{payload.project_name}' 设置已保存",
            "updated_at": settings_dict["last_updated"],
            "project_name": payload.project_name
        }
        
    except Exception as e:
        logger.error(f"❌ 保存项目设置失败: {e}")
        raise HTTPException(status_code=500, detail=f"保存项目设置失败: {str(e)}")


@router.get("/analytics/available-metrics")
async def get_available_metrics():
    """获取可用的分析指标"""
    from ...core.duckdb_engine import get_duckdb_engine
    
    try:
        engine = get_duckdb_engine()
        tables = engine.list_tables()
        
        metrics = []
        for table_name in tables:
            info = engine.get_table_summary(table_name)
            schema = info.get("schema", {})
            
            # 从表结构推断可能的指标
            numeric_columns = [col for col, dtype in schema.items() 
                              if "int" in dtype.lower() or "float" in dtype.lower() or "double" in dtype.lower()]
            
            for col in numeric_columns:
                metrics.append({
                    "name": f"{table_name}.{col}",
                    "display_name": f"{table_name} - {col}",
                    "table": table_name,
                    "column": col,
                    "data_type": schema.get(col, "unknown"),
                    "source": "uploaded_file"
                })
        
        # 添加基础业务指标
        base_metrics = [
            {"name": "revenue", "display_name": "收入", "source": "standard"},
            {"name": "profit", "display_name": "利润", "source": "standard"},
            {"name": "conversion_rate", "display_name": "转化率", "source": "standard"},
            {"name": "customer_count", "display_name": "客户数", "source": "standard"},
            {"name": "retention_rate", "display_name": "留存率", "source": "standard"},
            {"name": "nps", "display_name": "净推荐值", "source": "standard"},
        ]
        
        return {
            "metrics": base_metrics + metrics,
            "tables": tables,
            "has_uploaded_data": len(tables) > 0
        }
        
    except Exception as e:
        logger.warning(f"获取可用指标失败: {e}")
        return {
            "metrics": [],
            "tables": [],
            "has_uploaded_data": False
        }
