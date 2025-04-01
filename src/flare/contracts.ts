import * as settings from "../settings"
import Web3, { Contract, ContractAbi } from "web3"

export function getAddressBinder(network: string, web3: Web3): Contract<ContractAbi> {
    return new web3.eth.Contract(abiAddressBinder, settings.ADDRESS_BINDER[network])
}

export function getPChainStakeMirror(network: string, web3: Web3): Contract<ContractAbi> {
    return new web3.eth.Contract(abiPChainStakeMirror, settings.PCHAIN_STAKE_MIRROR[network])
}

export function getWNat(network: string, web3: Web3): Contract<ContractAbi> {
    return new web3.eth.Contract(abiWNat, settings.WNAT[network])
}

export function getValidatorRewardManager(network: string, web3: Web3): Contract<ContractAbi> {
    return new web3.eth.Contract(abiValidatorRewardManager, settings.VALIDATOR_REWARD_MANAGER[network])
}

export function getERC20(address: string, web3: Web3): Contract<ContractAbi> {
    return new web3.eth.Contract(abiERC20, address)
}

const abiAddressBinder = [
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "bytes",
                "name": "publicKey",
                "type": "bytes"
            },
            {
                "indexed": false,
                "internalType": "bytes20",
                "name": "pAddress",
                "type": "bytes20"
            },
            {
                "indexed": false,
                "internalType": "address",
                "name": "cAddress",
                "type": "address"
            }
        ],
        "name": "AddressesRegistered",
        "type": "event"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "",
                "type": "address"
            }
        ],
        "name": "cAddressToPAddress",
        "outputs": [
            {
                "internalType": "bytes20",
                "name": "",
                "type": "bytes20"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes20",
                "name": "",
                "type": "bytes20"
            }
        ],
        "name": "pAddressToCAddress",
        "outputs": [
            {
                "internalType": "address",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes",
                "name": "_publicKey",
                "type": "bytes"
            },
            {
                "internalType": "bytes20",
                "name": "_pAddress",
                "type": "bytes20"
            },
            {
                "internalType": "address",
                "name": "_cAddress",
                "type": "address"
            }
        ],
        "name": "registerAddresses",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes",
                "name": "_publicKey",
                "type": "bytes"
            }
        ],
        "name": "registerPublicKey",
        "outputs": [
            {
                "internalType": "bytes20",
                "name": "_pAddress",
                "type": "bytes20"
            },
            {
                "internalType": "address",
                "name": "_cAddress",
                "type": "address"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    }
]

