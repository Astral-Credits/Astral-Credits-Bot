const QRCode = require("qrcode");

const discord = require("discord.js");

const db = require("./db.js");
const songbird = require("./songbird.js");
const { add_achievement, TEAM } = require("./bot.js");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let price_cache = [];
songbird.get_all_prices().then((p) => price_cache = p);

const ASTRAL_GUILD = "1000985457393422367";

const tipbot_client = new discord.Client({
  intents: [discord.GatewayIntentBits.Guilds, discord.GatewayIntentBits.GuildMembers, discord.GatewayIntentBits.GuildMessages]
});

tipbot_client.once("ready", async (info) => {
  console.log('Ready! as ' + info.user.tag);
  tipbot_client.user.setPresence({
    activities: [
      {
        name: "astralcredits.xyz",
        type: 3,
      }
    ],
    status: "online",
  });
  setInterval(async () => {
    price_cache = await songbird.get_all_prices();
  }, 15 * 60 * 1000);
});

async function xac_tip_achievement_handle(user, user_info, interaction) {
  await db.increment_xac_tips_achievement_info(user.id);
  //check for achievements
  switch (user_info.achievement_data.tips.xac_amount+1) {
    case 1:
      add_achievement(user.id, "tipper-1", user_info, interaction.member);
      break;
    case 10:
      add_achievement(user.id, "tipper-2", user_info, interaction.member);
      break;
    case 25:
      add_achievement(user.id, "tipper-3", user_info, interaction.member);
      break;
    case 100:
      add_achievement(user.id, "tipper-4", user_info, interaction.member);
      break;
    case 200:
      add_achievement(user.id, "tipper-5", user_info, interaction.member);
      break;
    case 300:
      add_achievement(user.id, "tipper-6", user_info, interaction.member);
      break;
    default:
      //nothing
  }
}

const get_price_to_tenths = (currency, amount) => price_cache[currency] ? Math.floor((price_cache[currency].usd * amount) * (10 ** 3)) : 0;

function update_tip_stats_wrapper(interaction, user, user_info, formal_type, currency, amount) {
  db.update_tip_stats(user.id, formal_type, currency, amount, get_price_to_tenths(currency, amount)).then(async () => {
    //not tip in xac guild and 
    if (interaction.guildId !== ASTRAL_GUILD && !user_info) {
      const tip_stats = await db.get_tip_stats(user.id);
      //if this is the 3rd tip
      if (Object.values(tip_stats.type_count).reduce((a, c) => a + c) === 3 && !tip_stats.received_welcome_tip) {
        //send 1000 xac
        const welcome_gift = 1000;
        const tx = await songbird.send_astral(songbird.get_tipbot_address(user.id), welcome_gift);
        await db.received_welcome_tip(user.id);
        //send message
        let welcome_embed = new discord.EmbedBuilder();
        welcome_embed.setTitle("Successfully Sent! 🎁");
        welcome_embed.setURL(`https://songbird-explorer.flare.network/tx/${tx}`);
        welcome_embed.setColor("#003153"); //prussian blue
        welcome_embed.setDescription(`Welcome gift of ${songbird.SUPPORTED_INFO.xac.emoji} ${welcome_gift} XAC sent to <@${user.id}>`);
        await interaction.followUp({ content: `Thank you for using Mr.Tipbot. Here is ${songbird.SUPPORTED_INFO.xac.emoji} ${welcome_gift} XAC on the house!\nYou can earn XAC from the faucet FREE, play games and MORE!\nhttps://discord.gg/M2HSCeEsyp`, embeds: [welcome_embed], ephemeral: true });
        let astral_guild = tipbot_client.guilds.cache.get(ASTRAL_GUILD);
        await astral_guild.channels.fetch();
        await astral_guild.channels.cache.get("1087903395962179646").send(`<@${user.id}> received welcome gift. [View Tx](https://songbird-explorer.flare.network/tx/${tx})`);
      }
    }
  });
}

//automatically grants achievements on xac server only
//if no_send is true, doesn't send any message, lets caller handle. returns tx.
async function send_tip(interaction, user, target_id, amount, currency, formal_type, type="", no_send_message=false) {
  const supported_info = songbird.SUPPORTED_INFO[currency];
  let target_address = songbird.get_tipbot_address(target_id);
  //send
  let success, send;
  try {
    if (currency === "sgb" || currency === "flr") {
      [success, send] = await songbird.user_withdraw_native(user.id, target_address, amount, currency === "sgb" ? "songbird" : "flare");
    } else {
      [success, send] = await songbird.user_withdraw_generic_token(user.id, target_address, amount, currency);
    }
  } catch (e) {
    //shouldn't happen
    console.log(e);
    await interaction.editReply("Uh oh! This shouldn't happen - encountered an unexpected error.");
    return;
  }
  if (!success) {
    //todo: figure out why send failed (eg lack of gas or nonce error or not enough balance)
    return await interaction.editReply(`Send failed - common reasons why are because you are withdrawing more than your balance, or **don't have enough ${songbird.full_to_abbr(supported_info.chain)} to pay for gas**. You may also be sending tips too fast.`);
  }
  await interaction.editReply(`Sending tip${type}...\nTx: <https://${supported_info.chain}-explorer.flare.network/tx/${send.hash}>`);
  try {
    let receipt = await send.wait();
    if (!receipt || receipt?.status === 0) {
      await interaction.editReply(`Transaction may have failed? Check the block explorer.\nTx: <https://${supported_info.chain}-explorer.flare.network/tx/${send.hash}>`);
      return;
    } else {
      let user_info = await db.get_user(user.id);
      if (currency === "xac" && amount >= db.MIN_ACHIEVEMENT_TIP && interaction.guildId === ASTRAL_GUILD) {
        if (user_info) {
          await xac_tip_achievement_handle(user, user_info, interaction);
          //
        }
      }
      db.get_user_settings(target_id).then(async (s) => {
        if (s.tip_notify_dm) {
          let above_min = false;
          if (price_cache[currency]) {
            above_min = get_price_to_tenths(currency, amount) >= s.tip_notify_dm_min;
          } else if (s.tip_notify_dm_min === 0) {
            above_min = true;
          }
          if (above_min) {
            try {
              tipbot_client.users.cache.get(target_id)?.send(`<@${user.id}> sent ${supported_info.emoji} ${String(amount)} ${currency.toUpperCase()} to you in ${(await interaction.fetchReply()).url}!\n[View tx](<https://${supported_info.chain}-explorer.flare.network/tx/${send.hash}>)`);
            } catch (e) {
              //
            }
          }
        }
      });
      //also gives out welcome gifts
      update_tip_stats_wrapper(interaction, user, user_info, formal_type, currency, amount);
      if (no_send_message) {
        return send.hash;
      }
      await interaction.editReply(`<@${user.id}> sent ${supported_info.emoji} ${String(amount)} ${currency.toUpperCase()} to <@${target_id}>!\n[View tx](<https://${supported_info.chain}-explorer.flare.network/tx/${send.hash}>)`);
      return;
    }
  } catch (e) {
    console.log(e);
    await interaction.editReply(`Transaction may have failed? Check the block explorer.\nTx: <https://${supported_info.chain}-explorer.flare.network/tx/${send.hash}>`);
    return;
  }
}

