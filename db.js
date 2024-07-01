const mongo = require('./mongo.js');
const { exec } = require('child_process');

let db_wait = mongo.getDb();

let claims, month_end, milestones, users, linked_websites, domains, coinflip_pvp, coinflip_pvh, airdrop_one, tip_stats, user_settings, month_claim_count;

let ready = false;

const MIN_ACHIEVEMENT_TIP = 50;

db_wait.then(([db, tipbot_db]) => {
  ready = true;
  console.log("Connected to db")
  claims = db.collection("claims");
  month_end = db.collection("month_end");
  milestones = db.collection("milestones");
  users = db.collection("users");
  linked_websites = db.collection("linked_websites");
  domains = db.collection("domains");
  coinflip_pvp = db.collection("coinflip_pvp");
  coinflip_pvh = db.collection("coinflip_pvh");
  airdrop_one = db.collection("airdrop_one");
  tip_stats = tipbot_db.collection("tip_stats");
  user_settings = tipbot_db.collection("user_settings");
  month_claim_count = db.collection("month_claim_count");
});

const INITIAL_ACHIEVEMENT_DATA = {
  faucet: {
    total: 0,
    current_streak: 0,
    longest_streak: 0
  },
  messages: 0,
  tips: {
    xac_amount: 0 //amount of xac tips made, not total amount
  },
  coinflip: {
    wins: 0
  },
  gatcha_won_xac_amount: 0,
};

