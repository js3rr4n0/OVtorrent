@echo off
rem OVtorrent bridge — arranque con doble clic (Windows).
rem Requiere Node.js 20 o superior: https://nodejs.org (instalador "LTS").
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo No se encuentra Node.js. Instala la version LTS desde https://nodejs.org y vuelve a ejecutar este archivo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias del puente ^(solo la primera vez^)...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo La instalacion fallo. Revisa la conexion a Internet y vuelve a intentarlo.
    pause
    exit /b 1
  )
)

set CODE=
if exist codigo.txt set /p CODE=<codigo.txt
if "%CODE%"=="" (
  echo Elige un codigo de emparejamiento ^(minimo 6 caracteres^). Es como una contrasena:
  echo lo introduciras en OVtorrent, Ajustes ^> Calidad y bufer ^> Puente.
  set /p CODE=Codigo: 
  if not "%CODE%"=="" echo %CODE%> codigo.txt
)

echo.
echo Arrancando el puente. Deja esta ventana abierta mientras reproduces.
echo.
if "%CODE%"=="" (
  node src\cli.mjs
) else (
  node src\cli.mjs --code "%CODE%"
)
pause
