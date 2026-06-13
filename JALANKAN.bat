@echo off
title RISALATREN - Menjalankan Server
color 0A

echo.
echo  ============================================
echo    RISALATREN - Repositori Informasi Surat
echo    dan Administrasi Pondok Pesantren
echo  ============================================
echo.

:: Cek apakah MySQL berjalan
echo [1/3] Memeriksa MySQL...
sc query MySQL80 | find "RUNNING" >nul 2>&1
if errorlevel 1 (
    echo       MySQL tidak berjalan. Mencoba menjalankan...
    net start MySQL80 >nul 2>&1
    timeout /t 3 /nobreak >nul
    sc query MySQL80 | find "RUNNING" >nul 2>&1
    if errorlevel 1 (
        echo       [GAGAL] MySQL tidak bisa dijalankan.
        echo       Jalankan manual: net start MySQL80
        pause
        exit /b 1
    )
)
echo       MySQL OK

:: Jalankan Backend
echo [2/3] Menjalankan Backend (port 5000)...
start "RISALATREN Backend" cmd /k "cd /d %~dp0backend && node src/server.js"
timeout /t 3 /nobreak >nul
echo       Backend OK

:: Jalankan Frontend
echo [3/3] Menjalankan Frontend (port 5173)...
start "RISALATREN Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
timeout /t 5 /nobreak >nul
echo       Frontend OK

echo.
echo  ============================================
echo    Aplikasi siap diakses!
echo    Buka browser: http://localhost:5173
echo  ============================================
echo.
echo  Login default:
echo    Admin      : admin@risalatren.com / admin123
echo    Sekretaris : sekretaris@risalatren.com / password123
echo    Kepala     : kepala@risalatren.com / password123
echo.

:: Buka browser otomatis
timeout /t 3 /nobreak >nul
start http://localhost:5173

echo  Tekan tombol apa saja untuk menutup jendela ini...
pause >nul
