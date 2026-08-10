#!/usr/bin/env bash
# Render a card spec to PNG via headless Chrome, plus a 540px feed-test preview.
# Two-pass: measure natural content height (clamped to [1200, spec max]) so short
# workflows get a squarer card instead of empty gradient, then screenshot at 2x.
# Usage: ./render.sh <spec.json> <out-basename>
set -euo pipefail

SPEC="$1"
OUT="$2"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

W=$(python3 -c "import json;print(json.load(open('$SPEC'))['canvas']['w'])")

PORT=8471
(cd "$DIR" && python3 -m http.server $PORT >/dev/null 2>&1) &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null || true" EXIT
sleep 0.6

# pass 1: measure
node "$DIR/build.mjs" "$SPEC" "$DIR/card.html" measure
NATURAL=$("$CHROME" --headless=new --disable-gpu --window-size="$W",800 \
  --virtual-time-budget=6000 --dump-dom "http://localhost:$PORT/card.html" 2>/dev/null \
  | sed -n 's/.*<title>\([0-9][0-9]*\)<\/title>.*/\1/p' | head -1)
[ -z "$NATURAL" ] && NATURAL=1500

# pass 2: final
node "$DIR/build.mjs" "$SPEC" "$DIR/card.html" final "$NATURAL"
H=$(python3 -c "import json;h=json.load(open('$SPEC'))['canvas']['h'];print(max(1200,min(h,$NATURAL)))")

"$CHROME" --headless=new --disable-gpu \
  --force-device-scale-factor=2 \
  --window-size="$W","$H" \
  --hide-scrollbars \
  --virtual-time-budget=6000 \
  --screenshot="$OUT.png" \
  "http://localhost:$PORT/card.html" 2>/dev/null

sips --resampleWidth 540 "$OUT.png" --out "${OUT}_feed540.png" >/dev/null

echo "rendered: $OUT.png ($(sips -g pixelWidth -g pixelHeight "$OUT.png" | awk '/pixel/{printf "%s ", $2}') natural=$NATURAL)"
echo "feed test: ${OUT}_feed540.png"
