# P-chain staking scripts

The repo contains scripts for adding (staking) FTSO validators on Flare and Coston2 networks. FTSO validators are data providers for Flare Time Series Oracles (FTSO) on respective networks. By submitting price signals and competing for reward they earn certain weight, which allows them to add their validator node for a limited time with exactly the earned weight. Adding a validator node is equivalent to opening a staking session for the prescribed duration with staking amount equal to the prescribed weight, earned by the data providing activity. The amount (weight) is between 1 and 10000 FLR (or C2FLR). A validator can get (or calculate) their staking amount on [this](https://github.com/flare-foundation/Calculating-FTSO-Validation-Block-Creation-Power) repository.

## Installation
Clone this repository by running 
```bash
git clone https://github.com/flare-foundation/p-chain-staking-code.git
```
and run `yarn` inside the cloned repo folder.

## C-chain and P-chain

Flare has three chains - X-chain (exchange chain), C-chain (contract chain), and P-chain (platform chain). For stake flow we use C-chain and P-chain. 
An account on each chain is defined by a public-private key pair. The addresses on each of the two chains are derived from the public key.
Note that each chain has different address representations. On the P-chain there is no standard format and usually Bech32 format is used,
while on the C-chain the usual Ethereum format is used (to comply with Ethereum Virtual Machine).

## Stake flow

A usual stake flow works as follows.
- User wants to add a validator node by staking for a given `duration` and `amount` from his account (defined by the private key).
- Funds usually reside on the C-chain account and have to be exported from the C-chain.
- Exported funds can then be imported to the corresponding P-chain account.
- Funds on the P-chain account can be used to start staking (adding validator node).
- After the period (`duration`) ends, the validator is automatically removed (staking is finished).

In order to use the scripts from this repo, one has first to obtain the private key (either a length 64 hexadecimal or cb58 format) and paste it into `.env` file.
Make sure that you run scripts on a secure machine.

To obtain the derived C-chain and P-chain addresses, along with the associated public key, use `yarn getAddresses`.

To perform full stake flow, run the following scripts
```bash
yarn exportCP -a amount -f fee
yarn importCP
yarn stake --id nodeId -d duration -a amount
```

Here, `amount` is the amount to export / stake (in FLR), `fee` is an optional parameter that specifies
the fee of a transaction (in FLR), `duration` is the staking time (in seconds), 
and `nodeId` is the id of the node you wish to deploy as a validator. 

The configuration for the network is inside `config.ts`. 
Mainly, it is used to differentiate between testnet (Coston2) and mainnet (flare).

## Getting funds from P-chain back to C-chain

The funds can be returned from P-chain back to C-chain by running the following scripts
```bash
yarn exportPC -a amount -f fee
yarn importPC
```
where `amount` and `fee` are optional. Omitting `amount` whithdraws everything from P-chain.

Note that methods affecting the P-chain (`importCP` and `exportPC`) always use a fixed fee of 0.001,
while methods affecting the C-chain (`exportCP` and `importPC`) have variable fees and can thus be
either set or else calculated automatically.

## Testing locally with `go-flare` node

This code can be tested locally, using a node sourced [here](https://github.com/flare-foundation/go-flare).

First, add a private key with some funds on C-chain into `.env` - you can use a well-funded test account
with the private key `0xd49743deccbccc5dc7baa8e69e5be03298da8688a15dd202e20f15d5e0e9a9fb`.

Then, you have to register your validator configuration hash directly in the node code.
Say you want to use the node with id `NodeID-DMAS3hKKWMydmWGmGd265EYCoV7zFWEHK` to stake `10000` FLR
for duration of `1512000` seconds. To calculate the hash, run
```bash
yarn getHash --id NodeID-DMAS3hKKWMydmWGmGd265EYCoV7zFWEHK -a 10000 1512000
```
The above produces the hash `2b52aae672d041ec5ec597bb72b6c1815f01f2b895ed5cddb42c45ca0e629317`.
Add the hash to the array [here](https://github.com/flare-foundation/go-flare/blob/main/avalanchego/utils/constants/validator_config.go#L76) in your cloned `go-flare` repo. Now you can setup the node(s) as described in go-flare's README.md. 

To stake, you have to first export funds from the C-chain and then import them to the P-chain, which is done by running
`yarn exportCP -a 10000` and `yarn importCP` (if you get `errInsufficientFunds` error, 
try raising the default fee when exporting funds). Finally, you can add a validator by running
```bash
yarn stake NodeID-DMAS3hKKWMydmWGmGd265EYCoV7zFWEHK 10000 1512000
```
