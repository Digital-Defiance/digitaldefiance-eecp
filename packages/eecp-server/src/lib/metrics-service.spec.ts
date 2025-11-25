/**
 * Unit tests for Metrics Service
 */

import { MetricsService } from './metrics-service';

describe('MetricsService', () => {
  let metricsService: MetricsService;

  beforeEach(() => {
    metricsService = new MetricsService();
  });

  describe('workspace count metrics', () => {
    it('should increment workspace count', async () => {
      metricsService.incrementWorkspaceCount();
      metricsService.incrementWorkspaceCount();

      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('eecp_workspace_count 2');
    });

    it('should decrement workspace count', async () => {
      metricsService.setWorkspaceCount(5);
      metricsService.decrementWorkspaceCount();

      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('eecp_workspace_count 4');
    });

    it('should set workspace count', async () => {
      metricsService.setWorkspaceCount(10);

      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('eecp_workspace_count 10');
    });
  });

  describe('participant count metrics', () => {
    it('should increment participant count', async () => {
      metricsService.incrementParticipantCount();
      metricsService.incrementParticipantCount();
      metricsService.incrementParticipantCount();

      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('eecp_participant_count 3');
    });

    it('should decrement participant count', async () => {
      metricsService.setParticipantCount(8);
      metricsService.decrementParticipantCount();

      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('eecp_participant_count 7');
    });

    it('should set participant count', async () => {
      metricsService.setParticipantCount(15);

      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('eecp_participant_count 15');
    });
  });

  describe('operation metrics', () => {
    it('should record operations', async () => {
      metricsService.recordOperation();
      metricsService.recordOperation();
      metricsService.recordOperation();

      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('eecp_operations_total 3');
    });

    it('should record operation latency', async () => {
      metricsService.recordOperationLatency(50);
      metricsService.recordOperationLatency(100);
      metricsService.recordOperationLatency(150);

      const metrics = await metricsService.getMetrics();
      // Check that histogram metrics are present
      expect(metrics).toContain('eecp_operation_latency_ms');
      expect(metrics).toContain('eecp_operation_latency_ms_count 3');
    });

    it('should track operation latency in buckets', async () => {
      // Record latencies in different buckets
      metricsService.recordOperationLatency(5);   // bucket: 5
      metricsService.recordOperationLatency(25);  // bucket: 25
      metricsService.recordOperationLatency(100); // bucket: 100
      metricsService.recordOperationLatency(500); // bucket: 500

      const metrics = await metricsService.getMetrics();
      
      // Verify histogram buckets are present
      expect(metrics).toContain('eecp_operation_latency_ms_bucket{le="5"}');
      expect(metrics).toContain('eecp_operation_latency_ms_bucket{le="25"}');
      expect(metrics).toContain('eecp_operation_latency_ms_bucket{le="100"}');
      expect(metrics).toContain('eecp_operation_latency_ms_bucket{le="500"}');
    });
  });

  describe('metrics format', () => {
    it('should return metrics in Prometheus format', async () => {
      metricsService.setWorkspaceCount(5);
      metricsService.setParticipantCount(10);
      metricsService.recordOperation();

      const metrics = await metricsService.getMetrics();

      // Check Prometheus format
      expect(metrics).toContain('# HELP');
      expect(metrics).toContain('# TYPE');
      expect(typeof metrics).toBe('string');
    });

    it('should include default metrics', async () => {
      const metrics = await metricsService.getMetrics();

      // Default metrics should include process metrics
      expect(metrics).toContain('process_cpu');
      expect(metrics).toContain('nodejs_');
    });
  });

  describe('registry', () => {
    it('should provide access to registry', () => {
      const registry = metricsService.getRegistry();
      expect(registry).toBeDefined();
      expect(typeof registry.metrics).toBe('function');
    });

    it('should have correct content type', () => {
      const registry = metricsService.getRegistry();
      expect(registry.contentType).toContain('text/plain');
    });
  });
});
