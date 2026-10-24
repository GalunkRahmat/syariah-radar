"""
Screener Engine Module (3-Pillar Unified Screener)
Combines:
1. Technical Stage & Risk Protection (40%)
2. Bandarmologi & Smart Money Flow (35%)
3. Fundamental & Sharia Financial Health (25%)
"""

from typing import Dict, List, Any, Optional
import numpy as np
import pandas as pd
from screener.data_fetcher import load_sharia_stocks
from screener.bandarmologi import analyze_bandarmologi
from screener.fundamentals import load_fundamentals_cache, fetch_ticker_fundamentals
from screener.broker_summary import calculate_broker_summary


def evaluate_ticker(code: str, meta: dict, df: pd.DataFrame, fundamentals_cache: dict) -> dict | None:
    """
    Evaluates a single ticker across Technical, Bandarmologi, and Fundamental pillars.
    """
    if df is None or len(df) < 60:
        return None

    latest = df.iloc[-1]
    prev = df.iloc[-2]

    close = float(latest['Close'])
    open_p = float(latest['Open'])
    high = float(latest['High'])
    low = float(latest['Low'])
    volume = float(latest['Volume'])

    ma20 = float(latest.get('MA20', 0))
    ma50 = float(latest.get('MA50', 0))
    ma100 = float(latest.get('MA100', 0))
    ma200 = float(latest.get('MA200', 0))

    vol_ma20 = float(latest.get('Vol_MA20', 0))
    vol_ratio = float(latest.get('Vol_Ratio', 1.0))
    rsi = float(latest.get('RSI14', 50))
    atr = float(latest.get('ATR14', close * 0.03))

    stoch_k = float(latest.get('Stoch_K', 50))
    stoch_d = float(latest.get('Stoch_D', 50))
    prev_stoch_k = float(prev.get('Stoch_K', 50))
    prev_stoch_d = float(prev.get('Stoch_D', 50))

    mfi = float(latest.get('MFI14', 50))
    macd_hist = float(latest.get('MACD_Hist', 0))
    prev_macd_hist = float(prev.get('MACD_Hist', 0))

    lower_shadow_ratio = float(latest.get('Lower_Shadow_Ratio', 0.0))
    close_pos_in_range = float(latest.get('Close_Pos_In_Range', 0.5))
    is_green_candle = bool(latest.get('Is_Green_Candle', False))

    high_20d = float(latest.get('High_20d', high))
    low_20d = float(latest.get('Low_20d', low))
    ma200_slope = float(latest.get('MA200_Slope', 0.0))

    # Liquidity Filter: Minimum daily turnover Rp 1.5 Miliar
    turnover_idr = close * volume
    if turnover_idr < 1_500_000_000:
        return None

    # Trend structure
    is_ma_aligned = (ma50 > ma100 > ma200)
    is_above_ma50 = close > ma50
    is_above_ma200 = close > ma200
    is_ma200_healthy = ma200_slope >= -1.5

    # Candlestick Bottoming & Safety Confirmation
    has_hammer_rejection = (lower_shadow_ratio >= 0.35)
    has_strong_close = (close_pos_in_range >= 0.40)
    is_falling_knife = (not is_green_candle) and (close_pos_in_range < 0.20) and (not has_hammer_rejection)

    # Stochastic RSI & MACD Confirmation
    stoch_golden_cross = (prev_stoch_k <= prev_stoch_d) and (stoch_k > stoch_d) and (stoch_k <= 50)
    stoch_bullish_turn = (stoch_k > stoch_d) and (stoch_k <= 65)
    macd_turning_up = macd_hist > prev_macd_hist

    setup_type = None
    setup_name = None
    reasons = []
    safety_confirmations = []
    tech_score = 50

    # 1. SETUP: STAGE 2 BREAKOUT (Minervini)
    if is_ma_aligned and is_above_ma50 and is_above_ma200 and is_green_candle:
        near_resistance = close >= (high_20d * 0.985)
        if near_resistance:
            setup_type = "STAGE2_BREAKOUT"
            setup_name = "Stage 2 Breakout"
            tech_score = 85
            reasons.append("Struktur tren sempurna: MA50 > MA100 > MA200 (Stage 2 Uptrend)")
            reasons.append("Harga menembus / menguji Resistance 20-hari")
            if vol_ratio >= 1.25:
                tech_score += 10
                reasons.append(f"Volume meledak ({vol_ratio:.1f}x dari rata-rata)")
            if 50 <= rsi <= 75:
                tech_score += 5
                reasons.append(f"RSI Momentum ideal ({rsi:.1f})")

    # 2. SETUP: UPTREND PULLBACK / BUY ON WEAKNESS
    if setup_type is None and is_ma_aligned and is_above_ma200:
        if is_green_candle or has_hammer_rejection or has_strong_close:
            setup_type = "UPTREND_PULLBACK"
            setup_name = "Uptrend Pullback"
            tech_score = 80
            reasons.append("Struktur Uptrend utama solid: MA50 > MA100 > MA200")
            reasons.append("Harga kuat bertahan di atas MA200 (Long Term Bull Support)")
            if close >= ma50 * 0.95 and close <= ma50 * 1.05:
                reasons.append("Harga memantul di area support MA50")
                tech_score += 10
            elif close >= ma100 * 0.95 and close <= ma100 * 1.05:
                reasons.append("Harga memantul di area support MA100")
                tech_score += 5

    # 3. SETUP: RELATIVE STRENGTH LEADER
    if setup_type is None and is_above_ma200 and (ma50 > ma200):
        if is_green_candle or has_hammer_rejection or has_strong_close:
            setup_type = "RS_LEADER"
            setup_name = "Relative Strength Leader"
            tech_score = 75
            reasons.append("Saham lebih kuat dari pasar (Bertahan kokoh di atas MA200)")
            reasons.append("MA50 > MA200 (Golden Cross jangka panjang masih aktif)")

    # 4. SETUP: OVERSOLD REBOUND
    if setup_type is None and rsi <= 30.0 and turnover_idr >= 10_000_000_000:
        if is_falling_knife:
            return None
        setup_type = "OVERSOLD_REBOUND"
        setup_name = "Oversold Rebound"
        tech_score = 70
        reasons.append(f"RSI sangat oversold ({rsi:.1f} < 30) di saham berlikuiditas besar")
        reasons.append(f"Likuiditas jumbo ({turnover_idr/1e9:.1f} Miliar) - Minat beli tinggi di harga bawah")

    if setup_type is None:
        return None

    # Safety Indicator Confirmation Scoring
    if is_green_candle:
        tech_score += 5
        safety_confirmations.append("Candle Reversal: Ditutup hijau (Pembeli memenangkan sesi)")
    if has_hammer_rejection:
        tech_score += 8
        safety_confirmations.append(f"Pinbar/Hammer Rejection: Ekor bawah panjang ({lower_shadow_ratio*100:.0f}%) menolak penurunan")
    if stoch_golden_cross:
        tech_score += 8
        safety_confirmations.append("Stochastic RSI: Konfirmasi Golden Cross (%K melintas ke atas %D)")
    elif stoch_bullish_turn:
        tech_score += 4
        safety_confirmations.append("Stochastic RSI: Momentum mulai mengarah ke atas")
    if macd_turning_up:
        tech_score += 5
        safety_confirmations.append("MACD Histogram: Tekanan jual mulai mereda (melandai ke atas)")

    # -------------------------------------------------------------
    # PILLAR 2: BANDARMOLOGI & SMART MONEY FLOW
    # -------------------------------------------------------------
    bandar = analyze_bandarmologi(df)
    bandar_score = bandar.get("score", 50)
    for r in bandar.get("reasons", []):
        safety_confirmations.append(f"Bandarmologi: {r}")

    # -------------------------------------------------------------
    # PILLAR 3: FUNDAMENTAL SYARIAH HEALTH
    # -------------------------------------------------------------
    fund = fetch_ticker_fundamentals(code, fundamentals_cache)
    fund_score = fund.get("score", 50)

    # -------------------------------------------------------------
    # COMPOSITE SCORE (Teknikal 40% + Bandar 35% + Fundamental 25%)
    # -------------------------------------------------------------
    final_score = int(round((0.40 * tech_score) + (0.35 * bandar_score) + (0.25 * fund_score)))
    final_score = min(max(final_score, 10), 100)

    # Risk Level Determination
    if final_score >= 82 and (is_green_candle or has_hammer_rejection) and (setup_type in ["STAGE2_BREAKOUT", "UPTREND_PULLBACK", "RS_LEADER"]):
        risk_level = "LOW_RISK"
        risk_label = "🛡️ Paling Aman (Grade A+)"
        risk_badge_color = "emerald"
    elif final_score >= 70:
        risk_level = "MEDIUM_RISK"
        risk_label = "⚖️ Moderat (Grade B)"
        risk_badge_color = "blue"
    else:
        risk_level = "SPECULATIVE"
        risk_label = "⚠️ Spekulatif (Tunggu Reversal)"
        risk_badge_color = "amber"

    # Money Management / Trading Plan
    entry_price = close
    if setup_type == "STAGE2_BREAKOUT":
        sl_calc = max(low_20d * 0.985, entry_price - (1.5 * atr))
        stop_loss = round(sl_calc, 0)
    elif setup_type in ["UPTREND_PULLBACK", "RS_LEADER"]:
        sl_calc = min(ma200 * 0.97, low * 0.98)
        stop_loss = round(sl_calc, 0)
    else:
        stop_loss = round(low * 0.97, 0)

    max_sl = round(entry_price * 0.93, 0)
    min_sl = round(entry_price * 0.975, 0)
    if stop_loss < max_sl:
        stop_loss = max_sl
    elif stop_loss > min_sl:
        stop_loss = min_sl

    risk_per_share = entry_price - stop_loss
    risk_pct = (risk_per_share / entry_price) * 100

    target_tp1 = round(entry_price + (1.5 * risk_per_share), 0)
    target_tp2 = round(entry_price + (2.5 * risk_per_share), 0)
    tp1_pct = ((target_tp1 - entry_price) / entry_price) * 100
    tp2_pct = ((target_tp2 - entry_price) / entry_price) * 100

    trend_label = "STAGE 2 UPTREND" if is_ma_aligned else ("ABOVE MA200" if is_above_ma200 else "REBOUND")

    # -------------------------------------------------------------
    # BROKER SUMMARY & FOREIGN FLOW (7D SWING HORIZON)
    # -------------------------------------------------------------
    broksum_7d = calculate_broker_summary(df, code, period="7D")
    buyers_7d = broksum_7d.get("buyers", [])
    b1 = buyers_7d[0] if len(buyers_7d) >= 1 else None
    b2 = buyers_7d[1] if len(buyers_7d) >= 2 else None
    b1_is_foreign = (b1.get("category") == "ASING") if b1 else False
    b2_is_foreign = (b2.get("category") == "ASING") if b2 else False
    is_foreign_accum = (b1_is_foreign or b2_is_foreign)
    is_pure_foreign = (b1_is_foreign and b2_is_foreign)
    top_foreign_brokers = [b["broker_code"] for b in buyers_7d if b.get("category") == "ASING"]
    foreign_brokers_str = ", ".join(top_foreign_brokers[:2]) if top_foreign_brokers else ""

    BIG4_FOREIGN = {"AK", "BK", "ZP", "RX"}
    has_big4_foreign = any(b.get("broker_code") in BIG4_FOREIGN for b in buyers_7d if b.get("category") == "ASING")

    if is_pure_foreign:
        safety_confirmations.append(f"Foreign Flow: Murni diakumulasi broker Asing Tier-1 ({foreign_brokers_str}) dalam 7 hari")
    elif is_foreign_accum and foreign_brokers_str:
        safety_confirmations.append(f"Foreign Flow: Akumulasi dominan broker Asing ({foreign_brokers_str}) dalam 7 hari")

    return {
        "code": code,
        "name": meta.get("name", code),
        "sector": meta.get("sector", "General"),
        "indices": meta.get("indices", ["ISSI"]),
        "price": int(close),
        "change_pct": round(((close - open_p) / open_p) * 100, 2),
        "volume": int(volume),
        "turnover_idr": int(turnover_idr),
        "turnover_str": f"{turnover_idr / 1e9:.1f} M",
        "score": final_score,
        "tech_score": min(tech_score, 100),
        "bandar_score": bandar_score,
        "fund_score": fund_score,
        "setup_type": setup_type,
        "setup_name": setup_name,
        "trend_label": trend_label,
        "risk_level": risk_level,
        "risk_label": risk_label,
        "risk_badge_color": risk_badge_color,
        "ma20": round(ma20, 1),
        "ma50": round(ma50, 1),
        "ma100": round(ma100, 1),
        "ma200": round(ma200, 1),
        "ma_aligned": bool(is_ma_aligned),
        "is_above_ma200": bool(is_above_ma200),
        "rsi": round(rsi, 1),
        "stoch_k": round(stoch_k, 1),
        "stoch_d": round(stoch_d, 1),
        "mfi": round(mfi, 1),
        "macd_hist": round(macd_hist, 2),
        "is_green_candle": is_green_candle,
        "has_hammer": has_hammer_rejection,
        "vol_ratio": round(vol_ratio, 2),
        "reasons": reasons,
        "safety_confirmations": safety_confirmations,
        "foreign_flow": {
            "is_accum": bool(is_foreign_accum),
            "is_pure_foreign": bool(is_pure_foreign),
            "has_big4_foreign": bool(has_big4_foreign),
            "top_foreign_brokers": top_foreign_brokers,
            "foreign_brokers_str": foreign_brokers_str,
            "top1_broker": b1.get("broker_code", "-") if b1 else "-",
            "top1_category": b1.get("category", "-") if b1 else "-",
            "top2_broker": b2.get("broker_code", "-") if b2 else "-",
            "top2_category": b2.get("category", "-") if b2 else "-",
            "net_val_diff": broksum_7d.get("net_val_diff", 0),
            "net_val_str": broksum_7d.get("net_val_diff_str", "Rp 0")
        },
        "bandarmologi": {
            "status": bandar.get("status", "NEUTRAL"),
            "label": bandar.get("label", "Netral"),
            "score": bandar_score,
            "badge_color": bandar.get("badge_color", "gray"),
            "vwap_20": bandar.get("vwap_20", close),
            "price_vs_vwap_pct": bandar.get("price_vs_vwap_pct", 0.0),
            "buy_volume_pct_5d": bandar.get("buy_volume_pct_5d", 50.0),
            "reasons": bandar.get("reasons", [])
        },
        "fundamental": {
            "pe": fund.get("pe"),
            "pbv": fund.get("pbv"),
            "roe": fund.get("roe"),
            "der": fund.get("der"),
            "div_yield": fund.get("div_yield"),
            "market_cap_str": fund.get("market_cap_str", "-"),
            "cap_category": fund.get("cap_category", "-"),
            "score": fund_score,
            "reasons": fund.get("reasons", [])
        },
        "trading_plan": {
            "entry": int(entry_price),
            "stop_loss": int(stop_loss),
            "risk_pct": round(risk_pct, 2),
            "tp1": int(target_tp1),
            "tp1_pct": round(tp1_pct, 2),
            "tp2": int(target_tp2),
            "tp2_pct": round(tp2_pct, 2),
            "risk_reward": "1 : 2.5"
        }
    }


