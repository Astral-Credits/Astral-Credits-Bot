const discord = require("discord.js");

const mod_client = new discord.Client({
  intents: [discord.GatewayIntentBits.Guilds, discord.GatewayIntentBits.GuildMembers, discord.GatewayIntentBits.GuildMessages, discord.GatewayIntentBits.MessageContent]
});

mod_client.once("ready", async (info) => {
  console.log("Ready! as " + info.user.tag);
  mod_client.user.setPresence({
    activities: [
      {
        name: "for securities",
        type: 3,
      }
    ],
    status: "online",
  });
});

mod_client.on("messageCreate", async (message) => {
  const blacklist = ["community manager", "nudes", "discord.com/invite", "discord.gg/", "free mint"];
  const content = message.content.toLowerCase();
  if (blacklist.some((b) => content.includes(b)) || (content.includes("airdrop") && content.length > 100)) {
    await message.member.fetch();
    //if unverified (and not self [todo: not bot?]), delete invite
    if (!message.member.roles.cache.has("1100582916871958578") && message.member.id !== "1224934300244512789") {
      await message.reply(`<@${message.member.id}> <a:siren:1105674561829228626> **Possible UNREGISTERED SECURITY (||scam/spam||) detected, message deleted** <a:siren:1105674561829228626>`);
      try {
        await message.delete();
      } catch (e) {
        console.log(e);
        await mod_client.channels.cache.get("1070194353768775761").send(`Missing delete perms in <#${message.channel.id}>?\n${message.url}`);
      }
      try {
        //await mod_client.channels.fetch();
        await mod_client.channels.cache.get("1070194353768775761").send(`__Log: Deleted Likely Spam__\nUser: <@${message.member.id}>\nChannel: <#${message.channel.id}>\nContent: ${ message.length > 1000 ? message.slice(0, 1000) + "..." : message }`);
      } catch (e) {
        console.log(e);
      }
    }
  }
});

module.exports = {
  mod_client,
};
