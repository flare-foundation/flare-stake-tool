/**
 * BLS proofs of possession recorded from two localflare nodes (`info.getNodeID`), as the stake-pk and
 * addAutoRenewedValidator-pk goldens pass them: valid points, and each signature the proof of its own key only.
 */
export const NODE_A_POP = {
  publicKey: "0x83a2f6ccaae3ab909f68cdd2da7d41843aa6723fb24202f65a4b3048eb20e065c30aad5b290e8238a7155a440fde780b",
  signature:
    "0x99e3394f0a161167879218a180d1efe3f571a119b02ecc44334fd8aefd561e7c938d85e7b288c3d92ddb94b7983b56a811ce43a876985278e08039865c952aeba3f1ff31fa8642d4ed2e94cda4e6696c5bc411f8f2bf93928e5b9c7e55ad6cb7",
} as const;

export const NODE_B_POP = {
  publicKey: "0xa09f0233b2682fc9ae699aae49c9e95b86a0b39b6b0617987691a64aeca5a376f71dbdf7bb3d51c684cfe0971b882adc",
  signature:
    "0xb9a3b3cf09f987cd314551bde2c7a1182210d91af36689e5ac31a213e5c5e9c66dc2abd83959b8204264919e2456652f17fc3eed88469a06212787f12ea400977c6319ce2157b5d816000fd19c64dfd55a94e64b49f993664e69f23cf1acf51d",
} as const;
