# P-chain staking scripts

The repo contains a cli for adding (staking) FTSO validators on Flare and Coston2 networks. FTSO validators are data providers for Flare Time Series Oracles (FTSO) on respective networks. By submitting price signals and competing for reward they earn certain weight, which allows them to add their validator node for a limited time with exactly the earned weight. Adding a validator node is equivalent to opening a staking session for the prescribed duration with staking amount equal to the prescribed weight, earned by the data providing activity. The amount (weight) is between 1 and 10000 FLR (or C2FLR). A validator can get (or calculate) their staking amount on [this](https://github.com/flare-foundation/Calculating-FTSO-Validation-Block-Creation-Power) repository.

## Installation
Installation of the cli app is done by running `npm install chainstake --global`. 
Or, for development purposes, you can setup the app from cloned repo by running the following scripts
```bash
git clone https://github.com/flare-foundation/p-chain-staking-code.git
yarn
yarn build
npm link
```

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

## CLI app usage

To use the chainstake cli app, one has to first obtain a private key (either a length 64 hexadecimal or cb58 format) and paste it into `.env` 
file, according to the below format
```
PRIVATE_KEY_HEX = "0x..."
PRIVATE_KEY_CB58 = ""
```
Make sure that you run the app on a secure machine.

The cli app is stateless and requires users to provide a path to their `.env` file in the form of a global option `--env-path`.
Another global option is `--network`, which can be set to either `flare` or `costwo` (it defaults to `flare`).

To obtain the derived C-chain and P-chain addresses, along with the associated public key, use 
```bash
chainstake info addresses -e /path/to/.env
```

To perform full stake flow, run the following scripts
```bash
chainstake crosschain exportCP -a <amount> -f <fee> --env-path /path/to/.env
chainstake crosschain importCP --env-path /path/to/.env
chainstake stake -n <nodeId> -d <duration> -w <amount/weight> --env-path /path/to/.env
```
Here, `amount` is the amount to export / stake (in FLR / C2FLR), `fee` is an optional parameter that specifies
the fee of a transaction (in FLR / C2FLR), `duration` is the staking time (in seconds), 
and `nodeId` is the id of the node being deployed as a validator. 

The funds can also be returned from P-chain back to C-chain by running the following scripts
```bash
chainstake crosschain exportPC -a <amount> --env-path /path/to/.env
chainstake crosschain importPC -f <fee> --env-path /path/to/.env
```
where `amount` and `fee` are optional. Omitting `amount` exports all funds from P-chain.

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
chainstake hash -n "NodeID-DMAS3hKKWMydmWGmGd265EYCoV7zFWEHK" -w 10000 -d 1512000 --env-path /path/to/.env --network localflare
```
The above produces the hash `2b52aae672d041ec5ec597bb72b6c1815f01f2b895ed5cddb42c45ca0e629317`.
Add the hash to the array [here](https://github.com/flare-foundation/go-flare/blob/main/avalanchego/utils/constants/validator_config.go#L76) in your cloned `go-flare` repo. Now you can setup the node(s) as described in go-flare's README.md. 

To stake, you have to first export funds from the C-chain and then import them to the P-chain, which is done by running
```bash
chainstake crosschain exportCP -a 10000 -f <fee> --env-path /path/to/.env
chainstake crosschain importCP --env-path /path/to/.env
```
If you get the `errInsufficientFunds` error, try raising the default fee when exporting funds. 
Finally, you can add a validator by running
```bash
chainstake stake -n NodeID-DMAS3hKKWMydmWGmGd265EYCoV7zFWEHK -w 10000 -d 1512000
```

## Versions
Some info on upgrading to a new version.
1. Build the project with `yarn build`
2. Check that lib can be created `npm pack`
3. Bump to next version `npm version [<newversion> | major | minor | patch | premajor | preminor | prepatch | prerelease | from-git]`
4. Publish with `npm publish`
5. Make sure to push to git with `git push`