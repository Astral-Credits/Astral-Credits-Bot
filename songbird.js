const { ethers } = require('ethers');
const { fetch } = require('cross-fetch');

const { hash, hex_to_bigint, bigint_to_hex, pad_hex } = require('./util.js');

const provider = new ethers.providers.JsonRpcProvider("https://songbird-api.flare.network/ext/C/rpc");

//0x37987397aC240f0cbCaA10a669bC2C90A91C0d51 - tipping
let wallet = new ethers.Wallet(process.env.privkey);
wallet = wallet.connect(provider);

//0xb1Db39De1d4DaEAFeAD4267E1CC5d30651b27833
let faucet_wallet = new ethers.Wallet(process.env.faucet_privkey);
faucet_wallet = faucet_wallet.connect(provider);

const token_contract_address = "0x61b64c643fCCd6ff34Fc58C8ddff4579A89E2723";
const nft_contract_address = "0x288F45e46aD434808c65880dCc2F21938b7Da23d";
const sgb_domain_contract_address = "0x7e8aB50697C7Abe63Bdab6B155C2FB8D285458cB";

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
  }
];

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

let astral_token = new ethers.Contract(token_contract_address, erc20_abi, wallet);
let astral_nft = new ethers.Contract(nft_contract_address, erc1155_abi, faucet_wallet);
let wrapped_songbird_token = new ethers.Contract("0x02f0826ef6aD107Cfc861152B32B52fD11BaB9ED", erc20_abi, faucet_wallet);
let faucet_astral_token = new ethers.Contract(token_contract_address, erc20_abi, faucet_wallet);

let sgb_domain_contract = new ethers.Contract(sgb_domain_contract_address, sgb_domain_abi, provider);
let domains_contract = new ethers.Contract("0xBDACF94dDCAB51c39c2dD50BffEe60Bb8021949a", domains_abi, wallet);

//faucet requirements
//how many blocks sgb/nft has to be held for. 43200 is 24 hours, since block time is 2 seconds so 43200 blocks is around 24 hours - 1800 blocks is around 1 Hour
const HOLDING_BLOCK_TIME = 43200;

//do a sanity check to make sure the tipbot derive privkey can never exceed 32 bytes (this would be bad :tm:), as priv key would be invalid
//priv keys are 32 bytes, meaning 256**32-1 is the max
//discord snowflakes are 64 bits (8 bytes), meaning 256**8 is the max. source: https://discord.com/developers/docs/reference#snowflakes
//for it to overflow, the first 48 characters of the private key needs to be "f" (basically impossible to be generated naturally)
//this does mean that we can do this sanity check by doing
//`if (process.env.tipbot_derive_privkey.toLowerCase().startsWith("0x"+"f".repeat(48)))`
//but that's way less fun
//-prussia
if (hex_to_bigint(process.env.tipbot_derive_privkey)+BigInt(256)**BigInt(8) > BigInt(256)**BigInt(32)-BigInt(1)) {
  throw Error("Tipbot derive private key may overflow!! Generate a new one, please. This is incredibly improbable to happen.");
}

//get songbird balance
async function get_bal(address) {
  return ethers.utils.formatEther(await provider.getBalance(address));
}

async function get_bal_astral(address) {
  let astral_bal = await astral_token.balanceOf(address);
  return Number(ethers.utils.formatUnits(astral_bal.toString(), 18));
}

//tipbot/coinflip functions
async function derive_wallet(user_id) {
  let derived_priv_key = "0x"+await hash(pad_hex(bigint_to_hex(hex_to_bigint(process.env.tipbot_derive_privkey)+BigInt(user_id))));
  let derived_wallet = new ethers.Wallet(derived_priv_key);
  derived_wallet = derived_wallet.connect(provider);
  return derived_wallet;
}

async function get_tipbot_address(user_id) {
  let derived_wallet = await derive_wallet(user_id);
  return derived_wallet.address;
}

async function user_withdraw_songbird(user_id, address, amount) {
  amount = ethers.utils.parseEther(String(amount));
  let derived_wallet = await derive_wallet(user_id);
  try {
    return await derived_wallet.sendTransaction({
      to: address.toLowerCase(),
      value: amount,
    });
  } catch (e) {
    //console.log(e);
    return false;
  }
}

async function user_withdraw_astral(user_id, address, amount) {
  amount = ethers.utils.parseUnits(String(amount), 18);
  let derived_wallet = await derive_wallet(user_id);
  let derived_astral_token = new ethers.Contract(token_contract_address, erc20_abi, derived_wallet);
  try {
    return await derived_astral_token.transfer(address, amount);
  } catch (e) {
    //console.log(e);
    return false;
  }
}

