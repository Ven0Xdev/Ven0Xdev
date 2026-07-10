from __future__ import annotations

import numpy as np


def compute_liquidity_score(
    avg_dollar_volume_20d: float,
    spread_pct: float,
    relative_volume: float,
    float_shares: float,
) -> tuple[float, dict]:
    """0-100 liquidity score. Rewards high, stable dollar volume and tight
    spreads; penalizes wide spreads and razor-thin floats that make position
    entry/exit costly for real size.
    """
    volume_score = float(np.clip(np.log10(max(avg_dollar_volume_20d, 1)) / 7 * 100, 0, 100))
    spread_score = float(np.clip(100 - spread_pct * 4, 0, 100))
    float_score = float(np.clip(np.log10(max(float_shares, 1)) / 8.5 * 100, 0, 100))
    stability_score = float(np.clip(100 - abs(relative_volume - 1) * 25, 0, 100))

    weights = {"volume": 0.4, "spread": 0.3, "float": 0.2, "stability": 0.1}
    total = (
        volume_score * weights["volume"]
        + spread_score * weights["spread"]
        + float_score * weights["float"]
        + stability_score * weights["stability"]
    )
    return float(np.clip(total, 0, 100)), {
        "volume_score": volume_score,
        "spread_score": spread_score,
        "float_score": float_score,
        "stability_score": stability_score,
    }
