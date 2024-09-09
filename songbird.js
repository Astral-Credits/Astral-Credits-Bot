const { ethers } = require('ethers');
const { fetch } = require('cross-fetch');

const { hash, hex_to_bigint, bigint_to_hex, pad_hex } = require('./util.js');
const { erc20_abi, erc20_and_ftso_abi, erc1155_abi, domains_abi, sgb_domain_abi, multisend_abi, airdrop2_abi } = require('./abi.js');

const MAX_DECIMALS = 6; //astral credits has 18 but not the point

//this file is deceptively named! flare is also supported

const SUPPORTED_CHAINS = {
  "flare": {
    color: "#e42058",
    full_name: "Flare Network",
    rpc: "https://flare-api.flare.network/ext/C/rpc",
    chain_id: 14,
  },
  "songbird": {
    color: "#ffffff",
    full_name: "Songbird",
    rpc: "https://songbird-api.flare.network/ext/C/rpc",
    chain_id: 19,
  },
};

const SUPPORTED_INFO = {
  //flare
  "flr": {
    //no token address, ofc
    "id": "flr",
    "name": "Flare",
    "emoji": "<:FLR:1153124121048260789>",
    "chain": "flare",
    "coingecko": "flare-networks",
    "website": "https://flare.network/",
  },
  "wflr": {
    "id": "wflr",
    "name": "Wrapped Flare",
    "emoji": "<:WFLR:1267686953709600831>",
    "token_address": "0x1d80c49bbbcd1c0911346656b529df9e5c2f783d",
    "chain": "flare",
    "coingecko": "wrapped-flare",
    "website": "https://flare.network/",
  },
  "sflr": {
    "id": "sflr",
    "name": "Staked Flare",
    "emoji": "<:sFLR:1267680772869849171>",
    "token_address": "0x12e605bc104e93B45e1aD99F9e555f659051c2BB",
    "chain": "flare",
    "coingecko": "sceptre-staked-flr",
    "website": "https://www.sceptre.fi/",
  },
  "eusdt": {
    "id": "eusdt",
    "name": "Enosys USDT (Flare)",
    "emoji": "<:USDT_enosys:1267689515733094440>",
    "token_address": "0x96B41289D90444B8adD57e6F265DB5aE8651DF29",
    "chain": "flare",
    "decimal_places": 6,
    "coingecko": "tether", //temporary
    "website": "https://enosys.global/",
  },
  "usdt": {
    "id": "usdt",
    "name": "Tether USD (Flare)",
    "emoji": "<:USDT_stargate:1270199327976984597>",
    "token_address": "0x0B38e83B86d491735fEaa0a791F65c2B99535396",
    "chain": "flare",
    "decimal_places": 6,
    "coingecko": "tether", //temporary
    "website": "https://stargate.finance/",
  },
  "usdc.e": {
    "id": "usdc.e",
    "name": "Bridged USDC (Flare)",
    "emoji": "<:USDC_stargate:1270199704168169562>",
    "token_address": "0xFbDa5F676cB37624f28265A144A48B0d6e87d3b6",
    "chain": "flare",
    "decimal_places": 6,
    "coingecko": "usd-coin", //temporary
    "website": "https://stargate.finance/",
  },
  "joule": {
    "id": "joule",
    "name": "Joule",
    "emoji": "<:JOULE:1268347557747363891>",
    "token_address": "0xe6505f92583103af7ed9974dec451a7af4e3a3be",
    "chain": "flare",
    "website": "https://kinetic.market/",
  },
  "bnz": {
    "id": "bnz",
    "name": "BonezCoin",
    "emoji": "<:BNZ:1235385281230667847>",
    "token_address": "0xfD3449E8Ee31117a848D41Ee20F497a9bCb53164",
    "chain": "flare",
    "website": "https://www.blockbonez.com/bnz",
  },
  "phx": {
    "id": "phx",
    "name": "Phoenix Token",
    "emoji": "<:PHX:1241907517819191307>",
    "token_address": "0x06fb7579e28E1ca55AFA52272296a89a879d690a",
    "chain": "flare",
    "website": "https://www.thephoenixproject.xyz/",
  },
  //songbird
  "sgb": {
    //no token address, ofc
    "id": "sgb",
    "name": "Songbird",
    "emoji": "<:SGB:1130360963636408350>",
    "chain": "songbird",
    "coingecko": "songbird",
    "website": "https://flare.network/songbird/",
  },
    "wsgb": {
    "id": "wsgb",
    "name": "Wrapped Songbird",
    "emoji": "<:WSGB:1267688111035388036>",
    "token_address": "0x02f0826ef6aD107Cfc861152B32B52fD11BaB9ED",
    "chain": "songbird",
    "coingecko": "wrapped-songbird",
    "website": "https://flare.network/songbird/",
  },
  "exusdt": {
    "id": "exusdt",
    "name": "Experimental USDT (Songbird)",
    "emoji": "<:USDT_enosys:1267689515733094440>",
    "token_address": "0x1a7b46656B2b8b29B1694229e122d066020503D0",
    "chain": "songbird",
    "decimal_places": 6,
    "coingecko": "tether", //temporary
    "website": "https://enosys.global/",
  },
  "xac": {
    "id": "xac",
    "name": "Astral Credits",
    "emoji": "<:XAC:1228104930464895106>",
    "token_address": "0x61b64c643fCCd6ff34Fc58C8ddff4579A89E2723",
    "chain": "songbird",
    "coingecko": "astral-credits",
    "website": "https://www.astralcredits.xyz/",
  },
  "bbx": {
    "id": "bbx",
    "name": "BlueBirdX",
    "emoji": "<:BBX:1142960050273521765>",
    "token_address": "0x29d3dfb4bd040f04bd0e01c28a4cb9de14b47e13",
    "chain": "songbird",
    "website": "https://bluebirdx.xyz/",
  },
  "wbbx": {
    "id": "wbbx",
    "name": "Wrapped BlueBirdX",
    "emoji": "<:WBBX:1267689434749472830>",
    "token_address": "0x1005dF5400EE5f4C1378becF513833cBc4A6EF53",
    "chain": "songbird",
    "website": "https://bluebirdx.xyz/",
  },
  "sfort": {
    "id": "sfort",
    "name": "sFortuna",
    "emoji": "<:SFORT:1242253063125991503>",
    "token_address": "0x9E2E6c16803878C18E54Ed74F05AeafCCe464626",
    "chain": "songbird",
    "coingecko": "sfortuna-token",
    "website": "https://pixelchainolympics.com/",
  },
  "chirp": {
    "id": "chirp",
    "name": "CHIRP",
    "emoji": "<:CHIRP:1242246775952379964>",
    "token_address": "0x81aDd7359f2B95276F8542f2a0acD7ECD2Ae9349",
    "chain": "songbird",
    "website": "https://sgb.chat/",
  },
  "sprk": {
    "id": "sprk",
    "name": "SparkCoin",
    "emoji": "<:SPRK:1206369512396689488>",
    "token_address": "0xfd2a0fD402828fDB86F9a9D5a760242AD7526cC0",
    "chain": "songbird",
    "website": "https://nftclashgame.com/",
  },
  "nishi": {
    "id": "nishi",
    "name": "NishiCoin",
    "emoji": "<:NISHI:1172309804677599263>",
    "token_address": "0xCa80B7557aDbc98426C0B921f8d80c3A5c20729F",
    "chain": "songbird",
    "website": "https://www.astralcredits.xyz/",
  },
  "jsc": {
    "id": "jsc",
    "name": "JSCoin",
    "emoji": "<:JSC:1245869320081375333>",
    "token_address": "0x2d2b39a036c3C02D50e2353061898E04433dd8Fa",
    "chain": "songbird",
    "website": "https://discord.gg/a4X7YpxguS",
  },
  "sphx": {
    "id": "sphx",
    "name": "Songbird Phoenix",
    "emoji": "<:sPHX:1130346027497558126>",
    "token_address": "0x7afDe1497da4AeDecFaf6CC32FB0D83572C10426",
    "chain": "songbird",
    "website": "https://www.thephoenixproject.xyz/",
  },
  "fthr": {
    "id": "fthr",
    "name": "FeatherSwap",
    "emoji": "<:FTHR:1152030938793005076>",
    "token_address": "0x19eA65E3f8fc8F61743d137B5107172f849d8Eb3",
    "chain": "songbird",
    "website": "https://fthrswap.xyz/swap/",
  },
};

