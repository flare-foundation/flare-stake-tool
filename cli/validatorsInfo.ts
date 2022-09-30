import { rpcurl } from '../src/constants'
const request = require('request')

const path = '/ext/bc/P'
const fullrpcurl = `${rpcurl}${path}`

request(
  {
    url: fullrpcurl,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: `{
    "jsonrpc": "2.0",
    "method": "platform.getPendingValidators",
    "params": {
        "subnetID": null,
        "nodeIDs": []
    },
    "id": 1
  }`,
  },
  (error: any, response: any, body: any) => {
    if (!error && response.statusCode == 200) {
      const data = JSON.parse(body)
      const validators = JSON.stringify(data.result.validators)
      console.log(`Pending validators: ${validators}`)
    }
  }
)

request(
  {
    url: fullrpcurl,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: `{
    "jsonrpc": "2.0",
    "method": "platform.getCurrentValidators",
    "params": {},
    "id": 1
  }`,
  },
  (error: any, response: any, body: any) => {
    if (!error && response.statusCode == 200) {
      const data = JSON.parse(body)
      const validators = JSON.stringify(data.result.validators)
      console.log(`Current validators: ${validators}`)
    }
  }
)
