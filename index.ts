import { ActionRowBuilder, ActivityType, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, Events, GatewayIntentBits, MessageFlags, PermissionsBitField, PresenceUpdateStatus } from "discord.js";
import { Octokit } from "octokit";
import { MongoClient } from "mongodb";

const { GH_TOKEN, DC_TOKEN, MONGODB_URI } = process.env;
if (!GH_TOKEN || !DC_TOKEN || !MONGODB_URI) {
  console.error("Missing environment variables");
  process.exit(1);
}

const github = new Octokit({ auth: GH_TOKEN });
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const mongo = await MongoClient.connect(MONGODB_URI);
const collection = mongo.db('project-helper').collection('server_config');

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
  let repoName = '';
  const { options, guildId: serverId } = interaction;
  const responseEmbed = new EmbedBuilder()
    .setColor(0x24292E)
    .setFooter({ text: `Latency: ${Date.now() - interaction.createdTimestamp}ms` });

  switch (interaction.commandName) {
    case "ping":
      return await interaction.reply({
        embeds: [responseEmbed.setDescription("Pong!")],
        flags: MessageFlags.Ephemeral,
      });

    case "set-default-repo":
      if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
        responseEmbed.setDescription("You need the **Manage Server** permission to set the default repository.");
        return await interaction.reply({
          embeds: [responseEmbed],
          flags: MessageFlags.Ephemeral,
        });
      } else await interaction.deferReply();

      const defaultRepo = options.getString('repository', true);
      try {
        await collection.updateOne(
          { serverId },
          { $set: { serverId, defaultRepo }, $setOnInsert: { quickRefEnabled: false } },
          { upsert: true }
        );
        responseEmbed.setDescription(`Default repository set to **${defaultRepo}**.`);
      } catch (error) {
        console.error(error);
        responseEmbed.setDescription(`Failed to set default repository: ${error}`);
      }
      break;
      
    case "set-quick-ref":
      if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
        responseEmbed.setDescription("You need the **Manage Server** permission to set quick references.");
        return await interaction.reply({
          embeds: [responseEmbed],
          flags: MessageFlags.Ephemeral,
        });
      } else await interaction.deferReply();

      const quickRefEnabled = options.getBoolean('enable', true);
      try {
        await collection.updateOne(
          { serverId },
          { $set: { serverId, quickRefEnabled }, $setOnInsert: { defaultRepo: 'SX-9/project-helper' } },
          { upsert: true }
        );
        responseEmbed.setDescription(`Quick reference set to **${quickRefEnabled}**.`);
      } catch (error) {
        console.error(error);
        responseEmbed.setDescription(`Failed to set quick reference: ${error}`);
      } 
      break;

    case "get-settings":
      await interaction.deferReply();
      try {
        const settings = await collection.findOne({ serverId });
        if (!settings) {
          responseEmbed.setDescription("No settings found for this server.");
        } else {
          responseEmbed
            .setTitle(`Server Settings for ${interaction.guild?.name}`)
            .setDescription(`_Server ID: ${serverId}_`)
            .addFields(
              { name: "Default Repository", value: `_[${settings.defaultRepo}](https://github.com/${settings.defaultRepo})_` || "_Not set_" },
              { name: "Quick Reference", value: settings.quickRefEnabled ? "_Yes_" : "_No_" }
            );
        }
      } catch (error) {
        console.error(error);
        responseEmbed.setDescription(`Failed to get settings: ${error}`);
      }
      break;

    case "user":
      await interaction.deferReply();

      const username = options.getString('username', true);
      let user;
      try {
        const { data } = await github.rest.users.getByUsername({ username });
        user = data;
      } catch (error) {
        console.error(error);
        return await interaction.editReply({
          embeds: [responseEmbed.setDescription(`User ${username} not found on GitHub.`)],
        });
      }

      responseEmbed
        .setThumbnail(user.avatar_url)
        .setTitle(username)
        .setDescription(`**[${user.name}](${user.html_url})** - _${user.bio}_ \n\n**${user.location}** - **${user.followers}** followers - **${user.following}** following`);

      if (options.getBoolean('show-repositories', false)) {
        try {
          const { data } = await github.rest.repos.listForUser({
            username, 
            per_page: 9,
            sort: "updated"
          });
          responseEmbed.addFields(...data.map((item) => ({
            name: `${item.name} ${item.fork ? '_(Fork)_' : ''}`, inline: true,
            value: `${item.description || '_No description._'} [↗](${item.html_url})`,
          })));
        } catch (error) {
          console.error(error);
          responseEmbed.addFields({
            name: '_Failed to fetch repositories._',
            value: error as string, 
          });
        }
      }
      break;

    case "repo":
      await interaction.deferReply();

      try {
        const serverSettings = await collection.findOne({ serverId });
        repoName = serverSettings?.defaultRepo || process.env?.DEFAULT_REPO || 'SX-9/project-helper';
      } catch (error) {
        console.error(error);
      }
      if (options.getString('repository')) repoName = options.getString('repository', true);
      
      try {
        const [owner, repo] = repoName.split('/');
        if (!owner || !repo) {
          responseEmbed.setDescription(`Invalid repository format: ${repoName}. Expected "owner/repo".`);
        } else {
          const { data } = await github.rest.repos.get({ owner, repo });
          responseEmbed
            .setTitle(data.full_name)
            .setURL(data.html_url)
            .setDescription(`${data.description || '_No description._'}\n\n**${data.stargazers_count}** stars- **${data.forks_count}** forks - **${data.open_issues_count}** issues`)
            .setThumbnail(data.owner.avatar_url);
        }
      } catch (error) {
        console.error(error);
        return await interaction.editReply({
          embeds: [responseEmbed.setDescription(`Repository ${repoName} not found on GitHub.`)],
        });
      }
      break;
    
    case "file":
      await interaction.deferReply();

      try {
        const serverSettings = await collection.findOne({ serverId });
        repoName = serverSettings?.defaultRepo || process.env?.DEFAULT_REPO || 'SX-9/project-helper';
      } catch (error) {
        console.error(error);
      }
      if (options.getString('repository')) repoName = options.getString('repository', true);

      try {
        const path = options.getString('file-path', true);
        const [owner, repo] = repoName.split('/');
        if (!owner || !repo) responseEmbed.setDescription(`Invalid repository format: ${repoName}. Expected "owner/repo".`);
        else {
          const { data } = await github.rest.repos.getContent({
            owner, repo, path,
          });

          if (Array.isArray(data)) {
            const contents = data.sort((a, b) => {
              if (a.type === b.type) return a.name.localeCompare(b.name);
              if (a.type === 'dir') return -1;
              if (b.type === 'dir') return 1;
              return 0;
            });
            const typeKV = {
              file: '📄',
              dir: '📁',
              submodule: '📤',
              symlink: '⛓️',
            };
            responseEmbed
              .setTitle(`Contents of \`${path}\`:`)
              .setDescription(contents.map(item => `${typeKV[item.type]} [${item.name}](${item.html_url})`).join('\n') || '_No files found._');
          } else if (data.type === 'file' && typeof data.content === 'string') {
            const contents = Buffer.from(data.content, 'base64').toString('utf-8');
            const extension = path.split('.').pop();
            const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension as string);
            const header = `[Download](${data.download_url}) - ${data.size} bytes \n\n`;
            const description = `${header}${data.content
              ? extension == 'md'
                ? `${contents}`
                : `\`\`\`${extension}\n${contents}\n\`\`\``
              : isImage ? '' : `_File content is not available to display or empty._`
            }`;

            responseEmbed
              .setTitle(`File: ${data.name}`)
              .setURL(data.html_url)
              .setDescription(description.length > 4096 ? '${header}_File content is too big to display._' : description)
            if (isImage) responseEmbed.setImage(data.download_url);
          } else {
            responseEmbed.setDescription('_File content is not available to display or not a regular file._');
          }
        }
      } catch (error) {
        console.error(error);
        return await interaction.editReply({
          embeds: [responseEmbed.setDescription(`File not found in repository ${repoName}.`)],
        });
      }
      break; 
  }
  
  await interaction.editReply({
    embeds: [ responseEmbed ],
  });
});

client.login(DC_TOKEN);
