@echo off
rem Remet Claude Pet dans sa version d'avant la dernière modification ou mise à jour,
rem au cas où il ne redémarrerait plus. Double-clique ce fichier.
chcp 65001 >nul
set "COPIE=%APPDATA%\claude-pet\version-precedente"
if not exist "%COPIE%\package.json" (
  echo Aucune version précédente trouvée.
  pause
  exit /b 1
)
xcopy "%COPIE%\*" "%~dp0..\" /E /Y /Q >nul
echo C'est fait : Claude Pet est revenu à sa version précédente. Relance-le avec le raccourci du Bureau.
pause