const abiPChainStakeMirror = [
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_governance",
                "type": "address"
            },
            {
                "internalType": "contract FlareDaemon",
                "name": "_flareDaemon",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "_addressUpdater",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "_maxUpdatesPerBlock",
                "type": "uint256"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "constructor"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "_blockNumber",
                "type": "uint256"
            }
        ],
        "name": "CreatedTotalSupplyCache",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "bytes4",
                "name": "selector",
                "type": "bytes4"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "allowedAfterTimestamp",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "bytes",
                "name": "encodedCall",
                "type": "bytes"
            }
        ],
        "name": "GovernanceCallTimelocked",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "address",
                "name": "initialGovernance",
                "type": "address"
            }
        ],
        "name": "GovernanceInitialised",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "address",
                "name": "governanceSettings",
                "type": "address"
            }
        ],
        "name": "GovernedProductionModeEntered",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "maxUpdatesPerBlock",
                "type": "uint256"
            }
        ],
        "name": "MaxUpdatesPerBlockSet",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "owner",
                "type": "address"
            },
            {
                "indexed": true,
                "internalType": "bytes20",
                "name": "nodeId",
                "type": "bytes20"
            },
            {
                "indexed": true,
                "internalType": "bytes32",
                "name": "txHash",
                "type": "bytes32"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "amountWei",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "bytes32",
                "name": "pChainTxId",
                "type": "bytes32"
            }
        ],
        "name": "StakeConfirmed",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "owner",
                "type": "address"
            },
            {
                "indexed": true,
                "internalType": "bytes20",
                "name": "nodeId",
                "type": "bytes20"
            },
            {
                "indexed": true,
                "internalType": "bytes32",
                "name": "txHash",
                "type": "bytes32"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "amountWei",
                "type": "uint256"
            }
        ],
        "name": "StakeEnded",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "owner",
                "type": "address"
            },
            {
                "indexed": true,
                "internalType": "bytes20",
                "name": "nodeId",
                "type": "bytes20"
            },
            {
                "indexed": true,
                "internalType": "bytes32",
                "name": "txHash",
                "type": "bytes32"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "amountWei",
                "type": "uint256"
            }
        ],
        "name": "StakeRevoked",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "bytes4",
                "name": "selector",
                "type": "bytes4"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "timestamp",
                "type": "uint256"
            }
        ],
        "name": "TimelockedGovernanceCallCanceled",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "bytes4",
                "name": "selector",
                "type": "bytes4"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "timestamp",
                "type": "uint256"
            }
        ],
        "name": "TimelockedGovernanceCallExecuted",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "bytes20",
                "name": "nodeId",
                "type": "bytes20"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "blockNumber",
                "type": "uint256"
            }
        ],
        "name": "VotePowerCacheCreated",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "owner",
                "type": "address"
            },
            {
                "indexed": true,
                "internalType": "bytes20",
                "name": "nodeId",
                "type": "bytes20"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "priorVotePower",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "newVotePower",
                "type": "uint256"
            }
        ],
        "name": "VotePowerChanged",
        "type": "event"
    },
    {
        "inputs": [],
        "name": "activate",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "active",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "addressBinder",
        "outputs": [
            {
                "internalType": "contract IAddressBinder",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_owner",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "_count",
                "type": "uint256"
            }
        ],
        "name": "balanceHistoryCleanup",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_owner",
                "type": "address"
            }
        ],
        "name": "balanceOf",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_owner",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "_blockNumber",
                "type": "uint256"
            }
        ],
        "name": "balanceOfAt",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes20[]",
                "name": "_owners",
                "type": "bytes20[]"
            },
            {
                "internalType": "uint256",
                "name": "_blockNumber",
                "type": "uint256"
            }
        ],
        "name": "batchVotePowerOfAt",
        "outputs": [
            {
                "internalType": "uint256[]",
                "name": "_votePowers",
                "type": "uint256[]"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes4",
                "name": "_selector",
                "type": "bytes4"
            }
        ],
        "name": "cancelGovernanceCall",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "cleanerContract",
        "outputs": [
            {
                "internalType": "address",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "cleanupBlockNumber",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "cleanupBlockNumberManager",
        "outputs": [
            {
                "internalType": "address",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "daemonize",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "deactivate",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "name": "endTimeToTransactionHashList",
        "outputs": [
            {
                "internalType": "bytes32",
                "name": "",
                "type": "bytes32"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes4",
                "name": "_selector",
                "type": "bytes4"
            }
        ],
        "name": "executeGovernanceCall",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "flareDaemon",
        "outputs": [
            {
                "internalType": "contract FlareDaemon",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "getAddressUpdater",
        "outputs": [
            {
                "internalType": "address",
                "name": "_addressUpdater",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "getContractName",
        "outputs": [
            {
                "internalType": "string",
                "name": "",
                "type": "string"
            }
        ],
        "stateMutability": "pure",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "_endTime",
                "type": "uint256"
            }
        ],
        "name": "getTransactionHashList",
        "outputs": [
            {
                "internalType": "bytes32[]",
                "name": "",
                "type": "bytes32[]"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "governance",
        "outputs": [
            {
                "internalType": "address",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "governanceSettings",
        "outputs": [
            {
                "internalType": "contract IGovernanceSettings",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "governanceVotePower",
        "outputs": [
            {
                "internalType": "contract IIGovernanceVotePower",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_initialGovernance",
                "type": "address"
            }
        ],
        "name": "initialise",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "_txId",
                "type": "bytes32"
            },
            {
                "internalType": "bytes20",
                "name": "_inputAddress",
                "type": "bytes20"
            }
        ],
        "name": "isActiveStakeMirrored",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "maxUpdatesPerBlock",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "components": [
                    {
                        "internalType": "bytes32",
                        "name": "txId",
                        "type": "bytes32"
                    },
                    {
                        "internalType": "uint8",
                        "name": "stakingType",
                        "type": "uint8"
                    },
                    {
                        "internalType": "bytes20",
                        "name": "inputAddress",
                        "type": "bytes20"
                    },
                    {
                        "internalType": "bytes20",
                        "name": "nodeId",
                        "type": "bytes20"
                    },
                    {
                        "internalType": "uint64",
                        "name": "startTime",
                        "type": "uint64"
                    },
                    {
                        "internalType": "uint64",
                        "name": "endTime",
                        "type": "uint64"
                    },
                    {
                        "internalType": "uint64",
                        "name": "weight",
                        "type": "uint64"
                    }
                ],
                "internalType": "struct IPChainStakeMirrorVerifier.PChainStake",
                "name": "_stakeData",
                "type": "tuple"
            },
            {
                "internalType": "bytes32[]",
                "name": "_merkleProof",
                "type": "bytes32[]"
            }
        ],
        "name": "mirrorStake",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "nextTimestampToTrigger",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "productionMode",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "_txId",
                "type": "bytes32"
            },
            {
                "internalType": "bytes20",
                "name": "_inputAddress",
                "type": "bytes20"
            },
            {
                "internalType": "uint256",
                "name": "_endTime",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "_endTimeTxHashIndex",
                "type": "uint256"
            }
        ],
        "name": "revokeStake",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_cleanerContract",
                "type": "address"
            }
        ],
        "name": "setCleanerContract",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "_blockNumber",
                "type": "uint256"
            }
        ],
        "name": "setCleanupBlockNumber",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "_maxUpdatesPerBlock",
                "type": "uint256"
            }
        ],
        "name": "setMaxUpdatesPerBlock",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_owner",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "_count",
                "type": "uint256"
            }
        ],
        "name": "stakesHistoryCleanup",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_owner",
                "type": "address"
            }
        ],
        "name": "stakesOf",
        "outputs": [
            {
                "internalType": "bytes20[]",
                "name": "_nodeIds",
                "type": "bytes20[]"
            },
            {
                "internalType": "uint256[]",
                "name": "_amounts",
                "type": "uint256[]"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_owner",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "_blockNumber",
                "type": "uint256"
            }
        ],
        "name": "stakesOfAt",
        "outputs": [
            {
                "internalType": "bytes20[]",
                "name": "_nodeIds",
                "type": "bytes20[]"
            },
            {
                "internalType": "uint256[]",
                "name": "_amounts",
                "type": "uint256[]"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "switchToFallbackMode",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "switchToProductionMode",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes4",
                "name": "",
                "type": "bytes4"
            }
        ],
        "name": "timelockedCalls",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "allowedAfterTimestamp",
                "type": "uint256"
            },
            {
                "internalType": "bytes",
                "name": "encodedCall",
                "type": "bytes"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "totalSupply",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "_blockNumber",
                "type": "uint256"
            }
        ],
        "name": "totalSupplyAt",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "_blockNumber",
                "type": "uint256"
            }
        ],
        "name": "totalSupplyCacheCleanup",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "_count",
                "type": "uint256"
            }
        ],
        "name": "totalSupplyHistoryCleanup",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "totalVotePower",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "_blockNumber",
                "type": "uint256"
            }
        ],
        "name": "totalVotePowerAt",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "_blockNumber",
                "type": "uint256"
            }
        ],
        "name": "totalVotePowerAtCached",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "",
                "type": "bytes32"
            }
        ],
        "name": "transactionHashToPChainStakingData",
        "outputs": [
            {
                "internalType": "address",
                "name": "owner",
                "type": "address"
            },
            {
                "internalType": "bytes20",
                "name": "nodeId",
                "type": "bytes20"
            },
            {
                "internalType": "uint64",
                "name": "weightGwei",
                "type": "uint64"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32[]",
                "name": "_contractNameHashes",
                "type": "bytes32[]"
            },
            {
                "internalType": "address[]",
                "name": "_contractAddresses",
                "type": "address[]"
            }
        ],
        "name": "updateContractAddresses",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "verifier",
        "outputs": [
            {
                "internalType": "contract IIPChainStakeMirrorVerifier",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes20",
                "name": "_nodeId",
                "type": "bytes20"
            },
            {
                "internalType": "uint256",
                "name": "_blockNumber",
                "type": "uint256"
            }
        ],
        "name": "votePowerCacheCleanup",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_owner",
                "type": "address"
            },
            {
                "internalType": "bytes20",
                "name": "_nodeId",
                "type": "bytes20"
            }
        ],
        "name": "votePowerFromTo",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "_votePower",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_owner",
                "type": "address"
            },
            {
                "internalType": "bytes20",
                "name": "_nodeId",
                "type": "bytes20"
            },
            {
                "internalType": "uint256",
                "name": "_blockNumber",
                "type": "uint256"
            }
        ],
        "name": "votePowerFromToAt",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "_votePower",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes20",
                "name": "_nodeId",
                "type": "bytes20"
            },
            {
                "internalType": "uint256",
                "name": "_count",
                "type": "uint256"
            }
        ],
        "name": "votePowerHistoryCleanup",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes20",
                "name": "_nodeId",
                "type": "bytes20"
            }
        ],
        "name": "votePowerOf",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes20",
                "name": "_nodeId",
                "type": "bytes20"
            },
            {
                "internalType": "uint256",
                "name": "_blockNumber",
                "type": "uint256"
            }
        ],
        "name": "votePowerOfAt",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes20",
                "name": "_nodeId",
                "type": "bytes20"
            },
            {
                "internalType": "uint256",
                "name": "_blockNumber",
                "type": "uint256"
            }
        ],
        "name": "votePowerOfAtCached",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    }
]

