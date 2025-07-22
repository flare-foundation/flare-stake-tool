import { ContractAddressesInterface } from "../interfaces"

/**
 * @description max delegation allowed per address
 */
export const maxAllowedDelegation = 3

export const flareContractRegistryAddress = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019"

/**
 * @description Stores the default chain-wise addresses for contracts
 */
export const defaultContractAddresses: ContractAddressesInterface = {
  FlareContractRegistry:
  {
    flare: "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019",
    costwo: "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019",
    songbird: "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019",
    coston: "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019"
  },
  PChainStakeMirror:
  {
    flare: "0x7b61F9F27153a4F2F57Dc30bF08A8eb0cCB96C22",
    costwo: "0xd2a1bb23eb350814a30dd6f9de78bb2c8fdd9f1d",
    songbird: "",
    coston: ""
  }
}

export const contractTransactionName = "ContractTransaction"
export const pChainStakeMirror = "PChainStakeMirror"

/**
 * @description returns the FlareContractRegistry contract ABI
 */
export function getFlareContractRegistryABI() {
  return flareContractRegistryABI
}

/**
 *
 * @returns return PChainStakeMirrorABI contract ABI
 */
export function getPChainStakeMirrorABI() {
  return pChainStakeMirrorABI
}

export const flareContractRegistryABI = [
  {
    "type": "constructor",
    "stateMutability": "nonpayable",
    "inputs": [
      {
        "type": "address",
        "name": "_addressUpdater",
        "internalType": "address"
      }
    ]
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
    "inputs": [

    ]
  },
  {
    "type": "function",
    "stateMutability": "view",
    "outputs": [
      {
        "type": "string[]",
        "name": "",
        "internalType": "string[]"
      },
      {
        "type": "address[]",
        "name": "",
        "internalType": "address[]"
      }
    ],
    "name": "getAllContracts",
    "inputs": [

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
    "name": "getContractAddressByHash",
    "inputs": [
      {
        "type": "bytes32",
        "name": "_nameHash",
        "internalType": "bytes32"
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
    "name": "getContractAddressByName",
    "inputs": [
      {
        "type": "string",
        "name": "_name",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "function",
    "stateMutability": "view",
    "outputs": [
      {
        "type": "address[]",
        "name": "",
        "internalType": "address[]"
      }
    ],
    "name": "getContractAddressesByHash",
    "inputs": [
      {
        "type": "bytes32[]",
        "name": "_nameHashes",
        "internalType": "bytes32[]"
      }
    ]
  },
  {
    "type": "function",
    "stateMutability": "view",
    "outputs": [
      {
        "type": "address[]",
        "name": "",
        "internalType": "address[]"
      }
    ],
    "name": "getContractAddressesByName",
    "inputs": [
      {
        "type": "string[]",
        "name": "_names",
        "internalType": "string[]"
      }
    ]
  },
  {
    "type": "function",
    "stateMutability": "nonpayable",
    "outputs": [

    ],
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
  }
]

const pChainStakeMirrorABI = [
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
    "stateMutability": "view",
    "outputs": [
      {
        "type": "bytes32",
        "name": "",
        "internalType": "bytes32"
      }
    ],
    "name": "endTimeToTransactionHashList",
    "inputs": [
      {
        "type": "uint256",
        "name": "",
        "internalType": "uint256"
      },
      {
        "type": "uint256",
        "name": "",
        "internalType": "uint256"
      }
    ]
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
        "type": "bytes32[]",
        "name": "",
        "internalType": "bytes32[]"
      }
    ],
    "name": "getTransactionHashList",
    "inputs": [
      {
        "type": "uint256",
        "name": "_endTime",
        "internalType": "uint256"
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
    "name": "revokeStake",
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
      },
      {
        "type": "uint256",
        "name": "_endTime",
        "internalType": "uint256"
      },
      {
        "type": "uint256",
        "name": "_endTimeTxHashIndex",
        "internalType": "uint256"
      }
    ]
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
    "stateMutability": "view",
    "outputs": [
      {
        "type": "address",
        "name": "owner",
        "internalType": "address"
      },
      {
        "type": "bytes20",
        "name": "nodeId",
        "internalType": "bytes20"
      },
      {
        "type": "uint64",
        "name": "weightGwei",
        "internalType": "uint64"
      }
    ],
    "name": "transactionHashToPChainStakingData",
    "inputs": [
      {
        "type": "bytes32",
        "name": "",
        "internalType": "bytes32"
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
    "name": "StakeRevoked",
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

export const distributionToDelegatorsABI = [
  {
    "type": "constructor",
    "stateMutability": "nonpayable",
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
        "type": "address",
        "name": "_treasury",
        "internalType": "contract DistributionTreasury"
      },
      {
        "type": "uint256",
        "name": "_totalEntitlementWei",
        "internalType": "uint256"
      },
      {
        "type": "uint256",
        "name": "_latestEntitlementStartTs",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "event",
    "name": "AccountClaimed",
    "inputs": [
      {
        "type": "address",
        "name": "whoClaimed",
        "internalType": "address",
        "indexed": true
      },
      {
        "type": "address",
        "name": "sentTo",
        "internalType": "address",
        "indexed": true
      },
      {
        "type": "uint256",
        "name": "month",
        "internalType": "uint256",
        "indexed": false
      },
      {
        "type": "uint256",
        "name": "amountWei",
        "internalType": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AccountOptOut",
    "inputs": [
      {
        "type": "address",
        "name": "theAccount",
        "internalType": "address",
        "indexed": true
      },
      {
        "type": "bool",
        "name": "confirmed",
        "internalType": "bool",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "EntitlementStart",
    "inputs": [
      {
        "type": "uint256",
        "name": "entitlementStartTs",
        "internalType": "uint256",
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
        "internalType": "bytes4",
        "indexed": false
      },
      {
        "type": "uint256",
        "name": "allowedAfterTimestamp",
        "internalType": "uint256",
        "indexed": false
      },
      {
        "type": "bytes",
        "name": "encodedCall",
        "internalType": "bytes",
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
        "internalType": "address",
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
        "internalType": "address",
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
        "internalType": "bytes4",
        "indexed": false
      },
      {
        "type": "uint256",
        "name": "timestamp",
        "internalType": "uint256",
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
        "internalType": "bytes4",
        "indexed": false
      },
      {
        "type": "uint256",
        "name": "timestamp",
        "internalType": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "UseGoodRandomSet",
    "inputs": [
      {
        "type": "bool",
        "name": "useGoodRandom",
        "internalType": "bool",
        "indexed": false
      },
      {
        "type": "uint256",
        "name": "maxWaitForGoodRandomSeconds",
        "internalType": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "function",
    "stateMutability": "nonpayable",
    "outputs": [],
    "name": "autoClaim",
    "inputs": [
      {
        "type": "address[]",
        "name": "_rewardOwners",
        "internalType": "address[]"
      },
      {
        "type": "uint256",
        "name": "_month",
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
    "stateMutability": "nonpayable",
    "outputs": [
      {
        "type": "uint256",
        "name": "_rewardAmount",
        "internalType": "uint256"
      }
    ],
    "name": "claim",
    "inputs": [
      {
        "type": "address",
        "name": "_rewardOwner",
        "internalType": "address"
      },
      {
        "type": "address",
        "name": "_recipient",
        "internalType": "address"
      },
      {
        "type": "uint256",
        "name": "_month",
        "internalType": "uint256"
      },
      {
        "type": "bool",
        "name": "_wrap",
        "internalType": "bool"
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
        "internalType": "contract ClaimSetupManager"
      }
    ],
    "name": "claimSetupManager",
    "inputs": []
  },
  {
    "type": "function",
    "stateMutability": "view",
    "outputs": [
      {
        "type": "address",
        "name": "",
        "internalType": "contract IICombinedNatBalance"
      }
    ],
    "name": "combinedNat",
    "inputs": []
  },
  {
    "type": "function",
    "stateMutability": "nonpayable",
    "outputs": [],
    "name": "confirmOptOutOfAirdrop",
    "inputs": [
      {
        "type": "address[]",
        "name": "_optOutAddresses",
        "internalType": "address[]"
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
    "name": "daemonize",
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
    "name": "endBlockNumber",
    "inputs": [
      {
        "type": "uint256",
        "name": "",
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
    "name": "entitlementStartTs",
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
    "stateMutability": "view",
    "outputs": [
      {
        "type": "uint256",
        "name": "_amountWei",
        "internalType": "uint256"
      }
    ],
    "name": "getClaimableAmount",
    "inputs": [
      {
        "type": "uint256",
        "name": "_month",
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
        "name": "_amountWei",
        "internalType": "uint256"
      }
    ],
    "name": "getClaimableAmountOf",
    "inputs": [
      {
        "type": "address",
        "name": "_account",
        "internalType": "address"
      },
      {
        "type": "uint256",
        "name": "_month",
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
        "name": "_startMonth",
        "internalType": "uint256"
      },
      {
        "type": "uint256",
        "name": "_endMonth",
        "internalType": "uint256"
      }
    ],
    "name": "getClaimableMonths",
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
        "type": "uint256",
        "name": "_currentMonth",
        "internalType": "uint256"
      }
    ],
    "name": "getCurrentMonth",
    "inputs": []
  },
  {
    "type": "function",
    "stateMutability": "view",
    "outputs": [
      {
        "type": "uint256",
        "name": "_monthToExpireNext",
        "internalType": "uint256"
      }
    ],
    "name": "getMonthToExpireNext",
    "inputs": []
  },
  {
    "type": "function",
    "stateMutability": "view",
    "outputs": [
      {
        "type": "uint256",
        "name": "_lockedFundsWei",
        "internalType": "uint256"
      },
      {
        "type": "uint256",
        "name": "_totalInflationAuthorizedWei",
        "internalType": "uint256"
      },
      {
        "type": "uint256",
        "name": "_totalClaimedWei",
        "internalType": "uint256"
      }
    ],
    "name": "getTokenPoolSupplyData",
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
        "type": "uint256",
        "name": "",
        "internalType": "uint256"
      }
    ],
    "name": "latestEntitlementStartTs",
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
    "name": "maxWaitForGoodRandomSeconds",
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
    "name": "nextClaimableMonth",
    "inputs": [
      {
        "type": "address",
        "name": "_rewardOwner",
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
    "name": "optOut",
    "inputs": [
      {
        "type": "address",
        "name": "",
        "internalType": "address"
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
    "name": "optOutAddresses",
    "inputs": [
      {
        "type": "uint256",
        "name": "",
        "internalType": "uint256"
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
    "name": "optOutCandidate",
    "inputs": [
      {
        "type": "address",
        "name": "",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "function",
    "stateMutability": "nonpayable",
    "outputs": [],
    "name": "optOutOfAirdrop",
    "inputs": []
  },
  {
    "type": "function",
    "stateMutability": "view",
    "outputs": [
      {
        "type": "address",
        "name": "",
        "internalType": "contract IIRandomProvider"
      }
    ],
    "name": "priceSubmitter",
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
    "name": "sendFundsBackToTreasury",
    "inputs": []
  },
  {
    "type": "function",
    "stateMutability": "nonpayable",
    "outputs": [],
    "name": "setEntitlementStart",
    "inputs": [
      {
        "type": "uint256",
        "name": "_entitlementStartTs",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "function",
    "stateMutability": "nonpayable",
    "outputs": [],
    "name": "setUseGoodRandom",
    "inputs": [
      {
        "type": "bool",
        "name": "_useGoodRandom",
        "internalType": "bool"
      },
      {
        "type": "uint256",
        "name": "_maxWaitForGoodRandomSeconds",
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
    "name": "startBlockNumber",
    "inputs": [
      {
        "type": "uint256",
        "name": "",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "function",
    "stateMutability": "nonpayable",
    "outputs": [],
    "name": "stop",
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
    "name": "stopped",
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
    "name": "totalAvailableAmount",
    "inputs": [
      {
        "type": "uint256",
        "name": "",
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
    "name": "totalBurnedWei",
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
    "name": "totalClaimedWei",
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
    "name": "totalDistributableAmount",
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
    "name": "totalEntitlementWei",
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
    "name": "totalUnclaimedAmount",
    "inputs": [
      {
        "type": "uint256",
        "name": "",
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
    "name": "totalUnclaimedWeight",
    "inputs": [
      {
        "type": "uint256",
        "name": "",
        "internalType": "uint256"
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
        "internalType": "contract DistributionTreasury"
      }
    ],
    "name": "treasury",
    "inputs": []
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
    "stateMutability": "nonpayable",
    "outputs": [],
    "name": "updateTotalEntitlementWei",
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
    "name": "useGoodRandom",
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
    "name": "votePowerBlockNumbers",
    "inputs": [
      {
        "type": "uint256",
        "name": "",
        "internalType": "uint256"
      },
      {
        "type": "uint256",
        "name": "",
        "internalType": "uint256"
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
        "internalType": "contract WNat"
      }
    ],
    "name": "wNat",
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
    "name": "waitingForGoodRandomSinceTs",
    "inputs": []
  },
  {
    "type": "receive",
    "stateMutability": "payable"
  }
]

export const validatorRewardManagerABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "_governance", "type": "address" },
      { "internalType": "address", "name": "_addressUpdater", "type": "address" },
      { "internalType": "address", "name": "_oldRewardManager", "type": "address" }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "address", "name": "rewardOwner", "type": "address" },
      { "indexed": false, "internalType": "address[]", "name": "recipients", "type": "address[]" }
    ],
    "name": "AllowedClaimRecipientsChanged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "address", "name": "rewardOwner", "type": "address" },
      { "indexed": false, "internalType": "address[]", "name": "executors", "type": "address[]" }
    ],
    "name": "ClaimExecutorsChanged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "uint256", "name": "authorizedAmountWei", "type": "uint256" }
    ],
    "name": "DailyAuthorizedInflationSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "bytes4", "name": "selector", "type": "bytes4" },
      { "indexed": false, "internalType": "uint256", "name": "allowedAfterTimestamp", "type": "uint256" },
      { "indexed": false, "internalType": "bytes", "name": "encodedCall", "type": "bytes" }
    ],
    "name": "GovernanceCallTimelocked",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "address", "name": "initialGovernance", "type": "address" }
    ],
    "name": "GovernanceInitialised",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "address", "name": "governanceSettings", "type": "address" }
    ],
    "name": "GovernedProductionModeEntered",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "uint256", "name": "amountReceivedWei", "type": "uint256" }
    ],
    "name": "InflationReceived",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "beneficiary", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "sentTo", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "RewardClaimed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [{ "indexed": false, "internalType": "address", "name": "rewardManager", "type": "address" }],
    "name": "RewardManagerActivated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [{ "indexed": false, "internalType": "address", "name": "rewardManager", "type": "address" }],
    "name": "RewardManagerDeactivated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "address[]", "name": "addresses", "type": "address[]" },
      { "indexed": false, "internalType": "uint256[]", "name": "rewards", "type": "uint256[]" }
    ],
    "name": "RewardsDistributed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "bytes4", "name": "selector", "type": "bytes4" },
      { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
    ],
    "name": "TimelockedGovernanceCallCanceled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "bytes4", "name": "selector", "type": "bytes4" },
      { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
    ],
    "name": "TimelockedGovernanceCallExecuted",
    "type": "event"
  },
  { "inputs": [], "name": "activate", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  {
    "inputs": [],
    "name": "active",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "_rewardOwner", "type": "address" }],
    "name": "allowedClaimRecipients",
    "outputs": [{ "internalType": "address[]", "name": "", "type": "address[]" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "bytes4", "name": "_selector", "type": "bytes4" }],
    "name": "cancelGovernanceCall",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "_rewardOwner", "type": "address" },
      { "internalType": "address payable", "name": "_recipient", "type": "address" },
      { "internalType": "uint256", "name": "_rewardAmount", "type": "uint256" },
      { "internalType": "bool", "name": "_wrap", "type": "bool" }
    ],
    "name": "claim",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "_rewardOwner", "type": "address" }],
    "name": "claimExecutors",
    "outputs": [{ "internalType": "address[]", "name": "", "type": "address[]" }],
    "stateMutability": "view",
    "type": "function"
  },
  { "inputs": [], "name": "deactivate", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  {
    "inputs": [
      { "internalType": "address[]", "name": "_addresses", "type": "address[]" },
      { "internalType": "uint256[]", "name": "_rewardAmounts", "type": "uint256[]" }
    ],
    "name": "distributeRewards",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "bytes4", "name": "_selector", "type": "bytes4" }],
    "name": "executeGovernanceCall",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getAddressUpdater",
    "outputs": [{ "internalType": "address", "name": "_addressUpdater", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getContractName",
    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getInflationAddress",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "_beneficiary", "type": "address" }],
    "name": "getStateOfRewards",
    "outputs": [
      { "internalType": "uint256", "name": "_totalReward", "type": "uint256" },
      { "internalType": "uint256", "name": "_claimedReward", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getTokenPoolSupplyData",
    "outputs": [
      { "internalType": "uint256", "name": "_lockedFundsWei", "type": "uint256" },
      { "internalType": "uint256", "name": "_totalInflationAuthorizedWei", "type": "uint256" },
      { "internalType": "uint256", "name": "_totalClaimedWei", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getTotals",
    "outputs": [
      { "internalType": "uint256", "name": "_totalAwardedWei", "type": "uint256" },
      { "internalType": "uint256", "name": "_totalClaimedWei", "type": "uint256" },
      { "internalType": "uint256", "name": "_totalInflationAuthorizedWei", "type": "uint256" },
      { "internalType": "uint256", "name": "_totalInflationReceivedWei", "type": "uint256" },
      { "internalType": "uint256", "name": "_lastInflationAuthorizationReceivedTs", "type": "uint256" },
      { "internalType": "uint256", "name": "_dailyAuthorizedInflation", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "governance",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "governanceSettings",
    "outputs": [{ "internalType": "contract IGovernanceSettings", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "_initialGovernance", "type": "address" }],
    "name": "initialise",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "newRewardManager",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "oldRewardManager",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "productionMode",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
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
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address[]", "name": "_recipients", "type": "address[]" }],
    "name": "setAllowedClaimRecipients",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address[]", "name": "_executors", "type": "address[]" }],
    "name": "setClaimExecutors",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "_toAuthorizeWei", "type": "uint256" }],
    "name": "setDailyAuthorizedInflation",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "_newRewardManager", "type": "address" }],
    "name": "setNewRewardManager",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "_rewardDistributor", "type": "address" }],
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
    "inputs": [{ "internalType": "bytes4", "name": "", "type": "bytes4" }],
    "name": "timelockedCalls",
    "outputs": [
      { "internalType": "uint256", "name": "allowedAfterTimestamp", "type": "uint256" },
      { "internalType": "bytes", "name": "encodedCall", "type": "bytes" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "bytes32[]", "name": "_contractNameHashes", "type": "bytes32[]" },
      { "internalType": "address[]", "name": "_contractAddresses", "type": "address[]" }
    ],
    "name": "updateContractAddresses",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "wNat",
    "outputs": [{ "internalType": "contract WNat", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  }
]


export const claimSetupManagerABI = [
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
        "internalType": "uint256",
        "name": "_feeValueUpdateOffset",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_minFeeValueWei",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_maxFeeValueWei",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_registerExecutorFeeValueWei",
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
        "internalType": "address",
        "name": "owner",
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
        "name": "executor",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "validFromRewardEpoch",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "feeValueWei",
        "type": "uint256"
      }
    ],
    "name": "ClaimExecutorFeeValueChanged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "owner",
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
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "contract IDelegationAccount",
        "name": "delegationAccount",
        "type": "address"
      }
    ],
    "name": "DelegationAccountCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "contract IDelegationAccount",
        "name": "delegationAccount",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "enabled",
        "type": "bool"
      }
    ],
    "name": "DelegationAccountUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "executor",
        "type": "address"
      }
    ],
    "name": "ExecutorRegistered",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "executor",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "validFromRewardEpoch",
        "type": "uint256"
      }
    ],
    "name": "ExecutorUnregistered",
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
        "name": "maxFeeValueWei",
        "type": "uint256"
      }
    ],
    "name": "MaxFeeSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "minFeeValueWei",
        "type": "uint256"
      }
    ],
    "name": "MinFeeSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "registerExecutorFeeValueWei",
        "type": "uint256"
      }
    ],
    "name": "RegisterExecutorFeeSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "excessAmount",
        "type": "uint256"
      }
    ],
    "name": "SetExecutorsExcessAmountRefunded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "libraryAddress",
        "type": "address"
      }
    ],
    "name": "SetLibraryAddress",
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
    "inputs": [
      {
        "internalType": "address",
        "name": "_owner",
        "type": "address"
      }
    ],
    "name": "accountToDelegationAccount",
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
        "name": "_owner",
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
        "name": "_executor",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "_claimFor",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "_recipient",
        "type": "address"
      }
    ],
    "name": "checkExecutorAndAllowedRecipient",
    "outputs": [],
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
      }
    ],
    "name": "delegateGovernance",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "disableDelegationAccount",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "enableDelegationAccount",
    "outputs": [
      {
        "internalType": "contract IDelegationAccount",
        "name": "",
        "type": "address"
      }
    ],
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
    "name": "feeValueUpdateOffset",
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
    "name": "ftsoManager",
    "outputs": [
      {
        "internalType": "contract IFtsoManager",
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
    "inputs": [
      {
        "internalType": "address",
        "name": "_executor",
        "type": "address"
      },
      {
        "internalType": "address[]",
        "name": "_owners",
        "type": "address[]"
      }
    ],
    "name": "getAutoClaimAddressesAndExecutorFee",
    "outputs": [
      {
        "internalType": "address[]",
        "name": "_recipients",
        "type": "address[]"
      },
      {
        "internalType": "uint256",
        "name": "_executorFeeValue",
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
    "name": "getDelegationAccountData",
    "outputs": [
      {
        "internalType": "contract IDelegationAccount",
        "name": "_delegationAccount",
        "type": "address"
      },
      {
        "internalType": "bool",
        "name": "_enabled",
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
        "name": "_executor",
        "type": "address"
      }
    ],
    "name": "getExecutorCurrentFeeValue",
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
        "name": "_executor",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "_rewardEpoch",
        "type": "uint256"
      }
    ],
    "name": "getExecutorFeeValue",
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
        "name": "_executor",
        "type": "address"
      }
    ],
    "name": "getExecutorInfo",
    "outputs": [
      {
        "internalType": "bool",
        "name": "_registered",
        "type": "bool"
      },
      {
        "internalType": "uint256",
        "name": "_currentFeeValue",
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
        "name": "_executor",
        "type": "address"
      }
    ],
    "name": "getExecutorScheduledFeeValueChanges",
    "outputs": [
      {
        "internalType": "uint256[]",
        "name": "_feeValue",
        "type": "uint256[]"
      },
      {
        "internalType": "uint256[]",
        "name": "_validFromEpoch",
        "type": "uint256[]"
      },
      {
        "internalType": "bool[]",
        "name": "_fixed",
        "type": "bool[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_start",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_end",
        "type": "uint256"
      }
    ],
    "name": "getRegisteredExecutors",
    "outputs": [
      {
        "internalType": "address[]",
        "name": "_registeredExecutors",
        "type": "address[]"
      },
      {
        "internalType": "uint256",
        "name": "_totalLength",
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
    "inputs": [],
    "name": "governanceVP",
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
        "internalType": "address",
        "name": "_owner",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "_executor",
        "type": "address"
      }
    ],
    "name": "isClaimExecutor",
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
    "name": "libraryAddress",
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
    "name": "maxFeeValueWei",
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
    "name": "minFeeValueWei",
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
        "internalType": "uint256",
        "name": "_feeValue",
        "type": "uint256"
      }
    ],
    "name": "registerExecutor",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "registerExecutorFeeValueWei",
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
      },
      {
        "internalType": "bool",
        "name": "_enableDelegationAccount",
        "type": "bool"
      }
    ],
    "name": "setAutoClaiming",
    "outputs": [],
    "stateMutability": "payable",
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
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_libraryAddress",
        "type": "address"
      }
    ],
    "name": "setLibraryAddress",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_maxFeeValueWei",
        "type": "uint256"
      }
    ],
    "name": "setMaxFeeValueWei",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_minFeeValueWei",
        "type": "uint256"
      }
    ],
    "name": "setMinFeeValueWei",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_registerExecutorFeeValueWei",
        "type": "uint256"
      }
    ],
    "name": "setRegisterExecutorFeeValueWei",
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
        "internalType": "contract IERC20",
        "name": "_token",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "_amount",
        "type": "uint256"
      }
    ],
    "name": "transferExternalToken",
    "outputs": [],
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
    "inputs": [],
    "name": "undelegateGovernance",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "unregisterExecutor",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "_validFromEpoch",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
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
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_feeValue",
        "type": "uint256"
      }
    ],
    "name": "updateExecutorFeeValue",
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
  }
]