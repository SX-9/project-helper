import { Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';

const { TOKEN } = process.env;
if (!TOKEN) {
  console.error('Missing environment variable: TOKEN');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on(Events.ClientReady, readyClient => {
  console.log(`Logged in as ${readyClient.user.tag}!`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  switch (interaction.commandName) {
    case 'ping':
      await interaction.reply({ content: `Latency: ${interaction.createdTimestamp - Date.now()}ms`, flags: MessageFlags.Ephemeral });
      break;
  }
});

client.login(TOKEN);