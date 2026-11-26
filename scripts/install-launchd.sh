#!/usr/bin/env bash
# Installs a launchd agent that keeps the Gameplan server running (starts at login, restarts on crash).
# Plan 3 (Tauri shell) replaces this. Uninstall: scripts/install-launchd.sh --uninstall
set -euo pipefail

LABEL="dev.gameplan.server"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$HOME/Library/Logs/gameplan.log"
DOMAIN="gui/$(id -u)"

if [[ "${1:-}" == "--uninstall" ]]; then
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "removed $LABEL"
  exit 0
fi

NODE="$(command -v node)"
"$NODE" -e 'const [m]=process.versions.node.split(".");if(+m<24){console.error("Node >= 24 required, found "+process.versions.node);process.exit(1)}'

(cd "$REPO" && npm ci --silent && npm run build --silent)

mkdir -p "$HOME/Library/LaunchAgents" "$(dirname "$LOG")"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$REPO/dist/src/server/main.js</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>GAMEPLAN_PORT</key><string>${GAMEPLAN_PORT:-4747}</string>
$( [[ -n "${GAMEPLAN_DB:-}" ]] && printf '    <key>GAMEPLAN_DB</key><string>%s</string>\n' "$GAMEPLAN_DB" )
  </dict>
</dict>
</plist>
PLIST

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST"
echo "installed $LABEL → http://127.0.0.1:${GAMEPLAN_PORT:-4747} (log: $LOG)"