setTimeout(async function() {
  //one off migrations
  //users.updateMany({}, { $set: { achievements: [], achievement_data: INITIAL_ACHIEVEMENT_DATA } });
  /*const all = JSON.parse(require("fs").readFileSync("./utility_scripts/faucet_users_count.json"));
  for (const u of await get_all_users()) {
    console.log(all[u.address.toLowerCase()] ?? 0);
    users.updateOne({ user: u.user }, { $set: { "achievement_data.faucet.total": all[u.address.toLowerCase()] ?? 0 } });
  }*/
  /*for (const u of await get_all_users()) {
    if (u.achievement_data.faucet.total === null) {
      console.log("fix");
      users.updateOne({ user: u.user }, { $set: { "achievement_data.gatcha_won_xac_amount": 0,"achievement_data.faucet.total": 0 } });
    } else {
      users.updateOne({ user: u.user }, { $set: { "achievement_data.gatcha_won_xac_amount": 0 } });
    }
  }*/

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

function get_amount_for_month(month_num) {
  let halvings = Math.floor(month_num/6);
  let payout = START_PAYOUT;
  //payout halves every six months
  for (let i=0; i < halvings; i++) {
    payout = payout/2;
  }
  return payout;
}

//get amount to payout, for current month
function get_amount() {
  return get_amount_for_month(get_month());
}

async function get_claims_this_month() {
  let claims_array = await claims.find({"month": get_month()});
	claims_array = await claims_array.toArray();
	let claims_num = 0;
	for (let i=0; i < claims_array.length; i++) {
		claims_num += claims_array[i].claims_this_month;
	}
  return claims_num;
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
    let remaining_claims = MAX_CLAIMS_PER_MONTH - await get_claims_this_month();
    if (remaining_claims <= 500) {
      await send_announcement("Less than 500 claims remaining this month!");
      last_uses.month = current_month;
      await milestones.replaceOne({
        type: "last_uses"
      }, last_uses);
    }
  }
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

async function get_faucet_stats() {
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
    claims_last_day: await get_claims_last_day(),
  };
}

function get_month_start_timestamp(month_num) {
  let next_year = START_YEAR+Math.floor((month_num+START_MONTH)/12);
  let next_calendar_month = (month_num+START_MONTH+1)%12 || 12; //if 0, that means it is 12th month, not 0th
  return (new Date(`${next_year}-${next_calendar_month}-01`)).getTime();
}

function get_next_month_timestamp() {
  return get_month_start_timestamp(get_month() + 1);
}

function get_next_halving_timestamp() {
  let current_date = new Date();
  let months_till_halving = 6-(get_month()%6);
  return (new Date(Date.UTC(current_date.getUTCFullYear(), current_date.getUTCMonth()+months_till_halving))).getTime();
}

//won't work for current month, or before month 15 (before month 15 should all be 11111 anyways, iirc)
async function get_month_claim_count(month) {
  let result = (await month_claim_count.findOne({
    month,
  }));
  return result.count;
}

async function set_month_claim_count(count) {
  let month = get_month();
  await month_claim_count.insertOne({ month }, {
    month,
    count,
  }, { upsert: true });
}

async function get_month_end() {
  let result = (await month_end.findOne({
    month: get_month() - 1,
  }));
  return result ? result.end : get_month_start_timestamp(get_month());
}

async function set_month_end() {
  await month_end.insertOne({
    month: get_month(),
    end: Date.now(),
  });
}

async function get_next_claim_time(address) {
  let user_info = await find_claim(address);
  let claims_this_month = await get_claims_this_month();
  let next_claim_time = 0;
  let enough_time = true;
  let under_claim_limit = true;
  if (claims_this_month >= MAX_CLAIMS_PER_MONTH) {
    under_claim_limit = false;
    next_claim_time = get_next_month_timestamp();
  }
  if (user_info) {
    if (user_info.last_claim+CLAIM_FREQ > Date.now()) {
      if (user_info.last_claim+CLAIM_FREQ > next_claim_time) {
        next_claim_time = user_info.last_claim+CLAIM_FREQ;
      }
      enough_time = false;
      //when new month starts claim cooldown resets no matter what
      if (Number(user_info.last_claim) < get_month_start_timestamp(get_month())) {
        enough_time = true;
      }
    }
  }
  next_claim_time = Math.ceil(next_claim_time/1000);
  return {
    enough_time,
    under_claim_limit,
    next_claim_time
  };
}

async function calculate_burned() {
  let burned = 0;
  //first burn was month 15 so start from there
  let c_month = get_month(); //current month
  for (let m = 15; m < c_month; m++) {
    let claims = await get_month_claim_count(m);
    if (claims !== MAX_CLAIMS_PER_MONTH) {
      burned += (MAX_CLAIMS_PER_MONTH - claims) * get_amount_for_month(m);
    }
  }
  return burned;
}

async function get_all_users() {
  return await (await users.find()).toArray();
}

async function count_users() {
  return await users.countDocuments({});
}

async function get_user_by_address(address) {
  //return address
  return await users.findOne({
    address,
  });
}

async function get_user(user_id) {
  //return address
  return await users.findOne({
    user: user_id,
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
        user: user_id,
      }, user_info);
    } else {
      return false;
    }
  } else {
    await users.insertOne({
      user: user_id,
      address: address,
      achievements: [],
      //data needed for achievements
      achievement_data: INITIAL_ACHIEVEMENT_DATA,
    });
  }
  return true;
}

