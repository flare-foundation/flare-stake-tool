
export interface NetworkConfig {
  protocol: string,
  ip: string,
  port?: number,
  networkID: number,
  hrp: string
}

export const localflare: NetworkConfig = {
  protocol: 'http',
  ip: 'localhost',
  port: 9650,
  networkID: 162,
  hrp: 'localflare'
}

export const costworocks: NetworkConfig = {
  protocol: 'https',
  ip: 'coston2-api.flare.rocks',
  networkID: 114,
  hrp: 'costwo'
}

export const costwo: NetworkConfig = {
  protocol: 'https',
  ip: 'coston2-api.flare.network',
  networkID: 114,
  hrp: 'costwo'
}

export const flare: NetworkConfig = {
  protocol: 'https',
  ip: 'flare-api.flare.network',
  networkID: 14,
  hrp: 'flare'
}