//let caller handle success messages
async function send_multitip(interaction, user, target_ids, split_amount, currency, formal_type, type="") {
  const supported_info = songbird.SUPPORTED_INFO[currency];
  let target_addresses = target_ids.map((target_id) => songbird.get_tipbot_address(target_id));
  target_addresses = await Promise.all(target_addresses);
  let send;
  try {
    send = await songbird.user_multisend(user.id, target_addresses, split_amount, currency)
  } catch (e) {
    //shouldn't happen
    console.log(e);
    await interaction.editReply("Uh oh! This shouldn't happen - encountered an unexpected error.");
    return;
  }
  if (!send) {
    await interaction.editReply(`Send failed - common reasons why are because you are withdrawing more than your balance, or **don't have enough ${songbird.full_to_abbr(supported_info.chain)} to pay for gas**. You may also be sending tips too fast.`);
    return;
  }
  await interaction.editReply(`Sending tip${type}...\nTx: <https://${supported_info.chain}-explorer.flare.network/tx/${send.hash}>`);
  try {
    let receipt = await send.wait();
    if (!receipt || receipt?.status === 0) {
      await interaction.editReply(`Transaction may have failed? Check the block explorer.\nTx: <https://${supported_info.chain}-explorer.flare.network/tx/${send.hash}>`);
      return;
    } else {
      let user_info = await db.get_user(user.id);
      if (currency === "xac" && split_amount >= db.MIN_ACHIEVEMENT_TIP && interaction.guildId === ASTRAL_GUILD) {
        if (user_info) {
          await xac_tip_achievement_handle(user, user_info, interaction);
          //
        }
      }
      db.bulk_get_user_settings(target_ids).then(async (s_all) => {
        const { amount_each_string } = songbird.calc_amount_each(split_amount, target_ids.length, supported_info);
        for (const s of Object.values(s_all)) {
          if (s.tip_notify_dm) {
            let above_min = false;
            if (price_cache[currency]) {
              above_min = get_price_to_tenths(currency, Number(amount_each_string)) >= s.tip_notify_dm_min;
            } else if (s.tip_notify_dm_min === 0) {
              above_min = true;
            }
            if (above_min) {
              try {
                tipbot_client.users.cache.get(s.user)?.send(`<@${user.id}> sent ${supported_info.emoji} ${String(amount_each_string)} ${currency.toUpperCase()} to you in ${(await interaction.fetchReply()).url}!\n[View tx](<https://${supported_info.chain}-explorer.flare.network/tx/${send.hash}>)`);
              } catch (e) {
                //
              }
            }
          }
        }
      });
      //also gives out welcome gifts
      update_tip_stats_wrapper(interaction, user, user_info, formal_type, currency, split_amount);
      return send.hash;
    }
  } catch (e) {
    console.log(e);
    await interaction.editReply(`Transaction may have failed? Check the block explorer.\nTx: <https://${supported_info.chain}-explorer.flare.network/tx/${send.hash}>`);
    return;
  }
}

