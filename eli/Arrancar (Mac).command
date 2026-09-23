#!/bin/bash
# Doble clic en Finder para arrancar ORG Mode para Eli en http://localhost:3000
cd "$(dirname "$0")"
( sleep 1; open "http://localhost:3000/ORGanice/" ) &
python3 servir.py
