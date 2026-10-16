"""
FastAPI Server for IDX Sharia Stock Screener
Provides REST APIs for mobile applications, Telegram notifications, and serves the responsive web interface.
"""

import json
from pathlib import Path
from typing import Optional, Dict, Any
import pandas as pd
import yfinance as yf
from pydantic import BaseModel
from fastapi import FastAPI, Query, HTTPException, Body, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from screener.data_fetcher import fetch_all_sharia_data, load_sharia_stocks, STOCKS_FILE, CACHE_DIR
from screener.engine import run_screener, run_screener_diagnostics
from notifier.telegram_alert import (
    load_telegram_config,
    save_telegram_config,
    send_telegram_message,
    send_daily_alert,
    build_alert_message
)

app = FastAPI(
    title="Syariah Swing Radar Pro API",
    description="Backend API with 3-Pillar Screener, Money Management, and Telegram Alerts",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_no_cache_headers(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path == "/" or path.startswith("/static/") or path in ["/sw.js", "/manifest.json"]:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

WEB_DIR = Path("web")
if WEB_DIR.exists():
    app.mount("/static", StaticFiles(directory="web"), name="static")


# PWA Static Files
@app.get("/")
def serve_index():
    index_file = WEB_DIR / "index.html"
    if index_file.exists():
        return FileResponse(
            index_file,
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )
    return {"message": "IDX Sharia Stock Screener API is running."}


@app.get("/manifest.json")
def serve_manifest():
    manifest_file = WEB_DIR / "manifest.json"
    if manifest_file.exists():
        return FileResponse(manifest_file, media_type="application/manifest+json")
    raise HTTPException(status_code=404, detail="manifest.json not found")


@app.get("/sw.js")
def serve_service_worker():
    sw_file = WEB_DIR / "sw.js"
    if sw_file.exists():
        return FileResponse(
            sw_file,
            media_type="application/javascript",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )
    raise HTTPException(status_code=404, detail="sw.js not found")


@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "Syariah Swing Radar Pro", "version": "1.0.0"}


@app.get("/api/system/info")
def get_system_info():
    import socket
    local_ip = "127.0.0.1"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        pass
    return {
        "status": "ok",
        "name": "Syariah Swing Radar Pro",
        "version": "1.0.0",
        "local_ip": local_ip,
        "port": 8000,
        "mobile_url": f"http://{local_ip}:8000"
    }


# -------------------------------------------------------------
# SHARIA STOCKS & WATCHLIST MANAGEMENT
# -------------------------------------------------------------
@app.get("/api/sharia-stocks")
def get_sharia_stocks():
    return load_sharia_stocks()


class AddStockRequest(BaseModel):
    code: str


@app.post("/api/sharia-stocks/add")
def add_sharia_stock(req: AddStockRequest):
    code = req.code.strip().upper()
    if not code or len(code) > 6:
        raise HTTPException(status_code=400, detail="Kode saham tidak valid.")

    stocks = load_sharia_stocks()
    if any(s['code'] == code for s in stocks):
        raise HTTPException(
            status_code=400,
            detail=f"Saham {code} sudah ada dalam database radar! Saham ini belum lolos screening hari ini untuk melindungi modal Anda (misal: terdeteksi pola Anti-Pisau Jatuh atau tren koreksi). Cari '{code}' di kotak pencarian untuk melihat diagnosa lengkapnya."
        )

    # Validate against Yahoo Finance
    ticker_sym = f"{code}.JK"
    try:
        t = yf.Ticker(ticker_sym)
        hist = t.history(period="5d")
        if hist.empty:
            raise HTTPException(status_code=400, detail=f"Saham {code} tidak ditemukan di BEI atau tidak memiliki transaksi aktif.")
        info = t.info
        name = info.get("shortName") or info.get("longName") or f"{code} Tbk."
        sector = info.get("sector") or "General"
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Gagal memvalidasi {code}: {str(e)}")

    new_stock = {
        "code": code,
        "name": name,
        "sector": sector,
        "indices": ["ISSI", "CUSTOM"]
    }
    stocks.append(new_stock)
    stocks.sort(key=lambda x: x['code'])

    # Save to file
    with open(STOCKS_FILE, "w", encoding="utf-8") as f:
        json.dump(stocks, f, indent=2)

    # Invalidate today's cache so fresh scan will download it
    for cache_f in CACHE_DIR.glob("market_data_*.pkl"):
        try:
            cache_f.unlink()
        except Exception:
            pass

    return {"success": True, "message": f"Saham {code} ({name}) berhasil ditambahkan ke radar!", "stock": new_stock}


@app.delete("/api/sharia-stocks/{code}")
def delete_sharia_stock(code: str):
    code = code.strip().upper()
    stocks = load_sharia_stocks()
    new_stocks = [s for s in stocks if s['code'] != code]

    if len(new_stocks) == len(stocks):
        raise HTTPException(status_code=404, detail=f"Saham {code} tidak ditemukan.")

    with open(STOCKS_FILE, "w", encoding="utf-8") as f:
        json.dump(new_stocks, f, indent=2)

    return {"success": True, "message": f"Saham {code} berhasil dihapus dari radar."}


# -------------------------------------------------------------
# SCREENER RESULTS
# -------------------------------------------------------------
@app.get("/api/screener/results")
def get_screening_results(
    setup: Optional[str] = Query(None, description="Filter by setup"),
    risk_level: Optional[str] = Query(None, description="Filter by risk"),
    min_score: int = Query(50, description="Minimum composite score"),
    force_refresh: bool = Query(False, description="Force re-download")
):
    market_data = fetch_all_sharia_data(force_refresh=force_refresh)
    if not market_data:
        raise HTTPException(status_code=500, detail="Gagal mengambil data pasar dari Yahoo Finance.")

    diagnostics = run_screener_diagnostics(market_data)
    all_candidates = diagnostics["candidates"]
    all_stocks = diagnostics["all_stocks"]

    filtered = [c for c in all_candidates if c['score'] >= min_score]

    if setup and setup != "ALL":
        filtered = [c for c in filtered if c['setup_type'] == setup]

    if risk_level and risk_level != "ALL":
        filtered = [c for c in filtered if c.get('risk_level') == risk_level]

    summary = {
        "total_scanned": len(market_data),
        "total_candidates": len(filtered),
        "strategy_counts": {
            "STAGE2_BREAKOUT": len([c for c in all_candidates if c['setup_type'] == "STAGE2_BREAKOUT"]),
            "UPTREND_PULLBACK": len([c for c in all_candidates if c['setup_type'] == "UPTREND_PULLBACK"]),
            "RS_LEADER": len([c for c in all_candidates if c['setup_type'] == "RS_LEADER"]),
            "OVERSOLD_REBOUND": len([c for c in all_candidates if c['setup_type'] == "OVERSOLD_REBOUND"]),
        },
        "risk_counts": {
            "LOW_RISK": len([c for c in all_candidates if c.get('risk_level') == "LOW_RISK"]),
            "MEDIUM_RISK": len([c for c in all_candidates if c.get('risk_level') == "MEDIUM_RISK"]),
            "SPECULATIVE": len([c for c in all_candidates if c.get('risk_level') == "SPECULATIVE"]),
        }
    }

    return {"summary": summary, "candidates": filtered, "all_stocks": all_stocks}


@app.get("/api/stock/{code}")
def get_stock_detail(code: str):
    code = code.upper()
    market_data = fetch_all_sharia_data(force_refresh=False)
    
    if code not in market_data:
        raise HTTPException(status_code=404, detail=f"Stock {code} tidak ditemukan dalam database.")

    df = market_data[code]
    chart_df = df.tail(60).copy()
    
    candles = []
    for idx, row in chart_df.iterrows():
        date_str = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10]
        candles.append({
            "date": date_str,
            "open": round(float(row['Open']), 1),
            "high": round(float(row['High']), 1),
            "low": round(float(row['Low']), 1),
            "close": round(float(row['Close']), 1),
            "volume": int(row['Volume']),
            "ma20": round(float(row['MA20']), 1) if pd.notna(row.get('MA20')) else None,
            "ma50": round(float(row['MA50']), 1) if pd.notna(row.get('MA50')) else None,
            "ma100": round(float(row['MA100']), 1) if pd.notna(row.get('MA100')) else None,
            "ma200": round(float(row['MA200']), 1) if pd.notna(row.get('MA200')) else None,
            "rsi": round(float(row['RSI14']), 1) if pd.notna(row.get('RSI14')) else None,
        })

    latest = df.iloc[-1]
    return {
        "code": code,
        "latest": {
            "close": float(latest['Close']),
            "ma20": float(latest.get('MA20', 0)),
            "ma50": float(latest.get('MA50', 0)),
            "ma100": float(latest.get('MA100', 0)),
            "ma200": float(latest.get('MA200', 0)),
            "rsi": float(latest.get('RSI14', 50)),
            "mfi": float(latest.get('MFI14', 50)),
            "vol_ratio": float(latest.get('Vol_Ratio', 1.0))
        },
        "history": candles
    }


