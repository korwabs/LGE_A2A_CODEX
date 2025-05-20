/**
 * 크롤링 관리자 (업그레이드 버전) - 크롤링 작업 관리 및 조율
 */
const BrowserController = require('../controllers/browser-controller');
const IntelligentExtractor = require('../extractors/intelligent-extractor');
const CheckoutAutomation = require('../checkout/checkout-automation');
const CategoryCrawler = require('./specialized/category-crawler');
const ProductCrawler = require('./specialized/product-crawler');
const CrawlingErrorHandler = require('./specialized/crawling-error-handler');
const { retry, sleep } = require('../utils/retry-utils');
const { delay, rateLimit } = require('../utils/delay-utils');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

/**
 * 크롤링 관리자 클래스
 * @extends EventEmitter
 */
class CrawlingManager extends EventEmitter {
  /**
   * @param {object} options - 크롤링 관리자 옵션
   * @param {object} options.browserOptions - 브라우저 컨트롤러 옵션
   * @param {object} options.extractorOptions - 지능형 추출기 옵션
   * @param {object} options.checkoutOptions - 체크아웃 자동화 옵션
   * @param {number} options.maxRetries - 최대 재시도 횟수
   * @param {number} options.maxConcurrency - 최대 동시 처리 수
   * @param {string} options.dataDir - 데이터 저장 디렉토리
   * @param {string} options.logDir - 로그 저장 디렉토리
   */
  constructor(options = {}) {
    super();
    
    this.options = options;
    this.browserController = new BrowserController(options.browserOptions);
    this.extractor = new IntelligentExtractor(options.extractorOptions);
    this.checkoutAutomation = new CheckoutAutomation({
      browserController: this.browserController,
      ...options.checkoutOptions
    });
    
    // 특화된 크롤러 초기화
    this.categoryCrawler = new CategoryCrawler({
      browserController: this.browserController,
      extractor: this.extractor,
      dataDir: options.dataDir,
      maxRetries: options.maxRetries,
      slugify: this._slugify.bind(this)
    });
    
    this.productCrawler = new ProductCrawler({
      browserController: this.browserController,
      extractor: this.extractor,
      dataDir: options.dataDir,
      maxRetries: options.maxRetries,
      slugify: this._slugify.bind(this)
    });
    
    // 오류 처리기 초기화
    this.errorHandler = new CrawlingErrorHandler({
      logDir: options.logDir || path.join(__dirname, '../../logs'),
      maxRetryAttempts: options.maxRetries || 3,
      logDetailedErrors: true,
      browserController: this.browserController
    });
    
    this.maxRetries = options.maxRetries || 3;
    this.maxConcurrency = options.maxConcurrency || 5;
    this.dataDir = options.dataDir || path.join(__dirname, '../../data');
    this.logDir = options.logDir || path.join(__dirname, '../../logs');
    
    // 크롤링 작업 큐 및 상태
    this.crawlingQueue = [];
    this.activeCrawlingTasks = 0;
    this.maxActiveTasks = options.maxActiveTasks || 10;
    this.isProcessingQueue = false;
    this.pauseProcessing = false;
    
    // 통계 및 모니터링
    this.stats = {
      startTime: null,
      endTime: null,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retries: 0
    };
    
    // 데이터/로그 디렉토리 확인
    this._ensureDirectories();
    
    this.logger = logger;
    this.logger.info('CrawlingManager: 초기화 완료');
  }
  
  /**
   * 필요한 디렉토리 존재 여부 확인 및 생성
   * @private
   */
  _ensureDirectories() {
    // 데이터 디렉토리 확인
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
      this.logger.debug(`CrawlingManager: 데이터 디렉토리 생성 - ${this.dataDir}`);
    }
    
