#!/bin/bash
# Start een lokale webserver voor de Opportunity Atlas op http://localhost:8080
# (nodig omdat de browser bestanden als data/gebouwen_heerlen.bin niet via file:// laadt)

cd "$(dirname "$0")"

if command -v npx &> /dev/null; then
    npx http-server . --port 8080 -c-1 -o
elif command -v python3 &> /dev/null; then
    python3 -m http.server 8080
elif command -v python &> /dev/null; then
    python -m http.server 8080
else
    echo "Node.js of Python is nodig om de server te starten."
    exit 1
fi
