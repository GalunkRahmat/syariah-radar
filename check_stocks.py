import pickle
import pandas as pd

with open('data/cache/market_data_2026-10-16.pkl', 'rb') as f:
    data = pickle.load(f)

print(f"Total tickers in cache: {len(data)}")

codes = ['ADRO', 'BRIS', 'TLKM', 'ICBP', 'AMMN', 'ANTM', 'BRPT', 'ACES', 'KLBF', 'MEDC']
for code in codes:
    if code in data:
        df = data[code]
        last = df.iloc[-1]
        c = last['Close']
        ma20 = last['MA20']
        ma50 = last['MA50']
        ma100 = last['MA100']
        ma200 = last['MA200']
        rsi = last['RSI14']
        vol_r = last['Vol_Ratio']
        turnover = (c * last['Volume']) / 1e9
        h20 = last['High_20d']
        l20 = last['Low_20d']
        print(f"{code:5} | Close: {c:6.0f} | MA50: {ma50:6.1f} | MA100: {ma100:6.1f} | MA200: {ma200:6.1f} | RSI: {rsi:4.1f} | VolR: {vol_r:4.2f}x | Turnover: {turnover:5.1f}B | H20: {h20:.0f} | MA_Aligned: {ma50 > ma100 > ma200} | C>MA50: {c > ma50}")
