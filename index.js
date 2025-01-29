const dotenv = require("dotenv");
dotenv.config();

const _keep_alive = require("./keep_alive.js");

const { client } = require("./bot.js");
const { mod_client } = require("./modbot.js");
const { tipbot_client } = require("./tipbot.js");

setTimeout(() => {
  client.login(process.env.token);
  tipbot_client.login(process.env.tipbot_token);
}, 4500);

mod_client.login(process.env.mod_token);
