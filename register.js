const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

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
