const request = require('request')

const rpcurl = 'http://localhost:9650'

const chains = ['X', 'C', 'P']
chains.map(chain =>
  request(
    {
      url: `${rpcurl}/ext/info`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: `{
    "jsonrpc":"2.0",
    "id"     :1,
    "method" :"info.getBlockchainID",
    "params": {
        "alias":"${chain}"
    }
  }`,
    },
    (error, response, body) => {
      if (!error && response.statusCode == 200) {
        const data = JSON.parse(body)
        console.log(
          `blockchainId for ${chain}-chain: ${data.result.blockchainID}`
        )
      }
    }
  )
)

request(
  {
    url: `${rpcurl}/ext/bc/P`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: `  {
    "jsonrpc": "2.0",
    "method": "platform.getStakingAssetID",
    "params": {
      "subnetID": "11111111111111111111111111111111LpoYY"
    },
    "id": 1
  }`,
  },
  (error, response, body) => {
    if (!error && response.statusCode == 200) {
      const data = JSON.parse(body)
      console.log(`assetId: ${data.result.assetID}`)
    }
  }
)