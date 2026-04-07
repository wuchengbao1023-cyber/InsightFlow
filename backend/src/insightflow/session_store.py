"""
InsightFlow v6.2 — Session 持久化存储
=====================================

解决的核心问题：
- 之前 DuckDB 用 :memory:，session 是 Python 对象，刷新/重启全丢
- 现在文件上传后，把元数据保存到 JSON 文件
- 服务重启后自动恢复 session，前端刷新无需重新上传

数据结构：
    session.json = {
        "version": 1,
        "updated_at": "ISO datetime",
        "session_id": "abc12345",
        "created_at": "ISO datetime",
        "table_name": "sales_data",
        "filename": "2024年销售数据.csv",
        "is_multi_file": false,
        "file_names": ["2024年销售数据.csv"],
        "table_names": ["sales_data"],
        "merge_view": null,
        "chen_profile": {...},  // 数据画像
    }
"""

import json
import logging
import os
import time
from typing import Dict, Any, List, Optional
from pathlib import Path

logger = logging.getLogger(__name__)

SESSION_FILE = Path(__file__).parent.parent / "data" / "session.json"


class SessionStore:
    """
    Session 持久化存储器。
    
    读写 backend/data/session.json，保存上传文件的元数据。
    服务重启后自动恢复 session 状态。
    """

    def __init__(self, path: Optional[Path] = None):
        self._path = path or SESSION_FILE
        self._data: Dict[str, Any] = {}
        self._load()

    def _load(self):
        """启动时加载已有的 session"""
        if not self._path.exists():
            return
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
            if raw.get("version") == 1:
                self._data = raw
                logger.info("📦 Session 已恢复: %s (文件: %s)",
                           self._data.get("session_id", "?"),
                           self._data.get("filename", "?"))
        except Exception as e:
            logger.warning("📦 Session 加载失败: %s", e)

    def save(
        self,
        session_id: str,
        table_name: str,
        filename: str,
        chen_profile: Dict[str, Any],
        table_names: List[str] = None,
        file_names: List[str] = None,
        merge_view: str = None,
    ):
        """保存/更新 session"""
        import uuid
        from datetime import datetime

        self._data = {
            "version": 1,
            "updated_at": datetime.now().isoformat(),
            "session_id": session_id or str(uuid.uuid4())[:8],
            "created_at": self._data.get("created_at") or datetime.now().isoformat(),
            "table_name": table_name,
            "filename": filename,
            "is_multi_file": bool(table_names and len(table_names) > 1),
            "file_names": file_names or [filename],
            "table_names": table_names or [table_name],
            "merge_view": merge_view,
            "chen_profile": chen_profile,
        }
        self._persist()
        logger.info("📦 Session 已保存: %s → %s", session_id, filename)

    def clear(self):
        """清除 session（用户删除文档时调用）"""
        self._data = {}
        if self._path.exists():
            self._path.unlink()
        logger.info("📦 Session 已清除")

    def get(self) -> Dict[str, Any]:
        """获取当前 session 数据"""
        return self._data

    @property
    def exists(self) -> bool:
        """是否有持久化的 session"""
        return bool(self._data.get("session_id"))

    @property
    def session_id(self) -> str:
        return self._data.get("session_id", "")

    @property
    def table_name(self) -> str:
        return self._data.get("table_name", "")

    @property
    def filename(self) -> str:
        return self._data.get("filename", "")

    @property
    def chen_profile(self) -> Dict[str, Any]:
        return self._data.get("chen_profile", {})

    @property
    def is_multi_file(self) -> bool:
        return self._data.get("is_multi_file", False)

    @property
    def file_names(self) -> List[str]:
        return self._data.get("file_names", [])

    @property
    def table_names(self) -> List[str]:
        return self._data.get("table_names", [])

    def _persist(self):
        """写入磁盘"""
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            self._path.write_text(
                json.dumps(self._data, ensure_ascii=False, indent=2, default=str),
                encoding="utf-8",
            )
        except Exception as e:
            logger.error("📦 Session 持久化失败: %s", e)


# ── 单例 ──────────────────────────────────────────────────
_store: Optional[SessionStore] = None


def get_session_store() -> SessionStore:
    global _store
    if _store is None:
        _store = SessionStore()
    return _store
