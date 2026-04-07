"""
老王 - 预测师 (Forecaster)
===================================

职责：拿到老林的趋势数据，判断能不能预测，能就算未来3期。
特点：纯代码实现线性回归，R²判断质量，不强行预测。

输入：老林的analyses（只处理type=line的）
输出：追加forecast字段到老林的analyses

预测规则：
1. 数据点 >= 8 才考虑预测
2. R² >= 0.3 才认为趋势明显，值得预测
3. 预测3期（通常是3年）
4. 置信度：R²>=0.7高，R²>=0.5中高，R²>=0.3中

回退机制：如果发现老林的趋势数据有异常点（偏差>3σ），通知老林核实
"""

import logging
import math
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger(__name__)

MIN_DATA_POINTS = 8   # 最少数据点
MIN_R2 = 0.3          # 最低R²才预测
FORECAST_PERIODS = 3  # 预测3期


class Forecaster:
    """老王 - 预测师：只做线性回归预测，不越界"""

    def __init__(self):
        self.name = "老王"
        self.role = "预测师"
        logger.info(f"🔮 {self.name}({self.role}) 上线")

    async def forecast(self, lin_result: Dict[str, Any]) -> Dict[str, Any]:
        """
        对老林输出的趋势图表追加预测。

        Returns:
            lin_result（原地修改，追加forecast字段），并附带摘要
        """
        analyses = lin_result.get("analyses", [])
        forecasted_count = 0
        anomalies_found = []
        decisions = []   # 老王的决策日志

        # 检查是否有时间趋势可以预测
        line_analyses = [a for a in analyses if a.get("type") == "line"]
        if not line_analyses:
            no_time_reason = "数据不含时间维度，无法执行趋势预测"
            decisions.append(no_time_reason)
            decisions.append("已通知小李在报告中标注「本数据无时间维度，不含预测部分」")
            logger.info(f"[老王] {no_time_reason}")
            lin_result["_forecaster_summary"] = {
                "forecasted": 0,
                "skip_reason": no_time_reason,
                "anomalies": [],
                "decisions": decisions,
                "_agent": self.name
            }
            return lin_result

        for analysis in analyses:
            if analysis.get("type") not in ("line",):
                continue
            data = analysis.get("data", [])
            if not data:
                continue

            # 提取时间序列
            points = [(p["x"], p["y"]) for p in data if p.get("x") is not None and p.get("y") is not None]
            if len(points) < MIN_DATA_POINTS:
                analysis["forecast"] = {
                    "available": False,
                    "reason": f"数据点不足（{len(points)}个，需要至少{MIN_DATA_POINTS}个）"
                }
                decisions.append(f"「{analysis.get('title', analysis['id'])}」跳过预测：{analysis['forecast']['reason']}")
                continue

            # 检测异常点（超出3σ）
            anomalies = self._detect_anomalies(points)
            if anomalies:
                anomalies_found.extend([
                    f"老林的「{analysis.get('title', analysis['id'])}」在{x}年有异常值({y:.2f})"
                    for x, y in anomalies
                ])

            # 线性回归
            slope, intercept, r2 = self._linear_regression(points)

            if r2 < MIN_R2:
                analysis["forecast"] = {
                    "available": False,
                    "reason": f"趋势不明显（R²={r2:.2f}，需要>={MIN_R2}）",
                    "r_squared": round(r2, 4)
                }
                decisions.append(f"「{analysis.get('title', analysis['id'])}」趋势不明显，跳过预测（R²={r2:.2f}）")
                continue

            # 生成预测
            last_x = max(p[0] for p in points)
            next_xs = [last_x + i + 1 for i in range(FORECAST_PERIODS)]
            predictions = [
                {
                    "x": x,
                    "y": self._round(slope * x + intercept),
                    "type": "predicted"
                }
                for x in next_xs
            ]

            confidence = "高" if r2 >= 0.7 else ("中高" if r2 >= 0.5 else "中")

            analysis["forecast"] = {
                "available": True,
                "method": "linear_regression",
                "r_squared": round(r2, 4),
                "slope": self._round(slope),
                "predictions": predictions,
                "confidence": confidence,
                "period_hint": f"{next_xs[0]}—{next_xs[-1]}"
            }

            # 在原数据末尾追加预测点（前端统一展示）
            for pred in predictions:
                analysis["data"].append(pred)

            forecasted_count += 1
            decisions.append(
                f"「{analysis.get('title', analysis['id'])}」预测完成：R²={r2:.3f}，"
                f"置信度{confidence}，预测{next_xs[0]}年→{predictions[0]['y']}"
            )
            logger.info(
                f"[老王] 「{analysis['id']}」预测完成: R²={r2:.3f}, 置信度={confidence}, "
                f"预测{next_xs[0]}→{predictions[0]['y']}"
            )

        if not decisions:
            decisions.append("所有趋势序列均不满足预测条件（数据点不足或趋势不明显）")

        logger.info(f"[老王] 完成: {forecasted_count}个趋势已预测, 发现{len(anomalies_found)}个异常点")
        lin_result["_forecaster_summary"] = {
            "forecasted": forecasted_count,
            "anomalies": anomalies_found,
            "decisions": decisions,
            "_agent": self.name
        }
        return lin_result

    def _linear_regression(self, points: List[Tuple[float, float]]) -> Tuple[float, float, float]:
        """
        简单线性回归：返回(slope, intercept, R²)
        使用最小二乘法，不依赖numpy（避免导入问题）
        """
        n = len(points)
        if n < 2:
            return 0.0, 0.0, 0.0

        xs = [p[0] for p in points]
        ys = [p[1] for p in points]

        # 归一化x（避免大数精度问题）
        x_min = min(xs)
        xs_norm = [x - x_min for x in xs]

        sum_x = sum(xs_norm)
        sum_y = sum(ys)
        sum_xy = sum(x * y for x, y in zip(xs_norm, ys))
        sum_x2 = sum(x * x for x in xs_norm)

        denom = n * sum_x2 - sum_x * sum_x
        if abs(denom) < 1e-10:
            return 0.0, sum_y / n, 0.0

        slope = (n * sum_xy - sum_x * sum_y) / denom
        intercept = (sum_y - slope * sum_x) / n

        # 实际的intercept（考虑归一化偏移）
        real_intercept = intercept - slope * x_min

        # 计算R²
        y_mean = sum_y / n
        ss_tot = sum((y - y_mean) ** 2 for y in ys)
        ss_res = sum((y - (slope * (x - x_min) + intercept)) ** 2 for x, y in zip(xs, ys))

        if ss_tot < 1e-10:
            r2 = 1.0
        else:
            r2 = max(0.0, 1.0 - ss_res / ss_tot)

        return slope, real_intercept, r2

    def _detect_anomalies(
        self, points: List[Tuple[float, float]], sigma: float = 3.0
    ) -> List[Tuple[float, float]]:
        """检测3σ以外的异常点"""
        ys = [p[1] for p in points]
        n = len(ys)
        if n < 4:
            return []

        mean = sum(ys) / n
        variance = sum((y - mean) ** 2 for y in ys) / n
        std = math.sqrt(variance) if variance > 0 else 0

        if std < 1e-10:
            return []

        return [(x, y) for x, y in points if abs(y - mean) > sigma * std]

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
_wang_instance: Optional[Forecaster] = None

def get_wang() -> Forecaster:
    global _wang_instance
    if _wang_instance is None:
        _wang_instance = Forecaster()
    return _wang_instance
