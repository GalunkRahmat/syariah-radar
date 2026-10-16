"""
CLI Launcher for Indonesian Sharia Stock Screener Pro
Run this script anytime from terminal to get today's 3-pillar swing trading candidates.
"""

import argparse
import sys
from datetime import datetime
from screener.data_fetcher import fetch_all_sharia_data
from screener.engine import run_screener


def print_banner():
    print("=" * 85)
    print("   IDX SHARIA SWING RADAR PRO (ISSI / JII / JII70)")
    print("   3-Pilar: Teknikal (MA50>100>200) + Bandarmologi (VPA) + Fundamental Syariah")
    print(f"   Waktu Eksekusi: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 85)


def format_idr(val: int) -> str:
    return f"Rp {val:,.0f}".replace(",", ".")


def calculate_lots(entry: float, stop_loss: float, capital: float = 50_000_000, risk_pct: float = 2.0):
    risk_per_share = entry - stop_loss
    if risk_per_share <= 0:
        return 1, 100, int(entry * 100)
    max_loss_idr = capital * (risk_pct / 100)
    total_shares = int(max_loss_idr / risk_per_share)
    lots = max(1, total_shares // 100)
    allocated = lots * 100 * entry
    return lots, lots * 100, int(allocated)


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="IDX Sharia Swing Stock Screener Pro")
    parser.add_argument("--force-refresh", action="store_true", help="Paksa download data baru dari Yahoo Finance")
    parser.add_argument("--capital", type=float, default=50_000_000, help="Modal portofolio untuk kalkulator lot (Default: Rp 50 Juta)")
    parser.add_argument("--risk", type=float, default=2.0, help="Toleransi risiko per trade %% (Default: 2%%)")
    args = parser.parse_args()

    print_banner()

    # 1. Fetch data
    market_data = fetch_all_sharia_data(force_refresh=args.force_refresh)
    if not market_data:
        print("[ERROR] Gagal mendapatkan data pasar. Pastikan koneksi internet aktif.")
        sys.exit(1)

    print(f"[SCREENING] Memproses dan menyaring {len(market_data)} saham syariah pilihan...")

    # 2. Run screener
    candidates = run_screener(market_data)

    print(f"\n[HASIL] Ditemukan {len(candidates)} saham syariah yang memenuhi kriteria Swing Trading:\n")

    if not candidates:
        print("  Tidak ada saham yang lolos kriteria ketat hari ini.")
        print("  (Kondisi pasar mungkin sedang sideways atau bearish).")
        return

    # Header
    print(f"{'TICKER':<7} {'HARGA':<8} {'CHG %':<8} {'SETUP':<17} {'RISIKO':<12} {'BANDAR':<17} {'ROE %':<7} {'DER %':<7} {'SKOR':<5}")
    print("-" * 96)

    for c in candidates:
        bandar_lbl = c.get('bandarmologi', {}).get('label', 'Netral')
        fund = c.get('fundamental', {})
        roe_str = f"{fund.get('roe', '-')}%" if fund.get('roe') is not None else "-"
        der_str = f"{fund.get('der', '-')}%" if fund.get('der') is not None else "-"
        risk_short = "Grade A+" if c.get('risk_level') == "LOW_RISK" else ("Moderat" if c.get('risk_level') == "MEDIUM_RISK" else "Spekulatif")
        print(f"{c['code']:<7} {c['price']:<8} {c['change_pct']:+5.2f}%  {c['setup_type']:<17} {risk_short:<12} {bandar_lbl:<17} {roe_str:<7} {der_str:<7} {c['score']:<5}")

    print("-" * 96)
    print(f"\n[DETAIL TRADING PLAN & LOT SIZING (Modal: {format_idr(int(args.capital))}, Risiko: {args.risk}%)]:\n")

    for i, c in enumerate(candidates[:5], 1):
        plan = c['trading_plan']
        bandar = c.get('bandarmologi', {})
        fund = c.get('fundamental', {})
        lots, shares, alloc = calculate_lots(plan['entry'], plan['stop_loss'], args.capital, args.risk)
        alloc_pct = (alloc / args.capital) * 100

        print(f"{i}. {c['code']} - {c['name']} (Sektor: {c['sector']})")
        print(f"   Harga Saat Ini : {format_idr(c['price'])} ({c['change_pct']:+5.2f}%) | Skor Total: {c['score']}/100")
        print(f"   Analisis 3-Pilar: Teknikal={c['tech_score']}/100 | Bandar={c['bandar_score']}/100 ({bandar.get('label')}) | Fundamental={c['fund_score']}/100")
        print(f"   Bandarmologi   : VWAP 20={format_idr(int(bandar.get('vwap_20', 0)))} | Dominasi Beli 5-Hari={bandar.get('buy_volume_pct_5d')}% | MFI={c['mfi']}")
        print(f"   Fundamental    : ROE={fund.get('roe')}% | DER={fund.get('der')}% | PBV={fund.get('pbv')}x | PER={fund.get('pe')}x ({fund.get('cap_category')})")
        print(f"   Trading Plan   :")
        print(f"     * Area Entry : {format_idr(plan['entry'])}")
        print(f"     * Stop Loss  : {format_idr(plan['stop_loss'])} (-{plan['risk_pct']}%)")
        print(f"     * Target TP1 : {format_idr(plan['tp1'])} (+{plan['tp1_pct']}%) [R:R 1:1.5]")
        print(f"     * Target TP2 : {format_idr(plan['tp2'])} (+{plan['tp2_pct']}%) [R:R 1:2.5]")
        print(f"   [$] Money Management Rekomendasi:")
        print(f"     * Ukuran Posisi: {lots:,} Lot ({shares:,} lembar)".replace(",", "."))
        print(f"     * Modal Beli   : {format_idr(alloc)} ({alloc_pct:.1f}% dari modal portofolio)")
        print(f"     * Maksimal Rugi: {format_idr(int(shares * (plan['entry'] - plan['stop_loss'])))} (Terkunci aman di batas toleransi risiko)")
        print()


if __name__ == "__main__":
    main()
