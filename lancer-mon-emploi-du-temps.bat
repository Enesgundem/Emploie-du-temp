@echo off
title Mon Emploi du Temps
cd /d "%~dp0"

echo ========================================================
echo   Lancement de Mon Emploi du Temps (Theme Peugeot 308)
echo ========================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERREUR] Node.js n'est pas detecte sur votre machine.
    echo Veuillez installer Node.js depuis https://nodejs.org pour lancer le serveur local.
    echo.
    pause
    exit /b 1
)

echo Demarrage du serveur local...
node scripts/local-server.js
pause

