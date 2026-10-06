#!/bin/bash
# Double-click (macOS) to open the Morph Icons page locally.
# The page needs to be served over HTTP: opening index.html directly blocks
# its scripts. This starts a small local server and opens the browser.
# Close this Terminal window to stop the server.

cd "$(dirname "$0")" || exit 1

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 est introuvable. Installez les outils en ligne de commande : xcode-select --install"
  read -r -p "Appuyez sur Entrée pour fermer."
  exit 1
fi

PORT=8934
while lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do PORT=$((PORT + 1)); done

python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill "$SERVER" 2>/dev/null' EXIT

# Wait until the server answers (max ~5 s), then open the browser.
for _ in $(seq 1 50); do
  curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break
  sleep 0.1
done
open "http://localhost:$PORT/"

echo "Morph Icons : http://localhost:$PORT"
echo "Fermez cette fenêtre pour arrêter le serveur."
wait "$SERVER"