    // 로그 디렉토리 확인
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
      this.logger.debug(`CrawlingManager: 로그 디렉토리 생성 - ${this.logDir}`);
    }
  }
  
  /**
   * 카테고리를 크롤링합니다.
   * @param {object} category - 카테고리 정보
   * @param {string} category.url - 카테고리 URL
   * @param {string} category.name - 카테고리 이름
   * @param {string} category.type - 카테고리 타입 (셀렉터 선택에 사용)
   * @param {object} options - 크롤링 옵션
   * @returns {Promise<Array>} 카테고리 내 제품 목록
   */
  async crawlCategory(category, options = {}) {
    this.logger.info(`CrawlingManager: 카테고리 크롤링 시작 - ${category.name || category.url}`);
    
    try {
      // 크롤링 통계 업데이트
      this._updateStats('start');
      this.stats.totalRequests++;
      
      // 카테고리 크롤러 사용
      const products = await this.categoryCrawler.crawlCategory(category, options);
      
      // 성공 통계 업데이트
      this.stats.successfulRequests++;
      this._updateStats('end');
      
      // 이벤트 발생
      this.emit('categoryCrawled', { category, products });
      
      return products;
    } catch (error) {
      // 실패 통계 업데이트
      this.stats.failedRequests++;
      this._updateStats('end');
      
      this.logger.error(`CrawlingManager: 카테고리 크롤링 실패 - ${category.url}`, error);
      
      // 이벤트 발생
      this.emit('error', { type: 'category', category, error });
      
      throw error;
    }
  }
  
  /**
   * 제품 상세 정보를 크롤링합니다.
   * @param {object|string} product - 제품 정보 또는 제품 URL
   * @param {string} category - 제품 카테고리 (셀렉터 및 추출 목표 선택에 사용)
   * @param {object} options - 크롤링 옵션
   * @returns {Promise<object>} 상세 정보가 추가된 제품 정보
   */
  async crawlProductDetails(product, category = 'default', options = {}) {
    const productUrl = typeof product === 'string' ? product : product.url;
    const productTitle = typeof product === 'string' ? null : product.title;
    
    this.logger.info(`CrawlingManager: 제품 크롤링 시작 - ${productTitle || productUrl}`);
    
    try {
      // 크롤링 통계 업데이트
      this._updateStats('start');
      this.stats.totalRequests++;
      
      // 제품 크롤러 사용
      const detailedProduct = await this.productCrawler.crawlProductDetails(product, category, options);
      
      // 성공 통계 업데이트
      this.stats.successfulRequests++;
      this._updateStats('end');
      
      // 이벤트 발생
      this.emit('productCrawled', { product: detailedProduct });
      
      return detailedProduct;
    } catch (error) {
      // 실패 통계 업데이트
      this.stats.failedRequests++;
      this._updateStats('end');
      
      this.logger.error(`CrawlingManager: 제품 크롤링 실패 - ${productUrl}`, error);
      
      // 이벤트 발생
      this.emit('error', { type: 'product', product, error });
      
      throw error;
    }
  }
  
  /**
   * 여러 제품의 상세 정보를 크롤링합니다.
   * @param {Array<object|string>} products - 제품 정보 배열 또는 URL 배열
   * @param {string} category - 제품 카테고리
   * @param {object} options - 크롤링 옵션
   * @returns {Promise<Array>} 상세 정보가 추가된 제품 배열
   */
  async crawlMultipleProducts(products, category = 'default', options = {}) {
    if (!products || products.length === 0) {
      return [];
    }
    
    this.logger.info(`CrawlingManager: ${products.length}개 제품 크롤링 시작`);
    
    try {
      // 크롤링 통계 업데이트
      this._updateStats('start');
      this.stats.totalRequests += products.length;
      
      // 제품 크롤러 사용 (병렬 처리)
      const concurrency = options.concurrency || this.maxConcurrency;
      const detailedProducts = await this.productCrawler.crawlMultipleProducts(products, category, {
        ...options,
        concurrency
      });
      
      // 성공 통계 업데이트
      this.stats.successfulRequests += detailedProducts.length;
      this.stats.failedRequests += products.length - detailedProducts.length;
      this._updateStats('end');
      
      // 이벤트 발생
      this.emit('multipleCrawled', { products: detailedProducts });
      
      return detailedProducts;
    } catch (error) {
      // 실패 통계 업데이트
      this.stats.failedRequests += products.length;
      this._updateStats('end');
      
      this.logger.error(`CrawlingManager: 다중 제품 크롤링 실패`, error);
      
      // 이벤트 발생
      this.emit('error', { type: 'multipleProducts', error });
      
      throw error;
    }
  }
  
  /**
   * 체크아웃 프로세스를 크롤링합니다.
   * @param {string} productUrl - 제품 URL
   * @returns {Promise<object>} 체크아웃 프로세스 정보
   */
  async crawlCheckoutProcess(productUrl) {
    this.logger.info(`CrawlingManager: 체크아웃 프로세스, 크롤링 시작 - ${productUrl}`);
    
    try {
      // 크롤링 통계 업데이트
      this._updateStats('start');
      this.stats.totalRequests++;
      
      // 체크아웃 자동화 사용
      const checkoutProcess = await this.checkoutAutomation.analyzeCheckoutProcess(productUrl);
      
      // 성공 통계 업데이트
      this.stats.successfulRequests++;
      this._updateStats('end');
      
      // 이벤트 발생
      this.emit('checkoutCrawled', { productUrl, checkoutProcess });
      
      return checkoutProcess;
    } catch (error) {
      // 실패 통계 업데이트
      this.stats.failedRequests++;
      this._updateStats('end');
      
      this.logger.error(`CrawlingManager: 체크아웃 프로세스, 크롤링 실패 - ${productUrl}`, error);
      
      // 이벤트 발생
      this.emit('error', { type: 'checkout', productUrl, error });
      
      throw error;
    }
  }
  
  /**
   * 체크아웃 딥링크를 생성합니다.
   * @param {object} userInfo - 사용자 정보
   * @returns {string} 체크아웃 딥링크 URL
   */
  generateCheckoutDeeplink(userInfo) {
    return this.checkoutAutomation.generateDeeplink(userInfo);
  }
  
  /**
   * 모든 카테고리를 크롤링합니다.
   * @param {Array<object>} categories - 카테고리 정보 배열
   * @param {object} options - 크롤링 옵션
   * @returns {Promise<object>} 크롤링 결과
   */
  async crawlAllCategories(categories, options = {}) {
    if (!categories || categories.length === 0) {
      throw new Error('Categories are required');
    }
    
    this.logger.info(`CrawlingManager: ${categories.length}개 카테고리 크롤링 시작`);
    
    try {
      // 크롤링 통계 업데이트
      this._updateStats('start');
      this.stats.totalRequests += categories.length;
      
      // 각 카테고리 크롤링 처리
      const results = {};
      const errors = [];
      
      // 병렬 처리 옵션이 있는 경우
      if (options.parallel) {
        // 병렬 처리를 위한 카테고리 배치 준비
        const concurrency = options.concurrency || Math.min(3, categories.length);
        const batches = this._prepareBatches(categories, concurrency);
        
        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i];
          this.logger.info(`CrawlingManager: 카테고리 배치 처리 중 ${i + 1}/${batches.length} (${batch.length} 카테고리)`);
          
          // 각 배치 병렬 처리
          const batchPromises = batch.map(category => 
            this.crawlCategory(category, options)
              .then(products => ({ category, products, success: true }))
              .catch(error => ({ category, error, success: false }))
          );
          
          // 배치 결과 처리
          const batchResults = await Promise.all(batchPromises);
          
          // 결과 처리
          for (const result of batchResults) {
            if (result.success) {
              results[result.category.name || `category_${Object.keys(results).length}`] = result.products;
            } else {
              errors.push({
                category: result.category.name || result.category.url,
                error: result.error.message
              });
            }
          }
          
          // 배치 간 지연 (서버 부하 방지)
          if (i < batches.length - 1) {
            await delay(5000);
          }
        }
      } else {
        // 순차 처리
        for (let i = 0; i < categories.length; i++) {
          const category = categories[i];
          this.logger.info(`CrawlingManager: 카테고리 크롤링 중 ${i + 1}/${categories.length}: ${category.name || category.url}`);
          
          try {
            const products = await this.crawlCategory(category, options);
            results[category.name || `category_${i}`] = products;
          } catch (error) {
            errors.push({
              category: category.name || category.url,
              error: error.message
            });
          }
          
          // 카테고리 간 지연 (서버 부하 방지)
          if (i < categories.length - 1) {
            await delay(5000);
          }
        }
      }
      
      // 성공 통계 업데이트
      this.stats.successfulRequests += Object.keys(results).length;
      this.stats.failedRequests += errors.length;
      this._updateStats('end');
      
      // 결과 저장
      this.saveAllCategoriesData(results);
      
      // 이벤트 발생
      this.emit('allCategoriesCrawled', { results, errors });
      
      return {
        results,
        errors,
        totalCategories: categories.length,
        successfulCategories: Object.keys(results).length,
        failedCategories: errors.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      // 실패 통계 업데이트
      this.stats.failedRequests += categories.length;
      this._updateStats('end');
      
      this.logger.error(`CrawlingManager: 전체 카테고리 크롤링 실패`, error);
      
      // 이벤트 발생
      this.emit('error', { type: 'allCategories', error });
      
      throw error;
    }
  }
  
  /**
   * 검색 결과를 크롤링합니다.
   * @param {string} query - 검색어
   * @param {object} options - 크롤링 옵션
   * @returns {Promise<Array>} 검색 결과 제품 목록
   */
  async crawlSearchResults(query, options = {}) {
    this.logger.info(`CrawlingManager: 검색 결과 크롤링 시작 - "${query}"`);
    
    try {
      // 크롤링 통계 업데이트
      this._updateStats('start');
      this.stats.totalRequests++;
      
      const browser = await this.browserController.launchBrowser();
      
      try {
        // 검색 실행
        await this.browserController.executeAction('searchProducts', { query });
        
        // 검색 결과 추출
        const page = await this.browserController.getCurrentPage();
        const html = await page.content();
        
        const extractionGoal = `Extract all product information from search results for query: ${query}`;
        const extractedData = await this.extractor.extractContent(html, extractionGoal);
        
        let searchResults = [];
        
        if (extractedData.products && Array.isArray(extractedData.products)) {
          searchResults = extractedData.products;
        } else {
          // LLM이 제대로 구조화하지 않은 경우, 페이지에서 직접 추출 시도
          searchResults = await page.evaluate(() => {
            const productElements = document.querySelectorAll('.product-item, .search-result-item, .product');
            
            return Array.from(productElements).map(element => {
              const titleElement = element.querySelector('.product-title, .product-name, h3, h4');
              const priceElement = element.querySelector('.product-price, .price, .value');
              const linkElement = element.querySelector('a');
              const imageElement = element.querySelector('img');
              
              return {
                title: titleElement ? titleElement.textContent.trim() : 'Unknown product',
                price: priceElement ? priceElement.textContent.trim() : null,
                url: linkElement ? linkElement.href : null,
                imageUrl: imageElement ? imageElement.src : null
              };
            }).filter(product => product.url);
          });
        }
        
        // 검색 결과 제한
        const limit = options.limit || 20;
        const limitedResults = searchResults.slice(0, limit);
        
        // 검색 결과 저장
        this.saveSearchResults(query, limitedResults);
        
        // 상세 정보 크롤링 (옵션에 따라)
        let detailedResults = limitedResults;
        
        if (options.crawlDetails) {
          detailedResults = await this.crawlMultipleProducts(
            limitedResults,
            options.category || 'default',
            options
          );
        }
        
        // 성공 통계 업데이트
        this.stats.successfulRequests++;
        this._updateStats('end');
        
        // 이벤트 발생
        this.emit('searchCrawled', { query, results: detailedResults });
        
        this.logger.info(`CrawlingManager: 검색 결과 크롤링 완료 - "${query}" (${detailedResults.length} 결과)`);
        return detailedResults;
      } finally {
        // 브라우저 닫기
        await this.browserController.executeAction('closeBrowser');
      }
    } catch (error) {
      // 실패 통계 업데이트
      this.stats.failedRequests++;
      this._updateStats('end');
      
      this.logger.error(`CrawlingManager: 검색 결과 크롤링 실패 - "${query}"`, error);
      
      // 이벤트 발생
      this.emit('error', { type: 'search', query, error });
      
      throw error;
    }
  }
  
  /**
   * 제품 가격 및 재고 정보를 업데이트합니다.
   * @param {Array<object>} products - 제품 정보 배열
   * @param {string} category - 제품 카테고리
   * @param {object} options - 업데이트 옵션
   * @returns {Promise<object>} 업데이트 결과
   */
  async updateProductsInfo(products, category = 'default', options = {}) {
    if (!products || products.length === 0) {
      return { updated: 0, unchanged: 0, errors: 0 };
    }
    
    this.logger.info(`CrawlingManager: ${products.length}개 제품 정보 업데이트 시작`);
    
    try {
      // 크롤링 통계 업데이트
      this._updateStats('start');
      this.stats.totalRequests += products.length;
      
      // 제품 크롤러 사용
      const concurrency = options.concurrency || this.maxConcurrency;
      const results = [];
      let updated = 0;
      let unchanged = 0;
      let errors = 0;
      
      // 병렬 처리를 위한 제품 배치 준비
      const batches = this._prepareBatches(products, concurrency);
      
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        this.logger.info(`CrawlingManager: 업데이트 배치 처리 중 ${i + 1}/${batches.length} (${batch.length} 제품)`);
        
        // 각 배치 병렬 처리
        const batchPromises = batch.map(product => 
          this.productCrawler.updateProductInfo(product, category)
        );
        
        // 배치 결과 처리
        const batchResults = await Promise.all(batchPromises);
        
        // 결과 통계 업데이트
        for (const result of batchResults) {
          if (result.updated) {
            updated++;
            results.push(result.product);
          } else if (result.error) {
            errors++;
          } else {
            unchanged++;
          }
        }
        
        // 배치 간 지연 (서버 부하 방지)
        if (i < batches.length - 1) {
          await delay(3000);
        }
      }
      
      // 성공 통계 업데이트
      this.stats.successfulRequests += updated + unchanged;
      this.stats.failedRequests += errors;
      this._updateStats('end');
      
      // 이벤트 발생
      this.emit('productsUpdated', { updated, unchanged, errors, products: results });
      
      this.logger.info(`CrawlingManager: 제품 업데이트 완료 - ${updated} 업데이트됨, ${unchanged} 변경없음, ${errors} 오류`);
      
      return { updated, unchanged, errors, updatedProducts: results };
    } catch (error) {
      // 실패 통계 업데이트
      this.stats.failedRequests += products.length;
      this._updateStats('end');
      
      this.logger.error(`CrawlingManager: 제품 업데이트 실패`, error);
      
      // 이벤트 발생
      this.emit('error', { type: 'update', error });
      
      throw error;
    }
  }
  
  /**
   * 카테고리 데이터를 저장합니다.
   * @param {object} category - 카테고리 정보
   * @param {Array} products - 제품 목록
   */
  saveCategoryData(category, products) {
    try {
      const categoryId = category.id || this._slugify(category.name || 'category');
      const filePath = path.join(this.dataDir, `category_${categoryId}.json`);
      
      const data = {
        category,
        products,
        timestamp: new Date().toISOString()
      };
      
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      this.logger.debug(`CrawlingManager: 카테고리 데이터 저장 완료 - ${filePath}`);
    } catch (error) {
      this.logger.error('CrawlingManager: 카테고리 데이터 저장 실패', error);
    }
  }
  
  /**
   * 제품 데이터를 저장합니다.
   * @param {object} product - 제품 정보
   */
  saveProductData(product) {
    try {
      if (!product || !product.url) return;
      
      const productId = product.id || this._slugify(product.title || 'product');
      const filePath = path.join(this.dataDir, `product_${productId}.json`);
      
      const data = {
        ...product,
        lastUpdated: new Date().toISOString()
      };
      
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      this.logger.debug(`CrawlingManager: 제품 데이터 저장 완료 - ${filePath}`);
    } catch (error) {
      this.logger.error('CrawlingManager: 제품 데이터 저장 실패', error);
    }
  }
  
  /**
   * 검색 결과를 저장합니다.
   * @param {string} query - 검색어
   * @param {Array} results - 검색 결과
   */
  saveSearchResults(query, results) {
    try {
      const searchId = this._slugify(query);
      const filePath = path.join(this.dataDir, `search_${searchId}.json`);
      
      const data = {
        query,
        results,
        timestamp: new Date().toISOString()
      };
      
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      this.logger.debug(`CrawlingManager: 검색 결과 저장 완료 - ${filePath}`);
    } catch (error) {
      this.logger.error('CrawlingManager: 검색 결과 저장 실패', error);
    }
  }
  
  /**
   * 모든 카테고리 데이터를 저장합니다.
   * @param {object} categoriesData - 카테고리별 제품 데이터
   */
  saveAllCategoriesData(categoriesData) {
    try {
      const filePath = path.join(this.dataDir, 'all_categories.json');
      
      const data = {
        categories: categoriesData,
        timestamp: new Date().toISOString()
      };
      
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      this.logger.debug(`CrawlingManager: 모든 카테고리 데이터 저장 완료 - ${filePath}`);
    } catch (error) {
      this.logger.error('CrawlingManager: 모든 카테고리 데이터 저장 실패', error);
    }
  }
  
  /**
   * 크롤링 작업을 큐에 추가합니다.
   * @param {object} task - 크롤링 작업
   * @param {string} task.type - 작업 유형 ('category', 'product', 'checkout', 'search', 'update')
   * @param {*} task.data - 작업 데이터
   * @param {object} task.options - 작업 옵션
   * @param {number} task.priority - 작업 우선순위 (낮을수록 높은 우선순위, 기본값 10)
   * @returns {string} 작업 ID
   */
  addTaskToQueue(task) {
    if (!task || !task.type) {
      throw new Error('Invalid task: type is required');
    }
    
    // 작업 ID 생성
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // 작업 추가
    const newTask = {
      id: taskId,
      type: task.type,
      data: task.data,
      options: task.options || {},
      priority: task.priority || 10,
      status: 'pending',
      added: new Date(),
      retries: 0
    };
    
    this.crawlingQueue.push(newTask);
    
    // 우선순위 기준으로 정렬
    this.crawlingQueue.sort((a, b) => a.priority - b.priority);
    
    this.logger.debug(`CrawlingManager: 작업 큐에 추가됨 - ${taskId} (${task.type})`);
    
    // 큐 처리가 실행 중이 아니면 시작
    if (!this.isProcessingQueue && !this.pauseProcessing) {
      this._startProcessingQueue();
    }
    
    return taskId;
  }
  
  /**
   * 작업 큐 처리를 시작합니다.
   * @private
   */
  _startProcessingQueue() {
    if (this.isProcessingQueue || this.pauseProcessing) return;
    
    this.isProcessingQueue = true;
    this.logger.info('CrawlingManager: 작업 큐 처리 시작');
    
    this._processNextTask();
  }
  
  /**
   * 다음 작업을 처리합니다.
   * @private
   */
  async _processNextTask() {
    // 큐 처리가 중지되었거나 모든 작업이 완료된 경우
    if (this.pauseProcessing || this.crawlingQueue.length === 0) {
      this.isProcessingQueue = false;
      this.logger.info('CrawlingManager: 작업 큐 처리 종료');
      return;
    }
    
    // 활성 작업 수 확인
    if (this.activeCrawlingTasks >= this.maxActiveTasks) {
      // 활성 작업이 최대치에 도달한 경우, 일정 시간 후 다시 확인
      setTimeout(() => this._processNextTask(), 1000);
      return;
    }
    
    // 다음 작업 가져오기
    const task = this.crawlingQueue.shift();
    
    // 작업 상태 및 활성 작업 수 업데이트
    task.status = 'processing';
    task.started = new Date();
    this.activeCrawlingTasks++;
    
    this.logger.info(`CrawlingManager: 작업 처리 중 - ${task.id} (${task.type})`);
    
    try {
      // 작업 유형에 따른 처리
      let result;
      
      switch (task.type) {
        case 'category':
          result = await this.crawlCategory(task.data, task.options);
          break;
        case 'product':
          result = await this.crawlProductDetails(task.data, task.options?.category || 'default', task.options);
          break;
        case 'checkout':
          result = await this.crawlCheckoutProcess(task.data);
          break;
        case 'search':
          result = await this.crawlSearchResults(task.data, task.options);
          break;
        case 'update':
          result = await this.updateProductsInfo(task.data, task.options?.category || 'default', task.options);
          break;
        case 'allCategories':
          result = await this.crawlAllCategories(task.data, task.options);
          break;
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }
      
      // 작업 완료 처리
      task.status = 'completed';
      task.completed = new Date();
      task.result = result;
      
      this.logger.info(`CrawlingManager: 작업 완료 - ${task.id} (${task.type})`);
      
      // 작업 완료 이벤트 발생
      this.emit('taskCompleted', { task });
    } catch (error) {
      // 오류 발생 시 재시도 여부 결정
      let shouldRetry = task.retries < (task.options.maxRetries || this.maxRetries);
      let retryDelay = 5000; // 기본 재시도 지연 시간
      
      // 오류 처리기 사용 (있는 경우)
      if (this.errorHandler) {
        const errorContext = {
          task,
          url: this._getTaskUrl(task),
          browserInfo: this.browserController.getBrowserInfo?.() || null
        };
        
        try {
          const errorResult = await this.errorHandler.handleError(error, errorContext, task.retries);
          
          // 오류 처리 결과에 따른 조치
          if (errorResult.action === 'retry') {
            shouldRetry = true;
            retryDelay = errorResult.delay || retryDelay;
            
            // 작업 옵션 수정 (필요한 경우)
            if (errorResult.modifyOptions) {
              task.options = { ...task.options, ...errorResult.modifyOptions };
            }
          } else if (errorResult.action === 'skip') {
            shouldRetry = false;
          } else if (errorResult.action === 'abort') {
            shouldRetry = false;
          }
        } catch (handlerError) {
          this.logger.error(`CrawlingManager: 오류 처리기 실패 - ${task.id}`, handlerError);
        }
      }
      
      if (shouldRetry) {
        // 작업 재시도
        task.status = 'pending';
        task.retries++;
        task.lastError = error.message;
        this.stats.retries++;
        
        // 우선순위 약간 낮추기 (다른 작업들에게 기회 제공)
        task.priority += 1;
        
        this.logger.warn(`CrawlingManager: 작업 재시도 예정 - ${task.id} (${task.retries}번째 시도) ${retryDelay}ms 후`);
        
        // 지연 후 큐에 다시 추가
        setTimeout(() => {
          this.crawlingQueue.push(task);
          this.crawlingQueue.sort((a, b) => a.priority - b.priority);
          this.logger.debug(`CrawlingManager: 작업 큐에 재추가 - ${task.id}`);
        }, retryDelay);
      } else {
        // 최대 재시도 횟수 초과 또는 건너뛰기로 결정
        task.status = 'failed';
        task.completed = new Date();
        task.error = error.message;
        
        this.logger.error(`CrawlingManager: 작업 실패 - ${task.id} (${task.type})`, error);
        
        // 작업 실패 이벤트 발생
        this.emit('taskFailed', { task, error });
      }
    } finally {
      // 활성 작업 수 감소
      this.activeCrawlingTasks--;
      
      // 다음 작업 처리
      setImmediate(() => this._processNextTask());
    }
  }
  
  /**
   * 작업의 URL을 가져옵니다.
   * @param {object} task - 작업
   * @returns {string|null} 작업 URL
   * @private
   */
  _getTaskUrl(task) {
    if (!task) return null;
    
    switch (task.type) {
      case 'category':
        return task.data.url;
      case 'product':
        return typeof task.data === 'string' ? task.data : task.data.url;
      case 'checkout':
        return task.data;
      case 'search':
        return null; // 검색 작업은 URL이 없음
      case 'update':
        return Array.isArray(task.data) && task.data.length > 0 ? 
          (typeof task.data[0] === 'string' ? task.data[0] : task.data[0].url) : null;
      default:
        return null;
    }
  }
  
  /**
   * 작업 큐 처리를 일시 중지합니다.
   */
  pauseQueue() {
    this.pauseProcessing = true;
    this.logger.info('CrawlingManager: 작업 큐 처리 일시 중지');
    
    // 이벤트 발생
    this.emit('queuePaused');
  }
  
  /**
   * 작업 큐 처리를 재개합니다.
   */
  resumeQueue() {
    this.pauseProcessing = false;
    this.logger.info('CrawlingManager: 작업 큐 처리 재개');
    
    // 큐 처리 다시 시작
    if (!this.isProcessingQueue && this.crawlingQueue.length > 0) {
      this._startProcessingQueue();
    }
    
    // 이벤트 발생
    this.emit('queueResumed');
  }
  
  /**
   * 작업 큐를 비웁니다.
   */
  clearQueue() {
    const queueLength = this.crawlingQueue.length;
    this.crawlingQueue = [];
    this.logger.info(`CrawlingManager: 작업 큐 비움 (${queueLength}개 작업 제거)`);
    
    // 이벤트 발생
    this.emit('queueCleared', { count: queueLength });
  }
  
  /**
   * 크롤링 통계를 가져옵니다.
   * @returns {object} 크롤링 통계
   */
  getStats() {
    // 현재 통계에 추가 정보 포함
    return {
      ...this.stats,
      queueLength: this.crawlingQueue.length,
      activeTasks: this.activeCrawlingTasks,
      status: this.isProcessingQueue ? (this.pauseProcessing ? 'paused' : 'processing') : 'idle',
      elapsedTime: this.stats.startTime ? 
        (this.stats.endTime || new Date()) - this.stats.startTime : 0
    };
  }
  
  /**
   * 통계를 업데이트합니다.
   * @param {string} action - 업데이트 작업 ('start' 또는 'end')
   * @private
   */
  _updateStats(action) {
    if (action === 'start' && !this.stats.startTime) {
      this.stats.startTime = new Date();
    } else if (action === 'end') {
      this.stats.endTime = new Date();
    }
  }
  
  /**
   * 배치 처리를 위해 아이템을 분할합니다.
   * @param {Array} items - 분할할 아이템 배열
   * @param {number} batchSize - 배치 크기
   * @returns {Array<Array>} 배치 배열
   * @private
   */
  _prepareBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }
  
  /**
   * 문자열을 URL 친화적인 슬러그로 변환합니다.
   * @param {string} str - 변환할 문자열
   * @returns {string} 슬러그
   * @private
   */
  _slugify(str) {
    return str
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50); // 최대 50자로 제한
  }
}

module.exports = CrawlingManager;