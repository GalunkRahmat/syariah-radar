"""
Data Fetcher Module for IDX Sharia Stocks
Fetches historical EOD data from Yahoo Finance with intelligent local caching.
"""

import json
import os
import pickle
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Dict, List, Optional
import pandas as pd
import yfinance as yf

from screener.indicators import enrich_with_indicators

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = PROJECT_ROOT / "data" / "cache"
STOCKS_FILE = PROJECT_ROOT / "data" / "sharia_stocks.json"


def get_latest_trading_date() -> date:
    """
    Returns the most recent completed IDX trading date.
    BEI / IDX is closed on weekends (Saturday & Sunday).
    If today is Saturday (weekday 5) -> returns Friday (-1 day).
    If today is Sunday (weekday 6) -> returns Friday (-2 days).
    """
    today = date.today()
    if today.weekday() == 5:
        return today - timedelta(days=1)
    elif today.weekday() == 6:
        return today - timedelta(days=2)
    return today


def load_sharia_stocks() -> List[dict]:
    """Loads list of curated sharia stocks from json file."""
    if not STOCKS_FILE.exists():
        raise FileNotFoundError(f"File {STOCKS_FILE} not found.")
    with open(STOCKS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def get_cache_path(today_str: str) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR / f"market_data_{today_str}.pkl"


def fetch_all_sharia_data(force_refresh: bool = False) -> Dict[str, pd.DataFrame]:
    """
    Fetches 1 year of daily historical data for all sharia tickers.
    Uses daily disk cache if available.
    """
    stocks = load_sharia_stocks()
    tickers = [f"{s['code']}.JK" for s in stocks]
    trading_date = get_latest_trading_date()
    today_str = trading_date.strftime("%Y-%m-%d")
    cache_file = get_cache_path(today_str)

    # 1. Check local cache
    if not force_refresh and cache_file.exists():
        try:
            with open(cache_file, "rb") as f:
                data = pickle.load(f)
                if data and len(data) > 0:
                    print(f"[CACHE] Loaded {len(data)} tickers from cache ({cache_file.name})")
                    return data
        except Exception as e:
            print(f"[WARN] Failed to load cache: {e}. Re-fetching...")

    # 2. Fetch in batch from Yahoo Finance
    print(f"[FETCH] Downloading market data for {len(tickers)} tickers from Yahoo Finance...")
    try:
        raw_df = yf.download(
            tickers=tickers,
            period="1y",
            group_by="ticker",
            threads=True,
            progress=True,
            auto_adjust=False
        )
    except Exception as e:
        print(f"[ERROR] Batch download failed: {e}")
        return {}

    result_data = {}

    for s in stocks:
        code = s['code']
        ticker_symbol = f"{code}.JK"
        try:
            if ticker_symbol in raw_df.columns.levels[0]:
                df = raw_df[ticker_symbol].copy()
            else:
                continue

            # Clean and ensure proper columns
            df = df.dropna(subset=['Close'])
            if len(df) < 60:
                continue

            # Standardize column names
            df = df[['Open', 'High', 'Low', 'Close', 'Volume']].astype(float)
            df = enrich_with_indicators(df)

            result_data[code] = df
        except Exception as err:
            # Skip problematic single ticker
            continue

    # 3. Save to cache
    if result_data:
        try:
            with open(cache_file, "wb") as f:
                pickle.dump(result_data, f)
            print(f"[CACHE] Saved {len(result_data)} tickers to cache ({cache_file.name})")
        except Exception as e:
            print(f"[WARN] Failed to save cache: {e}")

    return result_data
