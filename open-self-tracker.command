#!/bin/bash
# Double-click this file to launch Self Tracker

DIR="$(cd "$(dirname "$0")" && pwd)"

# Kill any existing server on 3001
lsof -ti :3001 | xargs kill -9 2>/dev/null

# Build frontend if dist doesn't exist or is stale
if [ ! -d "$DIR/client/dist" ]; then
  echo "Building frontend..."
  cd "$DIR/client" && npm run build
fi

echo "Starting Self Tracker server..."
cd "$DIR/server"
npm start &
SERVER_PID=$!

sleep 2

echo "Opening in browser..."
open http://localhost:3001

echo ""
echo "Self Tracker is running at http://localhost:3001"
echo "Close this window to stop the server."
echo ""

# Keep script running so user can close it to kill server
trap "kill $SERVER_PID 2>/dev/null" EXIT
wait $SERVER_PID
