import 'dotenv/config';
import { REST, Routes } from 'discord.js';

const { DC_TOKEN, CLIENT_ID } = process.env;
if (!DC_TOKEN || !CLIENT_ID) {
  console.error('Missing environment variables');
  process.exit(1);
}

const commands = [
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
    name: 'enable-quick-ref',
    description: '(needs set-default-repo) Toggles shortcuts to reference: gh@USER, ##PR_NUMBER, //FILE_PATH',
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
      },
      {
        type: 5,
        name: 'show-contents',
        description: 'Whether to show the contents of the file',
        required: false,
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
];

const rest = new REST({ version: '10' }).setToken(DC_TOKEN);

try {
  console.log('Started refreshing application (/) commands.');

  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });

  console.log('Successfully reloaded application (/) commands.');
} catch (error) {
  console.error(error);
}
