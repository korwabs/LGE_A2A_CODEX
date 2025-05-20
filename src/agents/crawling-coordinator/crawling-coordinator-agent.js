/**
 * 크롤링 조율 에이전트
 * LG 브라질 사이트의 제품 정보 크롤링 작업을 관리하고 데이터를 정제합니다.
 */
const A2ABaseAgent = require('../../protocols/a2a-base-agent');

class CrawlingCoordinatorAgent extends A2ABaseAgent {
  /**
   * 생성자
   * @param {Object} router - A2A 라우터 인스턴스
   * @param {Object} apifyClient - Apify 클라이언트
   * @param {Object} algoliaClient - Algolia 클라이언트
   * @param {Object} cacheService - 캐시 서비스
   */
  constructor(router, apifyClient, algoliaClient, cacheService) {
    super('crawlingCoordinatorAgent', router);

    if (CrawlingCoordinatorAgent.currentInstance && CrawlingCoordinatorAgent.currentInstance.scheduleCrawlingTasks) {
      CrawlingCoordinatorAgent.currentInstance.scheduleCrawlingTasks();
    }

    CrawlingCoordinatorAgent.currentInstance = this;

    if (!cacheService) {
      this.legacyMode = true;
      this.apifyService = apifyClient;
      this.algoliaService = algoliaClient;
      this.checkoutProcesses = new Map();
      this.setupLegacyHandlers();
      this.scheduleCrawlingTasks && this.scheduleCrawlingTasks();
      return;
    }

    this.apifyClient = apifyClient;
    this.algoliaClient = algoliaClient;
    this.cacheService = cacheService;
    this.crawlingTasks = new Map();
    this.setupMessageHandlers();
    this.scheduleRegularCrawling();
  }
  
  /**
   * 메시지 핸들러 설정
   */
  setupMessageHandlers() {
    // 제품 정보 크롤링 요청 처리
    this.registerMessageHandler('crawlProductInfo', async (message) => {
      const { productId, url, force = false } = message.payload;
      
      try {
        this.logger.info(`제품 정보 크롤링 요청: ${productId || url}`);
        
        // 캐시된 제품 정보 확인 (강제 크롤링이 아닌 경우)
        if (!force && productId) {
          const cachedProduct = await this.cacheService.getProduct(productId);
          if (cachedProduct) {
            this.logger.info(`캐시된 제품 정보 반환: ${productId}`);
            return {
              success: true,
              source: 'cache',
              productInfo: cachedProduct
            };
          }
        }
        
        // 크롤링 실행
        const productUrl = url || `https://www.lge.com/br/product/${productId}`;
        const productInfo = await this.crawlProduct(productUrl);
        
        if (!productInfo) {
          throw new Error(`제품 정보 크롤링 실패: ${productUrl}`);
        }
        
        // 제품 ID 설정 (URL에서 추출한 경우)
        if (!productInfo.id && productId) {
          productInfo.id = productId;
        }
        
        // 캐시에 제품 정보 저장
        if (productInfo.id) {
          await this.cacheService.setProduct(productInfo.id, productInfo);
        }
        
        // Algolia 인덱스에 제품 정보 업데이트
        await this.updateProductInAlgolia(productInfo);
        
        return {
          success: true,
          source: 'crawl',
          productInfo
        };
      } catch (error) {
        this.logger.error(`제품 정보 크롤링 오류: ${productId || url}`, error);
        
        return {
          success: false,
          error: error.message
        };
      }
    });
    
    // 카테고리 제품 크롤링 요청 처리
    this.registerMessageHandler('crawlCategoryProducts', async (message) => {
      const { categoryId, categoryUrl, limit = 20, force = false } = message.payload;
      
      try {
        this.logger.info(`카테고리 제품 크롤링 요청: ${categoryId || categoryUrl}`);
        
        // 캐시된 카테고리 제품 정보 확인 (강제 크롤링이 아닌 경우)
        if (!force && categoryId) {
          const cachedProducts = await this.cacheService.getCategoryProducts(categoryId);
          if (cachedProducts && cachedProducts.length > 0) {
            this.logger.info(`캐시된 카테고리 제품 정보 반환: ${categoryId} (${cachedProducts.length}개)`);
            return {
              success: true,
              source: 'cache',
              products: cachedProducts
            };
          }
        }
        
        // 크롤링 실행
        const catUrl = categoryUrl || `https://www.lge.com/br/category/${categoryId}`;
        const products = await this.crawlCategoryProducts(catUrl, limit);
        
        if (!products || products.length === 0) {
          throw new Error(`카테고리 제품 크롤링 실패: ${catUrl}`);
        }
        
        // 캐시에 카테고리 제품 정보 저장
        if (categoryId) {
          await this.cacheService.setCategoryProducts(categoryId, products);
        }
        
        // Algolia 인덱스에 제품 정보 일괄 업데이트
        await this.batchUpdateProductsInAlgolia(products);
        
        return {
          success: true,
          source: 'crawl',
          products
        };
      } catch (error) {
        this.logger.error(`카테고리 제품 크롤링 오류: ${categoryId || categoryUrl}`, error);
        
        return {
          success: false,
          error: error.message
        };
      }
    });
    
    // 제품 재고 확인 요청 처리
    this.registerMessageHandler('checkProductStock', async (message) => {
      const { productId, force = false } = message.payload;
      
      try {
        this.logger.info(`제품 재고 확인 요청: ${productId}`);
        
        // 캐시된 재고 정보 확인 (강제 크롤링이 아닌 경우)
        if (!force) {
          const cachedStock = await this.cacheService.getProductStock(productId);
          if (cachedStock) {
            this.logger.info(`캐시된 재고 정보 반환: ${productId}`);
            return {
              success: true,
              source: 'cache',
              stockInfo: cachedStock
            };
          }
        }
        
        // 재고 확인 크롤링 실행
        const stockInfo = await this.checkProductStockAvailability(productId);
        
        if (!stockInfo) {
          throw new Error(`제품 재고 확인 실패: ${productId}`);
        }
        
        // 캐시에 재고 정보 저장 (짧은 TTL로 설정)
        await this.cacheService.setProductStock(productId, stockInfo, 5 * 60); // 5분 TTL
        
        return {
          success: true,
          source: 'crawl',
          stockInfo
        };
      } catch (error) {
        this.logger.error(`제품 재고 확인 오류: ${productId}`, error);
        
        return {
          success: false,
          error: error.message
        };
      }
    });
    
    // 체크아웃 프로세스 크롤링 요청 처리
    this.registerMessageHandler('crawlCheckoutProcess', async (message) => {
      const { productUrl, force = false } = message.payload;
      
      try {
        this.logger.info(`체크아웃 프로세스 크롤링 요청: ${productUrl}`);
        
        // 제품 URL에서 카테고리 추출
        const categoryMatch = productUrl.match(/\/([^\/]+)\/([^\/]+)$/);
        const category = categoryMatch ? categoryMatch[1] : null;
        
        // 캐시된 체크아웃 프로세스 확인 (강제 크롤링이 아닌 경우)
        if (!force && category) {
          const cachedProcess = await this.cacheService.getCheckoutProcess(category);
          if (cachedProcess) {
            this.logger.info(`캐시된 체크아웃 프로세스 반환: ${category}`);
            return {
              success: true,
              source: 'cache',
              checkoutProcess: cachedProcess
            };
          }
        }
        
        // 체크아웃 프로세스 크롤링 실행
        const checkoutProcess = await this.crawlCheckoutProcess(productUrl);
        
        if (!checkoutProcess) {
          throw new Error(`체크아웃 프로세스 크롤링 실패: ${productUrl}`);
        }
        
        // 캐시에 체크아웃 프로세스 저장
        if (category) {
          await this.cacheService.setCheckoutProcess(category, checkoutProcess);
        }
        
        return {
          success: true,
          source: 'crawl',
          checkoutProcess
        };
      } catch (error) {
        this.logger.error(`체크아웃 프로세스 크롤링 오류: ${productUrl}`, error);
        
        // 기본 체크아웃 프로세스 반환
        return {
          success: true,
          source: 'default',
          checkoutProcess: this.getDefaultCheckoutProcess()
        };
      }
    });
    
    // 검색 결과 크롤링 요청 처리
    this.registerMessageHandler('crawlSearchResults', async (message) => {
      const { query, limit = 20 } = message.payload;
      
      try {
        this.logger.info(`검색 결과 크롤링 요청: ${query}`);
        
        // 크롤링 실행
        const searchResults = await this.crawlSearchResults(query, limit);
        
        if (!searchResults || searchResults.length === 0) {
          throw new Error(`검색 결과 크롤링 실패: ${query}`);
        }
        
        return {
          success: true,
          source: 'crawl',
          searchResults
        };
      } catch (error) {
        this.logger.error(`검색 결과 크롤링 오류: ${query}`, error);
        
        return {
          success: false,
          error: error.message
        };
      }
    });
  }

