#!/bin/bash
# Launcher for Linux. Starts the News-Tok dashboard and opens it in your
# browser. Keep the terminal open while using it; close it to stop.
cd "$(dirname "$0")" || exit 1
echo "🎬  Starting News-Tok..."
echo

if ! command -v node >/dev/null 2>&1; then
  echo "⚠️  Node.js is not installed. Install it (e.g. from https://nodejs.org"
  echo "    or your package manager), then run this again."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "📦  First-time setup (about a minute)..."
  npm install || { echo "❌ Setup failed."; exit 1; }
fi

( sleep 4; xdg-open "http://localhost:4321" >/dev/null 2>&1 ) &
echo
echo "✅  Opening http://localhost:4321 in your browser."
echo "    Keep this terminal open while you use it. Close it to stop the app."
echo
npm run dashboard