const full_to_abbr = (full) => Object.values(SUPPORTED_INFO).find((c) => c.name.toLowerCase() === full.toLowerCase()).id;

const SPECIAL_KNOWN = {
  "0x02f0826ef6ad107cfc861152b32b52fd11bab9ed": "WSGB Contract",
  "0x61b64c643fccd6ff34fc58c8ddff4579a89e2723": "XAC Contract",
  "0x93ca88ee506096816414078664641c07af731026": "Pixel Planet / Tiles Contract",
};

let SUPPORTED = Object.keys(SUPPORTED_INFO);

const songbird_provider = new ethers.providers.JsonRpcProvider(SUPPORTED_CHAINS.songbird.rpc);
const flare_provider = new ethers.providers.JsonRpcProvider(SUPPORTED_CHAINS.flare.rpc);

//0x37987397aC240f0cbCaA10a669bC2C90A91C0d51 - admin tipping, prizes, welcome
let wallet = new ethers.Wallet(process.env.privkey);
wallet = wallet.connect(songbird_provider);

//0xb1Db39De1d4DaEAFeAD4267E1CC5d30651b27833
let faucet_wallet = new ethers.Wallet(process.env.faucet_privkey);
faucet_wallet = faucet_wallet.connect(songbird_provider);

const token_contract_address = "0x61b64c643fCCd6ff34Fc58C8ddff4579A89E2723";
const nft_contract_address = "0x288F45e46aD434808c65880dCc2F21938b7Da23d";
const sgb_domain_contract_address = "0x7e8aB50697C7Abe63Bdab6B155C2FB8D285458cB";
const flr_domain_contract_address = "0x2919f0bE09549814ADF72fb0387D1981699fc6D4";

