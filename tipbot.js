const QRCode = require("qrcode");

const discord = require("discord.js");

const db = require("./db.js");
const songbird = require("./songbird.js");
const { send_tip, MAX_DECIMALS, TEAM } = require("./bot.js");

const tipbot_client = new discord.Client({
  intents: [discord.GatewayIntentBits.Guilds, discord.GatewayIntentBits.GuildMembers, discord.GatewayIntentBits.GuildMessages]
});

tipbot_client.once('ready', async (info) => {
  console.log('Ready! as ' + info.user.tag);
});

tipbot_client.on('interactionCreate', async interaction => {
  let command = interaction.commandName;
  let params = interaction.options;
  let user = interaction.user;

  if (interaction.isAutocomplete()) {
    if (command === "tip" || command === "withdraw" || command === "active_tip" || command === "role_tip") {
      const focused_option = interaction.options.getFocused(true);
      if (focused_option.name === "currency") {
        return await interaction.respond(songbird.SUPPORTED.filter((c) => c.startsWith(focused_option.value.toLowerCase())).map((c) => ({ name: c, value: c })));
      } else {
        return;
      }
    }
  }

  if (command === "help") {
    let help_embed = new discord.EmbedBuilder();
    help_embed.setTitle("Help");
    help_embed.setColor("#08338e");
    help_embed.setDescription("This is your friendly neighbourhood tipbot for the Flare and Songbird ecosystems, made by the [Astral Credits Team](https://astralcredits.xyz)!");
    help_embed.addFields([
      {
        name: "/help",
        value: "Get a list of commands."
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
        value: "Tip other users XAC and other currencies from your tipbot/game balance"
      },
      {
        name: "/active_tip",
        value: "Tip a random recently active user (in the channel) some XAC or other currencies from your tipbot/game balance"
      },
      {
        name: "/role_tip",
        value: "Tip a random user with a certain role some XAC or other currencies from your tipbot/game balance"
      },
    ]);
    help_embed.setFooter({ text: "Programmed by prussia.dev" });
    return await interaction.reply({ embeds: [ help_embed ], ephemeral: true });
  } else if (command === "deposit") {
    await interaction.deferReply({ ephemeral: true });
    let user_address = await songbird.get_tipbot_address(user.id);
    let deposit_embed = new discord.EmbedBuilder();
    deposit_embed.setColor("#1dd3f7");
    deposit_embed.setTitle("Deposit");
    deposit_embed.setDescription(
      `Deposit Address:\n\`${user_address}\`\n\nThis is your deposit address for the Astral Credits Tipbot. Please only deposit ${songbird.SUPPORTED.filter((c) => c !== "sgb").map((c) => c.toUpperCase()).join(", ")}, or SGB. Also please ensure you have enough SGB to pay for gas fees when you wish to withdraw, tip or play games.\n\n**DISCLAIMER:** The Astral Credits tipbot wallet is experimental software and a custodial service. Remember - **Not your keys, not your coins!** It's creators shall not be held liable for any lost or stolen funds as a result of your use of this service. Please proceed at your own risk.\n[Terms of Service](https://www.astralcredits.xyz/docs/Terms-of-Service-Tipbot.pdf)`
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
  } else if (command === "supported") {
    let embeds = [];
    //25 fields max per embed
    for (let i=0; i < Math.ceil(songbird.SUPPORTED.length / 25); i++) {
      let supported_embed = new discord.EmbedBuilder();
      supported_embed.setColor("#0bb3dd");
      if (i === 0) {
        supported_embed.setTitle("Supported Currencies");
        supported_embed.setDescription("These are the supported currencies of the tipbot:");
      } else {
        supported_embed.setTitle("Supported Currencies (cont.)");
      }
      supported_embed.addFields(songbird.SUPPORTED.slice(i * 25, i * 25 + 25).map((c) => ({ name: songbird.SUPPORTED_INFO[c].name, value: `${songbird.SUPPORTED_INFO[c].emoji} ${c}` })));
      supported_embed.setFooter({ text: "zutomayo" });
      embeds.push(supported_embed);
    }
    return await interaction.reply({ embeds, ephemeral: true });
  } else if (command === "balance") {
    function bal_embed_furnish(bal_embed) {
      bal_embed.setColor("#7ad831");
      bal_embed.setTitle("View Balance");
      bal_embed.setDescription("This is your current balance for the Astral Credits Tipbot. As this is a custodial service, we recommend you do not keep large amounts of funds here.");
      bal_embed.setFooter({ text: "247 nishina" });
      bal_embed.setURL("https://songbird-explorer.flare.network/address/"+user_address);
      return bal_embed;
    }
    const dresp = await interaction.deferReply({ ephemeral: true });
    let user_address = await songbird.get_tipbot_address(user.id);
    let sgb_bal = await songbird.get_bal(user_address);
    let astral_bal = await songbird.get_bal_astral(user_address);
    let generic_bals = await songbird.get_bal_generic_tokens(user_address);
    delete generic_bals.xac;
    const g_num = Object.keys(generic_bals).length;
    if (g_num > 23) {
      const max_pages = Math.ceil(g_num / 10);
      let bal_embeds = [];
      for (let i=0; i < max_pages; i++) {
        let bal_embed = bal_embed_furnish(new discord.EmbedBuilder());
        if (i === 0) {
          bal_embed.addFields([
            {
              name: "Songbird (sgb)",
              //truncate if more than 5 decimals
              value: String(String(sgb_bal).split(".")[1]?.length > 5 ? sgb_bal.toFixed(5) : sgb_bal)+" <:SGB:1130360963636408350>",
            },
            {
              name: "Astral Credits (xac)",
              value: String(String(astral_bal).split(".")[1]?.length > 5 ? astral_bal.toFixed(5) : astral_bal)+" <:astral_creds:1000992673341120592>",
            },
          ]);
        }
        //bal_embed.addFields(Object.keys(generic_bals).map((c) => ({ name: `${songbird.SUPPORTED_INFO[c].name} (${songbird.SUPPORTED_INFO[c].id})`, value: String(String(generic_bals[c]).split(".")[1]?.length > 5 ? generic_bals[c].toFixed(5) : generic_bals[c])+" "+songbird.SUPPORTED_INFO[c].emoji })));
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
      if (astral_bal > 200000 || sgb_bal > 2000) {
        let warning_embed = new discord.EmbedBuilder();
        warning_embed.setColor("#ff0000");
        warning_embed.setTitle("⚠️ WARNING - High balance detected!");
        warning_embed.setDescription("Your balance exceeds 200k XAC and/or 2000 SGB. It is strongly recommend that you withdraw funds to your self custody wallet!");
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
    } else if (Object.keys(generic_bals).length > 0) {
      let embeds = [];
      let bal_embed = bal_embed_furnish(new discord.EmbedBuilder());
      bal_embed.addFields([
        {
          name: "Songbird (sgb)",
          //truncate if more than 5 decimals
          value: String(String(sgb_bal).split(".")[1]?.length > 5 ? sgb_bal.toFixed(5) : sgb_bal)+" <:SGB:1130360963636408350>",
        },
        {
          name: "Astral Credits (xac)",
          value: String(String(astral_bal).split(".")[1]?.length > 5 ? astral_bal.toFixed(5) : astral_bal)+" <:astral_creds:1000992673341120592>",
        },
      ]);
      //generic_bals
      bal_embed.addFields(Object.keys(generic_bals).map((c) => ({ name: `${songbird.SUPPORTED_INFO[c].name} (${songbird.SUPPORTED_INFO[c].id})`, value: String(String(generic_bals[c]).split(".")[1]?.length > 5 ? generic_bals[c].toFixed(5) : generic_bals[c])+" "+songbird.SUPPORTED_INFO[c].emoji })));
      embeds.push(bal_embed);
      if (astral_bal > 200000 || sgb_bal > 2000) {
        let warning_embed = new discord.EmbedBuilder();
        warning_embed.setColor("#ff0000");
        warning_embed.setTitle("⚠️ WARNING - High balance detected!");
        warning_embed.setDescription("Your balance exceeds 200k XAC and/or 2000 SGB. It is strongly recommend that you withdraw funds to your self custody wallet immediately!");
        embeds.push(warning_embed);
      }
      return interaction.editReply({ embeds });
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
    if (!songbird.SUPPORTED.includes(withdraw_currency)) return await interaction.editReply("Currency must be one of the following: "+songbird.SUPPORTED.join(", "));
    let send;
    try {
      if (withdraw_currency === "sgb") {
        send = await songbird.user_withdraw_songbird(user.id, withdraw_address, withdraw_amount);
      } else {
        send = await songbird.user_withdraw_generic_token(user.id, withdraw_address, withdraw_amount, withdraw_currency);
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
        value: `${String(withdraw_amount)} ${ withdraw_currency === "sgb" ? "<:SGB:1130360963636408350>" : songbird.SUPPORTED_INFO[withdraw_currency].emoji }`,
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
    if (target.bot) {
      return await interaction.editReply("Failed, cannot tip bots.");
    }
    let amount = Number((await params.get("amount")).value.toFixed(MAX_DECIMALS));
    if (amount <= 0) {
      return await interaction.editReply("Failed, cannot send 0 or negative XAC.");
    }
    let currency = (await params.get("currency")).value.toLowerCase().trim();
    if (!songbird.SUPPORTED.includes(currency)) return await interaction.editReply("Currency must be one of the following: "+songbird.SUPPORTED.join(", "));
    await send_tip(interaction, user, target.id, amount, currency, "");
  } else if (command === "active_tip") {
    await interaction.deferReply();
    let amount = Number((await params.get("amount")).value.toFixed(MAX_DECIMALS));
    if (amount <= 0) {
      return await interaction.editReply("Failed, cannot send 0 or negative XAC.");
    }
    let currency = (await params.get("currency")).value.toLowerCase().trim();
    if (!songbird.SUPPORTED.includes(currency)) return await interaction.editReply("Currency must be one of the following: "+songbird.SUPPORTED.join(", "));
    //one of the last 25 messages, non-bot, non-self, non-admin, and sent in the last 12 hours
    let recent_messages = Array.from((await interaction.channel.messages.fetch({ limit: 25 })).values()).filter((m) => m.author.id !== user.id && !(TEAM.includes(m.author.id) && interaction.guildId === "1000985457393422367") && !m.author.bot && m.createdTimestamp > (Date.now() - 60*60*12*1000));
    if (recent_messages.length === 0) {
      return await interaction.editReply("Could not find enough recent messages in channel not sent by you, an admin, or a bot.");
    }
    let random_message = recent_messages[Math.floor(Math.random() * recent_messages.length)];
    let target_id = random_message.author.id;
    await send_tip(interaction, user, target_id, amount, currency, " to random active user");
  } else if (command === "role_tip") {
    await interaction.deferReply();
    let amount = Number((await params.get("amount")).value.toFixed(MAX_DECIMALS));
    if (amount <= 0) {
      return await interaction.editReply("Failed, cannot send 0 or negative XAC.");
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
    await send_tip(interaction, user, target_id, amount, currency, " to random user with role");
  }  
});

module.exports = {
  tipbot_client,
};
