"""
InsightFlow AI 2026 - 轻量记忆层 (Memory Layer)
================================================

基于 SQLite 的多轮对话上下文记忆系统
- 零外部依赖，SQLite 内置于 Python 标准库
- 无需向量数据库，资源消耗几乎为零
- 支持用户偏好、分析历史、关键洞察的长期存储

Author: InsightFlow AI Team
"""

import sqlite3
import json
import logging
import time
import hashlib
from typing import Dict, Any, List, Optional
from pathlib import Path
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# 数据库路径：存放在 backend/ 目录下
DB_PATH = Path(__file__).parent.parent.parent / "data" / "memory.db"
MAX_MEMORY_ENTRIES = 500        # 每个用户最多保留的记忆条数
MEMORY_EXPIRE_DAYS = 30         # 记忆过期时间（天）
SHORT_TERM_WINDOW = 10          # 短期上下文：最近 N 条对话


class MemoryLayer:
    """
    SQLite 记忆层

    存储三类记忆：
    1. 对话历史 (conversation)  - 每轮问答记录
    2. 关键洞察 (insight)       - 智能体分析出的重要结论
    3. 用户偏好 (preference)    - 用户的操作习惯和偏好

    使用示例:
        mem = MemoryLayer()
        mem.save_conversation("user123", "销售趋势如何？", "华东区呈上升趋势...")
        context = mem.get_context("user123")
    """

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()
        logger.info("🧠 记忆层已启动 (SQLite: %s)", self.db_path)

    # ─────────────────────────────────────────────────────────
    # 初始化
    # ─────────────────────────────────────────────────────────

    def _init_db(self):
        """创建数据库表"""
        with self._conn() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS conversations (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id  TEXT NOT NULL,
                    user_id     TEXT DEFAULT 'default',
                    question    TEXT NOT NULL,
                    answer      TEXT NOT NULL,
                    context_data TEXT DEFAULT '{}',
                    created_at  REAL NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_conv_session
                    ON conversations(session_id, created_at DESC);

                CREATE INDEX IF NOT EXISTS idx_conv_user
                    ON conversations(user_id, created_at DESC);

                CREATE TABLE IF NOT EXISTS insights (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id     TEXT DEFAULT 'default',
                    session_id  TEXT,
                    insight_key TEXT NOT NULL,
                    content     TEXT NOT NULL,
                    confidence  REAL DEFAULT 0.5,
                    source_agent TEXT DEFAULT '',
                    created_at  REAL NOT NULL,
                    expires_at  REAL
                );

                CREATE INDEX IF NOT EXISTS idx_insight_user
                    ON insights(user_id, created_at DESC);

                CREATE TABLE IF NOT EXISTS preferences (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id     TEXT NOT NULL,
                    pref_key    TEXT NOT NULL,
                    pref_value  TEXT NOT NULL,
                    updated_at  REAL NOT NULL,
                    UNIQUE(user_id, pref_key)
                );
            """)

    def _conn(self) -> sqlite3.Connection:
        """获取数据库连接（每次调用独立连接，线程安全）"""
        return sqlite3.connect(str(self.db_path), check_same_thread=False)

    # ─────────────────────────────────────────────────────────
    # 对话记忆
    # ─────────────────────────────────────────────────────────

    def save_conversation(
        self,
        question: str,
        answer: str,
        session_id: str = "default",
        user_id: str = "default",
        context_data: Optional[Dict[str, Any]] = None,
    ):
        """保存一轮对话"""
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO conversations
                   (session_id, user_id, question, answer, context_data, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    session_id,
                    user_id,
                    question[:2000],   # 截断，防止存储超大文本
                    answer[:5000],
                    json.dumps(context_data or {}, ensure_ascii=False),
                    time.time(),
                ),
            )
        # 异步清理旧记录
        self._cleanup_old_conversations(user_id)

    def get_recent_conversations(
        self,
        session_id: str = "default",
        limit: int = SHORT_TERM_WINDOW,
    ) -> List[Dict[str, Any]]:
        """获取最近的对话记录（短期上下文）"""
        with self._conn() as conn:
            rows = conn.execute(
                """SELECT question, answer, context_data, created_at
                   FROM conversations
                   WHERE session_id = ?
                   ORDER BY created_at DESC
                   LIMIT ?""",
                (session_id, limit),
            ).fetchall()

        conversations = []
        for q, a, ctx_str, ts in reversed(rows):  # 时间正序
            try:
                ctx = json.loads(ctx_str) if ctx_str else {}
            except Exception:
                ctx = {}
            conversations.append({
                "question": q,
                "answer": a,
                "context": ctx,
                "time": datetime.fromtimestamp(ts).strftime("%H:%M"),
            })
        return conversations

    def get_context(
        self,
        session_id: str = "default",
        user_id: str = "default",
    ) -> str:
        """
        为 LLM 生成上下文字符串

        返回格式化的历史对话文本，注入到 LLM 的 system prompt
        """
        conversations = self.get_recent_conversations(session_id)
        insights = self.get_user_insights(user_id, limit=5)
        preferences = self.get_user_preferences(user_id)

        parts = []

        if conversations:
            parts.append("【最近对话记录】")
            for i, conv in enumerate(conversations[-5:], 1):  # 最近5条
                parts.append(
                    f"Q{i}: {conv['question'][:100]}\n"
                    f"A{i}: {conv['answer'][:200]}"
                )

        if insights:
            parts.append("\n【已知关键洞察】")
            for ins in insights:
                parts.append(f"- {ins['content'][:150]} (置信度: {ins['confidence']:.0%})")

        if preferences:
            prefs_str = "、".join(
                f"{k}={v}" for k, v in list(preferences.items())[:5]
            )
            parts.append(f"\n【用户偏好】{prefs_str}")

        return "\n".join(parts) if parts else ""

    # ─────────────────────────────────────────────────────────
    # 洞察记忆
    # ─────────────────────────────────────────────────────────

    def save_insight(
        self,
        content: str,
        insight_key: str = "",
        confidence: float = 0.5,
        source_agent: str = "",
        user_id: str = "default",
        session_id: str = "default",
        expire_days: Optional[int] = MEMORY_EXPIRE_DAYS,
    ):
        """保存智能体发现的关键洞察"""
        if not insight_key:
            insight_key = hashlib.md5(content[:100].encode()).hexdigest()[:8]

        expires_at = time.time() + expire_days * 86400 if expire_days else None

        with self._conn() as conn:
            # 相同 key 更新，否则插入
            conn.execute(
                """INSERT INTO insights
                   (user_id, session_id, insight_key, content, confidence,
                    source_agent, created_at, expires_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT DO NOTHING""",
                (
                    user_id,
                    session_id,
                    insight_key,
                    content[:1000],
                    min(max(confidence, 0.0), 1.0),
                    source_agent,
                    time.time(),
                    expires_at,
                ),
            )

    def get_user_insights(
        self,
        user_id: str = "default",
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """获取用户的关键洞察（过滤过期记录）"""
        now = time.time()
        with self._conn() as conn:
            rows = conn.execute(
                """SELECT insight_key, content, confidence, source_agent, created_at
                   FROM insights
                   WHERE user_id = ?
                     AND (expires_at IS NULL OR expires_at > ?)
                   ORDER BY confidence DESC, created_at DESC
                   LIMIT ?""",
                (user_id, now, limit),
            ).fetchall()

        return [
            {
                "key": r[0],
                "content": r[1],
                "confidence": r[2],
                "agent": r[3],
                "time": datetime.fromtimestamp(r[4]).strftime("%Y-%m-%d"),
            }
            for r in rows
        ]

    # ─────────────────────────────────────────────────────────
    # 偏好记忆
    # ─────────────────────────────────────────────────────────

    def set_preference(self, user_id: str, key: str, value: str):
        """设置用户偏好"""
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO preferences (user_id, pref_key, pref_value, updated_at)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(user_id, pref_key) DO UPDATE SET
                   pref_value=excluded.pref_value,
                   updated_at=excluded.updated_at""",
                (user_id, key, str(value), time.time()),
            )

    def get_user_preferences(self, user_id: str = "default") -> Dict[str, str]:
        """获取用户所有偏好"""
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT pref_key, pref_value FROM preferences WHERE user_id = ?",
                (user_id,),
            ).fetchall()
        return {r[0]: r[1] for r in rows}

    # ─────────────────────────────────────────────────────────
    # 统计 & 清理
    # ─────────────────────────────────────────────────────────

    def get_stats(self) -> Dict[str, Any]:
        """获取记忆系统统计"""
        with self._conn() as conn:
            conv_count = conn.execute("SELECT COUNT(*) FROM conversations").fetchone()[0]
            insight_count = conn.execute("SELECT COUNT(*) FROM insights").fetchone()[0]
            pref_count = conn.execute("SELECT COUNT(*) FROM preferences").fetchone()[0]
            db_size = self.db_path.stat().st_size if self.db_path.exists() else 0

        return {
            "conversations": conv_count,
            "insights": insight_count,
            "preferences": pref_count,
            "db_size_kb": round(db_size / 1024, 1),
            "db_path": str(self.db_path),
        }

    def _cleanup_old_conversations(self, user_id: str):
        """清理超出上限的旧记录"""
        with self._conn() as conn:
            # 删除超出上限的旧对话
            conn.execute(
                """DELETE FROM conversations
                   WHERE user_id = ?
                     AND id NOT IN (
                         SELECT id FROM conversations
                         WHERE user_id = ?
                         ORDER BY created_at DESC
                         LIMIT ?
                     )""",
                (user_id, user_id, MAX_MEMORY_ENTRIES),
            )
            # 删除过期洞察
            conn.execute(
                "DELETE FROM insights WHERE expires_at IS NOT NULL AND expires_at < ?",
                (time.time(),),
            )

    def clear_session(self, session_id: str):
        """清除指定会话的记忆"""
        with self._conn() as conn:
            conn.execute(
                "DELETE FROM conversations WHERE session_id = ?",
                (session_id,),
            )


# ── 全局单例 ──────────────────────────────────────────────────
_memory_layer: Optional[MemoryLayer] = None


def get_memory_layer() -> MemoryLayer:
    """获取全局记忆层单例"""
    global _memory_layer
    if _memory_layer is None:
        _memory_layer = MemoryLayer()
    return _memory_layer
