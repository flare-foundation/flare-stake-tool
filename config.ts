require('dotenv').config('.env')

const localflare = {
  protocol: 'http',
  ip: 'localhost',
  port: 9650,
  networkID: 162,
}

const coston = {
  protocol: 'https',
  ip: 'coston-api.flare.network',
  networkID: 7,
}

const costwo = {
  protocol: 'https',
  ip: 'coston2-api.flare.network',
  networkID: 114,
}

const costworocks = {
  protocol: 'https',
  ip: 'coston2-api.flare.rocks',
  networkID: 114
}

const flare = {
  protocol: 'https',
  ip: 'flare-api.flare.network',
  networkID: 14,
}

module.exports = costworocks