const sgb_multisend_contract_address = "0x6bDA41F88aDadF96F3149F75dc6ADB0351D4fa1b";
const flr_multisend_contract_address = "0x93CA88Ee506096816414078664641C07aF731026";

const sgb_airdrop_contract_address = "0xFbdc400E3878A00Aa50b80E2970521862549fddE";
const flr_airdrop_contract_address = "0x185EF07440e64EC0515C26C0304fdFC875571AC6";

let astral_token = new ethers.Contract(token_contract_address, erc20_abi, wallet);
let astral_nft = new ethers.Contract(nft_contract_address, erc1155_abi, faucet_wallet);
let wrapped_songbird_token = new ethers.Contract("0x02f0826ef6aD107Cfc861152B32B52fD11BaB9ED", erc20_and_ftso_abi, faucet_wallet); //also includes FTSO functions!
let faucet_astral_token = new ethers.Contract(token_contract_address, erc20_abi, faucet_wallet);

let sgb_domain_contract = new ethers.Contract(sgb_domain_contract_address, sgb_domain_abi, songbird_provider);
let flr_domain_contract = new ethers.Contract(flr_domain_contract_address, sgb_domain_abi, flare_provider);
let domains_contract = new ethers.Contract("0xBDACF94dDCAB51c39c2dD50BffEe60Bb8021949a", domains_abi, songbird_provider);

//faucet requirements
//how many blocks sgb/nft has to be held for. 43200 is 24 hours, since block time is 2 seconds so 43200 blocks is around 24 hours - 1800 blocks is around 1 Hour
const HOLDING_BLOCK_TIME = 43200;

const TRIFORCE_ADDRESS = "0x86fBF03CCF0FE152B2aBE2B43bA82662c59Ac1B4";

