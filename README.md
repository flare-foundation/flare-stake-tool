# Flare P-chain Staking Tool

This repo contains a tool for staking assets.

Because Flare is a fork of [Avalanche](https://docs.avax.network/overview/getting-started/avalanche-platform), like Avalanche, it has three chains:

- C-chain: contract chain, executes EVM smart contracts that manage assets (like ERC-20 tokens).
- P-chain: platform chain, coordinates validators.
- X-chain: exchange chain, handles assets.

When validators require tokens to work (for example, as stake in proof-of-stake systems), these assets need to be moved from the C-chain to the P-chain.
This tool also supports moving assets between the C- and P-chains and back.

## Installation

There are two ways to install the tool.
We recommend using `npm` unless you plan to contribute to this repository.

### Using npm

```bash
npm install @flarenetwork/flare-stake-tool --global
```

If you experience permissions issues, try:

```bash
sudo npm install @flarenetwork/flare-stake-tool --global
```

### Manually building the repository

1. Clone this repository by running

   ```bash
   git clone https://github.com/flare-foundation/p-chain-staking-code.git
   ```

2. Run `yarn` inside the cloned repo folder.

3. Run `yarn build`.

4. Follow the rest of this guide from the repo folder using `bin/flare-stake-tool` instead of just `flare-stake-tool`.

## Set up your private key

> **WARNING:**
> You are about to write your staking account's **private key** into a **plain text file**.
> The following operations should be performed on a **secure** machine, ideally not the validator node.
> For added security, store the private key file in a removable storage device, plugged in only when needed.

1. Obtain the private key (either a length 64 hexadecimal or [cb58 format](https://support.avax.network/en/articles/4587395-what-is-cb58)).
2. Create a file to hold your private key.
3. Paste this code in as follows and enter either the Hex or CB58 private key within the quotation marks:

   ```bash
   PRIVATE_KEY_CB58 = "private key"
   PRIVATE_KEY_HEX = "private key"
   ```

## Operations

These are the operations you can perform with this tool.

### Address conversion

Convert the private key to P-chain and C-chain addresses to import and export them safely, without exposing a private key.
The public key is derived from the private key and the P- and C-chain addresses are derived from the public key.
To get the derived P- and C-chain addresses, along with the associated public key, use:

```bash
flare-stake-tool info addresses --env-path <path to your private key file>
```

Where:

- `env-path` is the path to the file where you stored the private key.

By default the tool connects to the Flare network. You can add `--network costwo` to connect to Coston2, or `--network localflare` to connect to a node running on the same machine.

Sample response:

The X-, P-, and C-chain addresses are returned, along with the public key.
There is no standard address format for the X- and P-chains, but it’s usually Bech32.
On the C-chain, the Ethereum format is normally used to comply with the Ethereum Virtual Machine.

```bash
X-chain address: X-flare1pynhfl09rfrf20s83lf6ra5egqylmx757ahxn6
P-chain address: P-flare1pynhfl09rfrf20s83lf6ra5egqylmx757ahxn6
C-chain address hex: 0xead9c93b79ae7c1591b1fb5323bd777e86e150d4
secp256k1 public key: qQMFKMYJpmt7iWRLncoMukdZ2aNCDMwR
```

### Export and import assets

#### Move assets from the C-chain to the P-chain

Funds typically reside on the C-chain account, so they have to be exported from it.
Exported funds must then be imported to the corresponding P-chain account.

This requires one transaction on each chain so you need to issue two commands:

```bash
flare-stake-tool crosschain exportCP -a <amount> -f <fee> --env-path <path to your private key file>
flare-stake-tool crosschain importCP --env-path <path to your private key file>
```

Where:

- `amount` is the amount to export, in FLR.
- `fee` is optional. It specifies a gas fee for a transaction in FLR.
- `env-path` is the path to the file where you stored your private key.

> **Note:**
> Methods affecting the P-chain (`importCP` and `exportPC`) always use a fixed gas fee of 0.001FLR, while methods affecting the C-chain (`exportCP` and `importPC`) have variable gas fees and can thus be either set or calculated automatically.
If you get the `errInsufficientFunds` error, try specifying a higher gas fee when exporting funds.

Sample response:

```bash
Used fee of .000280750
Success! TXID: 2i5zkusqNou8irBKeJQkYVXp72ZVFeXYhKDdN1S3zCUy35vNAb
Success! TXID: xNThCnRNMTGnZy8PZgdoyEpTTnRKMBLFfEgH27FzQCFHv79ra
```

#### Move assets from the P-chain back to the C-chain

> **IMPORTANT:**
> These commands are similar to exporting and importing assets from the C-chain to the P-chain, but they are not the same.
Note the reversed P and C.

```bash
flare-stake-tool crosschain exportPC -a <amount> --env-path <path to your private key file>
flare-stake-tool crosschain importPC -f <fee> --env-path <path to your private key file>
```

where `amount` and `fee` are optional.

> **IMPORTANT:**
> Omitting `amount` exports all funds from the P-chain.

> **Note:**
> Methods affecting the P-chain (`importCP` and `exportPC`) always use a fixed gas fee of 0.001FLR, while methods affecting the C-chain (`exportCP` and `importPC`) have variable gas fees and can thus be either set or calculated automatically.
If you get the `errInsufficientFunds` error, try specifying a higher gas fee when exporting funds.

### Staking

```bash
flare-stake-tool stake -n <nodeId> -d <duration> -a <amount> --env-path <path to your private key file>
```

Where:
- `nodeId` is the ID of the node being deployed as a validator.
- `duration` is the staking time in seconds.
- `amount` is the amount to export and stake in FLR. The minimum is 2000 FLR and the maximum is 10000 FLR.
- `env-path` is the path to the file where you stored your private key.
- `network` is not available to change for staking. It is always the Flare network.

The funds on the P-chain account are available to start staking to the validator nodes.

When the `duration` ends, the nodes automatically stop acting as validators and the staked amount is returned to the C-chain account or you can move them back before the end of the duration.

To check whether a validator has been added successfully, fetch lists of both pending and current validators with this command:

```bash
flare-stake-tool info validators
```

## Testing locally with a `go-flare` node

This code can be tested locally on the `localflare` network, using a node with code sourced from [the go-flare repo](https://github.com/flare-foundation/go-flare).

First, add a private key with some funds on the C-chain into the `.env` file.
You can use the well-funded test account with the private key:
`0xd49743deccbccc5dc7baa8e69e5be03298da8688a15dd202e20f15d5e0e9a9fb`.

Then, you have to hardcode your validator configuration hash directly into the node code.
Say you want to use the node with id `NodeID-DMAS3hKKWMydmWGmGd265EYCoV7zFWEHK` to stake `10000` FLR for a duration of `1512000` seconds.
To calculate the hash, run:

```sh
flare-stake-tool hash -n NodeID-DMAS3hKKWMydmWGmGd265EYCoV7zFWEHK -w 10000 -d 1512000 --env-path /path/to/.env --network localflare
```

The above produces `2b52aae672d041ec5ec597bb72b6c1815f01f2b895ed5cddb42c45ca0e629317`.
Add this hash to [this array here](https://github.com/flare-foundation/go-flare/blob/main/avalanchego/utils/constants/validator_config.go#L76) in your cloned `go-flare` repo.
Now you can set up the node(s) as described in [the go-flare repo](https://github.com/flare-foundation/go-flare).

Staking requires first exporting funds from C-chain, importing them to P-chain,
and then stake them by adding a validator node with specific configurations to the network.
This is done by running the following scripts

```bash
flare-stake-tool crosschain exportCP -a 10000 -f <fee> --env-path /path/to/.env --network localflare
flare-stake-tool crosschain importCP --env-path /path/to/.env --network localflare
flare-stake-tool stake -n NodeID-DMAS3hKKWMydmWGmGd265EYCoV7zFWEHK -w 10000 -d 1512000 --env-path /path/to/.env --network localflare
```

In case of `errInsufficientFunds` error, try raising the fee when exporting funds.

## Versions

Some info on upgrading this tool to a new version.

1. Build the project with `yarn build`
2. Check that lib can be created `npm pack`
3. Bump to next version `npm version [<newversion> | major | minor | patch | premajor | preminor | prepatch | prerelease | from-git]`
4. Publish with `npm publish`
5. Make sure to push to git with `git push`