//check if they hold enough wrapped songbird or songbird to use the faucet
async function enough_balance(address, holding_requirement) {
  let wrapped_bal = await wrapped_songbird_token.balanceOf(address);
  wrapped_bal = Number(ethers.utils.formatUnits(wrapped_bal.toString(), 18));
  let reg_bal = Number(await get_bal(address));
  return {
    success: wrapped_bal >= holding_requirement || reg_bal >= holding_requirement,
    wrapped_sgb_bal: wrapped_bal,
    sgb_bal: reg_bal
  };
}

async function aged_enough(address, holding_requirement, wrapped_songbird_resp, wrapped_sgb_bal) {
  let holding_enough = false;
  //get current block
  let current_block = await provider.getBlockNumber();
  let songbird_resp = await fetch("https://songbird-explorer.flare.network/api?module=account&action=eth_get_balance&address="+address+"&block="+String(current_block-HOLDING_BLOCK_TIME));
  songbird_resp = await songbird_resp.json();
  if (!songbird_resp.error) {
    let songbird_snapshot = Number(ethers.utils.formatEther(songbird_resp.result));
    if (songbird_snapshot >= holding_requirement) {
      holding_enough = true;
    }
  }
  if (wrapped_songbird_resp.result) {
    wrapped_songbird_resp = wrapped_songbird_resp.result;
    //timestamp attribute can also be used but whatever
    //get token transfers within the hour and see if the (balance)-(total received)=(balance 24 hours ago) is above the holding req or not
    wrapped_songbird_resp = wrapped_songbird_resp.filter(function(item) {
      return item.tokenName === "Wrapped Songbird" && item.blockNumber >= current_block-HOLDING_BLOCK_TIME;
    });
    let wrapped_songbird_snapshot = 0;
    for (let i=0; i < wrapped_songbird_resp.length; i++) {
      if (wrapped_songbird_resp[i].to.toLowerCase() === address.toLowerCase()) {
        wrapped_songbird_snapshot += Number(ethers.utils.formatUnits(wrapped_songbird_resp[i].value, 18));
      } else {
        wrapped_songbird_snapshot -= Number(ethers.utils.formatUnits(wrapped_songbird_resp[i].value, 18));
      }
    }
    //if user sent out more than they received, it should not be added to their wrapped sgb bal obviously
    wrapped_songbird_snapshot = wrapped_songbird_snapshot > 0 ? wrapped_songbird_snapshot : 0;
    if ((wrapped_sgb_bal-wrapped_songbird_snapshot) >= holding_requirement) {
      holding_enough = true;
    }
  }
  if (holding_enough) {
    return true;
  } else {
    return false;
  }
}

//checks if user has the right nfts, and has held them for at least 
async function holds_aged_nfts(address, nft_resp) {
  //genesis token id: 1 (1000 sgb)
  //galactic token id: 2 (100 sgb)
  //hyperdrive token id: 3 (350 sgb)
  //cosmic token id: 4 (700 sgb)
  //hologram token id: 5 (3000 sgb)
  const nft_values = {
    "1": 1000,
    "2": 100,
    "3": 350,
    "4": 700,
    "5": 3000,
  };
  let nft_balances = await astral_nft.balanceOfBatch([address, address, address, address, address], [1, 2, 3, 4, 5]);
  if (nft_resp.result) {
    nft_resp = nft_resp.result;
    let current_block = await provider.getBlockNumber();
    //timestamp attribute can also be used but whatever
    //get token transfers within the hour and see if the (balance)-(total received)=(balance 24 hours ago) is above the holding req or not
    nft_resp = nft_resp.filter(function(item) {
      return item.contractAddress.toLowerCase() === nft_contract_address.toLowerCase() && Object.keys(nft_values).includes(String(item.tokenID)) && item.blockNumber >= current_block-HOLDING_BLOCK_TIME;
    });
    //net received genesis and hologram nfts during the period
    //tokenids: genesis, galactic, hyperdrive, cosmic, hologram
    //why not do `nft_snapshots = nft_balances`? good question I felt like deconstructing
    let nft_snapshots = [0, 0, 0, 0, 0];
    for (let i=0; i < nft_resp.length; i++) {
      let token_id = Number(nft_resp[i].tokenID);
      if (nft_resp[i].to.toLowerCase() === address.toLowerCase()) {
        nft_snapshots[token_id-1] += 1;
      } else {
        nft_snapshots[token_id-1] -= 1;
      }
    }
    nft_snapshots = nft_balances.map((num, index) => {
      //if the user sold/sent more nfts than they bought, it should not be added to their total
      let index_snapshot = nft_snapshots[index] > 0 ? nft_snapshots[index] : 0;
      return num - index_snapshot;
    });
    let total_nft_value = 0;
    for (let j=0; j < nft_snapshots.length; j++) {
      let held = nft_snapshots[j];
      //prevent adding negative amounts if user sends nfts out
      if (held > 0) {
        total_nft_value += nft_values[String(j+1)] * held;
      }
    }
    if (total_nft_value >= 2000) {
      return true;
    } else {
      return false;
    }
  }
}

