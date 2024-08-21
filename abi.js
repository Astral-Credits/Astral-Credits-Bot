const erc20_abi = [
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
    "outputs": [],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [
      {
        "name": "who",
        "type": "address"
      }
    ],
    "name": "balanceOf",
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
];

const erc20_and_ftso_abi = [
  ...erc20_abi,
  //put in address of user, get those who they delegated to
  {
    "type": "function",
    "stateMutability": "view",
    "outputs": [
      {
        "type": "address[]",
        "name": "_delegateAddresses",
        "internalType": "address[]"
      },
      {
        "type": "uint256[]",
        "name": "_bips",
        "internalType": "uint256[]"
      },
      {
        "type": "uint256",
        "name": "_count",
        "internalType": "uint256"
      },
      {
        "type": "uint256",
        "name": "_delegationMode",
        "internalType": "uint256"
      }
    ],
    "name": "delegatesOf",
    "inputs": [
      {
        "type": "address",
        "name": "_owner",
        "internalType": "address"
      }
    ]
  }, 
]

const erc1155_abi = [
  {
		"inputs": [
			{
				"internalType": "address[]",
				"name": "accounts",
				"type": "address[]"
			},
			{
				"internalType": "uint256[]",
				"name": "ids",
				"type": "uint256[]"
			}
		],
		"name": "balanceOfBatch",
		"outputs": [
			{
				"internalType": "uint256[]",
				"name": "",
				"type": "uint256[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
];

const domains_abi = [
  {
    "type": "function",
    "stateMutability": "view",
    "outputs": [
      {
        "type": "string",
        "name": "name",
        "internalType": "string"
      },
      {
        "type": "uint256",
        "name": "tokenId",
        "internalType": "uint256"
      },
      {
        "type": "address",
        "name": "holder",
        "internalType": "address"
      },
      {
        "type": "string",
        "name": "data",
        "internalType": "string"
      }
    ],
    "name": "domains",
    "inputs": [
      {
        "type": "string",
        "name": "",
        "internalType": "string"
      }
    ]
  }
];

const sgb_domain_abi = [
  {
    "type": "function",
    "stateMutability": "view",
    "outputs": [
      {
        "type": "string",
        "name": "",
        "internalType": "string"
      }
    ],
    "name": "getDefaultDomain",
    "inputs": [
      {
        "type": "address",
        "name": "_addr",
        "internalType": "address"
      },
      {
        "type": "string",
        "name": "_tld",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "function",
    "stateMutability": "view",
    "outputs": [
      {
        "type": "string",
        "name": "",
        "internalType": "string"
      }
    ],
    "name": "getDefaultDomains",
    "inputs": [
      {
        "type": "address",
        "name": "_addr",
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
    "name": "getDomainHolder",
    "inputs": [
      {
        "type": "string",
        "name": "_domainName",
        "internalType": "string"
      },
      {
        "type": "string",
        "name": "_tld",
        "internalType": "string"
      }
    ]
  }
];

const multisend_abi = [
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "address[]",
				"name": "tos",
				"type": "address[]"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "amount_each",
				"type": "uint256"
			}
		],
		"name": "NativeBatchSend",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "address[]",
				"name": "tos",
				"type": "address[]"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "amount_each",
				"type": "uint256"
			}
		],
		"name": "TokenBatchSend",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "address[]",
				"name": "tos",
				"type": "address[]"
			},
			{
				"internalType": "uint256",
				"name": "amount_each",
				"type": "uint256"
			}
		],
		"name": "native_batch_send",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "token_address",
				"type": "address"
			},
			{
				"internalType": "address[]",
				"name": "tos",
				"type": "address[]"
			},
			{
				"internalType": "uint256",
				"name": "amount_each",
				"type": "uint256"
			}
		],
		"name": "token_batch_send",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	}
];

const airdrop_abi = [
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "id",
				"type": "uint256"
			}
		],
		"name": "AirdropEnd",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "id",
				"type": "uint256"
			}
		],
		"name": "AirdropStart",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "id",
				"type": "uint256"
			}
		],
		"name": "end",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "id",
				"type": "uint256"
			},
			{
				"internalType": "uint8",
				"name": "_v",
				"type": "uint8"
			},
			{
				"internalType": "bytes32",
				"name": "_r",
				"type": "bytes32"
			},
			{
				"internalType": "bytes32",
				"name": "_s",
				"type": "bytes32"
			}
		],
		"name": "join",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint64",
				"name": "end_timestamp",
				"type": "uint64"
			},
			{
				"internalType": "uint8",
				"name": "max",
				"type": "uint8"
			}
		],
		"name": "native_start",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint64",
				"name": "end_timestamp",
				"type": "uint64"
			},
			{
				"internalType": "uint8",
				"name": "max",
				"type": "uint8"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			},
			{
				"internalType": "address",
				"name": "token_address",
				"type": "address"
			}
		],
		"name": "token_start",
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
				"name": "_signer_address",
				"type": "address"
			}
		],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"name": "airdrops",
		"outputs": [
			{
				"internalType": "address",
				"name": "creator",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "token_address",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			},
			{
				"internalType": "uint8",
				"name": "max_participants",
				"type": "uint8"
			},
			{
				"internalType": "uint256",
				"name": "end_timestamp",
				"type": "uint256"
			},
			{
				"internalType": "bool",
				"name": "ended",
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
				"name": "id",
				"type": "uint256"
			}
		],
		"name": "is_time",
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
		"name": "signer_address",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
];

const airdrop2_abi = [
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "id",
				"type": "uint256"
			}
		],
		"name": "AirdropStart",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "id",
				"type": "uint256"
			},
			{
				"internalType": "uint8",
				"name": "_v",
				"type": "uint8"
			},
			{
				"internalType": "bytes32",
				"name": "_r",
				"type": "bytes32"
			},
			{
				"internalType": "bytes32",
				"name": "_s",
				"type": "bytes32"
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
				"internalType": "uint64",
				"name": "end_timestamp",
				"type": "uint64"
			},
			{
				"internalType": "uint256",
				"name": "amount_each",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "max",
				"type": "uint256"
			}
		],
		"name": "native_start",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "id",
				"type": "uint256"
			}
		],
		"name": "refund",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint64",
				"name": "end_timestamp",
				"type": "uint64"
			},
			{
				"internalType": "uint256",
				"name": "amount_each",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "max",
				"type": "uint256"
			},
			{
				"internalType": "address",
				"name": "token_address",
				"type": "address"
			}
		],
		"name": "token_start",
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
				"name": "_signer_address",
				"type": "address"
			}
		],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"name": "airdrops",
		"outputs": [
			{
				"internalType": "address",
				"name": "creator",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "token_address",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "amount_each",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "max_participants",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "end_timestamp",
				"type": "uint256"
			},
			{
				"internalType": "bool",
				"name": "refunded",
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
				"name": "id",
				"type": "uint256"
			}
		],
		"name": "is_time",
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
		"name": "signer_address",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
];

module.exports = {
  erc20_abi,
  erc20_and_ftso_abi,
  erc1155_abi,
  domains_abi,
  sgb_domain_abi,
  multisend_abi,
  airdrop_abi,
  aridrop2_abi,
};
