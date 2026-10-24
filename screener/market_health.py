"""
Market Health Barometer (IHSG & Syariah Market Traffic Light Engine)
Evaluates macro-market conditions using:
1. IHSG Index Trend (Position vs MA20, MA50, MA200)
2. Market Breadth (% of Syariah Stocks above MA20, MA50, MA200)
3. Institutional & Foreign Flow Breadth (% of Stocks in Accumulation)
Provides actionable capital allocation & risk regimes:
- BULLISH / AGGRESSIVE (Green): 100% Capital, optimal swing breakouts
- CAUTION / NEUTRAL (Yellow): Max 50% Capital, selective Grade A+ only
- DEFENSIVE / CASH IS KING (Red): Hold Cash >= 80%, stop aggressive buying
"""

import os
import pickle
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Dict, Any, List, Optional
import pandas as pd
import yfinance as yf

from screener.data_fetcher import get_latest_trading_date, PROJECT_ROOT, CACHE_DIR
from screener.indicators import enrich_with_indicators


def get_ihsg_cache_path(today_str: str) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR / f"ihsg_data_{today_str}.pkl"


def fetch_ihsg_data(force_refresh: bool = False) -> Optional[pd.DataFrame]:
    """
    Fetches 1 year of daily historical data for IHSG (^JKSE) with local disk caching.
    """
    trading_date = get_latest_trading_date()
    today_str = trading_date.strftime("%Y-%m-%d")
    cache_file = get_ihsg_cache_path(today_str)

    # 1. Check cache
    if not force_refresh and cache_file.exists():
        try:
            with open(cache_file, "rb") as f:
                df = pickle.load(f)
                if df is not None and not df.empty:
                    return df
        except Exception as e:
            print(f"[IHSG CACHE WARN] Failed to load cache: {e}")

    # 2. Download from Yahoo Finance
    try:
        ihsg = yf.Ticker("^JKSE")
        df = ihsg.history(period="1y", auto_adjust=False)
        if df is not None and not df.empty and len(df) >= 20:
            df = df.dropna(subset=["Close"])
            df = df[["Open", "High", "Low", "Close", "Volume"]].astype(float)
            df = enrich_with_indicators(df)

            # Save cache
            try:
                with open(cache_file, "wb") as f:
                    pickle.dump(df, f)
            except Exception as ce:
                print(f"[IHSG CACHE WARN] Failed to write cache: {ce}")

            return df
    except Exception as err:
        print(f"[IHSG FETCH ERROR] Failed to download ^JKSE: {err}")

    return None