const ACHIEVEMENTS = {
  //activity achievements
  "activity-1": {
    id: "activity-1",
    name: "Comet",
    description: "Chat activity level 1",
    prize: 100,
    role: false, //or role id
  },
  "activity-2": {
    id: "activity-2",
    name: "Dwarf Planet",
    description: "Chat activity level 2",
    prize: 500,
    role: false,
  },
  "activity-3": {
    id: "activity-3",
    name: "Planet",
    description: "Chat activity level 3",
    prize: 1000,
    role: false,
  },
  "activity-4": {
    id: "activity-4",
    name: "Star",
    description: "Chat activity level 4",
    prize: 3000,
    role: false,
  },
  "activity-5": {
    id: "activity-5",
    name: "Nebula",
    description: "Chat activity level 5",
    prize: 5000,
    role: false,
  },
  "activity-6": {
    id: "activity-6",
    name: "Supernova",
    description: "Chat activity level 6",
    prize: 10000,
    role: false,
  },
  //faucet achievements
  "faucet-2": {
    id: "faucet-2",
    name: "The Journey Begins",
    description: "Have a 2 day faucet streak!",
    prize: 500,
    role: false,
  },
  "faucet-10": {
    id: "faucet-10",
    name: "Jump Into Hyperspace",
    description: "Have a 10 day faucet streak!",
    prize: 2000,
    role: false,
  },
  "faucet-30": {
    id: "faucet-30",
    name: "Beam Me Up, Scotty",
    description: "Have a 30 day faucet streak!",
    prize: 6000,
    role: false,
  },
  "faucet-50": {
    id: "faucet-50",
    name: "The Restaurant at the End of the Universe",
    description: "Have a 50 day faucet streak!",
    prize: 10000,
    role: "1211426757828157440", //Faucet 50
  },
  "faucet-100": {
    id: "faucet-100",
    name: "Alpha Centauri",
    description: "Have a 100 day faucet streak!",
    prize: 15000,
    role: "1211425830991958037", //Faucet 100
  },
  "faucet-365": {
    id: "faucet-100",
    name: "Kwisatz Haderach",
    description: "Have a 365 day faucet streak! Wow!",
    prize: 25000,
    role: "1211426853055758396", //Faucet 365
  },
  "claims-250": {
    id: "claims-250",
    name: "Planet Express",
    description: "Claim from the faucet 250 times! Don't get frozen for 1000 years, cause the faucet only lasts for 15.5.",
    prize: 5000,
    role: false,
  },
  "claims-500": {
    id: "claims-500",
    name: "Speaker for the Dead",
    description: "Claim from the faucet 500 times! Thank you.",
    prize: 10000,
    role: false,
  },
  //tipping achievements
  "tipper-1": {
    id: "tipper-1",
    name: "First tip!",
    description: `First tip over ${MIN_ACHIEVEMENT_TIP} XAC. So you learned how to use the tipbot?`,
    prize: 100,
    role: false,
  },
  "tipper-2": {
    id: "tipper-2",
    name: "Tip Novice",
    description: "Make 10 XAC tips!",
    prize: 500,
    role: false,
  },
  "tipper-3": {
    id: "tipper-3",
    name: "Tip Pro",
    description: "Make 25 XAC tips!",
    prize: 1000,
    role: false,
  },
  "tipper-4": {
    id: "tipper-4",
    name: "Tip Master",
    description: "Make 100 XAC tips. So, why are you building a clock?",
    prize: 3000,
    role: "1211403167158501448", //Tip Master
  },
  "tipper-5": {
    id: "tipper-5",
    name: "Tip Grandmaster",
    description: "Make 200 XAC tips. Hey! The replicator is for printing food, not money!",
    prize: 5000,
    role: "1211404005633294396", //Tip Grandmaster
  },
  "tipper-6": {
    id: "tipper-6",
    name: "Galactic Philanthropist",
    description: "Make 300 XAC tips. I hear Magrathea is coming out of hibernation just for you...",
    prize: 10000,
    role: "1211404404356423730", //Galactic Philanthropist
  },
  //coinflip achievements
  "coinflip-1": {
    id: "coinflip-1",
    name: "First coinflip win!",
    description: "First win in coinflip!",
    prize: 100,
    role: false,
  },
  "coinflip-2": {
    id: "coinflip-2",
    name: "Space Vegas",
    description: "10 coinflip wins! Where is Space Frank Sinatra?",
    prize: 1000,
    role: false,
  },
  "coinflip-3": {
    id: "coinflip-3",
    name: "Coinflip Duelist",
    description: "Have 50 coinflip wins.",
    prize: 10000,
    role: false,
  },
  //nft achievements
  "nft-1": {
    id: "nft-1",
    name: "NFT Citizen",
    description: "Own any Astral Credits NFT. Welcome!",
    prize: 1000,
    role: false,
  },
  "nft-2": {
    id: "nft-2",
    name: "NFT Magnate",
    description: "Own 10k SGB worth of Astral Credits NFTs. You really like them, huh?",
    prize: 5000,
    role: "1211411402187743272", //NFT Magnate
  },
  "nft-all": {
    id: "nft-all",
    name: "Diamond Supporter",
    description: "Have one of each NFT badge! Gotta collect them all!",
    prize: 10000,
    role: "1211411950760632430", //Diamond Supporter
  },
  //captcha gatcha related
  "gatcha-jackpot": {
    id: "gatcha-jackpot",
    name: "Lucky Pull",
    description: "Win 7500 XAC or more from one captcha gatcha payout",
    prize: 2500,
    role: false,
  },
  "gatcha-1": {
    id: "gatcha-1",
    name: "W0rd5 4 C45h",
    description: "Win 1000 XAC total through captcha gatcha",
    prize: 500,
    role: false,
  },
  "gatcha-2": {
    id: "gatcha-2",
    name: "Nishi's Gatcha",
    description: "Win 10000 XAC total through captcha gatcha",
    prize: 1000,
    role: false,
  },
  "gatcha-3": {
    id: "gatcha-3",
    name: "Gotta Keep Pulling",
    description: "Win 50000 XAC total through captcha gatcha",
    prize: 5000,
    role: false,
  },
  //tipbot related, non-tipbot
  "coin-collector": {
    id: "coin-collector",
    name: "Numismatist",
    description: "Hold 10 or more supported currencies in your tipbot wallet",
    prize: 500,
    role: false,
  },
  //
  //one offs (pixel planet user, discord booster, triforce delegator, xac millionaire)
  "pixel-planet": {
    id: "pixel-planet",
    name: "Pixel Planet Painter",
    description: "Paint a pixel in [Pixel Planet](https://www.astralcredits.xyz/pixels)! Updates every three hours.",
    prize: 500,
    role: false,
  },
  "booster": {
    id: "booster",
    name: "Team Rocket",
    description: "Support by boosting the Discord server. Thank you!",
    prize: 10000,
    role: false,
  },
  "millionaire": {
    id: "millionaire",
    name: "XAC Millionaire",
    description: "Hold 1 million XAC!",
    prize: 0,
    role: "1222007670199029800",
  },
  "triforce-delegator": {
    id: "triforce-delegator",
    name: "Triforce Delegator",
    description: "Delegate at least 50% of your WSGB to the Triforce FTSO.", //currently doesn't require a minimum wsgb amount
    prize: 1500,
    role: "1222008917739962522",
  },
  //
}

