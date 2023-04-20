const { ethers } = require('ethers');
const { fetch } = require('cross-fetch');
const fs = require('fs')

const provider = new ethers.providers.JsonRpcProvider("https://songbird-api.flare.network/ext/C/rpc");

//0x37987397aC240f0cbCaA10a669bC2C90A91C0d51
let wallet = new ethers.Wallet(process.env.privkey);
wallet = wallet.connect(provider);

let faucet_wallet = new ethers.Wallet(process.env.faucet_privkey);
faucet_wallet = wallet.connect(provider);

//faucet wallet:

const token_contract_address = "0x61b64c643fCCd6ff34Fc58C8ddff4579A89E2723";

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

let astral_token = new ethers.Contract(token_contract_address, erc20_abi, wallet);
let faucet_astral_token = new ethers.Contract(token_contract_address, erc20_abi, faucet_wallet);

//send stuff, but also price queries and whatnot

async function send_astral(address, amount) {
  amount = ethers.utils.parseUnits(amount, 18);
  try {
    return (await astral_token.transfer(address, amount)).hash;
  } catch (e) {
    console.log(e);
    return false;
  }
}

async function faucet_send_astral(address, amount) {
  amount = ethers.utils.parseUnits(amount, 18);
  try {
    return (await faucet_astral_token.transfer(address, amount)).hash;
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

module.exports = {
  get_liquidity_blaze: get_liquidity_blaze,
  send_astral: send_astral,
  faucet_send_astral: faucet_send_astral,
  get_price: get_price,
  get_coin_price: get_coin_price,
  get_historic: get_historic,
  is_valid: ethers.utils.isAddress
  //
};
