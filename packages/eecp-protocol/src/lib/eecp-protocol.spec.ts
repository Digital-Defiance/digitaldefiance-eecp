import * as Protocol from './eecp-protocol.js';

describe('eecp-protocol', () => {
  it('should export core types', () => {
    // Verify that key types are exported
    expect(Protocol).toBeDefined();
    
    // Type checks - these will fail at compile time if types are not exported
    const workspaceId: Protocol.WorkspaceId = 'test-workspace-id';
    const participantId: Protocol.ParticipantId = 'test-participant-id';
    const operationId: Protocol.OperationId = 'test-operation-id';
    
    expect(workspaceId).toBeDefined();
    expect(participantId).toBeDefined();
    expect(operationId).toBeDefined();
  });

  it('should export TimeWindow interface', () => {
    const timeWindow: Protocol.TimeWindow = {
      startTime: Date.now(),
      endTime: Date.now() + 3600000,
      rotationInterval: 15,
      gracePeriod: 60000,
    };
    
    expect(timeWindow).toBeDefined();
    expect(timeWindow.rotationInterval).toBe(15);
  });

  it('should export WorkspaceConfig interface', () => {
    const config: Protocol.WorkspaceConfig = {
      id: 'workspace-1',
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000,
      timeWindow: {
        startTime: Date.now(),
        endTime: Date.now() + 3600000,
        rotationInterval: 15,
        gracePeriod: 60000,
      },
      maxParticipants: 50,
      allowExtension: true,
    };
    
    expect(config).toBeDefined();
    expect(config.maxParticipants).toBe(50);
  });

  it('should export message types', () => {
    const messageType: Protocol.MessageType = 'handshake';
    const errorCode: Protocol.ErrorCode = 'AUTH_FAILED';
    
    expect(messageType).toBe('handshake');
    expect(errorCode).toBe('AUTH_FAILED');
  });

  it('should export MessageEnvelope interface', () => {
    const envelope: Protocol.MessageEnvelope = {
      type: 'operation',
      payload: {},
      timestamp: Date.now(),
      messageId: 'msg-1',
    };
    
    expect(envelope).toBeDefined();
    expect(envelope.type).toBe('operation');
  });

  it('should export CRDTOperation interface', () => {
    const operation: Protocol.CRDTOperation = {
      id: 'op-1',
      participantId: 'participant-1',
      timestamp: Date.now(),
      type: 'insert',
      position: 0,
      content: 'Hello',
    };
    
    expect(operation).toBeDefined();
    expect(operation.type).toBe('insert');
  });

  it('should export EncryptedOperation interface', () => {
    const encryptedOp: Protocol.EncryptedOperation = {
      id: 'op-1',
      workspaceId: 'workspace-1',
      participantId: 'participant-1',
      timestamp: Date.now(),
      position: 0,
      operationType: 'insert',
      encryptedContent: Buffer.from('encrypted'),
      signature: Buffer.from('signature'),
    };
    
    expect(encryptedOp).toBeDefined();
    expect(encryptedOp.operationType).toBe('insert');
  });
});
