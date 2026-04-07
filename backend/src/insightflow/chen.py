"""
老陈 - 数据工程师 (DataEngineer)
===================================

职责：收到文件，搞清楚每列是什么意思，算基础统计。
特点：全程不调LLM（领域判断除外，只一次），纯代码逻辑，数据可溯源。

输入：table_name (已经被DuckDB加载的表)
输出：DataProfile JSON

列识别三步走：
第一步：类型判断（numeric/time/category/id/text）
  - 数值列：>60%可转float，且不是连续行号
  - 时间列：数值且范围1800-2100，uniqueCnt<=200
  - 分类列：uniqueCnt < 总行数5% 且 uniqueCnt <= 200
  - ID列：uniqueCnt > 总行数90%，或连续整数序列
  - 文本列：其余

第二步：语义识别（根据列名关键词，无需LLM）
  - exclude：序号/编号/代码/id/index/no/行号/姓名/名字/name
  - metric：成绩/分数/率/score/rate/amount/value/price/数量/金额
  - dimension：部门/单位/地区/区域/country/region/职位/岗位/专业/性别/category
  - time：年/月/日/日期/year/date/time

第三步：输出每列增加 role/action/is_primary/exclude_reason

汇总值检测：ALL/both/总计/合计/Total → aggregate_value字段
异常值检测：IQR方法 → outlier_count字段
"""

import logging
import math
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime

logger = logging.getLogger(__name__)

from ..core.duckdb_engine import sanitize_identifier as safe_id

# 汇总值关键词（全小写匹配）
AGGREGATE_KEYWORDS = {"all", "both", "total", "subtotal", "grand total",
                      "总计", "合计", "汇总", "小计", "合并", "整体"}

# ── 语义识别关键词表 ──────────────────────────────────────────────────────────
# 命中这些关键词 → 直接排除，不参与分析
SEMANTIC_EXCLUDE_KEYWORDS = [
    "序号", "编号", "代码", "行号", "no.", "no_",
    "id", "index", "idx", "rownum", "row_num", "row_id",
    "姓名", "名字", "name", "fullname", "full_name", "username", "user_name",
]

# 命中这些关键词 → 指标列（核心分析对象）
# 注意：使用完整词匹配，避免 "country" 被 "count" 污染
SEMANTIC_METRIC_KEYWORDS = [
    "成绩", "分数", "得分",
    "率", "比率", "比例", "占比",
    "金额", "收入", "费用", "价格", "工资", "薪资",
    "数量", "数目", "件数", "人数", "次数",
    "销售", "营收", "利润",
    "score", "rate", "ratio", "amount", "value", "price",
    "salary", "revenue", "profit",
    "growth", "increase", "decrease",
    # 以 _count / _total / _num 结尾的英文列名
    "_count", "_total", "_num", "_qty", "_amount", "_value",
]

# 分指标词精确匹配（避免子串污染，如 count 不能命中 country）
SEMANTIC_METRIC_EXACT = {"count", "total", "sum", "avg", "mean"}

# 命中这些关键词 → 维度列（分组分析的 key）
SEMANTIC_DIMENSION_KEYWORDS = [
    "部门", "单位", "机构", "院校", "学校",
    "地区", "区域", "省", "市", "县", "区", "镇", "乡",
    "职位", "岗位", "职务", "职称", "专业", "学科",
    "性别", "民族", "学历", "年级", "班级",
    "类型", "分类", "类别", "种类",
    "等级", "级别", "排名",
    "country", "region", "department", "category",
    "province", "city", "district", "position",
    "major", "profession", "gender", "sex", "grade",
    "type", "class", "level", "rank", "group",
    "age",   # age_group/age_class 等
    "招录",
]

# 命中这些关键词 → 时间列
SEMANTIC_TIME_KEYWORDS = [
    "年份", "年度", "年",
    "月份", "月",
    "日期", "日", "时间",
    "year", "date", "time", "month", "quarter", "week",
]


