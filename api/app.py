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
from fastapi import FastAPI, Query, HTTPException, Body, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, Response, HTMLResponse

from screener.data_fetcher import fetch_all_sharia_data, load_sharia_stocks, STOCKS_FILE, CACHE_DIR, get_latest_trading_date
from screener.engine import run_screener, run_screener_diagnostics
from notifier.telegram_alert import (
    load_telegram_config,
    save_telegram_config,
    send_telegram_message,
    send_daily_alert,
    build_alert_message
)
from api.auth import (
    authenticate_user,
    create_session,
    verify_session,
    revoke_session,
    list_all_users,
    create_new_user,
    delete_user,
    reset_user_password,
    update_user_expiry,
    AccountExpiredError
)
from screener.history_db import (
    save_screening_snapshot,
    get_history_dates,
    get_history_candidates,
    get_stock_timeline,
    generate_excel_export
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

PROJECT_ROOT = Path(__file__).resolve().parent.parent
WEB_DIR = PROJECT_ROOT / "web"
if WEB_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(WEB_DIR)), name="static")


# PWA Static Files
@app.get("/", response_class=HTMLResponse)
def serve_index():
    index_file = WEB_DIR / "index.html"
    if index_file.exists():
        return HTMLResponse(
            content=index_file.read_text(encoding="utf-8"),
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )
    return HTMLResponse("<h1>IDX Sharia Stock Screener API is running.</h1>")


@app.get("/manifest.json")
def serve_manifest():
    manifest_file = WEB_DIR / "manifest.json"
    if manifest_file.exists():
        return Response(content=manifest_file.read_text(encoding="utf-8"), media_type="application/manifest+json")
    raise HTTPException(status_code=404, detail="manifest.json not found")


@app.get("/sw.js")
def serve_service_worker():
    sw_file = WEB_DIR / "sw.js"
    if sw_file.exists():
        return Response(
            content=sw_file.read_text(encoding="utf-8"),
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
# USER AUTHENTICATION & ACCESS CONTROL
# -------------------------------------------------------------
class LoginRequest(BaseModel):
    username: str
    password: str
    device_id: Optional[str] = None


@app.post("/api/auth/login")
def login(req: LoginRequest):
    try:
        user_info = authenticate_user(req.username, req.password, device_id=req.device_id)
    except AccountExpiredError as e:
        raise HTTPException(
            status_code=403,
            detail=str(e)
        )

    if not user_info:
        raise HTTPException(
            status_code=401,
            detail="Username atau Password salah! Akses ditolak."
        )
    token = create_session(
        username=user_info["username"],
        role=user_info.get("role", "user"),
        session_version=user_info.get("session_version", 1),
        device_id=req.device_id
    )
    return {
        "status": "ok",
        "token": token,
        "username": user_info["username"],
        "role": user_info.get("role", "user"),
        "expires_at": user_info.get("expires_at"),
        "is_lifetime": user_info.get("is_lifetime", False),
        "days_remaining": user_info.get("days_remaining"),
        "expiry_str": user_info.get("expiry_str"),
        "message": f"Login berhasil! Selamat datang, {user_info['username']}."
    }


def get_current_user(request: Request) -> Dict[str, Any]:
    auth_header = request.headers.get("Authorization", "")
    token = ""
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1].strip()
    elif "auth_token" in request.cookies:
        token = request.cookies.get("auth_token", "")
    elif request.query_params.get("token"):
        token = request.query_params.get("token", "")

    device_id = request.headers.get("X-Device-Id") or request.query_params.get("device_id")
    user_info = verify_session(token, request_device_id=device_id)
    if not user_info:
        raise HTTPException(
            status_code=401,
            detail="Sesi login tidak aktif, masa aktif berakhir, atau akun telah login di perangkat lain. Silakan login kembali."
        )
    return user_info


def require_auth(user: Dict[str, Any] = Depends(get_current_user)) -> str:
    return user["username"]


