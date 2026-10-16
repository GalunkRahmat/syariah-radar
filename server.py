"""
Server Runner for Syariah Swing Radar Pro v1.0.0
Starts FastAPI web server accessible from PC and Android smartphone via local Wi-Fi.
"""

import socket
import uvicorn


def get_local_ip() -> str:
    """Detects local LAN IP address to allow opening the app on mobile phone."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def main():
    local_ip = get_local_ip()
    port = 8000

    print("=" * 75)
    print("   [OK] SYARIAH SWING RADAR PRO v1.0.0 BERHASIL AKTIF!")
    print("=" * 75)
    print(f"  > Akses di Komputer (PC)  : http://localhost:{port}")
    print(f"  > Akses di HP Android     : http://{local_ip}:{port}")
    print("    (Pastikan HP dan Komputer Anda terhubung ke jaringan Wi-Fi / Hotspot yang sama)")
    print("  > Cara Pasang ke Layar Utama HP Android:")
    print(f"    1. Buka http://{local_ip}:{port} di browser Google Chrome HP.")
    print("    2. Klik tombol 'Pasang HP' atau menu Chrome (titik 3) -> 'Install Aplikasi'.")
    print(f"  > Dokumentasi API REST   : http://localhost:{port}/docs")
    print("=" * 75)
    print("  Tekan CTRL + C untuk menghentikan server.")
    print("-" * 75)

    uvicorn.run("api.app:app", host="0.0.0.0", port=port, reload=False)


if __name__ == "__main__":
    main()
