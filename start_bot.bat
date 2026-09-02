@echo off
title BULDROP PM Telegram Bot
chcp 65001 >nul
cd /d "%~dp0"
cls
echo =========================================================
echo       BULDROP PM Telegram Bot - Boshqaruv Paneli
echo =========================================================
echo.
echo  [1] Botni kompyuterda ishga tushirish (Local Polling)
echo  [2] Render 24/7 Server holatini tekshirish (Online Status)
echo  [3] Chiqish
echo.
echo =========================================================
set /p choice="Tanlovingizni kiriting (1, 2 yoki 3): "

if "%choice%"=="1" goto run_local
if "%choice%"=="2" goto check_render
if "%choice%"=="3" goto exit_app

echo Noto'g'ri tanlov.
pause
exit /b

:run_local
cls
echo =========================================================
echo   BULDROP PM Bot kompyuterda ishga tushirilmoqda...
echo =========================================================
echo.
node src/index.js
pause
goto exit_app

:check_render
cls
echo =========================================================
echo   Render 24/7 Cloud Server holati tekshirilmoqda...
echo =========================================================
echo.
node -e "fetch('https://buldrop-tg-bot.onrender.com/health').then(r=>r.json()).then(d=>{console.log('✅ Render server holati: ONLINE');console.log(d);}).catch(e=>console.log('❌ Server javob bermadi:', e.message))"
echo.
pause
goto exit_app

:exit_app
