const path = require("path");
const dotenv = require("dotenv");
const fs = require("fs");
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const db = require("../db.js");
const songbird = require("../songbird.js");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const all_users = await db.get_all_users();
  const total_registered = all_users.length;
  //users with over 10 sgb deposited, **and registered with the bot**
  let snapshotted = {};
  for (let i=0; i < all_users.length; i++) {
    let user_info = all_users[i];
    delete user_info._id;
    let tipbot_address = await songbird.get_tipbot_address(user_info.user);
    console.log(`${i+1}/${all_users.length} ${user_info.user} ${tipbot_address}`);
    let sgb_bal = await songbird.get_bal(tipbot_address);
    if (sgb_bal >= 10) {
      console.log("qualified", sgb_bal);
      snapshotted[tipbot_address] = user_info;
      fs.writeFileSync("snapshot.json", JSON.stringify(snapshotted));
    } else {
      console.log("not qualified", sgb_bal);
    }
    await sleep(500);
  }
  console.log(`Done: ${Object.keys(snapshotted).length}/${total_registered}`);
}

setTimeout(main, 2500);
