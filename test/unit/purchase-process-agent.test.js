const PurchaseProcessAgent = require('@/agents/purchase-process/purchase-process-agent');

describe('PurchaseProcessAgent', () => {
  let purchaseAgent;
  let mockRouter;
  let mockContextManager;
  let mockApifyClient;

  beforeEach(() => {
    // Mock router
    mockRouter = {
      registerAgent: jest.fn(),
      sendMessage: jest.fn().mockResolvedValue({ result: 'success' })
    };

    // Mock MCP context manager
    mockContextManager = {
      contextStore: new Map(),
      storeContext: jest.fn((userId, context) => {
        mockContextManager.contextStore.set(userId, context);
      }),
      updateContext: jest.fn((userId, key, value) => {
        const context = mockContextManager.contextStore.get(userId) || {};
        context[key] = value;
        mockContextManager.contextStore.set(userId, context);
      }),
      get: jest.fn((userId) => mockContextManager.contextStore.get(userId))
    };

    // Mock Apify client
    mockApifyClient = {
      getActor: jest.fn().mockReturnValue({
        call: jest.fn().mockResolvedValue({
          items: [
            {
              productCategory: 'TVs',
              steps: [
                {
                  step: 'personal-info',
                  description: 'Enter your personal information',
                  requiredFields: [
                    { name: 'name', type: 'text', required: true, description: 'Full Name' },
                    { name: 'email', type: 'email', required: true, description: 'Email Address' }
                  ]
                },
                {
                  step: 'shipping',
                  description: 'Enter shipping information',
                  requiredFields: [
                    { name: 'address', type: 'text', required: true, description: 'Shipping Address' },
                    { name: 'postalCode', type: 'text', required: true, description: 'Postal Code' },
                    { name: 'phone', type: 'text', required: true, description: 'Contact Phone' }
                  ]
                },
                {
                  step: 'payment',
                  description: 'Choose payment method',
                  requiredFields: [
                    { name: 'paymentType', type: 'select', required: true, description: 'Payment Method' }
                  ]
                }
              ]
            }
          ]
        })
      })
    };
    
    // Create agent
    purchaseAgent = new PurchaseProcessAgent(mockRouter, mockContextManager, mockApifyClient);
    
    // Mock initializeCheckoutFlowData to avoid actual API calls
    purchaseAgent.initializeCheckoutFlowData = jest.fn().mockImplementation(() => {
      purchaseAgent.checkoutFlows = new Map();
      purchaseAgent.checkoutFlows.set('TVs', [
        {
          step: 'personal-info',
          description: 'Enter your personal information',
          requiredFields: [
            { name: 'name', type: 'text', required: true, description: 'Full Name' },
            { name: 'email', type: 'email', required: true, description: 'Email Address' }
          ]
        },
        {
          step: 'shipping',
          description: 'Enter shipping information',
          requiredFields: [
            { name: 'address', type: 'text', required: true, description: 'Shipping Address' },
            { name: 'postalCode', type: 'text', required: true, description: 'Postal Code' },
            { name: 'phone', type: 'text', required: true, description: 'Contact Phone' }
          ]
        },
        {
          step: 'payment',
          description: 'Choose payment method',
          requiredFields: [
            { name: 'paymentType', type: 'select', required: true, description: 'Payment Method' }
          ]
        }
      ]);
      
      purchaseAgent.checkoutFlows.set('default', purchaseAgent.checkoutFlows.get('TVs'));
    });
    
    // Initialize checkout flow data
    purchaseAgent.initializeCheckoutFlowData();
  });

  test('should register message handlers on initialization', () => {
    expect(purchaseAgent.messageHandlers.size).toBeGreaterThan(0);
    expect(purchaseAgent.messageHandlers.has('initiatePurchase')).toBe(true);
    expect(purchaseAgent.messageHandlers.has('collectPurchaseInfo')).toBe(true);
  });

  test('should initiate purchase process correctly', async () => {
    // Mock fetchProductInfo
    purchaseAgent.fetchProductInfo = jest.fn().mockResolvedValue({
      id: 'product123',
      name: 'LG OLED TV',
      price: 1500,
      category: 'TVs'
    });
    
    // Mock generateStepGuidance
    purchaseAgent.generateStepGuidance = jest.fn().mockResolvedValue(
      'Please enter your personal information'
    );
    
    const message = {
      payload: {
        userId: 'user123',
        productId: 'product123'
      }
    };
    
    await purchaseAgent.messageHandlers.get('initiatePurchase')(message);
    
    // Should fetch product info
    expect(purchaseAgent.fetchProductInfo).toHaveBeenCalledWith('product123');
    
    // Should store checkout context
    expect(mockContextManager.storeContext).toHaveBeenCalledWith(
      'user123',
      expect.objectContaining({
        currentCheckoutStep: 0,
        checkoutSteps: expect.any(Array),
        productInfo: expect.objectContaining({
          id: 'product123',
          category: 'TVs'
        }),
        collectedInfo: {}
      })
    );
    
    // Should generate step guidance
    expect(purchaseAgent.generateStepGuidance).toHaveBeenCalledWith('user123');
    
    // Should send response to dialog agent
    expect(mockRouter.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        toAgent: 'dialogAgent',
        intent: 'purchaseStepGuide',
        payload: expect.objectContaining({
          userId: 'user123',
          guideText: 'Please enter your personal information'
        })
      })
    );
  });

  test('should collect purchase info correctly', async () => {
    // Setup initial context
    mockContextManager.contextStore.set('user123', {
      currentCheckoutStep: 0,
      checkoutSteps: purchaseAgent.checkoutFlows.get('TVs'),
      productInfo: { id: 'product123', name: 'LG OLED TV', category: 'TVs' },
      collectedInfo: {}
    });
    
    // Mock extractInfoFromUserInput
    purchaseAgent.extractInfoFromUserInput = jest.fn().mockResolvedValue({
      name: 'John Doe',
      email: 'john@example.com'
    });
    
    // Mock checkMissingRequiredFields
    purchaseAgent.checkMissingRequiredFields = jest.fn().mockReturnValue([]);
    
    // Mock generateStepGuidance for next step
    purchaseAgent.generateStepGuidance = jest.fn().mockResolvedValue(
      'Please enter your shipping information'
    );
    
    const message = {
      payload: {
        userId: 'user123',
        userInput: 'My name is John Doe and my email is john@example.com'
      }
    };
    
    await purchaseAgent.messageHandlers.get('collectPurchaseInfo')(message);
    
    // Should extract info from user input
    expect(purchaseAgent.extractInfoFromUserInput).toHaveBeenCalledWith(
      'My name is John Doe and my email is john@example.com',
      expect.any(Array)
    );
    
    // Should update context with collected info
    expect(mockContextManager.updateContext).toHaveBeenCalledWith(
      'user123',
      'collectedInfo',
      expect.objectContaining({
        name: 'John Doe',
        email: 'john@example.com'
      })
    );
    
    // Should check for missing fields
    expect(purchaseAgent.checkMissingRequiredFields).toHaveBeenCalled();
    
    // Should update to next step
    expect(mockContextManager.updateContext).toHaveBeenCalledWith(
      'user123',
      'currentCheckoutStep',
      1
    );
    
    // Should generate guidance for next step
    expect(purchaseAgent.generateStepGuidance).toHaveBeenCalledWith('user123');
    
    // Should send response to dialog agent
    expect(mockRouter.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        toAgent: 'dialogAgent',
        intent: 'purchaseStepGuide',
        payload: expect.objectContaining({
          userId: 'user123',
          guideText: 'Please enter your shipping information'
        })
      })
    );
  });

  test('should request missing information', async () => {
    // Setup initial context
    mockContextManager.contextStore.set('user123', {
      currentCheckoutStep: 0,
      checkoutSteps: purchaseAgent.checkoutFlows.get('TVs'),
      productInfo: { id: 'product123', name: 'LG OLED TV', category: 'TVs' },
      collectedInfo: {}
    });
    
    // Mock extractInfoFromUserInput with partial info
    purchaseAgent.extractInfoFromUserInput = jest.fn().mockResolvedValue({
      name: 'John Doe'
      // Missing email
    });
    
    // Mock checkMissingRequiredFields to return missing field
    purchaseAgent.checkMissingRequiredFields = jest.fn().mockReturnValue([
      { name: 'email', type: 'email', required: true, description: 'Email Address' }
    ]);
    
    // Mock generateFieldPrompt
    purchaseAgent.generateFieldPrompt = jest.fn().mockResolvedValue(
      'Could you please provide your email address?'
    );
    
    const message = {
      payload: {
        userId: 'user123',
        userInput: 'My name is John Doe'
      }
    };
    
    await purchaseAgent.messageHandlers.get('collectPurchaseInfo')(message);
    
    // Should extract info from user input
    expect(purchaseAgent.extractInfoFromUserInput).toHaveBeenCalled();
    
    // Should update context with collected info
    expect(mockContextManager.updateContext).toHaveBeenCalledWith(
      'user123',
      'collectedInfo',
      expect.objectContaining({
        name: 'John Doe'
      })
    );
    
    // Should check for missing fields
    expect(purchaseAgent.checkMissingRequiredFields).toHaveBeenCalled();
    
    // Should generate prompt for missing field
    expect(purchaseAgent.generateFieldPrompt).toHaveBeenCalledWith(
      'user123',
      expect.objectContaining({
        name: 'email',
        type: 'email'
      })
    );
    
    // Should send response to dialog agent requesting more info
    expect(mockRouter.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        toAgent: 'dialogAgent',
        intent: 'requestMoreInfo',
        payload: expect.objectContaining({
          userId: 'user123',
          promptText: 'Could you please provide your email address?'
        })
      })
    );
  });

  test('should complete checkout process when all steps are done', async () => {
    // Setup initial context with last step
    const lastStepIndex = purchaseAgent.checkoutFlows.get('TVs').length - 1;
    mockContextManager.contextStore.set('user123', {
      currentCheckoutStep: lastStepIndex,
      checkoutSteps: purchaseAgent.checkoutFlows.get('TVs'),
      productInfo: { id: 'product123', name: 'LG OLED TV', category: 'TVs' },
      collectedInfo: {
        name: 'John Doe',
        email: 'john@example.com',
        address: 'Rua Example 123',
        postalCode: '12345-678',
        phone: '123-456-7890'
      }
    });
    
    // Mock extractInfoFromUserInput for payment info
    purchaseAgent.extractInfoFromUserInput = jest.fn().mockResolvedValue({
      paymentType: 'credit-card'
    });
    
    // Mock checkMissingRequiredFields to return no missing fields
    purchaseAgent.checkMissingRequiredFields = jest.fn().mockReturnValue([]);
    
    // Mock generateCheckoutUrl
    purchaseAgent.generateCheckoutUrl = jest.fn().mockResolvedValue(
      'https://www.lge.com/br/checkout?sessionId=abcd1234'
    );
    
    const message = {
      payload: {
        userId: 'user123',
        userInput: 'I want to pay with credit card'
      }
    };
    
    await purchaseAgent.messageHandlers.get('collectPurchaseInfo')(message);
    
    // Should extract payment info
    expect(purchaseAgent.extractInfoFromUserInput).toHaveBeenCalled();
    
    // Should update context with collected payment info
    expect(mockContextManager.updateContext).toHaveBeenCalledWith(
      'user123',
      'collectedInfo',
      expect.objectContaining({
        paymentType: 'credit-card'
      })
    );
    
    // Should check for missing fields
    expect(purchaseAgent.checkMissingRequiredFields).toHaveBeenCalled();
    
    // Should update to next step (which exceeds the array length)
    expect(mockContextManager.updateContext).toHaveBeenCalledWith(
      'user123',
      'currentCheckoutStep',
      lastStepIndex + 1
    );
    
    // Should generate checkout URL
    expect(purchaseAgent.generateCheckoutUrl).toHaveBeenCalledWith(
      'user123',
      expect.objectContaining({
        name: 'John Doe',
        email: 'john@example.com',
        paymentType: 'credit-card'
      })
    );
    
    // Should send response to dialog agent with checkout complete
    expect(mockRouter.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        toAgent: 'dialogAgent',
        intent: 'checkoutComplete',
        payload: expect.objectContaining({
          userId: 'user123',
          checkoutUrl: 'https://www.lge.com/br/checkout?sessionId=abcd1234'
        })
      })
    );
  });
});
