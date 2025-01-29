const dotenv = require("dotenv");
dotenv.config();

const discord = require("discord.js");

const db = require("./db.js");
const songbird = require("./songbird.js");
const util = require("./util.js");
const { fetch } = require("cross-fetch");

const client = new discord.Client({
  intents: [discord.GatewayIntentBits.Guilds, discord.GatewayIntentBits.GuildMembers, discord.GatewayIntentBits.GuildMessages]
});

const ADMINS = ["239770148305764352", "288612712680914954", "875942059503149066", "600071769721929746", "1074092955943571497", "486380942911471617"];

//mods too
const TEAM = [...ADMINS];

const DOMAIN_END = 1694029371; //september 7th, 2023 00:00 UTC

const MIN_SGB = 0.25;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

//23 1/2 hours
const CLAIM_FREQ = db.CLAIM_FREQ;
const MAX_CLAIMS_PER_MONTH = 11111;
const HOLDING_REQUIREMENT = 2000;

let historic_data_cache;
let liqudity_cache;
let sgb_price_cache;
let pptr_cache;
let burned_cache;

client.once("ready", async (info) => {
  console.log("Ready! as " + info.user.tag);
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
          //name: "Astral Price: $" + price,
          name: "XAC Price",
          type: 3,
        }
      ],
      status: "online",
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
  setInterval(set_price_status, 25 * 60 * 1000);
  //start milestone check
  async function send_announcement(text) {
    client.channels.cache.get("1103087597875634257").send(text);
  }
  setTimeout(async () => {
    await db.milestone_check(send_announcement);
  }, 7500);
  setInterval(async () => {
    await db.milestone_check(send_announcement);
  }, 30 * 60 * 1000);
  async function set_pptr_cache() {
    let token_resp = await (await fetch("https://songbird-explorer.flare.network/api?module=account&action=tokentx&address=0x93CA88Ee506096816414078664641C07aF731026")).json();
    pptr_cache = token_resp.result.filter((t) => t.input.startsWith("0xd2b7f857")); //setPixel (todo: support setPixelBatch)
  }
  set_pptr_cache();
  setInterval(set_pptr_cache, 4 * 60 * 1000);
  burned_cache = await db.calculate_burned();
  setInterval(async () => burned_cache = await db.calculate_burned(), 12 * 60 * 60 * 1000);
});

async function add_achievement(user_id, achievement_id, cached_user, member) {
  //add_achievement_db returns false if user already has the acheivement
  if (await db.add_achievement_db(user_id, achievement_id, cached_user)) {
    const achievement_info = db.ACHIEVEMENTS[achievement_id];
    //pay prize from team's collective tipping wallet to the user's tipping wallet
    let user_tipbot_address = songbird.get_tipbot_address(user_id);
    let tx = false;
    if (achievement_info.prize > 0) {
      tx = await songbird.send_astral(user_tipbot_address, achievement_info.prize);
    }
    //send message in notifications
    let astral_guild = client.guilds.cache.get("1000985457393422367");
    await astral_guild.channels.fetch();
    //notifications: 1103087597875634257
    let achievement_notif_embed = new discord.EmbedBuilder();
    achievement_notif_embed.setTitle("Achievement Earned!");
    achievement_notif_embed.setColor("#30d613");
    achievement_notif_embed.setThumbnail("https://cdn.discordapp.com/attachments/1070194353768775761/1212874280430215249/Medal.png?ex=65f36c32&is=65e0f732&hm=6c53aaec349530422678d6bd5a2ab020c16761b8bf9566b8d7361c3759cce539&");
    let notif_description = `Congratulations! <@${user_id}> has earned the achievement **"${achievement_info.name}" (${achievement_info.description})**`;
    if (achievement_info.prize > 0) {
      notif_description += `\nPrize: ${achievement_info.prize} <:XAC:1228104930464895106>\n[View Tx](https://songbird-explorer.flare.network/tx/${tx}) (sent to tipbot wallet)`;
    }
    achievement_notif_embed.setDescription(notif_description);
    achievement_notif_embed.setFooter({ text: "Do /unlocked_achievements to see a list of your unlocked achievements" });
    //add role if any
    if (achievement_info.role) {
      member.roles.add(achievement_info.role);
      achievement_notif_embed.addFields([
        {
          name: "Role Awarded",
          value: `<@&${achievement_info.role}>`
        }
      ]);
    }
    await astral_guild.channels.cache.get("1103087597875634257").send({ content: `<@${user_id}> completed an achievement :trophy:`, embeds: [achievement_notif_embed] });
    return true;
  }
  return false;
}

let message_xp_cooldown_cache = {};
const MESSAGE_XP_COOLDOWN = 20 * 1000;

client.on("messageCreate", async (message) => {
  //ignore message if not from xac server
  if (message.guildId !== "1000985457393422367") return;
  //Count a max of 1 message every 20 seconds toward the achievement (anti-spam)
  if (message_xp_cooldown_cache[message.author.id]+MESSAGE_XP_COOLDOWN < Date.now() || !message_xp_cooldown_cache[message.author.id]) {
    message_xp_cooldown_cache[message.author.id] = Date.now();
    let user_info = await db.get_user(message.author.id);
    //don't do anything if not registered
    if (user_info) {
      await db.increment_message_achievement_info(message.author.id);
      //don't judge
      switch (user_info.achievement_data.messages+1) {
        case 30:
          await add_achievement(message.author.id, "activity-1", user_info, message.member);
          break;
        case 100:
          await add_achievement(message.author.id, "activity-2", user_info, message.member);
          break;
        case 500:
          await add_achievement(message.author.id, "activity-3", user_info, message.member);
          break;
        case 1000:
          await add_achievement(message.author.id, "activity-4", user_info, message.member);
          break;
        case 2500:
          await add_achievement(message.author.id, "activity-5", user_info, message.member);
          break;
        case 5000:
          await add_achievement(message.author.id, "activity-6", user_info, message.member);
          break;
        default:
          //nothing
      }
    }
  }
});

