import { ContractAddressesInterface } from "../interfaces"

/**
 * @description max delegation allowed per address
 */
export const maxAllowedDelegation = 3


/**
 * @description Stores the default chain-wise addresses for contracts
 */
export const defaultContractAddresses: ContractAddressesInterface = {
    AddressBinder:
    {
        flare: "0xCc8f7C3d04C7f60BC89fA4DCDC77D668183aa2ac",
        costwo: "0xCc8f7C3d04C7f60BC89fA4DCDC77D668183aa2ac"
    },
    ValidatorRewardManager:
    {
        flare: "0xc0cf3aaf93bd978c5bc662564aa73e331f2ec0b5",
        costwo: "0x33913AcE907F682E305f36d7538D3cCd37E2cA5B"
    },
    flareContractRegistryAddress:
    {
        flare: "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019",
        costwo: "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019"
    },
    PChainStakeMirror:
    {
        flare: "0x7b61F9F27153a4F2F57Dc30bF08A8eb0cCB96C22",
        costwo: "0x3F65F2e9e25EdA1189c3aF3D596f1c2E71ececa9"
    }
}

export const addressBinderContractName = "AddressBinder"
export const validatorRewardManagerContractName = "ValidatorRewardManager"
export const contractTransactionName = "ContractTransaction"
export const pChainStakeMirror = "PChainStakeMirror"
/**
 * @description returns the AddressBinder contract ABI
 */
export function getAddressBinderABI() {
    return addressBinderABI
}

/**
 * @description returns the ValidatorRewardManager contract ABI
 */
export function getValidatorRewardManagerABI() {
    return validatorRewardManagerABI
}

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

