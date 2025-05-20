const CartAgent = require('@/agents/cart/cart-agent');

describe('CartAgent', () => {
  let cartAgent;
  let mockRouter;
  let mockFirebaseService;

  beforeEach(() => {
    // Mock router
    mockRouter = {
      registerAgent: jest.fn(),
      sendMessage: jest.fn().mockResolvedValue({ result: 'success' })
    };

    // Mock Firebase service
    mockFirebaseService = {
      getCart: jest.fn().mockResolvedValue([
        { id: 'prod1', name: 'LG OLED TV', price: 1200, quantity: 1 }
      ]),
      addToCart: jest.fn().mockResolvedValue(true),
      updateCartItem: jest.fn().mockResolvedValue(true),
      removeFromCart: jest.fn().mockResolvedValue(true),
      clearCart: jest.fn().mockResolvedValue(true)
    };
    
    // Create agent
    cartAgent = new CartAgent(mockRouter, mockFirebaseService);
  });

  test('should register message handlers on initialization', () => {
    expect(cartAgent.messageHandlers.size).toBeGreaterThan(0);
    expect(cartAgent.messageHandlers.has('getCart')).toBe(true);
    expect(cartAgent.messageHandlers.has('addToCart')).toBe(true);
    expect(cartAgent.messageHandlers.has('updateCartItem')).toBe(true);
    expect(cartAgent.messageHandlers.has('removeFromCart')).toBe(true);
    expect(cartAgent.messageHandlers.has('clearCart')).toBe(true);
  });

  test('should get cart contents correctly', async () => {
    const message = {
      payload: {
        userId: 'user123'
      }
    };
    
    await cartAgent.messageHandlers.get('getCart')(message);
    
    // Should call Firebase service
    expect(mockFirebaseService.getCart).toHaveBeenCalledWith('user123');
    
    // Should send cart contents back to dialog agent
    expect(mockRouter.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        toAgent: 'dialogAgent',
        intent: 'cartContents',
        payload: expect.objectContaining({
          userId: 'user123',
          cart: [
            { id: 'prod1', name: 'LG OLED TV', price: 1200, quantity: 1 }
          ]
        })
      })
    );
  });

  test('should add item to cart correctly', async () => {
    const message = {
      payload: {
        userId: 'user123',
        product: {
          id: 'prod2',
          name: 'LG UHD TV',
          price: 800
        },
        quantity: 1
      }
    };
    
    await cartAgent.messageHandlers.get('addToCart')(message);
    
    // Should call Firebase service
    expect(mockFirebaseService.addToCart).toHaveBeenCalledWith(
      'user123',
      expect.objectContaining({
        id: 'prod2',
        name: 'LG UHD TV',
        price: 800
      }),
      1
    );
    
    // Should fetch updated cart
    expect(mockFirebaseService.getCart).toHaveBeenCalledWith('user123');
    
    // Should send updated cart contents back to dialog agent
    expect(mockRouter.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        toAgent: 'dialogAgent',
        intent: 'cartUpdated',
        payload: expect.objectContaining({
          userId: 'user123',
          cart: expect.any(Array),
          action: 'added',
          product: expect.objectContaining({
            id: 'prod2'
          })
        })
      })
    );
  });

  test('should update cart item correctly', async () => {
    const message = {
      payload: {
        userId: 'user123',
        productId: 'prod1',
        quantity: 2
      }
    };
    
    await cartAgent.messageHandlers.get('updateCartItem')(message);
    
    // Should call Firebase service
    expect(mockFirebaseService.updateCartItem).toHaveBeenCalledWith(
      'user123',
      'prod1',
      2
    );
    
    // Should fetch updated cart
    expect(mockFirebaseService.getCart).toHaveBeenCalledWith('user123');
    
    // Should send updated cart contents back to dialog agent
    expect(mockRouter.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        toAgent: 'dialogAgent',
        intent: 'cartUpdated',
        payload: expect.objectContaining({
          userId: 'user123',
          cart: expect.any(Array),
          action: 'updated',
          productId: 'prod1'
        })
      })
    );
  });

  test('should remove item from cart correctly', async () => {
    const message = {
      payload: {
        userId: 'user123',
        productId: 'prod1'
      }
    };
    
    await cartAgent.messageHandlers.get('removeFromCart')(message);
    
    // Should call Firebase service
    expect(mockFirebaseService.removeFromCart).toHaveBeenCalledWith(
      'user123',
      'prod1'
    );
    
    // Should fetch updated cart
    expect(mockFirebaseService.getCart).toHaveBeenCalledWith('user123');
    
    // Should send updated cart contents back to dialog agent
    expect(mockRouter.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        toAgent: 'dialogAgent',
        intent: 'cartUpdated',
        payload: expect.objectContaining({
          userId: 'user123',
          cart: expect.any(Array),
          action: 'removed',
          productId: 'prod1'
        })
      })
    );
  });

  test('should clear cart correctly', async () => {
    const message = {
      payload: {
        userId: 'user123'
      }
    };
    
    await cartAgent.messageHandlers.get('clearCart')(message);
    
    // Should call Firebase service
    expect(mockFirebaseService.clearCart).toHaveBeenCalledWith('user123');
    
    // Should send empty cart back to dialog agent
    expect(mockRouter.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        toAgent: 'dialogAgent',
        intent: 'cartUpdated',
        payload: expect.objectContaining({
          userId: 'user123',
          cart: expect.any(Array),
          action: 'cleared'
        })
      })
    );
  });

  test('should handle cart checkout request', async () => {
    // Mock generateCartCheckoutUrl
    cartAgent.generateCartCheckoutUrl = jest.fn().mockResolvedValue(
      'https://www.lge.com/br/checkout?cart=abcd1234'
    );
    
    const message = {
      payload: {
        userId: 'user123'
      }
    };
    
    await cartAgent.messageHandlers.get('checkoutCart')(message);
    
    // Should get cart contents
    expect(mockFirebaseService.getCart).toHaveBeenCalledWith('user123');
    
    // Should generate checkout URL
    expect(cartAgent.generateCartCheckoutUrl).toHaveBeenCalledWith(
      'user123',
      expect.any(Array)
    );
    
    // Should send checkout URL back to dialog agent
    expect(mockRouter.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        toAgent: 'dialogAgent',
        intent: 'cartCheckout',
        payload: expect.objectContaining({
          userId: 'user123',
          checkoutUrl: 'https://www.lge.com/br/checkout?cart=abcd1234'
        })
      })
    );
  });

  test('should handle empty cart checkout request', async () => {
    // Override mock for empty cart
    mockFirebaseService.getCart = jest.fn().mockResolvedValue([]);
    
    const message = {
      payload: {
        userId: 'user123'
      }
    };
    
    await cartAgent.messageHandlers.get('checkoutCart')(message);
    
    // Should get cart contents
    expect(mockFirebaseService.getCart).toHaveBeenCalledWith('user123');
    
    // Should not generate checkout URL for empty cart
    expect(cartAgent.generateCartCheckoutUrl).not.toHaveBeenCalled;
    
    // Should send empty cart message back to dialog agent
    expect(mockRouter.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        toAgent: 'dialogAgent',
        intent: 'cartEmpty',
        payload: expect.objectContaining({
          userId: 'user123'
        })
      })
    );
  });
});
