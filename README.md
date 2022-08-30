# p-chain-staking-code-samples
The repo is tailored for flare validator staking, where a validator can stake the rewards, 
earned by their FTSO performance. That performance also dictates / updates the staking cap.

## c-chain and p-chain
Flare has three chains - x-chain (transaction chain), c-chain (contract chain), and p-chain (platform chain). The relevant ones here are the latter two. This is because validators get funds on c-chain, but in order to stake, need to transfer them to p-chain 

Note that each chain has a different address. On p-chain there is no standard format and usually Bech32 is used,
while the standard for c-chain matches that of Ethereum (to comply with EVM (Ethereum Virtual Machine)). 

## stake flow
To set up, obtain a private key (length 64 hexadecimal - standard Ethereum format) and paste it into `.env`.
If you want to know your c-address and p-address, use `yarn ts-node src/deriveAddresses.ts`.

To fund the c-chain address, use a flare testnet faucet (e.g. [here](https://faucet.towolabs.com/)).
As staking is done on p-chain, you first need to transfer the funds there. This is done by first exporting 
funds from c-chain to p-chain and then importing them:
- `yarn ts-node src/exportTxCP.ts amount`,
- `yarn ts-node src/importTxCP.ts`.
Staking is then done by:
- `yarn ts-node src/delegate.ts duration amount`.
Here `amount` is the amount to export / delegate (in `FLR` / 1e18) and duration is the staking time (in seconds).

The configuration for the network is inside `config.ts`. 
Mainly, it is used to differentiate the testing (coston2) network and mainnet (flare).

## Note
Flare is not yet operational in its chain implementations, so code is still suited for avalanche.