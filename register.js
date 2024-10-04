const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const dotenv = require('dotenv');

dotenv.config();

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
      },
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
    name: "reverse_lookup",
    //admin only
    default_member_permissions: String(268435456),
    description: "Find registered user by address",
    options: [
      {
        type: 3,
        name: "address",
        description: "Eth address (0x...)",
        required: true
      }
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
    name: "unlocked_achievements",
    description: "See your unlocked achievements"
  },
  {
    name: "locked_achievements",
    description: "See achievements you haven't unlocked yet"
  },
  {
    name: "claim_achievements",
    description: "Manually claim certain achievements"
  },
  {
    name: "admin_balance",
    //admin only
    default_member_permissions: String(268435456),
    description: "See balance of the admin tipping wallet"
  },
  {
    name: "leaderboard",
    description: "See various rankings of our most impressive users!",
    options: [
      {
        type: 1,
        name: "achievements",
        description: "See the users with the most achievements",
      },
      {
        type: 1,
        name: "claims",
        description: "See the users with the most claims",
      },
    ]
  },
];

const tipbot_commands = [
  {
    name: "help",
    description: "Get list of commands for this bot",
    options: []
  },
  {
    name: "withdraw",
    description: "Withdraw your tipbot balance",
    options: [
      {
        type: 3,
        name: "address",
        description: "XAC address (0x...) or Songbird Domain (.sgb/.flr) to withdraw to",
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
      },
    ],
  },
  {
    name: "deposit",
    description: "Shows your tipbot deposit address",
  },
  {
    name: "balance",
    description: "Shows your tipbot balance",
  },
  {
    name: "supported",
    description: "See all currencies supported by the bot",
    options: [
      {
        type: 3,
        name: "chain",
        description: "Chain to show supported currencies for",
        required: true,
        autocomplete: true
      },
    ]
  },
  {
    name: "info",
    description: "View some basic information about supported currencies",
    options: [
      {
        type: 3,
        name: "currency",
        description: "Select coin/token",
        required: true,
        autocomplete: true
      },
    ]
  },
  {
    name: "settings",
    description: "View or change your tipbot settings",
    options: [
      {
        type: 1,
        name: "view",
        description: "View your current settings",
      },
      {
        type: 1,
        name: "notification",
        description: "Change whether or not to DM on tip",
        options: [
          {
            type: 5,
            name: "tip_notify_dm",
            description: "Whether or not to DM on tip",
            required: true
          },
        ]
      },
      {
        type: 1,
        name: "notify_value",
        description: "Change the minimum USD value of a tip for the bot to DM",
        options: [
          {
            type: 10,
            name: "min",
            description: "Min USD of tip before DM notification",
            required: true
          },
        ]
      },
    ]
  },
  {
    name: "tip",
    description: "Tip another user some coins/tokens from your tipbot balance",
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
    ],
    contexts: [0] //guild only
  },
  {
    name: "active_tip",
    description: "Tip a random recently active user some coins/tokens from your tipbot balance",
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
    ],
    contexts: [0] //guild only
  },
  {
    name: "role_tip",
    description: "Tip a random user with a certain role some coin/token from your tipbot balance",
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
    ],
    contexts: [0] //guild only
  },
  {
    name: "role_rain",
    description: "Tip multiple random users with a certain role some coin/token from your tipbot balance",
    options: [
      {
        type: 10,
        name: "split_amount",
        description: "Total amount of currency to tip",
        required: true
      },
      {
        type: 3,
        name: "num_users",
        description: "# of users to split amount between (or 'max' for max up to 30)",
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
    ],
    contexts: [0] //guild only
  },
  {
    name: "active_rain",
    description: "Tip multiple random recently active users some coins/tokens from your tipbot balance",
    options: [
      {
        type: 10,
        name: "split_amount",
        description: "Total amount of currency to tip",
        required: true
      },
      {
        type: 3,
        name: "num_users",
        description: "# of users to split amount between (or 'max' for max up to 30)",
        required: true
      },
      {
        type: 3,
        name: "currency",
        description: "Coin/token to send",
        required: true,
        autocomplete: true
      }
    ],
    contexts: [0] //guild only
  },
  {
    name: "_beta_airdrop",
    description: "DO NOT USE. UNDERGOING TESTING.",
    options: [
      {
        type: 10,
        name: "amount_each",
        description: "Amount to give each participant",
        required: true
      },
      {
        type: 4,
        name: "max_participants",
        description: "Max amount of participants to airdrop to",
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
        type: 10,
        name: "end_minutes",
        description: "Amount of minutes until airdrop end",
        required: true
      },
      {
        type: 8,
        name: "required_role",
        description: "Must have this role to join the airdrop",
        required: false
      },
    ],
    contexts: [0] //guild only
  },
  {
    name: "prices",
    description: "Get the prices of supported currencies from coingecko",
    options: []
  },
];

const rest = new REST({ version: "9" }).setToken(process.env.token);
const rest_tipbot = new REST({ version: "9" }).setToken(process.env.tipbot_token);

(async () => {
  try {
    console.log("Started refreshing application (/) commands.");

    await rest.put(
      Routes.applicationGuildCommands("1087862421290492019", "1000985457393422367"),
      { body: commands },
    );

    /*
    await rest.put(
      Routes.applicationCommands("1087862421290492019"),
      { body: global_commands },
    );
    */

    await rest_tipbot.put(
      Routes.applicationCommands("1227462655535616020"),
      { body: tipbot_commands },
    );
    

    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error(error);
  }
})();
