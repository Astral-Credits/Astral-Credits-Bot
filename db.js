const mongo = require('./mongo.js');
const { exec } = require('child_process');

let db = mongo.getDb();

let claims;
let milestones;
let users;
let linked_websites;
let domains;
let coinflip_pvp;

let ready = false;

db.then((db) => {
  ready = true;
  console.log("Connected to db")
  claims = db.collection("claims");
  milestones = db.collection("milestones");
  users = db.collection("users");
  linked_websites = db.collection("linked_websites");
  domains = db.collection("domains");
  coinflip_pvp = db.collection("coinflip_pvp");
});

setTimeout(function() {
  if (!ready) {
    exec("kill 1");
  }
}, 5000);

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
  let years = date.getUTCFullYear()-START_YEAR;
  let months = date.getUTCMonth()-START_MONTH;
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

async function get_claims_last_day() {
  let claims_array = await claims.find({
    last_claim: {
      "$gt": Date.now()-24*60*60*1000
    }
  });
	claims_array = await claims_array.toArray();
  return claims_array.length;
}

async function get_unique_claimers() {
  let claims_array = await claims.find({});
  claims_array = await claims_array.toArray();
  return claims_array.length;
}

async function find_claim(address) {
  address = address.trim().toLowerCase();
  return await claims.findOne({"address": address});
}

async function get_faucet_stats(_address) {
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
    total_claims: await get_claims_all_time(),
    claims_last_day: await get_claims_last_day()
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

async function get_user_by_address(address) {
  //return address
  return await users.findOne({
    address: address
  });
}

async function get_user(user_id) {
  //return address
  return await users.findOne({
    user: user_id
  });
}

//also handle changing addresses
async function register_user(user_id, address, change=false) {
  address = address.trim().toLowerCase();
  let address_used = await get_user_by_address(address);
  if (address_used) {
    return false;
  }
  let user_info = await get_user(user_id);
  if (user_info) {
    //replace
    if (change) {
      //insert
      user_info.address = address;
      await users.replaceOne({
        user: user_id
      }, user_info);
    } else {
      return false;
    }
  } else {
    await users.insertOne({
      user: user_id,
      address: address
    });
  }
  return true;
}

//insert or replace
async function add_claim(address, amount) {
  address = address.trim().toLowerCase();
  let claim_exists = await find_claim(address);
  if (claim_exists) {
		let current_month = get_month();
		if (claim_exists.month !== current_month) {
			claim_exists.claims_this_month = 0;
		}
		claim_exists.claims_this_month += 1;
    claim_exists.claims += 1;
    claim_exists.amount = amount;
    claim_exists.month = current_month;
		claim_exists.last_claim = Date.now();
    await claims.replaceOne({ address: address }, claim_exists);
  } else {
    await claims.insertOne({
      address: address,
      amount: amount,
			last_claim: Date.now(),
      month: get_month(),
			claims_this_month: 1,
      claims: 1
    });
  }
}

//linked websites stuff

async function get_linked_website(address) {
  return await linked_websites.findOne({
    address
  });
}

async function add_linked_website(address, url) {
  let current_linked = await get_linked_website(address);
  if (!current_linked) {
    await linked_websites.insertOne({
      address,
      url
    });
  } else {
    await linked_websites.replaceOne({
      address
    }, {
      address,
      url
    });
  }
}

async function remove_linked_website(address) {
  await linked_websites.deleteOne({
    address
  });
}

async function check_domain_by_domain(domain) {
  return domains.findOne({
    domain,
  });
}

async function check_domain_by_user(user) {
  return domains.findOne({
    user,
  });
}

async function add_domain(user, domain, address, replace=false) {
  if (replace) {
    await domains.replaceOne({
      user,
    }, {
      user,
      domain,
      address,
    });
  } else {
    await domains.insertOne({
      user,
      domain,
      address,
    });
  }
}

async function get_all_domains() {
  return (await domains.find({}, { projection: { _id: 0 } })).toArray();
}

async function add_coinflip_pvp(interaction_id, player1_id, wager, server_nonce, pick) {
  await coinflip_pvp.insertOne({
    bet_id: interaction_id,
    pick, //player 1's pick of 'heads' or 'tails'
    player1: {
      player_id: player1_id,
    },
    wager,
    server_nonce,
  });
}

async function get_coinflip_pvp(bet_id) {
  return await coinflip_pvp.findOne({
    bet_id,
  });
}

async function add_coinflip_pvp_random(bet_id, player_id, player_random) {
  let coinflip_info = await get_coinflip_pvp(bet_id);
  if (coinflip_info.player1.player_id === player_id) {
    coinflip_info.player1.random = player_random;
  } else {
    if (coinflip_info.player2) return false;
    //Create player2
    coinflip_info.player2 = {
      player_id: player_id,
      random: player_random
    };
  }
  await coinflip_pvp.replaceOne({
    bet_id,
  }, coinflip_info);
  return true;
}

async function add_coinflip_pvh() {
  //
}

async function add_coinflip_pvh_random() {
  //
}

async function get_coinflip_pvh() {
  //
}

module.exports = {
  get_month,
  get_amount,
  milestone_check,
  get_faucet_stats,
  get_claims_this_month,
  get_next_claim_time,
  get_user_by_address,
  get_user,
  register_user,
  find_claim,
  add_claim,
  get_linked_website,
  add_linked_website,
  remove_linked_website,
  check_domain_by_domain,
  check_domain_by_user,
  add_domain,
  get_all_domains,
  add_coinflip_pvp,
  add_coinflip_pvp_random,
  get_coinflip_pvp,
  add_coinflip_pvh,
  add_coinflip_pvh_random,
  get_coinflip_pvh,
};
