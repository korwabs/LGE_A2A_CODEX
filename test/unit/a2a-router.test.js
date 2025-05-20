const { A2ARouter } = require('@/protocols/a2a-router');

describe('A2ARouter', () => {
  let router;
  let mockAgent1;
  let mockAgent2;

  beforeEach(() => {
    router = new A2ARouter();
    
    mockAgent1 = {
      processMessage: jest.fn().mockResolvedValue({ response: 'from agent 1' })
    };
    
    mockAgent2 = {
      processMessage: jest.fn().mockResolvedValue({ response: 'from agent 2' })
    };
    
    router.registerAgent('agent1', mockAgent1);
    router.registerAgent('agent2', mockAgent2);
  });

  test('should register agents correctly', () => {
    expect(router.agents.has('agent1')).toBe(true);
    expect(router.agents.has('agent2')).toBe(true);
    expect(router.agents.get('agent1')).toBe(mockAgent1);
    expect(router.agents.get('agent2')).toBe(mockAgent2);
  });

  test('should validate message format', async () => {
    const invalidMessage = {
      // Missing required fields
      fromAgent: 'agent1',
      toAgent: 'agent2'
    };

    await expect(router.sendMessage(invalidMessage)).rejects.toThrow(
      'Invalid message format'
    );
  });

  test('should route messages to the correct agent', async () => {
    const message = {
      messageId: 'msg_123',
      fromAgent: 'agent1',
      toAgent: 'agent2',
      messageType: 'request',
      intent: 'testIntent',
      payload: { data: 'test' },
      timestamp: '2025-05-19T15:30:00Z'
    };

    const result = await router.sendMessage(message);
    
    expect(mockAgent2.processMessage).toHaveBeenCalledWith(message);
    expect(result).toEqual({ response: 'from agent 2' });
  });

  test('should throw error for unknown target agent', async () => {
    const message = {
      messageId: 'msg_123',
      fromAgent: 'agent1',
      toAgent: 'unknownAgent',
      messageType: 'request',
      intent: 'testIntent',
      payload: { data: 'test' },
      timestamp: '2025-05-19T15:30:00Z'
    };

    await expect(router.sendMessage(message)).rejects.toThrow(
      'Agent unknownAgent not registered'
    );
  });

  test('should broadcast messages to all other agents', async () => {
    const fromAgent = 'agent1';
    const messageType = 'notification';
    const intent = 'systemStatus';
    const payload = { status: 'online' };
    
    await router.broadcastMessage(fromAgent, messageType, intent, payload);
    
    // Should send to all agents except the sender (agent1)
    expect(mockAgent1.processMessage).not.toHaveBeenCalled();
    expect(mockAgent2.processMessage).toHaveBeenCalledWith(expect.objectContaining({
      fromAgent,
      toAgent: 'agent2',
      messageType,
      intent,
      payload
    }));
  });

  test('should log messages', async () => {
    // Spy on console.log
    jest.spyOn(console, 'log').mockImplementation();
    
    // Set log level to debug
    router.logLevel = 'debug';
    
    const message = {
      messageId: 'msg_123',
      fromAgent: 'agent1',
      toAgent: 'agent2',
      messageType: 'request',
      intent: 'testIntent',
      payload: { data: 'test' },
      timestamp: '2025-05-19T15:30:00Z'
    };

    await router.sendMessage(message);
    
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('agent1 -> agent2')
    );
    
    // Restore console.log
    console.log.mockRestore();
  });
});
