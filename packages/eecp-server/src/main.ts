/**
 * EECP Server Entry Point
 */

import { EECPServer } from './lib/eecp-server.js';
import { WorkspaceManager } from './lib/workspace-manager.js';
import { ParticipantManager } from './lib/participant-manager.js';
import { OperationRouter } from './lib/operation-router.js';
import { TemporalCleanupService } from './lib/temporal-cleanup-service.js';
import { RateLimiter } from './lib/rate-limiter.js';
import { MetricsService } from './lib/metrics-service.js';
import { ParticipantAuth, eciesConfig } from '@digitaldefiance-eecp/eecp-crypto';
import { ECIESService } from '@digitaldefiance/ecies-lib';

const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

// Initialize dependencies
const eciesService = new ECIESService(eciesConfig);
const participantAuth = new ParticipantAuth();
const workspaceManager = new WorkspaceManager(eciesService);
const participantManager = new ParticipantManager(participantAuth);
const operationRouter = new OperationRouter(participantManager, workspaceManager);
const cleanupService = new TemporalCleanupService(workspaceManager, operationRouter);
const rateLimiter = new RateLimiter();
const metricsService = new MetricsService();

// Create and start server
const server = new EECPServer(
  workspaceManager,
  participantManager,
  operationRouter,
  cleanupService,
  participantAuth,
  rateLimiter,
  metricsService,
  { port, host }
);

server.start().then(() => {
  console.log(`EECP Server started on ${host}:${port}`);
}).catch((error) => {
  console.error('Failed to start EECP Server:', error);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down EECP Server...');
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down EECP Server...');
  await server.stop();
  process.exit(0);
});
