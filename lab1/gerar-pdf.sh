#!/usr/bin/env bash
# Gera LAB1-Guia.pdf a partir de LAB1-Guia.md, preservando <mark> amarelo.
set -euo pipefail
cd "$(dirname "$0")"

PANDOC="${PANDOC:-$(command -v pandoc || true)}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
HTML="$(mktemp -t LAB1-Guia).html"
CSS="$(mktemp -t LAB1-Guia).css"

cleanup() { rm -f "$HTML" "$CSS"; }
trap cleanup EXIT

if [[ -z "$PANDOC" ]]; then
  echo "pandoc não encontrado no PATH" >&2
  exit 1
fi
if [[ ! -x "$CHROME" ]]; then
  echo "Chrome não encontrado em: $CHROME" >&2
  exit 1
fi

cat >"$CSS" <<'EOF'
body { font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 11pt; line-height: 1.45; max-width: 48rem; margin: 2rem auto; padding: 0 1.5rem; color: #111; }
code, pre { font-family: Menlo, Consolas, monospace; font-size: 0.9em; }
pre { background: #f5f5f5; padding: 0.75rem 1rem; overflow-x: auto; border-radius: 4px; }
mark { background: #ffff00; padding: 0.1em 0.15em; }
h1, h2, h3 { page-break-after: avoid; }
pre, mark { page-break-inside: avoid; }
@page { margin: 2cm; }
EOF

"$PANDOC" LAB1-Guia.md -o "$HTML" --standalone --metadata title="LAB 1" --css="$CSS" --embed-resources
"$CHROME" --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$PWD/LAB1-Guia.pdf" "file://$HTML"
ls -lh LAB1-Guia.pdf
