const discord = require("discord.js");

const db = require("./db.js");
const songbird = require("./songbird.js");
const chart = require("./chart.js");
const util = require("./util.js");
const keep_alive = require("./keep_alive.js");
const { fetch } = require('cross-fetch');
const fs = require('fs');

//why do we have 3 http request libraries? why, good question!
//todo: switch to one and remove the others

const client = new discord.Client({
  intents: [discord.GatewayIntentBits.Guilds]
});

const ADMINS = ["239770148305764352", "288612712680914954", "875942059503149066", "600071769721929746", "1074092955943571497"];

//23 1/2 hours
const CLAIM_FREQ = 23.5*60*60*1000;
const MAX_CLAIMS_PER_MONTH = 11111;
const HOLDING_REQUIREMENT = 2000;

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
      price = (await songbird.get_price()).base_token_price_usd.slice(0, 10);
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
  }, 7500);
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
        name: "/faucet",
        value: "Use the monthly XAC faucet, and participate in the XAC distribution!"
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
          value: "Admins can send XAC to discord users or addresses."
        },
        {
          name: "/change_register",
          value: "Admins can change a registered user's address."
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
      },
      {
        name: "Pangolin",
        value: "[Pool](https://app.pangolin.exchange/#/swap?outputCurrency=0x61b64c643fccd6ff34fc58c8ddff4579a89e2723) | [GeckoTerminal](https://www.geckoterminal.com/songbird/pools/0xdd06d19b1217423ba474783a16e4a9798b794225)"
      },
      {
        name: "OracleSwap",
        value: "[Pool](https://dex.oracleswap.io/en/swap?outputCurrency=0x61b64c643fccd6ff34fc58c8ddff4579a89e2723) | [GeckoTerminal](https://www.geckoterminal.com/songbird/pools/0xc60d3d14a13739dba0fb6013a3530b975e21b1e5)"
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
    let register = await db.register_user(interaction.user.id, address, false);
    if (!register) {
      return await interaction.editReply("You have already registered an address! Contact an admin if it needs to be changed.");
    }
    let register_embed = new discord.EmbedBuilder();
    register_embed.setTitle("Successfully Registered!");
    register_embed.setColor("#7ed11f");
    register_embed.setDescription("Thanks for registering! Now admins can send XAC to you if you win a prize, or tip you.");
    register_embed.setFooter({ text: "Made by prussia.dev" });
    return await interaction.editReply({ embeds: [register_embed] });
  } else if (command === "faucet") {
    await interaction.deferReply();
    if (interaction.channel?.id !== "1098797717775462501") {
      return await interaction.editReply("Failed, cannot use this command outside of the faucet claims channel.");
    }
    //make sure they are older than 1 hour old in server
    if (interaction.member.joinedTimestamp+(60*60*1000) > Date.now()) {
      return await interaction.editReply("You joined the server in the last hour, try again after you've been in the server for 1 hour. Check out the announcements or talk or something.");
    }
    //make sure they are registered
    let user_info = await db.get_user(user.id);
    if (!user_info) {
      return await interaction.editReply("Failed, please `/register` your address with the bot before using faucet.");
    }
    //send captcha and modal thing with id set to code and nonce
    let captcha_info = await util.get_text_captcha();
    if (!captcha_info) {
      return await interaction.editReply("Error, captcha probably currently down. Wait a bit and/or notify admins.");
    }
    //embed
    let captcha_embed = new discord.EmbedBuilder();
    captcha_embed.setTitle("One more step...");
    captcha_embed.setColor("#2c16f7");
    captcha_embed.setDescription("Please answer the captcha before you claim your XAC!")
    captcha_embed.setImage(captcha_info.challenge_url);
    captcha_embed.setFooter({ text: "Almost there!" });
    //send button that opens modal
    let captcha_button = new discord.ButtonBuilder()
      .setCustomId("capbtn-"+captcha_info.challenge_code+"-"+captcha_info.challenge_nonce+"-"+user.id+"-"+String(Date.now()))
      .setLabel("Claim Faucet")
      .setStyle('Primary');
    let action_row = new discord.ActionRowBuilder();
    action_row.addComponents(captcha_button);
    return await interaction.editReply({ embeds: [captcha_embed], components: [action_row] })
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
    } else if (command === "change_register") {
      await interaction.deferReply();
      let address = (await params.get("address")).value;
      let target = (await params.get("target")).user;
      //validate address
      let address_valid;
      try {
        address_valid = songbird.is_valid(address);
      } catch (e) {
        address_valid = false;
      }
      if (!address_valid) {
        return interaction.editReply("Failed, invalid address");
      }
      //make sure target is registered
      let user_info = await db.get_user(target.id);
      if (!user_info) {
        return await interaction.editReply("Failed, target user has not registered with bot.");
      }
      //change
      await db.register_user(target.id, address, true);
      //success
      return await interaction.editReply("Successfully changed user's address (admin only action).");
    }
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton() && !interaction.isModalSubmit()) return;

  let customId = interaction.customId;
  let user = interaction.user;
  if (customId.startsWith("capbtn-")) {
    let og_user = customId.split("-")[3];
    if (user.id !== og_user) {
      return await interaction.reply({ ephemeral: true, content: "You cannot claim for someone else! Run the `/faucet` command yourself to claim." })
    }
    let created_date = Number(customId.split("-")[4]);
    //if they take more than 2 minutes to respond
    if (created_date+(2*60*1000) < Date.now()) {
      return await interaction.reply("Failed, took too long to answer captcha. Run `/faucet` again.");
    }
    //button that should open modal
    let modal = new discord.ModalBuilder()
      .setCustomId(customId.replace("capbtn-", "capmod-"))
      .setTitle('Faucet Captcha');
    let captcha_answer_input = new discord.TextInputBuilder()
      .setCustomId("answer")
      .setStyle(discord.TextInputStyle.Short)
      .setMaxLength(10)
      .setLabel("What are the characters in the captcha?")
      .setRequired(true);
    let action_row = new discord.ActionRowBuilder();
    action_row.addComponents(captcha_answer_input);
    modal.addComponents(action_row);
    return await interaction.showModal(modal);
  } else if (customId.startsWith("capmod-")) {
    //modal
    await interaction.deferReply();
    //make sure they are registered
    let user_info = await db.get_user(user.id);
    if (!user_info) return interaction.editReply("Failed, you are not registered.");
    //edit prev message to disable button
    try {
      let captcha_button = new discord.ButtonBuilder()
        .setCustomId("capbtn-disabled")
        .setLabel("Claim Faucet")
        .setDisabled(true)
        .setStyle('Primary');
      let action_row = new discord.ActionRowBuilder();
      action_row.addComponents(captcha_button);
      await interaction.channel.fetch();
      await interaction.message.edit({ embeds: interaction.message.embeds, components: [action_row] });
    } catch (e) {
      console.log(e);
    }
    //get all needed info
    //since address is taken from registered address, that means one address per discord user
    let address = user_info.address;
    let code = customId.split("-")[1];
    let nonce = customId.split("-")[2];
    let answer = interaction.fields.getTextInputValue("answer");
    //verify captcha
    let passed_captcha = await util.verify_text_captcha(code, nonce, answer);
    if (!passed_captcha) {
      return await interaction.editReply("Error, you failed captcha. Try again.");
    }
    //make sure claim limit not already exceeded
    let claims_month = await db.get_claims_this_month();
    if (claims_month >= MAX_CLAIMS_PER_MONTH) {
      return await interaction.editReply(`We already reached this month's max claim limit (${claims_month})!`);
    }
    //make sure not blacklisted
    try {
      let blacklist = fs.readFileSync("blacklist.txt", "utf-8").split("\n").map((item) => item.trim().toLowerCase());
      if (blacklist.includes(address)) {
        return await interaction.editReply("Your address has been blacklisted. Contact the admins if you think this is a mistake. If this isn't a mistake, contact us anyways! We'd love to talk with you ;)");
      }
    } catch (e) {
      //probably blacklist.txt does not exist
      //console.log(e);
    }
    //make sure they aren't claiming too soon
    let db_result = await db.find_claim(address);
    if (db_result) {
      if (Number(db_result.last_claim)+CLAIM_FREQ > Date.now()) {
        return await interaction.editReply("Error, your last claim was too soon! Run `/next_claim` to see when your next claim will be.");
      }
    }
    //songbird enough balance
    let enough_balance = await songbird.enough_balance(address, HOLDING_REQUIREMENT);
    if (!enough_balance.success) {
      return await interaction.editReply("Error, you do not hold enough SGB or WSGB.");
    }
    let token_tx_resp = await fetch("https://songbird-explorer.flare.network/api?module=account&action=tokentx&address="+address);
    token_tx_resp = await token_tx_resp.json();
    let aged_enough = await songbird.aged_enough(address, HOLDING_REQUIREMENT, token_tx_resp, enough_balance.wrapped_sgb_bal);
    if (!aged_enough) {
      let holds_aged_nft = await songbird.holds_aged_nfts(address, token_tx_resp);
      //provide exemption if they hold aged nft
      if (!holds_aged_nft) {
        return await interaction.editReply(`Error, your SGB or WSGB needs to be held for at least 1 day (${songbird.HOLDING_BLOCK_TIME} blocks).`);
      }
    }
    //send XAC, check for send error
    let send_amount = db.get_amount();
    let tx = await songbird.faucet_send_astral(user_info.address, send_amount);
    if (!tx) {
      return await interaction.editReply("Error, send failed! Probably gas issue, too many claims at once or faucet is out of funds. Try again in a few minutes.");
    }
    //add to db
    await db.add_claim(user_info.address, send_amount);
    //reply with embed that includes tx link
    let faucet_embed = new discord.EmbedBuilder();
    let month = db.get_month();
    faucet_embed.setColor("#15d30e");
    faucet_embed.setTitle("Faucet Claim");
    faucet_embed.setURL("https://songbird-explorer.flare.network/tx/"+tx);
    faucet_embed.setImage("https://cdn.discordapp.com/attachments/975616285075439636/1098738804904431686/XAC_check.gif");
    faucet_embed.setDescription(`${send_amount} XAC has been sent to <@${user.id}> address (\`${address}\`). You should receive it shortly! Come back in 24 hours to claim again.\n[View tx](https://songbird-explorer.flare.network/tx/${tx}).`);
    faucet_embed.setTimestamp();
    if (!db_result) {
      faucet_embed.setFooter({ text: "Thanks! Note: user not found in DB." });
    } else {
      faucet_embed.setFooter({ text: "Thank you for participating in the XAC distribution!" });
    }
    return await interaction.editReply({ embeds: [faucet_embed] });
  }
});

client.login(process.env.token);