const abiWNat = [
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_governance",
                "type": "address"
            },
            {
                "internalType": "string",
                "name": "_name",
                "type": "string"
            },
            {
                "internalType": "string",
                "name": "_symbol",
                "type": "string"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "constructor"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "owner",
                "type": "address"
            },
            {
                "indexed": true,
                "internalType": "address",
                "name": "spender",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "value",
                "type": "uint256"
            }
        ],
        "name": "Approval",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "_blockNumber",
                "type": "uint256"
            }
        ],
        "name": "CreatedTotalSupplyCache",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "dst",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "amount",
                "type": "uint256"
            }
        ],
        "name": "Deposit",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "bytes4",
                "name": "selector",
                "type": "bytes4"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "allowedAfterTimestamp",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "bytes",
                "name": "encodedCall",
                "type": "bytes"
            }
        ],
        "name": "GovernanceCallTimelocked",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "address",
                "name": "initialGovernance",
                "type": "address"
            }
        ],
        "name": "GovernanceInitialised",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "address",
                "name": "governanceSettings",
                "type": "address"
            }
        ],
        "name": "GovernedProductionModeEntered",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "bytes4",
                "name": "selector",
                "type": "bytes4"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "timestamp",
                "type": "uint256"
            }
        ],
        "name": "TimelockedGovernanceCallCanceled",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "bytes4",
                "name": "selector",
                "type": "bytes4"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "timestamp",
                "type": "uint256"
            }
        ],
        "name": "TimelockedGovernanceCallExecuted",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "from",
                "type": "address"
            },
            {
                "indexed": true,
                "internalType": "address",
                "name": "to",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "value",
                "type": "uint256"
            }
        ],
        "name": "Transfer",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "_contractType",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "address",
                "name": "_oldContractAddress",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "address",
                "name": "_newContractAddress",
                "type": "address"
            }
        ],
        "name": "VotePowerContractChanged",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "src",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "amount",
                "type": "uint256"
            }
        ],
        "name": "Withdrawal",
        "type": "event"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "owner",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "spender",
                "type": "address"
            }
        ],
        "name": "allowance",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "spender",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "amount",
                "type": "uint256"
            }
        ],
        "name": "approve",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_owner",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "_count",
                "type": "uint256"
            }
        ],
        "name": "balanceHistoryCleanup",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "account",
                "type": "address"
            }
        ],
        "name": "balanceOf",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_owner",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "_blockNumber",
                "type": "uint256"
            }
        ],
        "name": "balanceOfAt",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address[]",
                "name": "_delegatees",
                "type": "address[]"
            },
            {
                "internalType": "uint256[]",
                "name": "_bips",
                "type": "uint256[]"
            }
        ],
        "name": "batchDelegate",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address[]",
                "name": "_owners",
                "type": "address[]"
            },
            {
                "internalType": "uint256",
                "name": "_blockNumber",
                "type": "uint256"
            }
        ],
        "name": "batchVotePowerOfAt",
        "outputs": [
            {
                "internalType": "uint256[]",
                "name": "",
                "type": "uint256[]"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes4",
                "name": "_selector",
                "type": "bytes4"
            }
        ],
        "name": "cancelGovernanceCall",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "cleanerContract",
        "outputs": [
            {
                "internalType": "address",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "cleanupBlockNumber",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "cleanupBlockNumberManager",
        "outputs": [
            {
                "internalType": "address",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "decimals",
        "outputs": [
            {
                "internalType": "uint8",
                "name": "",
                "type": "uint8"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "spender",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "subtractedValue",
                "type": "uint256"
            }
        ],
        "name": "decreaseAllowance",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_to",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "_bips",
                "type": "uint256"
            }
        ],
        "name": "delegate",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_to",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "_amount",
                "type": "uint256"
            }
        ],
        "name": "delegateExplicit",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_owner",
                "type": "address"
            }
        ],
        "name": "delegatesOf",
        "outputs": [
            {
                "internalType": "address[]",
                "name": "_delegateAddresses",
                "type": "address[]"
            },
            {
                "internalType": "uint256[]",
                "name": "_bips",
                "type": "uint256[]"
            },
            {
                "internalType": "uint256",
                "name": "_count",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "_delegationMode",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_owner",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "_blockNumber",
                "type": "uint256"
            }
        ],
        "name": "delegatesOfAt",
        "outputs": [
            {
                "internalType": "address[]",
                "name": "_delegateAddresses",
                "type": "address[]"
            },
            {
                "internalType": "uint256[]",
                "name": "_bips",
                "type": "uint256[]"
            },
            {
                "internalType": "uint256",
                "name": "_count",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "_delegationMode",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_who",
                "type": "address"
            }
        ],
        "name": "delegationModeOf",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "deposit",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_recipient",
                "type": "address"
            }
        ],
        "name": "depositTo",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes4",
                "name": "_selector",
                "type": "bytes4"
            }
        ],
        "name": "executeGovernanceCall",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "governance",
        "outputs": [
            {
                "internalType": "address",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "governanceSettings",
        "outputs": [
            {
                "internalType": "contract IGovernanceSettings",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "governanceVotePower",
        "outputs": [
            {
                "internalType": "contract IGovernanceVotePower",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "spender",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "addedValue",
                "type": "uint256"
            }
        ],
        "name": "increaseAllowance",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_initialGovernance",
                "type": "address"
            }
        ],
        "name": "initialise",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "name",
        "outputs": [
            {
                "internalType": "string",
                "name": "",
                "type": "string"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "productionMode",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "readVotePowerContract",
        "outputs": [
            {
                "internalType": "contract IVPContractEvents",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_who",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "_blockNumber",
                "type": "uint256"
            }
        ],
        "name": "revokeDelegationAt",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_cleanerContract",
                "type": "address"
            }
        ],
        "name": "setCleanerContract",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "_blockNumber",
                "type": "uint256"
            }
        ],
        "name": "setCleanupBlockNumber",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_cleanupBlockNumberManager",
                "type": "address"
            }
        ],
        "name": "setCleanupBlockNumberManager",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "contract IIGovernanceVotePower",
                "name": "_governanceVotePower",
                "type": "address"
            }
        ],
        "name": "setGovernanceVotePower",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "contract IIVPContract",
                "name": "_vpContract",
                "type": "address"
            }
        ],
        "name": "setReadVpContract",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "contract IIVPContract",
                "name": "_vpContract",
                "type": "address"
            }
        ],
        "name": "setWriteVpContract",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "switchToProductionMode",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "symbol",
        "outputs": [
            {
                "internalType": "string",
                "name": "",
                "type": "string"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes4",
                "name": "",
                "type": "bytes4"
            }
        ],
        "name": "timelockedCalls",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "allowedAfterTimestamp",
                "type": "uint256"
            },
            {
                "internalType": "bytes",
                "name": "encodedCall",
                "type": "bytes"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "totalSupply",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "_blockNumber",
                "type": "uint256"
            }
        ],
        "name": "totalSupplyAt",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "_blockNumber",
                "type": "uint256"
            }
        ],
        "name": "totalSupplyCacheCleanup",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "_count",
                "type": "uint256"
            }
        ],
        "name": "totalSupplyHistoryCleanup",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "totalVotePower",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "_blockNumber",
                "type": "uint256"
            }
        ],
        "name": "totalVotePowerAt",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "_blockNumber",
                "type": "uint256"
            }
        ],
        "name": "totalVotePowerAtCached",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "recipient",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "amount",
                "type": "uint256"
            }
        ],
        "name": "transfer",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "sender",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "recipient",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "amount",
                "type": "uint256"
            }
        ],
        "name": "transferFrom",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "undelegateAll",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address[]",
                "name": "_delegateAddresses",
                "type": "address[]"
            }
        ],
        "name": "undelegateAllExplicit",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "_remainingDelegation",
                "type": "uint256"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_owner",
                "type": "address"
            }
        ],
        "name": "undelegatedVotePowerOf",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_owner",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "_blockNumber",
                "type": "uint256"
            }
        ],
        "name": "undelegatedVotePowerOfAt",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_from",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "_to",
                "type": "address"
            }
        ],
        "name": "votePowerFromTo",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_from",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "_to",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "_blockNumber",
                "type": "uint256"
            }
        ],
        "name": "votePowerFromToAt",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_owner",
                "type": "address"
            }
        ],
        "name": "votePowerOf",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_owner",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "_blockNumber",
                "type": "uint256"
            }
        ],
        "name": "votePowerOfAt",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_owner",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "_blockNumber",
                "type": "uint256"
            }
        ],
        "name": "votePowerOfAtCached",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_owner",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "_blockNumber",
                "type": "uint256"
            }
        ],
        "name": "votePowerOfAtIgnoringRevocation",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "vpContractInitialized",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "_amount",
                "type": "uint256"
            }
        ],
        "name": "withdraw",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_owner",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "_amount",
                "type": "uint256"
            }
        ],
        "name": "withdrawFrom",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "writeVotePowerContract",
        "outputs": [
            {
                "internalType": "contract IVPContractEvents",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "stateMutability": "payable",
        "type": "receive"
    }
]

