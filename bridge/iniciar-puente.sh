#!/usr/bin/env bash
# OVtorrent bridge — arranque con doble clic (macOS / Linux).
# Requiere Node.js 20 o superior: https://nodejs.org (instalador "LTS").
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "No se encuentra Node.js. Instala la versión LTS desde https://nodejs.org y vuelve a ejecutar este archivo."
  read -r -p "Pulsa Intro para salir." _
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Instalando dependencias del puente (solo la primera vez)…"
  npm install --no-audit --no-fund
fi

CODE=""
if [ -f codigo.txt ]; then
  CODE="$(head -n 1 codigo.txt | tr -d '\r\n')"
fi
if [ -z "$CODE" ]; then
  echo "Elige un código de emparejamiento (mínimo 6 caracteres). Es como una contraseña:"
  echo "lo introducirás en OVtorrent → Ajustes → Calidad y búfer → Puente."
  read -r -p "Código: " CODE
  if [ -n "$CODE" ]; then printf '%s\n' "$CODE" > codigo.txt; fi
fi

echo
echo "Arrancando el puente. Deja esta ventana abierta mientras reproduces."
echo
if [ -z "$CODE" ]; then
  exec node src/cli.mjs
else
  exec node src/cli.mjs --code "$CODE"
fi
