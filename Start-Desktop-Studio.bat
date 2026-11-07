@echo off
title CIRCUIT//BEND — DESKTOP LOCAL STUDIO
echo =========================================================
echo   CIRCUIT//BEND — 100%% LOCAL DESKTOP STUDIO LAUNCHER
echo   - Cache Disque 1080p + HTTP Range Seek & Boucles A/B
echo   - Recherche YouTube Integree & Scanner Dossiers PC
echo   - Export MP4 60FPS & Stem Audio .WAV 24-bit
echo   - Sortie VJ Dual-Screen & Pont Audio PC
echo =========================================================
echo.

REM Launch borderless Desktop App window once server & client are ready
start "" cmd /c "timeout /t 3 /nobreak >nul && start msedge --app=http://localhost:5173 --autoplay-policy=no-user-gesture-required || start chrome --app=http://localhost:5173 --autoplay-policy=no-user-gesture-required || start http://localhost:5173"

yarn dev

