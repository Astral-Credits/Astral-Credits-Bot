const fs = require("fs");
const { ethers } = require('ethers');
const { erc20_abi } = require('../abi.js');
const dotenv = require('dotenv');

dotenv.config();

const { airdrop_find, airdrop_insert } = require('../db.js');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const provider = new ethers.providers.JsonRpcProvider("https://songbird-api.flare.network/ext/C/rpc");

//0xB9E744aaE89260fb95272C5F65A968775644686E
let airdrop_wallet = new ethers.Wallet(process.env.airdrop_privkey);
airdrop_wallet = airdrop_wallet.connect(provider);

/*
:FTHR: 500 FTHR
:sPHX: 5,000 sPHX
:SGB: 5,000 SGB
:astral_creds: 500,000 XAC
:BBX: 5,000,000 BBX
*/

console.log(airdrop_wallet.address);

let fthr_token = new ethers.Contract("0x19eA65E3f8fc8F61743d137B5107172f849d8Eb3", erc20_abi, airdrop_wallet);
let sphx_token = new ethers.Contract("0x7afDe1497da4AeDecFaf6CC32FB0D83572C10426", erc20_abi, airdrop_wallet);
let xac_token = new ethers.Contract("0x61b64c643fCCd6ff34Fc58C8ddff4579A89E2723", erc20_abi, airdrop_wallet);
let bbx_token = new ethers.Contract("0x29d3dfb4bd040f04bd0e01c28a4cb9de14b47e13", erc20_abi, airdrop_wallet);

let tipbots = Object.keys(JSON.parse(fs.readFileSync("snapshot.json")));

console.log(tipbots.length)

async function send_token(token_name, address) {
  let token;
  let amount;
  //the trunc and * 10000 and / 10000 stuff is to get it to round down to 4 decimal places only
  //so no decimal precision errors and simpler or whatever, and 5th decimal doesn't really matter
  if (token_name === "fthr") {
    token = fthr_token;
    amount = Math.trunc(500 / tipbots.length * 10000) / 10000;
  } else if (token_name === "sphx") {
    token = sphx_token;
    amount = Math.trunc(5000 / tipbots.length * 10000) / 10000;
  } else if (token_name === "sgb") {
    amount = Math.trunc(5000 / tipbots.length * 10000) / 10000;
    amount = ethers.utils.parseUnits(String(amount), 18);
    try {
      return (await airdrop_wallet.sendTransaction({
        to: address,
        value: amount,
        gasPrice: ethers.utils.parseUnits('90', 'gwei'),
        gasLimit: 25000
      })).hash;
    } catch (e) {
      console.log(e);
      return false;
    }
  } else if (token_name === "xac") {
    token = xac_token;
    amount = Math.trunc(500000 / tipbots.length * 10000) / 10000;
  } else if (token_name === "bbx") {
    token = bbx_token;
    amount = Math.trunc(5000000 / tipbots.length * 10000) / 10000;
  }
  console.log(amount);
  amount = ethers.utils.parseUnits(String(amount), 18);
  try {
    return (await token.transfer(address, amount)).hash;
  } catch (e) {
    console.log(e);
    return false;
  }
}

async function main() {
  console.log("Starting");
  //send
  const sends = ["fthr", "sphx", "sgb", "xac", "bbx"];
  for (let i = 0; i < tipbots.length; i++) {
    console.log(`\n${i + 1}/${tipbots.length}`, tipbots[i]);
    let already_sent = await airdrop_find(tipbots[i]);
    if (already_sent) {
      console.log("Already sent");
      continue;
    }
    for (let j = 0; j < sends.length; j++) {
      let send_result = await send_token(sends[j], tipbots[i]);
      if (!send_result) {
        console.log(sends[j], "send failed");
        return;
      }
      console.log(sends[j], send_result);
      await sleep(4000);
    }
    await airdrop_insert(tipbots[i]);
  }
  console.log("Done")
}

setTimeout(main, 5000);