def diagnose_ticker_summary(code: str, meta: dict, df: pd.DataFrame, candidate_res: dict | None) -> dict:
    """
    Produces an educational diagnostic summary for any stock in the database.
    If the stock passed the screener, it returns the candidate object with passed_screener=True.
    If it did not pass, it details the exact safety reasons (e.g. Anti-Falling Knife, Downtrend, etc.)
    """
    if candidate_res is not None:
        candidate_res["passed_screener"] = True
        candidate_res["rejection_reasons"] = []
        candidate_res["safety_advice"] = "Sinyal swing terkonfirmasi. Disiplin gunakan batas Stop Loss sesuai rencana."
        return candidate_res

    if df is None or len(df) < 5:
        return {
            "code": code,
            "name": meta.get("name", code),
            "sector": meta.get("sector", "General"),
            "price": 0,
            "change_pct": 0.0,
            "volume": 0,
            "turnover_idr": 0,
            "turnover_str": "-",
            "score": 0,
            "tech_score": 0,
            "bandar_score": 0,
            "fund_score": 0,
            "setup_type": None,
            "setup_name": "Data Tidak Tersedia",
            "trend_label": "DATA BELUM LENGKAP",
            "risk_level": "SPECULATIVE",
            "risk_label": "Data Tidak Lengkap",
            "risk_badge_color": "gray",
            "ma20": 0,
            "ma50": 0,
            "ma100": 0,
            "ma200": 0,
            "ma_aligned": False,
            "is_above_ma200": False,
            "rsi": 50,
            "vol_ratio": 1.0,
            "is_green_candle": False,
            "has_hammer": False,
            "passed_screener": False,
            "rejection_reasons": ["Data historis perdagangan dari bursa belum mencukupi."],
            "safety_advice": "Tidak disarankan transaksi hingga data bursa aktif.",
            "bandarmologi": {"status": "NEUTRAL", "label": "Netral", "score": 40},
            "fundamental": meta.get("fundamental", {}),
            "trading_plan": {
                "entry": 0, "stop_loss": 0, "risk_pct": 0, "tp1": 0, "tp1_pct": 0, "tp2": 0, "tp2_pct": 0, "risk_reward": "1 : 2.5"
            }
        }

    latest = df.iloc[-1]
    prev = df.iloc[-2] if len(df) > 1 else latest
    close = float(latest['Close'])
    open_p = float(latest['Open'])
    volume = float(latest['Volume'])
    turnover_idr = close * volume
    change_pct = round(((close - open_p) / open_p) * 100, 2) if open_p > 0 else 0.0

    ma20 = round(float(latest.get('MA20', 0)), 1)
    ma50 = round(float(latest.get('MA50', 0)), 1)
    ma100 = round(float(latest.get('MA100', 0)), 1)
    ma200 = round(float(latest.get('MA200', 0)), 1)
    rsi = round(float(latest.get('RSI14', 50)), 1)
    vol_ratio = round(float(latest.get('Vol_Ratio', 1.0)), 2)

    lower_shadow_ratio = float(latest.get('Lower_Shadow_Ratio', 0.0))
    close_pos_in_range = float(latest.get('Close_Pos_In_Range', 0.5))
    is_green_candle = bool(latest.get('Is_Green_Candle', False))
    has_hammer = (lower_shadow_ratio >= 0.35)
    is_falling_knife = (not is_green_candle) and (close_pos_in_range < 0.20) and (not has_hammer)
    is_ma_aligned = (ma50 > ma100 > ma200) and (ma200 > 0)
    is_above_ma200 = close > ma200 if ma200 > 0 else False

    reasons = []
    if is_falling_knife:
        reasons.append("🛑 Filter Anti-Pisau Jatuh (Anti-Falling Knife) Aktif: Candle ditutup di dekat harga terendah sesi tanpa ekor pantulan bawah (tekanan jual masih agresif).")

    if turnover_idr < 1_500_000_000:
        reasons.append(f"💧 Likuiditas Harian Rendah: Turnover Rp {turnover_idr/1e9:.1f} Miliar (minimal Rp 1,5 Miliar untuk swing trading aman).")

    if ma200 > 0 and close < ma200:
        reasons.append(f"📉 Tren Jangka Panjang: Harga di bawah MA200 (Rp {ma200:,.0f}) & MA50 (Rp {ma50:,.0f}) — Sedang fase koreksi / downtrend.")
    elif ma50 > 0 and close < ma50:
        reasons.append(f"📉 Tren Jangka Pendek: Harga di bawah MA50 (Rp {ma50:,.0f}) — Belum terkonfirmasi Stage 2 Uptrend.")

    if not is_green_candle and not has_hammer:
        reasons.append("🕯️ Belum Ada Konfirmasi Reversal: Belum muncul candle hijau atau pola hammer penolakan harga turun.")

    if rsi <= 30:
        reasons.append(f"⚡ Kondisi Oversold: RSI {rsi} (sangat murah), namun sistem mewajibkan candle pantulan sebelum boleh entry.")

    if not reasons:
        reasons.append("🔍 Belum Terbentuk Setup Swing: Momentum teknikal dan volume belum memenuhi ambang batas skor aman (min. 50/100).")

    stop_loss = round(close * 0.95, 0)
    risk_per_share = close - stop_loss
    tp1 = round(close + (1.5 * risk_per_share), 0)
    tp2 = round(close + (2.5 * risk_per_share), 0)

    return {
        "code": code,
        "name": meta.get("name", code),
        "sector": meta.get("sector", "General"),
        "indices": meta.get("indices", ["ISSI"]),
        "price": int(close),
        "change_pct": change_pct,
        "volume": int(volume),
        "turnover_idr": int(turnover_idr),
        "turnover_str": f"{turnover_idr / 1e9:.1f} M",
        "score": 35 if not is_falling_knife else 20,
        "tech_score": 35,
        "bandar_score": 40,
        "fund_score": 50,
        "setup_type": None,
        "setup_name": "Belum Lolos Sinyal Beli",
        "trend_label": "KOREKSI / DOWNTREND" if not is_above_ma200 else "KONSOLIDASI",
        "risk_level": "SPECULATIVE",
        "risk_label": "Waspada / Belum Lolos Filter",
        "risk_badge_color": "amber",
        "ma20": ma20,
        "ma50": ma50,
        "ma100": ma100,
        "ma200": ma200,
        "ma_aligned": is_ma_aligned,
        "is_above_ma200": is_above_ma200,
        "rsi": rsi,
        "vol_ratio": vol_ratio,
        "is_green_candle": is_green_candle,
        "has_hammer": has_hammer,
        "reasons": reasons,
        "safety_confirmations": [],
        "passed_screener": False,
        "rejection_reasons": reasons,
        "safety_advice": "Disarankan Wait & See. Masukkan ke watchlist pantauan hingga muncul candle hijau atau pola hammer pantulan di level support.",
        "bandarmologi": {
            "status": "NEUTRAL",
            "label": "Netral",
            "score": 40,
            "badge_color": "gray",
            "vwap_20": close
        },
        "fundamental": meta.get("fundamental", {}),
        "trading_plan": {
            "entry": int(close),
            "stop_loss": int(stop_loss),
            "risk_pct": 5.0,
            "tp1": int(tp1),
            "tp1_pct": 7.5,
            "tp2": int(tp2),
            "tp2_pct": 12.5,
            "risk_reward": "1 : 2.5"
        }
    }