def require_admin(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=403,
            detail="Akses ditolak: Fitur ini khusus untuk Administrator (Galunk)."
        )
    return user


@app.get("/api/auth/verify")
def verify_auth(user: Dict[str, Any] = Depends(get_current_user)):
    return {
        "status": "ok",
        "authenticated": True,
        "username": user["username"],
        "role": user.get("role", "user"),
        "expires_at": user.get("expires_at"),
        "is_lifetime": user.get("is_lifetime", False),
        "days_remaining": user.get("days_remaining"),
        "expiry_str": user.get("expiry_str")
    }


@app.post("/api/auth/logout")
def logout(request: Request):
    auth_header = request.headers.get("Authorization", "")
    token = ""
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1].strip()
    elif "auth_token" in request.cookies:
        token = request.cookies.get("auth_token", "")
    elif request.query_params.get("token"):
        token = request.query_params.get("token", "")
    if token:
        revoke_session(token)
    return {"status": "ok", "message": "Berhasil keluar dari radar."}


# -------------------------------------------------------------
# SHARIA STOCKS & WATCHLIST MANAGEMENT
# -------------------------------------------------------------
@app.get("/api/sharia-stocks")
def get_sharia_stocks(user: str = Depends(require_auth)):
    return load_sharia_stocks()


class AddStockRequest(BaseModel):
    code: str


@app.post("/api/sharia-stocks/add")
def add_sharia_stock(req: AddStockRequest, admin: Dict[str, Any] = Depends(require_admin)):
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
def delete_sharia_stock(code: str, admin: Dict[str, Any] = Depends(require_admin)):
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
    force_refresh: bool = Query(False, description="Force re-download"),
    user: str = Depends(require_auth)
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

    market_date_str = get_latest_trading_date().strftime("%Y-%m-%d")
    try:
        save_screening_snapshot(market_date_str, all_candidates, summary)
    except Exception as e:
        print(f"[HISTORY DB] Auto-save error: {e}")

    return {"market_date": market_date_str, "summary": summary, "candidates": filtered, "all_stocks": all_stocks}


# -------------------------------------------------------------
# HISTORICAL DATABASE & EXCEL EXPORT
# -------------------------------------------------------------
@app.get("/api/history/dates")
def get_historical_dates(user: str = Depends(require_auth)):
    dates = get_history_dates()
    return {"dates": dates, "total": len(dates)}


@app.get("/api/history/results")
def get_historical_results(
    date: str = Query(..., description="Date YYYY-MM-DD"),
    min_score: int = Query(50),
    user: str = Depends(require_auth)
):
    data = get_history_candidates(date)
    if not data:
        raise HTTPException(status_code=404, detail=f"Data screening untuk tanggal {date} belum tersedia di database arsip.")
    candidates = [c for c in data["candidates"] if c.get("score", 0) >= min_score]
    return {"market_date": date, "summary": data["summary"], "candidates": candidates}


@app.get("/api/history/stock/{code}")
def get_stock_signal_history(code: str, user: str = Depends(require_auth)):
    timeline = get_stock_timeline(code)
    return {"code": code.upper(), "timeline": timeline}


@app.get("/api/screener/export-excel")
def export_screener_excel(
    date: Optional[str] = Query(None, description="Date YYYY-MM-DD"),
    min_score: int = Query(50),
    admin: Dict[str, Any] = Depends(require_admin)
):
    target_date = date or get_latest_trading_date().strftime("%Y-%m-%d")
    hist_data = get_history_candidates(target_date)

    if hist_data and hist_data.get("candidates"):
        candidates = [c for c in hist_data["candidates"] if c.get("score", 0) >= min_score]
        summary = hist_data.get("summary", {})
    else:
        market_data = fetch_all_sharia_data(force_refresh=False)
        diag = run_screener_diagnostics(market_data)
        candidates = [c for c in diag["candidates"] if c.get("score", 0) >= min_score]
        summary = {"total_scanned": len(market_data), "total_candidates": len(candidates)}
        save_screening_snapshot(target_date, diag["candidates"], summary)

    excel_io = generate_excel_export(target_date, candidates, summary)
    filename = f"Radar_Saham_Syariah_{target_date}.xlsx"
    return Response(
        content=excel_io.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache, no-store, must-revalidate"
        }
    )


