curl -X POST https://flare-api.flare.network/ext/bc/P \
    -H "content-type:application/json;" \
    -d "{
        \"jsonrpc\":\"2.0\",
        \"id\"     :1,
        \"method\" :\"platform.getMinStake\",
        \"params\": {
            \"subnetID\":\"11111111111111111111111111111111LpoYY\"
        }
    }"