//returns false is user already has achievement
async function add_achievement_db(user_id, achievement_id, cached_user) {
  //save on db calls
  if (cached_user.achievements?.includes(achievement_id)) {
    return false;
  }
  await users.updateOne({
    user: user_id,
    achievements: {
      $not: {
        $in: [
          achievement_id,
        ],
      },
    },
  }, {
    $push: {
      achievements: achievement_id,
    }
  });
  return true;
}

//faucet achievement info
async function add_claim_achievement_info(user_id, cached_user, last_claim) {
  let override = false; //true if first of the month and person claimed last day of last month
  let override_days; //downtime days to add to streak
  //if first day of month
  if ((new Date()).getUTCDate() === 1) {
    let month_end_timestamp = await get_month_end();
    //if last claim was made on last claiming day of the last month
    if (last_claim > month_end_timestamp - CLAIM_FREQ - 30 * 60 * 1000) {
      override = true;
      override_days = Math.floor((Date.now() - last_claim) / (24 * 60 * 60 * 1000));
      if (override_days === 0) {
        override_days = 1;
      }
    }
  }
  //if their last claim was less than 2 days ago, streak continues
  //claim freq is 23.5 hours, give them an extra 30 minutes to claim; so up to 24 hours after they are eligible to claim, they can claim again without losing streak
  let update = {
    $inc: {
      "achievement_data.faucet.total": 1,
    },
  };
  if ((last_claim + CLAIM_FREQ * 2 + 30 * 60 * 1000 >= Date.now()) || override) {
    update["$inc"]["achievement_data.faucet.current_streak"] = override_days ?? 1;
    if (cached_user.achievement_data.faucet.longest_streak < cached_user.achievement_data.faucet.current_streak + (override_days ?? 1)) {
      //new longest streak
      update["$inc"]["achievement_data.faucet.longest_streak"] = override_days ?? 1;
    }
    await users.updateOne({
      user: user_id,
    }, update);
  } else {
    update["$set"] = {
      "achievement_data.faucet.current_streak": 1,
    };
    await users.updateOne({
      user: user_id,
    }, update);
  }
}