//do a sanity check to make sure the tipbot derive privkey can never exceed 32 bytes (this would be bad :tm:), as priv key would be invalid
//priv keys are 32 bytes, meaning 256**32-1 is the max
//discord snowflakes are 64 bits (8 bytes), meaning 256**8 is the max. source: https://discord.com/developers/docs/reference#snowflakes
//for it to overflow, the first 48 characters of the private key needs to be "f" (basically impossible to be generated naturally)
//this does mean that we can do this sanity check by doing
//`if (process.env.tipbot_derive_privkey.toLowerCase().startsWith("0x"+"f".repeat(48)))`
//but that's way less fun
//-prussia
if (hex_to_bigint(process.env.tipbot_derive_privkey)+BigInt(256)**BigInt(8) > BigInt(256)**BigInt(32)-BigInt(1)) {
  throw Error("Tipbot derive private key may overflow!! Generate a new one, please. This is incredibly improbable to happen.");
}

//get songbird/flare balance
async function get_bal(address, chain="songbird") {
  return Number(ethers.utils.formatEther(await get_provider(chain).getBalance(address)));
}

async function get_bal_astral(address) {
  let astral_bal = await astral_token.balanceOf(address);
  return Number(ethers.utils.formatUnits(astral_bal.toString(), 18));
}

//will need to rewrite if expand beyond sgb and flr
async function get_bal_generic_tokens(address) {
  const block_explorers = ["songbird", "flare"];
  let token_list = {};
  for (const b of block_explorers) {
    let resp = await fetch(`https://${b}-explorer.flare.network/api?module=account&action=tokenlist&address=${address}`);
    resp = await resp.json();
    if (resp.result) {
      for (let i=0; i < resp.result.length; i++) {
        //sgb does not have token_address
        let found_token = Object.values(SUPPORTED_INFO).find((c) => c.token_address?.toLowerCase() === resp.result[i].contractAddress);
        if (found_token) {
          token_list[found_token.id] = Number(ethers.utils.formatUnits(resp.result[i].balance, Number(resp.result[i].decimals)));
        }
      }
    } else {
      //shouldn't really happen I think
      console.log("could not get token balance", address);
      continue;
    }
  }
  return token_list;
}

function get_provider(chain) {
  if (chain === "songbird") {
    return songbird_provider;
  } else if (chain === "flare") {
    return flare_provider;
  }
}

//tipbot/coinflip functions (why is this async?)
function derive_wallet(user_id, chain="songbird") {
  let derived_priv_key = "0x" + hash(pad_hex(bigint_to_hex(hex_to_bigint(process.env.tipbot_derive_privkey) + BigInt(user_id))));
  let derived_wallet = new ethers.Wallet(derived_priv_key);
  let use_provider = get_provider(chain);
  derived_wallet = derived_wallet.connect(use_provider);
  return derived_wallet;
}

function get_tipbot_address(user_id) {
  let derived_wallet = derive_wallet(user_id);
  return derived_wallet.address;
}

async function user_withdraw_native(user_id, address, amount, chain="songbird") {
  amount = ethers.utils.parseEther(String(amount));
  let derived_wallet = derive_wallet(user_id, chain);
  try {
    return [true, await derived_wallet.sendTransaction({
      to: address.toLowerCase(),
      value: amount,
    })];
  } catch (e) {
    //console.log(e);
    return [false, e];
  }
}

//withdraw any supported erc20 by name
async function user_withdraw_generic_token(user_id, address, amount, currency) {
  const currency_info = SUPPORTED_INFO[currency];
  //default to 18 decimal places if nothing specified
  amount = ethers.utils.parseUnits(String(amount), isNaN(currency_info.decimal_places) ? 18 : currency_info.decimal_places);
  let derived_wallet = derive_wallet(user_id, currency_info.chain);
  let derived_generic_token = new ethers.Contract(currency_info.token_address, erc20_abi, derived_wallet);
  try {
    return [true, await derived_generic_token.transfer(address, amount)];
  } catch (e) {
    //console.log(e);
    return [false, e];
  }
}

async function user_withdraw_astral(user_id, address, amount) {
  return await user_withdraw_generic_token(user_id, address, amount, "xac");
}