const abiValidatorRewardManager = [
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_governance",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "_addressUpdater",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "_oldRewardManager",
                "type": "address"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "constructor"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "address",
                "name": "rewardOwner",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "address[]",
                "name": "recipients",
                "type": "address[]"
            }
        ],
        "name": "AllowedClaimRecipientsChanged",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "address",
                "name": "rewardOwner",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "address[]",
                "name": "executors",
                "type": "address[]"
            }
        ],
        "name": "ClaimExecutorsChanged",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "authorizedAmountWei",
                "type": "uint256"
            }
        ],
        "name": "DailyAuthorizedInflationSet",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "bytes4",
                "name": "selector",
                "type": "bytes4"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "allowedAfterTimestamp",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "bytes",
                "name": "encodedCall",
                "type": "bytes"
            }
        ],
        "name": "GovernanceCallTimelocked",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "address",
                "name": "initialGovernance",
                "type": "address"
            }
        ],
        "name": "GovernanceInitialised",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "address",
                "name": "governanceSettings",
                "type": "address"
            }
        ],
        "name": "GovernedProductionModeEntered",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "amountReceivedWei",
                "type": "uint256"
            }
        ],
        "name": "InflationReceived",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "beneficiary",
                "type": "address"
            },
            {
                "indexed": true,
                "internalType": "address",
                "name": "sentTo",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "amount",
                "type": "uint256"
            }
        ],
        "name": "RewardClaimed",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "address",
                "name": "rewardManager",
                "type": "address"
            }
        ],
        "name": "RewardManagerActivated",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "address",
                "name": "rewardManager",
                "type": "address"
            }
        ],
        "name": "RewardManagerDeactivated",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "address[]",
                "name": "addresses",
                "type": "address[]"
            },
            {
                "indexed": false,
                "internalType": "uint256[]",
                "name": "rewards",
                "type": "uint256[]"
            }
        ],
        "name": "RewardsDistributed",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "bytes4",
                "name": "selector",
                "type": "bytes4"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "timestamp",
                "type": "uint256"
            }
        ],
        "name": "TimelockedGovernanceCallCanceled",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "bytes4",
                "name": "selector",
                "type": "bytes4"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "timestamp",
                "type": "uint256"
            }
        ],
        "name": "TimelockedGovernanceCallExecuted",
        "type": "event"
    },
    {
        "inputs": [],
        "name": "activate",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "active",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_rewardOwner",
                "type": "address"
            }
        ],
        "name": "allowedClaimRecipients",
        "outputs": [
            {
                "internalType": "address[]",
                "name": "",
                "type": "address[]"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes4",
                "name": "_selector",
                "type": "bytes4"
            }
        ],
        "name": "cancelGovernanceCall",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_rewardOwner",
                "type": "address"
            },
            {
                "internalType": "address payable",
                "name": "_recipient",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "_rewardAmount",
                "type": "uint256"
            },
            {
                "internalType": "bool",
                "name": "_wrap",
                "type": "bool"
            }
        ],
        "name": "claim",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_rewardOwner",
                "type": "address"
            }
        ],
        "name": "claimExecutors",
        "outputs": [
            {
                "internalType": "address[]",
                "name": "",
                "type": "address[]"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "deactivate",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address[]",
                "name": "_addresses",
                "type": "address[]"
            },
            {
                "internalType": "uint256[]",
                "name": "_rewardAmounts",
                "type": "uint256[]"
            }
        ],
        "name": "distributeRewards",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes4",
                "name": "_selector",
                "type": "bytes4"
            }
        ],
        "name": "executeGovernanceCall",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "getAddressUpdater",
        "outputs": [
            {
                "internalType": "address",
                "name": "_addressUpdater",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "getContractName",
        "outputs": [
            {
                "internalType": "string",
                "name": "",
                "type": "string"
            }
        ],
        "stateMutability": "pure",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "getExpectedBalance",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "getInflationAddress",
        "outputs": [
            {
                "internalType": "address",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_beneficiary",
                "type": "address"
            }
        ],
        "name": "getStateOfRewards",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "_totalReward",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "_claimedReward",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "getTokenPoolSupplyData",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "_lockedFundsWei",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "_totalInflationAuthorizedWei",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "_totalClaimedWei",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "getTotals",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "_totalAwardedWei",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "_totalClaimedWei",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "_totalInflationAuthorizedWei",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "_totalInflationReceivedWei",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "_lastInflationAuthorizationReceivedTs",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "_dailyAuthorizedInflation",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "governance",
        "outputs": [
            {
                "internalType": "address",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "governanceSettings",
        "outputs": [
            {
                "internalType": "contract IGovernanceSettings",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_initialGovernance",
                "type": "address"
            }
        ],
        "name": "initialise",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "newRewardManager",
        "outputs": [
            {
                "internalType": "address",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "oldRewardManager",
        "outputs": [
            {
                "internalType": "address",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "productionMode",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "receiveInflation",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "rewardDistributor",
        "outputs": [
            {
                "internalType": "address",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address[]",
                "name": "_recipients",
                "type": "address[]"
            }
        ],
        "name": "setAllowedClaimRecipients",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address[]",
                "name": "_executors",
                "type": "address[]"
            }
        ],
        "name": "setClaimExecutors",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "_toAuthorizeWei",
                "type": "uint256"
            }
        ],
        "name": "setDailyAuthorizedInflation",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_newRewardManager",
                "type": "address"
            }
        ],
        "name": "setNewRewardManager",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_rewardDistributor",
                "type": "address"
            }
        ],
        "name": "setRewardDistributor",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "switchToProductionMode",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes4",
                "name": "",
                "type": "bytes4"
            }
        ],
        "name": "timelockedCalls",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "allowedAfterTimestamp",
                "type": "uint256"
            },
            {
                "internalType": "bytes",
                "name": "encodedCall",
                "type": "bytes"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32[]",
                "name": "_contractNameHashes",
                "type": "bytes32[]"
            },
            {
                "internalType": "address[]",
                "name": "_contractAddresses",
                "type": "address[]"
            }
        ],
        "name": "updateContractAddresses",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "wNat",
        "outputs": [
            {
                "internalType": "contract WNat",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    }
]

