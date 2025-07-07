import { ActivityType, Client, EmbedBuilder, Events, GatewayIntentBits, MessageFlags, PermissionsBitField, PresenceUpdateStatus } from "discord.js";
import { Octokit } from "octokit";
import { MongoClient } from "mongodb";

const { GH_TOKEN, DC_TOKEN, MONGODB_URI } = process.env;
if (!GH_TOKEN || !DC_TOKEN || !MONGODB_URI) {
  console.error("Missing environment variables");
  process.exit(1);
}

const github = new Octokit({ auth: GH_TOKEN });
const client = new Client({ intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
]});
const mongo = await MongoClient.connect(MONGODB_URI);
const collection = mongo.db('project-helper').collection('server_config');

async function allowQuickRef(serverId: string): Promise<string> {
  const settings = await collection.findOne({ serverId });
  return settings?.quickRefEnabled ? settings.defaultRepo : '';
}

async function prIssueResponse(owner: string, repo: string, prIssueNumber: number, responseEmbed: EmbedBuilder) {
  const { data } = await github.rest.issues.get({
    owner, repo, issue_number: prIssueNumber,
  });

  if (!data) {
    responseEmbed.setDescription(`PR/Issue #${prIssueNumber} not found.`);
  } else {
    responseEmbed
      .setTitle(`#${data.number} ${data.title}`)
      .setURL(data.html_url)
      .setAuthor({
        name: data.user?.login || '',
        iconURL: data.user?.avatar_url,
        url: data.user?.html_url,
      })
      .setColor(data.state === 'open' ? 0x28A745 : 0xB23AD7)
      .setDescription(`${data.body || '_No description._'}\n**${data.state}** - **${data.comments}** comments - **${data.reactions?.total_count}** reactions`)
      .addFields(
        { name: "Created At", value: `${new Date(data.created_at).toLocaleDateString()}`, inline: true },
        { name: "Updated At", value: `${new Date(data.updated_at).toLocaleDateString()}`, inline: true }
      );
  }
}

async function fileResponse(owner: string, repo: string, filePath: string, responseEmbed: EmbedBuilder) {
  const { data } = await github.rest.repos.getContent({
    owner, repo, path: filePath,
  });

  if (Array.isArray(data)) {
    const typeKV = {
      file: '📄',
      dir: '📁',
      submodule: '📤',
      symlink: '⛓️',
    };
    let contents = data.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      if (a.type === 'dir') return -1;
      if (b.type === 'dir') return 1;
      return 0;
    }).map(item => `${typeKV[item.type]} [${item.name}](${item.html_url})`).join('\n');
    if (contents.length > 4096) contents = `Directory too big, +**${data.length}** amount of files`;
    responseEmbed
      .setColor(0x0B0399)
      .setTitle(`Contents of \`${filePath}\`:`)
      .setDescription(contents || '_No files found._');
  } else if (data.type === 'file' && typeof data.content === 'string') {
    const contents = Buffer.from(data.content, 'base64').toString('utf-8');
    const extension = filePath.split('.').pop();
    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension as string);
    const header = `[Download](${data.download_url}) - ${data.size} bytes \n\n`;
    const description = `${header}${data.content
      ? extension == 'md'
        ? `${contents}`
        : `\`\`\`${extension}\n${contents}\n\`\`\``
      : isImage ? '' : '_File content is not available to display or empty._'
    }`;

    responseEmbed
      .setTitle(`File: ${data.name}`)
      .setURL(data.html_url)
      .setDescription(description.length > 4096 ? '${header}_File content is too big to display._' : description)
      .setColor(isImage ? 0xEED605 : 0xB6B6B6);
    if (isImage) responseEmbed.setImage(data.download_url);
  } else {
    responseEmbed.setDescription('_File content is not available to display or not a regular file._');
  }
}

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

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  const embed = new EmbedBuilder()
  let qrRepo, owner, repo;

  switch (message.content.slice(0, 2)) {
    case '##':
      qrRepo = await allowQuickRef(message.guildId || '');
      if (!qrRepo) return;
      [owner, repo] = qrRepo.split('/');

      const prIssueNumber = (message.content.split(' ')[0] as string).slice(2);
      if (!prIssueNumber || isNaN(Number(prIssueNumber))) return;
      await message.channel.sendTyping();

      try {
        await prIssueResponse(owner as string, repo as string, parseInt(prIssueNumber), embed);
        message.reply({
          embeds: [embed],
        });
      } catch (error) {
        console.error(error);
        await message.author.send({
          embeds: [embed.setColor(0xD73A49).setDescription(`_Failed to fetch PR/Issue #${prIssueNumber} from repository ${qrRepo}._`)],
        });
      }
      break;
    case '//':
      qrRepo = await allowQuickRef(message.guildId || '');
      if (!qrRepo) return;
      [owner, repo] = qrRepo.split('/');

      const filePath = (message.content.split(' ')[0] as string).slice(2);
      if (!filePath) return;
      await message.channel.sendTyping();

      try {
        await fileResponse(owner as string, repo as string, filePath, embed);
        message.reply({
          embeds: [embed],
        });
      } catch (error) {
        console.error(error);
        await message.author.send({
          embeds: [embed.setColor(0xD73A49).setDescription(`_Failed to fetch file ${filePath} from repository ${qrRepo}._`)],
        });
      }
      break;
  }
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
        responseEmbed
          .setColor(0xD73A49)
          .setDescription(`_Failed to set default repository: ${error}_`);
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
        responseEmbed
          .setColor(0xD73A49)
          .setDescription(`_Failed to set quick reference: ${error}_`);
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
        responseEmbed
          .setColor(0xD73A49) 
          .setDescription(`_Failed to get settings: ${error}_`);
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
        responseEmbed.setDescription(`Repository ${repoName} not found on GitHub.`)
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
          await fileResponse(owner, repo, path, responseEmbed);
        }
      } catch (error) {
        console.error(error);
        responseEmbed.setDescription(`File not found in repository ${repoName}.`)
      }
      break; 

    case "pr":
      await interaction.deferReply();

      try {
        const serverSettings = await collection.findOne({ serverId });
        repoName = serverSettings?.defaultRepo || process.env?.DEFAULT_REPO || 'SX-9/project-helper';
      } catch (error) {
        console.error(error);
      }
      if (options.getString('repository')) repoName = options.getString('repository', true);

      const prIssueNumber = options.getInteger('pr-issue-number', true);
      const [owner, repo] = repoName.split('/');
      if (!owner || !repo) {
        responseEmbed.setDescription(`Invalid repository format: ${repoName}. Expected "owner/repo".`);
        break;
      }
      try {
        await prIssueResponse(owner, repo, prIssueNumber, responseEmbed);
      } catch (error) {
        console.error(error);
        responseEmbed
          .setColor(0xD73A49)
          .setDescription(`_Failed to fetch PR/Issue #${prIssueNumber} from repository ${repoName}._`);
      }
      break;
  }
  
  await interaction.editReply({
    embeds: [ responseEmbed ],
  });
});

client.login(DC_TOKEN);
