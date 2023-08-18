# Flare P-chain Staking Tool

This repo contains a tool for staking assets.

> **Note:** This tool is in beta. Use at your own risk.

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

note: for none devs, skip this section.

1. Clone this repository by running
   ```bash
   git clone https://github.com/flare-foundation/p-chain-staking-code.git
   ```
2. Run `yarn` inside the cloned repo folder.
3. Run `yarn build`.
4. Follow the rest of this guide from the repo folder using `bin/flare-stake-tool` instead of just `flare-stake-tool`.

### Setting up your dev environment

open the terminal on your machine and follow the below steps:
1. install NVM (node version manager on your machine) on your machine see [here](https://collabnix.com/how-to-install-and-configure-nvm-on-mac-os/)
2. install node version 16 on your machine `nvm install node 16`
3. make sure NPM was installed using npm -v.

## Setting up your environment

There are three ways to use this app:

1. With a connected ledger device
1. With initialized public key,
1. With private key logged inside your environment file,

The ledger device requires no setup, as the needed public key is always extracted from the connected ledger device.

To initialize this app with your secp256k1 curve public key (hexadecimal prefixed `0x02`, `0x03` or `0x04` or ethereum-specific format `X  Y`, where `X` and `Y` are 32-byte hexadecimals), run the following command:

```bash
flare-stake-tool init-ctx -p <public key> --network <flare or costwo>
```

To use this app in a less-secure manner, you can set your private key as an environment variable. To do this follow the below steps:
1. Obtain the private key (either a length 64 hexadecimal or [cb58 format](https://support.avax.network/en/articles/4587395-what-is-cb58)).
1. Create a file to hold your private key.
1. Paste this code in as follows and enter either the private key in either hex or cb58 format within the quotation marks:

   ```bash
   PRIVATE_KEY_CB58="private key"
   PRIVATE_KEY_HEX="private key"
   ```

> **WARNING:** While easier (as signing is done within the app), we discourage the usage of this app with the private key exposed in the file.
This is because the private key is exposed to 800+ dependencies, and there is no way to audit them all.

In the latter case the signing is done within the app. Again, this is not a secure approach, and you should sign transactions via ledger or log your public key into the app and sign transaction hashes offline with ECDSA over the secp256k1 curve.

## App usage with ledger

Below we describe the functionality offered by the app, when you have your ledger device connected to the computer, with avalanche app running.

### Address conversion

This describes how to view the P- and C-chain addresses. Those addresses are derived from your public key, which in turn can be derived from your private key.

```bash
flare-stake-tool addresses --ledger
```

Sample response:
```bash
P-chain address: P-flare1pynhfl09rfrf20s83lf6ra5egqylmx757ahxn6
C-chain address hex: 0xead9c93b79ae7c1591b1fb5323bd777e86e150d4
secp256k1 public key: 0x02efe41c5d213089cb7a9e808505e9084bb9eb2bf3aa8050ea92a5ae9e20e5a692
```

There is no standard address format for the P-chain, but it’s usually Bech32. On the C-chain, the Ethereum format is normally used to comply with the Ethereum Virtual Machine. Lastly, the public key is in the standard compressed format.

### Check balances

This describes how to view your P- and C-chain balances.

```bash
flare-stake-tool balance --ledger
```

Sample response
```bash
C-chain 0x5a6a8c28a2fc040df3b7490440c50f00099c957a: 999.000000000000000000
P-chain P-flare1mwy6yvuk8xjl87scxfvvl63xtex3ennvkkpasz: 1.000000000
```

Note that the balances are in FLR.

### Export and import assets

#### Move assets from the C-chain to the P-chain

This describes how to move assets from the C-chain to the P-chain.

Funds typically reside on the C-chain account, so they have to be exported from it. Exported funds must then be imported to the corresponding P-chain account. This requires one transaction on each chain so you need to issue two commands.

```bash
flare-stake-tool exportCP -a <amount> -f <fee> --ledger
flare-stake-tool importCP --ledger
```

Where:

- `amount` is the amount to export, in FLR.
- `fee` is optional. It specifies a gas fee for a transaction in FLR.

> **Note:**
> Methods affecting the P-chain (`importCP` and `exportPC`) always use a fixed gas fee of 0.001FLR, while methods affecting the C-chain (`exportCP` and `importPC`) have variable gas fees and can thus be either set or calculated automatically.
If you get the `errInsufficientFunds` error, try specifying a higher gas fee when exporting funds.

Sample response:
```bash
Transaction with id 2Ch7Tp3mBxW4QZ57Lr26bddXf7QqNGrukRVbBgwSbrPWisuxYV sent to the node
```

#### Move assets from the P-chain back to the C-chain

> **IMPORTANT:**
> These commands are similar to exporting and importing assets from the C-chain to the P-chain, but they are not the same.
Note the reversed P and C.

```bash
flare-stake-tool exportPC -a <amount> --ledger
flare-stake-tool importPC -f <fee> --ledger
```

where `amount` and `fee` are optional.

> **IMPORTANT:**
> Omitting `amount` exports all funds from the P-chain.

> **Note:**
> Methods affecting the P-chain (`importCP` and `exportPC`) always use a fixed gas fee of 0.001FLR, while methods affecting the C-chain (`exportCP` and `importPC`) have variable gas fees and can thus be either set or calculated automatically.
If you get the `errInsufficientFunds` error, try specifying a higher gas fee when exporting funds.

### Staking

To add a validator node to the flare network, run the following command:

```bash
flare-stake-tool stake -n <nodeId> -s <start-time> -e <end-time> -a <amount> --delegation-fee <delegation-fee> --ledger
```

Where:
- `nodeId` is the ID of the node being deployed as a validator.
- `start-time` is the unix time of the start of the staking process.
- `end-time` is the unix time of the end of the staking process.
- `amount` is the amount to lock and stake in FLR. The minimum is 2000 FLR and the maximum is 10000 FLR.
- `delegation-fee` is the fee in percent that the validator charges for delegating to it. The minimum is 0 and the maximum is 100.

The funds on the P-chain account are available to start staking to the validator nodes.

When the staking period ends, the nodes automatically stop acting as validators and the staked amount is returned to the C-chain account or you can move them back before the end of the staking period.

To check whether a validator has been added successfully, fetch lists of both pending and current validators with this command:

```bash
flare-stake-tool info validators
```

### Delegating

To delegate to a validator node, run the following command:

```bash
flare-stake-tool delegate -n <nodeId> -s <start-time> -e <end-time> -a <amount> --ledger
```

Where:
- `nodeId` is the ID of the deployed validator node, you wish to delegate to.
- `start-time` is the unix time of the start of the delegation process.
- `end-time` is the unix time of the end of the delegation process.
- `amount` is the amount to lock and delegate in FLR. The minimum is 2000 FLR and the maximum is 10000 FLR.

## Operations with public key

These are the operations you can perform with this tool, when you log in with your public key.

This is a more advanced usage, as raw signing of the transaction buffer hash has to be done externally (e.g. through some custodian wallet API). Each transation thus requires three steps:
1. generate the unsigned transaction inside a json file and take the logged hash / message inside,
1. externally sign the hash and send the signature back to the app to finalize the export transaction.
1. finalize the transaction with the signature and send it to a network node.

The app-generated unsigned transaction json file follows the below format:

```json
{
  "transactionType": "",
  "serialization": "",
  "signatureRequests": [
    {
      "message": "",
      "signer": ""
    }, ...
  ],
  "unsignedTransactionBuffer": ""
}
```

> **NOTE:** The messages and signers inside `signatureRequests` should all be the same, so one signature should always be required.

The signed transaction json file that you should generate via raw signing is the same as unsigned, but with appended raw `message` signature. So it follows the below format:

```json
{
  "transactionType": "",
  "serialization": "",
  "signatureRequests": [
    {
      "message": "",
      "signer": ""
    }, ...
  ],
  "unsignedTransactionBuffer": "",
  "signature": ""
}
```

An example signature looks like `98f8c0d13bf2b5a5b2216894e503a721a099a1944116b802f2d84c0bd83a1bef3378e1b56d7ccd06de321913b8db0e97f4775e1885c86f6bcc583330d37cf5be01` where the last byte is the recovery ID and can be either `00`/`01` or `1b`/`1c`.

Unsigned transaction files are always in the form of `${id}.unsignedTx.json` and signed transaction files are always in the form of `${id}.signedTx.json`. To send a signed transaction named `${id}.signedTx.json`, use the following command:

```bash
flare-stake-tool send -i <transaction-id>
```

### Move assets from the C-chain to the P-chain

Commands for obtaining unsigned transactions are the same as for the ledger in previous section, except that you ommit the `--ledger` flag and additionally have to specify transaction id `-i <transaction-id>`. For example:
```bash
flare-stake-tool exportCP -a <amount> -i <transaction-id>
```

## Operations with private key

To use the app with the private key, you can copy the commands used with ledger and replace `--ledger` flag with `--get-hacked` and add an additional argument `--env-path <path to your private key file>`. For example:

```bash
flare-stake-tool exportCP -a <amount> -i <transaction-id> --env-path <path to your private key file> --get-hacked
```

## Interactive CLI

To use the interactive CLI use the following command:

```bash
flare-stake-tool interactive
```

## Versions

Some info on upgrading this tool to a new version.

1. Build the project with `yarn build`
2. Check that lib can be created `npm pack`
3. Bump to next version `npm version [<newversion> | major | minor | patch | premajor | preminor | prepatch | prerelease | from-git]`
4. Publish with `npm publish --access=public`
5. Make sure to push to git with `git push`