async function increment_message_achievement_info(user_id) {
  await users.updateOne({
    user: user_id,
  }, {
    $inc: {
      "achievement_data.messages": 1,
    }
  });
}

async function increment_xac_tips_achievement_info(user_id) {
  await users.updateOne({
    user: user_id,
  }, {
    $inc: {
      "achievement_data.tips.xac_amount": 1,
    }
  });
}

async function increment_coinflip_wins_achievement_info(user_id) {
  await users.updateOne({
    user: user_id,
  }, {
    $inc: {
      "achievement_data.coinflip.wins": 1,
    }
  });
}

async function increase_gatcha_achievement_info(user_id, amount) {
  await users.updateOne({
    user: user_id,
  }, {
    $inc: {
      "achievement_data.gatcha_won_xac_amount": amount,
    }
  });
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
    return await coinflip_pvp.updateOne(
      {
        bet_id,
        "player1.random": {
          $exists: false,
        },
      },
      {
        $set: {
          "player1.random": player_random,
        },
      }
    );
  } else {
    if (coinflip_info.player2) return false;
    //Create player2
    return await coinflip_pvp.updateOne(
      {
        bet_id,
        player2: {
          $exists: false,
        },
      },
      {
        $set: {
          player2: {
            player_id: player_id,
            random: player_random,
          },
        },
      }
    );
  }
}

async function mark_coinflip_pvp_finished(bet_id) {
  return await coinflip_pvp.updateOne(
    {
      bet_id,
      finished: {
        $exists: false,
      },
    },
    {
      $set: {
        finished: true,
      },
    }
  );
}

async function add_coinflip_pvh(interaction_id, player_id, wager, server_nonce, pick) {
  await coinflip_pvh.insertOne({
    bet_id: interaction_id,
    pick, //player's pick of 'heads' or 'tails'
    player_id,
    wager,
    server_nonce,
  });
}

async function get_coinflip_pvh(bet_id) {
  return await coinflip_pvh.findOne({
    bet_id,
  });
}

//could be one db call but whatever
async function add_coinflip_pvh_random(bet_id, player_random) {
  return await coinflip_pvh.updateOne(
    {
      bet_id,
      player_random: {
        $exists: false,
      },
    },
    {
      $set: {
        player_random,
      },
    }
  );
}

async function airdrop_find(address) {
  return airdrop_one.findOne({
    address,
  });
}

async function airdrop_insert(address) {
  return airdrop_one.insertOne({
    address,
  });
}

async function get_all_linked_websites() {
  try {
    return await (await linked_websites.find({})).toArray();
  } catch(e) {
    console.log(e)
    //database not connected yet
    return {};
  }
}

async function get_top_achievementeers() {
  //limit?
  return await users.aggregate([
    {
      $project: {
        _id: 0,
        user: 1,
        length: {
          $size: "$achievements",
        }
      }
    },
    {
      $sort: {
        length: -1,
      }
    }
  ]);
}

async function get_top_claimers() {
  //limit?
  return await users.aggregate([
    {
      $project: {
        _id: 0,
        user: 1,
        "achievement_data.faucet.total": 1,
      }
    },
    {
      $sort: {
        "achievement_data.faucet.total": -1,
      }
    }
  ]);
}

/*tip stats schema
{
  user: string (discord user id),
  usd_value: number, //usd value tipped (in 1/10s of a cent)
  //add up all the type_count to get total tips
  type_count: {
    tip: number,
    active_tip: number,
    role_tip: number,
    active_rain: number,
    role_rain: number,
  },
  currency_count: {
    //tipped count of token, example:
    sgb: number, //# of sgb tipped (hopefully no decimal precision problems, since we limit to 6 decimals atm)
  },
  //need this in case the arbitrary number of welcome tip is changed
  received_welcome_tip: bool, //if this is false, type_count added up == 3 (or some other arbitrary number), and user is not registered in XAC server, give them a welcome tip and message
}
*/

