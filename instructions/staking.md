
# Install tools

NOTE: this procedure uses blind signing. It will be adapted to non-blind signing to work properly, but currently there are some issues with non-blind signing.

```
npm install @flarenetwork/flare-stake-tool@2.2.1 -g
npm install flare-ledger-staking@1.1.2 -g
```
If it does not work, use `sudo`.

Have modified Ledger Avalanche app installed.

Create new folder:
```
mkdir staking
cd staking
```

NOTE: for each "session" a new folder should be created. Session is identified by `id`. Usually it consists of the sequence of operations:
- export from C-chain  (id = 1)
- import to P-chain (id = 2)
- stake (id = 3) or delegate (id = 4). Only one of.

# Extracting public key

Connect the ledger, the modified Avalanche app needs to be turned on:

```
flare-stake-tool init-ctx
```
This creates `ctx.json`.

All the following commands need to be run from the same folder and use the same `ctx.json` file.
If you want to use a different "context file", you need to specify it with `--ctx-file <different ctx file>` parameter for each command.

# Exporting the funds from C-chain to P-chain (1)

```
flare-stake-tool crosschain exportCP -a 16750001 -id 1 --get-hashes
```

Connect to the Ledger and have the modified Avalanche app or "original" Avalanche app turned on. Sign the hash (blind signing).

```
flare-stake-tool sign-hash -id 1
```

OR: connect to the Ledger and have the modified Avalanche app turned on. Sign the transaction.
```
flare-stake-tool sign -id 1
```

Issue the transaction to the chain.

```
flare-stake-tool crosschain exportCP -id 1 --use-signatures
```


# Importing the funds to P-chain

```
flare-stake-tool crosschain importCP -id 2 --get-hashes
```

Connect to the Ledger and have the modified Avalanche app turned on. Sign the hash (blind signing).

```
flare-stake-tool sign-hash - id 2
```

OR: connect to the Ledger and have the modified Avalanche app turned on. Sign the transaction.
```
flare-stake-tool sign -id 2
```

Issue the transaction to the chain.
```
flare-stake-tool crosschain importCP -id 2 --use-signatures
```

# Staking

NOTE: use correct parameters for your stake (nodeid, amount in FLR, start time, end time).

```
flare-stake-tool stake -id 3 --get-hashes -n "NodeID-H7TKshVe5cxKiheViWZHKdRo8e7wMZ6ZP" -a 16750000 -s 1688569201 -e 1696863601
```

Connect to the Ledger and have the modified Avalanche app turned on. Sign the hash (blind signing).

```
flare-stake-tool sign-hash -id 3
```

OR: connect to the Ledger and have the modified Avalanche app turned on. Sign the transaction.
```
flare-stake-tool sign -id 3
```


Issue transaction.
```
flare-stake-tool stake -id 3 --use-signatures
```

# Delegation

NOTE: if you have done staking in the session, do not do the delegation in this session.

```
flare-stake-tool delegate -id 4 --get-hashes -n "staked_node_ID" -a stake_amount -s stake_start_time -e stake_end_time

replace the following
- stake_start_time : use 1688569201 for first stake on flare
- stake_end_time : linux timestamp format do not set the same end time for all nodes. 2 day separation should be good. see google sheet here
- amount 33.5 Mil FLR per node. set amount in tokens (not wei)
- staked_node_ID should be in this format: NodeID-H7TKshVe5cxKiheViWZHKdRo8e7wMZ6ZP

```

Connect to the Ledger and have the modified Avalanche app turned on. Sign the hash (blind signing).
```
flare-stake-tool sign-hash -id 4
```
OR: connect to the Ledger and have the modified Avalanche app turned on. Sign the transaction.
```
flare-stake-tool sign -id 4
```


Issue transaction.
```
flare-stake-tool stake -id 4 --use-signatures
```

# Check balances at any time

At any time, you can check balances on C and P chains.

NOTE: this will get simplified in the next version to:
```
flare-stake-tool info balance
```


# Check pending validators/delegations

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