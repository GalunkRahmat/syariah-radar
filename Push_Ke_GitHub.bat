@echo off
title Push Syariah Radar ke GitHub
cls
echo ===================================================================
echo     PUSH SYARIAH SWING RADAR KE GITHUB (GalunkRahmat/syariah-radar)
echo ===================================================================
echo.
echo Sedang mengunggah file ke GitHub...
echo Jendela browser akan otomatis terbuka untuk login/otorisasi akun GitHub Anda.
echo.
"C:\Program Files\Git\cmd\git.exe" push -u origin main
echo.
echo ===================================================================
if %ERRORLEVEL% EQU 0 (
    echo [BERHASIL] Seluruh file sukses terunggah ke GitHub!
) else (
    echo [INFO] Jika proses terhenti atau butuh login, ikuti petunjuk di layar.
)
echo ===================================================================
pause