//this is a mess
function calc_amount_each(amount_split, num, currency_info) {
  //default to 18 decimal places if nothing specified
  const decimal_places = isNaN(currency_info.decimal_places) ? 18 : currency_info.decimal_places;
  amount_split = ethers.utils.parseUnits(String(amount_split), decimal_places);
  let amount_each = amount_split.div(num);
  return { amount_each, amount_split, amount_each_string: ethers.utils.formatUnits(amount_each.toString(), decimal_places) };
}

async function user_multisend_native(user_id, addresses, split_amount, currency) {
  const currency_info = SUPPORTED_INFO[currency];
  let { amount_each } = calc_amount_each(split_amount, addresses.length, currency_info);
  let derived_wallet = derive_wallet(user_id, currency_info.chain);
  let derived_multisend = new ethers.Contract(currency_info.chain === "songbird" ? sgb_multisend_contract_address : flr_multisend_contract_address, multisend_abi, derived_wallet);
  try {
    return await derived_multisend.native_batch_send(addresses, amount_each, {
      //since .div will round down, amount_each * addresses.length it not necessarily equal to amount_split
      value: amount_each.mul(addresses.length), //value: amount_split,
    });
  } catch (e) {
    return false;
  }
}

async function user_multisend_token(user_id, addresses, amount_split_, currency) {
  const currency_info = SUPPORTED_INFO[currency];
  const multisend_contract_address = currency_info.chain === "songbird" ? sgb_multisend_contract_address : flr_multisend_contract_address;
  let { amount_each, amount_split } = calc_amount_each(amount_split_, addresses.length, currency_info);
  let derived_wallet = derive_wallet(user_id, currency_info.chain);
  let derived_generic_token = new ethers.Contract(currency_info.token_address, erc20_abi, derived_wallet);
  //approval
  try {
    let receipt = await (await derived_generic_token.approve(multisend_contract_address, amount_split)).wait();
    //wait for approval to go through, ofc
    if (receipt?.status === 1) {
      let derived_multisend = new ethers.Contract(multisend_contract_address, multisend_abi, derived_wallet);
      return await derived_multisend.token_batch_send(currency_info.token_address, addresses, amount_each);
    } else {
      return false;
    }
  } catch (e) {
    console.log(e)
    return false;
  }
}

async function user_multisend(user_id, addresses, amount_split, currency) {
  if (currency === "flr" || currency === "sgb") {
    return await user_multisend_native(user_id, addresses, amount_split, currency);
  } else {
    return await user_multisend_token(user_id, addresses, amount_split, currency);
  }
}

//check if they hold enough wrapped songbird or songbird to use the faucet
async function enough_balance(address, holding_requirement) {
  let wrapped_bal = await wrapped_songbird_token.balanceOf(address);
  wrapped_bal = Number(ethers.utils.formatUnits(wrapped_bal.toString(), 18));
  let reg_bal = await get_bal(address);
  return {
    success: (wrapped_bal + reg_bal) >= holding_requirement,
    wrapped_sgb_bal: wrapped_bal,
    sgb_bal: reg_bal
  };
}

async function get_block_number() {
  return await songbird_provider.getBlockNumber();
}