@app.get("/api/stock/{code}")
def get_stock_detail(code: str, user: str = Depends(require_auth)):
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
def calculate_position_size(req: PositionSizeRequest, user: str = Depends(require_auth)):
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
def get_telegram_config(user: str = Depends(require_auth)):
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
def set_telegram_config(req: TelegramConfigRequest, admin: Dict[str, Any] = Depends(require_admin)):
    cfg = {
        "bot_token": req.bot_token.strip(),
        "chat_id": req.chat_id.strip(),
        "enabled": req.enabled
    }
    save_telegram_config(cfg)
    return {"success": True, "message": "Konfigurasi Telegram berhasil disimpan!"}


@app.post("/api/telegram/send-alert")
def trigger_telegram_alert(admin: Dict[str, Any] = Depends(require_admin)):
    cfg = load_telegram_config()
    if not cfg.get("bot_token") or not cfg.get("chat_id"):
        raise HTTPException(status_code=400, detail="Telegram Bot Token atau Chat ID belum dikonfigurasi.")

    result = send_daily_alert()
    if not result.get("success"):
        raise HTTPException(status_code=500, detail="Gagal mengirim pesan ke Telegram. Periksa Bot Token dan Chat ID Anda.")

    return {"success": True, "message": "Sinyal screener berhasil dikirim ke Telegram Anda!"}


# -------------------------------------------------------------
# ADMIN USER MANAGEMENT (Admin Only)
# -------------------------------------------------------------
class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = "user"
    duration_days: Optional[int] = 30


class ResetPasswordRequest(BaseModel):
    new_password: str


class UpdateExpiryRequest(BaseModel):
    duration_days: Optional[int] = 30
    mode: str = "add"  # "add", "set", "lifetime"


@app.get("/api/admin/users")
def get_admin_users(admin: Dict[str, Any] = Depends(require_admin)):
    return {"status": "ok", "users": list_all_users()}


@app.post("/api/admin/users")
def add_admin_user(req: CreateUserRequest, admin: Dict[str, Any] = Depends(require_admin)):
    try:
        created = create_new_user(req.username, req.password, req.role, duration_days=req.duration_days)
        return {"status": "ok", "message": f"Pengguna '{created['username']}' berhasil didaftarkan ({created['expiry_str']})!", "user": created}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/admin/users/{username}/expiry")
def update_admin_user_expiry(username: str, req: UpdateExpiryRequest, admin: Dict[str, Any] = Depends(require_admin)):
    try:
        updated = update_user_expiry(username, duration_days=req.duration_days, mode=req.mode)
        return {
            "status": "ok",
            "message": f"Masa aktif akun '{username}' berhasil diperbarui ({updated['expiry_str']})!",
            "user": updated
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/admin/users/{username}")
def remove_admin_user(username: str, admin: Dict[str, Any] = Depends(require_admin)):
    try:
        success = delete_user(username)
        if not success:
            raise HTTPException(status_code=404, detail=f"Pengguna '{username}' tidak ditemukan.")
        return {"status": "ok", "message": f"Pengguna '{username}' berhasil dihapus."}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/admin/users/{username}/reset-password")
def reset_admin_user_password(username: str, req: ResetPasswordRequest, admin: Dict[str, Any] = Depends(require_admin)):
    try:
        success = reset_user_password(username, req.new_password)
        if not success:
            raise HTTPException(status_code=404, detail=f"Pengguna '{username}' tidak ditemukan.")
        return {"status": "ok", "message": f"Password untuk '{username}' berhasil direset. Sesi di perangkat lain otomatis dihentikan."}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

