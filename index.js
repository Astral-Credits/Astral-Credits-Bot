const discord = require("discord.js");

const db = require("./db.js");
const songbird = require("./songbird.js");
const chart = require("./chart.js");
const util = require("./util.js");
const keep_alive = require("./keep_alive.js");

const client = new discord.Client({
  intents: [discord.GatewayIntentBits.Guilds]
});

const ADMINS = ["239770148305764352", "288612712680914954", "875942059503149066", "600071769721929746", "1074092955943571497"];

let historic_data_cache;
let liqudity_cache;
let sgb_price_cache;

client.once('ready', async (info) => {
  console.log('Ready! as ' + info.user.tag);
  //set price status
  async function set_price_status() {
    let price;
    try {
      historic_data_cache = await songbird.get_historic();
      price = String(historic_data_cache.ohlcv_list.slice(-1)[0][4]).slice(0, 10);
      //also get sgb price
      sgb_price_cache = await songbird.get_coin_price("songbird");
      //liquidity
      liqudity_cache = await songbird.get_liquidity_blaze(Number(price), sgb_price_cache);
    } catch (e) {
      console.log(e);
      return;
    }
    client.user.setPresence({
      activities: [
        {
          name: 'Astral Price: $'+price,
          type: 3
        }
      ],
      status: 'online'
    });
    //change nickname
    try {
      let astral_guild = client.guilds.cache.get("1000985457393422367");
      let self_member = await astral_guild.members.fetchMe();
      await self_member.setNickname("$"+price);
    } catch (e) {
      console.log(e);
      console.log("Failed to change username!");
    }
  }
  set_price_status();
  setInterval(set_price_status, 25*60*1000);
  //start milestone check
  async function send_announcement(text) {
    client.channels.cache.get("1000985458374873150").send(text);
  }
  setTimeout(async () => {
    await db.milestone_check(send_announcement);
  }, 2500);
  setInterval(async () => {
    await db.milestone_check(send_announcement);
  }, 30*60*1000);
});

