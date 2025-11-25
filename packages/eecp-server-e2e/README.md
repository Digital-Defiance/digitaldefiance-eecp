# EECP End-to-End Integration Tests

This package contains comprehensive end-to-end integration tests and load tests for the EECP system.

## Test Files

### 1. `integration-tests.spec.ts`
Comprehensive integration tests covering:
- **Complete Workspace Lifecycle** (Requirements 1.1, 1.4, 1.5, 1.6)
  - Workspace creation and retrieval
  - Workspace extension
  - Early workspace revocation
  - Workspace expiration detection

- **Multi-Participant Collaboration** (Requirements 4.7, 8.4, 8.3)
  - Concurrent CRDT operations with convergence
  - Mid-session join with state synchronization
  - Operation ordering and consistency

- **Network Resilience** (Requirements 8.3, 11.5, 11.6)
  - Offline operation buffering
  - State recovery after disconnection

- **Key Rotation and Grace Period** (Requirements 2.3, 2.4, 2.6, 4.2)
  - Deterministic key derivation
  - Grace period validation
  - Key deletion commitments
  - Encryption/decryption with temporal keys

- **Workspace Expiration and Cleanup** (Requirements 18.1, 1.4)
  - Expired workspace cleanup
  - Buffered operations cleanup
  - Prevention of operations on expired workspaces

- **Error Handling**
  - Invalid workspace ID handling
  - Concurrent operations on same position
  - Empty CRDT operations

### 2. `load-tests.spec.ts`
Performance and scalability tests covering:
- **Concurrent Participants** (Requirement 17.4)
  - 50+ concurrent participants
  - 100 concurrent participants (stress test)
  - Memory usage monitoring

- **High Operation Rate** (Requirement 17.1)
  - 100+ operations per second
  - Sustained high load
  - Encryption performance under load

- **Resource Usage**
  - Memory usage monitoring
  - CPU efficiency
  - Garbage collection impact

- **Scalability**
  - Multiple concurrent workspaces
  - Operation broadcast scalability

## Running the Tests

### Prerequisites

Before running the tests, ensure the server package builds successfully:

```bash
npx nx build eecp-server
```

**Note:** Currently there are build errors in the server package that need to be resolved:
- Missing `@digitaldefiance/eecp-protocol` module exports
- Type mismatches with `IMultiEncryptedMessage` and `Buffer`
- Missing `stop()` method on `IRateLimiter`
- GuidV4 property access issues

### Running Integration Tests

Once the server builds successfully:

```bash
# Run all e2e tests
npx nx e2e eecp-server-e2e

# Run only integration tests
npx nx e2e eecp-server-e2e --testNamePattern="E2E:"

# Run specific test suite
npx nx e2e eecp-server-e2e --testNamePattern="Complete Workspace Lifecycle"
```

### Running Load Tests

Load tests are resource-intensive and should be run separately:

```bash
# Run all load tests
npx nx e2e eecp-server-e2e --testNamePattern="Load Tests"

# Run specific load test suite
npx nx e2e eecp-server-e2e --testNamePattern="Concurrent Participants"
npx nx e2e eecp-server-e2e --testNamePattern="High Operation Rate"
npx nx e2e eecp-server-e2e --testNamePattern="Resource Usage"
```

### Running with Memory Profiling

To enable garbage collection monitoring in load tests:

```bash
node --expose-gc $(which nx) e2e eecp-server-e2e --testNamePattern="Load Tests"
```

## Test Coverage

The integration tests validate:
- ✅ Complete workspace lifecycle (create, extend, revoke, expire)
- ✅ Multi-participant CRDT convergence
- ✅ Network resilience and reconnection
- ✅ Temporal key rotation and grace period
- ✅ Workspace cleanup and data deletion
- ✅ Error handling and edge cases

The load tests validate:
- ✅ 50+ concurrent participants per workspace
- ✅ 100+ operations per second throughput
- ✅ Memory usage under load
- ✅ CPU efficiency
- ✅ Scalability across multiple workspaces

## Performance Benchmarks

Expected performance characteristics:
- **Participant Creation**: < 100ms per participant
- **Operation Generation**: < 20ms per operation
- **Operation Application**: > 100 ops/sec
- **Encryption**: < 10ms per operation
- **Decryption**: < 10ms per operation
- **Memory per Participant**: < 10MB
- **Broadcast Latency**: < 100ms for 50 participants

## Next Steps

1. **Fix Server Build Errors**: Resolve the TypeScript compilation errors in the server package
2. **Run Integration Tests**: Execute the full integration test suite
3. **Run Load Tests**: Validate performance under load
4. **Optimize**: Address any performance bottlenecks identified by load tests
5. **CI/CD Integration**: Add tests to continuous integration pipeline

## Notes

- Integration tests use real component instances (not mocks) to validate actual system behavior
- Load tests include memory profiling and performance metrics
- Tests are designed to be deterministic and repeatable
- All tests include detailed console logging for debugging and analysis
