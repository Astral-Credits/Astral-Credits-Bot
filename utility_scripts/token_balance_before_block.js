//run on the /token-transfers page
const end_block = 56514728;

let balances = {};

//actually 61 pages

async function main() {
  for (let i = 0; i < 61; i++) {
    console.log(i);
    for (const e of Array.from(document.getElementsByClassName("tile-type-token-transfer"))) {
      const te = e.children[0];
      const type = te.children[0].textContent.trim(); //"Token Minting", "Token Transfer", "Token Burning"
      const block_num = Number(te.children[2].textContent.trim().split("\n")[0].split("#")[1]);
      if (block_num >= end_block) {
        console.log("skipping");
        continue;
      }
      const transfer_text = te.children[1].innerText.trim().replaceAll(" ", "").replaceAll("\n\n", "").split("\n");
      const [sender, receiver] = transfer_text[1].split("→");
      const amount_text = transfer_text[2].split("F")[0].replaceAll(",", "").split(".");
      const amount = Number(amount_text[0]);
      if (sender.includes("MasterNest") || receiver.includes("MasterNest")) {
        console.log("master nest");
        continue;
      }
      if (!balances[receiver]) balances[receiver] = 0;
      if (!balances[sender]) balances[sender] = 0;
      //remember, we are going through balances backward, so balances can be negative until the end
      //add to receiver balance
      balances[receiver] += amount;
      if (type !== "Token Minting") {
        //subtract from original balance
        balances[sender] -= amount;
      }
      if (sender === "0xd9ebcd5787197d15Fd037e2a6b0EAc8b76c4bcA6" || receiver === "0xd9ebcd5787197d15Fd037e2a6b0EAc8b76c4bcA6") {
        console.log(transfer_text[0], balances, type, amount, receiver, balances[receiver], sender, balances[sender]);
      }
    }
    //next page
    document.getElementsByClassName("pagination")[0].children[3].children[0].click();
    //wait a little for everything to load
    await (new Promise(r => setTimeout(r, 2000)));
  }
  console.log(JSON.stringify(balances));
}

main();

/*
const { readFileSync } = require("fs");
const data = JSON.parse(readFileSync("./d.json"));

let total = 0;
let p = {};

//first run, calculate total. second, calculate percentage
for (let j = 0; j < 2; j++) {
  for (let i = 0; i < Object.keys(data).length; i++) {
    const address = Object.keys(data)[i];
    //ignore any named contracts like masternest
    if (address.startsWith("0x") && address !== "0x0000000000000000000000000000000000000000") {
      //ignore the decimals
      const bal = Number(data[address]);
      if (bal < 0) continue;
      if (j === 0) {
        total += bal;
      } else {
        if (bal/total > 0) p[address] = bal / total;
      }
    }
  }
}
let p2 = {};
for (const k of Object.keys(p).sort((a, b) => p[b] - p[a])) {
  p2[k] = p[k];
}
console.log(JSON.stringify(p2, null, 2), Object.keys(p).length);
*/