def run_screener_diagnostics(market_data: Dict[str, pd.DataFrame]) -> Dict[str, Any]:
    """
    Evaluates all tracked sharia stocks.
    Returns:
    - candidates: list of stocks passing swing screening criteria (score >= 50, setup valid)
    - all_stocks: summary of all tracked stocks with their current price and screener status/reasons
    """
    stocks = load_sharia_stocks()
    meta_dict = {s['code']: s for s in stocks}
    fund_cache = load_fundamentals_cache()

    candidates = []
    all_stocks = []

    for code, df in market_data.items():
        meta = meta_dict.get(code, {"code": code, "name": code})
        res = evaluate_ticker(code, meta, df, fund_cache)
        
        diag = diagnose_ticker_summary(code, meta, df, res)
        all_stocks.append(diag)

        if res:
            candidates.append(res)

    # Save any new fundamental cache updates
    from screener.fundamentals import save_fundamentals_cache
    save_fundamentals_cache(fund_cache)

    # Sort descending by composite score, then by turnover
    candidates.sort(key=lambda x: (x['score'], x['turnover_idr']), reverse=True)
    all_stocks.sort(key=lambda x: (not x['passed_screener'], -x['score'], x['code']))

    return {
        "candidates": candidates,
        "all_stocks": all_stocks
    }


def run_screener(market_data: Dict[str, pd.DataFrame]) -> List[dict]:
    """
    Backward compatible wrapper returning only passed candidates.
    """
    result = run_screener_diagnostics(market_data)
    return result["candidates"]
