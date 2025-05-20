const A2ABaseAgent = require('@/protocols/a2a-base-agent');
const A2ARouter = require('@/protocols/a2a-router');

describe('A2ABaseAgent', () => {
  let router;
  let agent;
  let mockHandler;

  beforeEach(() => {
    router = new A2ARouter();
    router.registerAgent = jest.fn();
    router.sendMessage = jest.fn().mockResolvedValue({ success: true });
    
    agent = new A2ABaseAgent('testAgent', router);
    mockHandler = jest.fn().mockResolvedValue({ result: 'success' });
    agent.registerMessageHandler('testIntent', mockHandler);
  });

  test('should register itself with the router on creation', () => {
    expect(router.registerAgent).toHaveBeenCalledWith('testAgent', agent);
  });

  test('should register message handlers correctly', () => {
    expect(agent.messageHandlers.has('testIntent')).toBe(true);
    expect(agent.messageHandlers.get('testIntent')).toBe(mockHandler);
  });

  test('should process messages correctly', async () => {
    const message = {
      messageId: 'msg_123',
      fromAgent: 'otherAgent',
      toAgent: 'testAgent',
      messageType: 'request',
      intent: 'testIntent',
      payload: { data: 'test' },
      timestamp: '2025-05-19T15:30:00Z'
    };

    const result = await agent.processMessage(message);
    expect(mockHandler).toHaveBeenCalledWith(message);
    expect(result).toEqual({ result: 'success' });
  });

  test('should throw error for unknown intent', async () => {
    const message = {
      messageId: 'msg_123',
      intent: 'unknownIntent',
      payload: { data: 'test' }
    };

    await expect(agent.processMessage(message)).rejects.toThrow(
      'No handler registered for intent: unknownIntent'
    );
  });

  test('should send messages through the router', async () => {
    const payload = { data: 'test' };
    
    await agent.sendMessage('targetAgent', 'request', 'testIntent', payload);
    
    expect(router.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      fromAgent: 'testAgent',
      toAgent: 'targetAgent',
      messageType: 'request',
      intent: 'testIntent',
      payload
    }));
  });
});
