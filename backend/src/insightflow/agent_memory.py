"""
Agent 自进化记忆系统 (Self-Evolving Agent Memory)
=================================================

核心概念：
- 每次分析结束后，质检官生成结构化的"经验教训"
- 经验按 Agent + 分析领域 存储，带置信度和衰减机制
- 下次分析时，经验自动注入到对应Agent的system prompt
- 越用越聪明：高频使用的经验强化，长期不用的自动淘汰

数据结构：
    Lesson = {
        "id": str,
        "agent": str,              # "老林"
        "domain": str,             # "销售分析" / "财务分析" / "通用"
        "content": str,            # 经验内容
        "confidence": float,       # 0.0~1.0
        "created_at": str,         # ISO datetime
        "last_used_at": str,       # ISO datetime
        "use_count": int,          # 被使用次数
        "source": str,             # "qa_inspect" / "qa_discuss" / "self_reflect"
    }
"""

import json
import logging
import uuid
import time
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from pathlib import Path

logger = logging.getLogger(__name__)

# ── 配置常量 ──────────────────────────────────────────────
MAX_LESSONS_PER_AGENT = 30      # 每个Agent最多保留的经验数
LESSON_DECAY_DAYS = 30          # 超过N天未使用，confidence开始衰减
LESSON_DECAY_RATE = 0.1         # 每天衰减量
LESSON_BOOST_ON_USE = 0.05      # 每次使用时的confidence增幅
LESSON_MIN_CONFIDENCE = 0.3     # 低于此值自动淘汰
LESSON_INITIAL_CONFIDENCE = 0.8 # 新经验的初始confidence
INJECT_TOP_N = 5                # 注入prompt时取top-N经验
MEMORY_FILE = Path(__file__).parent.parent / "data" / "agent_memory.json"


class Lesson:
    """单条经验教训"""

    def __init__(
        self,
        agent: str,
        content: str,
        domain: str = "通用",
        confidence: float = LESSON_INITIAL_CONFIDENCE,
        source: str = "qa_inspect",
        lesson_id: Optional[str] = None,
        created_at: Optional[str] = None,
        last_used_at: Optional[str] = None,
        use_count: int = 0,
    ):
        self.id = lesson_id or str(uuid.uuid4())[:8]
        self.agent = agent
        self.content = content
        self.domain = domain
        self.confidence = confidence
        self.source = source
        self.created_at = created_at or datetime.now().isoformat()
        self.last_used_at = last_used_at or datetime.now().isoformat()
        self.use_count = use_count

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "agent": self.agent,
            "content": self.content,
            "domain": self.domain,
            "confidence": self.confidence,
            "source": self.source,
            "created_at": self.created_at,
            "last_used_at": self.last_used_at,
            "use_count": self.use_count,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Lesson":
        return cls(**data)

    def touch(self):
        """标记使用，提升confidence"""
        self.use_count += 1
        self.last_used_at = datetime.now().isoformat()
        self.confidence = min(1.0, self.confidence + LESSON_BOOST_ON_USE)

    def decay(self):
        """根据上次使用时间衰减confidence"""
        try:
            last_used = datetime.fromisoformat(self.last_used_at)
            days_unused = (datetime.now() - last_used).days
        except (ValueError, TypeError):
            days_unused = 999

        if days_unused > LESSON_DECAY_DAYS:
            decay_amount = (days_unused - LESSON_DECAY_DAYS) * LESSON_DECAY_RATE
            self.confidence = max(0, self.confidence - decay_amount)

    @property
    def is_expired(self) -> bool:
        self.decay()
        return self.confidence < LESSON_MIN_CONFIDENCE


