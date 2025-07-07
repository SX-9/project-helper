import 'dotenv/config';
import { Options, REST, Routes } from 'discord.js';
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
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [
    {
      name: 'ping',
      description: 'Replies with Pong!',
    },
    {
      name: 'set-default-repo',
      description: 'Sets the default repository for commands in this server',
      options: [
        {
          type: 3,
          name: 'repository',
          description: 'The repository in the format owner/repo',
          required: true,
        },
      ]
    },
    {
      name: 'set-quick-ref',
      description: '(needs set-default-repo) Toggles shortcuts to reference: ##PR_NUMBER, //FILE_PATH',
      options: [
       {
        type: 5,
        name: 'enable',
        description: 'Whether to enable or disable quick references',
        required: true,
       }, 
      ]
    },
    {
      name: 'get-settings',
      description: 'Gets the settings for the current server',
    },
    {
      name: 'user',
      description: 'Gets user/organization information from GitHub',
      options: [
        {
          type: 3,
          name: 'username',
          description: 'The GitHub username or organization name',
          required: true,
        },
        {
          type: 5,
          name: 'show-repositories',
          description: 'Whether to show the user\'s repositories',
          required: false,
        },
      ]
    },
    {
      name: 'repo',
      description: 'Gets repository information from GitHub',
      options: [
        {
          type: 3,
          name: 'repository',
          description: 'The repository in the format owner/repo',
          required: false,
        },
      ]
    },
    {
      name: 'file',
      description: 'Gets file information from a GitHub repository',
      options: [
        {
          type: 3,
          name: 'file-path',
          description: 'The path to the file in the repository',
          required: true,
          choices: [
            {
              name: 'Readme File',
              value:'README.md',
            },
            {
              name: 'Code License',
              value: 'LICENSE',
            },
            {
              name: 'Root Directory',
              value: '.',
            }, ],
        },
        {
          type: 3,
          name: 'repository',
          description: 'The repository in the format owner/repo',
          required: false,
        },
      ]
    },
    {
      name: 'pr',
      description: 'Gets pull request/issue information from GitHub',
      options: [
        {
          type: 4,
          name: 'pr-issue-number',
          description: 'PR/Issue number in the repository',
          required: true,
        },
        {
          type: 3,
          name: 'repository',
          description: 'The repository in the format owner/repo',
          required: false,
        },
      ]
    },
  ]});

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
