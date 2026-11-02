<div align="center">
  <a href="https://flare.network/" target="blank">
    <img src="https://content.flare.network/Flare-2.svg" width="300" alt="Flare Logo" />
  </a>
  <br />
  Utilities for staking on the Flare network
  <br />
  <a href="#flare-p-chain-staking-tool">About</a>
  ·
  <a href="CONTRIBUTING.md">Contributing</a>
  ·
  <a href="SECURITY.md">Security</a>
  ·
  <a href="CHANGELOG.md">Changelog</a>
</div>

# Flare P-chain Staking Tool

This repo contains a tool for staking assets.

Because Flare is a fork of [Avalanche](https://docs.avax.network/overview/getting-started/avalanche-platform), like Avalanche, it has three chains:

- C-chain: contract chain, executes EVM smart contracts that manage assets (like ERC-20 tokens).
- P-chain: platform chain, coordinates validators.
- X-chain: exchange chain, handles assets.

When validators require tokens to work (for example, as stake in proof-of-stake systems), these assets need to be moved from the C-chain to the P-chain.
This tool also supports moving assets between the C- and P-chains and back.

## Installation

There are two ways to install the tool. Unless you plan to contribute to this repository, We recommend using `pnpm` and `node` with version >= 24.0.0.

### Using npm

```bash
npm install @flarenetwork/flare-stake-tool --global
```

### Manually building the repository

For developers, first clone the repo with

```bash
git clone https://github.com/flare-foundation/flare-stake-tool.git
```

then run `pnpm install` and `pnpm build` inside the cloned repo folder, and follow the rest of this guide from the repo folder using `bin/flare-stake-tool` instead of just `flare-stake-tool`.

## Setting up your environment

There are three ways to use this app:

1. With a connected ledger device,
2. With an initialized public key (and a vault id for ForDefi wallet),
3. With a private key logged inside your environment file.

The ledger device requires no setup, as the needed public key is always extracted from the connected ledger device.

To initialize this app with your secp256k1 curve public key (a 32-byte hexadecimal prefixed `0x02`/`0x03` or a 64-byte hexadecimal optionally prefixed `0x04`), run the following command:

```bash
flare-stake-tool init-ctx -p <public key> --network <flare|costwo|songbird|coston|localflare>
```

This allows the app to produce unsigned transaction hashes, which can be signed externally (using ECDSA), and then sent back to the app to finalize the transaction.

To use this app in a less-secure manner, you can set your private key as an environment variable. To do this, follow the below steps:

1. Obtain the private key (32 bytes either in hexadecimal or [cb58](https://support.avax.network/en/articles/4587395-what-is-cb58) format).
2. Create a file to hold your private key.
3. Paste this code in as follows and enter the private key in either hex or cb58 format within the quotation marks:

   ```bash
   PRIVATE_KEY_CB58="private key"
   PRIVATE_KEY_HEX="private key"
   ```

> **WARNING**
> While easier (as signing is done within the app), we discourage the usage of this app with the private key exposed in the file: the key is readable by every dependency of the tool, and there is no way to audit them all.

### Using a different node (staging networks, private nodes)

Each network name comes with a default public node. To use another node of that network, for example a staging deployment that requires an API key, pass the node's base URL and the key:

```bash
flare-stake-tool info balance --network costwo --rpc-url https://<staging-node> --api-key <key> --ledger
```

The key is sent as the `x-apikey` header with every request. A full endpoint URL as copied from the node's documentation, such as `https://<staging-node>/ext/info?x-apikey=<key>`, is accepted too: the API path is dropped and the key is taken from the query string. The same settings can be given once as the environment variables `FLARE_RPC_URL` and `FLARE_API_KEY` for every command, `interactive` included; the command-line options win over them. The network name still decides the address format and the chain ids, so pick the one the node belongs to; the tool checks the node's network ID against it and stops on a mismatch.

## App usage with ledger

Below we describe the functionality offered by the app, when you have your ledger device connected to the computer, with Flare app running.

### Address conversion

This describes how to view the P- and C-chain addresses. Those addresses are derived from your public key, which in turn can be derived from your private key.

```bash
flare-stake-tool addresses --ledger --network <network>
```

Sample response:

```bash
P-chain address: P-flare1pynhfl09rfrf20s83lf6ra5egqylmx757ahxn6
C-chain address hex: 0xead9c93b79ae7c1591b1fb5323bd777e86e150d4
secp256k1 public key: 0x02efe41c5d213089cb7a9e808505e9084bb9eb2bf3aa8050ea92a5ae9e20e5a692
```

The P-chain address is in the Bech32 format, while the C-chain uses the Ethereum format to comply with the Ethereum Virtual Machine. Lastly, the public key is in the standard compressed format.

### Check balances

This describes how to view your P- and C-chain balances.

```bash
flare-stake-tool balance --ledger --network <network>
```

Where:

````
Sample response:
```bash
C-chain 0x5a6a8c28a2fc040df3b7490440c50f00099c957a: 999.000000000000000000 FLR
P-chain P-flare1mwy6yvuk8xjl87scxfvvl63xtex3ennvkkpasz: 1.000000000 FLR
````

### Export and import assets

#### Move assets from the C-chain to the P-chain

This describes how to move assets from the C-chain to the P-chain.

Funds typically reside on the C-chain account, so they have to be exported from it. Exported funds must then be imported to the corresponding P-chain account. This requires one transaction on each chain, so you need to issue two commands.

```bash
flare-stake-tool exportCP -a <amount> -f <fee> --ledger --network <network>
flare-stake-tool importCP --ledger --network <network>
```

Where:

- `amount` is the amount to export, in FLR.
- `fee` is optional. It specifies a gas fee for a transaction in FLR.
- --network is optional. It specifies the network to use. The default is `flare`, but you can also use `costwo`, `songbird`, `coston`, or `localflare`.

> **Note**
> P-chain transactions (`importCP`, `exportPC`, staking) pay the P-chain's dynamic fee from the funds being moved; it cannot be set. C-chain atomic transactions (`exportCP` and `importPC`) take `-f <fee>` (total fee in FLR); when it is omitted the fee is estimated from the current base fee, except in the unsigned-file flow, where it is required so that every signer builds the same transaction.
> The export fee is paid by the C-chain account and the import fee by the imported funds, so the amount arriving on the P-chain is the `amount` exported minus the P-chain import fee.

Sample response:

```bash
Transaction with hash 2Ch7Tp3mBxW4QZ57Lr26bddXf7QqNGrukRVbBgwSbrPWisuxYV sent to the node
```

#### Move assets from the P-chain back to the C-chain

> **IMPORTANT**
> These commands are similar to exporting and importing assets from the C-chain to the P-chain, but they are not the same.
> Note the reversed P and C.

```bash
flare-stake-tool exportPC -a <amount> --ledger --network <network>
flare-stake-tool importPC -f <fee> --ledger --network <network>
```

where `amount`, `fee` and `network` are optional. If amount after `exportPC` is not specified, all funds (minus the fee) are exported.

### Staking

To add a validator node to the flare network, run the following command:

```bash
flare-stake-tool stake -n <nodeId> -e <end-time> -a <amount> --delegation-fee <delegation-fee> --pop-bls-public-key <popBlsPublicKey> --pop-bls-signature <popBlsSignature> --ledger
```

Where:

- `nodeId` is the ID of the node being deployed as a validator.
- `end-time` is the unix time of the end of the staking process, or a duration from now such as `30d`.
- `amount` is the amount to lock and stake in FLR.
- `delegation-fee` is the fee in percent that the validator charges for delegating to it. The minimum is 0 and the maximum is 100. If omitted, it defaults to 20.
- `popBlsPublicKey` is the BLS public key of the validator node.
- `popBlsSignature` is the BLS signature generated by the validator node.

When the staking period ends, the nodes automatically stop acting as validators and the staked amount is returned to the P-chain account. Every command waits until the transaction is accepted and prints its id.

To check whether a validator has been added successfully, fetch lists of current validators with this command:

```bash
flare-stake-tool info validators --network <network> --ledger
```

### Auto-renewed validators (Helicon upgrade)

After the Helicon upgrade a validator can be registered without an end time; it
is renewed automatically every period until you stop it:

```bash
flare-stake-tool addAutoRenewedValidator -n <nodeId> -a <amount> --period 14d --delegation-fee <delegation-fee> --pop-bls-public-key <popBlsPublicKey> --pop-bls-signature <popBlsSignature> --ledger
```

To change the period from the next cycle on, or to stop renewing (the stake
is returned at the end of the current cycle):

```bash
flare-stake-tool setAutoRenewedValidatorConfig -n <nodeId> --period 30d --ledger
flare-stake-tool setAutoRenewedValidatorConfig -n <nodeId> --period 0 --ledger
```

Only the validator authority (by default the address that registered the
validator) can change the configuration. `info validators` shows the current
cycle end, the next period and the authority of every auto-renewed validator.

Durations: `--period`, `--end-time` and `--start-time` accept unix seconds or
a duration such as `2d12h` (units `w`, `d`, `h`, `m`, `s`); an end time given as
a duration counts from now.

### Delegating

To delegate to a validator node, run the following command:

```bash
flare-stake-tool delegate -n <nodeId> -e <end-time> -a <amount> --ledger --network <network>
```

Where:

- `nodeId` is the ID of the deployed validator node, you wish to delegate to.
- `end-time` is the unix time of the end of the delegation process, or a duration from now such as `30d`.
- `amount` is the amount to lock and delegate in FLR.

## Operations with public key

The public key is needed to construct the unsigned transaction hashes, which can then be signed externally (e.g. through a hardware wallet or a custodial API) and sent back to the app to finalize the transaction.

Transaction finalization thus requires three steps:

1. generate the unsigned transaction inside a json file and obtain the produced hash / message,
1. externally sign the hash and send the signature back to the app to finalize the export transaction,
1. finalize the transaction with the signature and send it to a network node.

The app-generated unsigned transaction json file respects the below format:

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
}
```

> **Note**
> The messages and signers inside `signatureRequests` should all be the same, so only one signature is required.

The signed transaction json file that you should generate via raw signing is the same as unsigned, but with appended raw `message` signature. So, it respects the below format:

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

An example signature is of the `r|s|v` format, e.g. `98f8c0d13bf2b5a5b2216894e503a721a099a1944116b802f2d84c0bd83a1bef3378e1b56d7ccd06de321913b8db0e97f4775e1885c86f6bcc583330d37cf5be01` where the last byte `v` is the recovery ID and can be either `00`/`01` or `1b`/`1c`.

Unsigned transaction files are always in the form of `${id}.unsignedTx.json` and signed transaction files are always in the form of `${id}.signedTx.json`. To send a signed transaction named `${id}.signedTx.json`, use the following command:

```bash
flare-stake-tool send -i <transaction-id>
```

### Move assets from the C-chain to the P-chain

Commands for obtaining unsigned transactions are the same as for the ledger in previous section, except that you omit the `--ledger` flag and additionally have to specify transaction id `-i <transaction-id>`. For example:

```bash
flare-stake-tool exportCP -a <amount> -i <transaction-id> --ctx-file <path to your context file>
```

where --ctx-file is optional and specifies the path to the context file. If not specified, the default context file (`ctx.json`) is used.

## Operations with private key

To use the app with the private key, you can copy the commands used with ledger and replace `--ledger` flag with `--get-hacked` and add an additional argument `--env-path <path to your private key file>`. For example:

```bash
flare-stake-tool exportCP -a <amount> -i <transaction-id> --env-path <path to your private key file> --get-hacked --network <flare|costwo|songbird|coston|localflare>
```

## Interactive CLI

For easier guidance through the process, you can also use an interactive CLI, with the following command:

```bash
flare-stake-tool interactive
```

## Validation and misc operations

### Getting your node ID:

```bash
curl -s -X POST --data '{ "jsonrpc":"2.0", "id" :1, "method" :"info.getNodeID" }' -H 'content-type:application/json;' RPC-URL:PORT/ext/info
```

### Check the current validators (To see if the stake or delegation was successful):

```bash
curl -s --location --request POST 'RPC-URL:PORT/ext/bc/P' --header 'Content-Type: application/json' --data-raw '{ "jsonrpc": "2.0",     "method": "platform.getCurrentValidators",     "params": {         "subnetID": null,         "nodeIDs": []     },     "id": 1 }' | jq .
```