client.on("interactionCreate", async interaction => {
  let command = interaction.commandName;
  let params = interaction.options;
  let user = interaction.user;

  //

  if (command === "help") {
    await interaction.deferReply({ ephemeral: true });
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
      {
        name: "/unlocked_achievements",
        value: "See your unlocked achievements"
      },
      {
        name: "/locked_achievements",
        value: "See achievements you haven't unlocked yet"
      },
      {
        name: "/claim_achievements",
        value: "Manually claim certain achievements"
      },
      {
        name: "/leaderboard",
        value: "See the users with the most achievements"
      },
      {
        name: "/santa",
        value: "Get a little gift from Santa on Christmas and the 12 days leading up to it"
      },
    ]);
    help_embed.setFooter({ text: "Made by prussia.dev" });
    await interaction.member.fetch();
    if (ADMINS.includes(user.id) || interaction.member.roles.cache.has("1001004354981077032") || interaction.member.roles.cache.has("1127728118006829136")) {
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
          name: "/reverse_lookup",
          value: "Find registered user from address"
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
        {
          name: "/registered_count",
          value: "Get a count of all registered users"
        },
        {
          name: "/admin_balance",
          value: "See balance of the admin tipping wallet"
        }
      ]);
      admin_embed.setFooter({ text: "\"The ships hung in the sky in much the same way that bricks don't.\" -Douglas Adams" });
      return await interaction.editReply({ embeds: [help_embed, admin_embed] });
    }
    return await interaction.editReply({ embeds: [help_embed] });
  } else if (command === "price") {
    await interaction.deferReply();
    let price_info;
    try {
      price_info = await songbird.get_price();
    } catch (e) {
      return await interaction.editReply("Failed to fetch coingecko API, probably you are requesting too fast (ratelimits)!");
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
        name: "FeatherSwap",
        value: "[Pool](https://featherswap.xyz/swap/?outputCurrency=0x61b64c643fccd6ff34fc58c8ddff4579a89e2723) | [GeckoTerminal](https://www.geckoterminal.com/songbird/pools/0x9cbc1cc3b29d8a61b1843df50b6e90261a692705)"
      },
      {
        name: "BlazeSwap",
        value: "[Pool](https://app.blazeswap.xyz/swap/?outputCurrency=0x61b64c643fccd6ff34fc58c8ddff4579a89e2723) | [GeckoTerminal](https://www.geckoterminal.com/songbird/pools/0xa49259d33f8bea503e59f3e75af9d43a119598c0)"
      },
      /*{
        name: "BlazeSwap Volume (last 7 days)",
        value: "$"+util.format_commas(String(Math.floor(historic_data_cache.ohlcv_list.slice(-7).map((item) => item[5]).reduce((total, num) => total+num))))+"~"
      },*/
      /*{
        name: "BlazeSwap Liquidity",
        value: "$"+util.format_commas(String(liqudity_cache))+"~"
      },*/
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
        fail_descrip += " The faucet is now CLOSED as we have reached the max no. of claims for the month! (11,111 claims). Please return when the faucet resets in the new month to claim again!";
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
    const remaining_claims = 11111-await db.get_claims_this_month();
    if (remaining_claims <= 0) {
      stats_embed.setDescription(`There are no more claims remaining this month! Faucet reset <t:${Math.floor(db.get_next_month_timestamp() / 1000)}:R>, halving <t:${Math.floor(db.get_next_halving_timestamp() / 1000)}:R>`);
    } else {
      stats_embed.setDescription(`There are ${remaining_claims} claims remaining this month!`);
    }
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
      },
      {
        name: "Total Burned",
        value: String(burned_cache) + " XAC",
        inline: true
      }
    ]);
    let user_info = await db.get_user(user.id);
    if (user_info) {
      stats_embed.addFields([
        {
          name: "Current Claim Streak",
          value: String(user_info.achievement_data.faucet.current_streak),
          inline: true
        },
        {
          name: "Longest Claim Streak",
          value: String(user_info.achievement_data.faucet.longest_streak),
          inline: true
        }
      ]);
    }
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
      let next_claim_info = await db.get_next_claim_time(user_info.address); //after claims for the month exhausted, this will return the time of the new month
      return await interaction.editReply(`<@${user.id}> We already reached this month's max claim limit (${claims_month} claims globally)! Please return when the faucet resets in the new month to claim again: <t:${next_claim_info.next_claim_time}:R>`);
    }
    //send captcha and modal thing with id set to code and nonce
    let captcha_info;
    try {
      captcha_info = await util.get_text_captcha();
    } catch (e) {
      return await interaction.editReply("Captcha service appears to be down. Contact an admin if this not resolve within 15 minutes, or if your streak is lost as a result of this. If that is the case, an admin will restore your streak. Thank you for your patience.");
    }
    if (!captcha_info) {
      return await interaction.editReply("Error, captcha probably currently down. Wait a bit and/or notify admins.");
    }
    //embed
    let captcha_embed = new discord.EmbedBuilder();
    captcha_embed.setTitle("One more step...");
    captcha_embed.setColor("#2c16f7");
    captcha_embed.setDescription("Please answer the captcha before you claim your XAC!");
    const attachment = new discord.AttachmentBuilder(captcha_info.challenge_url, { name: "captcha.png" });
    captcha_embed.setImage(`attachment://captcha.png`);
    captcha_embed.setFooter({ text: "Almost there!" });
    //send button that opens modal
    let captcha_button = new discord.ButtonBuilder()
      .setCustomId("capbtn-"+captcha_info.challenge_code+"-"+captcha_info.challenge_nonce+"-"+user.id+"-"+String(Date.now()))
      .setLabel("Solve Captcha")
      .setStyle("Primary");
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
    let player1_address = songbird.get_tipbot_address(user.id);
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
      .setStyle("Primary");
    let action_row = new discord.ActionRowBuilder();
    action_row.addComponents(bet_button);
    return await interaction.editReply({ embeds: [coinflip_start_embed], components: [action_row] });
  } else if (command === "coinflip_pvh") {
    //unregistered
    await interaction.deferReply();
    let wager = (await params.get("wager")).value;
    wager = Math.floor(wager);
    if (wager < 500) {
      return await interaction.editReply("Failed, cannot wager less than 500 XAC.");
    } else if (wager > 5000) {
      return await interaction.editReply("Wagers cannot be over 5000 XAC.");
    }
    let pick = (await params.get("pick")).value.toLowerCase().trim();
    if (pick !== "heads" && pick !== "tails") {
      return await interaction.editReply("Must choose 'Heads' or 'Tails'.");
    }
    //check player balance
    let player_address = songbird.get_tipbot_address(user.id);
    let player_sgb_bal = await songbird.get_bal(player_address);
    if (player_sgb_bal < MIN_SGB) {
      return await interaction.editReply(`Please deposit more SGB **into your tipbot wallet** to cover any gas fees (${MIN_SGB} SGB minimum).`);
    }
    let player_astral_bal = await songbird.get_bal_astral(player_address);
    if (player_astral_bal < wager) {
      return await interaction.editReply("You do not have enough XAC **in your tipbot wallet** to cover the wager.");
    }
    //check house balance (bet amount + 10k for safety)
    let house_address = songbird.get_tipbot_address(0);
    if (await songbird.get_bal(house_address) < MIN_SGB) {
      return await interaction.editReply("House does not have enough SGB to pay for fees.");
    } else if (await songbird.get_bal_astral(house_address) < 5000 + wager) {
      return await interaction.editReply("House does not have enough XAC to play (house needs wager + 5k).");
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
      .setStyle("Primary");
    let action_row = new discord.ActionRowBuilder();
    action_row.addComponents(bet_button);
    return await interaction.editReply({ embeds: [coinflip_start_embed], components: [action_row] });
  } else if (command === "provably_fair_pvp") {
    //explain why the pvp game is provably fair. but for now...
    return await interaction.reply("https://github.com/Astral-Credits/Astral-Credits-Bot/blob/master/verifiers/coinflip_pvp.js");
  } else if (command === "provably_fair_pvh") {
    //explain why the pvh game is provably fair. but for now...
    return await interaction.reply("https://github.com/Astral-Credits/Astral-Credits-Bot/blob/master/verifiers/coinflip_pvh.js");
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
      const initial_content = `**Crawl Results${ known_only ? "" : " (Top 25)" }:**\n`;
      let content = initial_content;
      let current_count = 0;
      let ignore_list = ["0x61b64c643fccd6ff34fc58c8ddff4579a89e2723"]; //what is this, again? some exchange address mistakenly registered?
      for (let i=0; i < sorted_associates.length; i++) {
        //if known_only is true, more than 25 can be displayed
        if (current_count === 25 && !known_only) break;
        let found_address = sorted_associates[i][0];
        let found_user = await db.get_user_by_address(found_address);
        if (found_user && !ignore_list.includes(found_address)) {
          content += `<@${found_user.user}> (${found_address}): ${sorted_associates[i][1]} transactions\n`;
        } else if (known_only) {
          //skip
          continue;
        } else if (Object.keys(songbird.SPECIAL_KNOWN).includes(found_address.toLowerCase())) {
          content += `${songbird.SPECIAL_KNOWN[found_address]} (${found_address}): ${sorted_associates[i][1]} transactions\n`;
        } else {
          content += `${found_address}: ${sorted_associates[i][1]} transactions\n`;
        }
        current_count++;
      }
      if (content.length > 2000) {
        const attachment = new discord.AttachmentBuilder(Buffer.from(content), { name: `${address}.txt` });
        return interaction.editReply({ content: "Too big to send as embed, sending as text file", files: [attachment]});
      }
      if (content === initial_content) {
        content += "No results.";
      }
      return await interaction.editReply(content);
    } catch (e) {
      console.log(e);
      return await interaction.editReply("Encountered error");
    }
  } else if (command === "unlocked_achievements") {
    const dresp = await interaction.deferReply();
    //show unlocked achievements for user
    let user_info = await db.get_user(user.id);
    if (!user_info) {
      return await interaction.editReply("Please do `/register` first!");
    }
    const all_achievements = Object.keys(db.ACHIEVEMENTS).length;
    let unlocked_infos = user_info.achievements.map((a) => db.ACHIEVEMENTS[a]);
    let unlocked_num = unlocked_infos.length;
    //todo: pagination and stuff (if more than 25 achievements)
    if (unlocked_num > 10) {
      //pagination and stuff
      const max_pages = Math.ceil(unlocked_num / 10);
      let unlocked_embeds = [];
      for (let i=0; i < max_pages; i++) {
        let unlocked_embed = new discord.EmbedBuilder();
        if (unlocked_num < all_achievements / 3) {
          unlocked_embed.setThumbnail("https://cdn.discordapp.com/attachments/1070194353768775761/1210017913038184468/Badge1.png?ex=65e907ff&is=65d692ff&hm=7f19adfc0753cb7e5888da82d19c5f055263cef5b4f593d6cbd5028b8cfc9927&");
        } else if (unlocked_num < all_achievements / 3 * 2) {
          unlocked_embed.setThumbnail("https://cdn.discordapp.com/attachments/1070194353768775761/1210018490371678228/Badge2.png?ex=65e90889&is=65d69389&hm=b5626c6a881ce6bb92cfcf92e2e40ac6b3f6b7b8c4d165d553743b3a3e48ff08&");
        } else if (unlocked_num < all_achievements) {
          unlocked_embed.setThumbnail("https://cdn.discordapp.com/attachments/1070194353768775761/1210019041197162496/Badge3.png?ex=65e9090c&is=65d6940c&hm=37e0460d8364b3dd18d7ff1f076e5573e2c943e10bfaa6d0e49a5571af2ca0ce&");
        } else if (unlocked_num === all_achievements) {
          unlocked_embed.setThumbnail("https://cdn.discordapp.com/attachments/1070194353768775761/1209275707180720168/Badge_FINAL.gif?ex=65e654c3&is=65d3dfc3&hm=ee2f28842f4b158744b658709c37804f7ab1ea999d7c1b3a9393337f1fd15c1b&");
        }
        unlocked_embed.setTitle("Unlocked Achievements");
        unlocked_embed.setDescription("Do `/locked_achievements` to see achievements yet to be unlocked.");
        unlocked_embed.addFields(unlocked_infos.slice(10*i, 10*i+10).map((u) => ({ name: u.name, value: `${u.description} ${u.prize} XAC` })));
        unlocked_embed.setColor("#689F38");
        unlocked_embed.setFooter({ text: `${unlocked_num}/${Object.keys(db.ACHIEVEMENTS).length} unlocked` });
        unlocked_embeds.push(unlocked_embed);
      }
      let action_row = new discord.ActionRowBuilder();
      let action_back = new discord.ButtonBuilder()
        .setCustomId("-1")
        .setLabel("Back")
        .setEmoji("⬅️")
        .setDisabled(true)
        .setStyle("Primary");
      let action_front = new discord.ButtonBuilder()
        .setCustomId("1")
        .setLabel("Foward")
        .setEmoji("➡️")
        .setStyle("Primary");
      action_row.addComponents(action_back, action_front);
      //components
      await interaction.editReply({
        embeds: [unlocked_embeds[0]],
        components: [action_row],
      });
      while (true) {
        try {
          //button interaction
          let dresp_bin = await dresp.awaitMessageComponent({ filter: (bin) => bin.user.id === interaction.user.id, time: 60000 });
          await dresp_bin.deferUpdate();
          //update
          let action_row = new discord.ActionRowBuilder();
          let action_back = new discord.ButtonBuilder()
            .setCustomId(String(Number(dresp_bin.customId)-1))
            .setEmoji("⬅️")
            .setDisabled(Number(dresp_bin.customId) === 0)
            .setStyle("Primary");
          let action_front = new discord.ButtonBuilder()
            .setCustomId(String(Number(dresp_bin.customId)+1))
            .setEmoji("➡️")
            .setDisabled(Number(dresp_bin.customId) === max_pages - 1)
            .setStyle("Primary");
          action_row.addComponents(action_back, action_front);
          //dresp_bin.customId will be the page to move to
          await interaction.editReply({
            embeds: [unlocked_embeds[Number(dresp_bin.customId)]],
            components: [action_row],
          });
        } catch (e) {
          return;
        }
      }
    } else {
      let unlocked_embed = new discord.EmbedBuilder();
      unlocked_embed.setTitle("Unlocked Achievements");
      if (unlocked_num < all_achievements / 3) {
        unlocked_embed.setThumbnail("https://cdn.discordapp.com/attachments/1070194353768775761/1210017913038184468/Badge1.png?ex=65e907ff&is=65d692ff&hm=7f19adfc0753cb7e5888da82d19c5f055263cef5b4f593d6cbd5028b8cfc9927&");
      } else if (unlocked_num < all_achievements / 3 * 2) {
        unlocked_embed.setThumbnail("https://cdn.discordapp.com/attachments/1070194353768775761/1210018490371678228/Badge2.png?ex=65e90889&is=65d69389&hm=b5626c6a881ce6bb92cfcf92e2e40ac6b3f6b7b8c4d165d553743b3a3e48ff08&");
      } else if (unlocked_num < all_achievements) {
        unlocked_embed.setThumbnail("https://cdn.discordapp.com/attachments/1070194353768775761/1210019041197162496/Badge3.png?ex=65e9090c&is=65d6940c&hm=37e0460d8364b3dd18d7ff1f076e5573e2c943e10bfaa6d0e49a5571af2ca0ce&");
      } else if (unlocked_num === all_achievements) {
        unlocked_embed.setThumbnail("https://cdn.discordapp.com/attachments/1070194353768775761/1209275707180720168/Badge_FINAL.gif?ex=65e654c3&is=65d3dfc3&hm=ee2f28842f4b158744b658709c37804f7ab1ea999d7c1b3a9393337f1fd15c1b&");
      }
      if (unlocked_num === 0) {
        unlocked_embed.setDescription("You haven't unlocked any achievements yet. Do `/locked_achievements` to see achievements yet to be unlocked.");
      } else {
        unlocked_embed.setDescription("Do `/locked_achievements` to see achievements yet to be unlocked.");
        unlocked_embed.addFields(unlocked_infos.map((u) => ({ name: u.name, value: `${u.description} ${u.prize} XAC` })));
      }
      unlocked_embed.setColor("#689F38");
      unlocked_embed.setFooter({ text: `${unlocked_num}/${Object.keys(db.ACHIEVEMENTS).length} unlocked` });
      return await interaction.editReply({ embeds: [unlocked_embed] });
    }
  } else if (command === "locked_achievements") {
    const dresp = await interaction.deferReply({ ephemeral: true });
    //show locked achievements for user
    let user_info = await db.get_user(user.id);
    if (!user_info) {
      return await interaction.editReply("Please do `/register` first!");
    }
    let locked_infos = Object.values(db.ACHIEVEMENTS).filter((a) => !user_info.achievements.includes(a.id));
    //todo: pagination and stuff (if more than 25 achievements)
    if (locked_infos.length > 10) {
      //pagination and stuff
      const max_pages = Math.ceil(locked_infos.length / 10);
      let locked_embeds = [];
      for (let i=0; i < max_pages; i++) {
        let locked_embed = new discord.EmbedBuilder();
        locked_embed.setTitle("Locked Achievements");
        locked_embed.setDescription("Do `/unlocked_achievements` to see your achievements.");
        locked_embed.addFields(locked_infos.slice(10*i, 10*i+10).map((u) => ({ name: u.name, value: `${u.description} ${u.prize} XAC` })));
        locked_embed.setColor("#B71C1C");
        locked_embed.setFooter({ text: `${Object.keys(db.ACHIEVEMENTS).length - locked_infos.length}/${Object.keys(db.ACHIEVEMENTS).length} unlocked` });
        locked_embeds.push(locked_embed);
      }
      let action_row = new discord.ActionRowBuilder();
      let action_back = new discord.ButtonBuilder()
        .setCustomId("-1")
        .setLabel("Back")
        .setEmoji("⬅️")
        .setDisabled(true)
        .setStyle("Primary");
      let action_front = new discord.ButtonBuilder()
        .setCustomId("1")
        .setLabel("Foward")
        .setEmoji("➡️")
        .setStyle("Primary");
      action_row.addComponents(action_back, action_front);
      //components
      await interaction.editReply({
        embeds: [locked_embeds[0]],
        components: [action_row],
      });
      while (true) {
        try {
          //button interaction
          let dresp_bin = await dresp.awaitMessageComponent({ filter: (bin) => bin.user.id === interaction.user.id, time: 60000 });
          await dresp_bin.deferUpdate();
          //update
          let action_row = new discord.ActionRowBuilder();
          let action_back = new discord.ButtonBuilder()
            .setCustomId(String(Number(dresp_bin.customId)-1))
            .setEmoji("⬅️")
            .setDisabled(Number(dresp_bin.customId) === 0)
            .setStyle("Primary");
          let action_front = new discord.ButtonBuilder()
            .setCustomId(String(Number(dresp_bin.customId)+1))
            .setEmoji("➡️")
            .setDisabled(Number(dresp_bin.customId) === max_pages - 1)
            .setStyle("Primary");
          action_row.addComponents(action_back, action_front);
          //dresp_bin.customId will be the page to move to
          await interaction.editReply({
            embeds: [locked_embeds[Number(dresp_bin.customId)]],
            components: [action_row],
          });
        } catch (e) {
          return;
        }
      }
    } else {
      let locked_embed = new discord.EmbedBuilder();
      locked_embed.setTitle("Locked Achievements");
      if (locked_infos.length === 0) {
        locked_embed.setDescription("You've unlocked all achievements! Whew... :tada:");
      } else {
        locked_embed.setDescription("Do `/unlocked_achievements` to see your achievements.");
        locked_embed.addFields(locked_infos.map((u) => ({ name: u.name, value: `${u.description} ${u.prize} XAC` })));
      }
      locked_embed.setColor("#B71C1C");
      locked_embed.setFooter({ text: `${Object.keys(db.ACHIEVEMENTS).length - locked_infos.length}/${Object.keys(db.ACHIEVEMENTS).length} unlocked` });
      return await interaction.editReply({ embeds: [locked_embed] });
    }
  } else if (command === "claim_achievements") {
    await interaction.deferReply();
    let user_info = await db.get_user(user.id);
    if (!user_info) {
      return await interaction.editReply("Please do `/register` first!");
    }
    //for non automatically rewarded achievements
    let given = [];
    //pixel planet
    if (pptr_cache?.filter((t) => t.from === user_info.address).length > 0) {
      let g = await add_achievement(user.id, "pixel-planet", user_info, interaction.member);
      if (g) {
        given.push(db.ACHIEVEMENTS["pixel-planet"].name);
        await sleep(2500);
      }
    }
    //discord boosts
    if (interaction.member.premiumSinceTimestamp) {
      let g = await add_achievement(user.id, "booster", user_info, interaction.member);
      if (g) {
        given.push(db.ACHIEVEMENTS["booster"].name);
        await sleep(2500);
      }
    }
    //nfts
    /*
    genesis token id: 1 (1000 sgb)
    galactic token id: 2 (100 sgb)
    hyperdrive token id: 3 (350 sgb)
    cosmic token id: 4 (700 sgb)
    hologram token id: 5 (3000 sgb)
    */
    let held_nfts = await songbird.get_held_nfts(user_info.address);
    //check if any held
    if (held_nfts.filter((n) => n > 0).length > 0) {
      let g = await add_achievement(user.id, "nft-1", user_info, interaction.member);
      if (g) {
        given.push(db.ACHIEVEMENTS["nft-1"].name);
        await sleep(2500);
      }
    }
    //check if more than 100k sgb worth held
    if (held_nfts.reduce((a, n, i) => a + Number(n)*songbird.nft_values[String(i+1)], 0) >= 10_000) {
      let g = await add_achievement(user.id, "nft-2", user_info, interaction.member);
      if (g) {
        given.push(db.ACHIEVEMENTS["nft-2"].name);
        await sleep(2500);
      }
    }
    //check if all held
    if (held_nfts.filter((n) => n > 0).length === 5) {
      let g = await add_achievement(user.id, "nft-all", user_info, interaction.member);
      if (g) {
        given.push(db.ACHIEVEMENTS["nft-all"].name);
      }
    }
    //check for xac millionaire
    if (await songbird.get_bal_astral(user_info.address) >= 1_000_000) {
      let g = await add_achievement(user.id, "millionaire", user_info, interaction.member);
      if (g) {
        given.push(db.ACHIEVEMENTS["millionaire"].name);
        await sleep(2500);
      }
    }
    //check for triforceone delegator
    let ftso_resp = await songbird.ftso_delegates_of(user_info.address);
    //console.log(ftso_resp);
    //[0] is the addresses, [1] is the delegation % in bips
    let found_index = ftso_resp[0].map((address) => address.toLowerCase()).indexOf(songbird.TRIFORCE_ADDRESS.toLowerCase()); //returns -1 if not found, array[-1] returns undefined
    //10000 bips is 100%
    if (ftso_resp[1][found_index]?.gte(5_000)) {
      let g = await add_achievement(user.id, "triforce-delegator", user_info, interaction.member);
      if (g) {
        given.push(db.ACHIEVEMENTS["triforce-delegator"].name);
        await sleep(2500);
      }
    }
    //coin collector
    let tipbot_address = songbird.get_tipbot_address(user_info.user);
    let sgb_bal = await songbird.get_bal(tipbot_address);
    let flr_bal = await songbird.get_bal(tipbot_address, "flare");
    let generic_bals = await songbird.get_bal_generic_tokens(tipbot_address);
    let token_count = Object.keys(generic_bals).length;
    if (sgb_bal > 0) {
      token_count++;
    }
    if (flr_bal > 0) {
      token_count++;
    }
    if (token_count >= 10) {
      let g = await add_achievement(user.id, "coin-collector", user_info, interaction.member);
      if (g) {
        given.push(db.ACHIEVEMENTS["coin-collector"].name);
        await sleep(2500);
      }
    }
    //
    //check for liquidity provider
    //
    if (given.length === 0) {
      return await interaction.editReply("You were not eligible for any additional manually claimable achievements. Do `/locked_achievements` to see achievements to work towards.");
    } else {
      return await interaction.editReply(`Yay! You got ${given.length} manually claimable achievements: ${given.join(", ")}`);
    }
  } else if (command === "progress_achievements") {
    await interaction.deferReply({ ephemeral: true });
    let achievement_id = (await params.get("achievement_id")).value.toLowerCase().trim();
    if (!Object.keys(db.ACHIEVEMENTS).includes(achievement_id)) {
      //
    }
    //
    let user_info = await db.get_user(user.id);
    if (!user_info) {
      return await interaction.editReply("Please do `/register` first!");
    }
    //
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
  } else if (command === "leaderboard") {
    //currently, achievement leaderboard. in future, maybe new parameter that specifies what kind of leaderboard
    const dresp = await interaction.deferReply();
    let user_count = await db.count_users();
    let max_pages = Math.ceil(user_count / 10);
    async function gen_leaderboard_embed(p, type) {
      let leaderboard_embed = new discord.EmbedBuilder();
      leaderboard_embed.setColor("#d3ed10");
      let sorted_top;
      if (type === "achievements") {
        sorted_top = await ((await db.get_top_achievementeers()).skip(p * 10).limit(10)).toArray();
        leaderboard_embed.setTitle("Achievements Leaderboard");
        leaderboard_embed.setDescription("See the users with the most achievements!");
        if (sorted_top.length > 0) leaderboard_embed.addFields(sorted_top.map((s, i) => ({ value: `<@${s.user}>`, name: `${p * 10 + i + 1}. ${s.length} achievements` })));
      } else if (type === "claims") {
        sorted_top = await ((await db.get_top_claimers()).skip(p * 10).limit(10)).toArray();
        leaderboard_embed.setTitle("Faucet Claimers Leaderboard");
        leaderboard_embed.setDescription("See the users with the most faucet claims!");
        if (sorted_top.length > 0) leaderboard_embed.addFields(sorted_top.map((s, i) => ({ value: `<@${s.user}>`, name: `${p * 10 + i + 1}. ${s.achievement_data.faucet.total} claims` })));
      }
      leaderboard_embed.setFooter({ text: "goodnight, texas" });
      return leaderboard_embed;
    }
    const subcommand = interaction.options.getSubcommand();
    let action_row = new discord.ActionRowBuilder();
    let action_back = new discord.ButtonBuilder()
      .setCustomId("-1")
      .setLabel("Back")
      .setEmoji("⬅️")
      .setDisabled(true)
      .setStyle("Primary");
    let action_front = new discord.ButtonBuilder()
      .setCustomId("1")
      .setLabel("Foward")
      .setEmoji("➡️")
      .setStyle("Primary");
    action_row.addComponents(action_back, action_front);
    //components
    await interaction.editReply({
      embeds: [await gen_leaderboard_embed(0, subcommand)],
      components: [action_row],
    });
    while (true) {
      try {
        //button interaction
        let dresp_bin = await dresp.awaitMessageComponent({ filter: (bin) => bin.user.id === interaction.user.id, time: 60000 });
        await dresp_bin.deferUpdate();
        //update
        let action_row = new discord.ActionRowBuilder();
        let action_back = new discord.ButtonBuilder()
          .setCustomId(String(Number(dresp_bin.customId)-1))
          .setEmoji("⬅️")
          .setDisabled(Number(dresp_bin.customId) === 0)
          .setStyle("Primary");
        let action_front = new discord.ButtonBuilder()
          .setCustomId(String(Number(dresp_bin.customId)+1))
          .setEmoji("➡️")
          .setDisabled(Number(dresp_bin.customId) === max_pages - 1)
          .setStyle("Primary");
        action_row.addComponents(action_back, action_front);
        //dresp_bin.customId will be the page to move to
        await interaction.editReply({
          embeds: [await gen_leaderboard_embed(Number(dresp_bin.customId), subcommand)],
          components: [action_row],
        });
      } catch (e) {
        return;
      }
    }
  } else if (command === "santa") {
    await interaction.deferReply();
    let date = new Date();
    let day = date.getUTCDate();
    let month = date.getUTCMonth();
    if (month === 11 && (day >= 13 && day <= 25)) {
      let user_info = await db.get_user(user.id);
      if (!user_info) {
        return await interaction.editReply("Failed, /register first!");
      }
      const end_timestamp = Math.ceil((new Date(date.getUTCFullYear(), date.getUTCMonth(), day + 1)).getTime() / 1000);
      if (await db.find_santa(user.id, day)) {
        return await interaction.editReply(`Already claimed today!${ day < 25 ? ` Come back in <t:${end_timestamp}:R>` : ""}`);
      }
      let rand = Math.random();
      let amount;
      if (rand <= 0.05) {
        amount = 100;
      } else if (rand <= 0.20) {
        amount = 200;
      } else if (rand <= 0.50) {
        amount = 500;
      } else if (rand <= 0.80) {
        amount = 1000;
      } else if (rand <= 0.95) {
        amount = 3000;
      } else if (rand <= 1) {
        amount = 5000;
      }
      let tx;
      try {
        tx = await songbird.send_astral(user_info.address, amount);
      } catch (e) {
        return await interaction.editReply("Failed to send, try again");
      }
      if (!tx) {
        return await interaction.editReply("Failed to send, try again");
      } else {
        await db.add_santa(user.id, day);
        let santa_embed = new discord.EmbedBuilder();
        santa_embed.setTitle("Merry Christmas! 🎅");
        santa_embed.setColor(["#ff0000", "#00ff00", "#ffffff"][Math.floor(Math.random() * 3)]);
        santa_embed.setDescription(`${amount} XAC sent to your registered address! Ho ho ho.${ day < 25 ? ` Santa will be back with another gift soon: <t:${end_timestamp}:R>` : ""}.\n[View TX](https://songbird-explorer.flare.network/tx/${tx})`);
        if (amount === 100 || amount === 200) {
          santa_embed.setImage("https://raw.githubusercontent.com/Astral-Credits/Astral-Credits-Bot/refs/heads/master/assets_compressed/flosssanta.gif");
        } else if (amount === 500 || amount === 1000) {
          santa_embed.setImage("https://raw.githubusercontent.com/Astral-Credits/Astral-Credits-Bot/refs/heads/master/assets_compressed/djsanta.gif");
        } else if (amount === 3000 || amount === 5000) {
          santa_embed.setImage("https://raw.githubusercontent.com/Astral-Credits/Astral-Credits-Bot/refs/heads/master/assets_compressed/rocketsanta.gif");
        }
        return await interaction.editReply({ embeds: [santa_embed] });
      }
    }
    return await interaction.editReply("Santa's on vacation when it isn't December 13-25");
  }

  //admin command
  await interaction.member.fetch();
  if (ADMINS.includes(user.id) || interaction.member.roles.cache.has("1001004354981077032") || interaction.member.roles.cache.has("1127728118006829136")) {
    if (command === "send") {
      await interaction.deferReply();
      //two optional args: address or discord user, can only choose one
      let amount = Number((await params.get("amount")).value.toFixed(songbird.MAX_DECIMALS));
      if (amount <= 0) {
        return await interaction.editReply("Failed, cannot send 0 or negative XAC.");
      }
      let address = await params.get("address");
      let target = await params.get("target");
      let to_tipbot = await params.get("to_tipbot");
      let tx;
      let receiver;
      let sgb_domain = false;
      let send_embed = new discord.EmbedBuilder();
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
        let user_info = await db.get_user(target.id);
        if (to_tipbot?.value) {
          tx = await songbird.send_astral(songbird.get_tipbot_address(target.id), amount);
          if (!tx) {
            return interaction.editReply("Failed, send error. Perhaps not enough balance?");
          }
          receiver = "<@"+target.id+">";
        } else {
          //get address
          if (!user_info) {
            return await interaction.editReply("Failed, target user has not registered with bot, try address instead?");
          }
          tx = await songbird.send_astral(user_info.address, amount);
          if (!tx) {
            return interaction.editReply("Failed, send error. Perhaps not enough balance?");
          }
          receiver = "<@"+target.id+">";
        }
        //check for gatcha achievements
        //safe to assume people who are getting gatcha payouts are registered, so no need for error message
        if (interaction.channel.id === "1159300901320806451" && user_info) {
          send_embed.setThumbnail("https://fonts.gstatic.com/s/e/notoemoji/latest/1f38a/512.gif");
          await db.increase_gatcha_achievement_info(target.id, amount);
          if (amount >= 7500) {
            let g = await add_achievement(target.id, "gatcha-jackpot", user_info, target.member);
            if (g) await sleep(1000);
          }
          if (user_info.achievement_data.gatcha_wins + 1 == 10) {
            await add_achievement(target.id, "gatcha-wins-1", user_info, target.member);
          } else if (user_info.achievement_data.gatcha_wins + 1 == 25) {
            await add_achievement(target.id, "gatcha-wins-2", user_info, target.member);
          }
          if (user_info.achievement_data.gatcha_won_xac_amount + amount >= 1000) {
            let g1 = await add_achievement(target.id, "gatcha-1", user_info, target.member);
            if (user_info.achievement_data.gatcha_won_xac_amount + amount >= 10000) {
              if (g1) await sleep(1000);
              let g2 = await add_achievement(target.id, "gatcha-2", user_info, target.member);
              if (user_info.achievement_data.gatcha_won_xac_amount + amount >= 50000) {
                if (g2) await sleep(1000);
                await add_achievement(target.id, "gatcha-3", user_info, target.member);
              }
            }
          }
        }
      } else {
        return await interaction.editReply("Failed, neither address or target to send to was specified.");
      }
      //Successfully sent, now send embed
      send_embed.setTitle("Successfully Sent!");
      send_embed.setColor("#0940e5");
      send_embed.setDescription(`${String(amount)} XAC sent to ${receiver}${ to_tipbot?.value ? " (sent to tipbot wallet)" : ""}${ sgb_domain ? ` (${sgb_domain})` : "" }. [View tx](https://songbird-explorer.flare.network/tx/${tx}).`);
      send_embed.setFooter({ text: "Made by prussia.dev" });
      return await interaction.editReply({ embeds: [send_embed] });
    } else if (command === "change_register") {
      await interaction.deferReply();
      let address = (await params.get("address")).value.trim().toLowerCase();
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
      let a_change = await db.register_user(target.id, address, true);
      if (!a_change) {
        let already_r_user = await db.get_user_by_address(address);
        return await interaction.editReply(`Failed to change user's address${ already_r_user ? `, likely because someone else already registered with that address (<@${already_r_user.user}>)` : ", contact Prussia" }.`);
      }
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
      let tipbot_address = songbird.get_tipbot_address(target.id);
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
    } else if (command === "reverse_lookup") {
      await interaction.deferReply({ ephemeral: true });
      let address = (await params.get("address")).value.trim().toLowerCase();
      let user_info = await db.get_user_by_address(address);
      if (user_info) {
        return await interaction.editReply(`User <@${user_info.user}> is currently registered with that address.`);
      } else {
        return await interaction.editReply("No registered user found with that address.");
      }
    } else if (command === "export_domains") {
      await interaction.deferReply();
      let all_domains = await db.get_all_domains();
      const domains_attachment = new discord.AttachmentBuilder(Buffer.from(JSON.stringify(all_domains)), { name: "domains_airdrop.json" });
      return await interaction.editReply({ files: [ domains_attachment ] });
    } else if (command === "registered_count") {
      await interaction.deferReply();
      let registered_count = await db.count_users();
      return await interaction.editReply(`${registered_count} registered with bot (including banned, left, etc).`);
    } else if (command === "admin_balance") {
      await interaction.deferReply({ ephemeral: true });
      let sgb_bal = await songbird.get_bal(songbird.admin_address);
      let astral_bal = await songbird.get_bal_astral(songbird.admin_address);
      let bal_embed = new discord.EmbedBuilder();
      bal_embed.setColor("#7ad831");
      bal_embed.setTitle("View Admin Balance");
      bal_embed.setDescription("Balance for the admin tipping wallet.");
      bal_embed.addFields([
        {
          name: "Songbird (sgb)",
          //truncate if more than 5 decimals
          value: String(String(sgb_bal).split(".")[1]?.length > 5 ? sgb_bal.toFixed(5) : sgb_bal)+" <:SGB:1130360963636408350>",
        },
        {
          name: "Astral Credits (xac)",
          value: String(String(astral_bal).split(".")[1]?.length > 5 ? astral_bal.toFixed(5) : astral_bal)+" <:XAC:1228104930464895106>",
        },
      ]);
      bal_embed.setURL("https://songbird-explorer.flare.network/address/"+songbird.admin_address);
      return await interaction.editReply({ embeds: [bal_embed] });
    }
  }
});

