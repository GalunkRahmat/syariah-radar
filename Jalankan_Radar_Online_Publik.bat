@echo off
title Syariah Swing Radar Pro - Online Public Server
cls
echo ===================================================================
echo     SYARIAH SWING RADAR PRO v1.0.0 - JALUR ONLINE INTERNET
echo ===================================================================
echo.
echo 1. Memastikan server lokal aktif...
start /b "" "C:\Users\Galunk Rahmat\AppData\Local\Programs\Python\Python311\python.exe" server.py
timeout /t 3 /nobreak >nul
echo.
echo 2. Menghubungkan ke Cloudflare Internet Tunnel...
echo.
cloudflared.exe tunnel --url http://localhost:8000
pause