# -------------------------------------------------------------
# MONEY MANAGEMENT & LOT SIZING CALCULATOR
# -------------------------------------------------------------
class PositionSizeRequest(BaseModel):
    capital: float = 50_000_000
    risk_pct: float = 2.0
    entry: float
    stop_loss: float
    tp1: Optional[float] = None
    tp2: Optional[float] = None


@app.post("/api/calculator/position-size")
def calculate_position_size(req: PositionSizeRequest):
    if req.entry <= req.stop_loss:
        raise HTTPException(status_code=400, detail="Harga Stop Loss harus lebih rendah dari harga Entry.")

    max_loss_idr = req.capital * (req.risk_pct / 100)
    risk_per_share = req.entry - req.stop_loss

    total_shares = int(max_loss_idr / risk_per_share)
    total_lots = total_shares // 100  # 1 Lot = 100 shares in IDX

    if total_lots < 1:
        total_lots = 1
        total_shares = 100

    capital_allocated = total_shares * req.entry
    allocation_pct = round((capital_allocated / req.capital) * 100, 2)
    actual_max_loss = total_shares * risk_per_share

    tp1 = req.tp1 or (req.entry + (1.5 * risk_per_share))
    tp2 = req.tp2 or (req.entry + (2.5 * risk_per_share))

    profit_tp1 = total_shares * (tp1 - req.entry)
    profit_tp2 = total_shares * (tp2 - req.entry)

    return {
        "lots": total_lots,
        "shares": total_shares,
        "capital_allocated": int(capital_allocated),
        "allocation_pct": allocation_pct,
        "max_risk_idr": int(actual_max_loss),
        "potential_profit_tp1": int(profit_tp1),
        "potential_profit_tp2": int(profit_tp2),
        "risk_reward_ratio": "1 : 2.5"
    }


