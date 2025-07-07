import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { MongoClient } from 'mongodb';

const { DC_TOKEN, CLIENT_ID, MONGODB_URI } = process.env;
if (!DC_TOKEN || !CLIENT_ID || !MONGODB_URI) {
  console.error('Missing environment variables');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(DC_TOKEN);
const mongo = await MongoClient.connect(MONGODB_URI);
const db = mongo.db('project-helper');

try {
  console.log('Started refreshing application (/) commands.');
  const commands = [
    new SlashCommandBuilder()
      .setName('ping')
      .setDescription('Replies with Pong!'),
    new SlashCommandBuilder()
      .setName('set-default-repo')
      .setDescription('Sets the default repository for commands in this server')
      .addStringOption(option =>
        option.setName('repository')
          .setDescription('The repository in the format owner/repo')
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('set-quick-ref')
      .setDescription('(needs set-default-repo) Toggles shortcuts to reference: ##PR_NUMBER, //FILE_PATH')
      .addBooleanOption(option =>
        option.setName('enable')
          .setDescription('Whether to enable or disable quick references')
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('get-settings')
      .setDescription('Gets the settings for the current server'),
    new SlashCommandBuilder()
      .setName('user')
      .setDescription('Gets user/organization information from GitHub')
      .addStringOption(option =>
        option.setName('username')
          .setDescription('The GitHub username or organization name')
          .setRequired(true)
      )
      .addBooleanOption(option =>
        option.setName('show-repositories')
          .setDescription('Whether to show the user\'s repositories')
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName('repo')
      .setDescription('Gets repository information from GitHub')
      .addStringOption(option =>
        option.setName('repository')
          .setDescription('The repository in the format owner/repo')
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName('file')
      .setDescription('Gets file information from a GitHub repository')
      .addStringOption(option =>
        option.setName('file-path')
          .setDescription('The path to the file in the repository')
          .setRequired(true)
          .addChoices(
            { name: 'Readme File', value: 'README.md' },
            { name: 'Code License', value: 'LICENSE' },
            { name: 'Root Directory', value: '.' }
          )
      )
      .addStringOption(option =>
        option.setName('repository')
          .setDescription('The repository in the format owner/repo')
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName('pr')
      .setDescription('Gets pull request/issue information from GitHub')
      .addIntegerOption(option =>
        option.setName('pr-issue-number')
          .setDescription('PR/Issue number in the repository')
          .setRequired(true)
      )
      .addStringOption(option =>
        option.setName('repository')
          .setDescription('The repository in the format owner/repo')
          .setRequired(false)
      ),
  ].map(command => command.toJSON());

  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });

  console.log('Creating database collections if they do not exist.');
  // try {
  //   await db.dropCollection('server_config');
  // } catch {}
  await db.createCollection('server_config', {
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["serverId", "defaultRepo", "quickRefEnabled"],
        properties: {
          serverId: {
            bsonType: "string",
          },
          defaultRepo: {
            bsonType: "string",
          },
          quickRefEnabled: {
            bsonType: "bool",
          }
        }
      }
    },
  });

  console.log('Initialization complete.');
} catch (error) {
  console.error(error);
}
