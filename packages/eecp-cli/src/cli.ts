#!/usr/bin/env node

/**
 * EECP CLI Entry Point
 * Command-line interface for Ephemeral Encrypted Collaboration Protocol
 */

import { Command } from 'commander';
import { GuidV4 } from '@digitaldefiance/ecies-lib';
import { EECPClient } from '@digitaldefiance/eecp-client';
import { CLICommands } from './lib/cli-commands.js';

const program = new Command();

program
  .name('eecp')
  .description('Ephemeral Encrypted Collaboration Protocol CLI')
  .version('1.0.0');

program
  .command('create')
  .description('Create a new workspace')
  .option('-d, --duration <minutes>', 'Workspace duration in minutes', '30')
  .option(
    '-m, --max-participants <number>',
    'Maximum participants',
    '50'
  )
  .option('-e, --allow-extension', 'Allow workspace extension', false)
  .option(
    '-s, --server <url>',
    'Server URL',
    'ws://localhost:3000'
  )
  .action(async (options) => {
    try {
      const client = new EECPClient();
      await client.connect(options.server);

      const commands = new CLICommands(client);
      await commands.create({
        duration: parseInt(options.duration),
        maxParticipants: parseInt(options.maxParticipants),
        allowExtension: options.allowExtension,
      });

      client.disconnect();
    } catch (error) {
      console.error('\n❌ Error creating workspace:', error);
      process.exit(1);
    }
  });

program
  .command('join <workspace-id>')
  .description('Join an existing workspace')
  .requiredOption('-k, --key <key>', 'Base64 encoded temporal key')
  .option(
    '-s, --server <url>',
    'Server URL',
    'ws://localhost:3000'
  )
  .action(async (workspaceIdStr, options) => {
    try {
      const client = new EECPClient();
      await client.connect(options.server);

      // Parse workspace ID
      const workspaceId = new GuidV4(workspaceIdStr);

      const commands = new CLICommands(client);
      await commands.join(workspaceId, { key: options.key });

      // Note: disconnect is handled by the terminal editor on exit
    } catch (error) {
      console.error('\n❌ Error joining workspace:', (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List your workspaces')
  .action(async () => {
    try {
      const client = new EECPClient();
      const commands = new CLICommands(client);
      await commands.list();
    } catch (error) {
      console.error('\n❌ Error listing workspaces:', (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('export <workspace-id> <output>')
  .description('Export workspace content')
  .option(
    '-s, --server <url>',
    'Server URL',
    'ws://localhost:3000'
  )
  .action(async (workspaceIdStr, output, options) => {
    try {
      const client = new EECPClient();
      await client.connect(options.server);

      // Parse workspace ID
      const workspaceId = new GuidV4(workspaceIdStr);

      const commands = new CLICommands(client);
      await commands.export(workspaceId, output);

      client.disconnect();
    } catch (error) {
      console.error('\n❌ Error exporting workspace:', (error as Error).message);
      process.exit(1);
    }
  });

program.parse();