async function aged_enough(address, holding_requirement, wrapped_songbird_resp, wrapped_sgb_bal) {
  let holding_enough = false;
  //get current block
  let current_block = await get_block_number();
  let songbird_resp = await fetch("https://songbird-explorer.flare.network/api?module=account&action=eth_get_balance&address="+address+"&block="+String(current_block-HOLDING_BLOCK_TIME));
  songbird_resp = await songbird_resp.json();
  if (!songbird_resp.error) {
    let songbird_snapshot = Number(ethers.utils.formatEther(songbird_resp.result));
    if (songbird_snapshot >= holding_requirement) {
      holding_enough = true;
    }
  }
  if (wrapped_songbird_resp.result) {
    wrapped_songbird_resp = wrapped_songbird_resp.result;
    //timestamp attribute can also be used but whatever
    //get token transfers within the hour and see if the (balance)-(total received)=(balance 24 hours ago) is above the holding req or not
    wrapped_songbird_resp = wrapped_songbird_resp.filter(function(item) {
      return item.tokenName === "Wrapped Songbird" && item.blockNumber >= current_block-HOLDING_BLOCK_TIME;
    });
    let wrapped_songbird_snapshot = 0;
    for (let i=0; i < wrapped_songbird_resp.length; i++) {
      if (wrapped_songbird_resp[i].to.toLowerCase() === address.toLowerCase()) {
        wrapped_songbird_snapshot += Number(ethers.utils.formatUnits(wrapped_songbird_resp[i].value, 18));
      } else {
        wrapped_songbird_snapshot -= Number(ethers.utils.formatUnits(wrapped_songbird_resp[i].value, 18));
      }
    }
    //if user sent out more than they received, it should not be added to their wrapped sgb bal obviously
    wrapped_songbird_snapshot = wrapped_songbird_snapshot > 0 ? wrapped_songbird_snapshot : 0;
    if ((wrapped_sgb_bal-wrapped_songbird_snapshot) >= holding_requirement) {
      holding_enough = true;
    }
  }
  if (holding_enough) {
    return true;
  } else {
    return false;
  }
}

async function get_held_nfts(address) {
  return await astral_nft.balanceOfBatch([address, address, address, address, address], [1, 2, 3, 4, 5]);
}

const nft_values = {
  "1": 1000,
  "2": 100,
  "3": 350,
  "4": 700,
  "5": 3000,
};

//checks if user has the right nfts, and has held them for at least 
async function holds_aged_nfts(address, nft_resp) {
  //genesis token id: 1 (1000 sgb)
  //galactic token id: 2 (100 sgb)
  //hyperdrive token id: 3 (350 sgb)
  //cosmic token id: 4 (700 sgb)
  //hologram token id: 5 (3000 sgb)
  let nft_balances = await astral_nft.balanceOfBatch([address, address, address, address, address], [1, 2, 3, 4, 5]);
  if (nft_resp.result) {
    nft_resp = nft_resp.result;
    let current_block = await get_block_number();
    //timestamp attribute can also be used but whatever
    //get token transfers within the hour and see if the (balance)-(total received)=(balance 24 hours ago) is above the holding req or not
    nft_resp = nft_resp.filter(function(item) {
      return item.contractAddress.toLowerCase() === nft_contract_address.toLowerCase() && Object.keys(nft_values).includes(String(item.tokenID)) && item.blockNumber >= current_block-HOLDING_BLOCK_TIME;
    });
    //net received genesis and hologram nfts during the period
    //tokenids: genesis, galactic, hyperdrive, cosmic, hologram
    //why not do `nft_snapshots = nft_balances`? good question I felt like deconstructing
    let nft_snapshots = [0, 0, 0, 0, 0];
    for (let i=0; i < nft_resp.length; i++) {
      let token_id = Number(nft_resp[i].tokenID);
      if (nft_resp[i].to.toLowerCase() === address.toLowerCase()) {
        nft_snapshots[token_id-1] += 1;
      } else {
        nft_snapshots[token_id-1] -= 1;
      }
    }
    nft_snapshots = nft_balances.map((num, index) => {
      //if the user sold/sent more nfts than they bought, it should not be added to their total
      let index_snapshot = nft_snapshots[index] > 0 ? nft_snapshots[index] : 0;
      return num - index_snapshot;
    });
    let total_nft_value = 0;
    for (let j=0; j < nft_snapshots.length; j++) {
      let held = nft_snapshots[j];
      //prevent adding negative amounts if user sends nfts out
      if (held > 0) {
        total_nft_value += nft_values[String(j+1)] * held;
      }
    }
    if (total_nft_value >= 2000) {
      return true;
    } else {
      return false;
    }
  }
}

//send stuff, but also price queries and whatnot

async function send_astral(address, amount) {
  amount = ethers.utils.parseUnits(String(amount), 18);
  try {
    return (await astral_token.transfer(address, amount)).hash;
  } catch (e) {
    console.log(e);
    return false;
  }
}

