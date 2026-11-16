#!/bin/bash
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js is not installed."
  echo "  Please install the LTS version from https://nodejs.org then run this file again."
  echo ""
  open "https://nodejs.org"
  read -r -p "Press Enter to close"
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Installing for the first time, please wait..."
  npm install --omit=dev
fi
node server.js
