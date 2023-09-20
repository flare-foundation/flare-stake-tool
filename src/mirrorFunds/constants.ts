/**
 * Contract based info
 */
export const costwoPChainStakeMirrorContract = '0x3F65F2e9e25EdA1189c3aF3D596f1c2E71ececa9';
export const flarePChainStakeMirrorContract = '0x3F65F2e9e25EdA1189c3aF3D596f1c2E71ececa9';
/**
 * RPC based info
 */
export const flarePublicRPC = 'https://flare-api.flare.network/';
export const costwoPublicRPC = 'https://coston2-api.flare.network/ext/C/rpc';

export const pChainStakeMirrorContractFromNetwork = (network: string) => {
  if (network == 'costwo') {
    return costwoPChainStakeMirrorContract;
  } else if (network == 'flare') {
    return flarePChainStakeMirrorContract;
  } else {
    // for other case, return flare contract by default
    return flarePChainStakeMirrorContract;
  }
};

export const rpcFromNetwork = (network: string) => {
  if (network == 'costwo') {
    return costwoPublicRPC;
  } else if (network == 'flare') {
    return flarePublicRPC;
  } else {
    // for other case, return flare mainnet rpc by default
    return flarePublicRPC;
  }
};

export type DelegatedAmount = {
  stakeAmount: number,
  startTime: number,
  endTime: number
}

