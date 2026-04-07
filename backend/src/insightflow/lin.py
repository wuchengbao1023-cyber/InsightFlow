"""
老林 - 数据分析师 (DataAnalyst)
===================================

职责：拿到老陈的画像后，自动发现趋势、对比、异常。
特点：大部分逻辑是纯代码，复杂解读用LLM。

输入：老陈的DataProfile
输出：analyses数组（每个元素是一张图表的数据 + 一句话摘要）

自动分析规则（按优先级）：
A. 有时间列 + 数值列 → 时间趋势（折线图）
B. 有低基数分类列 + 数值列 → 分类对比（柱状图）
C. 有高基数分类列 + 数值列 → TOP10排名（柱状图）
D. 有时间列 + 分类列 + 数值列 → 分组趋势
E. 有两个数值列 → 相关性散点图
F. 分类列 + 时间列 → 发现异常年份

回退机制：如果发现老陈识别的列类型明显错误，标记 _retry=True
"""

import logging
import math
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime

logger = logging.getLogger(__name__)

from ..core.duckdb_engine import sanitize_identifier as safe_id


class DataAnalyst:
    """老林 - 数据分析师：自动发现数据中有意义的规律"""

    def __init__(self):
        self.name = "老林"
        self.role = "数据分析师"
        logger.info(f"📊 {self.name}({self.role}) 上线")

    async def analyze(
        self,
        chen_profile: Dict[str, Any],
        table_name: str
    ) -> Dict[str, Any]:
        """
        基于老陈的画像，自动生成分析结果。

        Returns:
            {
                "analyses": [...],  # 图表数组
                "summary": "...",   # 一句话总结
                "_agent": "老林",
                "_retry": False     # 是否需要老陈重新分析
            }
        """
        logger.info(f"[老林] 开始分析: {table_name}")

        # 解析老陈的画像
        columns = chen_profile.get("columns", [])
        shape = chen_profile.get("shape", [0, 0])
        total_rows = shape[0]
        thinking = []  # 思考链

        if total_rows == 0 or not columns:
            return {"analyses": [], "summary": "无数据可分析", "_agent": self.name, "thinking": []}

        # ── 按语义 role/action 分组列（优先用老陈的语义识别结果）──────────
        # 跳过 action=exclude 的列（序号/姓名等）
        active_cols = [c for c in columns if c.get("action") != "exclude"]

        # 根据 role 字段分组（老陈已做语义识别）
        time_cols = [c for c in active_cols if c.get("role") == "time" or c.get("type") == "time"]
        # 指标列：role=metric，类型必须是 numeric（老陈语义 + 类型双重保证）
        numeric_cols = [c for c in active_cols if c.get("role") == "metric" and c.get("type") == "numeric"]
        # 兜底：没有语义识别时，直接用类型
        if not numeric_cols:
            numeric_cols = [c for c in active_cols if c.get("type") == "numeric"]

        # 主指标优先（is_primary=True 排在前面）
        numeric_cols.sort(key=lambda c: (0 if c.get("is_primary") else 1))

        # 维度列：role=dimension，或低基数分类列
        dim_cols_low = [
            c for c in active_cols
            if (c.get("role") == "dimension" or c.get("type") == "category")
            and c.get("unique_count", 999) <= 30
        ]
        dim_cols_high = [
            c for c in active_cols
            if (c.get("role") == "dimension" or c.get("type") in ("category", "id"))
            and c.get("unique_count", 0) > 30
            and c.get("action") != "exclude"
        ]

        # 记录跳过的列（给决策日志用）
        skipped = [c["name"] for c in columns if c.get("action") == "exclude"]
        if skipped:
            logger.info(f"[老林] 跳过以下排除列: {skipped}")

        # 思考链：描述分析策略
        thinking.append(f"拿到老陈的画像。主指标是{numeric_cols[0]['name'] if numeric_cols else '无'}，"
                       f"{len(dim_cols_low)}个低基数维度，{len(dim_cols_high)}个高基数维度")
        if time_cols:
            thinking.append(f"有时间列「{time_cols[0]['name']}」，先做时间趋势分析")
        thinking.append(f"开始按规则逐个分析...")

        analyses = []

        try:
            from ..core.duckdb_engine import get_duckdb_engine
            duck = get_duckdb_engine()

            # ── 规则A：时间趋势 ──────────────────────────────────────────
            if time_cols and numeric_cols:
                for time_col in time_cols[:1]:  # 只取主时间列
                    for num_col in numeric_cols[:2]:  # 最多2个数值列
                        analysis = await self._trend_analysis(
                            duck, table_name, time_col, num_col, active_cols
                        )
                        if analysis:
                            analyses.append(analysis)
                            thinking.append(f"规则A-时间趋势：{analysis.get('summary', '')}")

            # ── 规则B：低基数维度对比（按 metric 均值排序） ───────────────
            if dim_cols_low and numeric_cols:
                for cat_col in dim_cols_low[:2]:  # 最多2个分类维度
                    agg_val = cat_col.get("aggregate_value")
                    for num_col in numeric_cols[:1]:
                        analysis = await self._category_compare(
                            duck, table_name, cat_col, num_col, active_cols,
                            exclude_aggregate=agg_val
                        )
                        if analysis:
                            analyses.append(analysis)
                            thinking.append(f"规则B-分类对比：{analysis.get('summary', '')}")

            # ── 规则C：高基数TOP10排名（按 metric 均值排序） ────────────
            if dim_cols_high and numeric_cols:
                for cat_col in dim_cols_high[:1]:
                    for num_col in numeric_cols[:1]:
                        analysis = await self._top10_ranking(
                            duck, table_name, cat_col, num_col, active_cols
                        )
                        if analysis:
                            analyses.append(analysis)
                            thinking.append(f"规则C-TOP10排名：{analysis.get('summary', '')}")

            # ── 规则D：分组趋势（分类 × 时间 × 数值）────────────────────
            if time_cols and dim_cols_low and numeric_cols:
                # 选唯一值最少的分类列（方便展示）
                best_cat = min(dim_cols_low, key=lambda c: c.get("unique_count", 999))
                agg_val = best_cat.get("aggregate_value")
                if agg_val:  # 只有有汇总值的维度才做分组趋势（过滤汇总行）
                    analysis = await self._grouped_trend(
                        duck, table_name, time_cols[0], best_cat,
                        numeric_cols[0], active_cols, exclude_aggregate=agg_val
                    )
                    if analysis:
                        analyses.append(analysis)

            # ── 规则E：相关性（有至少两个数值列）───────────────────────
            # 注意：只对 role=metric 的列做相关性，排除维度/ID列
            metric_for_corr = [c for c in numeric_cols if c.get("role") == "metric" or c.get("type") == "numeric"]
            if len(metric_for_corr) >= 2:
                analysis = await self._correlation(
                    duck, table_name, metric_for_corr[0], metric_for_corr[1]
                )
                if analysis:
                    analyses.append(analysis)

            # ── 规则F：纯分类表分布分析（无数值指标时的兜底）───────────
            # 当所有列都是分类/文本时，对低基数列做 COUNT 分布
            if not numeric_cols and dim_cols_low:
                thinking.append("无数值指标，切换为分类分布模式（COUNT分析）")
                for cat_col in dim_cols_low[:3]:  # 最多3个分类维度
                    agg_val = cat_col.get("aggregate_value")
                    analysis = await self._category_distribution(
                        duck, table_name, cat_col, all_columns,
                        exclude_aggregate=agg_val
                    )
                    if analysis:
                        analyses.append(analysis)
                        thinking.append(f"规则F-分类分布：{analysis.get('summary', '')}")

        except Exception as e:
            logger.error(f"[老林] 分析出错: {e}")

        # 检查是否需要退回老陈
        retry_needed = self._check_retry_needed(active_cols, analyses)

        # 生成总结摘要
        summary = self._make_summary(analyses, shape)

        # ── 推理链溯源：为每个分析结果创建ReasoningStep ──
        try:
            from .reasoning_chain import get_reasoning_chain
            chain = get_reasoning_chain()
            for a in analyses:
                chain.add_from_analysis(
                    agent=self.name,
                    title=a.get("title", ""),
                    summary=a.get("summary", ""),
                    rule=a.get("_rule", ""),
                    sql=a.get("_sql"),  # 如果分析中有存储SQL
                    raw_result=a.get("data"),
                    computation=a.get("_computation"),
                    source_columns=a.get("source_columns", [a.get("x_col"), a.get("y_col")]),
                    chart_type=a.get("type"),
                    confidence=0.9 if a.get("_rule") else 0.7,
                )
            logger.info(f"[老林] 推理链: 已记录{len(analyses)}个分析步骤")
        except Exception as e:
            logger.debug(f"[老林] 推理链记录失败（不影响分析）: {e}")

        logger.info(f"[老林] 完成: 生成{len(analyses)}个分析, 跳过{len(skipped)}列, 需要重试={retry_needed}")
        return {
            "analyses": analyses,
            "summary": summary,
            "skipped_cols": skipped,
            "thinking": thinking,  # 思考链
            "_agent": self.name,
            "_retry": retry_needed
        }

    async def _trend_analysis(
        self, duck, table_name: str,
        time_col: Dict, num_col: Dict,
        all_columns: List[Dict]
    ) -> Optional[Dict[str, Any]]:
        """规则A：时间趋势分析"""
        tc = time_col["name"]
        nc = num_col["name"]

        # 构建WHERE：过滤所有汇总维度，确保数据干净
        where_clauses = self._build_aggregate_filters(all_columns, exclude=[tc, nc])
        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

        sql = f"""
            SELECT
                TRY_CAST({safe_id(tc)} AS INTEGER) as time_val,
                AVG(TRY_CAST({safe_id(nc)} AS DOUBLE)) as value_val,
                COUNT(*) as sample_size
            FROM {safe_id(table_name)}
            {where_sql}
            WHERE TRY_CAST({safe_id(tc)} AS INTEGER) IS NOT NULL
              AND TRY_CAST({safe_id(nc)} AS DOUBLE) IS NOT NULL
            GROUP BY TRY_CAST({safe_id(tc)} AS INTEGER)
            ORDER BY time_val
        """

        res = duck.execute_query(sql)
        if not res.get("success") or not res.get("data") or len(res["data"]) < 3:
            return None

        data = [
            {"x": int(r["time_val"]), "y": self._round(r["value_val"]), "n": int(r.get("sample_size", 1))}
            for r in res["data"]
            if r.get("time_val") is not None and r.get("value_val") is not None
        ]
        if len(data) < 3:
            return None

        # 计算趋势方向和变化幅度
        first_val = data[0]["y"]
        last_val = data[-1]["y"]
        if first_val and first_val != 0:
            change_pct = (last_val - first_val) / abs(first_val) * 100
        else:
            change_pct = 0

        trend_dir = "上升" if change_pct > 3 else ("下降" if change_pct < -3 else "平稳")
        summary = (
            f"{nc}从{data[0]['x']}年的{first_val:.2f}"
            f"{trend_dir}至{data[-1]['x']}年的{last_val:.2f}"
            f"（{change_pct:+.1f}%）"
        )

        return {
            "id": f"trend_{nc}",
            "type": "line",
            "title": f"{nc} 时间趋势（{data[0]['x']}—{data[-1]['x']}）",
            "x_col": tc,
            "y_col": nc,
            "source_columns": [tc, nc],
            "filters": self._describe_filters(all_columns, [tc, nc]),
            "data": data,
            "trend": trend_dir,
            "change_pct": round(change_pct, 2),
            "summary": summary,
            "_rule": "A",
            "_sql": sql.strip(),
            "_computation": f"({last_val} - {first_val}) / |{first_val}| × 100% = {change_pct:+.1f}%",
        }

    async def _category_compare(
        self, duck, table_name: str,
        cat_col: Dict, num_col: Dict,
        all_columns: List[Dict],
        exclude_aggregate: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """规则B：低基数分类对比"""
        cc = cat_col["name"]
        nc = num_col["name"]

        # 构建过滤条件
        where_clauses = self._build_aggregate_filters(all_columns, exclude=[cc, nc])
        # 排除本列的汇总值
        if exclude_aggregate:
            where_clauses.append(
                f"LOWER(TRIM(CAST({safe_id(cc)} AS VARCHAR))) != '{exclude_aggregate.lower()}'"
            )

        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

        sql = f"""
            SELECT
                CAST({safe_id(cc)} AS VARCHAR) as cat_val,
                AVG(TRY_CAST({safe_id(nc)} AS DOUBLE)) as value_val,
                COUNT(*) as sample_size
            FROM {safe_id(table_name)}
            {where_sql}
            GROUP BY CAST({safe_id(cc)} AS VARCHAR)
            HAVING AVG(TRY_CAST({safe_id(nc)} AS DOUBLE)) IS NOT NULL
            ORDER BY value_val DESC
        """

        res = duck.execute_query(sql)
        if not res.get("success") or not res.get("data") or len(res["data"]) < 2:
            return None

        data = [
            {"x": str(r["cat_val"]), "y": self._round(r["value_val"]), "n": int(r.get("sample_size", 1))}
            for r in res["data"]
            if r.get("cat_val") and r.get("value_val") is not None
        ]
        if len(data) < 2:
            return None

        max_item = data[0]
        min_item = data[-1]
        ratio = max_item["y"] / min_item["y"] if min_item["y"] and min_item["y"] != 0 else None
        ratio_str = f"是最低的{ratio:.1f}倍" if ratio else ""
        summary = f"{cc}对比：最高「{max_item['x']}」({max_item['y']:.2f}){ratio_str}"

        return {
            "id": f"compare_{cc}_{nc}",
            "type": "bar",
            "title": f"按{cc}分类的{nc}对比",
            "x_col": cc,
            "y_col": nc,
            "source_columns": [cc, nc],
            "filters": self._describe_filters(all_columns, [cc, nc]),
            "data": data,
            "summary": summary,
            "_rule": "B",
            "_sql": sql.strip(),
            "_computation": f"AVG({nc}) per {cc} → 最高={max_item['x']}({max_item['y']:.2f}), 最低={min_item['x']}({min_item['y']:.2f})",
        }

    async def _top10_ranking(
        self, duck, table_name: str,
        cat_col: Dict, num_col: Dict,
        all_columns: List[Dict]
    ) -> Optional[Dict[str, Any]]:
        """规则C：高基数TOP10排名"""
        cc = cat_col["name"]
        nc = num_col["name"]

        # 构建过滤：排除所有低基数列的汇总值，取最新时间
        where_clauses = self._build_aggregate_filters(all_columns, exclude=[cc, nc])
        # 如果有时间列，取最新年份
        time_filter = await self._latest_year_filter(duck, table_name, all_columns, exclude=[cc, nc])
        if time_filter:
            where_clauses.append(time_filter)

        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

        sql = f"""
            SELECT
                CAST({safe_id(cc)} AS VARCHAR) as cat_val,
                AVG(TRY_CAST({safe_id(nc)} AS DOUBLE)) as value_val
            FROM {safe_id(table_name)}
            {where_sql}
            GROUP BY CAST({safe_id(cc)} AS VARCHAR)
            HAVING AVG(TRY_CAST({safe_id(nc)} AS DOUBLE)) IS NOT NULL
               AND AVG(TRY_CAST({safe_id(nc)} AS DOUBLE)) > 0
            ORDER BY value_val DESC
            LIMIT 10
        """

        res = duck.execute_query(sql)
        if not res.get("success") or not res.get("data") or len(res["data"]) < 3:
            return None

        data = [
            {"x": str(r["cat_val"]), "y": self._round(r["value_val"])}
            for r in res["data"]
            if r.get("cat_val") and r.get("value_val") is not None
        ]
        if len(data) < 3:
            return None

        top1 = data[0]
        year_hint = f"（最新年份）" if time_filter else ""
        summary = f"{nc}最高的{cc}TOP10{year_hint}：第1名「{top1['x']}」({top1['y']:.2f})"
        if len(data) >= 2:
            ratio = top1["y"] / data[-1]["y"] if data[-1]["y"] and data[-1]["y"] != 0 else None
            if ratio:
                summary += f"，是第{len(data)}名的{ratio:.1f}倍"

        return {
            "id": f"top10_{cc}_{nc}",
            "type": "bar",
            "title": f"{nc} TOP10（按{cc}）",
            "x_col": cc,
            "y_col": nc,
            "source_columns": [cc, nc],
            "filters": self._describe_filters(all_columns, [cc, nc]) + (f", 最新年份" if time_filter else ""),
            "data": data,
            "summary": summary,
            "_rule": "C",
            "_sql": sql.strip(),
            "_computation": f"SUM({nc}) per {cc}, ORDER BY DESC, LIMIT 10 → 第1名={top1['x']}({top1['y']:.2f})",
        }

    async def _grouped_trend(
        self, duck, table_name: str,
        time_col: Dict, cat_col: Dict, num_col: Dict,
        all_columns: List[Dict],
        exclude_aggregate: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """规则D：分组趋势"""
        tc = time_col["name"]
        cc = cat_col["name"]
        nc = num_col["name"]

        where_clauses = self._build_aggregate_filters(all_columns, exclude=[tc, cc, nc])
        if exclude_aggregate:
            safe_val = exclude_aggregate.lower().replace("'", "''")
            where_clauses.append(
                f"LOWER(TRIM(CAST({safe_id(cc)} AS VARCHAR))) != '{safe_val}'"
            )

        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

        sql = f"""
            SELECT
                TRY_CAST({safe_id(tc)} AS INTEGER) as time_val,
                CAST({safe_id(cc)} AS VARCHAR) as cat_val,
                AVG(TRY_CAST({safe_id(nc)} AS DOUBLE)) as value_val
            FROM {safe_id(table_name)}
            {where_sql}
            GROUP BY TRY_CAST({safe_id(tc)} AS INTEGER), CAST({safe_id(cc)} AS VARCHAR)
            HAVING AVG(TRY_CAST({safe_id(nc)} AS DOUBLE)) IS NOT NULL
            ORDER BY time_val, cat_val
        """

        res = duck.execute_query(sql)
        if not res.get("success") or not res.get("data") or len(res["data"]) < 6:
            return None

        # 组织成分组数据
        groups: Dict[str, List] = {}
        for r in res["data"]:
            if r.get("cat_val") and r.get("time_val") and r.get("value_val") is not None:
                g = str(r["cat_val"])
                if g not in groups:
                    groups[g] = []
                groups[g].append({"x": int(r["time_val"]), "y": self._round(r["value_val"])})

        if len(groups) < 2:
            return None

        return {
            "id": f"grouped_{cc}_{nc}",
            "type": "multi_line",
            "title": f"{nc}按{cc}分组趋势",
            "x_col": tc,
            "y_col": nc,
            "group_col": cc,
            "source_columns": [tc, cc, nc],
            "filters": self._describe_filters(all_columns, [tc, cc, nc]),
            "data": groups,
            "summary": f"按{cc}分{len(groups)}组的{nc}随时间变化趋势",
            "_rule": "D",
            "_sql": sql.strip(),
            "_computation": f"AVG({nc}) per {cc} per {tc} → {len(groups)} groups",
        }

    async def _category_distribution(
        self, duck, table_name: str,
        cat_col: Dict, all_columns: List[Dict],
        exclude_aggregate: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """规则F：纯分类表的COUNT分布分析（无数值指标时的兜底）"""
        cc = cat_col["name"]

        # 构建过滤条件
        where_clauses = self._build_aggregate_filters(all_columns, exclude=[cc])
        if exclude_aggregate:
            safe_val = exclude_aggregate.lower().replace("'", "''")
            where_clauses.append(
                f"LOWER(TRIM(CAST({safe_id(cc)} AS VARCHAR))) != '{safe_val}'"
            )

        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

        sql = f"""
            SELECT
                CAST({safe_id(cc)} AS VARCHAR) as cat_val,
                COUNT(*) as cnt
            FROM {safe_id(table_name)}
            {where_sql}
            GROUP BY CAST({safe_id(cc)} AS VARCHAR)
            ORDER BY cnt DESC
            LIMIT 15
        """

        res = duck.execute_query(sql)
        if not res.get("success") or not res.get("data") or len(res["data"]) < 2:
            return None

        data = [
            {"x": str(r["cat_val"]), "y": int(r.get("cnt", 0)), "n": int(r.get("cnt", 0))}
            for r in res["data"]
            if r.get("cat_val") is not None
        ]
        if len(data) < 2:
            return None

        total = sum(d["y"] for d in data)
        top = data[0]
        top_pct = top["y"] / total * 100 if total > 0 else 0
        summary = f"{cc}分布：「{top['x']}」最多({top['y']}条，占{top_pct:.1f}%)，共{len(data)}个类别"

        return {
            "id": f"distribution_{cc}",
            "type": "bar",
            "title": f"{cc}分布（数量统计）",
            "x_col": cc,
            "y_col": "count",
            "source_columns": [cc],
            "filters": self._describe_filters(all_columns, [cc]),
            "data": data,
            "summary": summary,
            "_rule": "F",
            "_sql": sql.strip(),
            "_computation": f"COUNT(*) per {cc} → top={top['x']}({top['y']}条, {top_pct:.1f}%), total={total}",
        }

    async def _correlation(
        self, duck, table_name: str,
        col_a: Dict, col_b: Dict
    ) -> Optional[Dict[str, Any]]:
        """规则E：两数值列相关性"""
        na = col_a["name"]
        nb = col_b["name"]

        sql = f"""
            SELECT CORR(TRY_CAST({safe_id(na)} AS DOUBLE), TRY_CAST({safe_id(nb)} AS DOUBLE)) as corr_val
            FROM {safe_id(table_name)}
            WHERE TRY_CAST({safe_id(na)} AS DOUBLE) IS NOT NULL
              AND TRY_CAST({safe_id(nb)} AS DOUBLE) IS NOT NULL
        """
        res = duck.execute_query(sql)
        if not res.get("success") or not res.get("data"):
            return None

        corr = res["data"][0].get("corr_val")
        if corr is None or math.isnan(float(corr)):
            return None

        corr = round(float(corr), 4)
        strength = "强" if abs(corr) > 0.7 else ("中等" if abs(corr) > 0.4 else "弱")
        direction = "正" if corr > 0 else "负"
        summary = f"「{na}」与「{nb}」存在{strength}{direction}相关（r={corr}）"

        return {
            "id": f"corr_{na}_{nb}",
            "type": "correlation",
            "title": f"{na} vs {nb} 相关性",
            "col_a": na,
            "col_b": nb,
            "source_columns": [na, nb],
            "correlation": corr,
            "strength": strength,
            "direction": direction,
            "summary": summary,
            "_rule": "E",
            "_sql": sql.strip(),
            "_computation": f"CORR({na}, {nb}) = {corr} ({strength}{direction}相关)",
        }

    def _build_aggregate_filters(
        self, all_columns: List[Dict], exclude: List[str] = None
    ) -> List[str]:
        """
        为所有含汇总值的低基数列，生成过滤条件（排除汇总行）。
        比如 sex列有aggregate_value=both → WHERE sex != 'both'
        """
        exclude = exclude or []
        clauses = []
        for col in all_columns:
            col_name = col.get("name", "")
            if col_name in exclude:
                continue
            agg_val = col.get("aggregate_value")
            if agg_val:
                clauses.append(
                    f"LOWER(TRIM(CAST({safe_id(col_name)} AS VARCHAR))) != '{agg_val.lower()}'"
                )
        return clauses

    def _describe_filters(self, all_columns: List[Dict], exclude: List[str] = None) -> str:
        """生成人类可读的过滤说明"""
        exclude = exclude or []
        parts = []
        for col in all_columns:
            col_name = col.get("name", "")
            if col_name in exclude:
                continue
            agg_val = col.get("aggregate_value")
            if agg_val:
                parts.append(f"{col_name}={agg_val}")
        return ", ".join(parts) if parts else "全量数据"

    async def _latest_year_filter(
        self, duck, table_name: str,
        all_columns: List[Dict], exclude: List[str] = None
    ) -> Optional[str]:
        """获取最新年份的过滤条件"""
        exclude = exclude or []
        time_cols = [c for c in all_columns if c.get("type") == "time" and c["name"] not in exclude]
        if not time_cols:
            return None
        tc = time_cols[0]["name"]
        sql = f'SELECT MAX(TRY_CAST({safe_id(tc)} AS INTEGER)) as max_year FROM {safe_id(table_name)}'
        res = duck.execute_query(sql)
        if res.get("success") and res.get("data"):
            max_year = res["data"][0].get("max_year")
            if max_year:
                return f'TRY_CAST({safe_id(tc)} AS INTEGER) = {max_year}'
        return None

    async def discuss(
        self,
        context: str,
        precomputed: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        讨论室模式（首发）：老林基于预计算结果汇报发现。
        像开会一样说话，不是写报告。

        Args:
            context: discussion_context构建的纯文本上下文
            precomputed: analyze()产生的完整结果（工作产物，不放context）

        Returns:
            {"message": str, "mentions": list, "triggers": list}
        """
        from ..utils import llm

        # 从预计算中提取摘要（注入prompt但不放context）
        summary = self._discuss_precomputed_summary(precomputed)

        # 自进化：注入历史经验
        from .agent_memory import get_agent_memory
        experience = get_agent_memory().build_experience_prompt("老林")

        prompt = f"""你是数据分析师"老林"。你已对数据做过预计算，现在向团队汇报发现。
{experience}
讨论上下文：
{context}

你的预计算结果摘要（只展示关键数字，不要复述）：
{summary}

规则：
1. 以 @引用 开头，引用讨论中的发现或用户的问题
2. 只展示关键数字和趋势，不展示完整表格和SQL
3. 像开会汇报一样说话，不要输出"洞察1""洞察2"格式
4. 如果被质检质疑，用数据反驳或承认修正
5. 发言末尾设置triggers，通常是["质检官"]（让别人审核你的分析）
6. 如果分析中发现需要补充查询，设置 need_sql + sql + reason 字段
7. 发言控制在3-5句话

请输出JSON格式：
{{"message": "你的发言", "mentions": ["引用了谁"], "triggers": ["下一步谁"]}}
如果需要补充SQL：
{{"message": "你的发言", "mentions": ["引用了谁"], "triggers": ["下一步谁"], "need_sql": true, "sql": "SELECT ...", "reason": "为什么需要这个查询"}}
只输出JSON。"""

        try:
            raw = await llm.chat([{"role": "user", "content": prompt}], temperature=0.4)
            return self._parse_discuss_output(raw)
        except Exception as e:
            logger.error(f"[老林] 讨论发言失败: {e}")
            return {
                "message": f"[系统] 老林发言失败: {str(e)}",
                "mentions": [],
                "triggers": []
            }

    async def discuss_supplement(
        self,
        context: str,
        precomputed: Dict[str, Any],
        supplement_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        讨论室模式（补充SQL后）：老林基于新查询结果补充发言。
        被 need_sql 机制触发。

        Args:
            context: discussion_context构建的纯文本上下文
            precomputed: 含补充数据的完整结果
            supplement_key: 补充数据的key（如 "supplement_0"）
        """
        from ..utils import llm

        # 提取补充数据
        supplement_data = None
        if supplement_key and precomputed:
            supplement_data = precomputed.get(supplement_key)
        elif precomputed:
            # 取最后一个supplement
            keys = [k for k in precomputed if k.startswith("supplement_")]
            if keys:
                supplement_data = precomputed[keys[-1]]

        supplement_str = "（无补充数据）"
        if supplement_data:
            if isinstance(supplement_data, dict):
                query = supplement_data.get("query", "")
                result = supplement_data.get("result", [])
                supplement_str = f"SQL: {query}\n结果: {result[:10]}"
            else:
                supplement_str = str(supplement_data)

        prompt = f"""你是数据分析师"老林"。你的补充SQL已执行，新结果已更新。

讨论上下文：
{context}

补充查询结果：
{supplement_str}

规则：
1. 以 @引用 开头
2. 基于新数据发言，只展示关键数字
3. 像开会一样说话
4. 如果结果验证了你之前的结论，说出来
5. triggers 设为空（补充完就结束了）

请输出JSON格式：
{{"message": "你的发言", "mentions": ["引用了谁"], "triggers": []}}
只输出JSON。"""

        try:
            raw = await llm.chat([{"role": "user", "content": prompt}], temperature=0.4)
            result = self._parse_discuss_output(raw)
            if result:
                # 补充模式强制清空triggers
                result["triggers"] = []
            return result
        except Exception as e:
            logger.error(f"[老林] 补充发言失败: {e}")
            return {
                "message": f"[系统] 老林补充发言失败: {str(e)}",
                "mentions": [],
                "triggers": []
            }

    def _discuss_precomputed_summary(self, precomputed: Dict[str, Any]) -> str:
        """从预计算结果提取讨论所需的摘要"""
        if not precomputed:
            return "（暂无预计算结果）"

        analyses = precomputed.get("analyses", [])
        if not analyses:
            return "（预计算未产出分析结果）"

        parts = []
        for a in analyses[:6]:
            rule = a.get("_rule", "?")
            title = a.get("title", "")
            summary = a.get("summary", "")
            parts.append(f"  [{rule}] {title}: {summary}")

        result = f"共{len(analyses)}项分析:\n" + "\n".join(parts)
        if len(analyses) > 6:
            result += f"\n  ...(共{len(analyses)}项)"
        return result

    def _parse_discuss_output(self, raw: str) -> Dict[str, Any]:
        """解析老林的讨论输出JSON"""
        import json as _json
        if not raw:
            return None

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
                return parsed
        except _json.JSONDecodeError:
            pass

        return {"message": raw, "mentions": [], "triggers": ["质检官"]}

    def _check_retry_needed(self, columns: List[Dict], analyses: List[Dict]) -> bool:
        """检查是否需要退回老陈重新分析"""
        # 如果有numeric列但所有numeric列的max值为0或None，说明类型识别可能有误
        numeric_cols = [c for c in columns if c.get("type") == "numeric"]
        for col in numeric_cols:
            stats = col.get("stats") or {}
            if stats.get("max") is None or stats.get("max") == 0:
                logger.warning(f"[老林] 列「{col['name']}」数值统计异常，建议老陈重新检查")
                return True
        return False

    def _make_summary(self, analyses: List[Dict], shape: List[int]) -> str:
        """生成总体分析摘要"""
        if not analyses:
            return f"共{shape[0]}行数据，未发现明显规律"
        summaries = [a.get("summary", "") for a in analyses if a.get("summary")]
        return f"发现{len(analyses)}项规律：" + "；".join(summaries[:3])

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


# 单例
_lin_instance: Optional[DataAnalyst] = None

def get_lin() -> DataAnalyst:
    global _lin_instance
    if _lin_instance is None:
        _lin_instance = DataAnalyst()
    return _lin_instance
