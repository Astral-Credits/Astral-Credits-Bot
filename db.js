const mongo = require('./mongo.js');

let db = mongo.getDb();

let claims;
let milestones;
let users;

db.then((db) => {
  console.log("Connected to db")
  claims = db.collection("claims");
  milestones = db.collection("milestones");
  users = db.collection("users");
});

const CLAIM_FREQ = 23.5*60*60*1000;
const MAX_CLAIMS_PER_MONTH = 11111;

//march 2023
const START_YEAR = 2023;
const START_MONTH = 2;

//6000 initially
const START_PAYOUT = 6000;

//return number of months since start of distribution
//starts at month 0
function get_month() {
  let date = new Date();
  let years = date.getFullYear()-START_YEAR;
  let months = date.getMonth()-START_MONTH;
  return years*12+months;
}

//get amount to payout, for current month
function get_amount() {
  let month = get_month();
  let halvings = Math.floor(month/6);
  let payout = START_PAYOUT;
  //payout halves every six months
  for (let i=0; i < halvings; i++) {
    payout = payout/2;
  }
  return payout;
}

async function milestone_check(send_announcement) {
  let current_month = get_month();
  //check if monthly claims reset
  let month_reset = await milestones.findOne({
    type: "month_reset"
  });
  if (!month_reset) {
    await milestones.insertOne({
      type: "month_reset",
      month: -1
    });
    month_reset = {
      type: "month_reset",
      month: -1
    };
  }
  if (month_reset.month !== current_month) {
    await send_announcement("It's a new month! Claims have been reset!");
    if (current_month % 6 === 0) {
      await send_announcement("Payouts have been halved! The faucet now gives out "+String(get_amount())+" XAC.");
    }
    month_reset.month = current_month;
    await milestones.replaceOne({
      type: "month_reset"
    }, month_reset);
  }
  //last 500 uses of faucet
  let last_uses = await milestones.findOne({
    type: "last_uses"
  });
  if (!last_uses) {
    await milestones.insertOne({
      type: "last_uses",
      month: -1
    });
    last_uses = {
      type: "last_uses",
      month: -1
    };
  }
  if (last_uses.month !== current_month) {
    let remaining_claims = 11111-await get_claims_this_month();
    if (remaining_claims <= 500) {
      await send_announcement("Less than 500 claims remaining this month!");
      last_uses.month = current_month;
      await milestones.replaceOne({
        type: "last_uses"
      }, last_uses);
    }
  }
}

async function get_claims_this_month() {
	let current_month = get_month();
	let claims_array = await claims.find({"month": current_month});
	claims_array = await claims_array.toArray();
	let claims_num = 0;
	for (let i=0; i < claims_array.length; i++) {
		claims_num += claims_array[i].claims_this_month;
	}
  return claims_num;
}

async function get_claims_all_time() {
	let claims_array = await claims.find({});
	claims_array = await claims_array.toArray();
	let claims_num = 0;
	for (let i=0; i < claims_array.length; i++) {
		claims_num += claims_array[i].claims;
	}
  return claims_num;
}

async function get_unique_claimers() {
  let claims_array = await claims.find({});
  claims_array = await claims_array.toArray();
  return claims_array.length;
}

async function find_claim(address) {
  return await claims.findOne({"address": address});
}

async function get_faucet_stats(address) {
  /*
    - total claims this month
    - month #
    - current payout
    - total unique addresses that ever claimed faucet
    - total claims for user (if they enter in address)
    - total claims
  */
  return {
    month: get_month(),
    amount: get_amount(),
    claims_this_month: await get_claims_this_month(),
    unique_claimers: await get_unique_claimers(),
    total_claims: await get_claims_all_time()
  };
}

async function get_next_claim_time(address) {
  let user_info = await find_claim(address);
  let claims_this_month = await get_claims_this_month();
  let next_claim_time = 0;
  let enough_time = true;
  let under_claim_limit = true;
  if (claims_this_month >= MAX_CLAIMS_PER_MONTH) {
    under_claim_limit = false;
    let current_month = get_month();
    next_claim_time = (new Date(`${START_YEAR+Math.floor(current_month/12)}-${current_month%12+START_MONTH+2}-01`)).getTime();
  }
  if (user_info) {
    if (user_info.last_claim+CLAIM_FREQ > Date.now()) {
      if (user_info.last_claim+CLAIM_FREQ > next_claim_time) {
        next_claim_time = user_info.last_claim+CLAIM_FREQ;
      }
      enough_time = false;
    }
  }
  next_claim_time = Math.ceil(next_claim_time/1000);
  return {
    enough_time,
    under_claim_limit,
    next_claim_time
  };
}

async function get_user(user_id) {
  //return address
  return await users.findOne({
    user: user_id
  });
}

//also handle changing addresses
async function register_user(user_id, address) {
  let user_info = await get_user(user_id);
  if (user_info) {
    //replace
    user_info.address = address;
    await users.replaceOne({
      user: user_id
    }, user_info);
  } else {
    //insert
    await users.insertOne({
      user: user_id,
      address: address
    });
  }
}

module.exports = {
  milestone_check: milestone_check,
  get_faucet_stats: get_faucet_stats,
  get_next_claim_time: get_next_claim_time,
  get_user: get_user,
  register_user: register_user
  //
};
