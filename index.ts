import { ActionRowBuilder, ActivityType, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, Events, GatewayIntentBits, MessageFlags, PresenceUpdateStatus } from "discord.js";
import { Octokit } from "octokit";

const { GH_TOKEN, DC_TOKEN } = process.env;
if (!GH_TOKEN || !DC_TOKEN) {
  console.error("Missing environment variables");
  process.exit(1);
}

const github = new Octokit({ auth: GH_TOKEN });
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}!`);
  await client.user?.setPresence({
    activities: [{
      name: 'GitHub PRs',
      type: ActivityType.Watching
    }],
    status: PresenceUpdateStatus.Idle
  });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const responseEmbed = new EmbedBuilder()
    .setColor(0x24292E)
    .setFooter({ text: `Latency: ${Date.now() - interaction.createdTimestamp}ms` });
  const linkButton = new ButtonBuilder()
    .setStyle(ButtonStyle.Link);

  switch (interaction.commandName) {
    case "ping":
      await interaction.reply({
        embeds: [responseEmbed.setDescription("Pong!")],
        flags: MessageFlags.Ephemeral,
      });
      break;
    case "user":
      await interaction.deferReply();

      const { options } = interaction;
      const username = options.getString('username', true);
      
      let user;
      try {
        const { data } = await github.rest.users.getByUsername({ username });
        user = data;
      } catch (error) {
        return await interaction.editReply({
          embeds: [responseEmbed.setDescription(`User ${username} not found on GitHub.`)],
        });
      }

      linkButton
        .setURL(user.html_url)
        .setLabel('Open in GitHub');

      responseEmbed
        .setThumbnail(user.avatar_url)
        .setTitle(username)
        .setDescription(`**${user.name}** - _${user.bio}_ \n\n**${user.location}** - **${user.followers}** followers - **${user.following}** following`);

      if (options.getBoolean('show-repositories', false)) {
        try {
          const { data } = await github.rest.repos.listForUser({
            username, 
            per_page: 9,
            sort: "updated"
          });
          responseEmbed.addFields(...data.map((item) => ({
            name: `${item.name} ${item.fork ? '_(Fork)_' : ''}`, inline: true,
            value: item.description || '_No description._',
          })));
        } catch (error) {
          responseEmbed.addFields({
            name: '_Failed to fetch repositories._',
            value: error as string, 
          })
        }
      }
      
      const row = new ActionRowBuilder().addComponents(linkButton); 
      await interaction.editReply({
        embeds: [ responseEmbed ],
        components: [ row.toJSON() ]
      });
  }
});

client.login(DC_TOKEN);