class AgentMemory:
    """
    Agent自进化记忆管理器
    
    负责：经验存储 → 衰减淘汰 → 智能检索 → prompt注入
    """

    def __init__(self, persist_path: Optional[Path] = None):
        self._lessons: List[Lesson] = []
        self._persist_path = persist_path or MEMORY_FILE
        self._load()

    # ═══════════════════════════════════════════════════════
    # 核心API
    # ═══════════════════════════════════════════════════════

    def add_lessons(
        self,
        agent: str,
        contents: List[str],
        domain: str = "通用",
        source: str = "qa_inspect",
    ) -> int:
        """
        批量添加经验教训。
        
        Args:
            agent: Agent名称（"老林"/"小赵"等）
            contents: 经验内容列表
            domain: 分析领域
            source: 经验来源
        
        Returns:
            新增的经验数量
        """
        added = 0
        for content in contents:
            content = content.strip()
            if not content or len(content) < 10:
                continue
            # 去重：相似内容（简单的前缀匹配）
            if self._is_duplicate(agent, content):
                logger.debug(f"[记忆] 跳过重复经验: {content[:30]}...")
                continue

            lesson = Lesson(agent=agent, content=content, domain=domain, source=source)
            self._lessons.append(lesson)
            added += 1
            logger.info(f"[记忆] {agent}习得新经验#{lesson.id}: {content[:50]}...")

        # 限制总数
        self._enforce_limit(agent)
        self._persist()
        return added

    def get_lessons_for_agent(
        self,
        agent: str,
        domain: str = "通用",
        top_n: int = INJECT_TOP_N,
    ) -> List[Lesson]:
        """
        获取某Agent的最相关经验（已排序）。
        
        排序优先级：domain匹配 > confidence > use_count
        
        Returns:
            排序后的经验列表，调用方应使用后调用 `mark_used`
        """
        now = datetime.now()
        relevant = []
        for lesson in self._lessons:
            if lesson.agent != agent:
                continue
            if lesson.is_expired:
                continue

            # 计算相关性分数
            score = lesson.confidence * 100 + lesson.use_count * 10
            if lesson.domain == domain:
                score += 50  # 同领域加分
            elif lesson.domain != "通用":
                score -= 10  # 不同领域轻微减分

            # 时间衰减修正（越新越好）
            try:
                created = datetime.fromisoformat(lesson.created_at)
                days_old = (now - created).days
                score -= days_old * 0.5
            except (ValueError, TypeError):
                pass

            relevant.append((lesson, score))

        # 按分数降序
        relevant.sort(key=lambda x: x[1], reverse=True)

        # 返回top-N，并标记使用
        result = [lesson for lesson, _ in relevant[:top_n]]
        return result

    def mark_used(self, lesson_ids: List[str]):
        """标记经验被使用（touch + 持久化）"""
        for lid in lesson_ids:
            for lesson in self._lessons:
                if lesson.id == lid:
                    lesson.touch()
                    break
        self._persist()

    def build_experience_prompt(
        self,
        agent: str,
        domain: str = "通用",
    ) -> str:
        """
        构建可注入system prompt的经验文本块。
        
        Returns:
            如果没有经验返回空字符串，否则返回格式化的经验文本
        """
        lessons = self.get_lessons_for_agent(agent, domain)
        if not lessons:
            return ""

        used_ids = [l.id for l in lessons]

        lines = [f"\n\n## 你从过往分析中积累的经验（共{len(lessons)}条）"]
        lines.append("**注意：这些是基于历史分析数据总结的经验，请灵活运用，不要生搬硬套。**\n")

        for i, lesson in enumerate(lessons, 1):
            lines.append(f"{i}. {lesson.content}")
            if lesson.domain != "通用":
                lines.append(f"   （来源领域：{lesson.domain}，置信度：{lesson.confidence:.0%}）")

        # 异步标记使用（在后台）
        self.mark_used(used_ids)

        return "\n".join(lines)

    def generate_lessons_from_qa(
        self,
        qa_result: Dict[str, Any],
        discussion_context: List[Dict[str, Any]],
        analysis_domain: str = "通用",
    ) -> Dict[str, List[str]]:
        """
        从质检结果中提取经验教训（核心自进化入口）。
        
        Args:
            qa_result: 质检结果（来自guard.py）
            discussion_context: 讨论上下文
            analysis_domain: 当前分析领域
        
        Returns:
            {agent_name: [lesson1, lesson2, ...]}
        """
        lessons_by_agent: Dict[str, List[str]] = {}

        issues = qa_result.get("issues", [])
        for issue in issues:
            agent = issue.get("agent", "")
            if not agent:
                continue

            criterion = issue.get("criterion", "")
            detail = issue.get("detail", "")
            fix = issue.get("fix", "")

            # 从质检issue中提取经验教训
            lesson_parts = []

            # 1. 问题 → 教训
            if detail:
                # 去掉"第X条"这种临时引用，变成通用经验
                generic_detail = _generalize_lesson(detail)
                if generic_detail:
                    lesson_parts.append(generic_detail)

            # 2. 修复建议 → 经验
            if fix:
                generic_fix = _generalize_lesson(fix)
                if generic_fix:
                    lesson_parts.append(f"改进方案：{generic_fix}")

            # 3. 质检标准 → 预防性经验
            if criterion and not fix:
                lesson_parts.append(f"注意：{criterion}——确保每个结论都有明确的数据来源")

            if lesson_parts and agent not in lessons_by_agent:
                lessons_by_agent[agent] = []

            # 合并为一条完整经验
            if lesson_parts:
                full_lesson = "；".join(lesson_parts)
                if len(full_lesson) > 200:
                    full_lesson = full_lesson[:200]
                if agent not in lessons_by_agent:
                    lessons_by_agent[agent] = []
                lessons_by_agent[agent].append(full_lesson)

        # 从讨论上下文中提取"讨论转向"经验（质检质疑 → Agent修正）
        turn_lessons = self._extract_turn_lessons(discussion_context)
        for agent, lesson in turn_lessons.items():
            if agent not in lessons_by_agent:
                lessons_by_agent[agent] = []
            lessons_by_agent[agent].append(lesson)

        # 写入记忆
        for agent, lessons in lessons_by_agent.items():
            self.add_lessons(agent, lessons, domain=analysis_domain, source="qa_inspect")

        return lessons_by_agent

    # ═══════════════════════════════════════════════════════
    # 对话室 discuss 模式下的经验提取
    # ═══════════════════════════════════════════════════════

    def _extract_turn_lessons(
        self,
        discussion_context: List[Dict[str, Any]]
    ) -> Dict[str, str]:
        """
        从讨论转向中提取经验教训。
        检测模式：质检官质疑 → Agent修正 → 提取修正中的经验。
        """
        lessons: Dict[str, str] = {}

        for i in range(len(discussion_context) - 1):
            msg_i = discussion_context[i]
            msg_next = discussion_context[i + 1]

            if msg_i.get("role") != "质检官":
                continue

            mentions = msg_i.get("mentions", [])
            if not mentions:
                continue

            target = mentions[0]
            if msg_next.get("role") != target:
                continue

            # 质检质疑 + Agent修正 = 经验教训
            qa_point = msg_i.get("content", "")[:100]
            fix_point = msg_next.get("content", "")[:100]

            if qa_point and fix_point:
                lesson = f"质检曾指出「{qa_point[:50]}」→ 修正为「{fix_point[:50]}」，后续分析应避免同类问题"
                if target not in lessons:
                    lessons[target] = lesson

        return lessons

    # ═══════════════════════════════════════════════════════
    # 统计 & 查询
    # ═══════════════════════════════════════════════════════

    def get_stats(self) -> Dict[str, Any]:
        """获取记忆系统统计"""
        # 清理过期经验
        self._cleanup_expired()

        agent_counts: Dict[str, int] = {}
        domain_counts: Dict[str, int] = {}
        total_confidence = 0.0

        for lesson in self._lessons:
            agent_counts[lesson.agent] = agent_counts.get(lesson.agent, 0) + 1
            domain_counts[lesson.domain] = domain_counts.get(lesson.domain, 0) + 1
            total_confidence += lesson.confidence

        avg_confidence = total_confidence / len(self._lessons) if self._lessons else 0

        return {
            "total_lessons": len(self._lessons),
            "agent_distribution": agent_counts,
            "domain_distribution": domain_counts,
            "avg_confidence": round(avg_confidence, 3),
            "total_uses": sum(l.use_count for l in self._lessons),
        }

    def get_all_lessons(self) -> List[Dict[str, Any]]:
        """获取所有经验（供前端展示）"""
        self._cleanup_expired()
        return [l.to_dict() for l in sorted(self._lessons, key=lambda x: x.confidence, reverse=True)]

    # ═══════════════════════════════════════════════════════
    # 内部方法
    # ═══════════════════════════════════════════════════════

    def _is_duplicate(self, agent: str, content: str) -> bool:
        """简单去重（前20字符 + agent匹配）"""
        prefix = content[:20].lower()
        for lesson in self._lessons:
            if lesson.agent == agent and lesson.content[:20].lower() == prefix:
                return True
        return False

    def _enforce_limit(self, agent: str):
        """淘汰低confidence的经验以保持上限"""
        agent_lessons = [l for l in self._lessons if l.agent == agent]
        if len(agent_lessons) <= MAX_LESSONS_PER_AGENT:
            return

        # 按confidence排序，淘汰最低的
        agent_lessons.sort(key=lambda l: l.confidence)
        to_remove = len(agent_lessons) - MAX_LESSONS_PER_AGENT
        for lesson in agent_lessons[:to_remove]:
            self._lessons.remove(lesson)
            logger.debug(f"[记忆] 淘汰低置信度经验: {lesson.content[:30]}...")

    def _cleanup_expired(self):
        """清理所有过期经验"""
        expired = [l for l in self._lessons if l.is_expired]
        for lesson in expired:
            self._lessons.remove(lesson)
        if expired:
            logger.info(f"[记忆] 清理了{len(expired)}条过期经验")

    # ═══════════════════════════════════════════════════════
    # 持久化（JSON文件）
    # ═══════════════════════════════════════════════════════

    def _persist(self):
        """持久化到JSON文件"""
        try:
            self._persist_path.parent.mkdir(parents=True, exist_ok=True)
            data = {
                "version": 1,
                "updated_at": datetime.now().isoformat(),
                "lessons": [l.to_dict() for l in self._lessons],
            }
            self._persist_path.write_text(
                json.dumps(data, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except Exception as e:
            logger.error(f"[记忆] 持久化失败: {e}")

    def _load(self):
        """从JSON文件加载"""
        if not self._persist_path.exists():
            return

        try:
            data = json.loads(self._persist_path.read_text(encoding="utf-8"))
            if data.get("version") == 1:
                self._lessons = [Lesson.from_dict(d) for d in data.get("lessons", [])]
                # 加载时执行一次衰减
                self._cleanup_expired()
                logger.info(f"[记忆] 加载了{len(self._lessons)}条经验")
        except Exception as e:
            logger.error(f"[记忆] 加载失败: {e}")
            self._lessons = []


# ── 辅助函数 ──────────────────────────────────────────────

def _generalize_lesson(text: str) -> Optional[str]:
    """
    将具体的质检反馈泛化为通用经验。
    
    "第3条的同比增长23%没有数据来源"
    → "引用同比增长等百分比数据时，必须标注数据来源和计算方式"
    
    "小李报告中出现了exclude列「序号」"
    → "不得在分析结论中引用被排除的列"
    """
    if not text or len(text) < 5:
        return None

    # 常见泛化规则
    rules = [
        # 数字来源
        (r"第\d+条[^\n]*没有[^\n]*来源", "引用具体数字时，必须明确标注数据来源和计算方式"),
        (r"[^\n]*没有[^\n]*来源", "每个结论中的数字必须有明确的数据来源"),
        # 排除列
        (r"[^\n]*(排除|exclude)[^\n]*(列|字段)", "不得在分析结论中引用被排除的列"),
        # 模板化表述
        (r"[^\n]*(模板|空泛|废话)[^\n]*", "避免使用模板化的空泛表述，每个结论必须包含具体对象和数据"),
        # 建议不具体
        (r"[^\n]*建议[^\n]*不够具体", "建议类洞察必须包含：具体对象 + 具体数字 + 具体行动"),
        # 逻辑矛盾
        (r"[^\n]*(矛盾|冲突|不一致)", "不同Agent的结论之间必须逻辑一致，如有差异需解释原因"),
    ]

    import re
    for pattern, generic in rules:
        if re.search(pattern, text, re.IGNORECASE):
            return generic

    # 如果没有匹配到泛化规则，返回原文（截断）
    if len(text) > 150:
        return text[:150]
    return text


# ── 单例 ──────────────────────────────────────────────────
_agent_memory: Optional[AgentMemory] = None


def get_agent_memory() -> AgentMemory:
    global _agent_memory
    if _agent_memory is None:
        _agent_memory = AgentMemory()
    return _agent_memory