def _semantic_role(col_name: str) -> Optional[str]:
    """
    根据列名关键词推断语义角色。
    返回值: "exclude" | "metric" | "dimension" | "time" | None（无法推断）
    匹配规则：小写包含匹配，任意关键词命中即返回。
    """
    col_lower = col_name.lower().strip()
    # 去掉常见分隔符，用于整词匹配
    col_words = col_lower.replace("_", " ").replace("-", " ").split()

    # ── 排除优先级最高 ──────────────────────────────────────────
    for kw in SEMANTIC_EXCLUDE_KEYWORDS:
        kw_lower = kw.lower()
        # 精确词匹配（整列名是该词，或分隔后的某个词）
        if col_lower == kw_lower or kw_lower in col_words:
            return "exclude"
        # 对中文关键词做包含匹配
        if len(kw_lower) > 2 and not kw_lower.isascii() and kw_lower in col_lower:
            return "exclude"
        # 对英文短词（2字符以内）只做精确词匹配，避免子串误伤
        if kw_lower.isascii() and len(kw_lower) > 2 and kw_lower in col_lower:
            return "exclude"

    # ── 时间（优先于其他，避免"年份"被"份"误匹配成维度）──────────
    for kw in SEMANTIC_TIME_KEYWORDS:
        kw_lower = kw.lower()
        if kw_lower in col_lower:
            return "time"

    # ── 维度（在指标之前匹配，避免 country 被 count 污染）────────
    for kw in SEMANTIC_DIMENSION_KEYWORDS:
        kw_lower = kw.lower()
        # 英文：整词或开头/结尾匹配
        if kw_lower.isascii():
            if kw_lower in col_words or col_lower.startswith(kw_lower) or col_lower.endswith(kw_lower):
                return "dimension"
        else:
            # 中文：包含匹配
            if kw_lower in col_lower:
                return "dimension"

    # ── 指标 ────────────────────────────────────────────────────
    # 精确词匹配（避免 country 被 count 误匹配）
    if col_lower in SEMANTIC_METRIC_EXACT or any(w in SEMANTIC_METRIC_EXACT for w in col_words):
        return "metric"

    # 中文指标词包含匹配
    for kw in SEMANTIC_METRIC_KEYWORDS:
        kw_lower = kw.lower()
        if kw_lower.isascii():
            # 英文：以该词结尾（_count/_amount 等后缀），或整词
            if kw_lower in col_words or col_lower.endswith(kw_lower):
                return "metric"
        else:
            # 中文：包含匹配
            if kw_lower in col_lower:
                return "metric"

    return None  # 无法判断，交给类型推断决定


