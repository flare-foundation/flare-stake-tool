
# Install tools

NOTE: this procedure uses blind signing. It will be adapted to non-blind signing to work properly, but currently there are some issues with non-blind signing.

```shell
npm install @flarenetwork/flare-stake-tool@x.x.x -g
```

If it does not work, use `sudo`.

# Staking with ledger

Have the modified Ledger Avalanche app installed and turned on.

## Export from C-chain to P-chain

This is a two step process which requires two transactions. First, **export** from C-chain to P-chain. Second, **import** from C-chain to P-chain.

```shell
transaction exportCP -a 100 --ledger
```

Note: If you want to use a different network, add `--network <network name>` parameter, e.g. `--network costwo`, to each command in this section.

```shell
transaction importCP --ledger
```

## Add validator and delegate

NOTE: use correct parameters for your stake: node id (-n), amount in FLR (-a), start time in unix timestamp (-s), end time in unix timestamp (-e).

```shell
transaction stake -n "NodeID-87skCc745aTkJEtozqTJ2SBnZ8Vb8Ncbd" -s 1688400000 -e 1694304000 -a 20000000 --ledger
```

```shell
transaction delegate -n "NodeID-87skCc745aTkJEtozqTJ2SBnZ8Vb8Ncbd" -s 1688400000 -e 1694304000 -a 2000 --ledger
```

## Export from P-chain to C-chain

This is also a two step process which requires two transactions: **export** from P-chain to C-chain and **import** from P-chain to C-chain.

```shell
transaction exportPC -a 100 --ledger
```

```shell
transaction importPC --ledger
```

## Network information

### Balances on the Ledger account

```shell
transaction info balance --ledger
```

### Addresses associated to the Ledger account

```shell
transaction info addresses --ledger
```

### Network chain ids

```shell
transaction info network
```

### Validators

```shell
transaction info validators
```

## Notes

- The `--ledger` parameter is required for all commands (except for some `info` commands).
- The `--network` parameter is optional. If not specified, the default network `flare` is used.
- For blind signing use `--blind` parameter. For blind signing you can use the official Avalanche app. It was tested with version 0.7.0. You may have to upgrade firmware on your Ledger device to be able to install this version.

# Check pending validators/delegations on the node

Have `curl` installed. This will show pending stakes/delegation. Using this you can verify, that the stake/delegation was carried out.

```
curl -s --location --request POST 'https://flare-api.flare.network/ext/bc/P' \
--header 'Content-Type: application/json' \
--data-raw '{
    "jsonrpc": "2.0",
    "method": "platform.getPendingValidators",
    "params": {
        "subnetID": null,
        "nodeIDs": []
    },
    "id": 1
}' | jq .
```