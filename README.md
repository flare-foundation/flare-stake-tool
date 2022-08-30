# p-chain-staking-code-samples

To set up, obtain a private key and the derived c-chain address (e.g. by creating an [avalanche wallet](https://wallet.avax.network/))
and log it inside `.env`. Then fund the c-chain address (when testing, through a [faucet](https://faucet.avax.network/)). 
To stake, you need funds on p-chain, which is done via a cross-chain transaction.
Funds are first exported from c-chain, then imported to p-chain and staked there. This is done by running:
- `yarn ts-node src/exportTxCP.ts amount`,
- `yarn ts-node src/importTxCP.ts`,
- `yarn ts-node src/delegate.ts duration amount`.

where `amount` is the amount to export / delegate (in `nAvax`, where `Avax` = 1e9`nAvax`) and duration is the staking time (in seconds).
Minimum staking amount is 1e9 (1 AVAX) and minumum duration is 86400 (1 day). The default network is fuji-testnet, change it in `config.ts`.