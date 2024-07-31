const fs = require("fs");
const { ethers } = require('ethers');
const { erc20_abi } = require('../abi.js');
const dotenv = require('dotenv');

dotenv.config();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const provider = new ethers.providers.JsonRpcProvider("https://songbird-api.flare.network/ext/C/rpc");

//0xB9E744aaE89260fb95272C5F65A968775644686E
let airdrop_wallet = new ethers.Wallet(process.env.airdrop_privkey);
console.log(airdrop_wallet.address);
airdrop_wallet = airdrop_wallet.connect(provider);

let xac_token = new ethers.Contract("0x61b64c643fCCd6ff34Fc58C8ddff4579A89E2723", erc20_abi, airdrop_wallet);

const total = 27_997_157.64;
let sent = 0;

async function main() {
  const j = JSON.parse(fs.readFileSync("percent.json", "utf-8"));
  let i = 0;
  for (const a of Object.keys(j)) {
    if (["0xbD9eB5756Dd03fbffe181d3a0505CD022b0fB1c9".toLowerCase(), "0xDf88c018c79335874d7F4BC60BFDe94f3a81c03b".toLowerCase()].includes(a.toLowerCase())) {
      console.log(`skipping indy or nishi ${a}`);
    } else {
      console.log(i, a, j[a]);
      //let amount = (total / 10**7 * j[a].toFixed(7).split(".")[1]).toFixed(3);
      let amount = (total * j[a]).toFixed(3);
      sent += Number(amount);
      console.log(`Sending ${amount} XAC`);
      amount = ethers.utils.parseUnits(amount, 18);
      console.log((await xac_token.transfer(a, amount)).hash);
      await sleep(4000);
    }
    i++;
  }
  console.log(`Done ${sent}`);
}

main();
