"""
Telegram Notification Module for IDX Sharia Swing Screener
Sends automated daily trading alerts with 3-Pillar scores and Money Management plans.
"""

import json
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional
import requests

from screener.data_fetcher import fetch_all_sharia_data
from screener.engine import run_screener

CONFIG_FILE = Path("data/telegram_config.json")


def load_telegram_config() -> Dict[str, Any]:
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {"bot_token": "", "chat_id": "", "enabled": False}


def save_telegram_config(config: Dict[str, Any]):
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)


def send_telegram_message(text: str, bot_token: Optional[str] = None, chat_id: Optional[str] = None) -> bool:
    """Sends a formatted message to Telegram using Bot API."""
    cfg = load_telegram_config()
    token = bot_token or cfg.get("bot_token")
    cid = chat_id or cfg.get("chat_id")

    if not token or not cid:
        print("[TELEGRAM] Bot Token or Chat ID not configured.")
        return False

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": cid,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True
    }

    try:
        res = requests.post(url, json=payload, timeout=10)
        res_data = res.json()
        if res_data.get("ok"):
            print("[TELEGRAM] Sinyal berhasil terkirim ke Telegram.")
            return True
        else:
            print(f"[TELEGRAM ERROR] {res_data.get('description')}")
            return False
    except Exception as e:
        print(f"[TELEGRAM EXCEPTION] {e}")
        return False


def build_alert_message(candidates: list) -> str:
    """Formats top swing candidates into a clean, executive Telegram alert message."""
    now_str = datetime.now().strftime("%d %B %Y | %H:%M WIB")
    
    msg = [
        "<b>🚨 RADAR SWING SAHAM SYARIAH BEI (ISSI) 🚨</b>",
        f"<i>📅 Update: {now_str}</i>",
        "══════════════════════",
        f"Ditemukan <b>{len(candidates)} saham</b> potensial hasil analisis 3 Pilar (Teknikal, Bandar, Fundamental).\n"
    ]

    top_picks = candidates[:5]
    if not top_picks:
        msg.append("<i>Hari ini belum ada saham yang memenuhi kriteria Grade A+. Tetap disiplin jaga modal (Cash is King).</i>")
        return "\n".join(msg)

    for i, c in enumerate(top_picks, 1):
        plan = c['trading_plan']
        bandar = c.get('bandarmologi', {})
        fund = c.get('fundamental', {})

        risk_icon = "🛡️" if c.get('risk_level') == "LOW_RISK" else "⚖️"
        
        msg.append(f"<b>{i}. {c['code']} - {c['name']}</b> ({c['sector']})")
        msg.append(f"   {risk_icon} <b>Skor: {c['score']}/100</b> | Setup: <i>{c['setup_type']}</i>")
        msg.append(f"   💰 <b>Bandar:</b> {bandar.get('label', 'Netral')} (VWAP: Rp {bandar.get('vwap_20', 0):,.0f})")
        msg.append(f"   🏛️ <b>Fundamental:</b> ROE {fund.get('roe', '-')}% | DER {fund.get('der', '-')}%")
        msg.append(f"   📍 <b>Area Beli:</b> Rp {plan['entry']:,}".replace(",", "."))
        msg.append(f"   ⛔ <b>Stop Loss:</b> Rp {plan['stop_loss']:,} (-{plan['risk_pct']}%)".replace(",", "."))
        msg.append(f"   🎯 <b>Target TP1:</b> Rp {plan['tp1']:,} (+{plan['tp1_pct']}%)".replace(",", "."))
        msg.append(f"   🚀 <b>Target TP2:</b> Rp {plan['tp2']:,} (+{plan['tp2_pct']}%)".replace(",", "."))
        msg.append("   ────────────────────")

    msg.append("💡 <i>Gunakan fitur Kalkulator Lot di aplikasi untuk mengatur ukuran posisi sesuai toleransi risiko Anda.</i>")
    return "\n".join(msg)


def send_daily_alert() -> Dict[str, Any]:
    """Runs screening and dispatches alert message to Telegram."""
    market_data = fetch_all_sharia_data(force_refresh=False)
    if not market_data:
        return {"success": False, "message": "Gagal mengambil data pasar."}

    candidates = run_screener(market_data)
    message_text = build_alert_message(candidates)
    success = send_telegram_message(message_text)

    return {
        "success": success,
        "total_candidates": len(candidates),
        "message_preview": message_text
    }


if __name__ == "__main__":
    send_daily_alert()