def calculate_market_health(
    market_data: Dict[str, pd.DataFrame],
    all_stocks: List[dict],
    all_candidates: List[dict],
    force_refresh: bool = False
) -> Dict[str, Any]:
    """
    Calculates the composite Market Health Barometer (0 - 100) and traffic light regime.
    """
    # 1. Evaluate IHSG Index
    ihsg_df = fetch_ihsg_data(force_refresh=force_refresh)
    ihsg_metrics = {}

    if ihsg_df is not None and not ihsg_df.empty and len(ihsg_df) >= 20:
        c_last = float(ihsg_df["Close"].iloc[-1])
        c_prev = float(ihsg_df["Close"].iloc[-2]) if len(ihsg_df) >= 2 else c_last
        chg_pct = round(((c_last - c_prev) / c_prev) * 100, 2)

        ma20 = float(ihsg_df["MA20"].iloc[-1]) if "MA20" in ihsg_df else float(ihsg_df["Close"].rolling(20).mean().iloc[-1])
        ma50 = float(ihsg_df["MA50"].iloc[-1]) if "MA50" in ihsg_df else float(ihsg_df["Close"].rolling(min(len(ihsg_df), 50)).mean().iloc[-1])
        ma200 = float(ihsg_df["MA200"].iloc[-1]) if "MA200" in ihsg_df else float(ihsg_df["Close"].rolling(min(len(ihsg_df), 200)).mean().iloc[-1])

        above_ma20 = bool(c_last > ma20)
        above_ma50 = bool(c_last > ma50)
        above_ma200 = bool(c_last > ma200)

        ihsg_metrics = {
            "close": round(c_last, 2),
            "close_fmt": f"{c_last:,.2f}".replace(",", "_").replace(".", ",").replace("_", "."),
            "change_pct": chg_pct,
            "ma20": round(ma20, 2),
            "ma50": round(ma50, 2),
            "ma200": round(ma200, 2),
            "above_ma20": above_ma20,
            "above_ma50": above_ma50,
            "above_ma200": above_ma200
        }
    else:
        # Fallback if Yahoo Finance ^JKSE is unreachable
        ihsg_metrics = {
            "close": 0,
            "close_fmt": "-",
            "change_pct": 0,
            "ma20": 0,
            "ma50": 0,
            "ma200": 0,
            "above_ma20": False,
            "above_ma50": False,
            "above_ma200": False
        }

    # 2. Market Breadth across 75 Syariah stocks
    total_stocks = len(all_stocks) if all_stocks else len(market_data)
    if total_stocks == 0:
        total_stocks = 1

    above_ma20_count = 0
    above_ma50_count = 0
    above_ma200_count = 0
    accum_count = 0
    foreign_accum_count = 0

    for s in all_stocks:
        price = s.get("price", 0)
        ma20 = s.get("ma20", 0)
        ma50 = s.get("ma50", 0)
        ma200 = s.get("ma200", 0)

        if price > ma20 and ma20 > 0:
            above_ma20_count += 1
        if price > ma50 and ma50 > 0:
            above_ma50_count += 1
        if price > ma200 and ma200 > 0:
            above_ma200_count += 1

        bandar = s.get("bandarmologi", {})
        if bandar.get("status") in ["BIG_ACCUMULATION", "ACCUMULATION"] or s.get("bandar_score", 0) >= 65:
            accum_count += 1

        ff = s.get("foreign_flow", {})
        if ff.get("is_accum"):
            foreign_accum_count += 1

    pct_above_ma20 = round((above_ma20_count / total_stocks) * 100, 1)
    pct_above_ma50 = round((above_ma50_count / total_stocks) * 100, 1)
    pct_above_ma200 = round((above_ma200_count / total_stocks) * 100, 1)
    pct_accum = round((accum_count / total_stocks) * 100, 1)
    pct_foreign_accum = round((foreign_accum_count / total_stocks) * 100, 1)

    # 3. Compute Composite Health Score (0 - 100)
    score = 0

    # Component A: IHSG Index Position (Max 40 pts)
    if ihsg_metrics.get("above_ma200"):
        score += 15
    if ihsg_metrics.get("above_ma50"):
        score += 15
    if ihsg_metrics.get("above_ma20"):
        score += 10

    # Fallback if IHSG index symbol returned 0: estimate from breadth
    if ihsg_metrics.get("close") == 0:
        if pct_above_ma50 >= 50:
            score += 25
        elif pct_above_ma50 >= 30:
            score += 15

    # Component B: Market Breadth (Max 35 pts)
    if pct_above_ma50 >= 60:
        score += 20
    elif pct_above_ma50 >= 45:
        score += 14
    elif pct_above_ma50 >= 30:
        score += 8
    else:
        score += 3

    if pct_above_ma200 >= 50:
        score += 15
    elif pct_above_ma200 >= 35:
        score += 10
    else:
        score += 4

    # Component C: Smart Money & Flow (Max 25 pts)
    if pct_accum >= 40:
        score += 15
    elif pct_accum >= 25:
        score += 10
    else:
        score += 4

    if pct_foreign_accum >= 30:
        score += 10
    elif pct_foreign_accum >= 15:
        score += 6
    else:
        score += 2

    score = min(max(score, 10), 100)

    # 4. Traffic Light Regime Classification
    if score >= 68:
        regime = "BULLISH"
        color = "emerald"
        label = "Kondisi Prima (Pasar Bullish)"
        icon = "fa-circle-check"
        badge = "🟢 SANGAT SEHAT"
        allocation_pct = 100
        cash_pct = 0
        guidance = "IHSG dan mayoritas saham syariah dalam tren naik kuat di atas MA50. Akurasi swing breakout & pullback sangat tinggi. Boleh gunakan alokasi modal penuh (100%) dengan disiplin Stop Loss normal."
        action_title = "Gaspol Belanja 100% Modal"
    elif score >= 42:
        regime = "NEUTRAL"
        color = "amber"
        label = "Konsolidasi / Waspada"
        icon = "fa-triangle-exclamation"
        badge = "🟡 KONSOLIDASI"
        allocation_pct = 50
        cash_pct = 50
        guidance = "IHSG sedang sideway atau menguji support penting. Pasar rawan false-break. Hanya pilih saham Grade A+ dengan akumulasi bandar terkuat, dan batasi modal aktif maksimal 50% (pegang 50% Cash)."
        action_title = "Selektif: Maks 50% Modal"
    else:
        regime = "BEARISH"
        color = "rose"
        label = "Defensive (Pasar Berisiko)"
        icon = "fa-hand"
        badge = "🔴 DEFENSIVE"
        allocation_pct = 20
        cash_pct = 80
        guidance = "Peringatan Risiko: Indeks patah tren & mayoritas saham tertekan distribusi. Jangan averaging down, tahan nafsu belanja, dan utamakan pegang uang tunai (Cash is King ≥ 80%)!"
        action_title = "Cash is King: Tahan Belanja"

    return {
        "score": score,
        "regime": regime,
        "color": color,
        "label": label,
        "badge": badge,
        "icon": icon,
        "allocation_pct": allocation_pct,
        "cash_pct": cash_pct,
        "guidance": guidance,
        "action_title": action_title,
        "ihsg": ihsg_metrics,
        "breadth": {
            "total_stocks": total_stocks,
            "above_ma20_count": above_ma20_count,
            "above_ma20_pct": pct_above_ma20,
            "above_ma50_count": above_ma50_count,
            "above_ma50_pct": pct_above_ma50,
            "above_ma200_count": above_ma200_count,
            "above_ma200_pct": pct_above_ma200,
            "accum_count": accum_count,
            "accum_pct": pct_accum,
            "foreign_accum_count": foreign_accum_count,
            "foreign_accum_pct": pct_foreign_accum
        }
    }