tipbot_client.on("interactionCreate", async interaction => {
  let command = interaction.commandName;
  let params = interaction.options;
  let user = interaction.user;

  //autocomplete
  if (interaction.isAutocomplete()) {
    if (command === "tip" || command === "withdraw" || command === "active_tip" || command === "role_tip" || command === "role_rain" || command === "active_rain" || command === "supported" || command === "info" || command === "airdrop") {
      const focused_option = interaction.options.getFocused(true);
      if (focused_option.name === "currency") {
        return await interaction.respond(songbird.SUPPORTED.filter((c) => c.startsWith(focused_option.value.toLowerCase())).sort().map((c) => ({ name: c, value: c })));
      } else if (focused_option.name === "chain") {
        return await interaction.respond(Object.keys(songbird.SUPPORTED_CHAINS).filter((c) => c.startsWith(focused_option.value.toLowerCase())).map((c) => ({ name: c, value: c })));
      } else {
        return;
      }
    }
    return;
  }

  if (command === "help") {
    let help_embed = new discord.EmbedBuilder();
    help_embed.setTitle("Help");
    help_embed.setColor("#08338e");
    help_embed.setDescription("Your friendly tipping companion for all tokens on the FLARE & SONGBIRD networks! Made by the [Astral Credits Team](https://astralcredits.xyz)!\nWhilst custodial in nature, all txns occur on-chain and each user has their own unique address.");
    help_embed.addFields([
      {
        name: "/help",
        value: "Get a list of commands"
      },
      {
        name: "/deposit",
        value: "Deposit to your tipbot address"
      },
      {
        name: "/balance",
        value: "See the balance of your tipbot address"
      },
      {
        name: "/withdraw",
        value: "Withdraw your tipbot balance to an address or .sgb/.flr domain"
      },
      {
        name: "/settings",
        value: "View or change your tipbot settings (uses subcommands)"
      },
      {
        name: "/tip",
        value: "Tip another user some coins/tokens from your tipbot balance"
      },
      {
        name: "/active_tip",
        value: "Tip a random recently active user (same channel, last 24 hours) some coins/tokens from your tipbot balance"
      },
      {
        name: "/role_tip",
        value: "Tip a random user with a certain role some coin/token from your tipbot balance"
      },
      {
        name: "/active_rain",
        value: "Tip multiple random recently active users some coins/tokens from your tipbot balance"
      },
      {
        name: "/role_rain",
        value: "Tip multiple random users with a certain role some coin/token from your tipbot balance"
      },
      {
        name: "/airdrop",
        value: "Airdrop tokens to users in the channel who click"
      },
      {
        name: "/prices",
        value: "Get the prices of supported currencies from coingecko"
      },
      {
        name: "/supported",
        value: "See all currencies supported by the bot"
      },
      {
        name: "/info",
        value: "Get basic information about supported currencies"
      },
    ]);
    help_embed.setFooter({ text: ["Programmed by prussia.dev", "247 nishina", "落下 落花"][Math.floor(Math.random() * 3)] });
    return await interaction.reply({ embeds: [ help_embed ], ephemeral: true });
  } else if (command === "deposit") {
    await interaction.deferReply({ ephemeral: true });
    let user_address = songbird.get_tipbot_address(user.id);
    let deposit_embed = new discord.EmbedBuilder();
    deposit_embed.setColor("#1dd3f7");
    deposit_embed.setTitle("Deposit");
    deposit_embed.setDescription(
      `Deposit Address:\n\`${user_address}\`\n\nThis is your deposit address for Mr. Tipbot. Please only deposit FLR, SGB and other supported tokens (Use the \`/supported\` command to get a list of supported tokens!). Also please ensure you have enough FLR/SGB to pay for gas fees when sending tips or making withdrawals.\n\n**DISCLAIMER:** Mr.Tipbot by Astral Credits is experimental software and a custodial service. Remember - **Not your keys, not your coins!** It's creators shall not be held liable for any loss of funds as a result of your use of this service. Please proceed at your own risk.\n[Terms of Service](https://www.astralcredits.xyz/docs/Terms-of-Service-Tipbot.pdf)`
    );
    let data_buffer = await QRCode.toBuffer(user_address);
    const attachment = new discord.AttachmentBuilder(data_buffer, { name: "deposit_qr_code.png" });
    deposit_embed.setImage(`attachment://deposit_qr_code.png`);
    deposit_embed.setFooter({ text: "Scan QR code to copy address" });
    let user_info = await db.get_user(user.id);
    if (!user_info && interaction.guildId === ASTRAL_GUILD) {
      return interaction.editReply({ embeds: [deposit_embed], content: user_address+"\nUnrelated, but looks like you are not registered with the bot! You should `/register` in order to use the faucet.", files: [attachment] });
    } else {
      return interaction.editReply({ embeds: [deposit_embed], content: user_address, files: [attachment] });
    }
  } else if (command === "supported") {
    let chain = (await params.get("chain")).value.toLowerCase().trim();
    if (!Object.keys(songbird.SUPPORTED_CHAINS).includes(chain)) {
      return await interaction.reply(`Supported chains are: ${Object.keys(songbird.SUPPORTED_CHAINS).join(", ")}`);
    }
    let embeds = [];
    const supported_on_chain = songbird.SUPPORTED.filter((c) => songbird.SUPPORTED_INFO[c].chain === chain);
    //25 fields max per embed
    for (let i=0; i < Math.ceil(supported_on_chain.length / 25); i++) {
      let supported_embed = new discord.EmbedBuilder();
      supported_embed.setColor(songbird.SUPPORTED_CHAINS[chain].color); //"#0bb3dd")
      if (i === 0) {
        supported_embed.setTitle(`Supported Currencies (${chain})`);
        supported_embed.setDescription("These are the supported currencies of the tipbot:");
      } else {
        supported_embed.setTitle(`Supported Currencies (${chain}, cont.)`);
      }
      supported_embed.addFields(supported_on_chain.slice(i * 25, i * 25 + 25).map((c) => ({ name: songbird.SUPPORTED_INFO[c].name, value: `${songbird.SUPPORTED_INFO[c].emoji} ${c}` })));
      supported_embed.setFooter({ text: "Interested in adding your token to Mr.Tipbot? Visit: astralcredits.xyz/tipbot" });
      embeds.push(supported_embed);
    }
    return await interaction.reply({ embeds, ephemeral: true });
  } else if (command === "info") {
    let info_currency = (await params.get("currency")).value.toLowerCase().trim();
    if (!songbird.SUPPORTED.includes(info_currency)) return await interaction.reply({ content: "Currency must be one of the following: "+songbird.SUPPORTED.join(", "), ephemeral: true });
    let ci = songbird.SUPPORTED_INFO[info_currency];
    let info_embed = new discord.EmbedBuilder();
    let astral_guild = tipbot_client.guilds.cache.get(ASTRAL_GUILD);
    info_embed.setTitle("Token Details");
    info_embed.setThumbnail((await astral_guild.emojis.fetch(ci.emoji.split(":")[2].slice(0, -1))).toJSON().imageURL);
    let sci = songbird.SUPPORTED_CHAINS[ci.chain];
    let description = `**Name:** ${ci.name}\n**Symbol:** ${ci.id.toUpperCase()}\n**Network:** ${sci.full_name}`;
    if (info_currency === "flr" || info_currency === "sgb") {
      description += ` (Native Token)\n**RPC:** \`${sci.rpc}\`\n**Chain ID:** ${sci.chain_id}`;
    } else {
      description += `\n**Address:** \`${ci.token_address}\`\n**Decimals:** ${ ci.decimal_places ?? 18 }`;
    }
    if (ci.coingecko) {
      description += `\n**Price:** [$${price_cache[info_currency].usd}](https://coingecko.com/coins/${ci.coingecko})`;
    }
    if (ci.website) {
      description += `\n${ci.website}`;
    }
    info_embed.setDescription(description);
    return await interaction.reply({ embeds: [info_embed], ephemeral: true });
  } else if (command === "balance") {
    function bal_embed_furnish(bal_embed, usd_value, first_page=false, sgb_bal=0, flr_bal=0, astral_bal=0) {
      bal_embed.setColor("#7ad831");
      bal_embed.setTitle("View Balance");
      bal_embed.setDescription(`This is your current balance with Mr.Tipbot. As this is a custodial service, we recommend you do not keep large amounts of funds here.\nView on Explorer: [Songbird](https://songbird-explorer.flare.network/address/${user_address}) | [Flare](https://flare-explorer.flare.network/address/${user_address})\nEstimated value of balances: $${usd_value} USD`);
      bal_embed.setFooter({ text: "An Astral Credits Project - https://www.astralcredits.xyz" });
      if (first_page) {
        bal_embed.addFields([
          {
            name: "Songbird (sgb)",
            //truncate if more than 5 decimals
            value: String(String(sgb_bal).split(".")[1]?.length > 5 ? sgb_bal.toFixed(5) : sgb_bal)+" "+songbird.SUPPORTED_INFO.sgb.emoji + (price_cache.sgb ? ` (≈$${(sgb_bal * price_cache.sgb.usd).toFixed(2)} USD)` : ""),
            inline: true,
          },
          {
            name: "Flare (flr)",
            //truncate if more than 5 decimals
            value: String(String(flr_bal).split(".")[1]?.length > 5 ? flr_bal.toFixed(5) : flr_bal)+" "+songbird.SUPPORTED_INFO.flr.emoji + (price_cache.flr ? ` (≈$${(flr_bal * price_cache.flr.usd).toFixed(2)} USD)` : ""),
            inline: true,
          },
          {
            name: "Astral Credits (xac)",
            value: String(String(astral_bal).split(".")[1]?.length > 5 ? astral_bal.toFixed(5) : astral_bal)+" "+songbird.SUPPORTED_INFO.xac.emoji + (price_cache.xac ? ` (≈$${(astral_bal * price_cache.xac.usd).toFixed(2)} USD)` : ""),
            inline: true,
          },
        ]);
      }
      //bal_embed.setURL("https://songbird-explorer.flare.network/address/"+user_address);
      return bal_embed;
    }
    const dresp = await interaction.deferReply({ ephemeral: true });
    let user_address = songbird.get_tipbot_address(user.id);
    let sgb_bal = await songbird.get_bal(user_address);
    let flr_bal = await songbird.get_bal(user_address, "flare");
    let astral_bal = await songbird.get_bal_astral(user_address);
    let generic_bals = await songbird.get_bal_generic_tokens(user_address);
    delete generic_bals.xac;
    //calculate value of balances
    const n_bals = { ...generic_bals, xac: astral_bal, flr: flr_bal, sgb: sgb_bal };
    let usd_value = 0;
    for (const c of Object.keys(price_cache)) {
      if (n_bals[c]) {
        usd_value += n_bals[c] * price_cache[c].usd;
      }
    }
    usd_value = usd_value.toFixed(2);
    const g_num = Object.keys(generic_bals).length;
    if (g_num > 25 - 3) {
      //untested
      const max_pages = Math.ceil(g_num / 10);
      let bal_embeds = [];
      for (let i=0; i < max_pages; i++) {
        let bal_embed = bal_embed_furnish(new discord.EmbedBuilder(), usd_value, i === 0, sgb_bal, flr_bal, astral_bal);
        bal_embed.addFields(Object.keys(generic_bals).map((c) => (
          {
            name: `${songbird.SUPPORTED_INFO[c].name} (${songbird.SUPPORTED_INFO[c].id})`,
            value: String(String(generic_bals[c]).split(".")[1]?.length > 5 ? generic_bals[c].toFixed(5) : generic_bals[c])+" "+songbird.SUPPORTED_INFO[c].emoji + (price_cache[c] ? ` (≈$${(generic_bals[c] * price_cache[c].usd).toFixed(2)} USD)` : ""),
            inline: true,
          }
        )));
        bal_embeds.push(bal_embed);
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
      let initial_embeds = [bal_embeds[0]];
      if (usd_value > 25) {
        let warning_embed = new discord.EmbedBuilder();
        warning_embed.setColor("#ff0000");
        warning_embed.setTitle("⚠️ WARNING - High balance detected!");
        warning_embed.setDescription("Your balance exceeds $25 USD. It is strongly recommend that you withdraw funds to your self custody wallet immediately!");
        initial_embeds.push(warning_embed);
      }
      await interaction.editReply({
        embeds: initial_embeds,
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
            embeds: [bal_embeds[Number(dresp_bin.customId)]],
            components: [action_row],
          });
        } catch (e) {
          return;
        }
      }
    //} else if (Object.keys(generic_bals).length > 0) {
    } else {
      let embeds = [];
      let bal_embed = bal_embed_furnish(new discord.EmbedBuilder(), usd_value, true, sgb_bal, flr_bal, astral_bal);
      //generic_bals
      bal_embed.addFields(Object.keys(generic_bals).map((c) => (
        {
          name: `${songbird.SUPPORTED_INFO[c].name} (${songbird.SUPPORTED_INFO[c].id})`,
          value: String(String(generic_bals[c]).split(".")[1]?.length > 5 ? generic_bals[c].toFixed(5) : generic_bals[c])+" "+songbird.SUPPORTED_INFO[c].emoji + (price_cache[c] ? ` (≈$${(generic_bals[c] * price_cache[c].usd).toFixed(2)} USD)` : ""),
          inline: true,
        }
      )));
      embeds.push(bal_embed);
      if (usd_value > 25) {
        let warning_embed = new discord.EmbedBuilder();
        warning_embed.setColor("#ff0000");
        warning_embed.setTitle("⚠️ WARNING - High balance detected!");
        warning_embed.setDescription("Your balance exceeds $25 USD. It is strongly recommend that you withdraw funds to your self custody wallet immediately!");
        embeds.push(warning_embed);
      }
      return interaction.editReply({ embeds });
    }
  } else if (command === "withdraw") {
    await interaction.deferReply({ ephemeral: true });
    //withdraw address
    let withdraw_address = (await params.get("address")).value.toLowerCase().trim();
    let address_valid;
    if (withdraw_address.endsWith(".sgb") || withdraw_address.endsWith(".flr")) {
      address_valid = true;
      withdraw_address = await songbird.lookup_domain_owner(withdraw_address);
      if (!withdraw_address || withdraw_address === "0x0000000000000000000000000000000000000000") {
        return await interaction.editReply(`Could not find that .sgb/.flr domain. Please double check your spelling.`);
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
    let withdraw_amount = Number((await params.get("amount")).value.toFixed(songbird.MAX_DECIMALS));
    if (withdraw_amount <= 0) {
      return await interaction.editReply("Amount cannot be equal to or less than 0");
    }
    //check withdrawal currency
    let withdraw_currency = (await params.get("currency")).value.toLowerCase().trim();
    if (!songbird.SUPPORTED.includes(withdraw_currency)) return await interaction.editReply("Currency must be one of the following: "+songbird.SUPPORTED.join(", "));
    let success, send;
    try {
      if (withdraw_currency === "sgb") {
        [success, send] = await songbird.user_withdraw_native(user.id, withdraw_address, withdraw_amount, "songbird");
      } else if (withdraw_currency === "flr") {
        [success, send] = await songbird.user_withdraw_native(user.id, withdraw_address, withdraw_amount, "flare");
      } else {
        [success, send] = await songbird.user_withdraw_generic_token(user.id, withdraw_address, withdraw_amount, withdraw_currency);
      }
    } catch (e) {
      //shouldn't happen
      console.log(e);
      return await interaction.editReply("Uh oh! This shouldn't happen - encountered an unexpected error.");
    }
    const supported_info = songbird.SUPPORTED_INFO[withdraw_currency];
    if (!send) {
      return await interaction.editReply(`Send failed - common reasons why are because you are withdrawing more than your balance, or **don't have enough ${songbird.full_to_abbr(supported_info.chain)} to pay for gas**. You may also be sending tips too fast.`);
    }
    //send tx embed
    let withdraw_embed = new discord.EmbedBuilder();
    withdraw_embed.setURL(`https://${supported_info.chain}-explorer.flare.network/tx/${send.hash}`);
    withdraw_embed.setTitle("Withdraw Requested");
    withdraw_embed.setDescription("Your withdraw tx has been submitted to the network! If you have any issues, please contact the Astral Credits Team.");
    withdraw_embed.addFields([
      {
        name: "Transaction",
        value: `[Click here](https://${supported_info.chain}-explorer.flare.network/tx/${send.hash})`,
      },
      {
        name: "Withdrawal Amount",
        value: `${String(withdraw_amount)} ${ withdraw_currency === "sgb" ? "<:SGB:1130360963636408350>" : supported_info.emoji }`,
      },
    ]);
    await interaction.editReply({ embeds: [withdraw_embed] });
    //send followup once confirmed
    try {
      let receipt = await send.wait();
      if (!receipt || receipt?.status === 0) {
        return interaction.followUp({
          ephemeral: true,
          content: "Transaction may have failed? Check the block explorer.",
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
        content: "Transaction may have failed? Check the block explorer.",
      });
    }
  } else if (command === "tip") {
    await interaction.deferReply();
    let target = (await params.get("target")).user;
    if (target.id === user.id) {
      return await interaction.editReply("Failed, cannot tip yourself.");
    }
    if (target.bot) {
      return await interaction.editReply("Failed, cannot tip bots.");
    }
    let amount = Number((await params.get("amount")).value.toFixed(songbird.MAX_DECIMALS));
    if (amount <= 0) {
      return await interaction.editReply("Failed, cannot send 0 or negative of coin/token.");
    }
    let currency = (await params.get("currency")).value.toLowerCase().trim();
    if (!songbird.SUPPORTED.includes(currency)) return await interaction.editReply("Currency must be one of the following: "+songbird.SUPPORTED.join(", "));
    await send_tip(interaction, user, target.id, amount, currency, "tip", "");
  } else if (command === "active_tip") {
    await interaction.deferReply();
    let amount = Number((await params.get("amount")).value.toFixed(songbird.MAX_DECIMALS));
    if (amount <= 0) {
      return await interaction.editReply("Failed, cannot send 0 or negative of coin/token.");
    }
    let currency = (await params.get("currency")).value.toLowerCase().trim();
    if (!songbird.SUPPORTED.includes(currency)) return await interaction.editReply("Currency must be one of the following: "+songbird.SUPPORTED.join(", "));
    //one of the last 50 messages, non-bot, non-self, non-admin, and sent in the last 24 hours
    let recent_messages;
    try {
      recent_messages = Array.from((await interaction.channel.messages.fetch({ limit: 50 })).values()).filter((m) => m.author.id !== user.id && !(TEAM.includes(m.author.id) && interaction.guildId === ASTRAL_GUILD) && !m.author.bot && m.createdTimestamp > (Date.now() - 24 * 60 * 60 * 1000));
    } catch (_) {
      return await interaction.editReply("Could not fetch recent messages in this channel, ask an admin to check that the bot has the right permissions, or try again later.");
    }
    if (recent_messages.length === 0) {
      return await interaction.editReply("Could not find enough recent messages in channel not sent by you, an team member, or a bot.");
    }
    let random_message = recent_messages[Math.floor(Math.random() * recent_messages.length)];
    let target_id = random_message.author.id;
    let tx = await send_tip(interaction, user, target_id, amount, currency, "active_tip", " to random active user", true);
    //if !tx, send_tip should have replied with error message
    if (tx) {
      const supported_info = songbird.SUPPORTED_INFO[currency];
      let active_tip_embed = new discord.EmbedBuilder();
      active_tip_embed.setURL(`https://${supported_info.chain}-explorer.flare.network/tx/${tx}`);
      active_tip_embed.setColor("15e1ef");
      active_tip_embed.setTitle("Active Tip 💬");
      let potential_participants = [];
      for (const m of recent_messages) {
        if (!potential_participants.includes(m.author.id)) {
          potential_participants.push(m.author.id);
        }
      }
      active_tip_embed.setDescription(`\`${potential_participants.length}\` active participants found!\nRandom tip of ${supported_info.emoji} ${String(amount)} ${currency.toUpperCase()} sent!`);
      return await interaction.editReply({ content: `<@${user.id}> sent ${supported_info.emoji} ${String(amount)} ${currency.toUpperCase()} to <@${target_id}>!\n[View tx](<https://${supported_info.chain}-explorer.flare.network/tx/${tx}>)`, embeds: [active_tip_embed] });
    }
  } else if (command === "role_tip") {
    await interaction.deferReply();
    let amount = Number((await params.get("amount")).value.toFixed(songbird.MAX_DECIMALS));
    if (amount <= 0) {
      return await interaction.editReply("Failed, cannot send 0 or negative coin/token.");
    }
    let currency = (await params.get("currency")).value.toLowerCase().trim();
    if (!songbird.SUPPORTED.includes(currency)) return await interaction.editReply("Currency must be one of the following: "+songbird.SUPPORTED.join(", "));
    let role = (await params.get("role")).role;
    try {
      await interaction.guild.members.fetch();
    } catch (e) {
      console.log(e);
      return await interaction.editReply("Something went wrong while fetching users. Sorry, try again later.");
    }
    let role_members = Array.from(role.members).filter((m) => m[1].user.id !== user.id && !m[1].user.bot);
    if (role_members.length === 0) {
      return await interaction.editReply("Could not find any non-bot users with that role, or you are the only one with that role.");
    }
    let random_member = role_members[Math.floor(Math.random() * role_members.length)];
    let target_id = random_member[1].user.id;
    let tx = await send_tip(interaction, user, target_id, amount, currency, "role_tip", " to random user with role", true);
    //if !tx, send_tip should have replied with error message
    if (tx) {
      const supported_info = songbird.SUPPORTED_INFO[currency];
      let role_tip_embed = new discord.EmbedBuilder();
      role_tip_embed.setURL(`https://${supported_info.chain}-explorer.flare.network/tx/${tx}`);
      role_tip_embed.setColor(role.color);
      role_tip_embed.setTitle("Role Tip 🎉");
      role_tip_embed.setDescription(`Random tip of ${supported_info.emoji} ${String(amount)} ${currency.toUpperCase()} to <@&${role.id}>`);
      return await interaction.editReply({ content: `<@${user.id}> sent ${supported_info.emoji} ${String(amount)} ${currency.toUpperCase()} to <@${target_id}>!\n[View tx](<https://${supported_info.chain}-explorer.flare.network/tx/${tx}>)`, embeds: [role_tip_embed] });
    }
  } else if (command === "role_rain" || command === "active_rain") {
    let split_amount = Number((await params.get("split_amount")).value.toFixed(songbird.MAX_DECIMALS));
    if (split_amount <= 0) {
      return await interaction.reply({ content: "Failed, cannot send 0 or negative coin/token.", ephemeral: true});
    }
    let currency = (await params.get("currency")).value.toLowerCase().trim();
    if (!songbird.SUPPORTED.includes(currency)) return await interaction.reply({ content: "Currency must be one of the following: "+songbird.SUPPORTED.join(", "), ephemeral: true});
    let num_users = (await params.get("num_users")).value;
    if (isNaN(Number(num_users)) && num_users !== "max") {
      return await interaction.reply({ content: "Number of users must be a positive integer less than or equal to 30, or 'max' (for as many users as possible up to 30).", ephemeral: true});
    } else if (!isNaN(Number(num_users))) {
      num_users = Number(num_users);
    }
    if (num_users > 30) {
      return await interaction.reply({ content: "For now, cannot multi-tip more than 30 users at once.", ephemeral: true});
    } else if (num_users <= 0) {
      return await interaction.reply({ content: "Number of users must be more than 0.", ephemeral: true });
    }
    await interaction.deferReply();
    if (command === "role_rain") {
      let role = (await params.get("role")).role;
      try {
        await interaction.guild.members.fetch();
      } catch (e) {
        console.log(e);
        return await interaction.editReply("Something went wrong while fetching users. Sorry, try again later.");
      }
      let role_members = Array.from(role.members).filter((m) => m[1].user.id !== user.id && !m[1].user.bot);
      if (role_members.length === 0) {
        return await interaction.editReply("Failed, found 0 users with that role (excluding bots and yourself).");
      } else if (num_users === "max") {
        num_users = role_members.length > 30 ? 30 : role_members.length;
      }
      if (role_members.length < num_users) {
        return await interaction.editReply(`Tried to tip ${num_users} users with the given role, but only ${role_members.length} users excluding bots (and yourself) have that role.`);
      }
      let target_ids = [];
      for (let i = 0; i < num_users; i++) {
        let random_member = role_members[Math.floor(Math.random() * role_members.length)];
        role_members = role_members.filter((m) => m !== random_member);
        target_ids.push(random_member[1].user.id);
      }
      let tx = await send_multitip(interaction, user, target_ids, split_amount, currency, "role_rain", "");
      //if !tx, send_tip should have replied with error message
      if (tx) {
        const supported_info = songbird.SUPPORTED_INFO[currency];
        let role_tip_embed = new discord.EmbedBuilder();
        role_tip_embed.setURL(`https://${supported_info.chain}-explorer.flare.network/tx/${tx}`);
        role_tip_embed.setColor(role.color);
        role_tip_embed.setTitle("Role Tip 🎉");
        let target_ids_stringfied = target_ids.map((tid) => `<@${tid}>`).join("");
        role_tip_embed.setDescription(`Random tip of ${supported_info.emoji} ${String(split_amount)} ${currency.toUpperCase()} to <@&${role.id}> split between ${num_users} users`);
        return await interaction.editReply({ content: `<@${user.id}> sent ${supported_info.emoji} ${String(split_amount)} ${currency.toUpperCase()} to ${target_ids_stringfied}!\n[View tx](<https://${supported_info.chain}-explorer.flare.network/tx/${tx}>)`, embeds: [role_tip_embed] });
      }
    } else if (command === "active_rain") {
      //team members not ignored
      let recent_messages;
      try {
        recent_messages = Array.from((await interaction.channel.messages.fetch({ limit: 25 })).values()).filter((m) => m.author.id !== user.id && !m.author.bot && m.createdTimestamp > (Date.now() - 24 * 60 * 60 * 1000)); //&& !(TEAM.includes(m.author.id) && interaction.guildId === ASTRAL_GUILD)
      } catch (_) {
        return await interaction.editReply("Could not fetch recent messages in this channel, ask an admin to check that the bot has the right permissions, or try again later.");
      }
      let recent_users = [];
      for (const m of recent_messages) {
        if (!recent_users.includes(m.author.id)) {
          recent_users.push(m.author.id);
        }
      }
      if (recent_users.length === 0) {
        return await interaction.editReply("Failed, found 0 recently active users in this channel (excluding bots and yourself).");
      } else if (num_users === "max") {
        num_users = recent_users.length > 30 ? 30 : recent_users.length;
      }
      if (recent_users.length < num_users) {
        return await interaction.editReply(`Tried to tip ${num_users} recently active users in this channel, but found only ${recent_users.length} non-bot (and non-you) recently active users.`);
      }
      let target_ids = [];
      for (let i = 0; i < num_users; i++) {
        let random_id = recent_users[Math.floor(Math.random() * recent_users.length)];
        recent_users = recent_users.filter((m) => m !== random_id);
        target_ids.push(random_id);
      }
      let tx = await send_multitip(interaction, user, target_ids, split_amount, currency, "active_rain", "");
      //if !tx, send_tip should have replied with error message
      if (tx) {
        const supported_info = songbird.SUPPORTED_INFO[currency];
        let active_tip_embed = new discord.EmbedBuilder();
        active_tip_embed.setURL(`https://${supported_info.chain}-explorer.flare.network/tx/${tx}`);
        active_tip_embed.setColor("15e1ef");
        active_tip_embed.setTitle("Active Tip 💬");
        let potential_participants = [];
        for (const m of recent_messages) {
          if (!potential_participants.includes(m.author.id)) {
            potential_participants.push(m.author.id);
          }
        }
        let target_ids_stringfied = target_ids.map((tid) => `<@${tid}>`).join("");
        active_tip_embed.setDescription(`\`${potential_participants.length}\` active participants found!\nRandom tip of ${supported_info.emoji} ${String(split_amount)} ${currency.toUpperCase()} split between ${num_users} users!`);
        return await interaction.editReply({ content: `<@${user.id}> sent ${supported_info.emoji} ${String(split_amount)} ${currency.toUpperCase()} to ${target_ids_stringfied}!\n[View tx](<https://${supported_info.chain}-explorer.flare.network/tx/${tx}>)`, embeds: [active_tip_embed] });
      }
    }
  } else if (command === "airdrop") {
    const amount_each = Number((await params.get("amount_each")).value.toFixed(songbird.MAX_DECIMALS));
    if (amount_each <= 0) {
      return await interaction.reply({ content: "Failed, cannot send 0 or negative coin/token.", ephemeral: true});
    }
    const currency = (await params.get("currency")).value.toLowerCase().trim();
    if (!songbird.SUPPORTED.includes(currency)) return await interaction.reply({ content: "Currency must be one of the following: "+songbird.SUPPORTED.join(", "), ephemeral: true});
    const supported_info = songbird.SUPPORTED_INFO[currency];
    const max_participants = (await params.get("max_participants")).value;
    if (max_participants < 1) return await interaction.reply({ content: "Max users cannot be 0 or negative", ephemeral: true });
    if (max_participants > 30) {
      return await interaction.reply({ content: "For now, cannot airdrop to more than 30 users at once.", ephemeral: true});
    }
    const minutes = Number(Number((await params.get("end_minutes")).value).toFixed(1));
    if (minutes <= 0) {
      return await interaction.reply({ content: "End time cannot be in zero minutes or in the past.", ephemeral: true});
    } else if (minutes > 7*24*60) {
      return await interaction.reply({ content: "For now, airdrops cannot last more than a week", ephemeral: true});
    }
    const end_timestamp = Math.ceil(Date.now() / 1000 + minutes * 60);
    const role = (await params.get("required_role"))?.role;
    await interaction.deferReply();
    const airdrop_receipt = await songbird.start_airdrop(user.id, currency, amount_each, max_participants, end_timestamp);
    const airdrop_id = songbird.get_airdrop_id(supported_info.chain, airdrop_receipt.logs);
    if (!airdrop_id) {
      return await interaction.editReply(`Onchain airdrop starting failed - common reasons why are because you are airdropping more than your balance, or **don't have enough ${songbird.full_to_abbr(songbird.SUPPORTED_INFO[currency].chain)} to pay for gas**. You may also be creating transactions too quickly.`);
    }
    //make embed
    let airdrop_embed = new discord.EmbedBuilder();
    airdrop_embed.setTitle("Airdrop 🪂");
    airdrop_embed.setDescription(`<@${user.id}> started an airdrop! Every participant will receive ${supported_info.emoji} ${amount_each} ${currency.toUpperCase()}. Limit of ${max_participants} participant(s).`);
    airdrop_embed.addFields([
      {
        name: "Ends",
        value: `<t:${end_timestamp}:R>`,
      },
      {
        name: "Participants",
        value: `0/${max_participants}`,
      },
    ]);
    if (role) {
      airdrop_embed.addFields([{
        name: "Required Role",
        value: `<@&${role.id}>`,
      }]);
    }
    airdrop_embed.setFooter({ text: "Click the 'Claim Airdrop' button below! Quick!" });
    //make buttons
    let action_row = new discord.ActionRowBuilder();
    let action_claim = new discord.ButtonBuilder()
      .setCustomId(`airdropclaim-${currency}-${airdrop_id}${ role ? "-" + role.id : "" }`)
      .setLabel("Claim Airdrop")
      .setEmoji("🪂")
      .setDisabled(false)
      .setStyle("Success");
    let action_refund = new discord.ButtonBuilder()
      .setCustomId(`airdroprefund-${currency}-${airdrop_id}`)
      .setLabel("Refund Remaining (After Airdrop)")
      .setDisabled(false)
      .setStyle("Secondary");
    action_row.addComponents(action_claim, action_refund);
    await interaction.editReply({
      embeds: [airdrop_embed],
      components: [action_row],
    });
    return await interaction.followUp({
      ephemeral: true,
      content: "After the airdrop is done, make sure to click the Refund button! This will give you back any coins/tokens that were not claimed. For example, if you made an airdrop of 1 XAC each to 10 users, but only 5 users claimed, you will be refunded 5 XAC.",
    });
  } else if (command === "prices") {
    let embeds = [];
    //25 fields max per embed, 10 embeds per message, so shouldn't be a problem up till 250 listed currencies with coingeckos (ie, not a problem)
    for (let i=0; i < Math.ceil(songbird.SUPPORTED.length / 25); i++) {
      let price_embed = new discord.EmbedBuilder();
      price_embed.setColor("#056072");
      if (i === 0) {
        price_embed.setTitle("Prices");
      } else {
        price_embed.setTitle("Prices (cont.)");
      }
      price_embed.addFields(Object.keys(price_cache).slice(i * 25, i * 25 + 25).map((c) => ({ name: `${songbird.SUPPORTED_INFO[c].emoji} ${songbird.SUPPORTED_INFO[c].name}`, value: `$${String(price_cache[c].usd)} USD` })));
      price_embed.setFooter({ text: "listen to yorushika and nbuna instrumentals" });
      embeds.push(price_embed);
    }
    return await interaction.reply({ embeds, ephemeral: true });
  } else if (command === "settings") {
    await interaction.deferReply({ ephemeral: true });
    const subcommand = interaction.options.getSubcommand();
    let settings = await db.get_user_settings(user.id);
    if (subcommand === "view") {
      let settings_embed = new discord.EmbedBuilder();
      settings_embed.setTitle("Your Tipbot Settings");
      settings_embed.addFields([
        {
          name: "Notify of tips by DM",
          value: settings.tip_notify_dm ? "Yes" : "No",
        },
        {
          name: "Min value of tip to notify by DM",
          value: `$${settings.tip_notify_dm_min / 1000} USD`,
        },
      ]);
      settings_embed.setFooter({ text: "Have any suggestions or feedback? Join the XAC discord!" });
      return await interaction.editReply({ embeds: [settings_embed] });
    } else if (subcommand === "notification") {
      let tip_notify_dm = (await params.get("tip_notify_dm")).value;
      await db.change_user_settings(user.id, settings, "tip_notify_dm", tip_notify_dm);
      return await interaction.editReply(`Successfully changed setting! The tipbot will now ${ tip_notify_dm ? "" : "**not** " }notify you by DM when you are tipped.${ tip_notify_dm ? " Make sure the bot is able to DM you (you may need to allow 'Direct Messages' from members in this server)!" : "" }`);
    } else if (subcommand === "notify_value") {
      let min = Number((await params.get("min")).value.toFixed(3));
      await db.change_user_settings(user.id, settings, "tip_notify_dm_min", min * 1000);
      return await interaction.editReply(`Successfully changed setting! The tipbot will now notify you by DM when you are tipped only when the value of the tip is at least $${min} USD.${ settings.tip_notify_dm ? "" : " Please note that this setting will have no effect as you have disabled being notified by DM when tipped." }`);
    }
  }
});

//handle airdrop buttons
tipbot_client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;

  let custom_id = interaction.customId;
  let user = interaction.user;

  //airdropclaim-${currency}-${airdrop_id}
  //make sure no - in the currency name
  if (custom_id.startsWith("airdropclaim-")) {
    await interaction.deferReply({ ephemeral: true });
    const currency = custom_id.split("-")[1];
    const airdrop_id = Number(custom_id.split("-")[2]);
    const role_id = custom_id.split("-")[3]; //may be undefined
    if (role_id) {
      await interaction.member.fetch()
      if (!interaction.member.roles.cache.has(role_id)) return await interaction.editReply("You are missing the role required to participate in this airdrop");
    }
    const supported_info = songbird.SUPPORTED_INFO[currency];
    let airdrop_info = await songbird.get_airdrop(user.id, supported_info.chain, airdrop_id);
    //edit original embed with new # of participants
    async function edit_airdrop_message(is_over) {
      await sleep(4000);
      let airdrop_participants = await songbird.get_airdrop_participants(user.id, supported_info.chain, airdrop_id);
      let airdrop_embed = interaction.message.embeds[0];
      airdrop_embed = discord.EmbedBuilder.from(airdrop_embed);
      airdrop_embed.setFields([
        {
          name: "Ends",
          value: `<t:${airdrop_info.end_timestamp}:R>`,
        },
        {
          name: "Participants",
          value: `${airdrop_participants.length}/${airdrop_info.max_participants}`,
        },
      ]);
      if (role_id) {
        airdrop_embed.addFields([{
          name: "Required Role",
          value: `<@&${role_id}>`,
        }]);
      }
      let buttons = interaction.message.components[0].components;
      let action_row = new discord.ActionRowBuilder();
      let claim_button = discord.ButtonBuilder.from(buttons[0]);
      if (airdrop_participants.length == airdrop_info.max_participants || is_over) {
        claim_button.setDisabled(true);
      }
      action_row.addComponents(claim_button, buttons[1]);
      await interaction.message.edit({ embeds: [airdrop_embed], components: [action_row] });
    };
    //make sure airdrop hasn't ended already
    if ((Date.now() / 1000) > airdrop_info.end_timestamp) {
      edit_airdrop_message(true);
      return await interaction.editReply("Airdrop claim failed - airdrop already over!");
    }
    const tx = await songbird.claim_airdrop(user.id, currency, airdrop_id);
    if (!tx) {
      //failed
      return await interaction.editReply(`Airdrop claim failed - Have you already claimed from this airdrop? If not, you probably **don't have enough ${songbird.full_to_abbr(supported_info.chain)} to pay for gas**. Deposit more or try again in a second`);
    }
    edit_airdrop_message();
    return await interaction.editReply(`**Success! 🪂**\nAirdrop of ${supported_info.emoji} ${await songbird.from_raw((await songbird.get_airdrop(user.id, supported_info.chain, airdrop_id)).amount_each, supported_info.decimal_places ?? 18)} ${currency.toUpperCase()} received!\n[View Tx](https://${supported_info.chain}-explorer.flare.network/tx/${tx.hash})`);
  } else if (custom_id.startsWith("airdroprefund-")) {
    await interaction.deferReply({ ephemeral: true });
    const currency = custom_id.split("-")[1];
    const airdrop_id = Number(custom_id.split("-")[2]);
    const supported_info = songbird.SUPPORTED_INFO[currency]
    const tx = await songbird.refund_airdrop(user.id, supported_info.chain, airdrop_id);
    if (!tx) {
      //failed
      return await interaction.editReply(`Airdrop refund failed - you might not have enough ${songbird.full_to_abbr(supported_info.chain)} to pay for gas. More likely, nothing to refund, or airdrop has not finished yet.`);
    }
    //tx.hash
    return await interaction.editReply(`Refunded remaining amount from airdrop back to creator.\n[View Tx](https://${supported_info.chain}-explorer.flare.network/tx/${tx.hash})`);
  }
});

module.exports = {
  tipbot_client,
};
