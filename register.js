const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const dotenv = require('dotenv');

dotenv.config();

//3: STRING
const commands = [
  {
    name: 'help',
    description: 'Get list of commands for this bot',
    options: []
  },
	{
    name: 'price',
    description: 'Get Astral Credit price data',
    options: []
  },
  {
    name: 'pools',
    description: 'Get Astral Credit pools',
    options: []
  },
  {
    name: 'faucet_stats',
    description: 'Get some neat faucet metrics',
    options: []
  },
  {
    name: 'next_claim',
    description: 'See if your next faucet claim is ready',
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
    name: 'register',
    description: 'Register your address with the bot',
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
    name: 'faucet',
    description: 'Use the XAC faucet!'
  },
  {
    name: 'send',
    //admin only
    default_member_permissions: String(268435456),
    description: 'Send XAC to discord user or address (admin only)',
    options: [
      {
        type: 4,
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
      }
    ]
  },
  {
    name: 'change_register',
    //admin only
    default_member_permissions: String(268435456),
    description: 'Change the registered address of an user (admin only)',
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
    name: 'add_website',
    description: 'Link a website to your address, for the XAC pixel billboard',
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
    name: 'remove_linked_website',
    //admin only
    default_member_permissions: String(268435456),
    description: 'Remove linked website of user (admin only)',
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
    name: 'list_role',
    //admin only
    default_member_permissions: String(268435456),
    description: 'List all users with a role',
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
  }
];

const rest = new REST({ version: '9' }).setToken(process.env.token);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationGuildCommands('1087862421290492019', '1000985457393422367'),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();
