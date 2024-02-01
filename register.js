const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const dotenv = require('dotenv');

dotenv.config();

const global_commands = [
  {
    name: "withdraw",
    description: "Withdraw your tipbot/gaming balance",
    options: [
      {
        type: 3,
        name: "address",
        description: "XAC address (0x...) or Songbird Domain (.sgb) to withdraw to",
        required: true
      },
      {
        type: 10,
        name: "amount",
        description: "Amount of currency to withdraw",
        required: true
      },
      {
        type: 3,
        name: "currency",
        description: "Coin/token to send",
        autocomplete: true,
        required: true
      }
    ]
  },
  {
    name: "deposit",
    description: "Shows your tipbot/gaming deposit address"
  },
  {
    name: "balance",
    description: "Shows your tipbot/gaming balance"
  },
];

const commands = [
  {
    name: "help",
    description: "Get list of commands for this bot",
    options: []
  },
	{
    name: "price",
    description: "Get Astral Credits price data",
    options: []
  },
  {
    name: "pools",
    description: "Get Astral Credits pools",
    options: []
  },
  {
    name: "faucet_stats",
    description: "Get some neat faucet metrics",
    options: []
  },
  {
    name: "next_claim",
    description: "See if your next faucet claim is ready",
    options: [
      {
        type: 3,
        name: "address",
        description: "Your XAC address (0x...)",
        required: false
      }
    ]
  },
  {
    name: "register",
    description: "Register your address with the bot",
    options: [
      {
        type: 3,
        name: "address",
        description: "Your XAC address (0x...)",
        required: true
      }
    ]
  },
  {
    name: "faucet",
    description: "Use the XAC faucet!"
  },
  {
    name: "send",
    //admin only
    default_member_permissions: String(268435456),
    description: "Send XAC to discord user or address (admin only)",
    options: [
      {
        type: 10,
        name: "amount",
        description: "Amount of XAC to send",
        required: true
      },
      {
        type: 3,
        name: "address",
        description: "XAC address (0x...) to send to",
        required: false
      },
      {
        type: 6,
        name: "target",
        description: "@ mention of user to send to",
        required: false
      },
      {
        type: 5,
        name: "to_tipbot",
        description: "If true (and target is used instead of address), sends to tipbot wallet",
        required: false
      }
    ]
  },
  {
    name: "change_register",
    //admin only
    default_member_permissions: String(268435456),
    description: "Change the registered address of an user (admin only)",
    options: [
      {
        type: 6,
        name: "target",
        description: "@ mention of user to change address of",
        required: true
      },
      {
        type: 3,
        name: "address",
        description: "New address of user",
        required: true
      }
    ]
  },
  {
    name: "domain",
    description: "Get a free Songbird Domain name! (a .sgb)",
    options: [
      {
        type: 3,
        name: "domain",
        description: "5 character or more domain name",
        required: true
      }
    ]
  },
  {
    name: "view_addresses",
    //admin only
    default_member_permissions: String(268435456),
    description: "View addresses of an user (admin only)",
    options: [
      {
        type: 6,
        name: "target",
        description: "@ mention of user to view addressses of",
        required: true
      },
    ]
  },
  {
    name: "add_website",
    description: "Link a website to your address, for the XAC pixel billboard",
    options: [
      {
        type: 3,
        name: "website_url",
        description: "Website url (https://...). Must be SFW!",
        required: true
      }
    ]
  },
  {
    name: "remove_linked_website",
    //admin only
    default_member_permissions: String(268435456),
    description: "Remove linked website of user (admin only)",
    options: [
      {
        type: 6,
        name: "target",
        description: "@ mention of user to remove linked website of",
        required: true
      }
    ]
  },
  {
    name: "list_role",
    //admin only
    default_member_permissions: String(268435456),
    description: "List all users with a role",
    options: [
      {
        type: 8,
        name: "role",
        description: "Role to get users of",
        required: true
      },
      {
        type: 5,
        name: "mentions",
        description: "If true, ouputs as mentions, if false, outputs as text tags",
        required: true
      }
    ]
  },
  {
    name: "export_domains",
    //admin only
    default_member_permissions: String(268435456),
    description: "Export the airdrop snapshot domains as a JSON file"
  },
  {
    name: "registered_count",
    //admin only
    default_member_permissions: String(268435456),
    description: "Get a count of all registered users"
  },
  {
    name: "supported",
    description: "See all supported currencies of the tipbot"
  },
  {
    name: "tip",
    description: "Tip XAC or another currency from your tipbot/gaming address to another user",
    options: [
      {
        type: 10,
        name: "amount",
        description: "Amount of currency to tip",
        required: true
      },
      {
        type: 3,
        name: "currency",
        description: "Coin/token to send",
        required: true,
        autocomplete: true
      },
      {
        type: 6,
        name: "target",
        description: "@ mention of user to give tip to",
        required: true
      }
    ]
  },
  {
    name: "active_tip",
    description: "Tip a random recently active user some XAC or other currencies from your tipbot/game balance",
    options: [
      {
        type: 10,
        name: "amount",
        description: "Amount of currency to tip",
        required: true
      },
      {
        type: 3,
        name: "currency",
        description: "Coin/token to send",
        required: true,
        autocomplete: true
      }
    ]
  },
  {
    name: "role_tip",
    description: "Tip a random user with a role some XAC or other currencies from your tipbot/game balance",
    options: [
      {
        type: 10,
        name: "amount",
        description: "Amount of currency to tip",
        required: true
      },
      {
        type: 8,
        name: "role",
        description: "Role to randomly tip",
        required: true
      },
      {
        type: 3,
        name: "currency",
        description: "Coin/token to send",
        required: true,
        autocomplete: true
      }
    ]
  },
  {
    name: "crawl",
    //admin only
    default_member_permissions: String(268435456),
    description: "See connections between addresses",
    options: [
      {
        type: 3,
        name: "address",
        description: "Address to crawl",
        required: true
      },
      {
        type: 5,
        name: "known_only",
        description: "If true, do not show any non-registered addresses",
        required: true
      }
    ]
  },
  {
    name: "crawl_shared_txs",
    //admin only
    default_member_permissions: String(268435456),
    description: "Find txs between two addresses",
    options: [
      {
        type: 3,
        name: "address1",
        description: "First address",
        required: true
      },
      {
        type: 3,
        name: "address2",
        description: "Second address",
        required: true
      }
    ]
  },
  {
    name: "coinflip_pvp",
    description: "Wager some XAC in a game of chance against other members!",
    options: [
      {
        type: 4,
        name: "wager",
        description: "Amount of XAC to bet",
        required: true
      },
      {
        type: 3,
        name: "pick",
        description: "'Heads' or 'Tails'",
        required: true
      }
    ]
  },
  {
    name: "coinflip_pvh",
    description: "Wager some XAC in a game of chance against the house!",
    options: [
      {
        type: 4,
        name: "wager",
        description: "Amount of XAC to bet",
        required: true
      },
      {
        type: 3,
        name: "pick",
        description: "'Heads' or 'Tails'",
        required: true
      }
    ]
  },
  {
    name: "provably_fair_pvp",
    description: "Get some explanation and code for the provably fair pvp coinflip game"
  },
  {
    name: "provably_fair_pvh",
    description: "Get some explanation and code for the provably fair pvh coinflip game"
  },
  {
    name: "admin_balance",
    //admin only
    default_member_permissions: String(268435456),
    description: "See balance of the admin tipping wallet"
  },
];

const rest = new REST({ version: "9" }).setToken(process.env.token);

(async () => {
  try {
    console.log("Started refreshing application (/) commands.");

    await rest.put(
      Routes.applicationGuildCommands("1087862421290492019", "1000985457393422367"),
      { body: commands },
    );

    await rest.put(
      Routes.applicationCommands("1087862421290492019"),
      { body: global_commands },
    );
    

    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error(error);
  }
})();
