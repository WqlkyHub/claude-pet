@echo off
rem Installe Claude Pet : dépendances, raccourcis Bureau et menu Démarrer, puis le lance.
rem Double-clique ce fichier une fois. Ensuite, utilise le raccourci « Claude Pet » du Bureau.
chcp 65001 >nul
cd /d "%~dp0"
echo Installation des dépendances, ça peut prendre une minute...
call npm install
if errorlevel 1 goto echec
rem Electron télécharge son programme au premier usage : on le demande ici et on note où il est.
node -e "require('fs').writeFileSync('electron-path.txt', require('electron'))"
if errorlevel 1 goto echec
set /p ELECTRON=<electron-path.txt
del electron-path.txt
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\raccourcis.ps1" -Electron "%ELECTRON%"
if errorlevel 1 ( pause & exit /b 1 )
start "" "%ELECTRON%" "%~dp0."
echo.
echo C'est prêt ! Claude Pet démarre, et il se lancera tout seul avec Windows.
echo Tu peux fermer cette fenêtre.
timeout /t 6 >nul
exit /b 0
:echec
echo.
echo L'installation a échoué. Vérifie que Node.js est installé : https://nodejs.org
pause
exit /b 1
