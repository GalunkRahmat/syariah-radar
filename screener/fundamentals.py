"""
Fundamental & Sharia Compliance Analysis Module
Fetches, caches, and grades fundamental metrics according to Indonesian Sharia Standards.
"""

import json
from pathlib import Path
from typing import Dict, Any, Optional
import yfinance as yf

CACHE_FILE = Path("data/cache_fundamentals.json")


def load_fundamentals_cache() -> Dict[str, Any]:
    if CACHE_FILE.exists():
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_fundamentals_cache(cache: Dict[str, Any]):
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    try:
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache, f, indent=2)
    except Exception as e:
        print(f"[WARN] Failed to save fundamentals cache: {e}")


def fetch_ticker_fundamentals(code: str, existing_cache: Dict[str, Any]) -> Dict[str, Any]:
    """
    Fetches fundamental data for a ticker using cache if available.
    """
    if code in existing_cache:
        return existing_cache[code]

    ticker_sym = f"{code}.JK"
    try:
        t = yf.Ticker(ticker_sym)
        info = t.info
    except Exception:
        info = {}

    pe = info.get("trailingPE")
    pbv = info.get("priceToBook")
    roe = info.get("returnOnEquity")
    der = info.get("debtToEquity")  # Expressed as percentage or ratio
    market_cap = info.get("marketCap", 0)
    div_yield = info.get("dividendYield")

    # Clean & normalize values
    pe_val = round(float(pe), 2) if pe and pe > 0 else None
    pbv_val = round(float(pbv), 2) if pbv and pbv > 0 else None
    roe_val = round(float(roe) * 100, 2) if roe else None
    der_val = round(float(der), 2) if der is not None else None
    div_val = round(float(div_yield) * 100, 2) if div_yield else None

    # Calculate Fundamental Quality Score (0 - 100)
    fund_score = 50
    reasons = []

    # 1. Profitability (ROE)
    if roe_val is not None:
        if roe_val >= 15.0:
            fund_score += 20
            reasons.append(f"Profitabilitas Sangat Kuat (ROE {roe_val}% > 15%)")
        elif roe_val >= 10.0:
            fund_score += 10
            reasons.append(f"Profitabilitas Baik (ROE {roe_val}%)")
        elif roe_val < 5.0:
            fund_score -= 10
            reasons.append(f"Profitabilitas Rendah (ROE {roe_val}%)")

    # 2. Sharia Debt Safety (DER)
    if der_val is not None:
        if der_val <= 50.0:
            fund_score += 15
            reasons.append(f"Kesehatan Utang Prima (DER {der_val}%: Sangat Aman Syariah)")
        elif der_val <= 100.0:
            fund_score += 5
            reasons.append(f"Rasio Utang Terkendali (DER {der_val}%)")
        else:
            fund_score -= 10
            reasons.append(f"Rasio Utang Perlu Diperhatikan (DER {der_val}%)")

    # 3. Valuation (PBV & PE)
    if pbv_val is not None:
        if pbv_val <= 1.0:
            fund_score += 10
            reasons.append(f"Valuasi Murah di Bawah Nilai Buku (PBV {pbv_val}x)")
        elif pbv_val <= 2.5:
            fund_score += 5
            reasons.append(f"Valuasi Wajar (PBV {pbv_val}x)")

    # 4. Market Cap Category
    if market_cap >= 10_000_000_000_000:
        cap_category = "Big Cap (>Rp 10T)"
        fund_score += 5
    elif market_cap >= 2_000_000_000_000:
        cap_category = "Mid Cap (Rp 2T - 10T)"
    else:
        cap_category = "Small Cap (<Rp 2T)"

    res = {
        "pe": pe_val,
        "pbv": pbv_val,
        "roe": roe_val,
        "der": der_val,
        "market_cap": market_cap,
        "market_cap_str": f"Rp {market_cap / 1e12:.1f} T" if market_cap > 1e12 else f"Rp {market_cap / 1e9:.0f} M",
        "div_yield": div_val,
        "cap_category": cap_category,
        "score": min(max(fund_score, 0), 100),
        "reasons": reasons
    }

    existing_cache[code] = res
    return res


def get_all_fundamentals(codes: list) -> Dict[str, Any]:
    cache = load_fundamentals_cache()
    changed = False
    results = {}
    for code in codes:
        if code not in cache:
            fetch_ticker_fundamentals(code, cache)
            changed = True
        results[code] = cache.get(code, {})
    if changed:
        save_fundamentals_cache(cache)
    return results