client.on("interactionCreate", async interaction => {
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
        .setStyle("Primary");
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
    //make sure they aren't claiming too soon
    let db_result = await db.find_claim(address);
    if (db_result) {
      //special exception for first day of month
      if (Number(db_result.last_claim) + CLAIM_FREQ > Date.now() && Number(db_result.last_claim) > db.get_month_start_timestamp(db.get_month())) {
        return await interaction.editReply(`<@${user.id}> Error, your last claim was too soon! Run \`/next_claim\` to see when your next claim will be.`);
      }
    }
    //last few claims (only last is needed, but just in case) in the month will write the claim time to db,
    //show bot knows when the previous month claims ended, for faucet streaks
    //todo: I think this will insert multiple (unintended)... but should only be a few minutes off so whatever
    if (claims_month > MAX_CLAIMS_PER_MONTH - 4) {
      await db.set_month_end();
    }
    //songbird enough balance
    let current_block = await songbird.get_block_number();
    let enough_balance = await songbird.enough_balance(address, HOLDING_REQUIREMENT);
    //those bastards changed start_block to startblock
    let token_tx_resp = await fetch(`https://songbird-explorer.flare.network/api?module=account&action=tokentx&address=${address}&startblock=${String(current_block-songbird.HOLDING_BLOCK_TIME)}`);
    token_tx_resp = await token_tx_resp.json();
    let aged_enough = await songbird.aged_enough(address, HOLDING_REQUIREMENT, token_tx_resp, enough_balance.wrapped_sgb_bal);
    //let aged_enough = true;
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
    let send_amount = db.get_amount();
    //disabling
    if (token_tx_resp.result) {
      for (const t of token_tx_resp.result) {
        //If they got a faucet claim transaction in the last 23.5 hours it means it is too soon for them to claim again
        //(this shouldn't be needed but is an additional safeguard in case the db check fails somehow, and is also an attempt to prevent the two device "race condition" problem)
        //special exception for first day of month
        if (t.from.toLowerCase() === songbird.faucet_address.toLowerCase() && Number(t.timeStamp) > (Math.round((Date.now() - db.CLAIM_FREQ) / 1000)) && t.value === songbird.to_raw(String(send_amount), 18).toString() && t.contractAddress.toLowerCase() === songbird.SUPPORTED_INFO.xac.token_address.toLowerCase() && Number(db_result.last_claim) > db.get_month_start_timestamp(db.get_month())) {
          return await interaction.editReply(`<@${user.id}> Error, your last claim was too soon! Run \`/next_claim\` to see when your next claim will be. Contact an admin if this doesn't seem right.`);
        }
      }
    }
    //send XAC, check for send error
    let tx = await songbird.faucet_send_astral(user_info.address, send_amount);
    if (!tx) {
      return await interaction.editReply(`<@${user.id}> Error, send failed! Probably gas issue, too many claims at once or faucet is out of funds. Try again in a few minutes.`);
    }
    //add to db
    await db.add_claim(user_info.address, send_amount);
    //update streak
    await db.add_claim_achievement_info(user.id, user_info, db_result?.last_claim);
    //update month claim count if last 3 claims or last two hours of the month
    let claims_month_now = await db.get_claims_this_month();
    if (claims_month_now > MAX_CLAIMS_PER_MONTH - 4 || Date.now() > db.get_next_month_timestamp() - 2 * 60 * 60 * 1000) {
      await db.set_month_claim_count(claims_month_now);
    }
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
    await interaction.editReply({ embeds: [faucet_embed] });
    //get updated user_info (current streak may increment by 1, or reset to 1)
    user_info = await db.get_user(user.id);
    //add_achievement does nothing if achievement already achieved
    let user_cs = user_info.achievement_data.faucet.current_streak;
    if (user_cs >= 2) {
      let g1 = await add_achievement(user.id, "faucet-2", user_info, interaction.member);
      if (user_cs >= 10) {
        if (g1) await sleep(1500); //give time for nonce to increment (shouldn't there be a way to tell ethersjs to use nonce + 1...)
        let g2 = await add_achievement(user.id, "faucet-10", user_info, interaction.member);
        if (user_cs >= 30) {
          if (g2) await sleep(1500);
          let g3 = await add_achievement(user.id, "faucet-30", user_info, interaction.member);
          if (user_cs >= 50) {
            if (g3) await sleep(1500);
            //no sleep after this because not possible to get both faucet-50 and faucet-100, etc at same time
            await add_achievement(user.id, "faucet-50", user_info, interaction.member);
            if (user_cs >= 100) {
              await add_achievement(user.id, "faucet-100", user_info, interaction.member);
              if (user_cs >= 365) {
                await add_achievement(user.id, "faucet-365", user_info, interaction.member);
              }
            }
          }
        }
      }
    }
    let user_tc = user_info.achievement_data.faucet.total;
    if (user_tc >= 250) {
      let g1 = await add_achievement(user.id, "claims-250", user_info, interaction.member);
      if (user_tc >= 500) {
        if (g1) await sleep(1500); //give time for nonce to increment (shouldn't there be a way to tell ethersjs to use nonce + 1...)
        await add_achievement(user.id, "claims-500", user_info, interaction.member);
      }
    }
    return;
  } else if (customId.startsWith("cfpvpbtn-")) {
    async function disable_button_cfpvp() {
      //also change the colour of the embed
      try {
        let pvp_embed = interaction.message.embeds[0];
        pvp_embed = discord.EmbedBuilder.from(pvp_embed).setColor("#e07c35");
        let bet_button = new discord.ButtonBuilder()
          .setCustomId("cfpvpbtn-"+interaction.id)
          .setLabel("Bet!")
          .setDisabled(true)
          .setStyle("Primary");
        let action_row = new discord.ActionRowBuilder();
        action_row.addComponents(bet_button);
        await interaction.channel.fetch();
        await interaction.message.edit({ embeds: [pvp_embed], components: [action_row] });
      } catch (e) {
        console.log(e);
      }
    }
    await interaction.deferReply({ ephemeral: true });
    //get bet info
    let bet_id = customId.split("-")[1];
    let coinflip_info = await db.get_coinflip_pvp(bet_id);
    if (coinflip_info.player1.player_id === user.id && coinflip_info.player1.random) {
      return await interaction.editReply("You have already submitted your random input.");
    }
    //if player 2, make sure player 2 doesn't exist yet
    if (coinflip_info.player1.player_id !== user.id && coinflip_info.player2) {
      return await interaction.editReply("There are already two players in this game, so you cannot join. Sorry! You can start your own coinflip game, or wait for someone else to start one.");
    }
    //check balance of both players, cancel if either doesn't have enough. not very DRY but whatever I don't care right now, is just draft
    let player1_address = songbird.get_tipbot_address(coinflip_info.player1.player_id);
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
      let player2_address = songbird.get_tipbot_address(coinflip_info.player2.player_id);
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
      let player2_address = songbird.get_tipbot_address(user.id);
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
    await interaction.editReply("Joining bet...");
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
      //In very rare cases, with both users clicking at the same time, insert_result check will pass since two randoms are being added (as intended),
      //and the check above making sure both randoms exist will pass (if both players add their randoms milliseconds apart from each other, both will query the db and see that both randoms exist),
      //the game will be played twice (although with the same randoms, so the same results)
      //this should prevent that (apologies to future self if this comment is hard to understand)
      const fin_result = await db.mark_coinflip_pvp_finished(bet_id);
      if (fin_result?.modifiedCount !== 1) {
        //game already marked as finished
        return;
      }
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
      let playerwin_address = songbird.get_tipbot_address(winner.id);
      let playerwin_sgb_bal = await songbird.get_bal(playerwin_address);
      if (playerwin_sgb_bal < MIN_SGB) {
        return await interaction.followUp(`<@${winner.id}> seemingly withdrew/sent too much SGB after submitting bet, the bet has been cancelled.`);
      }
      let playerwin_astral_bal = await songbird.get_bal_astral(playerwin_address);
      if (playerwin_astral_bal < coinflip_info.wager) {
        return await interaction.followUp(`<@${winner.id}> seemingly withdrew/sent too much XAC after submitting bet, the bet has been cancelled.`);
      }
      //send tx
      let _success, tx;
      try {
        [_success, tx] = await songbird.user_withdraw_astral(loser.id, playerwin_address, coinflip_info.wager);
      } catch (e) {
        console.log(e);
        return await interaction.followUp(`<@${winner.id}> won, but send from <@${loser.id}> to the winner failed for some reason. This shouldn't happen. Contact admin.`);
      }
      //const attachment = new discord.AttachmentBuilder("https://cdn.discordapp.com/attachments/1087903395962179646/1155719287844126771/Spin.gif", { name: "spin.gif" });
      let followMessage = await interaction.followUp({ content: "The coin is being flipped...\nhttps://cdn.discordapp.com/attachments/1087903395962179646/1155719287844126771/Spin.gif" });
      await sleep(3500);
      let winner_info = await db.get_user(winner.id);
      //they may not be registered, we can't assume they are
      if (winner_info) {
        await db.increment_coinflip_wins_achievement_info(winner.id);
        switch (winner_info.achievement_data.coinflip.wins + 1) {
          case 1:
            add_achievement(winner.id, "coinflip-1", winner_info, interaction.member);
            break;
          case 10:
            add_achievement(winner.id, "coinflip-2", winner_info, interaction.member);
            break;
          case 50:
            add_achievement(winner.id, "coinflip-3", winner_info, interaction.member);
            break;
          default:
            break;
        }
      } else {
        //todo: send message telling them they are unregistered?
        //
      }
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
      coinflip_result_embed.setFooter({ text: "Learn how to prove these results by running `/provably_fair_pvp`" });
      let winner_user = client.users.cache.get(winner.id);
      if (winner_user) coinflip_result_embed.setAuthor({ name: winner_user.username, iconURL: winner_user.displayAvatarURL() });
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
          .setStyle("Primary");
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
    let player_address = songbird.get_tipbot_address(coinflip_info.player_id);
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
    let house_address = songbird.get_tipbot_address(0);
    if (await songbird.get_bal(house_address) < MIN_SGB) {
      return await interaction.editReply("House does not have enough SGB to pay for fees.");
    } else if (await songbird.get_bal_astral(house_address) < 5000 + coinflip_info.wager) {
      return await interaction.editReply("House does not have enough XAC to play (house needs wager + 5k).");
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
    let _success, tx;
    try {
      if (won) {
        [_success, tx] = await songbird.user_withdraw_astral(0, player_address, coinflip_info.wager);
      } else {
        [_success, tx] = await songbird.user_withdraw_astral(coinflip_info.player_id, house_address, coinflip_info.wager);
      }
    } catch (e) {
      console.log(e);
      return await interaction.followUp(`${ won ? "The player" : "The house" } won, but send from the loser (${ won ? "the player" : "the house" }) to the winner failed for some reason. This shouldn't happen. Contact admin.`);
    }
    //const attachment = new discord.AttachmentBuilder("https://cdn.discordapp.com/attachments/1087903395962179646/1166130952255324220/Flip.gif", { name: "flip.gif" });
    let followMessage = await interaction.followUp({ content: "The coin is being flipped...\nhttps://cdn.discordapp.com/attachments/1087903395962179646/1166130952255324220/Flip.gif" });
    await sleep(3500);
    //send result: winner, players, each player's random input, reveal server nonce, tx
    let coinflip_result_embed = new discord.EmbedBuilder();
    coinflip_result_embed.setTitle("A coin has been flipped...");
    coinflip_result_embed.setColor("#e07c35");
    coinflip_result_embed.setDescription(`**It's ${result.toUpperCase()}!
**\n**${ won ? `<@${coinflip_info.player_id}> won ${coinflip_info.wager} XAC in a bet against the house!` : `<@${coinflip_info.player_id}> lost ${coinflip_info.wager} XAC in a bet against the house!` }** [View TX](https://songbird-explorer.flare.network/tx/${tx.hash}).\n\nHeads wins when the flip result is greater than or equal to 0.5, and Tails wins when the flip result is less than 0.5.`);
    if (won) {
      let winner_info = await db.get_user(user.id);
      db.increment_coinflip_wins_achievement_info(user.id);
      switch (winner_info.achievement_data.coinflip.wins + 1) {
        case 1:
          add_achievement(user.id, "coinflip-1", winner_info, interaction.member);
          break;
        case 10:
          add_achievement(user.id, "coinflip-2", winner_info, interaction.member);
          break;
        case 50:
          add_achievement(user.id, "coinflip-3", winner_info, interaction.member);
          break;
        default:
          break;
      }
    }
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

module.exports = {
  client,
  add_achievement,
  //ADMINS,
  TEAM,
};
