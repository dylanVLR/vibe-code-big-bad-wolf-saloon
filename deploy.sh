#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
#  deploy.sh — rebuild + publish Big Bad Wolf to Netlify in one command.
#
#  What it does:
#    1. Bundles src/ → app.js (so the live site has your latest changes).
#    2. Refreshes a clean, secrets-free deploy folder (only the files the
#       browser needs: index.html, app.js, styles.css, netlify.toml, assets/).
#    3. Pushes that folder to the LINKED Netlify site (production).
#
#  First-time setup (run once):
#    netlify login        # authorize in the browser
#    netlify link         # pick the existing "super-lolly-c99fd8" site
#
#  After that, every update is just:
#    ./deploy.sh
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

DEST="../Big-Bad-Wolf-Saloon-deploy"

echo "→ [1/3] Building app.js from src/ ..."
node tools/build.js >/dev/null
echo "    app.js rebuilt."

echo "→ [2/3] Refreshing clean deploy folder ($DEST) ..."
mkdir -p "$DEST"
cp index.html app.js styles.css netlify.toml manifest.json robots.txt sitemap.xml "$DEST/"
rsync -a --delete --exclude='.DS_Store' assets/ "$DEST/assets/"
find "$DEST" -name '.DS_Store' -delete
echo "    $(find "$DEST" -type f | wc -l | tr -d ' ') files staged."

echo "→ [3/3] Deploying to Netlify (production) ..."
netlify deploy --dir="$DEST" --prod

echo "✓ Done. Live site updated."
