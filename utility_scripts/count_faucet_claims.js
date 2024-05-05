const fs = require("fs");

async function get_all_faucet_trans() {
  //not working atm since explorer api is really slow right now
  let transactions = [];
  let page = 1;
  while (true) {
    console.log(page)
    let resp = (await (await fetch("https://songbird-explorer.flare.network/api?module=account&action=txlist&address=0xb1Db39De1d4DaEAFeAD4267E1CC5d30651b27833&offset=10000&page="+page)).json()).result;
    transactions.push(...resp);
    if (resp.length !== 10000) break;
    page++;
  }
  return transactions;
}

async function main() {
  //let transactions = await get_all_faucet_trans();
  //fs.writeFileSync("./all_faucet_claims.json", JSON.stringify(transactions, null, 2));
  const transactions = JSON.parse(fs.readFileSync("./all_faucet_claims.json"));
  console.log(transactions.length);
  let seen = [];
  let count = {};
  let i = 0;
  for (const t of transactions) {
    console.log(`${i+1}/${transactions.length}`);
    if (t.from.toLowerCase() === "0xb1db39de1d4daeafead4267e1cc5d30651b27833") {
      let r = "0x" + t.input.slice(34, -64).toLowerCase();
      if (count[r]) {
        count[r] = count[r] + 1;
      } else {
        count[r] = 1;
      }
      if (seen.includes(t.hash)) throw Error("same hash seen twice, transactions given are incomplete/duplicated, fix code");
      seen.push(t.hash);
    }
    i++;
  }
  fs.writeFileSync("./faucet_users_count.json", JSON.stringify(count, null, 2));
  console.log(count);
  //
}

main();