client.on('interactionCreate', async interaction => {
  let command = interaction.commandName;
  let params = interaction.options;
  let user = interaction.user;

  //

  if (command === "help") {
    let help_embed = new discord.EmbedBuilder();
    help_embed.setTitle("Help");
    help_embed.setColor("#08338e");
    help_embed.setDescription("This bot is your friendly neighbourhood bot for all things Astral Credits! Programmed by [Prussia](https://prussia.dev/sample).");
    help_embed.addFields([
      {
        name: "/help",
        value: "Get a list of commands."
      },
      {
        name: "/price",
        value: "Get XAC price info."
      },
      {
        name: "/pools",
        value: "Get information about all the pools XAC is tradable on."
      },
      {
        name: "/next_claim",
        value: "Check to see if your next faucet claim is ready."
      },
      {
        name: "/faucet_stats",
        value: "See some neat faucet metrics."
      },
      {
        name: "/register",
        value: "Register your address with the bot so admins can send you XAC more easily."
      },
    ]);
    help_embed.setFooter({ text: "Made by prussia.dev" });
    if (ADMINS.includes(user.id)) {
      let admin_embed = new discord.EmbedBuilder();
      admin_embed.setTitle("Admin Help");
      admin_embed.addFields([
        {
          name: "/send",
          value: "Admins can send XAC to discord users or addresses"
        }
      ]);
      admin_embed.setFooter({ text: "\"The ships hung in the sky in much the same way that bricks don't.\" -Douglas Adams" });
      return await interaction.reply({ embeds: [help_embed, admin_embed] });
    }
    return await interaction.reply({ embeds: [help_embed] });
  } else if (command === "price") {
    await interaction.deferReply();
    let price_info;
    try {
      price_info = await songbird.get_price();
    } catch (e) {
      return await interaction.editReply("Failed to fetch coingecko API, probably you are requesting too fast (ratelimits)!")
    }
    let price_embed = new discord.EmbedBuilder();
    price_embed.setTitle("Astral Credits Price");
    price_embed.setURL("https://www.coingecko.com/en/coins/astral-credits");
    price_embed.setColor("#ea8b17");
    price_embed.addFields([
      {
        name: "Price in USD",
        value: "$"+price_info.base_token_price_usd.slice(0, 13)
      },
      {
        name: "Price in SGB",
        //value: price_info.quote_token_price_usd
        value: String(Number(price_info.base_token_price_usd)/Number(sgb_price_cache)).slice(0, 7)
      },
      {
        name: "Estimated Market Cap",
        value: "$"+String(util.format_commas(Math.round(Number(price_info.base_token_price_usd)*1000000000)))
      },
    ]);
    price_embed.setFooter({ text: "Made by prussia.dev" });
    //create graph and add
    if (historic_data_cache) {
      let data_buffer = await chart.create_price_graph(historic_data_cache.ohlcv_list);
      let file = new discord.AttachmentBuilder(data_buffer);
      file.setName("chart.png");
      price_embed.setImage("attachment://chart.png");
      return await interaction.editReply({ embeds: [price_embed], files: [file] });
    } else {
      return await interaction.editReply({ embeds: [price_embed] });
    }
  } else if (command === "pools") {
    if (!historic_data_cache) {
      return interaction.reply("Failed, pool data currently unavaliable.");
    }
    let pools_embed = new discord.EmbedBuilder();
    pools_embed.setTitle("Pools");
    pools_embed.setColor("#3cb707");
    pools_embed.addFields([
      {
        name: "BlazeSwap",
        value: "[Pool](https://app.blazeswap.xyz/swap/?outputCurrency=0x61b64c643fccd6ff34fc58c8ddff4579a89e2723) | [GeckoTerminal](https://www.geckoterminal.com/songbird/pools/0xa49259d33f8bea503e59f3e75af9d43a119598c0)"
      },
      {
        name: "BlazeSwap Volume (last 7 days)",
        value: "$"+util.format_commas(String(Math.floor(historic_data_cache.ohlcv_list.slice(-7).map((item) => item[5]).reduce((total, num) => total+num))))+"~"
      },
      {
        name: "BlazeSwap Liquidity",
        value: "$"+util.format_commas(String(liqudity_cache))+"~"
      }
    ]);
    pools_embed.setFooter({ text: "Made by prussia.dev" });
    return await interaction.reply({ embeds: [pools_embed] });
  } else if (command === "next_claim") {
    await interaction.deferReply({ ephemeral: true });
    let address = (await params.get("address")).value.toLowerCase().trim();
    let address_valid;
    try {
      address_valid = songbird.is_valid(address);
    } catch (e) {
      address_valid = false;
    }
    if (!address_valid) {
      return await interaction.editReply(`Invalid address \`${address}\` provided`);
    }
    let next_claim_info = await db.get_next_claim_time(address);
    let claim_embed = new discord.EmbedBuilder();
    if (next_claim_info.enough_time && next_claim_info.under_claim_limit) {
      claim_embed.setTitle("Claim Ready!");
      claim_embed.setColor("#18ba7c");
      claim_embed.setDescription(`The claim for \`${address}\` is ready! Click [here](https://astralcredits.xyz/#astral-faucet) to the faucet. Remember - you will not be able to claim the faucet if you do not meet the holding (NFT or SGB) requirements.`);
    } else {
      claim_embed.setColor("#d1170a");
      claim_embed.setTitle("Claim Not Ready!");
      let fail_descrip = `The claim for \`${address}\` is not yet ready!`;
      if (!next_claim_info.enough_time) {
        fail_descrip += " Not enough time has lapsed since your last claim.";
      }
      if (!next_claim_info.under_claim_info) {
        fail_descrip += " The faucet has reached the max claims for this month (11111 claims), wait until next month to claim again.";
      }
      claim_embed.setDescription(fail_descrip);
      claim_embed.addFields([
        {
          name: "Next Claim",
          value: "<t:"+String(next_claim_info.next_claim_time)+":R>"
        }
      ]);
    }
    claim_embed.setFooter({ text: "Made by prussia.dev" });
    return interaction.editReply({ embeds: [claim_embed] });
  } else if (command === "faucet_stats") {
    await interaction.deferReply();
    let faucet_stats = await db.get_faucet_stats();
    let stats_embed = new discord.EmbedBuilder();
    stats_embed.setTitle("Faucet Stats");
    stats_embed.setColor("#d10dd8");
    stats_embed.addFields([
      {
        name: "Month #",
        value: String(faucet_stats.month+1),
        inline: true
      },
      {
        name: "Current Payout",
        value: String(faucet_stats.amount)+" XAC",
        inline: true
      },
      {
        name: "Claims This Month",
        value: String(faucet_stats.claims_this_month),
        inline: true
      },
      {
        name: "Total Claims",
        value: String(faucet_stats.total_claims),
        inline: true
      },
      {
        name: "Total Unique Claimers",
        value: String(faucet_stats.unique_claimers),
        inline: true
      }
    ]);
    stats_embed.setFooter({ text: "Made by prussia.dev" });
    return interaction.editReply({ embeds: [stats_embed] });
  } else if (command === "register") {
    await interaction.deferReply();
    let address = (await params.get("address")).value.toLowerCase().trim();
    let address_valid;
    try {
      address_valid = songbird.is_valid(address);
    } catch (e) {
      address_valid = false;
    }
    if (!address_valid) {
      return await interaction.editReply(`Invalid address \`${address}\` provided`);
    }
    await db.register_user(interaction.user.id, address);
    let register_embed = new discord.EmbedBuilder();
    register_embed.setTitle("Successfully Registered!");
    register_embed.setColor("#7ed11f");
    register_embed.setDescription("Thanks for registering! Now admins can send XAC to you if you win a prize, or tip you.");
    register_embed.setFooter({ text: "Made by prussia.dev" });
    return await interaction.editReply({ embeds: [register_embed] });
  }

  //admin command
  if (ADMINS.includes(user.id)) {
    if (command === "send") {
      await interaction.deferReply();
      //two optional args: address or discord user, can only choose one
      let amount = (await params.get("amount")).value;
      amount = String(Math.floor(amount));
      if (amount <= 0) {
        return await interaction.editReply("Failed, cannot send 0 or negative XAC.");
      }
      let address = await params.get("address");
      let target = await params.get("target");
      let tx;
      let receiver;
      if (address && target) {
        return await interaction.editReply("Failed, both address and target cannot be specified, only put in one.");
      } else if (address) {
        address = address.value;
        //check for valid address
        let address_valid;
        try {
          address_valid = songbird.is_valid(address);
        } catch (e) {
          address_valid = false;
        }
        if (!address_valid) {
          return interaction.editReply("Failed, invalid address");
        }
        tx = await songbird.send_astral(address, amount);
        if (!tx) {
          return interaction.editReply("Failed, send error. Perhaps not enough balance?");
        }
        receiver = "`"+address+"`";
      } else if (target) {
        target = target.user;
        //get address
        let user_info = await db.get_user(target.id);
        if (!user_info) {
          return await interaction.editReply("Failed, target user has not registered with bot, try address instead?");
        }
        tx = await songbird.send_astral(user_info.address, amount);
        if (!tx) {
          return interaction.editReply("Failed, send error. Perhaps not enough balance?");
        }
        receiver = "<@"+target.id+">";
      } else {
        return await interaction.editReply("Failed, neither address or target to send to was specified.");
      }
      //Successfully sent, now send embed
      let send_embed = new discord.EmbedBuilder();
      send_embed.setTitle("Successfully Sent!");
      send_embed.setColor("#0940e5");
      send_embed.setDescription(`${String(amount)} XAC sent to ${receiver}. [View tx](https://songbird-explorer.flare.network/tx/${tx}).`);
      send_embed.setFooter({ text: "Made by prussia.dev" });
      return await interaction.editReply({ embeds: [send_embed] });
    }
  }
});

client.login(process.env.token);
