const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const db = require("../db.js");
const songbird = require("../songbird.js");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const all_users = await db.get_all_users();
  const total_registered = all_users.length;
  let activated_addresses = 0;
  let total_transactions = 0;
  let total_send = 0;
  let total_receive = 0;
  for (let i=0; i < all_users.length; i++) {
    console.log(`${i+1}/${all_users.length}`);
    let user = all_users[i];
    let tipbot_address = await songbird.get_tipbot_address(user.user);
    let transactions = (await (await fetch(`https://songbird-explorer.flare.network/api?module=account&action=txlist&address=${tipbot_address}`)).json()).result;
    if (transactions.length > 0) {
      console.log(user.user, tipbot_address, transactions.length);
      activated_addresses++;
      total_transactions += transactions.length;
      for (let j=0; j < transactions.length; j++) {
        let transaction = transactions[j];
        if (transaction.from.toLowerCase() === tipbot_address.toLowerCase()) {
          total_send++;
        } else {
          total_receive++;
        }
      }
    }
    await sleep(500);
  }
  console.log(`Total Tipbot Users: ${activated_addresses} (out of ${total_registered} registered bot users)`);
  console.log(`Total transactions made to and from tipbot addresses: ${total_transactions}`);
  console.log(`Total transactions made from tipbot addresses (send): ${total_send}`);
  console.log(`Total transactions made to tipbot addresses (receive): ${total_receive}`);
}

async function count_all() {
  //count all users, including dormant addresses
  const all_users = await db.get_all_users();
  let total_count = 0;
  for (let i=0; i < all_users.length; i++) {
    console.log(`${i+1}/${all_users.length}`);
    let user = all_users[i];
    let tipbot_address = await songbird.get_tipbot_address(user.user);
    let tokentx = (await (await fetch(`https://songbird-explorer.flare.network/api?module=account&action=tokentx&address=${tipbot_address}`)).json()).result;
    if (tokentx.length > 0) {
      console.log("yup", total_count);
      total_count++;
    }
    await sleep(250);
  }
  console.log(total_count);
}

setTimeout(main, 2500);
