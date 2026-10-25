#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")"

OUT=curl_transcript.txt
: > "$OUT"

log() { echo -e "$1" | tee -a "$OUT"; }

# --- start dependencies -------------------------------------------------
python3 payments_stub_for_demo.py > payments_stub.log 2>&1 &
PAY_PID=$!
python3 app.py > app.log 2>&1 &
APP_PID=$!
sleep 2

log "############################################################"
log "# 1. Successful create — 201 + Location header"
log "############################################################"
curl -s -i -X POST http://localhost:5000/restaurants/rest-001/menu-items \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: onboard-rest-001-dosa-001" \
  -d '{"name":"Masala Dosa","description":"Crispy rice-and-lentil crepe with potato filling.","price":80,"category":"mains"}' \
  | tee -a "$OUT"
log ""

log "############################################################"
log "# 2. Same Idempotency-Key repeated — returns the ORIGINAL item"
log "#    (note: different body below is ignored — no duplicate made)"
log "############################################################"
curl -s -i -X POST http://localhost:5000/restaurants/rest-001/menu-items \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: onboard-rest-001-dosa-001" \
  -d '{"name":"SHOULD NOT APPEAR","price":999}' \
  | tee -a "$OUT"
log ""

log "############################################################"
log "# 3. Malformed body — 400"
log "############################################################"
curl -s -i -X POST http://localhost:5000/restaurants/rest-001/menu-items \
  -H "Content-Type: application/json" \
  -d '{"name":"Bad Item","price":-5}' \
  | tee -a "$OUT"
log ""

log "############################################################"
log "# 4. Missing resource — 404"
log "############################################################"
curl -s -i http://localhost:5000/menu-items/ITEM-doesnotexist \
  | tee -a "$OUT"
log ""

log "############################################################"
log "# 5. State conflict — 409"
log "#    (item is available by default; deleting it before it is"
log "#     marked unavailable must be refused)"
log "############################################################"
FIRST_ITEM_ID=$(curl -s http://localhost:5000/menu-items?restaurantId=rest-001 | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['itemId'])")
log "(item under test: $FIRST_ITEM_ID)"
curl -s -i -X DELETE "http://localhost:5000/menu-items/$FIRST_ITEM_ID" \
  | tee -a "$OUT"
log ""

log "############################################################"
log "# 6. Bonus: read the item, then correctly retire it"
log "############################################################"
curl -s -i "http://localhost:5000/menu-items/$FIRST_ITEM_ID" | tee -a "$OUT"
log ""
curl -s -i -X PATCH "http://localhost:5000/menu-items/$FIRST_ITEM_ID/availability" \
  -H "Content-Type: application/json" \
  -d '{"isAvailable": false}' | tee -a "$OUT"
log ""
curl -s -i -X DELETE "http://localhost:5000/menu-items/$FIRST_ITEM_ID" | tee -a "$OUT"
log ""

log "############################################################"
log "# 7. D3 fallback demo: kill Payments, then create a new item."
log "#    Catalogue must still succeed, but degrade the item to"
log "#    isAvailable=false instead of failing the whole request."
log "############################################################"
kill "$PAY_PID" 2>/dev/null
sleep 1
curl -s -i -X POST http://localhost:5000/restaurants/rest-002/menu-items \
  -H "Content-Type: application/json" \
  -d '{"name":"Filter Coffee","price":25,"category":"beverages"}' \
  | tee -a "$OUT"
log ""

kill "$APP_PID" 2>/dev/null
wait 2>/dev/null
log "############################################################"
log "# done"
log "############################################################"
