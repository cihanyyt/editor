#!/usr/bin/env bash
# Runs tests/suite.js against index.html (or the file given as $1) in headless Chrome/Edge.
# Exit codes: 0 = all passed, 1 = test failures, 2 = environment problem.
# Needs internet access (dependencies load from cdnjs).
set -u
cd "$(dirname "$0")/.."

find_browser() {
  if [ -n "${CHROME:-}" ]; then echo "$CHROME"; return; fi
  local c
  for c in \
    "/c/Program Files/Google/Chrome/Application/chrome.exe" \
    "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" \
    "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "$(command -v google-chrome 2>/dev/null)" \
    "$(command -v chromium 2>/dev/null)" \
    "$(command -v chromium-browser 2>/dev/null)"; do
    [ -n "$c" ] && [ -x "$c" ] && { echo "$c"; return; }
  done
}
BROWSER=$(find_browser)
[ -z "$BROWSER" ] && { echo "No Chrome/Edge/Chromium found. Set CHROME=/path/to/browser." >&2; exit 2; }

# Git Bash paths (/c/...) must become C:/... for a file:// URL and for Chrome's flags
winpath() { if command -v cygpath >/dev/null; then cygpath -m "$1"; else echo "$1"; fi; }

APP="${1:-index.html}"
[ -f "$APP" ] || { echo "No such file: $APP" >&2; exit 2; }
BUILD=".test-build.html"
PROFILE=$(mktemp -d)
trap 'rm -rf "$BUILD" "$PROFILE"' EXIT

# Inject the suite after the app's own <script>, so all app globals are available
sed 's#</body>#<script src="tests/suite.js"></script>\n</body>#' "$APP" > "$BUILD"

ROOT=$(winpath "$PWD")   # C:/… on Windows, /home/… on Linux/macOS
# CI runners (Ubuntu) can't use Chrome's user-namespace sandbox; only disable it there
OUT=$("$BROWSER" --headless=new --disable-gpu --no-first-run ${CI:+--no-sandbox} \
  --user-data-dir="$(winpath "$PROFILE")" \
  --allow-file-access-from-files \
  --virtual-time-budget=60000 \
  --dump-dom "file:///${ROOT#/}/$BUILD" 2>/dev/null)

MARKER='<pre id="TEST-RESULTS">'
case "$OUT" in *"$MARKER"*) ;; *) echo "No test results in page output (page failed to load or suite crashed)." >&2; exit 2 ;; esac
RESULTS=${OUT#*"$MARKER"}
RESULTS=${RESULTS%%</pre>*}
RESULTS=$(printf '%s\n' "$RESULTS" | sed 's/&lt;/</g; s/&gt;/>/g; s/&quot;/"/g; s/&amp;/\&/g')
echo "$RESULTS"

echo "$RESULTS" | grep -q '^RESULT: ERROR' && exit 2
echo "$RESULTS" | grep -q '^RESULT: .* 0 failed' && exit 0
exit 1