export const pChainStakeMirrorABI = [
  {
      "type": "constructor",
      "inputs": [
          {
              "type": "address",
              "name": "_governance",
              "internalType": "address"
          },
          {
              "type": "address",
              "name": "_flareDaemon",
              "internalType": "contract FlareDaemon"
          },
          {
              "type": "address",
              "name": "_addressUpdater",
              "internalType": "address"
          },
          {
              "type": "uint256",
              "name": "_maxUpdatesPerBlock",
              "internalType": "uint256"
          }
      ]
  },
  {
      "type": "function",
      "stateMutability": "nonpayable",
      "outputs": [],
      "name": "activate",
      "inputs": []
  },
  {
      "type": "function",
      "stateMutability": "view",
      "outputs": [
          {
              "type": "bool",
              "name": "",
              "internalType": "bool"
          }
      ],
      "name": "active",
      "inputs": []
  },
  {
      "type": "function",
      "stateMutability": "view",
      "outputs": [
          {
              "type": "address",
              "name": "",
              "internalType": "contract IAddressBinder"
          }
      ],
      "name": "addressBinder",
      "inputs": []
  },
  {
      "type": "function",
      "stateMutability": "nonpayable",
      "outputs": [
          {
              "type": "uint256",
              "name": "",
              "internalType": "uint256"
          }
      ],
      "name": "balanceHistoryCleanup",
      "inputs": [
          {
              "type": "address",
              "name": "_owner",
              "internalType": "address"
          },
          {
              "type": "uint256",
              "name": "_count",
              "internalType": "uint256"
          }
      ]
  },
  {
      "type": "function",
      "stateMutability": "view",
      "outputs": [
          {
              "type": "uint256",
              "name": "",
              "internalType": "uint256"
          }
      ],
      "name": "balanceOf",
      "inputs": [
          {
              "type": "address",
              "name": "_owner",
              "internalType": "address"
          }
      ]
  },
  {
      "type": "function",
      "stateMutability": "view",
      "outputs": [
          {
              "type": "uint256",
              "name": "",
              "internalType": "uint256"
          }
      ],
      "name": "balanceOfAt",
      "inputs": [
          {
              "type": "address",
              "name": "_owner",
              "internalType": "address"
          },
          {
              "type": "uint256",
              "name": "_blockNumber",
              "internalType": "uint256"
          }
      ]
  },
  {
      "type": "function",
      "stateMutability": "view",
      "outputs": [
          {
              "type": "uint256[]",
              "name": "_votePowers",
              "internalType": "uint256[]"
          }
      ],
      "name": "batchVotePowerOfAt",
      "inputs": [
          {
              "type": "bytes20[]",
              "name": "_owners",
              "internalType": "bytes20[]"
          },
          {
              "type": "uint256",
              "name": "_blockNumber",
              "internalType": "uint256"
          }
      ]
  },
  {
      "type": "function",
      "stateMutability": "nonpayable",
      "outputs": [],
      "name": "cancelGovernanceCall",
      "inputs": [
          {
              "type": "bytes4",
              "name": "_selector",
              "internalType": "bytes4"
          }
      ]
  },
  {
      "type": "function",
      "stateMutability": "view",
      "outputs": [
          {
              "type": "address",
              "name": "",
              "internalType": "address"
          }
      ],
      "name": "cleanerContract",
      "inputs": []
  },
  {
      "type": "function",
      "stateMutability": "view",
      "outputs": [
          {
              "type": "uint256",
              "name": "",
              "internalType": "uint256"
          }
      ],
      "name": "cleanupBlockNumber",
      "inputs": []
  },
  {
      "type": "function",
      "stateMutability": "view",
      "outputs": [
          {
              "type": "address",
              "name": "",
              "internalType": "address"
          }
      ],
      "name": "cleanupBlockNumberManager",
      "inputs": []
  },
  {
      "type": "function",
      "stateMutability": "nonpayable",
      "outputs": [
          {
              "type": "bool",
              "name": "",
              "internalType": "bool"
          }
      ],
      "name": "daemonize",
      "inputs": []
  },
  {
      "type": "function",
      "stateMutability": "nonpayable",
      "outputs": [],
      "name": "deactivate",
      "inputs": []
  },
  {
      "type": "function",
      "stateMutability": "nonpayable",
      "outputs": [],
      "name": "executeGovernanceCall",
      "inputs": [
          {
              "type": "bytes4",
              "name": "_selector",
              "internalType": "bytes4"
          }
      ]
  },
  {
      "type": "function",
      "stateMutability": "view",
      "outputs": [
          {
              "type": "address",
              "name": "",
              "internalType": "contract FlareDaemon"
          }
      ],
      "name": "flareDaemon",
      "inputs": []
  },
  {
      "type": "function",
      "stateMutability": "view",
      "outputs": [
          {
              "type": "address",
              "name": "_addressUpdater",
              "internalType": "address"
          }
      ],
      "name": "getAddressUpdater",
      "inputs": []
  },
  {
      "type": "function",
      "stateMutability": "pure",
      "outputs": [
          {
              "type": "string",
              "name": "",
              "internalType": "string"
          }
      ],
      "name": "getContractName",
      "inputs": []
  },
  {
      "type": "function",
      "stateMutability": "view",
      "outputs": [
          {
              "type": "address",
              "name": "",
              "internalType": "address"
          }
      ],
      "name": "governance",
      "inputs": []
  },
  {
      "type": "function",
      "stateMutability": "view",
      "outputs": [
          {
              "type": "address",
              "name": "",
              "internalType": "contract IGovernanceSettings"
          }
      ],
      "name": "governanceSettings",
      "inputs": []
  },
  {
      "type": "function",
      "stateMutability": "view",
      "outputs": [
          {
              "type": "address",
              "name": "",
              "internalType": "contract IIGovernanceVotePower"
          }
      ],
      "name": "governanceVotePower",
      "inputs": []
  },
  {
      "type": "function",
      "stateMutability": "nonpayable",
      "outputs": [],
      "name": "initialise",
      "inputs": [
          {
              "type": "address",
              "name": "_initialGovernance",
              "internalType": "address"
          }
      ]
  },
  {
      "type": "function",
      "stateMutability": "view",
      "outputs": [
          {
              "type": "bool",
              "name": "",
              "internalType": "bool"
          }
      ],
      "name": "isActiveStakeMirrored",
      "inputs": [
          {
              "type": "bytes32",
              "name": "_txId",
              "internalType": "bytes32"
          },
          {
              "type": "bytes20",
              "name": "_inputAddress",
              "internalType": "bytes20"
          }
      ]
  },
  {
      "type": "function",
      "stateMutability": "view",
      "outputs": [
          {
              "type": "uint256",
              "name": "",
              "internalType": "uint256"
          }
      ],
      "name": "maxUpdatesPerBlock",
      "inputs": []
  },
  {
      "type": "function",
      "stateMutability": "nonpayable",
      "outputs": [],
      "name": "mirrorStake",
      "inputs": [
          {
              "type": "tuple",
              "name": "_stakeData",
              "internalType": "struct IPChainStakeMirrorVerifier.PChainStake",
              "components": [
                  {
                      "type": "bytes32"
                  },
                  {
                      "type": "uint8"
                  },
                  {
                      "type": "bytes20"
                  },
                  {
                      "type": "bytes20"
                  },
                  {
                      "type": "uint64"
                  },
                  {
                      "type": "uint64"
                  },
                  {
                      "type": "uint64"
                  }
              ]
          },
          {
              "type": "bytes32[]",
              "name": "_merkleProof",
              "internalType": "bytes32[]"
          }
      ]
  },
  {
      "type": "function",
      "stateMutability": "view",
      "outputs": [
          {
              "type": "uint256",
              "name": "",
              "internalType": "uint256"
          }
      ],
      "name": "nextTimestampToTrigger",
      "inputs": []
  },
  {
      "type": "function",
      "stateMutability": "view",
      "outputs": [
          {
              "type": "bool",
              "name": "",
              "internalType": "bool"
          }
      ],
      "name": "productionMode",
      "inputs": []
  },
  {
      "type": "function",
      "stateMutability": "nonpayable",
      "outputs": [],
      "name": "setCleanerContract",
      "inputs": [
          {
              "type": "address",
              "name": "_cleanerContract",
              "internalType": "address"
          }
      ]
  },
  {
      "type": "function",
      "stateMutability": "nonpayable",
      "outputs": [],
      "name": "setCleanupBlockNumber",
      "inputs": [
          {
              "type": "uint256",
              "name": "_blockNumber",
              "internalType": "uint256"
          }
      ]
  },
  {
      "type": "function",
      "stateMutability": "nonpayable",
      "outputs": [],
      "name": "setMaxUpdatesPerBlock",
      "inputs": [
          {
              "type": "uint256",
              "name": "_maxUpdatesPerBlock",
              "internalType": "uint256"
          }
      ]
  },
  {
      "type": "function",
      "stateMutability": "nonpayable",
      "outputs": [
          {
              "type": "uint256",
              "name": "",
              "internalType": "uint256"
          }
      ],
      "name": "stakesHistoryCleanup",
      "inputs": [
          {
              "type": "address",
              "name": "_owner",
              "internalType": "address"
          },
          {
              "type": "uint256",
              "name": "_count",
              "internalType": "uint256"
          }
      ]
  },
  {
      "type": "function",
      "stateMutability": "view",
      "outputs": [
          {
              "type": "bytes20[]",
              "name": "_nodeIds",
              "internalType": "bytes20[]"
          },
          {
              "type": "uint256[]",
              "name": "_amounts",
              "internalType": "uint256[]"
          }
      ],
      "name": "stakesOf",
      "inputs": [
          {
              "type": "address",
              "name": "_owner",
              "internalType": "address"
          }
      ]
  },
  {
      "type": "function",
      "stateMutability": "view",
      "outputs": [
          {
              "type": "bytes20[]",
              "name": "_nodeIds",
              "internalType": "bytes20[]"
          },
          {
              "type": "uint256[]",
              "name": "_amounts",
              "internalType": "uint256[]"
          }
      ],
      "name": "stakesOfAt",
      "inputs": [
          {
              "type": "address",
              "name": "_owner",
              "internalType": "address"
          },
          {
              "type": "uint256",
              "name": "_blockNumber",
              "internalType": "uint256"
          }
      ]
  },
  {
      "type": "function",
      "stateMutability": "nonpayable",
      "outputs": [
          {
              "type": "bool",
              "name": "",
              "internalType": "bool"
          }
      ],
      "name": "switchToFallbackMode",
      "inputs": []
  },
  {
      "type": "function",
      "stateMutability": "nonpayable",
      "outputs": [],
      "name": "switchToProductionMode",
      "inputs": []
  },
  {
      "type": "function",
      "stateMutability": "view",
      "outputs": [
          {
              "type": "uint256",
              "name": "allowedAfterTimestamp",
              "internalType": "uint256"
          },
          {
              "type": "bytes",
              "name": "encodedCall",
              "internalType": "bytes"
          }
      ],
      "name": "timelockedCalls",
      "inputs": [
          {
              "type": "bytes4",
              "name": "",
              "internalType": "bytes4"
          }
      ]
  },
  {
      "type": "function",
      "stateMutability": "view",
      "outputs": [
          {
              "type": "uint256",
              "name": "",
              "internalType": "uint256"
          }
      ],
      "name": "totalSupply",
      "inputs": []
  },
  {
      "type": "function",
      "stateMutability": "view",
      "outputs": [
          {
              "type": "uint256",
              "name": "",
              "internalType": "uint256"
          }
      ],
      "name": "totalSupplyAt",
      "inputs": [
          {
              "type": "uint256",
              "name": "_blockNumber",
              "internalType": "uint256"
          }
      ]
  },
  {
      "type": "function",
      "stateMutability": "nonpayable",
      "outputs": [
          {
              "type": "uint256",
              "name": "",
              "internalType": "uint256"
          }
      ],
      "name": "totalSupplyCacheCleanup",
      "inputs": [
          {
              "type": "uint256",
              "name": "_blockNumber",
              "internalType": "uint256"
          }
      ]
  },
  {
      "type": "function",
      "stateMutability": "nonpayable",
      "outputs": [
          {
              "type": "uint256",
              "name": "",
              "internalType": "uint256"
          }
      ],
      "name": "totalSupplyHistoryCleanup",
      "inputs": [
          {
              "type": "uint256",
              "name": "_count",
              "internalType": "uint256"
          }
      ]
  },
  {
      "type": "function",
      "stateMutability": "view",
      "outputs": [
          {
              "type": "uint256",
              "name": "",
              "internalType": "uint256"
          }
      ],
      "name": "totalVotePower",
      "inputs": []
  },
  {
      "type": "function",
      "stateMutability": "view",
      "outputs": [
          {
              "type": "uint256",
              "name": "",
              "internalType": "uint256"
          }
      ],
      "name": "totalVotePowerAt",
      "inputs": [
          {
              "type": "uint256",
              "name": "_blockNumber",
              "internalType": "uint256"
          }
      ]
  },
  {
      "type": "function",
      "stateMutability": "nonpayable",
      "outputs": [
          {
              "type": "uint256",
              "name": "",
              "internalType": "uint256"
          }
      ],
      "name": "totalVotePowerAtCached",
      "inputs": [
          {
              "type": "uint256",
              "name": "_blockNumber",
              "internalType": "uint256"
          }
      ]
  },
  {
      "type": "function",
      "stateMutability": "nonpayable",
      "outputs": [],
      "name": "updateContractAddresses",
      "inputs": [
          {
              "type": "bytes32[]",
              "name": "_contractNameHashes",
              "internalType": "bytes32[]"
          },
          {
              "type": "address[]",
              "name": "_contractAddresses",
              "internalType": "address[]"
          }
      ]
  },
  {
      "type": "function",
      "stateMutability": "view",
      "outputs": [
          {
              "type": "address",
              "name": "",
              "internalType": "contract IIPChainStakeMirrorVerifier"
          }
      ],
      "name": "verifier",
      "inputs": []
  },
  {
      "type": "function",
      "stateMutability": "nonpayable",
      "outputs": [
          {
              "type": "uint256",
              "name": "",
              "internalType": "uint256"
          }
      ],
      "name": "votePowerCacheCleanup",
      "inputs": [
          {
              "type": "bytes20",
              "name": "_nodeId",
              "internalType": "bytes20"
          },
          {
              "type": "uint256",
              "name": "_blockNumber",
              "internalType": "uint256"
          }
      ]
  },
  {
      "type": "function",
      "stateMutability": "view",
      "outputs": [
          {
              "type": "uint256",
              "name": "_votePower",
              "internalType": "uint256"
          }
      ],
      "name": "votePowerFromTo",
      "inputs": [
          {
              "type": "address",
              "name": "_owner",
              "internalType": "address"
          },
          {
              "type": "bytes20",
              "name": "_nodeId",
              "internalType": "bytes20"
          }
      ]
  },
  {
      "type": "function",
      "stateMutability": "view",
      "outputs": [
          {
              "type": "uint256",
              "name": "_votePower",
              "internalType": "uint256"
          }
      ],
      "name": "votePowerFromToAt",
      "inputs": [
          {
              "type": "address",
              "name": "_owner",
              "internalType": "address"
          },
          {
              "type": "bytes20",
              "name": "_nodeId",
              "internalType": "bytes20"
          },
          {
              "type": "uint256",
              "name": "_blockNumber",
              "internalType": "uint256"
          }
      ]
  },
  {
      "type": "function",
      "stateMutability": "nonpayable",
      "outputs": [
          {
              "type": "uint256",
              "name": "",
              "internalType": "uint256"
          }
      ],
      "name": "votePowerHistoryCleanup",
      "inputs": [
          {
              "type": "bytes20",
              "name": "_nodeId",
              "internalType": "bytes20"
          },
          {
              "type": "uint256",
              "name": "_count",
              "internalType": "uint256"
          }
      ]
  },
  {
      "type": "function",
      "stateMutability": "view",
      "outputs": [
          {
              "type": "uint256",
              "name": "",
              "internalType": "uint256"
          }
      ],
      "name": "votePowerOf",
      "inputs": [
          {
              "type": "bytes20",
              "name": "_nodeId",
              "internalType": "bytes20"
          }
      ]
  },
  {
      "type": "function",
      "stateMutability": "view",
      "outputs": [
          {
              "type": "uint256",
              "name": "",
              "internalType": "uint256"
          }
      ],
      "name": "votePowerOfAt",
      "inputs": [
          {
              "type": "bytes20",
              "name": "_nodeId",
              "internalType": "bytes20"
          },
          {
              "type": "uint256",
              "name": "_blockNumber",
              "internalType": "uint256"
          }
      ]
  },
  {
      "type": "function",
      "stateMutability": "nonpayable",
      "outputs": [
          {
              "type": "uint256",
              "name": "",
              "internalType": "uint256"
          }
      ],
      "name": "votePowerOfAtCached",
      "inputs": [
          {
              "type": "bytes20",
              "name": "_nodeId",
              "internalType": "bytes20"
          },
          {
              "type": "uint256",
              "name": "_blockNumber",
              "internalType": "uint256"
          }
      ]
  },
  {
      "type": "event",
      "name": "CreatedTotalSupplyCache",
      "inputs": [
          {
              "type": "uint256",
              "name": "_blockNumber",
              "indexed": false
          }
      ],
      "anonymous": false
  },
  {
      "type": "event",
      "name": "GovernanceCallTimelocked",
      "inputs": [
          {
              "type": "bytes4",
              "name": "selector",
              "indexed": false
          },
          {
              "type": "uint256",
              "name": "allowedAfterTimestamp",
              "indexed": false
          },
          {
              "type": "bytes",
              "name": "encodedCall",
              "indexed": false
          }
      ],
      "anonymous": false
  },
  {
      "type": "event",
      "name": "GovernanceInitialised",
      "inputs": [
          {
              "type": "address",
              "name": "initialGovernance",
              "indexed": false
          }
      ],
      "anonymous": false
  },
  {
      "type": "event",
      "name": "GovernedProductionModeEntered",
      "inputs": [
          {
              "type": "address",
              "name": "governanceSettings",
              "indexed": false
          }
      ],
      "anonymous": false
  },
  {
      "type": "event",
      "name": "MaxUpdatesPerBlockSet",
      "inputs": [
          {
              "type": "uint256",
              "name": "maxUpdatesPerBlock",
              "indexed": false
          }
      ],
      "anonymous": false
  },
  {
      "type": "event",
      "name": "StakeConfirmed",
      "inputs": [
          {
              "type": "address",
              "name": "owner",
              "indexed": true
          },
          {
              "type": "bytes20",
              "name": "nodeId",
              "indexed": true
          },
          {
              "type": "bytes32",
              "name": "txHash",
              "indexed": true
          },
          {
              "type": "uint256",
              "name": "amountWei",
              "indexed": false
          },
          {
              "type": "bytes32",
              "name": "pChainTxId",
              "indexed": false
          }
      ],
      "anonymous": false
  },
  {
      "type": "event",
      "name": "StakeEnded",
      "inputs": [
          {
              "type": "address",
              "name": "owner",
              "indexed": true
          },
          {
              "type": "bytes20",
              "name": "nodeId",
              "indexed": true
          },
          {
              "type": "bytes32",
              "name": "txHash",
              "indexed": true
          },
          {
              "type": "uint256",
              "name": "amountWei",
              "indexed": false
          }
      ],
      "anonymous": false
  },
  {
      "type": "event",
      "name": "TimelockedGovernanceCallCanceled",
      "inputs": [
          {
              "type": "bytes4",
              "name": "selector",
              "indexed": false
          },
          {
              "type": "uint256",
              "name": "timestamp",
              "indexed": false
          }
      ],
      "anonymous": false
  },
  {
      "type": "event",
      "name": "TimelockedGovernanceCallExecuted",
      "inputs": [
          {
              "type": "bytes4",
              "name": "selector",
              "indexed": false
          },
          {
              "type": "uint256",
              "name": "timestamp",
              "indexed": false
          }
      ],
      "anonymous": false
  },
  {
      "type": "event",
      "name": "VotePowerCacheCreated",
      "inputs": [
          {
              "type": "bytes20",
              "name": "nodeId",
              "indexed": false
          },
          {
              "type": "uint256",
              "name": "blockNumber",
              "indexed": false
          }
      ],
      "anonymous": false
  },
  {
      "type": "event",
      "name": "VotePowerChanged",
      "inputs": [
          {
              "type": "address",
              "name": "owner",
              "indexed": true
          },
          {
              "type": "bytes20",
              "name": "nodeId",
              "indexed": true
          },
          {
              "type": "uint256",
              "name": "priorVotePower",
              "indexed": false
          },
          {
              "type": "uint256",
              "name": "newVotePower",
              "indexed": false
          }
      ],
      "anonymous": false
  }
]