#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
#  deploy.sh — rebuild + publish Big Bad Wolf to Vercel in one command.
#
#  What it does:
#    1. Bundles src/ → app.js (so the live site has your latest changes).
#    2. Refreshes a clean, secrets-free deploy folder (only the files the
#       browser needs: index.html, app.js, styles.css, vercel.json, assets/).
#    3. Pushes that folder to the LINKED Vercel project (production).
#
#  First-time setup (run once):
#    vercel login         # authorize in the browser
#    vercel link          # create/pick the Vercel project for this game
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
cp index.html app.js styles.css vercel.json manifest.json robots.txt sitemap.xml "$DEST/"
rsync -a --delete --exclude='.DS_Store' assets/ "$DEST/assets/"
find "$DEST" -name '.DS_Store' -delete
echo "    $(find "$DEST" -type f | wc -l | tr -d ' ') files staged."

echo "→ [3/3] Deploying to Vercel (production) ..."
vercel deploy "$DEST" --prod --yes

echo "✓ Done. Live site updated."