class DataEngineer:
    """老陈 - 数据工程师：不越界，只做数据清洗和画像"""

    def __init__(self):
        self.name = "老陈"
        self.role = "数据工程师"
        logger.info(f"[老陈] 数据工程师上线")

    async def profile(self, table_name: str) -> Dict[str, Any]:
        """
        对表做完整数据画像，返回结构化JSON。

        Returns:
            {
                "file": table_name,
                "shape": [rows, cols],
                "columns": [...],   # 每列含 role/action/is_primary/exclude_reason
                "quality": {...},
                "warnings": [...],
                "decisions": [...],  # 老陈的决策日志（前端展示用）
                "timestamp": "...",
                "_agent": "老陈"
            }
        """
        logger.info(f"[老陈] 开始分析表: {table_name}")
        warnings = []
        decisions = []   # 决策日志，给前端展示
        thinking = []    # 思考链，前端流式展示"AI在思考什么"

        try:
            from ..core.duckdb_engine import get_duckdb_engine
            duck = get_duckdb_engine()

            # ── 1. 基本行数 ─────────────────────────────────────────────
            row_result = duck.execute_query(f'SELECT COUNT(*) as cnt FROM {safe_id(table_name)}')
            if not row_result.get("success") or not row_result.get("data"):
                err_msg = row_result.get("error", "未知错误")
                logger.error(f"[老陈] 获取行数失败: {err_msg}")
                return self._error_profile(table_name, f"表不存在或查询失败: {err_msg}")
            total_rows = row_result["data"][0].get("cnt", 0)
            if total_rows == 0:
                return self._error_profile(table_name, "表为空")
            thinking.append(f"表共{total_rows}行数据，规模{'适中' if total_rows < 10000 else '较大'}")

            # ── 2. 列名 ─────────────────────────────────────────────────
            cols_result = duck.execute_query(f'SELECT * FROM {safe_id(table_name)} LIMIT 0')
            if not cols_result.get("success"):
                err_msg = cols_result.get("error", "未知错误")
                logger.error(f"[老陈] 获取列名失败: {err_msg}")
                return self._error_profile(table_name, f"无法获取列信息: {err_msg}")
            column_names: List[str] = [c for c in cols_result.get("columns", []) if c and str(c).strip()]
            total_cols = len(column_names)

            if total_cols == 0:
                return self._error_profile(table_name, "未检测到有效列名")
            thinking.append(f"检测到{total_cols}个有效列，开始逐列分析...")

            # ── 3. 逐列分析（第一步：类型判断）──────────────────────────
            columns_info = []
            total_missing_cells = 0

            for col in column_names:
                col_info = await self._analyze_column(duck, table_name, col, total_rows)
                columns_info.append(col_info)
                total_missing_cells += col_info.get("missing_count", 0)

                # 思考链：描述对每列的判断
                col_type = col_info.get("type", "?")
                col_thought = f"「{col}」"
                if col_type == "numeric":
                    stats = col_info.get("stats") or {}
                    col_thought += f"是数值列，范围{stats.get('min', '?')}~{stats.get('max', '?')}，均值{stats.get('mean', '?')}"
                elif col_type == "category":
                    col_thought += f"是分类列，{col_info.get('unique_count', '?')}个不同值"
                elif col_type == "id":
                    col_thought += "是ID/序号列，无分析价值"
                elif col_type == "text":
                    col_thought += f"是文本列，{col_info.get('unique_count', '?')}个不同值"
                if col_info.get("mixed_type"):
                    col_thought += "，混合了数字和文本"
                if col_info.get("missing_rate", 0) > 0.1:
                    col_thought += f"，缺失率{col_info['missing_rate']:.0%}"
                thinking.append(col_thought)

                # 收集警告
                if col_info.get("mixed_type"):
                    warnings.append(f"列「{col}」混合了数字和文本值，已按分类处理")
                if col_info.get("missing_rate", 0) > 0.3:
                    warnings.append(f"列「{col}」缺失率超过30%（{col_info['missing_rate']:.1%}）")
                if col_info.get("outlier_count", 0) > 0:
                    pct = col_info["outlier_count"] / total_rows
                    if pct > 0.05:
                        warnings.append(f"列「{col}」异常值占比 {pct:.1%}，请注意")

            # ── 4. 第二步：语义识别（根据列名关键词）─────────────────────
            columns_info = self._apply_semantic_roles(columns_info, decisions)
            thinking.append(f"语义识别完成，排除{len([c for c in columns_info if c.get('action') == 'exclude'])}列，"
                           f"标记{len([c for c in columns_info if c.get('role') == 'metric'])}个指标列，"
                           f"{len([c for c in columns_info if c.get('role') == 'dimension'])}个维度列")

            # ── 5. 重复行 ─────────────────────────────────────────────────
            dup_count = await self._count_duplicates(duck, table_name, column_names)
            dup_rate = dup_count / total_rows if total_rows > 0 else 0

            # ── 6. 质量评分 ───────────────────────────────────────────────
            total_cells = total_rows * total_cols
            missing_rate = total_missing_cells / total_cells if total_cells > 0 else 0
            score = self._quality_score(missing_rate, dup_rate)
            if score < 60:
                warnings.append(f"数据质量较低（评分{score:.0f}/100），分析结果可能不准确")

            # ── 7. 生成决策日志摘要 ────────────────────────────────────────
            excluded = [c for c in columns_info if c.get("action") == "exclude"]
            metrics = [c for c in columns_info if c.get("role") == "metric"]
            dims = [c for c in columns_info if c.get("role") == "dimension"]
            time_c = [c for c in columns_info if c.get("role") == "time"]
            primary = next((c for c in metrics if c.get("is_primary")), None)

            decisions.append(f"识别 {total_cols} 列，排除 {len(excluded)} 列无意义列")
            if excluded:
                decisions.append(f"排除列：{', '.join(c['name'] for c in excluded)}"
                                  f"（{'、'.join(c.get('exclude_reason', '无意义') for c in excluded)}）")
            if primary:
                _ps = primary.get('stats') or {}
                decisions.append(f"主指标列：{primary['name']}（数值范围 {_ps.get('min')}~{_ps.get('max')}）")
            elif metrics:
                decisions.append(f"指标列：{', '.join(c['name'] for c in metrics)}")
            if dims:
                decisions.append(f"分组维度：{', '.join(c['name'] for c in dims[:5])}")
            if time_c:
                decisions.append(f"时间列：{', '.join(c['name'] for c in time_c)}")
            else:
                decisions.append("无时间列，老王将跳过预测")

            # ── 8. 生成执行计划（编排器用来决定并行/串行/跳过）────────────
            execution_plan = self._build_execution_plan(columns_info, total_rows, decisions)

            # ── 9. 生成分析配置（老林用来决定分析深度）──────────────────
            analysis_config = self._build_analysis_config(total_rows, decisions, columns_info)

            profile = {
                "file": table_name,
                "shape": [total_rows, total_cols],
                "columns": columns_info,
                "quality": {
                    "missing_rate": f"{missing_rate:.1%}",
                    "missing_cells": total_missing_cells,
                    "duplicate_rate": f"{dup_rate:.1%}",
                    "duplicate_rows": dup_count,
                    "score": round(score, 1)
                },
                "warnings": warnings,
                "decisions": decisions,
                "thinking": thinking,  # 思考链
                "execution_plan": execution_plan,
                "analysis_config": analysis_config,
                "timestamp": datetime.now().isoformat(),
                "_agent": self.name
            }
            logger.info(f"[老陈] 完成: {total_rows}行×{total_cols}列, 质量{score:.0f}分, "
                        f"排除{len(excluded)}列, {len(warnings)}条警告")
            return profile

        except Exception as e:
            import traceback
            logger.error(f"[老陈] 分析失败: {e}\n{traceback.format_exc()}")
            return self._error_profile(table_name, str(e))

    async def _analyze_column(
        self, duck, table_name: str, col: str, total_rows: int
    ) -> Dict[str, Any]:
        """分析单列，返回列信息字典"""
        info: Dict[str, Any] = {"name": col}

        try:
            # 探针SQL：一次性获取所需信息
            probe_sql = f"""
                SELECT
                    COUNT(*) as non_null_cnt,
                    COUNT(DISTINCT {safe_id(col)}) as unique_cnt,
                    SUM(CASE WHEN TRY_CAST({safe_id(col)} AS DOUBLE) IS NOT NULL
                             AND {safe_id(col)} IS NOT NULL
                             AND TRIM(CAST({safe_id(col)} AS VARCHAR)) != ''
                        THEN 1 ELSE 0 END) as numeric_cnt,
                    SUM(CASE WHEN TRY_CAST({safe_id(col)} AS BIGINT) IS NOT NULL
                             AND TRY_CAST({safe_id(col)} AS BIGINT) BETWEEN 1800 AND 2100
                        THEN 1 ELSE 0 END) as year_like_cnt
                FROM {safe_id(table_name)}
                WHERE {safe_id(col)} IS NOT NULL AND TRIM(CAST({safe_id(col)} AS VARCHAR)) != ''
            """
            probe = duck.execute_query(probe_sql)
            if not probe.get("success") or not probe.get("data"):
                info["type"] = "unknown"
                return info

            d = probe["data"][0]
            non_null = int(d.get("non_null_cnt") or 0)
            unique_cnt = int(d.get("unique_cnt") or 0)
            numeric_cnt = int(d.get("numeric_cnt") or 0)
            year_like_cnt = int(d.get("year_like_cnt") or 0)

            missing_count = total_rows - non_null
            missing_rate = missing_count / total_rows if total_rows > 0 else 0
            info["missing_count"] = missing_count
            info["missing_rate"] = round(missing_rate, 4)

            numeric_ratio = numeric_cnt / non_null if non_null > 0 else 0
            year_ratio = year_like_cnt / non_null if non_null > 0 else 0
            unique_ratio = unique_cnt / non_null if non_null > 0 else 0

            # 检测混合类型（数值比例在20-80%之间）
            mixed_type = 0.2 < numeric_ratio < 0.8
            info["mixed_type"] = mixed_type

            # ── 列类型判断 ──────────────────────────────────────────────
            if numeric_ratio >= 0.8 and year_ratio >= 0.8 and unique_cnt <= 200 and non_null >= 5:
                col_type = "time"
            elif numeric_ratio >= 0.8 and not mixed_type:
                # 检测连续整数序列（行号特征）
                if await self._is_sequential_integers(duck, table_name, col, non_null):
                    col_type = "id"
                # 低基数纯数字（如1/2/3分组编号）→ 分类列
                elif unique_cnt <= 20 and unique_ratio < 0.05:
                    col_type = "category"
                else:
                    col_type = "numeric"
            elif unique_cnt <= 50 and unique_ratio < 0.05:
                col_type = "category"   # 低基数，如sex/age_group/region
            elif unique_ratio > 0.9:
                col_type = "id"          # ID/名字类，高基数
            else:
                col_type = "text"

            info["type"] = col_type
            info["unique_count"] = unique_cnt

            # 样本值
            sample_sql = f"""
                SELECT DISTINCT CAST({safe_id(col)} AS VARCHAR) as v
                FROM {safe_id(table_name)}
                WHERE {safe_id(col)} IS NOT NULL AND TRIM(CAST({safe_id(col)} AS VARCHAR)) != ''
                LIMIT 5
            """
            sample_res = duck.execute_query(sample_sql)
            if sample_res.get("success") and sample_res.get("data"):
                info["sample_values"] = [r.get("v", "") for r in sample_res["data"]]
            else:
                info["sample_values"] = []

            # ── 汇总值检测（仅对分类/时间列）────────────────────────────
            aggregate_value = None
            if col_type in ("category", "time"):
                for sv in info["sample_values"]:
                    if str(sv).lower().strip() in AGGREGATE_KEYWORDS:
                        aggregate_value = sv
                        break
                # 如果样本里没发现，查一下ALL/both
                if not aggregate_value:
                    for kw in ["ALL", "both", "Total", "总计", "合计"]:
                        check_sql = f"""
                            SELECT COUNT(*) as cnt FROM {safe_id(table_name)}
                            WHERE LOWER(TRIM(CAST({safe_id(col)} AS VARCHAR))) = '{kw.lower()}'
                        """
                        cr = duck.execute_query(check_sql)
                        if cr.get("success") and cr.get("data"):
                            if int(cr["data"][0].get("cnt") or 0) > 0:
                                aggregate_value = kw
                                break
            info["aggregate_value"] = aggregate_value

            # ── 数值列统计 ─────────────────────────────────────────────
            if col_type == "numeric":
                stats = await self._numeric_stats(duck, table_name, col)
                info["stats"] = stats
            elif col_type == "time":
                stats = await self._numeric_stats(duck, table_name, col)
                info["stats"] = stats
            else:
                info["stats"] = None

            # ── 异常值检测（IQR方法，仅numeric列）──────────────────────
            if col_type == "numeric" and non_null >= 10:
                outlier_count = await self._count_outliers(duck, table_name, col)
                info["outlier_count"] = outlier_count
            else:
                info["outlier_count"] = 0

        except Exception as e:
            logger.debug(f"[老陈] 列{col}分析出错: {e}")
            info["type"] = "unknown"

        return info

    async def _numeric_stats(self, duck, table_name: str, col: str) -> Dict[str, Any]:
        """计算数值列基础统计"""
        try:
            sql = f"""
                SELECT
                    MIN(TRY_CAST({safe_id(col)} AS DOUBLE)) as min_val,
                    MAX(TRY_CAST({safe_id(col)} AS DOUBLE)) as max_val,
                    AVG(TRY_CAST({safe_id(col)} AS DOUBLE)) as mean_val,
                    APPROX_QUANTILE(TRY_CAST({safe_id(col)} AS DOUBLE), 0.5) as median_val,
                    STDDEV_SAMP(TRY_CAST({safe_id(col)} AS DOUBLE)) as std_val
                FROM {safe_id(table_name)}
                WHERE TRY_CAST({safe_id(col)} AS DOUBLE) IS NOT NULL
            """
            res = duck.execute_query(sql)
            if res.get("success") and res.get("data"):
                d = res["data"][0]
                return {
                    "min": self._round(d.get("min_val")),
                    "max": self._round(d.get("max_val")),
                    "mean": self._round(d.get("mean_val")),
                    "median": self._round(d.get("median_val")),
                    "std": self._round(d.get("std_val")),
                }
        except Exception as e:
            logger.debug(f"[老陈] 数值统计失败 {col}: {e}")
        return {}

    async def _count_outliers(self, duck, table_name: str, col: str) -> int:
        """IQR方法检测异常值数量"""
        try:
            iqr_sql = f"""
                WITH stats AS (
                    SELECT
                        APPROX_QUANTILE(TRY_CAST({safe_id(col)} AS DOUBLE), 0.25) as q1,
                        APPROX_QUANTILE(TRY_CAST({safe_id(col)} AS DOUBLE), 0.75) as q3
                    FROM {safe_id(table_name)}
                    WHERE TRY_CAST({safe_id(col)} AS DOUBLE) IS NOT NULL
                )
                SELECT COUNT(*) as outlier_cnt
                FROM {safe_id(table_name)}, stats
                WHERE TRY_CAST({safe_id(col)} AS DOUBLE) IS NOT NULL
                  AND (
                      TRY_CAST({safe_id(col)} AS DOUBLE) < q1 - 1.5 * (q3 - q1)
                      OR TRY_CAST({safe_id(col)} AS DOUBLE) > q3 + 1.5 * (q3 - q1)
                  )
            """
            res = duck.execute_query(iqr_sql)
            if res.get("success") and res.get("data"):
                return int(res["data"][0].get("outlier_cnt") or 0)
        except Exception as e:
            logger.debug(f"[老陈] 异常值检测失败 {col}: {e}")
        return 0

    async def _is_sequential_integers(
        self, duck, table_name: str, col: str, non_null: int
    ) -> bool:
        """
        检查一列是否是连续整数序列（行号/序号特征）。
        条件：MIN=1, MAX=总行数，所有值不重复，且 MAX-MIN+1 == COUNT
        """
        try:
            sql = f"""
                SELECT
                    MIN(TRY_CAST({safe_id(col)} AS BIGINT)) as min_val,
                    MAX(TRY_CAST({safe_id(col)} AS BIGINT)) as max_val,
                    COUNT(DISTINCT TRY_CAST({safe_id(col)} AS BIGINT)) as unique_cnt
                FROM {safe_id(table_name)}
                WHERE TRY_CAST({safe_id(col)} AS BIGINT) IS NOT NULL
            """
            res = duck.execute_query(sql)
            if not res.get("success") or not res.get("data"):
                return False
            d = res["data"][0]
            min_v = d.get("min_val")
            max_v = d.get("max_val")
            uniq = d.get("unique_cnt")
            if min_v is None or max_v is None or uniq is None:
                return False
            min_v, max_v, uniq = int(min_v), int(max_v), int(uniq)
            # 连续整数：min=1 (或0)，max约等于总行数，不重复
            if min_v in (0, 1) and max_v == non_null and uniq == non_null:
                return True
            # 或者值域跨度 == 唯一值数（连续，但不一定从1开始）
            if max_v - min_v + 1 == uniq and uniq == non_null:
                return True
        except Exception:
            pass
        return False

    def _apply_semantic_roles(
        self, columns_info: List[Dict], decisions: List[str]
    ) -> List[Dict]:
        """
        第二步：语义识别。
        根据列名关键词设置 role/action/is_primary/exclude_reason。
        同时决定哪个 metric 列是 is_primary（值域最大的那个）。
        """
        metric_candidates = []

        for col in columns_info:
            name = col["name"]
            col_type = col.get("type", "text")

            sem = _semantic_role(name)

            if sem == "exclude":
                # 语义强制排除
                reason = self._exclude_reason(name)
                col["role"] = "id" if col_type in ("id", "numeric") else "text"
                col["action"] = "exclude"
                col["is_primary"] = False
                col["exclude_reason"] = reason
                decisions.append(f"排除「{name}」→ {reason}")

            elif sem == "metric" and col_type in ("numeric", "category"):
                # 数值型 metric
                col["role"] = "metric"
                col["action"] = "analyze"
                col["is_primary"] = False
                col["exclude_reason"] = None
                metric_candidates.append(col)

            elif sem == "dimension":
                col["role"] = "dimension"
                col["action"] = "group_by"
                col["is_primary"] = False
                col["exclude_reason"] = None

            elif sem == "time":
                col["role"] = "time"
                col["action"] = "time_axis"
                col["is_primary"] = False
                col["exclude_reason"] = None

            else:
                # 语义不明确，按类型决定
                if col_type == "numeric":
                    col["role"] = "metric"
                    col["action"] = "analyze"
                    col["is_primary"] = False
                    col["exclude_reason"] = None
                    metric_candidates.append(col)
                elif col_type == "time":
                    col["role"] = "time"
                    col["action"] = "time_axis"
                    col["is_primary"] = False
                    col["exclude_reason"] = None
                elif col_type == "category":
                    col["role"] = "dimension"
                    col["action"] = "group_by"
                    col["is_primary"] = False
                    col["exclude_reason"] = None
                else:
                    # id / text → 排除
                    col["role"] = col_type
                    col["action"] = "exclude"
                    col["is_primary"] = False
                    col["exclude_reason"] = "ID或文本列，无分析价值"

        # 标记主指标（值域最大的 metric）
        if metric_candidates:
            def _range(c):
                s = c.get("stats") or {}
                mn = s.get("min") or 0
                mx = s.get("max") or 0
                try:
                    return float(mx) - float(mn)
                except Exception:
                    return 0
            primary = max(metric_candidates, key=_range)
            primary["is_primary"] = True
            decisions.append(f"主指标列标记为「{primary['name']}」（值域最大）")
        
        return columns_info

    def _exclude_reason(self, col_name: str) -> str:
        """根据列名推断排除原因"""
        col_lower = col_name.lower()
        if any(k in col_lower for k in ["序号", "编号", "行号", "no", "id", "index", "idx"]):
            return "行号/编号，无分析价值"
        if any(k in col_lower for k in ["姓名", "名字", "name", "fullname"]):
            return "人员标识，无分析价值"
        return "无分析价值"

    async def _count_duplicates(self, duck, table_name: str, cols: List[str]) -> int:
        """统计重复行数"""
        try:
            cols_str = ", ".join([safe_id(c) for c in cols[:20]])
            sql = f"""
                SELECT COUNT(*) as dup_count FROM (
                    SELECT {cols_str}, COUNT(*) as cnt
                    FROM {safe_id(table_name)}
                    GROUP BY {cols_str}
                    HAVING COUNT(*) > 1
                )
            """
            res = duck.execute_query(sql)
            if res.get("success") and res.get("data"):
                return int(res["data"][0].get("dup_count") or 0)
        except Exception as e:
            logger.debug(f"[老陈] 重复行统计失败: {e}")
        return 0

    def _quality_score(self, missing_rate: float, dup_rate: float) -> float:
        """计算数据质量分（0-100）"""
        miss_penalty = min(missing_rate * 100 * 2, 60)  # 缺失率每1%扣2分，最多60分
        dup_penalty = min(dup_rate * 100 * 5, 30)        # 重复率每1%扣5分，最多30分
        return max(0.0, 100 - miss_penalty - dup_penalty)

    def _round(self, v, decimals=4) -> Optional[float]:
        if v is None:
            return None
        try:
            f = float(v)
            if math.isnan(f) or math.isinf(f):
                return None
            return round(f, decimals)
        except Exception:
            return None

    def _build_execution_plan(
        self, columns_info: List[Dict], total_rows: int, decisions: List[str]
    ) -> Dict[str, Any]:
        """
        根据数据特征生成动态执行计划。
        编排器读这个plan来决定哪些Agent并行、哪些串行、哪些跳过。
        不写死谁先谁后——数据说了算。
        """
        has_time = any(c.get("role") == "time" for c in columns_info)
        has_metric = any(c.get("role") == "metric" for c in columns_info)
        has_dimension = any(c.get("role") == "dimension" for c in columns_info)
        metric_count = sum(1 for c in columns_info if c.get("role") == "metric")
        dim_count = sum(1 for c in columns_info if c.get("role") == "dimension")

        # 决定老王是否需要运行
        wang_needed = has_time and has_metric

        # 决定并行组
        # 小赵的初步分析可以和老林同时启动（只需老陈的画像）
        # 小赵的完整分析需要等老林和老王
        parallel_group_1 = ["老林"]
        if not has_time:
            # 没有时间列：小赵可以和老林完全并行（老王直接跳过）
            parallel_group_1.append("小赵_初步")

        skip = []
        if not wang_needed:
            skip.append("老王(无时间列或无指标列，跳过预测)")

        dependencies = {}
        if wang_needed:
            dependencies["老王"] = "老林的趋势分析结果（等老林先发现时间维度）"
        if has_time:
            dependencies["小赵_完整"] = "老林 + 老王（需要时间趋势和预测数据）"
        else:
            dependencies["小赵_完整"] = "老林（无时间维度，不需要等老王）"

        reason_parts = []
        if has_time:
            reason_parts.append(f"有时间列→老王需等老林")
        else:
            reason_parts.append(f"无时间列→老王跳过，老林与小赵可并行")
        if metric_count > 1:
            reason_parts.append(f"{metric_count}个指标列→老林启动多维分析")
        if dim_count > 3:
            reason_parts.append(f"{dim_count}个维度列→小赵需要老林全部结果再做交叉分析")

        decisions.append(f"执行计划：{'；'.join(reason_parts)}")

        return {
            "has_time": has_time,
            "has_metric": has_metric,
            "has_dimension": has_dimension,
            "wang_needed": wang_needed,
            "parallel_group_1": parallel_group_1,
            "skip": skip,
            "dependencies": dependencies,
            "reason": "；".join(reason_parts)
        }

    def _build_analysis_config(
        self, total_rows: int, decisions: List[str],
        columns_info: List[Dict] = None
    ) -> Dict[str, Any]:
        """
        根据数据规模自适应决定分析深度。
        老林读这个config来决定策略，不是每次都全量分析。

        新增 complexity 字段：综合评估数据复杂度（1-10分），
        编排器根据此值决定 Agent 路由和 LLM 调用策略。

        复杂度评分维度：
        - 行数规模（0-3分）
        - 列数规模（0-2分）
        - 维度多样性（0-2分）
        - 指标丰富度（0-2分）
        - 数据质量问题（0-1分）
        """
        cols = columns_info or []
        metric_count = sum(1 for c in cols if c.get("role") == "metric")
        dim_count = sum(1 for c in cols if c.get("role") == "dimension")
        total_cols = len(cols)

        # ── 计算复杂度评分 ──────────────────────────────────────────
        complexity_score = 0.0
        complexity_factors = {}

        # 1. 行数规模（0-3分）
        if total_rows < 50:
            row_score = 0.5
        elif total_rows < 500:
            row_score = 1.0
        elif total_rows < 5000:
            row_score = 2.0
        elif total_rows < 50000:
            row_score = 2.5
        else:
            row_score = 3.0
        complexity_score += row_score
        complexity_factors["数据规模"] = row_score

        # 2. 列数规模（0-2分）
        if total_cols < 5:
            col_score = 0.5
        elif total_cols < 10:
            col_score = 1.0
        elif total_cols < 20:
            col_score = 1.5
        else:
            col_score = 2.0
        complexity_score += col_score
        complexity_factors["列数规模"] = col_score

        # 3. 维度多样性（0-2分）
        if dim_count == 0:
            dim_score = 0.0
        elif dim_count <= 2:
            dim_score = 0.5
        elif dim_count <= 5:
            dim_score = 1.0
        else:
            dim_score = 2.0
        complexity_score += dim_score
        complexity_factors["维度多样性"] = dim_score

        # 4. 指标丰富度（0-2分）
        if metric_count == 0:
            met_score = 0.0
        elif metric_count == 1:
            met_score = 0.5
        elif metric_count <= 3:
            met_score = 1.0
        else:
            met_score = 2.0
        complexity_score += met_score
        complexity_factors["指标丰富度"] = met_score

        # 5. 数据质量加分（有问题→复杂度+1，需要更多处理）
        quality_bonus = 0.0
        if cols:
            missing_issues = sum(1 for c in cols if c.get("missing_rate", 0) > 0.1)
            outlier_issues = sum(1 for c in cols if c.get("outlier_count", 0) > 0)
            mixed_issues = sum(1 for c in cols if c.get("mixed_type", False))
            if missing_issues + outlier_issues + mixed_issues >= 3:
                quality_bonus = 1.0
            elif missing_issues + outlier_issues + mixed_issues >= 1:
                quality_bonus = 0.5
        complexity_score += quality_bonus
        complexity_factors["数据质量挑战"] = quality_bonus

        # 限定范围 1-10
        complexity_score = max(1.0, min(10.0, round(complexity_score, 1)))

        # ── 根据复杂度决定分析深度 ──────────────────────────────────
        if total_rows < 100:
            depth = "minimal"
            sample_size = None
            reason = f"数据量过少（{total_rows}行），仅提供基础统计，不做分组分析"
        elif total_rows <= 10000:
            depth = "full"
            sample_size = None
            reason = f"数据量适中（{total_rows}行），执行完整分析"
        elif total_rows <= 100000:
            depth = "full"
            sample_size = 1000
            reason = f"数据量较大（{total_rows}行），图表数据基于随机抽样1000行"
        else:
            depth = "reduced"
            sample_size = 1000
            reason = f"数据量超大（{total_rows}行），仅分析主指标列，维度列只取TOP20，图表基于抽样1000行"

        # 高复杂度→建议LLM深度参与
        llm_strategy = "minimal"  # 默认：LLM最少参与
        if complexity_score >= 7.0:
            llm_strategy = "deep"      # 高复杂度：LLM深度分析
        elif complexity_score >= 4.0:
            llm_strategy = "moderate"  # 中复杂度：LLM适度参与

        decisions.append(f"复杂度评估：{complexity_score}/10（{llm_strategy}策略）")
        decisions.append(f"分析深度：{depth}（{reason}）")

        return {
            "depth": depth,
            "sample_size": sample_size,
            "reason": reason,
            "total_rows": total_rows,
            "complexity": complexity_score,
            "complexity_factors": complexity_factors,
            "llm_strategy": llm_strategy,  # "minimal" | "moderate" | "deep"
            "metric_count": metric_count,
            "dimension_count": dim_count,
        }

    async def discuss(
        self,
        context: str,
        chen_profile: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        讨论室模式：老陈以数据释义专家身份参与讨论。
        被动响应其他Agent的数据问题，不主动分析。

        Args:
            context: discussion_context构建的纯文本上下文
            chen_profile: 扫描阶段产生的完整画像（工作产物，不放context）

        Returns:
            {"message": str, "mentions": list, "triggers": list}
        """
        from ..utils import llm

        # 构建数据概况（从工作产物提取，注入prompt但不放context）
        brief = self._discuss_brief(chen_profile)

        # 自进化：注入历史经验
        from .agent_memory import get_agent_memory
        experience = get_agent_memory().build_experience_prompt("老陈")

        prompt = f"""你是数据工程师"老陈"。你已扫描过数据，你的工作产物存在系统变量里。
你是团队的数据释义专家——其他同事有数据相关问题时@你。
{experience}
讨论上下文：
{context}

你的数据概况（供你回答问题用，不要在发言中复述这些信息）：
{brief}

规则：
1. 只回应直接@你的问题，不要主动发言
2. 回答数据相关的问题：列含义、数据范围、缺失情况、类型判断依据等
3. 如果有人质疑你的判断，要么拿统计数字反驳，要么承认修正
4. 如果不确定，直接说"我不确定，需要查一下"
5. 发言简洁，像开会说话，不要输出格式化列表
6. 不设置triggers（你不主动触发其他人）
7. 以 @引用 开头，回应提问者

请输出JSON格式：
{{"message": "你的发言内容", "mentions": ["你引用了谁"], "triggers": []}}
只输出JSON，不要输出其他内容。"""

        try:
            raw = await llm.chat([{"role": "user", "content": prompt}], temperature=0.3)
            return self._parse_discuss_output(raw)
        except Exception as e:
            logger.error(f"[老陈] 讨论发言失败: {e}")
            return {
                "message": f"[系统] 老陈发言失败: {str(e)}",
                "mentions": [],
                "triggers": []
            }

    def _discuss_brief(self, chen_profile: Dict[str, Any]) -> str:
        """
        从chen_profile提取讨论所需的数据概况。
        比orchestrator里的_chen_brief更精准——只放讨论中可能被问到的信息。
        """
        if not chen_profile:
            return "（无数据画像）"

        columns = chen_profile.get("columns", [])
        shape = chen_profile.get("shape", [0, 0])
        quality = chen_profile.get("quality", {}).get("score", "?")

        parts = [f"数据概况: {shape[0]}行 x {shape[1]}列, 质量{quality}分"]

        for c in columns:
            if c.get("action") == "exclude":
                continue
            name = c["name"]
            role = c.get("role", "?")
            col_type = c.get("type", "?")
            unique = (c.get("stats") or {}).get("unique_count") if c.get("stats") else c.get("unique_count", "?")
            samples = c.get("sample_values", [])
            sample_str = f", 示例: {samples[:3]}" if samples else ""
            parts.append(f"  {name}: {role}/{col_type}, 唯一值={unique}{sample_str}")

        return "\n".join(parts)

    def _parse_discuss_output(self, raw: str) -> Dict[str, Any]:
        """解析老陈的讨论输出JSON"""
        import json as _json
        if not raw:
            return {"message": "", "mentions": [], "triggers": []}

        text = raw.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            text = "\n".join(lines)

        try:
            parsed = _json.loads(text)
            if isinstance(parsed, dict):
                parsed.setdefault("message", str(parsed))
                parsed.setdefault("mentions", [])
                parsed.setdefault("triggers", [])
                # 老陈不主动触发其他人，强制清空triggers
                parsed["triggers"] = []
                return parsed
        except _json.JSONDecodeError:
            pass

        return {"message": raw, "mentions": [], "triggers": []}

    def _error_profile(self, table_name: str, reason: str) -> Dict[str, Any]:
        return {
            "file": table_name,
            "shape": [0, 0],
            "columns": [],
            "quality": {"missing_rate": "N/A", "score": 0},
            "warnings": [f"老陈分析失败: {reason}"],
            "decisions": [f"分析失败：{reason}"],
            "timestamp": datetime.now().isoformat(),
            "_agent": self.name,
            "_error": reason
        }


# 单例
_chen_instance: Optional[DataEngineer] = None

def get_chen() -> DataEngineer:
    global _chen_instance
    if _chen_instance is None:
        _chen_instance = DataEngineer()
    return _chen_instance