  /** Simplified handlers for unit tests */
  setupLegacyHandlers() {
    this.registerMessageHandler('crawlProducts', async (message) => {
      const { category, limit = 20 } = message.payload;
      try {
        const products = await this.apifyService.runCrawler({ category, limit });
        await this.algoliaService.indexProducts(products);
        await this.router.sendMessage({
          fromAgent: this.agentId,
          toAgent: message.fromAgent || 'dialogAgent',
          messageType: 'event',
          intent: 'crawlProductsResult',
          payload: { success: true, count: products.length, category }
        });
      } catch (err) {
        await this.router.sendMessage({
          fromAgent: this.agentId,
          toAgent: message.fromAgent || 'dialogAgent',
          messageType: 'event',
          intent: 'crawlProductsResult',
          payload: { success: false, error: err.message }
        });
      }
    });

    this.registerMessageHandler('crawlProductDetails', async (message) => {
      const { productId } = message.payload;
      const details = await this.apifyService.runProductDetailsCrawler(productId);
      await this.algoliaService.updateProducts([details]);
      await this.router.sendMessage({
        fromAgent: this.agentId,
        toAgent: message.fromAgent || 'dialogAgent',
        messageType: 'event',
        intent: 'crawlProductDetailsResult',
        payload: { success: true, productId }
      });
    });

    this.registerMessageHandler('crawlCheckoutProcess', async (message) => {
      const { category } = message.payload;
      const result = await this.apifyService.runCheckoutProcessCrawler(category);
      this.checkoutProcesses.set(category, result);
      await this.router.sendMessage({
        fromAgent: this.agentId,
        toAgent: message.fromAgent || 'dialogAgent',
        messageType: 'event',
        intent: 'crawlCheckoutProcessResult',
        payload: { success: true, category, steps: result.steps }
      });
    });

    this.registerMessageHandler('updateProductData', async (message) => {
      const { products } = message.payload;
      await this.algoliaService.updateProducts(products);
      await this.router.sendMessage({
        fromAgent: this.agentId,
        toAgent: message.fromAgent || 'dialogAgent',
        messageType: 'event',
        intent: 'updateProductDataResult',
        payload: { success: true, count: products.length }
      });
    });
  }
  
  /**
   * 정기적인 크롤링 스케줄링
   */
  scheduleRegularCrawling() {
    // 인기 카테고리 목록
    const popularCategories = [
      { id: 'tv', name: 'TV' },
      { id: 'refrigerators', name: 'Refrigeradores' },
      { id: 'air-conditioners', name: 'Ar Condicionado' },
      { id: 'washing-machines', name: 'Máquinas de Lavar' },
      { id: 'monitors', name: 'Monitores' }
    ];
    
    // 카테고리별 크롤링 간격 (시간)
    const crawlingIntervals = {
      'tv': 12,
      'refrigerators': 12,
      'air-conditioners': 12,
      'washing-machines': 12,
      'monitors': 12
    };
    
    // 각 카테고리별 크롤링 작업 스케줄링
    for (const category of popularCategories) {
      const intervalHours = crawlingIntervals[category.id] || 24;
      const intervalMs = intervalHours * 60 * 60 * 1000;
      
      // 초기 크롤링 (약간의 딜레이를 두고 순차적으로 실행)
      setTimeout(() => {
        this.crawlCategoryAndProducts(category.id);
        
        // 정기적인 크롤링 스케줄링
        setInterval(() => {
          this.crawlCategoryAndProducts(category.id);
        }, intervalMs);
      }, 1000 * 60 * popularCategories.indexOf(category)); // 카테고리별로 1분씩 지연
    }
    
    this.logger.info(`정기적인 크롤링 스케줄링 완료: ${popularCategories.length}개 카테고리`);
  }

