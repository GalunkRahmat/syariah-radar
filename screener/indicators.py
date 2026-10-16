"""
Technical Indicators Calculation Module
Vectorized calculations for Indonesian Stock Exchange (IDX) Swing Trading.
Includes safety indicators: MFI (Money Flow), MACD, Stochastic RSI, and Candlestick Reversal metrics.
"""

import pandas as pd
import numpy as np


def compute_sma(series: pd.Series, window: int) -> pd.Series:
    """Calculates Simple Moving Average."""
    return series.rolling(window=window).mean()


def compute_ema(series: pd.Series, window: int) -> pd.Series:
    """Calculates Exponential Moving Average."""
    return series.ewm(span=window, adjust=False).mean()


def compute_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """
    Calculates Wilder's Relative Strength Index (RSI).
    """
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -1 * delta.clip(upper=0)

    # Wilder's Exponential Smoothing
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()

    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(50)


def compute_stoch_rsi(rsi_series: pd.Series, period: int = 14, k_window: int = 3, d_window: int = 3):
    """
    Calculates Stochastic RSI (%K and %D lines).
    Best for catching precise oversold turning points and golden crosses.
    """
    min_rsi = rsi_series.rolling(window=period).min()
    max_rsi = rsi_series.rolling(window=period).max()
    rsi_range = (max_rsi - min_rsi).replace(0, np.nan)

    stoch_rsi = ((rsi_series - min_rsi) / rsi_range) * 100
    stoch_rsi = stoch_rsi.fillna(50)

    fast_k = stoch_rsi.rolling(window=k_window).mean().fillna(50)
    fast_d = fast_k.rolling(window=d_window).mean().fillna(50)

    return fast_k, fast_d


def compute_mfi(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """
    Calculates Money Flow Index (MFI) - Volume-Weighted RSI (Early Bandarmologi).
    Measures institutional buying and selling pressure.
    """
    typical_price = (df['High'] + df['Low'] + df['Close']) / 3
    raw_money_flow = typical_price * df['Volume']

    price_diff = typical_price.diff()
    pos_flow = np.where(price_diff > 0, raw_money_flow, 0)
    neg_flow = np.where(price_diff < 0, raw_money_flow, 0)

    pos_mf = pd.Series(pos_flow, index=df.index).rolling(window=period).sum()
    neg_mf = pd.Series(neg_flow, index=df.index).rolling(window=period).sum()

    money_ratio = pos_mf / neg_mf.replace(0, np.nan)
    mfi = 100 - (100 / (1 + money_ratio))
    return mfi.fillna(50)


def compute_macd(close_series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    """
    Calculates MACD Line, Signal Line, and MACD Histogram.
    """
    ema_fast = compute_ema(close_series, fast)
    ema_slow = compute_ema(close_series, slow)
    macd_line = ema_fast - ema_slow
    signal_line = compute_ema(macd_line, signal)
    macd_hist = macd_line - signal_line
    return macd_line, signal_line, macd_hist


def compute_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """
    Calculates Average True Range (ATR) for volatility and stop-loss positioning.
    """
    high = df['High']
    low = df['Low']
    close = df['Close']
    prev_close = close.shift(1)

    tr1 = high - low
    tr2 = (high - prev_close).abs()
    tr3 = (low - prev_close).abs()

    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    atr = tr.rolling(window=period).mean()
    return atr


def enrich_with_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """
    Enriches raw OHLCV DataFrame with all technical swing trading indicators.
    Expected columns: Open, High, Low, Close, Volume
    """
    if df.empty or len(df) < 50:
        return df

    # Flatten multi-level columns if produced by yfinance
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    # 1. Moving Averages
    df['MA20'] = compute_sma(df['Close'], 20)
    df['MA50'] = compute_sma(df['Close'], 50)
    df['MA100'] = compute_sma(df['Close'], 100)
    df['MA200'] = compute_sma(df['Close'], 200)

    # 2. Volume Analysis
    df['Vol_MA20'] = compute_sma(df['Volume'], 20)
    df['Vol_Ratio'] = np.where(df['Vol_MA20'] > 0, df['Volume'] / df['Vol_MA20'], 1.0)

    # 3. Momentum & Divergence Indicators
    df['RSI14'] = compute_rsi(df['Close'], 14)
    df['Stoch_K'], df['Stoch_D'] = compute_stoch_rsi(df['RSI14'], 14, 3, 3)

    # 4. Money Flow (Bandarmologi Smart Money)
    df['MFI14'] = compute_mfi(df, 14)

    # 5. MACD (Trend Turning & Momentum Exhaustion)
    df['MACD_Line'], df['MACD_Signal'], df['MACD_Hist'] = compute_macd(df['Close'], 12, 26, 9)

    # 6. Volatility & Risk
    df['ATR14'] = compute_atr(df, 14)

    # 7. Support & Resistance (Swing Highs and Lows)
    df['High_20d'] = df['High'].rolling(20).max()
    df['Low_20d'] = df['Low'].rolling(20).min()
    df['High_52w'] = df['High'].rolling(250).max()
    df['Low_52w'] = df['Low'].rolling(250).min()

    # 8. MA200 Slope (Is MA200 going up over the past 20 bars?)
    if 'MA200' in df.columns:
        df['MA200_Slope'] = (df['MA200'] - df['MA200'].shift(20)) / df['MA200'].shift(20) * 100
    else:
        df['MA200_Slope'] = 0.0

    # 9. Candlestick Price Action & Bottoming Metrics
    candle_range = (df['High'] - df['Low']).replace(0, 0.01)
    lower_shadow = (np.minimum(df['Open'], df['Close']) - df['Low']).clip(lower=0)
    upper_shadow = (df['High'] - np.maximum(df['Open'], df['Close'])).clip(lower=0)
    body = (df['Close'] - df['Open']).abs()

    df['Lower_Shadow_Ratio'] = lower_shadow / candle_range
    df['Upper_Shadow_Ratio'] = upper_shadow / candle_range
    df['Body_Ratio'] = body / candle_range
    df['Is_Green_Candle'] = df['Close'] >= df['Open']
    df['Close_Pos_In_Range'] = (df['Close'] - df['Low']) / candle_range  # 0.0 = closed at bottom, 1.0 = closed at top

    return df
