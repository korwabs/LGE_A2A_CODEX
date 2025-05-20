const { ProductRecommendationAgent } = require('@/agents/product-recommendation/product-recommendation-agent');

describe('ProductRecommendationAgent', () => {
  let recommendationAgent;
  let mockRouter;
  let mockAlgoliaClient;

  beforeEach(() => {
    // Mock router
    mockRouter = {
      registerAgent: jest.fn(),
      sendMessage: jest.fn().mockResolvedValue({ result: 'success' })
    };

    // Mock Algolia client
    mockAlgoliaClient = {
      search: jest.fn().mockResolvedValue({
        hits: [
          { 
            objectID: 'prod1', 
            name: 'LG OLED TV', 
            description: 'Amazing 4K TV',
            price: 1200,
            imageUrl: 'http://example.com/tv.jpg',
            features: ['4K', 'Smart TV', 'HDR'],
            stockStatus: 'in-stock',
            rating: 4.5,
            _score: 0.95
          },
          { 
            objectID: 'prod2', 
            name: 'LG UHD TV', 
            description: 'Great value TV',
            price: 800,
            imageUrl: 'http://example.com/uhd.jpg',
            features: ['4K', 'Smart TV'],
            stockStatus: 'in-stock',
            rating: 4.2,
            _score: 0.85
          }
        ]
      })
    };
    
    // Create agent
    recommendationAgent = new ProductRecommendationAgent(mockRouter, mockAlgoliaClient);
  });

  test('should register message handlers on initialization', () => {
    expect(recommendationAgent.messageHandlers.size).toBeGreaterThan(0);
    expect(recommendationAgent.messageHandlers.has('getRecommendation')).toBe(true);
  });

  test('should build search query correctly', () => {
    const userQuery = 'smart tv with HDR';
    const filters = {
      priceRange: '500-1000',
      categories: ['TVs', 'Smart TVs']
    };
    
    const searchQuery = recommendationAgent.buildSearchQuery(userQuery, filters);
    
    expect(searchQuery).toEqual(expect.objectContaining({
      query: userQuery,
      filters: expect.any(String),
      hitsPerPage: expect.any(Number),
      attributesToRetrieve: expect.any(Array)
    }));
    
    // Verify filters translation
    expect(searchQuery.filters).toContain('price >= 500');
    expect(searchQuery.filters).toContain('price <= 1000');
    expect(searchQuery.filters).toContain("categories:'TVs'");
    expect(searchQuery.filters).toContain("categories:'Smart TVs'");
  });

  test('should handle price filter translation correctly', () => {
    const filters = { priceRange: '500-1000' };
    const filterString = recommendationAgent.translateFiltersToAlgolia(filters);
    
    expect(filterString).toContain('price >= 500');
    expect(filterString).toContain('price <= 1000');
  });

  test('should handle category filter translation correctly', () => {
    const filters = { categories: ['TVs', 'Electronics'] };
    const filterString = recommendationAgent.translateFiltersToAlgolia(filters);
    
    expect(filterString).toContain("categories:'TVs'");
    expect(filterString).toContain("categories:'Electronics'");
    expect(filterString).toContain(' OR ');
  });

  test('should process search results correctly', () => {
    const searchResults = {
      hits: [
        { 
          objectID: 'prod1', 
          name: 'LG OLED TV', 
          price: 1200,
          _score: 0.95
        }
      ]
    };
    
    const processedResults = recommendationAgent.processSearchResults(searchResults);
    
    expect(processedResults).toHaveLength(1);
    expect(processedResults[0]).toEqual(expect.objectContaining({
      id: 'prod1',
      name: 'LG OLED TV',
      price: 1200,
      relevanceScore: 0.95
    }));
  });

  test('should handle empty search results', () => {
    const emptyResults = { hits: [] };
    const processedResults = recommendationAgent.processSearchResults(emptyResults);
    
    expect(processedResults).toEqual([]);
  });

  test('should handle getRecommendation request correctly', async () => {
    const message = {
      payload: {
        userId: 'user123',
        userQuery: 'OLED TV',
        filters: { priceRange: '1000-2000' }
      }
    };
    
    await recommendationAgent.messageHandlers.get('getRecommendation')(message);
    
    // Should call Algolia search
    expect(mockAlgoliaClient.search).toHaveBeenCalledWith(expect.objectContaining({
      query: 'OLED TV'
    }));
    
    // Should send results back to dialog agent
    expect(mockRouter.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      toAgent: 'dialogAgent',
      intent: 'recommendationResult',
      payload: expect.objectContaining({
        userId: 'user123',
        recommendations: expect.any(Array),
        userQuery: 'OLED TV'
      })
    }));
  });
});