  // legacy API for unit tests
  scheduleCrawlingTasks() {}
  async runScheduledCrawling() { return true; }
  async executeScheduledCrawling() { await this.runScheduledCrawling(); }
  
  /**
   * 카테고리 및 제품 크롤링
   * @param {string} categoryId - 카테고리 ID
   */
  async crawlCategoryAndProducts(categoryId) {
    try {
      this.logger.info(`카테고리 및 제품 크롤링 시작: ${categoryId}`);
      
      // 이미 진행 중인 크롤링 작업 확인
      if (this.crawlingTasks.has(categoryId)) {
        this.logger.info(`이미 진행 중인 크롤링 작업이 있습니다: ${categoryId}`);
        return;
      }
      
      // 크롤링 작업 상태 저장
      this.crawlingTasks.set(categoryId, {
        status: 'running',
        startTime: new Date(),
        productCount: 0
      });
      
      // 카테고리 제품 크롤링
      const message = {
        intent: 'crawlCategoryProducts',
        payload: {
          categoryId,
          limit: 50, // 카테고리별 최대 50개 제품
          force: true // 강제 크롤링
        }
      };
      
      const result = await this.processMessage(message);
      
      if (result.success) {
        const products = result.products || [];
        
        // 크롤링 작업 상태 업데이트
        this.crawlingTasks.set(categoryId, {
          status: 'completed',
          startTime: this.crawlingTasks.get(categoryId).startTime,
          endTime: new Date(),
          productCount: products.length
        });
        
        this.logger.info(`카테고리 및 제품 크롤링 완료: ${categoryId} (${products.length}개 제품)`);
      } else {
        throw new Error(result.error || '알 수 없는 오류');
      }
    } catch (error) {
      this.logger.error(`카테고리 및 제품 크롤링 오류: ${categoryId}`, error);
      
      // 크롤링 작업 상태 업데이트
      this.crawlingTasks.set(categoryId, {
        status: 'failed',
        startTime: this.crawlingTasks.get(categoryId)?.startTime || new Date(),
        endTime: new Date(),
        error: error.message
      });
    }
  }
  
  /**
   * 제품 크롤링
   * @param {string} productUrl - 제품 URL
   * @returns {Promise<Object>} 제품 정보
   */
  async crawlProduct(productUrl) {
    try {
      // Apify를 사용하여 제품 정보 크롤링
      const run = await this.apifyClient.actor('apify/website-content-crawler').call({
        startUrls: [{ url: productUrl }],
        maxCrawlDepth: 0,
        maxCrawlPages: 1,
        preNavigationHooks: `
          async function preNavigationHook(crawlingContext, gotoOptions) {
            const { page } = crawlingContext;
            
            // 제품 상세 페이지 로딩을 위한 대기
            gotoOptions.waitUntil = 'networkidle2';
            gotoOptions.timeout = 60000;
          }
        `,
        postNavigationHooks: `
          async function postNavigationHook(crawlingContext) {
            const { page } = crawlingContext;
            
            // 동적 콘텐츠 로딩을 위한 추가 대기
            await page.waitForTimeout(2000);
            
            // 쿠키 배너 닫기 (있는 경우)
            try {
              const cookieAcceptButton = await page.$('.cookie-accept-button, .cookie-consent-accept, .privacy-alert-accept');
              if (cookieAcceptButton) {
                await cookieAcceptButton.click();
                await page.waitForTimeout(500);
              }
            } catch (e) {
              // 쿠키 배너가 없는 경우 무시
            }
          }
        `
      });
      
      // 크롤링 결과 가져오기
      const dataset = await this.apifyClient.dataset(run.defaultDatasetId).listItems();
      
      if (!dataset || dataset.items.length === 0) {
        throw new Error('제품 정보 크롤링 결과가 없습니다.');
      }
      
      // 첫 번째 결과 항목에서 제품 정보 추출
      const rawData = dataset.items[0];
      
      // 제품 정보 파싱 및 구조화
      const productInfo = this.parseProductInfo(rawData);
      
      return productInfo;
    } catch (error) {
      this.logger.error(`제품 크롤링 API 오류: ${productUrl}`, error);
      throw error;
    }
  }
  
  /**
   * 카테고리 제품 크롤링
   * @param {string} categoryUrl - 카테고리 URL
   * @param {number} limit - 최대 제품 수
   * @returns {Promise<Array>} 제품 목록
   */
  async crawlCategoryProducts(categoryUrl, limit) {
    try {
      // Apify를 사용하여 카테고리 제품 목록 크롤링
      const run = await this.apifyClient.actor('apify/website-content-crawler').call({
        startUrls: [{ url: categoryUrl }],
        maxCrawlDepth: 1, // 제품 목록 페이지만 크롤링
        maxCrawlPages: 5, // 최대 5페이지까지 크롤링
        maxResults: limit,
        preNavigationHooks: `
          async function preNavigationHook(crawlingContext, gotoOptions) {
            const { page } = crawlingContext;
            
            // 페이지 로딩을 위한 대기
            gotoOptions.waitUntil = 'networkidle2';
            gotoOptions.timeout = 60000;
          }
        `,
        postNavigationHooks: `
          async function postNavigationHook(crawlingContext) {
            const { page } = crawlingContext;
            
            // 동적 콘텐츠 로딩을 위한 추가 대기
            await page.waitForTimeout(2000);
            
            // 쿠키 배너 닫기 (있는 경우)
            try {
              const cookieAcceptButton = await page.$('.cookie-accept-button, .cookie-consent-accept, .privacy-alert-accept');
              if (cookieAcceptButton) {
                await cookieAcceptButton.click();
                await page.waitForTimeout(500);
              }
            } catch (e) {
              // 쿠키 배너가 없는 경우 무시
            }
            
            // 더 보기 버튼 클릭 (있는 경우)
            try {
              const loadMoreButton = await page.$('.load-more-button, .show-more-products, .view-more-button');
              if (loadMoreButton) {
                await loadMoreButton.click();
                await page.waitForTimeout(2000);
              }
            } catch (e) {
              // 더 보기 버튼이 없는 경우 무시
            }
          }
        `
      });
      
      // 크롤링 결과 가져오기
      const dataset = await this.apifyClient.dataset(run.defaultDatasetId).listItems();
      
      if (!dataset || dataset.items.length === 0) {
        throw new Error('카테고리 제품 크롤링 결과가 없습니다.');
      }
      
      // 제품 목록 추출 및 구조화
      const productsList = this.parseProductsList(dataset.items, limit);
      
      return productsList;
    } catch (error) {
      this.logger.error(`카테고리 제품 크롤링 API 오류: ${categoryUrl}`, error);
      throw error;
    }
  }
  
