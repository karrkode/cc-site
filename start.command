#!/bin/bash
# Double-click to start Culture Crew and open it in your browser.
cd "$(dirname "$0")" || exit 1
exec python3 app.py --open