async function faucet_send_astral(address, amount) {
  amount = ethers.utils.parseUnits(String(amount), 18);
  try {
    return (await faucet_astral_token.transfer(address, amount, {
      gasPrice: ethers.utils.parseUnits('90', 'gwei'),
      gasLimit: 75000
    })).hash;
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

async function get_all_prices() {
  let cs = [];
  Object.keys(SUPPORTED_INFO).forEach((c) => SUPPORTED_INFO[c].coingecko ? cs.push(SUPPORTED_INFO[c].coingecko) : false);
  let resp = await fetch(`https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&ids=${cs.join(",")}`);
  resp = await resp.json();
  //process
  let prices = {};
  for (const coingecko of Object.keys(resp)) {
    //support multiple coins/tokens have the same coingecko ticker
    for (const scc of Object.values(SUPPORTED_INFO).filter((s) => s.coingecko === coingecko)) {
      prices[scc.id] = resp[coingecko];
    }
  }
  return prices;
}

async function get_historic() {
  //historic price data
  let resp = await fetch("https://api.geckoterminal.com/api/v2/networks/songbird/pools/0xa49259d33f8bea503e59f3e75af9d43a119598c0/ohlcv/day");
  resp = await resp.json();
  return resp.data.attributes;
}

async function check_domain_owned(domain) {
  let ownership_info = await domains_contract.domains(domain);
  if (ownership_info.holder === "0x0000000000000000000000000000000000000000") {
    return false;
  } else {
    return true;
  }
}

async function find_associated(address) {
  const resp = await (await fetch(`https://songbird-explorer.flare.network/api?module=account&action=txlist&address=${address}`)).json();
  let associates = {};
  for (let i=0; i < resp.result.length; i++) {
    let tx = resp.result[i];
    if (tx.to === address) {
      if (associates[tx.from]) {
        associates[tx.from] += 1;
      } else {
        associates[tx.from] = 1;
      }
    } else {
      if (associates[tx.to]) {
        associates[tx.to] += 1;
      } else {
        associates[tx.to] = 1;
      }
    }
  }
  if (associates[""]) {
    delete associates[""];
  }
  return associates;
}

async function find_shared_txs(address1, address2) {
  const resp = await (await fetch(`https://songbird-explorer.flare.network/api?module=account&action=txlist&address=${address1}`)).json();
  let txs = [];
  for (let i=0; i < resp.result.length; i++) {
    let tx = resp.result[i];
    if (tx.to === address2 || tx.from === address2) {
      txs.push(tx.hash);
    }
  }
  return txs;
}

async function lookup_domain_owner(domain) {
  let [name, tld, _] = domain.split(".");
  if (_) return false;
  if (tld === "sgb") {
    return await sgb_domain_contract.getDomainHolder(name, ".sgb");
  } else if (tld === "flr") {
    return await flr_domain_contract.getDomainHolder(name, ".flr");
  } else {
    return false;
  }
}

async function ftso_delegates_of(address) {
  return await wrapped_songbird_token.delegatesOf(address);
}

function get_airdrop_contract(user_id, chain) {
  let derived_wallet = derive_wallet(user_id, chain);
  return new ethers.Contract(chain === "songbird" ? sgb_airdrop_contract_address : flr_airdrop_contract_address, airdrop2_abi, derived_wallet);
}

async function start_airdrop(user_id, currency, amount_each, max, end_timestamp) {
  const currency_info = SUPPORTED_INFO[currency];
  const airdrop_contract = get_airdrop_contract(user_id, currency_info.chain);
  const decimal_places = isNaN(currency_info.decimal_places) ? 18 : currency_info.decimal_places;
  const amount_each_raw = ethers.utils.parseUnits(String(amount_each), decimal_places);
  const amount = (BigInt(amount_each_raw) * BigInt(max)).toString();
  if (currency === "sgb" || currency === "flr") {
    return await (await airdrop_contract.native_start(end_timestamp, amount_each_raw, max, {
      value: amount,
    })).wait();
  } else {
    //token
    let derived_wallet = derive_wallet(user_id, currency_info.chain);
    let derived_generic_token = new ethers.Contract(currency_info.token_address, erc20_abi, derived_wallet);
    //approval
    try {
      let receipt = await (await derived_generic_token.approve(currency_info.chain === "songbird" ? sgb_airdrop_contract_address : flr_airdrop_contract_address, amount)).wait();
      //wait for approval to go through, ofc
      if (receipt?.status === 1) {
        return await (await airdrop_contract.token_start(end_timestamp, amount_each_raw, max, currency_info.token_address)).wait();
      } else {
        return false;
      }
    } catch (e) {
      console.log(e)
      return false;
    }
  }
}

async function claim_airdrop(user_id, currency, airdrop_id) {
  const currency_info = SUPPORTED_INFO[currency];
  const airdrop_contract = get_airdrop_contract(user_id, currency_info.chain);
  //gen signed message
  //todo: prefix not needed
  const message_hash = ethers.utils.solidityKeccak256(["bytes"], [ethers.utils.solidityPack(["address", "string", "uint256"], [derive_wallet(user_id).address, " is approved for ", airdrop_id])]);
  const signature = await wallet.signMessage(ethers.utils.arrayify(message_hash));
  const {v, r, s} = ethers.utils.splitSignature(signature);
  try {
    return await airdrop_contract.claim(airdrop_id, v, r, s);
  } catch (e) {
    //console.log(e);
    return false;
  }
}

async function refund_airdrop(user_id, chain, airdrop_id) {
  const airdrop_contract = get_airdrop_contract(user_id, chain);
  try {
    return await airdrop_contract.refund(airdrop_id);
  } catch (e) {
    //console.log(e);
    return false;
  }
}

async function get_airdrop(user_id, chain, airdrop_id) {
  const airdrop_contract = get_airdrop_contract(user_id, chain);
  return await airdrop_contract.airdrops(airdrop_id);
}

async function get_airdrop_participants(user_id, chain, airdrop_id) {
  const airdrop_contract = get_airdrop_contract(user_id, chain);
  return await airdrop_contract.get_participants(airdrop_id);
}

function get_airdrop_id(chain, logs) {
  const filtered_logs = logs.filter((log) => log.address === (chain === "songbird" ? sgb_airdrop_contract_address : flr_airdrop_contract_address));
  const airdrop_log_data = filtered_logs[filtered_logs.length - 1].data;
  const airdrop_id = Number(airdrop_log_data);
  return airdrop_id;
}

/*
const rand_wallet = ethers.Wallet.createRandom();
console.log(rand_wallet.privateKey);
*/

module.exports = {
  SUPPORTED_CHAINS,
  SUPPORTED_INFO,
  SUPPORTED,
  SPECIAL_KNOWN,
  HOLDING_BLOCK_TIME,
  TRIFORCE_ADDRESS,
  MAX_DECIMALS,
  nft_values,
  full_to_abbr,
  get_liquidity_blaze,
  enough_balance,
  get_bal,
  get_bal_astral,
  get_bal_generic_tokens,
  aged_enough,
  get_held_nfts,
  holds_aged_nfts,
  send_astral,
  faucet_send_astral,
  get_price,
  get_coin_price,
  get_all_prices,
  get_historic,
  get_tipbot_address,
  user_withdraw_native,
  user_withdraw_astral,
  user_withdraw_generic_token,
  user_multisend,
  check_domain_owned,
  find_associated,
  find_shared_txs,
  lookup_domain_owner,
  get_block_number,
  ftso_delegates_of,
  calc_amount_each,
  start_airdrop,
  claim_airdrop,
  refund_airdrop,
  get_airdrop,
  get_airdrop_id,
  get_airdrop_participants,
  is_valid: ethers.utils.isAddress,
  to_raw: ethers.utils.parseUnits,
  from_raw: ethers.utils.formatUnits,
  faucet_address: faucet_wallet.address,
  admin_address: wallet.address,
};