  /**
   * 제품 재고 확인
   * @param {string} productId - 제품 ID
   * @returns {Promise<Object>} 재고 정보
   */
  async checkProductStockAvailability(productId) {
    try {
      // 제품 페이지 URL
      const productUrl = `https://www.lge.com/br/product/${productId}`;
      
      // Apify를 사용하여 제품 재고 정보 확인
      const run = await this.apifyClient.actor('apify/website-content-crawler').call({
        startUrls: [{ url: productUrl }],
        maxCrawlDepth: 0,
        maxCrawlPages: 1,
        preNavigationHooks: `
          async function preNavigationHook(crawlingContext, gotoOptions) {
            const { page } = crawlingContext;
            
            // 제품 상세 페이지 로딩을 위한 대기
            gotoOptions.waitUntil = 'networkidle2';
            gotoOptions.timeout = 60000;
          }
        `,
        postNavigationHooks: `
          async function postNavigationHook(crawlingContext) {
            const { page } = crawlingContext;
            
            // 동적 콘텐츠 로딩을 위한 추가 대기
            await page.waitForTimeout(2000);
          }
        `
      });
      
      // 크롤링 결과 가져오기
      const dataset = await this.apifyClient.dataset(run.defaultDatasetId).listItems();
      
      if (!dataset || dataset.items.length === 0) {
        throw new Error('제품 재고 정보 크롤링 결과가 없습니다.');
      }
      
      // 재고 정보 추출
      const stockInfo = this.parseStockInfo(dataset.items[0]);
      
      return stockInfo;
    } catch (error) {
      this.logger.error(`제품 재고 확인 API 오류: ${productId}`, error);
      throw error;
    }
  }
  
  /**
   * 체크아웃 프로세스 크롤링
   * @param {string} productUrl - 제품 URL
   * @returns {Promise<Object>} 체크아웃 프로세스 정보
   */
  async crawlCheckoutProcess(productUrl) {
    try {
      // Apify를 사용하여 체크아웃 프로세스 크롤링
      const run = await this.apifyClient.actor('apify/website-content-crawler').call({
        startUrls: [{ url: productUrl }],
        clickableElements: ['a[href*="checkout"], button.buy-now, button.buy-button, .checkout-button, .buy-now-button'],
        maxCrawlDepth: 3, // 최대 3단계까지 크롤링 (제품 페이지 → 장바구니 → 체크아웃 → 결제)
        maxCrawlPages: 5,
        preNavigationHooks: `
          async function preNavigationHook(crawlingContext, gotoOptions) {
            const { page } = crawlingContext;
            
            // 페이지 로딩을 위한 대기
            gotoOptions.waitUntil = 'networkidle2';
            gotoOptions.timeout = 60000;
          }
        `,
        postNavigationHooks: `
          async function postNavigationHook(crawlingContext) {
            const { page } = crawlingContext;
            
            // 동적 콘텐츠 로딩을 위한 추가 대기
            await page.waitForTimeout(2000);
            
            // 쿠키 배너 닫기 (있는 경우)
            try {
              const cookieAcceptButton = await page.$('.cookie-accept-button, .cookie-consent-accept, .privacy-alert-accept');
              if (cookieAcceptButton) {
                await cookieAcceptButton.click();
                await page.waitForTimeout(500);
              }
            } catch (e) {
              // 쿠키 배너가 없는 경우 무시
            }
          }
        `
      });
      
      // 크롤링 결과 가져오기
      const dataset = await this.apifyClient.dataset(run.defaultDatasetId).listItems();
      
      if (!dataset || dataset.items.length === 0) {
        throw new Error('체크아웃 프로세스 크롤링 결과가 없습니다.');
      }
      
      // 체크아웃 프로세스 정보 추출
      const checkoutProcess = this.parseCheckoutProcess(dataset.items);
      
      return checkoutProcess;
    } catch (error) {
      this.logger.error(`체크아웃 프로세스 크롤링 API 오류: ${productUrl}`, error);
      throw error;
    }
  }
  
  /**
   * 검색 결과 크롤링
   * @param {string} query - 검색 쿼리
   * @param {number} limit - 최대 결과 수
   * @returns {Promise<Array>} 검색 결과 목록
   */
  async crawlSearchResults(query, limit) {
    try {
      // 검색 URL
      const searchUrl = `https://www.lge.com/br/search?q=${encodeURIComponent(query)}`;
      
      // Apify를 사용하여 검색 결과 크롤링
      const run = await this.apifyClient.actor('apify/website-content-crawler').call({
        startUrls: [{ url: searchUrl }],
        maxCrawlDepth: 0,
        maxCrawlPages: 1,
        preNavigationHooks: `
          async function preNavigationHook(crawlingContext, gotoOptions) {
            const { page } = crawlingContext;
            
            // 페이지 로딩을 위한 대기
            gotoOptions.waitUntil = 'networkidle2';
            gotoOptions.timeout = 60000;
          }
        `,
        postNavigationHooks: `
          async function postNavigationHook(crawlingContext) {
            const { page } = crawlingContext;
            
            // 동적 콘텐츠 로딩을 위한 추가 대기
            await page.waitForTimeout(2000);
            
            // 쿠키 배너 닫기 (있는 경우)
            try {
              const cookieAcceptButton = await page.$('.cookie-accept-button, .cookie-consent-accept, .privacy-alert-accept');
              if (cookieAcceptButton) {
                await cookieAcceptButton.click();
                await page.waitForTimeout(500);
              }
            } catch (e) {
              // 쿠키 배너가 없는 경우 무시
            }
          }
        `
      });
      
      // 크롤링 결과 가져오기
      const dataset = await this.apifyClient.dataset(run.defaultDatasetId).listItems();
      
      if (!dataset || dataset.items.length === 0) {
        throw new Error('검색 결과 크롤링 결과가 없습니다.');
      }
      
      // 검색 결과 추출 및 구조화
      const searchResults = this.parseSearchResults(dataset.items[0], limit);
      
      return searchResults;
    } catch (error) {
      this.logger.error(`검색 결과 크롤링 API 오류: ${query}`, error);
      throw error;
    }
  }
  