//send stuff, but also price queries and whatnot

async function send_astral(address, amount) {
  amount = ethers.utils.parseUnits(String(amount), 18);
  try {
    return (await astral_token.transfer(address, amount)).hash;
  } catch (e) {
    console.log(e);
    return false;
  }
}

async function faucet_send_astral(address, amount) {
  amount = ethers.utils.parseUnits(String(amount), 18);
  try {
    return (await faucet_astral_token.transfer(address, amount, {
      gasPrice: ethers.utils.parseUnits('90', 'gwei'),
      gasLimit: 75000
    })).hash;
  } catch (e) {
    console.log(e);
    return false;
  }
}

//https://app.geckoterminal.com/api/p1/songbird/pools/0xa49259d33f8bea503e59f3e75af9d43a119598c0

async function get_liquidity_blaze(astral_price, sgb_price) {
  let resp = await fetch("https://songbird-explorer.flare.network/api?module=account&action=tokenlist&address=0xa49259D33f8bEA503e59F3e75AF9d43A119598C0");
  resp = (await resp.json()).result;
  let wsgb_bal = Number(ethers.utils.formatUnits(resp.find((item) => item.name == "Wrapped Songbird").balance, 18))
  let astral_bal = Number(ethers.utils.formatUnits(resp.find((item) => item.name == "AstralCredits").balance, 18));
  return Math.floor((wsgb_bal*sgb_price+astral_bal*astral_price)*100)/100;
}

async function get_price() {
  let resp = await fetch("https://api.geckoterminal.com/api/v2/networks/songbird/pools/0xa49259d33f8bea503e59f3e75af9d43a119598c0");
  resp = await resp.json();
  return resp.data.attributes;
}

async function get_coin_price(coin) {
  let resp = await fetch(`https://api.coingecko.com/api/v3/coins/${coin}`);
  resp = await resp.json();
  return resp.market_data.current_price.usd;
}

async function get_historic() {
  //historic price data
  let resp = await fetch("https://api.geckoterminal.com/api/v2/networks/songbird/pools/0xa49259d33f8bea503e59f3e75af9d43a119598c0/ohlcv/day");
  resp = await resp.json();
  return resp.data.attributes;
}

async function check_domain_owned(domain) {
  let ownership_info = await domains_contract.domains(domain);
  if (ownership_info.holder === "0x0000000000000000000000000000000000000000") {
    return false;
  } else {
    return true;
  }
}

async function find_associated(address) {
  const resp = await (await fetch(`https://songbird-explorer.flare.network/api?module=account&action=txlist&address=${address}`)).json();
  let associates = {};
  for (let i=0; i < resp.result.length; i++) {
    let tx = resp.result[i];
    if (tx.to === address) {
      if (associates[tx.from]) {
        associates[tx.from] += 1;
      } else {
        associates[tx.from] = 1;
      }
    } else {
      if (associates[tx.to]) {
        associates[tx.to] += 1;
      } else {
        associates[tx.to] = 1;
      }
    }
  }
  if (associates[""]) {
    delete associates[""];
  }
  return associates;
}

async function find_shared_txs(address1, address2) {
  const resp = await (await fetch(`https://songbird-explorer.flare.network/api?module=account&action=txlist&address=${address1}`)).json();
  let txs = [];
  for (let i=0; i < resp.result.length; i++) {
    let tx = resp.result[i];
    if (tx.to === address2 || tx.from === address2) {
      txs.push(tx.hash);
    }
  }
  return txs;
}

async function lookup_domain_owner(domain) {
  domain = domain.slice(0, -4)
  return await sgb_domain_contract.getDomainHolder(domain, ".sgb");
}

module.exports = {
  HOLDING_BLOCK_TIME,
  get_liquidity_blaze,
  enough_balance,
  get_bal,
  get_bal_astral,
  aged_enough,
  holds_aged_nfts,
  send_astral,
  faucet_send_astral,
  get_price,
  get_coin_price,
  get_historic,
  get_tipbot_address,
  user_withdraw_songbird,
  user_withdraw_astral,
  check_domain_owned,
  find_associated,
  find_shared_txs,
  lookup_domain_owner,
  is_valid: ethers.utils.isAddress
};
