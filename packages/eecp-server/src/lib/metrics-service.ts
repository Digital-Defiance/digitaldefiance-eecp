/**
 * Metrics Service
 * 
 * Provides Prometheus metrics for monitoring EECP server health and performance.
 * Tracks workspace count, participant count, operation rate, and operation latency.
 */

import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';

/**
 * Metrics Service interface
 */
export interface IMetricsService {
  /**
   * Increment workspace count
   */
  incrementWorkspaceCount(): void;

  /**
   * Decrement workspace count
   */
  decrementWorkspaceCount(): void;

  /**
   * Set current workspace count
   */
  setWorkspaceCount(count: number): void;

  /**
   * Increment participant count
   */
  incrementParticipantCount(): void;

  /**
   * Decrement participant count
   */
  decrementParticipantCount(): void;

  /**
   * Set current participant count
   */
  setParticipantCount(count: number): void;

  /**
   * Record an operation
   */
  recordOperation(): void;

  /**
   * Record operation latency
   */
  recordOperationLatency(latencyMs: number): void;

  /**
   * Get metrics in Prometheus format
   */
  getMetrics(): Promise<string>;

  /**
   * Get registry for custom metrics
   */
  getRegistry(): Registry;
}

/**
 * Metrics Service implementation
 */
export class MetricsService implements IMetricsService {
  private registry: Registry;
  private workspaceCount: Gauge;
  private participantCount: Gauge;
  private operationCounter: Counter;
  private operationLatency: Histogram;

  constructor() {
    // Create a new registry
    this.registry = new Registry();

    // Collect default metrics (CPU, memory, etc.)
    collectDefaultMetrics({ register: this.registry });

    // Workspace count gauge
    this.workspaceCount = new Gauge({
      name: 'eecp_workspace_count',
      help: 'Current number of active workspaces',
      registers: [this.registry],
    });

    // Participant count gauge
    this.participantCount = new Gauge({
      name: 'eecp_participant_count',
      help: 'Current number of connected participants',
      registers: [this.registry],
    });

    // Operation counter
    this.operationCounter = new Counter({
      name: 'eecp_operations_total',
      help: 'Total number of operations processed',
      registers: [this.registry],
    });

    // Operation latency histogram
    this.operationLatency = new Histogram({
      name: 'eecp_operation_latency_ms',
      help: 'Operation processing latency in milliseconds',
      buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
      registers: [this.registry],
    });
  }

  /**
   * Increment workspace count
   */
  incrementWorkspaceCount(): void {
    this.workspaceCount.inc();
  }

  /**
   * Decrement workspace count
   */
  decrementWorkspaceCount(): void {
    this.workspaceCount.dec();
  }

  /**
   * Set current workspace count
   */
  setWorkspaceCount(count: number): void {
    this.workspaceCount.set(count);
  }

  /**
   * Increment participant count
   */
  incrementParticipantCount(): void {
    this.participantCount.inc();
  }

  /**
   * Decrement participant count
   */
  decrementParticipantCount(): void {
    this.participantCount.dec();
  }

  /**
   * Set current participant count
   */
  setParticipantCount(count: number): void {
    this.participantCount.set(count);
  }

  /**
   * Record an operation
   */
  recordOperation(): void {
    this.operationCounter.inc();
  }

  /**
   * Record operation latency
   */
  recordOperationLatency(latencyMs: number): void {
    this.operationLatency.observe(latencyMs);
  }

  /**
   * Get metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Get registry for custom metrics
   */
  getRegistry(): Registry {
    return this.registry;
  }
}