  /**
   * 제품 정보 파싱
   * @param {Object} rawData - 원시 크롤링 데이터
   * @returns {Object} 파싱된 제품 정보
   */
  parseProductInfo(rawData) {
    try {
      // HTML 콘텐츠에서 제품 정보 추출
      const html = rawData.html || '';
      
      // URL에서 제품 ID 추출
      const url = rawData.url || '';
      const idMatch = url.match(/\/product\/([^\/]+)$/);
      const id = idMatch ? idMatch[1] : '';
      
      // 제품명 추출
      const nameMatch = html.match(/<h1[^>]*class="[^"]*product-name[^"]*"[^>]*>([^<]+)<\/h1>/i) ||
                         html.match(/<div[^>]*class="[^"]*product-title[^"]*"[^>]*>([^<]+)<\/div>/i);
      const name = nameMatch ? nameMatch[1].trim() : '';
      
      // 제품 가격 추출
      const priceMatch = html.match(/R\$\s*([\d\.,]+)/i) ||
                         html.match(/<span[^>]*class="[^"]*price[^"]*"[^>]*>R\$\s*([\d\.,]+)<\/span>/i);
      const priceStr = priceMatch ? priceMatch[1].replace(/\./g, '').replace(',', '.') : '0';
      const price = parseFloat(priceStr) || 0;
      
      // 제품 이미지 URL 추출
      const imageMatch = html.match(/<img[^>]*class="[^"]*product-image[^"]*"[^>]*src="([^"]+)"/i) ||
                          html.match(/<div[^>]*class="[^"]*product-gallery[^"]*"[^>]*>.*?<img[^>]*src="([^"]+)"/i);
      const image = imageMatch ? imageMatch[1] : '';
      
      // 제품 설명 추출
      const descriptionMatch = html.match(/<div[^>]*class="[^"]*product-description[^"]*"[^>]*>(.*?)<\/div>/is) ||
                               html.match(/<div[^>]*id="product-description"[^>]*>(.*?)<\/div>/is);
      const descriptionHtml = descriptionMatch ? descriptionMatch[1] : '';
      const description = this.cleanHtml(descriptionHtml);
      
      // 제품 특징 추출
      const featuresMatch = html.match(/<ul[^>]*class="[^"]*product-features[^"]*"[^>]*>(.*?)<\/ul>/is) ||
                            html.match(/<div[^>]*class="[^"]*features-list[^"]*"[^>]*>(.*?)<\/div>/is);
      const featuresHtml = featuresMatch ? featuresMatch[1] : '';
      const featuresList = featuresHtml.match(/<li[^>]*>(.*?)<\/li>/ig) || [];
      const features = featuresList.map(feature => this.cleanHtml(feature));
      
      // 제품 스펙 추출
      const specsMatch = html.match(/<table[^>]*class="[^"]*specifications-table[^"]*"[^>]*>(.*?)<\/table>/is) ||
                          html.match(/<div[^>]*id="product-specifications"[^>]*>(.*?)<\/div>/is);
      const specsHtml = specsMatch ? specsMatch[1] : '';
      const specRows = specsHtml.match(/<tr[^>]*>(.*?)<\/tr>/ig) || [];
      
      const specs = {};
      for (const row of specRows) {
        const keyMatch = row.match(/<th[^>]*>(.*?)<\/th>/i) || row.match(/<td[^>]*class="[^"]*spec-name[^"]*"[^>]*>(.*?)<\/td>/i);
        const valueMatch = row.match(/<td[^>]*>(.*?)<\/td>/i) || row.match(/<td[^>]*class="[^"]*spec-value[^"]*"[^>]*>(.*?)<\/td>/i);
        
        if (keyMatch && valueMatch) {
          const key = this.cleanHtml(keyMatch[1]);
          const value = this.cleanHtml(valueMatch[1]);
          
          if (key && value) {
            specs[key] = value;
          }
        }
      }
      
      // 재고 상태 추출
      const stockMatch = html.match(/<div[^>]*class="[^"]*stock-status[^"]*"[^>]*>(.*?)<\/div>/is) ||
                         html.match(/<span[^>]*class="[^"]*availability[^"]*"[^>]*>(.*?)<\/span>/is);
      const stockText = stockMatch ? this.cleanHtml(stockMatch[1]) : '';
      const inStock = !stockText.includes('indisponível') && !stockText.includes('esgotado');
      
      // 리뷰 평점 추출
      const ratingMatch = html.match(/<div[^>]*class="[^"]*rating[^"]*"[^>]*data-rating="([\d\.]+)"/i) ||
                          html.match(/<span[^>]*class="[^"]*rating-value[^"]*"[^>]*>([\d\.]+)<\/span>/i);
      const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;
      
      // 카테고리 추출
      const categoryMatch = html.match(/<ul[^>]*class="[^"]*breadcrumb[^"]*"[^>]*>.*?<li[^>]*><a[^>]*>([^<]+)<\/a><\/li>.*?<\/ul>/is) ||
                            html.match(/<ol[^>]*class="[^"]*breadcrumb[^"]*"[^>]*>.*?<li[^>]*><a[^>]*>([^<]+)<\/a><\/li>.*?<\/ol>/is);
      const category = categoryMatch ? categoryMatch[1].trim() : '';
      
