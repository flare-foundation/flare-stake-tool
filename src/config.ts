require('dotenv').config('.env')

const localflare = {
  protocol: 'http',
  ip: 'localhost',
  port: 9650,
  networkID: 162,
  hrp: 'localflare'
}

const costworocks = {
  protocol: 'https',
  ip: 'coston2-api.flare.rocks',
  networkID: 114,
  hrp: 'costwo'
}

const costwo = {
  protocol: 'https',
  ip: 'coston2-api.flare.network',
  networkID: 114,
  hrp: 'costwo'
}

const flare = {
  protocol: 'https',
  ip: 'flare-api.flare.network',
  networkID: 14,
  hrp: 'flare'
}

const costworockslocal = {
  protocol: 'http',
  ip: 'localhost',
  port: 9650,
  networkID: 114
}

module.exports = costwo