# -------------------------------------------------------------
# TELEGRAM NOTIFICATION APIS
# -------------------------------------------------------------
@app.get("/api/telegram/config")
def get_telegram_config():
    cfg = load_telegram_config()
    # Mask bot token for security
    masked_token = f"{cfg.get('bot_token', '')[:6]}...{cfg.get('bot_token', '')[-4:]}" if cfg.get('bot_token') else ""
    return {
        "configured": bool(cfg.get("bot_token") and cfg.get("chat_id")),
        "masked_token": masked_token,
        "chat_id": cfg.get("chat_id", ""),
        "enabled": cfg.get("enabled", False)
    }


class TelegramConfigRequest(BaseModel):
    bot_token: str
    chat_id: str
    enabled: bool = True


@app.post("/api/telegram/config")
def set_telegram_config(req: TelegramConfigRequest):
    cfg = {
        "bot_token": req.bot_token.strip(),
        "chat_id": req.chat_id.strip(),
        "enabled": req.enabled
    }
    save_telegram_config(cfg)
    return {"success": True, "message": "Konfigurasi Telegram berhasil disimpan!"}


@app.post("/api/telegram/send-alert")
def trigger_telegram_alert():
    cfg = load_telegram_config()
    if not cfg.get("bot_token") or not cfg.get("chat_id"):
        raise HTTPException(status_code=400, detail="Telegram Bot Token atau Chat ID belum dikonfigurasi.")

    result = send_daily_alert()
    if not result.get("success"):
        raise HTTPException(status_code=500, detail="Gagal mengirim pesan ke Telegram. Periksa Bot Token dan Chat ID Anda.")

    return {"success": True, "message": "Sinyal screener berhasil dikirim ke Telegram Anda!"}
