const { CrawlingCoordinatorAgent } = require('@/agents/crawling-coordinator/crawling-coordinator-agent');

describe('CrawlingCoordinatorAgent', () => {
  let crawlingAgent;
  let mockRouter;
  let mockApifyService;
  let mockAlgoliaService;

  beforeEach(() => {
    // Mock router
    mockRouter = {
      registerAgent: jest.fn(),
      sendMessage: jest.fn().mockResolvedValue({ result: 'success' })
    };

    // Mock Apify service
    mockApifyService = {
      runCrawler: jest.fn().mockResolvedValue([
        {
          id: 'prod1',
          name: 'LG OLED TV',
          description: 'Amazing 4K TV',
          price: 1200,
          imageUrl: 'http://example.com/tv.jpg',
          features: ['4K', 'Smart TV', 'HDR'],
          stockStatus: 'in-stock',
          category: 'TVs'
        }
      ]),
      runProductDetailsCrawler: jest.fn().mockResolvedValue({
        id: 'prod1',
        name: 'LG OLED TV',
        description: 'Amazing 4K TV',
        price: 1200,
        imageUrl: 'http://example.com/tv.jpg',
        features: ['4K', 'Smart TV', 'HDR'],
        specifications: {
          resolution: '3840 x 2160',
          refresh: '120Hz',
          connectivity: ['HDMI', 'USB', 'Bluetooth']
        },
        stockStatus: 'in-stock',
        category: 'TVs'
      }),
      runCheckoutProcessCrawler: jest.fn().mockResolvedValue({
        steps: [
          {
            step: 'personal-info',
            description: 'Enter your personal information',
            requiredFields: [
              { name: 'name', type: 'text', required: true, description: 'Full Name' },
              { name: 'email', type: 'email', required: true, description: 'Email Address' }
            ]
          }
        ]
      })
    };

    // Mock Algolia service
    mockAlgoliaService = {
      indexProducts: jest.fn().mockResolvedValue({ objectIDs: ['prod1'] }),
      updateProducts: jest.fn().mockResolvedValue({ objectIDs: ['prod1'] })
    };
    
    // Create agent
    crawlingAgent = new CrawlingCoordinatorAgent(mockRouter, mockApifyService, mockAlgoliaService);
  });

  test('should register message handlers on initialization', () => {
    expect(crawlingAgent.messageHandlers.size).toBeGreaterThan(0);
    expect(crawlingAgent.messageHandlers.has('crawlProducts')).toBe(true);
    expect(crawlingAgent.messageHandlers.has('crawlProductDetails')).toBe(true);
    expect(crawlingAgent.messageHandlers.has('crawlCheckoutProcess')).toBe(true);
    expect(crawlingAgent.messageHandlers.has('updateProductData')).toBe(true);
  });

  test('should crawl products correctly', async () => {
    const message = {
      payload: {
        category: 'TVs',
        limit: 10,
        reindex: true
      }
    };
    
    await crawlingAgent.messageHandlers.get('crawlProducts')(message);
    
    // Should call Apify service
    expect(mockApifyService.runCrawler).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'TVs',
        limit: 10
      })
    );
    
    // Should index products in Algolia
    expect(mockAlgoliaService.indexProducts).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'prod1',
          name: 'LG OLED TV'
        })
      ])
    );
    
    // Should send results back to requesting agent
    expect(mockRouter.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'crawlProductsResult',
        payload: expect.objectContaining({
          success: true,
          count: 1,
          category: 'TVs'
        })
      })
    );
  });

  test('should crawl product details correctly', async () => {
    const message = {
      payload: {
        productId: 'prod1',
        updateIndex: true
      }
    };
    
    await crawlingAgent.messageHandlers.get('crawlProductDetails')(message);
    
    // Should call Apify service
    expect(mockApifyService.runProductDetailsCrawler).toHaveBeenCalledWith('prod1');
    
    // Should update product in Algolia
    expect(mockAlgoliaService.updateProducts).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'prod1',
          name: 'LG OLED TV',
          specifications: expect.any(Object)
        })
      ])
    );
    
    // Should send results back to requesting agent
    expect(mockRouter.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'crawlProductDetailsResult',
        payload: expect.objectContaining({
          success: true,
          productId: 'prod1'
        })
      })
    );
  });

  test('should handle errors in product crawling', async () => {
    // Override mock to simulate error
    mockApifyService.runCrawler = jest.fn().mockRejectedValue(
      new Error('Crawling failed')
    );
    
    const message = {
      payload: {
        category: 'TVs',
        limit: 10,
        reindex: true
      }
    };
    
    await crawlingAgent.messageHandlers.get('crawlProducts')(message);
    
    // Should not call Algolia service on error
    expect(mockAlgoliaService.indexProducts).not.toHaveBeenCalled();
    
    // Should send error back to requesting agent
    expect(mockRouter.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'crawlProductsResult',
        payload: expect.objectContaining({
          success: false,
          error: expect.stringContaining('Crawling failed')
        })
      })
    );
  });

  test('should crawl checkout process correctly', async () => {
    const message = {
      payload: {
        category: 'TVs'
      }
    };
    
    await crawlingAgent.messageHandlers.get('crawlCheckoutProcess')(message);
    
    // Should call Apify service
    expect(mockApifyService.runCheckoutProcessCrawler).toHaveBeenCalledWith('TVs');
    
    // Should store checkout process
    expect(crawlingAgent.checkoutProcesses.has('TVs')).toBe(true);
    expect(crawlingAgent.checkoutProcesses.get('TVs')).toEqual(
      expect.objectContaining({
        steps: expect.any(Array)
      })
    );
    
    // Should send results back to requesting agent
    expect(mockRouter.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'crawlCheckoutProcessResult',
        payload: expect.objectContaining({
          success: true,
          category: 'TVs',
          steps: expect.any(Array)
        })
      })
    );
  });

  test('should update product data correctly', async () => {
    const message = {
      payload: {
        products: [
          {
            id: 'prod1',
            price: 1100, // updated price
            stockStatus: 'low-stock' // updated status
          }
        ]
      }
    };
    
    await crawlingAgent.messageHandlers.get('updateProductData')(message);
    
    // Should update products in Algolia
    expect(mockAlgoliaService.updateProducts).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'prod1',
          price: 1100,
          stockStatus: 'low-stock'
        })
      ])
    );
    
    // Should send results back to requesting agent
    expect(mockRouter.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'updateProductDataResult',
        payload: expect.objectContaining({
          success: true,
          count: 1
        })
      })
    );
  });

  test('should handle scheduled crawling tasks', async () => {
    // Mock scheduleCrawlingTasks
    const originalScheduleMethod = crawlingAgent.scheduleCrawlingTasks;
    crawlingAgent.scheduleCrawlingTasks = jest.fn();
    
    // Create agent again to trigger initialization
    new CrawlingCoordinatorAgent(mockRouter, mockApifyService, mockAlgoliaService);
    
    // Should schedule crawling tasks on initialization
    expect(crawlingAgent.scheduleCrawlingTasks).toHaveBeenCalled();
    
    // Restore original method
    crawlingAgent.scheduleCrawlingTasks = originalScheduleMethod;
    
    // Mock runScheduledCrawling
    crawlingAgent.runScheduledCrawling = jest.fn().mockResolvedValue(true);
    
    // Call the method directly to test its logic
    await crawlingAgent.executeScheduledCrawling();
    
    // Should call runScheduledCrawling
    expect(crawlingAgent.runScheduledCrawling).toHaveBeenCalled();
  });
});
