curl -s -X POST --data '{
    "jsonrpc":"2.0",
    "id"     :1,
    "method" :"avax.getAtomicTx",
    "params" :{
        "txID":"2Q3jZfMDHPb1v5cSpMvJt97iSFhNFWdb876nHmKquivz9FXaaF",
        "encoding": "hex"
    }
}' -H 'content-type:application/json;' https://coston2-api.flare.network/ext/bc/C/avax