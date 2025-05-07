import { songbird } from "./constants/network"

type NetworkId = {
    [key: string]: string
}

export const DEFAULT_NETWORK = "localflare"

export const DEFAULT_BIP44_PATH = "m/44'/60'/0'/0/0"

export const HRP: NetworkId = {
    costwo: "costwo",
    flare: "flare",
    localflare: "localflare",
    coston: "coston",
    songbird: "songbird"
}

export const URL: NetworkId = {
    costwo: "https://coston2-api.flare.network",
    flare: "https://flare-api.flare.network",
    localflare: "http://localhost:9650",
    coston: "https://coston-api.flare.network",
    songbird: "https://songbird-api.flare.network"
}

export const RPC: NetworkId = {
    costwo: "https://coston2-api.flare.network/ext/bc/C/rpc",
    flare: "https://flare-api.flare.network/ext/bc/C/rpc",
    localflare: "http://localhost:9650/ext/bc/C/rpc",
    coston: "https://coston-api.flare.network/ext/bc/C/rpc",
    songbird: "https://songbird-api.flare.network/ext/bc/C/rpc"
}

export const INDEXER: NetworkId = {
    costwo: "https://flare-indexer.flare.rocks/",
    flare: "https://flare-p-chain-indexer.flare.network/",
    localflare: "",
    coston: "",
    songbird: ""
}

export const EXPLORER: NetworkId = {
    costwo: "https://coston2-explorer.flare.network/",
    flare: "https://flare-explorer.flare.network/",
    localflare: "",
    coston: "https://coston-explorer.flare.network/",
    songbird: "https://songbird-explorer.flare.network/"
}

export const CHAIN_ID: NetworkId = {
    costwo: "0x72",
    flare: "0xe",
    localflare: "0xa2",
    coston: "0x10",
    songbird: "0x13"
}

export const CHAIN_NAME: NetworkId = {
    flare: "Flare Mainnet",
    costwo: "Flare Testnet Coston2",
    localflare: "Flare Localnet",
    coston: "Flare Testnet Coston",
    songbird: "Songbird Canary Network"
}

export const CURRENCY_SYMBOL: NetworkId = {
    costwo: "C2FLR",
    flare: "FLR",
    localflare: "LFLR",
    coston: "CFLR",
    songbird: "SGB"
}

export const CURRENCY_NAME: NetworkId = {
    costwo: "Coston2 Flare",
    flare: "Flare",
    localflare: "Local Flare",
    coston: "Coston Flare",
    songbird: "Songbird"
}

export const PCHAIN_STAKE_MIRROR: NetworkId = {
    costwo: "0xd2a1Bb23eB350814a30Dd6f9de78Bb2C8fdD9F1D",
    flare: "0x7b61F9F27153a4F2F57Dc30bF08A8eb0cCB96C22",
    localflare: "",
    coston: "",
    songbird: ""
}