const addressBinderABI = [
    {
        "type": "function",
        "stateMutability": "view",
        "outputs": [
            {
                "type": "bytes20",
                "name": "",
                "internalType": "bytes20"
            }
        ],
        "name": "cAddressToPAddress",
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
        "name": "pAddressToCAddress",
        "inputs": [
            {
                "type": "bytes20",
                "name": "",
                "internalType": "bytes20"
            }
        ]
    },
    {
        "type": "function",
        "stateMutability": "nonpayable",
        "outputs": [

        ],
        "name": "registerAddresses",
        "inputs": [
            {
                "type": "bytes",
                "name": "_publicKey",
                "internalType": "bytes"
            },
            {
                "type": "bytes20",
                "name": "_pAddress",
                "internalType": "bytes20"
            },
            {
                "type": "address",
                "name": "_cAddress",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "event",
        "name": "AddressesRegistered",
        "inputs": [
            {
                "type": "bytes",
                "name": "publicKey",
                "indexed": false
            },
            {
                "type": "bytes20",
                "name": "pAddress",
                "indexed": false
            },
            {
                "type": "address",
                "name": "cAddress",
                "indexed": false
            }
        ],
        "anonymous": false
    }
]

const flareContractRegistryABI = [
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

const validatorRewardManagerABI = [
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
                "name": "_addressUpdater",
                "internalType": "address"
            },
            {
                "type": "address",
                "name": "_oldRewardManager",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "event",
        "name": "AllowedClaimRecipientsChanged",
        "inputs": [
            {
                "type": "address",
                "name": "rewardOwner",
                "internalType": "address",
                "indexed": false
            },
            {
                "type": "address[]",
                "name": "recipients",
                "internalType": "address[]",
                "indexed": false
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "ClaimExecutorsChanged",
        "inputs": [
            {
                "type": "address",
                "name": "rewardOwner",
                "internalType": "address",
                "indexed": false
            },
            {
                "type": "address[]",
                "name": "executors",
                "internalType": "address[]",
                "indexed": false
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "DailyAuthorizedInflationSet",
        "inputs": [
            {
                "type": "uint256",
                "name": "authorizedAmountWei",
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
        "name": "InflationReceived",
        "inputs": [
            {
                "type": "uint256",
                "name": "amountReceivedWei",
                "internalType": "uint256",
                "indexed": false
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "RewardClaimed",
        "inputs": [
            {
                "type": "address",
                "name": "beneficiary",
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
                "name": "amount",
                "internalType": "uint256",
                "indexed": false
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "RewardManagerActivated",
        "inputs": [
            {
                "type": "address",
                "name": "rewardManager",
                "internalType": "address",
                "indexed": false
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "RewardManagerDeactivated",
        "inputs": [
            {
                "type": "address",
                "name": "rewardManager",
                "internalType": "address",
                "indexed": false
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "RewardsDistributed",
        "inputs": [
            {
                "type": "address[]",
                "name": "addresses",
                "internalType": "address[]",
                "indexed": false
            },
            {
                "type": "uint256[]",
                "name": "rewards",
                "internalType": "uint256[]",
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
        "type": "function",
        "stateMutability": "nonpayable",
        "outputs": [

        ],
        "name": "activate",
        "inputs": [

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
        "name": "active",
        "inputs": [

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
        "name": "allowedClaimRecipients",
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
        "stateMutability": "nonpayable",
        "outputs": [

        ],
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
                "internalType": "address payable"
            },
            {
                "type": "uint256",
                "name": "_rewardAmount",
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
                "type": "address[]",
                "name": "",
                "internalType": "address[]"
            }
        ],
        "name": "claimExecutors",
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
        "stateMutability": "nonpayable",
        "outputs": [

        ],
        "name": "deactivate",
        "inputs": [

        ]
    },
    {
        "type": "function",
        "stateMutability": "nonpayable",
        "outputs": [

        ],
        "name": "distributeRewards",
        "inputs": [
            {
                "type": "address[]",
                "name": "_addresses",
                "internalType": "address[]"
            },
            {
                "type": "uint256[]",
                "name": "_rewardAmounts",
                "internalType": "uint256[]"
            }
        ]
    },
    {
        "type": "function",
        "stateMutability": "nonpayable",
        "outputs": [

        ],
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
        "stateMutability": "pure",
        "outputs": [
            {
                "type": "string",
                "name": "",
                "internalType": "string"
            }
        ],
        "name": "getContractName",
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
        "name": "getInflationAddress",
        "inputs": [

        ]
    },
    {
        "type": "function",
        "stateMutability": "view",
        "outputs": [
            {
                "type": "uint256",
                "name": "_totalReward",
                "internalType": "uint256"
            },
            {
                "type": "uint256",
                "name": "_claimedReward",
                "internalType": "uint256"
            }
        ],
        "name": "getStateOfRewards",
        "inputs": [
            {
                "type": "address",
                "name": "_beneficiary",
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
        "inputs": [

        ]
    },
    {
        "type": "function",
        "stateMutability": "view",
        "outputs": [
            {
                "type": "uint256",
                "name": "_totalAwardedWei",
                "internalType": "uint256"
            },
            {
                "type": "uint256",
                "name": "_totalClaimedWei",
                "internalType": "uint256"
            },
            {
                "type": "uint256",
                "name": "_totalInflationAuthorizedWei",
                "internalType": "uint256"
            },
            {
                "type": "uint256",
                "name": "_totalInflationReceivedWei",
                "internalType": "uint256"
            },
            {
                "type": "uint256",
                "name": "_lastInflationAuthorizationReceivedTs",
                "internalType": "uint256"
            },
            {
                "type": "uint256",
                "name": "_dailyAuthorizedInflation",
                "internalType": "uint256"
            }
        ],
        "name": "getTotals",
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
        "name": "governance",
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
                "internalType": "contract IGovernanceSettings"
            }
        ],
        "name": "governanceSettings",
        "inputs": [

        ]
    },
    {
        "type": "function",
        "stateMutability": "nonpayable",
        "outputs": [

        ],
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
                "type": "address",
                "name": "",
                "internalType": "address"
            }
        ],
        "name": "newRewardManager",
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
        "name": "oldRewardManager",
        "inputs": [

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
        "name": "productionMode",
        "inputs": [

        ]
    },
    {
        "type": "function",
        "stateMutability": "payable",
        "outputs": [

        ],
        "name": "receiveInflation",
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
        "name": "rewardDistributor",
        "inputs": [

        ]
    },
    {
        "type": "function",
        "stateMutability": "nonpayable",
        "outputs": [

        ],
        "name": "setAllowedClaimRecipients",
        "inputs": [
            {
                "type": "address[]",
                "name": "_recipients",
                "internalType": "address[]"
            }
        ]
    },
    {
        "type": "function",
        "stateMutability": "nonpayable",
        "outputs": [

        ],
        "name": "setClaimExecutors",
        "inputs": [
            {
                "type": "address[]",
                "name": "_executors",
                "internalType": "address[]"
            }
        ]
    },
    {
        "type": "function",
        "stateMutability": "nonpayable",
        "outputs": [

        ],
        "name": "setDailyAuthorizedInflation",
        "inputs": [
            {
                "type": "uint256",
                "name": "_toAuthorizeWei",
                "internalType": "uint256"
            }
        ]
    },
    {
        "type": "function",
        "stateMutability": "nonpayable",
        "outputs": [

        ],
        "name": "setNewRewardManager",
        "inputs": [
            {
                "type": "address",
                "name": "_newRewardManager",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "function",
        "stateMutability": "nonpayable",
        "outputs": [

        ],
        "name": "setRewardDistributor",
        "inputs": [
            {
                "type": "address",
                "name": "_rewardDistributor",
                "internalType": "address"
            }
        ]
    },
    {
        "type": "function",
        "stateMutability": "nonpayable",
        "outputs": [

        ],
        "name": "switchToProductionMode",
        "inputs": [

        ]
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
        "inputs": [

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