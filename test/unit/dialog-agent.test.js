const { DialogAgent } = require('@/agents/dialog/dialog-agent');

describe('DialogAgent', () => {
  let dialogAgent;
  let mockRouter;
  let mockPromptManager;

  beforeEach(() => {
    // Mock router
    mockRouter = {
      registerAgent: jest.fn(),
      sendMessage: jest.fn().mockResolvedValue({ result: 'success' })
    };

    // Mock prompt manager
    mockPromptManager = {
      generateGeminiResponse: jest.fn().mockResolvedValue('Mocked Gemini response')
    };
    
    // Create agent
    dialogAgent = new DialogAgent(mockRouter, mockPromptManager);
  });

  test('should register message handlers on initialization', () => {
    expect(dialogAgent.messageHandlers.size).toBeGreaterThan(0);
    expect(dialogAgent.messageHandlers.has('userQuery')).toBe(true);
    expect(dialogAgent.messageHandlers.has('recommendationResult')).toBe(true);
  });

  test('should analyze user intent for product search', async () => {
    // Mock the analyze user intent method
    const mockIntent = { type: 'productSearch', filters: { category: 'TV' } };
    dialogAgent.analyzeUserIntent = jest.fn().mockResolvedValue(mockIntent);
    
    const message = {
      payload: {
        userId: 'user123',
        userQuery: 'I want to buy a new TV'
      }
    };
    
    await dialogAgent.messageHandlers.get('userQuery')(message);
    
    expect(dialogAgent.analyzeUserIntent).toHaveBeenCalledWith('user123', 'I want to buy a new TV');
    expect(mockRouter.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        toAgent: 'productRecommendationAgent',
        intent: 'getRecommendation',
        payload: expect.objectContaining({
          userId: 'user123',
          userQuery: 'I want to buy a new TV',
          filters: { category: 'TV' }
        })
      })
    );
  });

  test('should analyze user intent for purchase process', async () => {
    // Mock the analyze user intent method
    const mockIntent = { type: 'purchaseIntent', productId: 'product123' };
    dialogAgent.analyzeUserIntent = jest.fn().mockResolvedValue(mockIntent);
    
    const message = {
      payload: {
        userId: 'user123',
        userQuery: 'I want to buy this TV'
      }
    };
    
    await dialogAgent.messageHandlers.get('userQuery')(message);
    
    expect(dialogAgent.analyzeUserIntent).toHaveBeenCalledWith('user123', 'I want to buy this TV');
    expect(mockRouter.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        toAgent: 'purchaseProcessAgent',
        intent: 'initiatePurchase',
        payload: expect.objectContaining({
          userId: 'user123',
          productId: 'product123'
        })
      })
    );
  });

  test('should handle recommendation results', async () => {
    const recommendations = [
      { id: 'prod1', name: 'TV 1', price: 1000 },
      { id: 'prod2', name: 'TV 2', price: 1500 }
    ];
    
    const message = {
      payload: {
        userId: 'user123',
        recommendations,
        userQuery: 'Show me some TVs'
      }
    };
    
    await dialogAgent.messageHandlers.get('recommendationResult')(message);
    
    expect(mockPromptManager.generateGeminiResponse).toHaveBeenCalledWith(
      'user123',
      'formatRecommendations',
      expect.objectContaining({
        recommendations,
        userQuery: 'Show me some TVs'
      })
    );
  });

  test('should handle general queries', async () => {
    // Mock the analyze user intent method
    const mockIntent = { type: 'generalQuery' };
    dialogAgent.analyzeUserIntent = jest.fn().mockResolvedValue(mockIntent);
    
    const message = {
      payload: {
        userId: 'user123',
        userQuery: 'What are your opening hours?'
      }
    };
    
    const result = await dialogAgent.messageHandlers.get('userQuery')(message);
    
    expect(dialogAgent.analyzeUserIntent).toHaveBeenCalledWith('user123', 'What are your opening hours?');
    expect(mockPromptManager.generateGeminiResponse).toHaveBeenCalledWith(
      'user123',
      'generalQuery',
      expect.objectContaining({
        userQuery: 'What are your opening hours?'
      })
    );
    expect(result).toBe('Mocked Gemini response');
  });
});