const INITIAL_TIP_STATS_DATA = {
  usd_value: 0,
  type_count: {
    tip: 0,
    active_tip: 0,
    role_tip: 0,
    active_rain: 0,
    role_rain: 0,
  },
  currency_count: {},
  received_welcome_tip: false,
};

async function get_tip_stats(user) {
  return await tip_stats.findOne({ user }) ?? { user, ...INITIAL_TIP_STATS_DATA };
}

//usd_value in tenths of a cent
async function update_tip_stats(user, type, currency, amount, usd_value) {
  //"If the field does not exist, $inc creates the field and sets the field to the specified value." -https://www.mongodb.com/docs/manual/reference/operator/update/inc/
  let update = {};
  //for upsert, not very elegant, sorry
  //received_welcome_tip will be undefined on creation, and that is ok
  update.$set = {
    user,
  };
  update.$inc = {
    usd_value,
    "type_count.tip": 0,
    "type_count.active_tip": 0,
    "type_count.role_tip": 0,
    "type_count.active_rain": 0,
    "type_count.role_rain": 0,
  };
  //actual changes
  update.$inc[`type_count.${type}`] = 1;
  update.$inc[`currency_count.${currency}`] = amount;
  return await tip_stats.updateOne({ user }, update, { upsert: true });
}

async function received_welcome_tip(user) {
  return await tip_stats.updateOne({ user }, {
    $set: {
      received_welcome_tip: true,
    },
  });
}

const DEFAULT_USER_SETTINGS = {
  tip_notify_dm: false, //attempt to notify user in dms if they are tipped
  tip_notify_dm_min: 0, //min value in usd (in tenths of a cent)
  //
};

//user_settings
async function get_user_settings(user) {
  return await user_settings.findOne({ user }) ?? { user, ...DEFAULT_USER_SETTINGS };
}

async function bulk_get_user_settings(users) {
  let found = await (await user_settings.find({
    user: {
      $in: users,
    }
  })).toArray();
  let found_users = found.map((s) => s.user);
  for (const user of users) {
    if (!found_users.includes(user)) {
      found.push({ user, ...DEFAULT_USER_SETTINGS });
    }
  }
  let found_obj = {};
  for (const s of found) {
    found_obj[s.user] = s;
  }
  return found_obj;
}

async function change_user_settings(user, settings, field_name, new_value) {
  if (!settings) {
    settings = DEFAULT_USER_SETTINGS;
  }
  settings[field_name] = new_value;
  return await user_settings.updateOne({ user }, { $set: { ...settings } }, { upsert: true });
}

module.exports = {
  ACHIEVEMENTS,
  CLAIM_FREQ,
  MIN_ACHIEVEMENT_TIP,
  get_month,
  get_amount,
  milestone_check,
  get_faucet_stats,
  get_claims_this_month,
  get_month_start_timestamp,
  get_next_halving_timestamp,
  set_month_claim_count,
  get_next_month_timestamp,
  get_next_claim_time,
  calculate_burned,
  get_all_users,
  count_users,
  get_user_by_address,
  get_user,
  register_user,
  add_achievement_db,
  add_claim_achievement_info,
  increment_message_achievement_info,
  increment_xac_tips_achievement_info,
  increment_coinflip_wins_achievement_info,
  increase_gatcha_achievement_info,
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
  mark_coinflip_pvp_finished,
  add_coinflip_pvh,
  add_coinflip_pvh_random,
  get_coinflip_pvh,
  airdrop_find,
  airdrop_insert,
  get_all_linked_websites,
  set_month_end,
  get_top_achievementeers,
  get_top_claimers,
  get_tip_stats,
  update_tip_stats,
  received_welcome_tip,
  get_user_settings,
  bulk_get_user_settings,
  change_user_settings,
};