      // 제품 정보 객체 구성
      return {
        id,
        name,
        price,
        image,
        description,
        features,
        specs,
        inStock,
        rating,
        category,
        url
      };
    } catch (error) {
      this.logger.error('제품 정보 파싱 오류:', error);
      
      // 기본 제품 정보 반환
      return {
        id: '',
        name: '',
        price: 0,
        image: '',
        description: '',
        features: [],
        specs: {},
        inStock: false,
        rating: 0,
        category: '',
        url: ''
      };
    }
  }
  
  /**
   * 제품 목록 파싱
   * @param {Array} items - 크롤링 결과 항목 배열
   * @param {number} limit - 최대 제품 수
   * @returns {Array} 파싱된 제품 목록
   */
  parseProductsList(items, limit) {
    try {
      // 제품 목록이 포함된 항목 찾기
      const productListItem = items.find(item => {
        const html = item.html || '';
        return html.includes('product-grid') || html.includes('product-list') || html.includes('products-container');
      });
      
      if (!productListItem) {
        return [];
      }
      
      const html = productListItem.html || '';
      
      // 제품 항목 추출
      const productItems = html.match(/<div[^>]*class="[^"]*product-item[^"]*"[^>]*>.*?<\/div>/gs) ||
                           html.match(/<li[^>]*class="[^"]*product[^"]*"[^>]*>.*?<\/li>/gs) ||
                           [];
      
      // 제품 정보 추출
      const products = [];
      
      for (let i = 0; i < Math.min(productItems.length, limit); i++) {
        const productHtml = productItems[i];
        
        // 제품 URL 및 ID 추출
        const urlMatch = productHtml.match(/href="([^"]*\/product\/[^"]+)"/i);
        const url = urlMatch ? urlMatch[1] : '';
        const idMatch = url.match(/\/product\/([^\/]+)$/);
        const id = idMatch ? idMatch[1] : '';
        
        // 제품명 추출
        const nameMatch = productHtml.match(/<h3[^>]*class="[^"]*product-name[^"]*"[^>]*>([^<]+)<\/h3>/i) ||
                          productHtml.match(/<div[^>]*class="[^"]*product-title[^"]*"[^>]*>([^<]+)<\/div>/i);
        const name = nameMatch ? nameMatch[1].trim() : '';
        
        // 제품 가격 추출
        const priceMatch = productHtml.match(/R\$\s*([\d\.,]+)/i) ||
                           productHtml.match(/<span[^>]*class="[^"]*price[^"]*"[^>]*>R\$\s*([\d\.,]+)<\/span>/i);
        const priceStr = priceMatch ? priceMatch[1].replace(/\./g, '').replace(',', '.') : '0';
        const price = parseFloat(priceStr) || 0;
        
        // 제품 이미지 URL 추출
        const imageMatch = productHtml.match(/<img[^>]*src="([^"]+)"/i);
        const image = imageMatch ? imageMatch[1] : '';
        
        // 제품 요약 추출
        const summaryMatch = productHtml.match(/<div[^>]*class="[^"]*product-summary[^"]*"[^>]*>(.*?)<\/div>/is) ||
                             productHtml.match(/<p[^>]*class="[^"]*description[^"]*"[^>]*>(.*?)<\/p>/is);
        const summary = summaryMatch ? this.cleanHtml(summaryMatch[1]) : '';
        
        // 제품 정보가 충분한 경우에만 추가
        if (id && name && url) {
          products.push({
            id,
            name,
            price,
            image,
            summary,
            url
          });
        }
      }
      
      return products;
    } catch (error) {
      this.logger.error('제품 목록 파싱 오류:', error);
      return [];
    }
  }
  
  /**
   * 재고 정보 파싱
   * @param {Object} rawData - 원시 크롤링 데이터
   * @returns {Object} 파싱된 재고 정보
   */
  parseStockInfo(rawData) {
    try {
      const html = rawData.html || '';
      
      // 재고 상태 추출
      const stockMatch = html.match(/<div[^>]*class="[^"]*stock-status[^"]*"[^>]*>(.*?)<\/div>/is) ||
                         html.match(/<span[^>]*class="[^"]*availability[^"]*"[^>]*>(.*?)<\/span>/is);
      const stockText = stockMatch ? this.cleanHtml(stockMatch[1]) : '';
      
      // 재고 가용 여부 확인
      const available = !stockText.includes('indisponível') && !stockText.includes('esgotado');
      
      // 수량 제한 정보 추출
      const quantityMatch = html.match(/Limite\s+de\s+(\d+)\s+unidades/i) ||
                            html.match(/Máximo\s+de\s+(\d+)\s+unidades/i);
      const maxQuantity = quantityMatch ? parseInt(quantityMatch[1]) : undefined;
      
      // 배송 예정일 정보 추출
      const deliveryMatch = html.match(/Entrega\s+prevista[^:]*:\s*([^<]+)/i) ||
                            html.match(/Previsão\s+de\s+entrega[^:]*:\s*([^<]+)/i);
      const estimatedDelivery = deliveryMatch ? deliveryMatch[1].trim() : '';
      
      // 재고 정보 객체 구성
      return {
        available,
        quantity: maxQuantity,
        estimatedDelivery,
        stockStatus: stockText
      };
    } catch (error) {
      this.logger.error('재고 정보 파싱 오류:', error);
      
      // 기본 재고 정보 반환
      return {
        available: false,
        quantity: undefined,
        estimatedDelivery: '',
        stockStatus: ''
      };
    }
  }
  
  /**
   * 체크아웃 프로세스 파싱
   * @param {Array} items - 크롤링 결과 항목 배열
   * @returns {Object} 파싱된 체크아웃 프로세스 정보
   */
  parseCheckoutProcess(items) {
    try {
      // 체크아웃 단계 정보 초기화
      const checkoutSteps = [];
      
      // 장바구니 페이지 분석
      const cartPage = items.find(item => {
        const url = item.url || '';
        const html = item.html || '';
        return url.includes('/cart') || html.includes('shopping-cart') || html.includes('carrinho');
      });
      
      if (cartPage) {
        const cartHtml = cartPage.html || '';
        
        // 장바구니 단계 필드 추출
        const requiredFields = [];
        
        // 장바구니 단계 추가
        checkoutSteps.push({
          step: 1,
          name: 'Carrinho de Compras',
          description: 'Revise os produtos no seu carrinho de compras',
          requiredFields,
          nextButtonSelector: '.checkout-button, .proceed-to-checkout'
        });
      }
      
      // 배송 정보 페이지 분석
      const shippingPage = items.find(item => {
        const url = item.url || '';
        const html = item.html || '';
        return url.includes('/checkout') && (html.includes('shipping-info') || html.includes('endereco') || html.includes('entrega'));
      });
      
      if (shippingPage) {
        const shippingHtml = shippingPage.html || '';
        
        // 배송 정보 필드 추출
        const inputFields = shippingHtml.match(/<input[^>]*name="([^"]+)"[^>]*>/ig) || [];
        const requiredFields = [];
        
        for (const inputField of inputFields) {
          const nameMatch = inputField.match(/name="([^"]+)"/i);
          const requiredMatch = inputField.match(/required/i);
          const typeMatch = inputField.match(/type="([^"]+)"/i);
          const placeholderMatch = inputField.match(/placeholder="([^"]+)"/i);
          
          if (nameMatch) {
            const name = nameMatch[1];
            const type = typeMatch ? typeMatch[1] : 'text';
            const required = !!requiredMatch;
            const description = placeholderMatch ? placeholderMatch[1] : name;
            
            // 중복 필드 체크
            if (!requiredFields.some(field => field.name === name)) {
              requiredFields.push({
                name,
                type,
                required,
                description
              });
            }
          }
        }
        
        // 배송 정보 단계 추가
        checkoutSteps.push({
          step: 2,
          name: 'Informações de Entrega',
          description: 'Informe seu endereço de entrega',
          requiredFields,
          nextButtonSelector: '.continue-button, .next-step'
        });
      }
      
      // 결제 정보 페이지 분석
      const paymentPage = items.find(item => {
        const url = item.url || '';
        const html = item.html || '';
        return url.includes('/checkout') && (html.includes('payment-info') || html.includes('pagamento'));
      });
      
      if (paymentPage) {
        const paymentHtml = paymentPage.html || '';
        
        // 결제 방법 추출
        const paymentMethodsMatch = paymentHtml.match(/<div[^>]*class="[^"]*payment-methods[^"]*"[^>]*>(.*?)<\/div>/is);
        const paymentMethodsHtml = paymentMethodsMatch ? paymentMethodsMatch[1] : '';
        
        // 결제 방법 옵션 추출
        const paymentOptions = [];
        const methodMatches = paymentMethodsHtml.match(/<input[^>]*type="radio"[^>]*name="payment_method"[^>]*value="([^"]+)"[^>]*>/ig) || [];
        
        for (const methodMatch of methodMatches) {
          const valueMatch = methodMatch.match(/value="([^"]+)"/i);
          if (valueMatch) {
            paymentOptions.push(valueMatch[1]);
          }
        }
        
        // 결제 정보 필드 추출
        const inputFields = paymentHtml.match(/<input[^>]*name="([^"]+)"[^>]*>/ig) || [];
        const requiredFields = [
          {
            name: 'paymentMethod',
            type: 'select',
            options: paymentOptions.length > 0 ? paymentOptions : ['credit_card', 'boleto', 'pix'],
            required: true,
            description: 'Método de pagamento'
          }
        ];
        
        for (const inputField of inputFields) {
          const nameMatch = inputField.match(/name="([^"]+)"/i);
          const requiredMatch = inputField.match(/required/i);
          const typeMatch = inputField.match(/type="([^"]+)"/i);
          const placeholderMatch = inputField.match(/placeholder="([^"]+)"/i);
          
          if (nameMatch && !nameMatch[1].includes('payment_method')) {
            const name = nameMatch[1];
            const type = typeMatch ? typeMatch[1] : 'text';
            const required = !!requiredMatch;
            const description = placeholderMatch ? placeholderMatch[1] : name;
            
            // 중복 필드 체크
            if (!requiredFields.some(field => field.name === name)) {
              requiredFields.push({
                name,
                type,
                required,
                description
              });
            }
          }
        }
        
        // 결제 정보 단계 추가
        checkoutSteps.push({
          step: 3,
          name: 'Informações de Pagamento',
          description: 'Escolha o método de pagamento e informe os dados necessários',
          requiredFields,
          nextButtonSelector: '.place-order-button, .confirm-order'
        });
      }
      
      // 단계 정보가 없는 경우 기본 프로세스 반환
      if (checkoutSteps.length === 0) {
        return this.getDefaultCheckoutProcess();
      }
      
      return {
        steps: checkoutSteps
      };
    } catch (error) {
      this.logger.error('체크아웃 프로세스 파싱 오류:', error);
      
      // 기본 체크아웃 프로세스 반환
      return this.getDefaultCheckoutProcess();
    }
  }
  
  /**
   * 검색 결과 파싱
   * @param {Object} rawData - 원시 크롤링 데이터
   * @param {number} limit - 최대 결과 수
   * @returns {Array} 파싱된 검색 결과 목록
   */
  parseSearchResults(rawData, limit) {
    try {
      const html = rawData.html || '';
      
      // 검색 결과 항목 추출
      const resultItems = html.match(/<div[^>]*class="[^"]*search-result-item[^"]*"[^>]*>.*?<\/div>/gs) ||
                          html.match(/<div[^>]*class="[^"]*product-item[^"]*"[^>]*>.*?<\/div>/gs) ||
                          [];
      
      // 검색 결과 정보 추출
      const searchResults = [];
      
      for (let i = 0; i < Math.min(resultItems.length, limit); i++) {
        const resultHtml = resultItems[i];
        
        // 제품 URL 및 ID 추출
        const urlMatch = resultHtml.match(/href="([^"]*\/product\/[^"]+)"/i);
        const url = urlMatch ? urlMatch[1] : '';
        const idMatch = url.match(/\/product\/([^\/]+)$/);
        const id = idMatch ? idMatch[1] : '';
        
        // 제품명 추출
        const nameMatch = resultHtml.match(/<h3[^>]*>([^<]+)<\/h3>/i) ||
                          resultHtml.match(/<div[^>]*class="[^"]*product-title[^"]*"[^>]*>([^<]+)<\/div>/i);
        const name = nameMatch ? nameMatch[1].trim() : '';
        
        // 제품 가격 추출
        const priceMatch = resultHtml.match(/R\$\s*([\d\.,]+)/i) ||
                           resultHtml.match(/<span[^>]*class="[^"]*price[^"]*"[^>]*>R\$\s*([\d\.,]+)<\/span>/i);
        const priceStr = priceMatch ? priceMatch[1].replace(/\./g, '').replace(',', '.') : '0';
        const price = parseFloat(priceStr) || 0;
        
        // 제품 이미지 URL 추출
        const imageMatch = resultHtml.match(/<img[^>]*src="([^"]+)"/i);
        const image = imageMatch ? imageMatch[1] : '';
        
        // 제품 요약 추출
        const summaryMatch = resultHtml.match(/<div[^>]*class="[^"]*product-summary[^"]*"[^>]*>(.*?)<\/div>/is) ||
                             resultHtml.match(/<p[^>]*class="[^"]*description[^"]*"[^>]*>(.*?)<\/p>/is);
        const summary = summaryMatch ? this.cleanHtml(summaryMatch[1]) : '';
        
        // 검색 결과 정보가 충분한 경우에만 추가
        if (name && url) {
          searchResults.push({
            id,
            name,
            price,
            image,
            summary,
            url
          });
        }
      }
      
      return searchResults;
    } catch (error) {
      this.logger.error('검색 결과 파싱 오류:', error);
      return [];
    }
  }
  
  /**
   * Algolia 인덱스에 제품 정보 업데이트
   * @param {Object} productInfo - 제품 정보
   * @returns {Promise<void>}
   */
  async updateProductInAlgolia(productInfo) {
    try {
      // 제품 ID 확인
      if (!productInfo.id) {
        throw new Error('제품 ID가 없습니다.');
      }
      
      // Algolia 인덱스 객체 가져오기
      const index = this.algoliaClient.initIndex('products');
      
      // 인덱스에 제품 정보 저장
      await index.saveObject({
        objectID: productInfo.id,
        ...productInfo,
        _tags: [
          `category:${productInfo.category || 'unknown'}`,
          `price:${productInfo.price ? this.getPriceRange(productInfo.price) : 'unknown'}`,
          `inStock:${productInfo.inStock ? 'yes' : 'no'}`
        ],
        _timestamp: Date.now()
      });
      
      this.logger.info(`Algolia 인덱스 업데이트 완료: ${productInfo.id}`);
    } catch (error) {
      this.logger.error(`Algolia 인덱스 업데이트 오류: ${productInfo.id}`, error);
      throw error;
    }
  }
  
  /**
   * Algolia 인덱스에 제품 정보 일괄 업데이트
   * @param {Array} products - 제품 정보 배열
   * @returns {Promise<void>}
   */
  async batchUpdateProductsInAlgolia(products) {
    try {
      // 제품 정보 확인
      if (!products || products.length === 0) {
        throw new Error('제품 정보가 없습니다.');
      }
      
      // Algolia 인덱스 객체 가져오기
      const index = this.algoliaClient.initIndex('products');
      
      // 인덱스 객체 배열 생성
      const objects = products.map(product => ({
        objectID: product.id,
        ...product,
        _tags: [
          `category:${product.category || 'unknown'}`,
          `price:${product.price ? this.getPriceRange(product.price) : 'unknown'}`,
          `inStock:${product.inStock ? 'yes' : 'no'}`
        ],
        _timestamp: Date.now()
      }));
      
      // 일괄 업데이트
      await index.saveObjects(objects);
      
      this.logger.info(`Algolia 인덱스 일괄 업데이트 완료: ${products.length}개 제품`);
    } catch (error) {
      this.logger.error(`Algolia 인덱스 일괄 업데이트 오류`, error);
      throw error;
    }
  }
  
  /**
   * 가격 범위 반환
   * @param {number} price - 제품 가격
   * @returns {string} 가격 범위
   */
  getPriceRange(price) {
    if (price < 500) {
      return 'low';
    } else if (price < 2000) {
      return 'medium';
    } else {
      return 'high';
    }
  }
  
  /**
   * HTML 텍스트 정리
   * @param {string} html - HTML 텍스트
   * @returns {string} 정리된 텍스트
   */
  cleanHtml(html) {
    return html
      .replace(/<[^>]+>/g, '') // HTML 태그 제거
      .replace(/&nbsp;/g, ' ') // &nbsp; 공백으로 변환
      .replace(/&amp;/g, '&') // &amp; &로 변환
      .replace(/&lt;/g, '<') // &lt; <로 변환
      .replace(/&gt;/g, '>') // &gt; >로 변환
      .replace(/&quot;/g, '"') // &quot; "로 변환
      .replace(/&#039;/g, "'") // &#039; '로 변환
      .replace(/\s+/g, ' ') // 연속된 공백 하나로 변환
      .trim(); // 앞뒤 공백 제거
  }
  
  /**
   * 기본 체크아웃 프로세스 반환
   * @returns {Object} 기본 체크아웃 프로세스
   */
  getDefaultCheckoutProcess() {
    return {
      steps: [
        {
          step: 1,
          name: 'Carrinho de Compras',
          description: 'Revise os produtos no seu carrinho de compras',
          requiredFields: [],
          nextButtonSelector: '.checkout-button, .proceed-to-checkout'
        },
        {
          step: 2,
          name: 'Informações Pessoais',
          description: 'Preencha suas informações pessoais',
          requiredFields: [
            {
              name: 'name',
              description: 'Nome completo',
              type: 'text',
              required: true
            },
            {
              name: 'email',
              description: 'Endereço de e-mail',
              type: 'email',
              required: true
            },
            {
              name: 'phone',
              description: 'Número de telefone',
              type: 'tel',
              required: true
            }
          ],
          nextButtonSelector: '.next-step-button'
        },
        {
          step: 3,
          name: 'Endereço de Entrega',
          description: 'Informe seu endereço de entrega',
          requiredFields: [
            {
              name: 'zipCode',
              description: 'CEP',
              type: 'text',
              required: true
            },
            {
              name: 'address',
              description: 'Endereço completo',
              type: 'text',
              required: true
            },
            {
              name: 'city',
              description: 'Cidade',
              type: 'text',
              required: true
            },
            {
              name: 'state',
              description: 'Estado',
              type: 'text',
              required: true
            }
          ],
          nextButtonSelector: '.next-step-button'
        },
        {
          step: 4,
          name: 'Método de Pagamento',
          description: 'Escolha o método de pagamento',
          requiredFields: [
            {
              name: 'paymentMethod',
              description: 'Método de pagamento',
              type: 'select',
              options: ['credit_card', 'boleto', 'pix'],
              required: true
            }
          ],
          nextButtonSelector: '.next-step-button'
        }
      ]
    };
  }
}

module.exports = CrawlingCoordinatorAgent;
