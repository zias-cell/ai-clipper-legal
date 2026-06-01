#!/bin/bash
# Double-click launcher for macOS. Starts the News-Tok dashboard and opens
# it in your browser. Keep the window open while using it; close it to stop.
cd "$(dirname "$0")" || exit 1
clear
echo "🎬  Starting News-Tok..."
echo

if ! command -v node >/dev/null 2>&1; then
  echo "⚠️  Node.js is not installed (it's free)."
  echo "    Opening https://nodejs.org — install the big green LTS button,"
  echo "    then double-click this file again."
  open "https://nodejs.org"
  read -r -p "Press Enter to close this window..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "📦  First-time setup (about a minute)..."
  npm install || { echo "❌ Setup failed."; read -r -p "Press Enter..."; exit 1; }
fi

( sleep 4; open "http://localhost:4321" ) &
echo
echo "✅  Opening http://localhost:4321 in your browser."
echo "    Keep THIS window open while you use it. Close it to stop the app."
echo
npm run dashboard
