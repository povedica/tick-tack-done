#!/usr/bin/env bash
# TTD-AUD-80: explicitly supplied test client only. Never prints bearer secrets.
set -euo pipefail
: "${OAUTH_TOKEN_URL:?Set the staging token URL}"
: "${OAUTH_CLIENT_ID:?Set a synthetic client id}"
: "${OAUTH_TEST_REFRESH_TOKEN:?Set a synthetic refresh token}"
python3 - <<'PYTHON'
import concurrent.futures, json, os, urllib.parse, urllib.request
url = os.environ['OAUTH_TOKEN_URL']
if not url.startswith('https://') and not url.startswith('http://127.0.0.1:'):
    raise SystemExit('HTTPS or loopback required')
body = urllib.parse.urlencode({'grant_type': 'refresh_token',
    'client_id': os.environ['OAUTH_CLIENT_ID'],
    'refresh_token': os.environ['OAUTH_TEST_REFRESH_TOKEN']}).encode()
def renew(_):
    with urllib.request.urlopen(urllib.request.Request(url, body), timeout=30) as response:
        return response.status, json.load(response)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results = list(pool.map(renew, range(2)))
if [status for status, _ in results] != [200, 200] or results[0][1] != results[1][1]:
    raise SystemExit('FAIL: concurrent rotation did not return the same pair')
print('PASS: concurrent refresh 200/200; identical pair; no secrets logged')
PYTHON
