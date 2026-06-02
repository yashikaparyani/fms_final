#!/usr/bin/env bash
#
# ============================================================
#  FMSS deployment script  —  RUN THIS ON THE SERVER (EC2)
# ============================================================
#
#  What it does:
#    1. Pulls your latest code from GitHub
#    2. Backend  : installs deps + restarts the Node API (PM2)
#    3. Frontend : installs deps + builds the site + publishes it to Nginx
#
#  How to use (inside the server, after `ssh ...`):
#    cd ~/fms_final/FMSS
#    chmod +x deploy.sh        # only the FIRST time (makes it runnable)
#    ./deploy.sh               # full deploy (backend + frontend)
#    ./deploy.sh backend       # only the backend changed
#    ./deploy.sh frontend      # only the website changed
#
#  NOTE: This does NOT touch your .env files (they live only on the
#        server and are safe). It only updates code.
# ============================================================

set -euo pipefail   # stop immediately if any step fails

# ---------- Settings (change only if your paths/names differ) ----------
APP_DIR="$HOME/fms_final/FMSS"   # the FMSS folder inside your repo
WEB_ROOT="/var/www/fmss"         # where Nginx serves the built website
PM2_NAME="fmss-server"           # PM2 name of your backend
BRANCH="master"                  # GitHub branch to pull from
# -----------------------------------------------------------------------

# Make node / npm / pm2 available even when run as a plain script
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

TARGET="${1:-all}"   # default to "all" if no argument is given

echo "==================================================="
echo " FMSS deploy   |   target: $TARGET"
echo "==================================================="

# ---------- 1. Pull the latest code ----------
echo ">> Pulling latest code from GitHub ($BRANCH)..."
cd "$APP_DIR"
git pull origin "$BRANCH"

# ---------- 2. Backend ----------
deploy_backend() {
  echo ">> [backend] Installing dependencies..."
  cd "$APP_DIR/server"
  npm install

  echo ">> [backend] Restarting with PM2..."
  if pm2 describe "$PM2_NAME" > /dev/null 2>&1; then
    pm2 restart "$PM2_NAME"
  else
    pm2 start index.js --name "$PM2_NAME"
  fi
  pm2 save
  echo ">> [backend] Done."
}

# ---------- 3. Frontend ----------
deploy_frontend() {
  echo ">> [frontend] Installing dependencies..."
  cd "$APP_DIR/client"
  npm install

  echo ">> [frontend] Building the website..."
  npm run build      # creates the fresh 'dist' folder

  echo ">> [frontend] Publishing build to $WEB_ROOT..."
  sudo mkdir -p "$WEB_ROOT"
  sudo rm -rf "${WEB_ROOT:?}/"*    # clear old files (safe: build already succeeded)
  sudo cp -r dist/* "$WEB_ROOT/"

  echo ">> [frontend] Reloading Nginx..."
  sudo nginx -t && sudo systemctl reload nginx
  echo ">> [frontend] Done."
}

# ---------- Decide what to run ----------
case "$TARGET" in
  backend)  deploy_backend ;;
  frontend) deploy_frontend ;;
  all)      deploy_backend; deploy_frontend ;;
  *)        echo "Unknown option: '$TARGET'  (use: all | backend | frontend)"; exit 1 ;;
esac

echo "==================================================="
echo " ✅ Deploy complete  (target: $TARGET)"
echo "---------------------------------------------------"
pm2 status "$PM2_NAME" || true
echo "==================================================="
