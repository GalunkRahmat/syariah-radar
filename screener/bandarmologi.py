"""
Bandarmologi & Smart Money Flow Analysis Module
Analyzes institutional accumulation/distribution patterns for Indonesian Stocks.
"""

from typing import Dict, Any
import numpy as np
import pandas as pd


def analyze_bandarmologi(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Performs volume price analysis (VPA) and Smart Money tracking.
    Evaluates institutional accumulation vs distribution.
    """
    if df is None or len(df) < 20:
        return {
            "status": "NEUTRAL",
            "label": "Netral",
            "score": 50,
            "badge_color": "gray",
            "reasons": ["Data historis terbatas"]
        }

    latest = df.iloc[-1]
    last_5 = df.tail(5)

    close = float(latest['Close'])
    open_p = float(latest['Open'])
    high = float(latest['High'])
    low = float(latest['Low'])
    volume = float(latest['Volume'])
    vol_ratio = float(latest.get('Vol_Ratio', 1.0))
    mfi = float(latest.get('MFI14', 50.0))

    # 1. 20-Day VWAP Calculation (Benchmark Modal Rata-rata Pelaku Pasar)
    typical_prices = (df['High'] + df['Low'] + df['Close']) / 3
    cum_vol_price = (typical_prices * df['Volume']).rolling(20).sum()
    cum_vol = df['Volume'].rolling(20).sum()
    vwap_20 = float(cum_vol_price.iloc[-1] / cum_vol.iloc[-1]) if cum_vol.iloc[-1] > 0 else close

    price_vs_vwap_pct = round(((close - vwap_20) / vwap_20) * 100, 2)

    # 2. Cumulative Buying vs Selling Pressure (5-Day Flow Proxy)
    # Price close above midpoint indicates net buying pressure
    mid_points = (last_5['High'] + last_5['Low']) / 2
    buy_vol_weight = np.where(last_5['Close'] >= mid_points, last_5['Volume'], 0)
    total_5d_vol = last_5['Volume'].sum()
    buy_vol_pct = (buy_vol_weight.sum() / total_5d_vol * 100) if total_5d_vol > 0 else 50.0

    # 3. Volume Absorption & Mark-up Detection
    candle_range = (high - low) if (high - low) > 0 else 1
    lower_shadow = (min(open_p, close) - low)
    lower_shadow_ratio = lower_shadow / candle_range

    has_absorption = (vol_ratio >= 1.5) and (lower_shadow_ratio >= 0.35)
    is_markup = (close > open_p) and (vol_ratio >= 1.3) and (close >= high * 0.98)

    # 4. Evaluate Bandarmologi Status
    reasons = []
    bandar_score = 50

    if has_absorption:
        bandar_score += 30
        reasons.append("Volume Absorption: Bandar melakukan penampungan barang masif di harga bawah")
    elif is_markup:
        bandar_score += 25
        reasons.append("Active Mark-Up: Tekanan beli agresif mendorong harga naik dengan volume tinggi")

    if mfi >= 55:
        bandar_score += 15
        reasons.append(f"Money Flow Index Kuat ({mfi:.1f}): Aliran uang institusi masuk secara konsisten")
    elif mfi >= 45:
        bandar_score += 5
        reasons.append(f"Money Flow Index Sehat ({mfi:.1f}): Ada akumulasi wajar")
    elif mfi < 30:
        bandar_score -= 15
        reasons.append(f"Money Flow Lemah ({mfi:.1f}): Terjadi arus keluar dana")

    if buy_vol_pct >= 65:
        bandar_score += 10
        reasons.append(f"Dominasi Beli 5 Hari: {buy_vol_pct:.0f}% volume didominasi oleh pembeli")
    elif buy_vol_pct <= 35:
        bandar_score -= 10
        reasons.append(f"Dominasi Jual 5 Hari: {100-buy_vol_pct:.0f}% volume didominasi penjual")

    if close >= vwap_20:
        bandar_score += 5
        reasons.append(f"Harga berada di atas rata-rata modal 20-hari (VWAP Rp {vwap_20:,.0f})")

    # Status Classification
    if bandar_score >= 80:
        status = "BIG_ACCUMULATION"
        label = "Akumulasi Jumbo"
        badge_color = "emerald"
    elif bandar_score >= 65:
        status = "ACCUMULATION"
        label = "Akumulasi Sedang"
        badge_color = "blue"
    elif bandar_score >= 45:
        status = "NEUTRAL"
        label = "Netral"
        badge_color = "gray"
    else:
        status = "DISTRIBUTION"
        label = "Distribusi"
        badge_color = "red"

    return {
        "status": status,
        "label": label,
        "score": min(bandar_score, 100),
        "badge_color": badge_color,
        "vwap_20": round(vwap_20, 1),
        "price_vs_vwap_pct": price_vs_vwap_pct,
        "buy_volume_pct_5d": round(buy_vol_pct, 1),
        "has_absorption": has_absorption,
        "reasons": reasons
    }
