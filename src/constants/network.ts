
export interface NetworkConfig {
  protocol: string,
  ip: string,
  port?: number,
  networkID: number,
  hrp: string,
  chainID: number,
  DurangoTime: Date
}

export const localflare: NetworkConfig = {
  protocol: 'http',
  ip: 'localhost',
  port: 9650,
  networkID: 162,
  hrp: 'localflare',
  chainID: 162,
  DurangoTime: new Date('2025-01-01T00:00:00Z')
}

export const local: NetworkConfig = {
  protocol: 'http',
  ip: 'localhost',
  port: 9650,
  networkID: 4294967295,
  hrp: 'local',
  chainID: 4294967295,
  DurangoTime: new Date('2025-01-01T00:00:00Z')
}

export const coston: NetworkConfig = {
  protocol: 'https',
  ip: 'coston-api.flare.network',
  networkID: 7,
  hrp: 'coston',
  chainID: 16,
  DurangoTime: new Date('2025-07-01T12:00:00Z')
}

export const costwo: NetworkConfig = {
  protocol: 'https',
  ip: 'coston2-api.flare.network',
  networkID: 114,
  hrp: 'costwo',
  chainID: 114,
  DurangoTime: new Date('2025-06-24T12:00:00Z')
}

export const songbird: NetworkConfig = {
  protocol: 'https',
  ip: 'songbird-api.flare.network',
  networkID: 5,
  hrp: 'songbird',
  chainID: 19,
  DurangoTime: new Date('3025-01-01T00:00:00Z')  // TODO: Update this date
}

export const flare: NetworkConfig = {
  protocol: 'https',
  ip: 'flare-api.flare.network',
  networkID: 14,
  hrp: 'flare',
  chainID: 14,
  DurangoTime: new Date('3025-01-01T00:00:00Z')  // TODO: Update this date
}
