
export interface NetworkConfig {
  protocol: string,
  ip: string,
  port?: number,
  networkID: number,
  hrp: string,
  chainID: number
}

export const localflare: NetworkConfig = {
  protocol: 'http',
  ip: 'localhost',
  port: 9650,
  networkID: 162,
  hrp: 'localflare',
  chainID: 162
}

export const local: NetworkConfig = {
  protocol: 'http',
  ip: 'localhost',
  port: 9650,
  networkID: 4294967295,
  hrp: 'local',
  chainID: 4294967295
}

export const costworocks: NetworkConfig = {
  protocol: 'https',
  ip: 'coston2-api.flare.rocks',
  networkID: 114,
  hrp: 'costwo',
  chainID: 114
}

export const coston: NetworkConfig = {
  protocol: 'https',
  ip: 'coston-api.flare.network',
  networkID: 7,
  hrp: 'coston',
  chainID: 16
}

export const costwo: NetworkConfig = {
  protocol: 'https',
  ip: 'coston2-api.flare.network',
  networkID: 114,
  hrp: 'costwo',
  chainID: 114
}

export const songbird: NetworkConfig = {
  protocol: 'https',
  ip: 'songbird-api.flare.network',
  networkID: 5,
  hrp: 'songbird',
  chainID: 19
}

export const flare: NetworkConfig = {
  protocol: 'https',
  ip: 'flare-api.flare.network',
  networkID: 14,
  hrp: 'flare',
  chainID: 14
}
