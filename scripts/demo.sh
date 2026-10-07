#!/usr/bin/env bash
# Runs the demo conversation against a local ChatCart in mock mode:  npm start  then  ./scripts/demo.sh
B=${B:-http://localhost:3000}; S=${S:-demo-$RANDOM}
c(){ echo "BUYER: $1"; curl -s $B/api/chat -H 'content-type: application/json' -d "$(python3 -c 'import json,sys;print(json.dumps({"sessionId":sys.argv[1],"message":sys.argv[2]}))' "$S" "$1")" | python3 -c "import sys,json;d=json.load(sys.stdin);print('AGENT:',d['reply']);print('       [tools:',', '.join(d.get('toolCalls',[])),'| cards:',', '.join(a['type']+('='+str(a.get('status'))) if a.get('status') else a['type'] for a in d['attachments']),']')"; }
c "hi"; c "show me bedsheets"; c "add 2 bs-dabu"; c "add a kathputli puppet"; c "checkout"; c "I have paid"
OID=$(curl -s $B/api/dashboard | python3 -c "import sys,json;print(json.load(sys.stdin)['orders'][0]['id'])")
echo "--- buyer opens PayPal link and clicks Complete Purchase (order $OID) ---"
curl -s -o /dev/null -w "approve -> %{redirect_url}\n" -X POST $B/mock-paypal/approve -d "token=$OID"
curl -s -o /dev/null -w "return  -> %{redirect_url}\n" "$B/paypal/return?token=$OID"
c "I have paid"; c "where is my order?"; c "Refund \$10 – one bedsheet has a small dye stain"; c "refund the rest, the parcel arrived late"
RID=$(curl -s $B/api/dashboard | python3 -c "import sys,json;print([r['id'] for r in json.load(sys.stdin)['refunds'] if r['status']=='PENDING_MERCHANT_APPROVAL'][0])")
echo "--- MERCHANT approves $RID on /dashboard ---"; curl -s -X POST $B/api/merchant/refunds/$RID/approve | python3 -c "import sys,json;d=json.load(sys.stdin);print('refund',d['id'],d['status'],d['amount'])"
c "order status"
S=bulk-$RANDOM; c "I need a bulk order of 20 mirror cushion covers, send invoice to hotel.umaid@example.com"
echo "--- dashboard stats ---"; curl -s $B/api/dashboard | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['stats']);print(len(d['actions']),'agent actions logged')"