const abiERC20 = [
    {
        "constant": true,
        "inputs": [],
        "name": "name",
        "outputs": [
            {
                "name": "",
                "type": "string"
            }
        ],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    },
    {
        "constant": false,
        "inputs": [
            {
                "name": "_spender",
                "type": "address"
            },
            {
                "name": "_value",
                "type": "uint256"
            }
        ],
        "name": "approve",
        "outputs": [
            {
                "name": "",
                "type": "bool"
            }
        ],
        "payable": false,
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "totalSupply",
        "outputs": [
            {
                "name": "",
                "type": "uint256"
            }
        ],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    },
    {
        "constant": false,
        "inputs": [
            {
                "name": "_from",
                "type": "address"
            },
            {
                "name": "_to",
                "type": "address"
            },
            {
                "name": "_value",
                "type": "uint256"
            }
        ],
        "name": "transferFrom",
        "outputs": [
            {
                "name": "",
                "type": "bool"
            }
        ],
        "payable": false,
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "decimals",
        "outputs": [
            {
                "name": "",
                "type": "uint8"
            }
        ],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [
            {
                "name": "_owner",
                "type": "address"
            }
        ],
        "name": "balanceOf",
        "outputs": [
            {
                "name": "balance",
                "type": "uint256"
            }
        ],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "symbol",
        "outputs": [
            {
                "name": "",
                "type": "string"
            }
        ],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    },
    {
        "constant": false,
        "inputs": [
            {
                "name": "_to",
                "type": "address"
            },
            {
                "name": "_value",
                "type": "uint256"
            }
        ],
        "name": "transfer",
        "outputs": [
            {
                "name": "",
                "type": "bool"
            }
        ],
        "payable": false,
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [
            {
                "name": "_owner",
                "type": "address"
            },
            {
                "name": "_spender",
                "type": "address"
            }
        ],
        "name": "allowance",
        "outputs": [
            {
                "name": "",
                "type": "uint256"
            }
        ],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    },
    {
        "payable": true,
        "stateMutability": "payable",
        "type": "fallback"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "name": "owner",
                "type": "address"
            },
            {
                "indexed": true,
                "name": "spender",
                "type": "address"
            },
            {
                "indexed": false,
                "name": "value",
                "type": "uint256"
            }
        ],
        "name": "Approval",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "name": "from",
                "type": "address"
            },
            {
                "indexed": true,
                "name": "to",
                "type": "address"
            },
            {
                "indexed": false,
                "name": "value",
                "type": "uint256"
            }
        ],
        "name": "Transfer",
        "type": "event"
    }
]