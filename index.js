const dotenv = require('dotenv');
dotenv.config();

const QRCode = require('qrcode');

const discord = require("discord.js");

const db = require("./db.js");
const songbird = require("./songbird.js");
const util = require("./util.js");
const _keep_alive = require("./keep_alive.js");
const { fetch } = require('cross-fetch');
const fs = require('fs');

const client = new discord.Client({
  intents: [discord.GatewayIntentBits.Guilds, discord.GatewayIntentBits.GuildMembers]
});

const ADMINS = ["239770148305764352", "288612712680914954", "875942059503149066", "600071769721929746", "1074092955943571497"];

const DOMAIN_END = 1694029371; //september 7th, 2023 00:00 UTC

const MIN_SGB = 0.25;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

//23 1/2 hours
const CLAIM_FREQ = 23.5*60*60*1000;
const MAX_CLAIMS_PER_MONTH = 11111;
const HOLDING_REQUIREMENT = 2000;
const MAX_DECIMALS = 4; //astral credits has 18 but not the point

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
      {
        name: "/add_website",
        value: "Link a website to your address, which will show up in any pixels you place in the XAC pixel billboard."
      },
      {
        name: "/pixels",
        value: "Get the link to the Pixel Planet dApp"
      },
      {
        name: "/deposit",
        value: "Deposit to your custodial tipbot/game address"
      },
      {
        name: "/balance",
        value: "See the balance of your custodial tipbot/game address"
      },
      {
        name: "/withdraw",
        value: "Withdraw your tipbot/game balance to an address or .sgb domain"
      },
      {
        name: "/tip",
        value: "Tip other users XAC from your tipbot/game balance"
      },
      {
        name: "/coinflip_pvp",
        value: "Player vs player coinflip betting game"
      },
      {
        name: "/coinflip_pvh",
        value: "Player vs house coinflip betting game"
      },
      {
        name: "/provably_fair_pvp",
        value: "Player vs player coinflip betting game explanation"
      },
      {
        name: "/provably_fair_pvh",
        value: "Player vs house coinflip betting game explanation"
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
        },
        {
          name: "/view_addresses",
          value: "View addresses of an user"
        },
        {
          name: "/remove_linked_website",
          value: "Admins can remove a registered user's linked website, if they linked."
        },
        {
          name: "/list_role",
          value: "Utility function to get all the users of a role"
        },
        {
          name: "/crawl",
          value: "See connections between addresses"
        },
        {
          name: "/crawl_shared_txs",
          value: "See txs between addresses"
        },
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
    //if (historic_data_cache) {
      //let data_buffer = await chart.create_price_graph(historic_data_cache.ohlcv_list);
      //let file = new discord.AttachmentBuilder(data_buffer);
      //file.setName("chart.png");
      //price_embed.setImage("attachment://chart.png");
      //return await interaction.editReply({ embeds: [price_embed], files: [file] });
    //} else {
      //return await interaction.editReply({ embeds: [price_embed] });
    //}
    return await interaction.editReply({ embeds: [price_embed] });
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
      /*{
        name: "BlazeSwap Volume (last 7 days)",
        value: "$"+util.format_commas(String(Math.floor(historic_data_cache.ohlcv_list.slice(-7).map((item) => item[5]).reduce((total, num) => total+num))))+"~"
      },*/
      {
        name: "BlazeSwap Liquidity",
        value: "$"+util.format_commas(String(liqudity_cache))+"~"
      },
      {
        name: "FeatherSwap",
        value: "[Pool](https://featherswap.xyz/swap/?outputCurrency=0x61b64c643fccd6ff34fc58c8ddff4579a89e2723) | [GeckoTerminal](https://www.geckoterminal.com/songbird/pools/0x9cbc1cc3b29d8a61b1843df50b6e90261a692705)"
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
    let address = await params.get("address");
    let address_valid;
    let user_info = await db.get_user(user.id);
    if (!user_info && !address) return interaction.editReply("Failed, you are not registered, and have not provided any address.");
    if (address) {
      address = address.value.toLowerCase().trim();
    } else {
      address = user_info.address;
    }
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
      claim_embed.setDescription(`The claim for \`${address}\` is ready! Remember - you will not be able to claim the faucet if you do not meet the holding (NFT or SGB) requirements.`);
    } else {
      claim_embed.setColor("#d1170a");
      claim_embed.setTitle("Claim Not Ready!");
      let fail_descrip = `The claim for \`${address}\` is not yet ready!`;
      if (!next_claim_info.enough_time) {
        fail_descrip += " Not enough time has lapsed since your last claim.";
      }
      if (!next_claim_info.under_claim_limit) {
        fail_descrip += " The faucet is now CLOSED as we have reached the max no. of claims for the month! (11,111 claims). Please return in the new month to claim again!";
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
    await interaction.deferReply({ ephemeral: true });
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
        name: "Claims Last 24h",
        value: String(faucet_stats.claims_last_day),
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
    let register = await db.register_user(user.id, address, false);
    if (!register) {
      return await interaction.editReply("You have already registered an address! Contact an admin if it needs to be changed. Or this address has already been registered.");
    }
    let register_embed = new discord.EmbedBuilder();
    register_embed.setTitle("Successfully Registered!");
    register_embed.setColor("#7ed11f");
    register_embed.setDescription("Thanks for registering! You can now receive $XAC tips, prizes and giveaways.\n**PLEASE NOTE**: As a security measure, a team member must verify you before you can begin using the faucet. Thank you for your patience.");
    register_embed.setFooter({ text: "Made by prussia.dev" });
    return await interaction.editReply({ embeds: [register_embed] });
  } else if (command === "faucet") {
    await interaction.deferReply();
    /*if (interaction.channel?.id !== "1098797717775462501") {
      return await interaction.editReply("Failed, cannot use this command outside of the faucet claims channel.");
    }*/
    if (interaction.member.joinedTimestamp+(60*60*1000) > Date.now()) {
      return await interaction.editReply("You joined the server in the last hour, try again after you've been in the server for 1 hour. Check out the announcements or talk or something.");
    }
    //make sure they are registered
    let user_info = await db.get_user(user.id);
    if (!user_info) {
      return await interaction.editReply("Failed, please `/register` your address with the bot before using faucet.");
    }
    //make sure not too many claims this month
    let claims_month = await db.get_claims_this_month();
    if (claims_month >= MAX_CLAIMS_PER_MONTH) {
      return await interaction.editReply(`<@${user.id}> We already reached this month's max claim limit (${claims_month})!`);
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
    const attachment = new discord.AttachmentBuilder(captcha_info.challenge_url, { name: "captcha.png" });
    captcha_embed.setImage(`attachment://captcha.png`);
    captcha_embed.setFooter({ text: "Almost there!" });
    //send button that opens modal
    let captcha_button = new discord.ButtonBuilder()
      .setCustomId("capbtn-"+captcha_info.challenge_code+"-"+captcha_info.challenge_nonce+"-"+user.id+"-"+String(Date.now()))
      .setLabel("Solve Captcha")
      .setStyle('Primary');
    let action_row = new discord.ActionRowBuilder();
    action_row.addComponents(captcha_button);
    return await interaction.editReply({ embeds: [captcha_embed], components: [action_row], files: [attachment] });
  } else if (command === "add_website") {
    await interaction.deferReply();
    await interaction.member.fetch();
    //does not have citizen role
    if (!interaction.member.roles.cache.has("1071917333372739584")) {
      return await interaction.editReply("Error, you must be citizen to set a linked URL.");
    }
    let website_url = (await params.get("website_url")).value.trim();
    if (!website_url.startsWith("https://")) {
      return await interaction.editReply("Error, url must start with `https://`");
    } else if (website_url.includes("<") || website_url.includes(">")) {
      return await interaction.editReply("Error, url cannot contain `<` or `>`");
    }
    //make sure user exists
    let user_info = await db.get_user(user.id);
    if (!user_info) {
      return await interaction.editReply("Failed, please `/register` your address with the bot first.");
    }
    //add to db
    await db.add_linked_website(user_info.address, website_url);
    //embed
    let website_embed = new discord.EmbedBuilder();
    website_embed.setColor("#2dc4b5");
    website_embed.setTitle("Website Linked!");
    website_embed.setDescription("Website linked to your address. Now the website will show up on any pixels you place in the [Pixel Planet dApp](https://astralcredits.xyz/pixels).\nA reminder that linked websites are not allowed to contain illicit, offensive, NSFW, or virus content.");
    return interaction.editReply({embeds: [website_embed]});
  } else if (command === "pixels") {
    return interaction.reply({ content: "https://astralcredits.xyz/pixels", ephemeral: true });
  } else if (command === "deposit") {
    await interaction.deferReply({ ephemeral: true });
    let user_address = await songbird.get_tipbot_address(user.id);
    //todo: add qr code
    let deposit_embed = new discord.EmbedBuilder();
    deposit_embed.setColor("#1dd3f7");
    deposit_embed.setTitle("Deposit");
    deposit_embed.setDescription(
      `Deposit Address:\n\`${user_address}\`\n\nThis is your deposit address for the Astral Credits Tipbot. Please only deposit SGB or XAC. Also please ensure you have enough SGB to pay for gas fees when you wish to withdraw, tip or play games.\n\n**DISCLAIMER:** The Astral Credits tipbot wallet is experimental software and a custodial service. Remember - **Not your keys, not your coins!** It's creators shall not be held liable for any lost or stolen funds as a result of your use of this service. Please proceed at your own risk.\n[Terms of Service](https://www.astralcredits.xyz/docs/Terms-of-Service-Tipbot.pdf)`
    );
    let data_buffer = await QRCode.toBuffer(user_address);
    const attachment = new discord.AttachmentBuilder(data_buffer, { name: "deposit_qr_code.png" });
    deposit_embed.setImage(`attachment://deposit_qr_code.png`);
    let user_info = await db.get_user(user.id);
    if (!user_info) {
      return interaction.editReply({ embeds: [deposit_embed], content: user_address+"\nUnrelated, but looks like you are not registered with the bot! You should `/register` in order to use the faucet." });
    } else {
      return interaction.editReply({ embeds: [deposit_embed], content: user_address, files: [attachment] });
    }
  } else if (command === "balance") {
    await interaction.deferReply({ ephemeral: true });
    let user_address = await songbird.get_tipbot_address(user.id);
    let sgb_bal = await songbird.get_bal(user_address);
    let astral_bal = await songbird.get_bal_astral(user_address);
    let bal_embed = new discord.EmbedBuilder();
    bal_embed.setColor("#7ad831");
    bal_embed.setTitle("View Balance");
    bal_embed.setDescription("This is your current balance for the Astral Credits Tipbot. As this is a custodial service, we recommend you do not keep large amounts of funds here.");
    bal_embed.addFields([
      {
        name: "Songbird",
        value: String(sgb_bal)+" <:SGB:1130360963636408350>",
      },
      {
        name: "Astral Credits",
        value: String(astral_bal)+" <:astral_creds:1000992673341120592>",
      },
    ]);
    bal_embed.setURL("https://songbird-explorer.flare.network/address/"+user_address);
    if (astral_bal > 500000 || sgb_bal > 2000) {
      let warning_embed = new discord.EmbedBuilder();
      warning_embed.setColor("#ff0000");
      warning_embed.setTitle("⚠️ WARNING - High balance detected!");
      warning_embed.setDescription("Your balance exceeds 500k XAC and/or 2000 SGB. It is strongly recommend that you withdraw funds to your self custody wallet immediately!")
      return interaction.editReply({ embeds: [bal_embed, warning_embed] });
    } else {
      return interaction.editReply({ embeds: [bal_embed] });
    }
  } else if (command === "withdraw") {
    await interaction.deferReply({ ephemeral: true });
    //withdraw address
    let withdraw_address = (await params.get("address")).value.toLowerCase().trim();
    let address_valid;
    if (withdraw_address.endsWith(".sgb")) {
      address_valid = true;
      withdraw_address = await songbird.lookup_domain_owner(withdraw_address);
      if (!withdraw_address || withdraw_address === "0x0000000000000000000000000000000000000000") {
        return await interaction.editReply(`Could not find owner of that .sgb domain. Does it exist? Check the spelling.`);
      }
    }
    try {
      address_valid = songbird.is_valid(withdraw_address);
    } catch (e) {
      address_valid = false;
    }
    if (!address_valid) {
      return await interaction.editReply(`Invalid address \`${withdraw_address}\` provided`);
    }
    //check options to see user withdraw amount
    let withdraw_amount = Number((await params.get("amount")).value.toFixed(MAX_DECIMALS));
    if (withdraw_amount <= 0) {
      return await interaction.editReply("Amount cannot be equal to or less than 0");
    }
    //check options to see if user withdrawing sgb or xac
    let withdraw_currency = (await params.get("currency")).value.toLowerCase().trim();
    if (withdraw_currency !== "sgb" && withdraw_currency !== "xac") {
      return await interaction.editReply("Currency must be either `SGB` or `XAC`");
    }
    let send;
    try {
      if (withdraw_currency === "sgb") {
        send = await songbird.user_withdraw_songbird(user.id, withdraw_address, withdraw_amount);
      } else if (withdraw_currency === "xac") {
        send = await songbird.user_withdraw_astral(user.id, withdraw_address, withdraw_amount);
      }
    } catch (e) {
      //shouldn't happen
      console.log(e);
      return await interaction.editReply("Uh oh! This shouldn't happen - encountered an unexpected error.");
    }
    if (!send) {
      return await interaction.editReply("Send failed - common reasons why are because you are withdrawing more than your balance, or don't have enough SGB to pay for gas. Please contact an admin if otherwise.");
    }
    //send tx embed
    let withdraw_embed = new discord.EmbedBuilder();
    withdraw_embed.setURL("https://songbird-explorer.flare.network/tx/"+send.hash);
    withdraw_embed.setTitle("Withdraw Requested");
    withdraw_embed.setDescription("Your withdraw tx has been submitted to the network! If you have any issues, please contact an admin immediately.");
    withdraw_embed.addFields([
      {
        name: "Transaction",
        value: "[Click here](https://songbird-explorer.flare.network/tx/"+send.hash+")",
      },
      {
        name: "Withdrawal Amount",
        value: `${String(withdraw_amount)} ${withdraw_currency.toLowerCase() === "sgb" ? "<:SGB:1130360963636408350>" : "<:astral_creds:1000992673341120592>"}`,
      },
    ]);
    await interaction.editReply({ embeds: [withdraw_embed] });
    //send followup once confirmed
    try {
      let receipt = await send.wait();
      if (!receipt || receipt?.status === 0) {
        return interaction.followUp({
          ephemeral: true,
          content: "Transaction seems to have failed? Check the block explorer.",
        });
      } else {
        return interaction.followUp({
          ephemeral: true,
          content: "Transaction has been confirmed!",
        });
      }
    } catch (e) {
      console.log(e);
      return interaction.followUp({
        ephemeral: true,
        content: "Transaction seems to have failed? Check the block explorer.",
      });
    }
  } else if (command === "tip") {
    await interaction.deferReply();
    let target = (await params.get("target")).user;
    if (target.id === user.id) {
      return await interaction.editReply("Failed, cannot tip yourself.");
    }
    let amount = Number((await params.get("amount")).value.toFixed(MAX_DECIMALS));
    if (amount <= 0) {
      return await interaction.editReply("Failed, cannot send 0 or negative XAC.");
    }
    let target_address = await songbird.get_tipbot_address(target.id);
    //send
    let send;
    try {
      send = await songbird.user_withdraw_astral(user.id, target_address, amount);
    } catch (e) {
      //shouldn't happen
      console.log(e);
      return await interaction.editReply("Uh oh! This shouldn't happen - encountered an unexpected error.");
    }
    if (!send) {
      return await interaction.editReply("Tip failed - common reasons why are because you are withdrawing more than your balance, or don't have enough SGB to pay for gas. Contact an admin if this seems wrong.");
    }
    await interaction.editReply("Sending tip...\nTx: <https://songbird-explorer.flare.network/tx/"+send.hash+">")
    try {
      let receipt = await send.wait();
      if (!receipt || receipt?.status === 0) {
        return await interaction.editReply("Transaction seems to have failed? Check the block explorer.\nTx: <https://songbird-explorer.flare.network/tx/"+send.hash+">")
      } else {
        return await interaction.editReply(`<@${user.id}> sent <:astral_creds:1000992673341120592> ${String(amount)} XAC to <@${target.id}>!\n\`txID:${send.hash}\``)
      }
    } catch (e) {
      console.log(e);
      return await interaction.editReply("Transaction seems to have failed? Check the block explorer.\nTx: <https://songbird-explorer.flare.network/tx/"+send.hash+">")
    }
  } else if (command === "domain") {
    await interaction.deferReply({ ephemeral: true });
    let domain = (await params.get("domain")).value.toLowerCase().trim();
    if (Date.now() > DOMAIN_END*1000) {
      return await interaction.editReply("The offer for the free Songbird Domain has ended, keep your eyes peeled for more exciting opportunities!");
    }
    if (!interaction.member.roles.cache.has("1071917333372739584")) {
      return await interaction.editReply("Error, you must be citizen to participate");
    }
    if (domain.endsWith(".sgb")) {
      return await interaction.editReply("Do not include the `.sgb`, it will be automatically added.");
    }
    if (domain.length < 5) {
      return await interaction.editReply("Domain needs to be more than 5 characters long");
    } else if (!util.valid_domain_name(domain)) {
      return await interaction.editReply("Domain has illegal characters");
    }
    let user_info = await db.get_user(user.id);
    if (!user_info) {
      return await interaction.editReply("Please do `/register` first!");
    }
    let already_registered_bot = await db.check_domain_by_domain(domain);
    let already_registered = await songbird.check_domain_owned(domain);
    if (already_registered_bot || already_registered) {
      return await interaction.editReply("That domain already exists - please try `/domain` again, selecting a different domain name.");
    }
    let already_domained = await db.check_domain_by_user(user.id);
    if (already_domained) {
      return await interaction.editReply("Sorry, you can't change your choice of domain, or get a second free domain.");
    }
    await db.add_domain(user.id, domain, user_info.address, already_domained);
    let domain_embed = new discord.EmbedBuilder();
    domain_embed.setTitle("Domain registered!");
    domain_embed.setColor("#2d38d8");
    domain_embed.setImage("https://cdn.discordapp.com/attachments/975616285075439636/1143434220417589310/ZQKKt6mI_400x400.jpg");
    domain_embed.setFooter({ text: "Thanks to our partners at Songbird Domains!" });
    domain_embed.setDescription("Your FREE domain has been submitted! Keep a look out for your .sgb NFT after this round of giveaways has been completed! The round will end <t:"+String(DOMAIN_END)+":R>\n- You can mint additional domains at [Songbird.Domains](https://songbird.domains/)\n- You can used your domain to join [sgb.chat](https://sgb.chat/)\n- Songbird's first Web3 social media platform!");
    await interaction.editReply({ embeds: [domain_embed] });
    let announce_embed = new discord.EmbedBuilder();
    announce_embed.setColor("#2d38d8");
    announce_embed.setThumbnail("https://cdn.discordapp.com/attachments/975616285075439636/1143434220417589310/ZQKKt6mI_400x400.jpg");
    announce_embed.setDescription(`<@${user.id}> just registered their free Songbird Domain! Citizens can get one free (over 5 characters) by running \`/domain\`.\n\nMake sure to check out [Songbird Domains](https://songbird.domains) and [SGB Chat](https://sgb.chat/)!`);
    announce_embed.setFooter({ text: "Thanks to our partners at Songbird Domains!" });
    return interaction.channel.send({ embeds: [ announce_embed ] });
  } else if (command === "coinflip_pvp") {
    //unregistered
    await interaction.deferReply();
    let wager = (await params.get("wager")).value;
    wager = Math.floor(wager);
    if (wager < 1) {
      return await interaction.editReply("Failed, cannot wager less than 1, 0, or negative XAC.");
    } else if (wager > 10000) {
      return await interaction.editReply("For now, wagers cannot be over ten thousand XAC.");
    }
    let pick = (await params.get("pick")).value.toLowerCase().trim();
    if (pick !== "heads" && pick !== "tails") {
      return await interaction.editReply("Must choose 'Heads' or 'Tails'.");
    }
    //check tipbot sgb and xac balance
    let player1_address = await songbird.get_tipbot_address(user.id);
    let player1_sgb_bal = await songbird.get_bal(player1_address);
    if (player1_sgb_bal < MIN_SGB) {
      return await interaction.editReply(`Please deposit more SGB **into your tipbot wallet** to cover any gas fees (${MIN_SGB} SGB minimum).`);
    }
    let player1_astral_bal = await songbird.get_bal_astral(player1_address);
    if (player1_astral_bal < wager) {
      return await interaction.editReply("You do not have enough XAC **in your tipbot wallet** to cover the wager.");
    }
    const server_nonce = util.gen_server_nonce();
    const hashed_server_nonce = util.hash(server_nonce);
    await db.add_coinflip_pvp(interaction.id, user.id, wager, server_nonce, pick);
    //send embed where people can enter their random thing
    let coinflip_start_embed = new discord.EmbedBuilder();
    coinflip_start_embed.setTitle("Play Coinflip!");
    coinflip_start_embed.setColor("#2ae519");
    coinflip_start_embed.setDescription(`<@${user.id}> has selected **${pick.toUpperCase()}**${ pick === "heads" ? " <:Heads:1157086933495840868>" : " <:Tails:1157086940777164942>" }\n\nTo cover the bet and join the game as **${pick === "heads" ? "TAILS" : "HEADS"}** click the button below! (Note: Both players must click the button below to start the game)`);
    coinflip_start_embed.addFields([
      {
        name: "Wager Amount",
        value: `${wager} XAC`,
      },
      {
        name: "Server Nonce Hash",
        value: "`"+hashed_server_nonce+"`",
      }
    ]);
    //coinflip_start_embed.setImage("https://cdn.discordapp.com/attachments/1087903395962179646/1155719287844126771/Spin.gif");
    coinflip_start_embed.setFooter({ text: "Provably fair! Run `/provably_fair_pvp`." });
    //send button that opens modal to enter in random string
    let bet_button = new discord.ButtonBuilder()
      .setCustomId("cfpvpbtn-"+interaction.id)
      .setLabel("Bet!")
      .setStyle('Primary');
    let action_row = new discord.ActionRowBuilder();
    action_row.addComponents(bet_button);
    return await interaction.editReply({ embeds: [coinflip_start_embed], components: [action_row] });
  } else if (command === "coinflip_pvh") {
    //unregistered
    await interaction.deferReply();
    let wager = (await params.get("wager")).value;
    wager = Math.floor(wager);
    if (wager < 1) {
      return await interaction.editReply("Failed, cannot wager less than 1, 0, or negative XAC.");
    } else if (wager > 10000) {
      return await interaction.editReply("For now, wagers cannot be over ten thousand XAC.");
    }
    let pick = (await params.get("pick")).value.toLowerCase().trim();
    if (pick !== "heads" && pick !== "tails") {
      return await interaction.editReply("Must choose 'Heads' or 'Tails'.");
    }
    //check player balance
    let player_address = await songbird.get_tipbot_address(user.id);
    let player_sgb_bal = await songbird.get_bal(player_address);
    if (player_sgb_bal < MIN_SGB) {
      return await interaction.editReply(`Please deposit more SGB **into your tipbot wallet** to cover any gas fees (${MIN_SGB} SGB minimum).`);
    }
    let player_astral_bal = await songbird.get_bal_astral(player_address);
    if (player_astral_bal < wager) {
      return await interaction.editReply("You do not have enough XAC **in your tipbot wallet** to cover the wager.");
    }
    //check house balance (bet amount + 10k for safety)
    let house_address = await songbird.get_tipbot_address(0);
    if (await songbird.get_bal(house_address) < MIN_SGB) {
      return await interaction.editReply("House does not have enough SGB to pay for fees.");
    } else if (await songbird.get_bal_astral(house_address) < 10000 + wager) {
      return await interaction.editReply("House does not have enough XAC to play (house needs wager + 10k).");
    }
    //gen server nonce
    const server_nonce = util.gen_server_nonce();
    const hashed_server_nonce = util.hash(server_nonce);
    //add to db
    await db.add_coinflip_pvh(interaction.id, user.id, wager, server_nonce, pick);
    //send embed with button that opens up modal
    let coinflip_start_embed = new discord.EmbedBuilder();
    coinflip_start_embed.setTitle("Coinflip against the House!");
    coinflip_start_embed.setColor("#2ae519");
    coinflip_start_embed.setDescription(`You (<@${user.id}>) have selected **${pick.toUpperCase()}**${ pick === "heads" ? " <:Heads2:1167286494046720041>" : " <:Tails2:1167286498593345557>" }\n\nNow you just need to click the button below to complete the bet.`);
    coinflip_start_embed.addFields([
      {
        name: "Wager Amount",
        value: `${wager} XAC`,
      },
      {
        name: "Server Nonce Hash",
        value: "`"+hashed_server_nonce+"`",
      }
    ]);
    //coinflip_start_embed.setImage("https://cdn.discordapp.com/attachments/1087903395962179646/1155719287844126771/Spin.gif");
    coinflip_start_embed.setFooter({ text: "Provably fair! Run `/provably_fair_pvh`." });
    //send button that opens modal to enter in random string
    let bet_button = new discord.ButtonBuilder()
      .setCustomId("cfpvhbtn-"+interaction.id)
      .setLabel("Bet!")
      .setStyle('Primary');
    let action_row = new discord.ActionRowBuilder();
    action_row.addComponents(bet_button);
    return await interaction.editReply({ embeds: [coinflip_start_embed], components: [action_row] });
  } else if (command === "provably_fair_pvp") {
    //explain why the pvp game is provably fair. but for now...
    return await interaction.reply("https://github.com/jetstream0/Astral-Credits-Bot/blob/master/verifiers/coinflip_pvp.js");
  } else if (command === "provably_fair_pvh") {
    //explain why the pvh game is provably fair. but for now...
    return await interaction.reply("https://github.com/jetstream0/Astral-Credits-Bot/blob/master/verifiers/coinflip_pvh.js");
  } else if (command === "crawl") {
    //while not an admin id guarded command, mkzi still has this command hidden for most non-admin people and channels
    await interaction.deferReply({ ephemeral: true });
    try {
      let address = (await params.get("address")).value.toLowerCase().trim();
      let known_only = (await params.get("known_only")).value;
      let address_valid;
      try {
        address_valid = songbird.is_valid(address);
      } catch (e) {
        address_valid = false;
      }
      if (!address_valid) {
        return await interaction.editReply(`Invalid address \`${address}\` provided`);
      }
      let associates = await songbird.find_associated(address);
      //sort associates
      //probably, not everything needs to be sorted
      let sorted_associates = Object.entries(associates).sort((a, b) => b[1] - a[1]);
      let content = `**Crawl Results${ known_only ? "" : " (Top 25)" }:**\n`;
      let current_count = 0;
      let ignore_list = ["0x61b64c643fccd6ff34fc58c8ddff4579a89e2723"];
      for (let i=0; i < sorted_associates.length; i++) {
        //if known_only is true, more than 25 can be displayed
        if (current_count === 25 && !known_only) break;
        let found_user = await db.get_user_by_address(sorted_associates[i][0]);
        if (found_user && !ignore_list.includes(sorted_associates[i][0])) {
          content += `<@${found_user.user}> (${sorted_associates[i][0]}): ${sorted_associates[i][1]} transactions\n`;
        } else if (known_only) {
          //skip
          continue;
        } else {
          content += `${sorted_associates[i][0]}: ${sorted_associates[i][1]} transactions\n`;
        }
        current_count++;
      }
      if (content.length > 2000) {
        const attachment = new discord.AttachmentBuilder(Buffer.from(content), { name: `${address}.txt` });
        return interaction.editReply({ content: "Too big to send as embed, sending as text file", files: [attachment]});
      }
      return await interaction.editReply(content);
    } catch (e) {
      console.log(e);
      return await interaction.editReply("Encountered error");
    }
  } else if (command === "crawl_shared_txs") {
    //while not an admin id guarded command, mkzi still has this command hidden for most non-admin people and channels
    await interaction.deferReply({ ephemeral: true });
    try {
      let address1 = (await params.get("address1")).value.toLowerCase().trim();
      let address2 = (await params.get("address2")).value.toLowerCase().trim();
      let address_valid;
      try {
        address_valid = songbird.is_valid(address1) && songbird.is_valid(address2);
      } catch (e) {
        address_valid = false;
      }
      if (!address_valid) {
        return await interaction.editReply("Invalid address provided");
      }
      let shared_txs = await songbird.find_shared_txs(address1, address2);
      if (shared_txs.length === 0) {
        return await interaction.editReply("Did not find any");
      } else {
        let content = "**Shared TXs**\n";
        for (let i=0; i < shared_txs.length; i++) {
          content += `- [${shared_txs[i]}](<https://songbird-explorer.flare.network/tx/${shared_txs[i]}>)\n`;
        }
        if (content.length > 2000) {
          const attachment = new discord.AttachmentBuilder(Buffer.from(content), { name: `${address1}_${address2}.txt` });
          return interaction.editReply({ content: "Too big to send as embed, sending as text file", files: [attachment]});
        }
        return await interaction.editReply(content);
      }
    } catch (e) {
      console.log(e);
      return await interaction.editReply("Encountered error");
    }
  }

  //admin command
  await interaction.member.fetch();
  if (ADMINS.includes(user.id) || interaction.member.roles.cache.has("1001004354981077032") || interaction.member.roles.cache.has("1127728118006829136")) {
    if (command === "send") {
      await interaction.deferReply();
      //two optional args: address or discord user, can only choose one
      let amount = Number((await params.get("amount")).value.toFixed(MAX_DECIMALS));
      if (amount <= 0) {
        return await interaction.editReply("Failed, cannot send 0 or negative XAC.");
      }
      let address = await params.get("address");
      let target = await params.get("target");
      let to_tipbot = await params.get("to_tipbot");
      let tx;
      let receiver;
      let sgb_domain = false;
      if (to_tipbot && address) {
        return await interaction.editReply("Failed, `to_tipbot` can only be an option when using target, not address.");
      } else if (address && target) {
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
        if (address.endsWith(".sgb")) {
          sgb_domain = address;
          address_valid = true;
          address = await songbird.lookup_domain_owner(address);
          if (!address || address === "0x0000000000000000000000000000000000000000") {
            return await interaction.editReply(`Could not find owner of that .sgb domain. Does it exist? Check the spelling.`);
          }
        }
        if (!address_valid) {
          return interaction.editReply("Failed, invalid address.");
        }
        tx = await songbird.send_astral(address, amount);
        if (!tx) {
          return interaction.editReply("Failed, send error. Perhaps not enough balance?");
        }
        receiver = "`"+address+"`";
      } else if (target) {
        target = target.user;
        if (to_tipbot?.value) {
          tx = await songbird.send_astral(await songbird.get_tipbot_address(target.id), amount);
          if (!tx) {
            return interaction.editReply("Failed, send error. Perhaps not enough balance?");
          }
          receiver = "<@"+target.id+">";
        } else {
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
        }
      } else {
        return await interaction.editReply("Failed, neither address or target to send to was specified.");
      }
      //Successfully sent, now send embed
      let send_embed = new discord.EmbedBuilder();
      send_embed.setTitle("Successfully Sent!");
      send_embed.setColor("#0940e5");
      send_embed.setDescription(`${String(amount)} XAC sent to ${receiver}${ to_tipbot?.value ? " (sent to tipbot wallet)" : ""}${ sgb_domain ? ` (${sgb_domain})` : "" }. [View tx](https://songbird-explorer.flare.network/tx/${tx}).`);
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
    } else if (command === "remove_linked_website") {
      await interaction.deferReply();
      let target = await params.get("target");
      target = target.user;
      //get address
      let user_info = await db.get_user(target.id);
      if (!user_info) {
        return interaction.editReply("This user has not registered with the bot.");
      }
      await db.remove_linked_website(user_info.address);
      return interaction.editReply("Removed user's linked website, if they linked one.");
    } else if (command === "list_role") {
      await interaction.deferReply({ ephemeral: true });
      let mentions = (await params.get("mentions")).value;
      let role = (await params.get("role")).role;
      await interaction.guild.members.fetch();
      let members;
      if (mentions) {
        members = role.members.map((member) => "<@"+member.user.id+">");
      } else {
        members = role.members.map((member) => member.user.tag.endsWith("#0") ? member.user.tag.slice(0, member.user.tag.length-2) : member.user.tag);
      }
      members = members.join(",");
      if (members.length > 2000-6) {
        //send as file instead
        const attachment = new discord.AttachmentBuilder(Buffer.from(members), { name: `${role.id}.txt` });
        return interaction.editReply({ content: "Too big to send as embed, sending as text file", files: [attachment]});
      } else {
        return interaction.editReply("```\n"+members+"\n```");
      }
    } else if (command === "view_addresses") {
      await interaction.deferReply({ ephemeral: true });
      let target = await params.get("target");
      target = target.user;
      let user_info = await db.get_user(target.id);
      let tipbot_address = await songbird.get_tipbot_address(target.id);
      let add_embed = new discord.EmbedBuilder();
      add_embed.setTitle(`Addresses of ${target.username}`);
      add_embed.addFields([
        {
          name: "Registered Address",
          value: `${user_info ? `[${user_info.address}](https://songbird-explorer.flare.network/address/${user_info.address})` : "Unregistered"}`,
        },
        {
          name: "Tipbot Address",
          value: `[${tipbot_address}](https://songbird-explorer.flare.network/address/${tipbot_address})`,
        },
      ]);
      return interaction.editReply({ embeds: [add_embed] });
    } else if (command === "export_domains") {
      await interaction.deferReply();
      let all_domains = await db.get_all_domains();
      const domains_attachment = new discord.AttachmentBuilder(Buffer.from(JSON.stringify(all_domains)), { name: "domains_airdrop.json" });
      return await interaction.editReply({ files: [ domains_attachment ] })
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
      return await interaction.reply({ ephemeral: true, content: "You cannot claim for someone else! Run the `/faucet` command yourself to claim." });
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
      return await interaction.editReply(`<@${user.id}> Error, you failed captcha. Run \`/faucet\` to try again.`);
    }
    //make sure claim limit not already exceeded
    let claims_month = await db.get_claims_this_month();
    if (claims_month >= MAX_CLAIMS_PER_MONTH) {
      return await interaction.editReply(`<@${user.id}> We already reached this month's max claim limit (${claims_month})!`);
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
        return await interaction.editReply(`<@${user.id}> Error, your last claim was too soon! Run \`/next_claim\` to see when your next claim will be.`);
      }
    }
    //songbird enough balance
    let enough_balance = await songbird.enough_balance(address, HOLDING_REQUIREMENT);
    let token_tx_resp = await fetch("https://songbird-explorer.flare.network/api?module=account&action=tokentx&address="+address);
    token_tx_resp = await token_tx_resp.json();
    //let aged_enough = await songbird.aged_enough(address, HOLDING_REQUIREMENT, token_tx_resp, enough_balance.wrapped_sgb_bal);
    let aged_enough = true;
    if (!aged_enough || !enough_balance.success) {
      let holds_aged_nft = await songbird.holds_aged_nfts(address, token_tx_resp);
      //provide exemption if they hold aged nft
      if (!holds_aged_nft) {
        if (!enough_balance.success) {
          return await interaction.editReply(`<@${user.id}> Error, you do not hold enough SGB or WSGB.`);
        } else if (!aged_enough) {
          return await interaction.editReply(`<@${user.id}> Error, your SGB or WSGB needs to be held for at least 1 day (${songbird.HOLDING_BLOCK_TIME} blocks).`);
        }
      }
    }
    //send XAC, check for send error
    let send_amount = db.get_amount();
    let tx = await songbird.faucet_send_astral(user_info.address, send_amount);
    if (!tx) {
      return await interaction.editReply(`<@${user.id}> Error, send failed! Probably gas issue, too many claims at once or faucet is out of funds. Try again in a few minutes.`);
    }
    //add to db
    await db.add_claim(user_info.address, send_amount);
    //reply with embed that includes tx link
    let faucet_embed = new discord.EmbedBuilder();
    //let month = db.get_month();
    faucet_embed.setColor("#15d30e");
    faucet_embed.setTitle("Faucet Claim");
    faucet_embed.setURL("https://songbird-explorer.flare.network/tx/"+tx);
    faucet_embed.setImage("https://cdn.discordapp.com/attachments/975616285075439636/1098738804904431686/XAC_check.gif");
    faucet_embed.setDescription(`${send_amount} XAC has been sent to <@${user.id}>. You should receive it shortly! Come back in 24 hours to claim again.\n[View tx](https://songbird-explorer.flare.network/tx/${tx}).`);
    faucet_embed.setTimestamp();
    if (!db_result) {
      faucet_embed.setFooter({ text: "Thanks! Note: user not found in DB." });
    } else {
      faucet_embed.setFooter({ text: "Thank you for participating in the XAC distribution!" });
    }
    return await interaction.editReply({ embeds: [faucet_embed] });
  } else if (customId.startsWith("cfpvpbtn-")) {
    async function disable_button_cfpvp() {
      try {
        let bet_button = new discord.ButtonBuilder()
          .setCustomId("cfpvpbtn-"+interaction.id)
          .setLabel("Bet!")
          .setDisabled(true)
          .setStyle('Primary');
        let action_row = new discord.ActionRowBuilder();
        action_row.addComponents(bet_button);
        await interaction.channel.fetch();
        await interaction.message.edit({ embeds: interaction.message.embeds, components: [action_row] });
      } catch (e) {
        console.log(e);
      }
    }
    await interaction.deferReply({ ephemeral: true });
    //get bet info
    let bet_id = customId.split("-")[1];
    let coinflip_info = await db.get_coinflip_pvp(bet_id);
    if (coinflip_info.player1.player_id === user.id && coinflip_info.player1.random) {
      return await interaction.editReply({ ephemeral: true, content: "You have already submitted your random input." });
    }
    //if player 2, make sure player 2 doesn't exist yet
    if (coinflip_info.player1.player_id !== user.id && coinflip_info.player2) {
      return await interaction.editReply("There are already two players in this game, so you cannot join. Sorry! You can start your own coinflip game, or wait for someone else to start one.");
    }
    //check balance of both players, cancel if either doesn't have enough. not very DRY but whatever I don't care right now, is just draft
    let player1_address = await songbird.get_tipbot_address(coinflip_info.player1.player_id);
    let player1_sgb_bal = await songbird.get_bal(player1_address);
    if (player1_sgb_bal < MIN_SGB) {
      disable_button_cfpvp();
      await interaction.editReply(`Player 1 (<@${coinflip_info.player1.player_id}>) should deposit more SGB **into their tipbot wallet** to cover any gas fees (${MIN_SGB} SGB minimum).`);
      return await interaction.followUp(`Player 1 (<@${coinflip_info.player1.player_id}>) should deposit more SGB **into their tipbot wallet** to cover any gas fees.`);
    }
    let player1_astral_bal = await songbird.get_bal_astral(player1_address);
    if (player1_astral_bal < coinflip_info.wager) {
      disable_button_cfpvp();
      await interaction.editReply(`Player 1 (<@${coinflip_info.player1.player_id}>) does not have enough XAC **in their tipbot wallet** to cover the wager.`);
      return await interaction.followUp(`Player 1 (<@${coinflip_info.player1.player_id}>) does not have enough XAC **in their tipbot wallet** to cover the wager.`);
    }
    if (coinflip_info.player2?.player_id) {
      //is player 1 and player 2 exists
      let player2_address = await songbird.get_tipbot_address(coinflip_info.player2.player_id);
      let player2_sgb_bal = await songbird.get_bal(player2_address);
      if (player2_sgb_bal < MIN_SGB) {
        disable_button_cfpvp();
        await interaction.editReply(`Player 2 (<@${coinflip_info.player2.player_id}>) should deposit more SGB **into their tipbot wallet** to cover any gas fees (${MIN_SGB} SGB minimum).`);
        return await interaction.followUp(`Player 2 (<@${coinflip_info.player2.player_id}>) should deposit more SGB **into their tipbot wallet** to cover any gas fees.`);
      }
      let player2_astral_bal = await songbird.get_bal_astral(player2_address);
      if (player2_astral_bal < coinflip_info.wager) {
        disable_button_cfpvp();
        await interaction.editReply(`Player 2 (<@${coinflip_info.player2.player_id}>) does not have enough XAC **in their tipbot wallet** to cover the wager.`);
        return await interaction.followUp(`Player 2 (<@${coinflip_info.player2.player_id}>) does not have enough XAC **in their tipbot wallet** to cover the wager.`);
      }
    } else if (coinflip_info.player1.player_id !== user.id) {
      //is player 2, check self
      let player2_address = await songbird.get_tipbot_address(user.id);
      let player2_sgb_bal = await songbird.get_bal(player2_address);
      if (player2_sgb_bal < MIN_SGB) {
        return await interaction.editReply(`You should deposit more SGB **into your tipbot wallet** to cover any gas fees (${MIN_SGB} SGB minimum).`);
      }
      let player2_astral_bal = await songbird.get_bal_astral(player2_address);
      if (player2_astral_bal < coinflip_info.wager) {
        return await interaction.editReply("You don't have enough XAC **in your tipbot wallet** to cover the wager.");
      }
    }
    //we know balances are enough, so go add player random (if player2, it will create automatically)
    let player_random = (await interaction.followUp(`<@${user.id}> joined the bet!`)).id;
    const insert_result = await db.add_coinflip_pvp_random(bet_id, user.id, String(player_random));
    //I think when it fails insert_result === false but hey
    if (insert_result?.modifiedCount !== 1) {
      //player 2 already exists
      return await interaction.editReply("There are already two players in this game (or you tried to join a game twice), so you cannot join. Sorry! You can start your own coinflip game, or wait for someone else to start one.");
    }
    await interaction.editReply("Successfully joined bet. Now just wait for the other player.");
    //if both player 1 and player 2's randoms exist
    coinflip_info = await db.get_coinflip_pvp(bet_id);
    if (coinflip_info.player1.random && coinflip_info.player2?.random) {
      //disable button
      disable_button_cfpvp();
      //calculate result: hash, convert hash to number and calculate winner
      //hash should be 32 bytes
      const cfpvp_hash = util.hash(BigInt(coinflip_info.player1.random).toString(16)+BigInt(coinflip_info.player2.random).toString(16)+coinflip_info.server_nonce);
      const cfpvp_number = util.hex_to_bigint(cfpvp_hash);
      //determine winner.
      const decimal_two_places = Number((cfpvp_number*BigInt(100))/(BigInt(2)**BigInt(256)))/100;
      //console.log(cfpvp_hash, cfpvp_number, decimal_two_places)
      //2**255 is half of 2**256
      let winner;
      let loser;
      //0.5 and over means heads, under is tails
      let result;
      if (cfpvp_number < BigInt(2)**BigInt(255)) {
        result = "Tails";
        if (coinflip_info.pick === "heads") {
          //player 2 wins
          winner = {
            num: "2",
            id: coinflip_info.player2.player_id,
          };
          loser = {
            num: "1",
            id: coinflip_info.player1.player_id,
          };
        } else if (coinflip_info.pick === "tails") {
          //player 1 wins
          winner = {
            num: "1",
            id: coinflip_info.player1.player_id,
          };
          loser = {
            num: "2",
            id: coinflip_info.player2.player_id,
          };
        }
      } else {
        result = "Heads";
        if (coinflip_info.pick === "heads") {
          //player 1 wins
          winner = {
            num: "1",
            id: coinflip_info.player1.player_id,
          };
          loser = {
            num: "2",
            id: coinflip_info.player2.player_id,
          };
        } else if (coinflip_info.pick === "tails") {
          //player 2 wins
          winner = {
            num: "2",
            id: coinflip_info.player2.player_id,
          };
          loser = {
            num: "1",
            id: coinflip_info.player1.player_id,
          };
        }
      }
      //do last check
      let playerwin_address = await songbird.get_tipbot_address(winner.id);
      let playerwin_sgb_bal = await songbird.get_bal(playerwin_address);
      if (playerwin_sgb_bal < MIN_SGB) {
        return await interaction.followUp(`<@${winner.id}> seemingly withdrew/sent too much SGB after submitting bet, the bet has been cancelled.`);
      }
      let playerwin_astral_bal = await songbird.get_bal_astral(playerwin_address);
      if (playerwin_astral_bal < coinflip_info.wager) {
        return await interaction.followUp(`<@${winner.id}> seemingly withdrew/sent too much XAC after submitting bet, the bet has been cancelled.`);
      }
      //send tx
      let tx;
      try {
        tx = await songbird.user_withdraw_astral(loser.id, playerwin_address, coinflip_info.wager);
      } catch (e) {
        console.log(e);
        return await interaction.followUp(`<@${winner.id}> won, but send from <@${loser.id}> to the winner failed for some reason. This shouldn't happen. Contact admin.`);
      }
      const attachment = new discord.AttachmentBuilder("https://cdn.discordapp.com/attachments/1087903395962179646/1155719287844126771/Spin.gif", { name: "spin.gif" });
      let followMessage = await interaction.followUp({ content: "The coin is being flipped...", files: [attachment] });
      await sleep(3500);
      //send result: winner, players, each player's random input, reveal server nonce, tx
      let coinflip_result_embed = new discord.EmbedBuilder();
      coinflip_result_embed.setTitle("A coin has been flipped...");
      coinflip_result_embed.setColor("#e07c35");
      coinflip_result_embed.setDescription(`**It's ${result.toUpperCase()}!
**\n**<@${winner.id}> (Player ${winner.num}) won ${coinflip_info.wager} XAC from <@${loser.id}> (Player ${loser.num})!** [View TX](https://songbird-explorer.flare.network/tx/${tx.hash}).\n\nHeads wins when the flip result is greater than or equal to 0.5, and Tails wins when the flip result is less than 0.5.`);
      coinflip_result_embed.addFields([
        {
          name: "Flip Result",
          value: `${result} (${decimal_two_places})`,
        },
        {
          name: "Picks",
          value: `Player 1: ${coinflip_info.pick.toUpperCase()}, Player 2: ${coinflip_info.pick === "heads" ? "TAILS" : "HEADS"}`,
        },
        {
          name: "Server Nonce",
          value: "`"+coinflip_info.server_nonce+"`",
        },
        {
          name: "Player 1 Message ID",
          value: "`"+coinflip_info.player1.random+"`",
        },
        {
          name: "Player 2 Message ID",
          value: "`"+coinflip_info.player2.random+"`",
        },
      ]);
      if (result === "Heads") {
        coinflip_result_embed.setThumbnail("https://cdn.discordapp.com/attachments/1087903395962179646/1155746538417553408/Heads.gif");
      } else {
        coinflip_result_embed.setThumbnail("https://cdn.discordapp.com/attachments/1087903395962179646/1155746538786656356/Tails.gif");
      }
      coinflip_result_embed.setFooter({ text: "Learn how to prove these results by running \`/provably_fair_pvp\`" });
      return await followMessage.edit({ content: "", files: [], embeds: [coinflip_result_embed] });
    }
  } else if (customId.startsWith("cfpvhbtn-")) {
    //await interaction.deferReply();
    //check balance
    //check bet info
    let bet_id = customId.split("-")[1];
    let coinflip_info = await db.get_coinflip_pvh(bet_id);
    if (coinflip_info.player_id !== user.id) {
      return await interaction.reply({ ephemeral: true, content: "Create this coinflip game to play - this is someone else's!" });
    }
    let modal = new discord.ModalBuilder()
      .setCustomId(customId.replace("cfpvhbtn-", "cfpvhmod-"))
      .setTitle('Complete Coinflip');
    let random_input = new discord.TextInputBuilder()
      .setCustomId("random")
      .setStyle(discord.TextInputStyle.Short)
      .setMaxLength(42)
      .setLabel("Mash your keyboard, write some random stuff")
      .setPlaceholder("This ensures the result is random and fair")
      .setRequired(true);
    let action_row = new discord.ActionRowBuilder();
    action_row.addComponents(random_input);
    modal.addComponents(action_row);
    return await interaction.showModal(modal);
  } else if (customId.startsWith("cfpvhmod-")) {
    async function disable_button_cfpvh() {
      try {
        let bet_button = new discord.ButtonBuilder()
          .setCustomId("cfpvhbtn-"+interaction.id)
          .setLabel("Bet!")
          .setDisabled(true)
          .setStyle('Primary');
        let action_row = new discord.ActionRowBuilder();
        action_row.addComponents(bet_button);
        await interaction.channel.fetch();
        await interaction.message.edit({ embeds: interaction.message.embeds, components: [action_row] });
      } catch (e) {
        console.log(e);
      }
    }
    await interaction.deferReply({ ephemeral: true });
    //get bet info
    let bet_id = customId.split("-")[1];
    let coinflip_info = await db.get_coinflip_pvh(bet_id);
    let player_random = interaction.fields.getTextInputValue("random");
    //if player 2, make sure player 2 doesn't exist yet
    if (coinflip_info.player_id !== user.id) {
      return await interaction.editReply("Error, only the creator of this game can play. Run the command yourself.");
    }
    if (coinflip_info.player_random) {
      return await interaction.editReply("Error, player random has already been submitted.");
    }
    //check balance of both players, cancel if either doesn't have enough. not very DRY but whatever I don't care right now, is just draft
    let player_address = await songbird.get_tipbot_address(coinflip_info.player_id);
    let player_sgb_bal = await songbird.get_bal(player_address);
    if (player_sgb_bal < MIN_SGB) {
      disable_button_cfpvh();
      await interaction.editReply(`You (<@${coinflip_info.player_id}>) should deposit more SGB **into their tipbot wallet** to cover any gas fees (${MIN_SGB} SGB minimum).`);
      return await interaction.followUp(`Player (<@${coinflip_info.player_id}>) should deposit more SGB **into their tipbot wallet** to cover any gas fees.`);
    }
    let player_astral_bal = await songbird.get_bal_astral(player_address);
    if (player_astral_bal < coinflip_info.wager) {
      disable_button_cfpvh();
      await interaction.editReply(`You (<@${coinflip_info.player_id}>) do not have enough XAC **in your tipbot wallet** to cover the wager.`);
      return await interaction.followUp(`Player (<@${coinflip_info.player_id}>) does not have enough XAC **in their tipbot wallet** to cover the wager.`);
    }
    //check house balance (bet amount + 10k for safety)
    let house_address = await songbird.get_tipbot_address(0);
    if (await songbird.get_bal(house_address) < MIN_SGB) {
      return await interaction.editReply("House does not have enough SGB to pay for fees.");
    } else if (await songbird.get_bal_astral(house_address) < 10000 + coinflip_info.wager) {
      return await interaction.editReply("House does not have enough XAC to play (house needs wager + 10k).");
    }
    //we know balances are enough, so go add player random
    const insert_result = await db.add_coinflip_pvh_random(bet_id, player_random);
    //I think when it fails insert_result === false but hey
    if (insert_result?.modifiedCount !== 1) {
      //player already joined
      return await interaction.editReply("This bet is already in progress, probably (you probably clicked the button twice). Make a new bet to play twice.");
    }
    coinflip_info = await db.get_coinflip_pvh(bet_id);
    await interaction.editReply("Successfully joined bet and submitted your random input!");
    await interaction.followUp(`<@${user.id}> submitted their random input, and the bet is being calculated!`);
    await sleep(3500);
    //disable button
    disable_button_cfpvh();
    //calculate result: hash, convert hash to number and calculate winner
    //hash should be 32 bytes
    const cfpvh_hash = util.hash(Buffer.from(coinflip_info.player_random).toString("hex")+coinflip_info.server_nonce);
    const cfpvh_number = util.hex_to_bigint(cfpvh_hash);
    //determine winner.
    const decimal_two_places = Number((cfpvh_number*BigInt(100))/(BigInt(2)**BigInt(256)))/100;
    //2**255 is half of 2**256
    let won;
    //0.5 and over means heads, under is tails
    let result;
    if (cfpvh_number < BigInt(2)**BigInt(255)) {
      result = "Tails";
      if (coinflip_info.pick === "heads") {
        //house wins
        won = false;
      } else if (coinflip_info.pick === "tails") {
        //player 1 wins
        won = true;
      }
    } else {
      result = "Heads";
      if (coinflip_info.pick === "heads") {
        //player 1 wins
        won = true;
      } else if (coinflip_info.pick === "tails") {
        //house wins
        won = false;
      }
    }
    //send tx
    let tx;
    try {
      if (won) {
        tx = await songbird.user_withdraw_astral(0, player_address, coinflip_info.wager);
      } else {
        tx = await songbird.user_withdraw_astral(coinflip_info.player_id, house_address, coinflip_info.wager);
      }
    } catch (e) {
      console.log(e);
      return await interaction.followUp(`${ won ? "The player" : "The house" } won, but send from the loser (${ won ? "the player" : "the house" }) to the winner failed for some reason. This shouldn't happen. Contact admin.`);
    }
    const attachment = new discord.AttachmentBuilder("https://cdn.discordapp.com/attachments/1087903395962179646/1166130952255324220/Flip.gif", { name: "spin.gif" });
    let followMessage = await interaction.followUp({ content: "The coin is being flipped...", files: [attachment] });
    await sleep(3500);
    //send result: winner, players, each player's random input, reveal server nonce, tx
    let coinflip_result_embed = new discord.EmbedBuilder();
    coinflip_result_embed.setTitle("A coin has been flipped...");
    coinflip_result_embed.setColor("#e07c35");
    coinflip_result_embed.setDescription(`**It's ${result.toUpperCase()}!
**\n**${ won ? `<@${coinflip_info.player_id}> won ${coinflip_info.wager} XAC in a bet against the house!` : `<@${coinflip_info.player_id}> lost ${coinflip_info.wager} XAC in a bet against the house!` }** [View TX](https://songbird-explorer.flare.network/tx/${tx.hash}).\n\nHeads wins when the flip result is greater than or equal to 0.5, and Tails wins when the flip result is less than 0.5.`);
    coinflip_result_embed.addFields([
      {
        name: "Flip Result",
        value: `${result} (${decimal_two_places})`,
      },
      {
        name: "Pick",
        value: coinflip_info.pick.toUpperCase(),
      },
      {
        name: "Server Nonce",
        value: "`"+coinflip_info.server_nonce+"`",
      },
      {
        name: "Player Random",
        value: "`"+coinflip_info.player_random+"`",
      },
    ]);
    if (result === "Heads") {
      coinflip_result_embed.setThumbnail("https://cdn.discordapp.com/attachments/1087903395962179646/1166134493749452831/Heads2.gif");
    } else {
      coinflip_result_embed.setThumbnail("https://cdn.discordapp.com/attachments/1087903395962179646/1166134493388734534/Tails2.gif");
    }
    coinflip_result_embed.setFooter({ text: "Learn how to prove these results by running \`/provably_fair_pvh\`" });
    return await followMessage.edit({ content: "", files: [], embeds: [coinflip_result_embed] });
  }
});

client.login(process.env.token);
