#!/bin/bash

NETWORK="$1"
TXID="$2"

if [ -z "$NETWORK" ] || [ -z "$TXID" ]; then
  echo "Usage: $0 <network> <txID>"
  exit 1
fi

curl -X POST "https://$NETWORK-api.flare.network/ext/P" \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "platform.getTx",
    "params": {
      "txID": "'"$TXID"'",
      "encoding": "json"
    }
  }' | jq