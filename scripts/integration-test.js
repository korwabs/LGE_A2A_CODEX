/**
 * 모듈 통합 테스트 스크립트
 * 
 * 이 스크립트는 LG 브라질 A2A 쇼핑 어시스턴트의 모든 모듈을 통합하고
 * 전체 시스템이 정상적으로 작동하는지 테스트합니다.
 */

// NOTE: 경로가 잘못되어 통합 테스트가 실패하던 문제를 수정했습니다.
const BrowserController = require('../scripts/controllers/browser-controller');
const IntelligentExtractor = require('../scripts/extractors/intelligent-extractor');
const CrawlingManager = require('../scripts/crawlers/crawling-manager');
const CheckoutAutomation = require('../scripts/checkout/checkout-automation');
const A2ARouter = require('../src/protocols/a2a-router');
const DialogAgent = require('../src/agents/dialog/dialog-agent');
const ProductRecommendationAgent = require('../src/agents/product-recommendation/product-recommendation-agent');
const CartAgent = require('../src/agents/cart/cart-agent');
const PurchaseProcessAgent = require('../src/agents/purchase-process/purchase-process-agent');

// 간단한 목 세션 서비스 구현
class InMemorySessionService {
  constructor() {
    this.sessions = new Map();
  }

  async createSession(id = `sess_${Date.now()}`) {
    this.sessions.set(id, { cart: { items: [], totalItems: 0, totalPrice: 0 } });
    return id;
  }

  async getSession(id) {
    return this.sessions.get(id) || null;
  }

  async addConversationMessage(id, role, message) {
    let s = this.sessions.get(id);
    if (!s) {
      s = { cart: { items: [], totalItems: 0, totalPrice: 0 }, history: [] };
      this.sessions.set(id, s);
    }
    s.history = s.history || [];
    s.history.push({ role, message });
    return true;
  }

  async getConversationHistory(id, limit = 10) {
    const s = this.sessions.get(id);
    if (!s || !s.history) return [];
    return s.history.slice(-limit);
  }

  async getCart(id) {
    const s = this.sessions.get(id) || { cart: { items: [], totalItems: 0, totalPrice: 0 } };
    return s.cart;
  }

  async addToCart(id, product, quantity = 1) {
    let s = this.sessions.get(id);
    if (!s) {
      s = { cart: { items: [], totalItems: 0, totalPrice: 0 } };
      this.sessions.set(id, s);
    }
    const existing = s.cart.items.find(i => i.product.id === product.id);
    if (existing) existing.quantity += quantity; else s.cart.items.push({ product, quantity });
    s.cart.totalItems = s.cart.items.reduce((t, i) => t + i.quantity, 0);
    return s.cart;
  }
}

// 간단한 목 프롬프트 매니저 구현
class MockPromptManager {
  async analyzeIntent() {
    return { type: 'generalQuery' };
  }

  async generateGeminiResponse() {
    return 'ok';
  }
}
const Logger = require('./utils/logger');
const config = require('./config/default-config');
// 통합 테스트 기본 설정
const DEFAULT_TEST_CONFIG = {
  logLevel: "info",
  browserOptions: {},
  extractorOptions: {},
  checkoutOptions: {},
  crawlingManagerOptions: {},
  dialogAgentOptions: {},
  productRecommendationAgentOptions: {},
  cartAgentOptions: {},
  purchaseProcessAgentOptions: {}
};

config.test = { ...DEFAULT_TEST_CONFIG, ...(config.test || {}) };

const fs = require('fs');
const path = require('path');

// 로그 출력 경로
const LOG_FILE_PATH = path.join(__dirname, '../logs/integration-test.log');

// 결과 저장 경로
const RESULTS_PATH = path.join(__dirname, '../logs/integration-test-results.json');

// 테스트 URL
const TEST_URLS = {
  category: 'https://www.lge.com/br/refrigeradores',
  product: 'https://www.lge.com/br/refrigeradores/lg-gc-b257jvda'
};

// 테스트 사용자 정보
const TEST_USER_INFO = {
  name: 'Test User',
  email: 'testuser@example.com',
  phone: '11-98765-4321',
  address: {
    street: 'Avenida Paulista',
    number: '1000',
    apartment: '502',
    city: 'São Paulo',
    state: 'SP',
    zipCode: '01310-100'
  },
  paymentMethod: 'creditCard'
};

// 로거 설정
function setupLogger() {
  // 로그 디렉토리 확인 및 생성
  const logDir = path.dirname(LOG_FILE_PATH);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  // 로그 레벨 설정
  Logger.setLevel(config.test.logLevel || 'info');
  
  // 파일 로거 추가
  Logger.addFileTransport(LOG_FILE_PATH);
  
  return Logger;
}

// 테스트 결과 저장
function saveTestResults(results) {
  // 결과 디렉토리 확인 및 생성
  const resultsDir = path.dirname(RESULTS_PATH);
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  // 결과 저장
  fs.writeFileSync(
    RESULTS_PATH,
    JSON.stringify(results, null, 2),
    'utf8'
  );
  
  console.log(`통합 테스트 결과가 저장되었습니다: ${RESULTS_PATH}`);
}

// 메인 테스트 함수
async function runIntegrationTest() {
  // 테스트 시작 시간
  const startTime = Date.now();
  
  // 로거 설정
  const logger = setupLogger();
  logger.info('======== 통합 테스트 시작 ========');
  
  // 테스트 결과
  const results = {
    startTime: new Date().toISOString(),
    tests: [],
    endTime: null,
    totalDuration: null,
    allPassed: false
  };
  
  try {
    // 1. 브라우저 컨트롤러 생성
    logger.info('1. 브라우저 컨트롤러 초기화 중...');
    const browserController = new BrowserController({
      headless: true,
      ...config.test.browserOptions
    });
    
    results.tests.push({
      name: 'Browser Controller Initialization',
      passed: true,
      duration: Date.now() - startTime
    });
    
    // 2. 지능형 추출기 생성
    logger.info('2. 지능형 추출기 초기화 중...');
    const intelligentExtractor = new IntelligentExtractor({
      chunkSize: 3000,
      llmProvider: 'gemini',
      maxParallelChunks: 4,
      ...config.test.extractorOptions
    });
    
    results.tests.push({
      name: 'Intelligent Extractor Initialization',
      passed: true,
      duration: Date.now() - startTime
    });
    
    // 3. 체크아웃 자동화 생성
    logger.info('3. 체크아웃 자동화 초기화 중...');
    const checkoutAutomation = new CheckoutAutomation({
      browserController,
      dataDir: path.join(__dirname, '../data'),
      ...config.test.checkoutOptions
    });
    
    results.tests.push({
      name: 'Checkout Automation Initialization',
      passed: true,
      duration: Date.now() - startTime
    });
    
    // 4. 크롤링 관리자 생성
    logger.info('4. 크롤링 관리자 초기화 중...');
    const crawlingManager = new CrawlingManager({
      browserController,
      extractor: intelligentExtractor,
      checkoutAutomation,
      maxRetries: 2,
      maxConcurrency: 3,
      ...config.test.crawlingManagerOptions
    });
    
    results.tests.push({
      name: 'Crawling Manager Initialization',
      passed: true,
      duration: Date.now() - startTime
    });
    
    // 5. A2A 라우터 생성
    logger.info('5. A2A 라우터 초기화 중...');
    const a2aRouter = new A2ARouter();
    
    results.tests.push({
      name: 'A2A Router Initialization',
      passed: true,
      duration: Date.now() - startTime
    });
    
    // 6. 에이전트 생성
    logger.info('6. 에이전트 초기화 중...');
    
    // 6.1. 필요한 목 서비스 초기화
    const sessionService = new InMemorySessionService();
    const promptManager = new MockPromptManager();

    // 6.2. 대화 에이전트
    const dialogAgent = new DialogAgent(
      a2aRouter,
      promptManager,
      sessionService
    );

    // 6.3. 제품 추천 에이전트 (간단한 목 검색 서비스 사용)
    const searchService = {
      async search() {
        return [{ id: 'prod1', name: 'LG Product', price: '1000', url: TEST_URLS.product }];
      },
      async getProductById() {
        return { id: 'prod1', name: 'LG Product', price: '1000', url: TEST_URLS.product };
      }
    };
    const productRecommendationAgent = new ProductRecommendationAgent(
      a2aRouter,
      searchService,
      sessionService
    );

    // 6.4. 장바구니 에이전트 (레거시 모드)
    const cartAgent = new CartAgent(a2aRouter, sessionService);
    cartAgent.addToCart = (params) =>
      cartAgent.messageHandlers.get('addToCart')({
        payload: params,
        fromAgent: 'test',
        toAgent: 'cartAgent',
        messageType: 'request',
        intent: 'addToCart',
        messageId: `msg_${Date.now()}`,
        timestamp: new Date().toISOString()
      });
    cartAgent.getCart = (params) =>
      cartAgent.messageHandlers.get('getCart')({
        payload: params,
        fromAgent: 'test',
        toAgent: 'cartAgent',
        messageType: 'request',
        intent: 'getCart',
        messageId: `msg_${Date.now()}`,
        timestamp: new Date().toISOString()
      });

    // 6.5. 구매 프로세스 에이전트 (레거시 모드)
    const contextManager = {
      storeContext() {},
      get() { return {}; },
      updateContext() {}
    };
    const purchaseProcessAgent = new PurchaseProcessAgent(a2aRouter, contextManager, {});
    
    results.tests.push({
      name: 'Agents Initialization',
      passed: true,
      duration: Date.now() - startTime
    });
    
    // 7. 통합 테스트 시나리오 실행
    logger.info('7. 통합 테스트 시나리오 실행 중...');
    
    // 7.1. 제품 검색 및 추천 시나리오
    logger.info('7.1. 제품 검색 및 추천 시나리오 실행 중...');
    const searchStartTime = Date.now();
    
    try {
      const searchSession = await sessionService.createSession('user-search');
      const searchQuery = '냉장고 추천해주세요';

      const searchResponse = await dialogAgent.processUserMessage(
        searchSession,
        searchQuery
      );

      if (!searchResponse || !searchResponse.response) {
        throw new Error('검색 응답이 유효하지 않습니다.');
      }

      logger.info(`검색 응답: ${searchResponse.response.substring(0, 100)}...`);
      
      results.tests.push({
        name: 'Product Search Scenario',
        passed: true,
        duration: Date.now() - searchStartTime
      });
    } catch (error) {
      logger.error('제품 검색 시나리오 실패:', error);
      
      results.tests.push({
        name: 'Product Search Scenario',
        passed: false,
        error: error.message,
        duration: Date.now() - searchStartTime
      });
    }
    
    // 7.2. 장바구니 시나리오
    logger.info('7.2. 장바구니 시나리오 실행 중...');
    const cartStartTime = Date.now();
    
    try {
      const cartSession = await sessionService.createSession('user-cart');

      await cartAgent.addToCart({
        userId: cartSession,
        product: {
          id: 'test-product-id',
          name: 'Refrigerador LG Test',
          price: 'R$ 4.799,00',
          url: TEST_URLS.product
        }
      });

      const cartResponse = await cartAgent.getCart({
        userId: cartSession
      });
      
      // 응답 검증
      if (!cartResponse || !cartResponse.items || cartResponse.items.length === 0) {
        throw new Error('장바구니가 비어 있습니다.');
      }
      
      logger.info(`장바구니 아이템 수: ${cartResponse.items.length}`);
      
      results.tests.push({
        name: 'Shopping Cart Scenario',
        passed: true,
        duration: Date.now() - cartStartTime
      });
    } catch (error) {
      logger.error('장바구니 시나리오 실패:', error);
      
      results.tests.push({
        name: 'Shopping Cart Scenario',
        passed: false,
        error: error.message,
        duration: Date.now() - cartStartTime
      });
    }
    
    // 7.3. 체크아웃 시나리오
    logger.info('7.3. 체크아웃 시나리오 실행 중...');
    const checkoutStartTime = Date.now();
    
    try {
      const checkoutSessionId = checkoutAutomation.createCheckoutSession('user-checkout', 'test-product-id');
      checkoutAutomation.updateSessionInfo(checkoutSessionId, TEST_USER_INFO);

      const deeplinkResult = checkoutAutomation.generateDeeplink('test-product-id', TEST_USER_INFO);
      const deeplink = { url: deeplinkResult };
      
      // 응답 검증
      if (!deeplink || !deeplink.url || !deeplink.url.startsWith('http')) {
        throw new Error('유효한 딥링크가 생성되지 않았습니다.');
      }
      
      logger.info(`생성된 딥링크: ${deeplink.url}`);
      
      results.tests.push({
        name: 'Checkout Scenario',
        passed: true,
        duration: Date.now() - checkoutStartTime
      });
    } catch (error) {
      logger.error('체크아웃 시나리오 실패:', error);
      
      results.tests.push({
        name: 'Checkout Scenario',
        passed: false,
        error: error.message,
        duration: Date.now() - checkoutStartTime
      });
    }
    
    // 7.4. 전체 통합 흐름 테스트
    logger.info('7.4. 전체 통합 흐름 테스트 실행 중...');
    const fullFlowStartTime = Date.now();
    
    try {
      // 1) 카테고리 검색
      const flowSession = await sessionService.createSession('user-flow');
      const categorySearch = await dialogAgent.processUserMessage(
        flowSession,
        '냉장고 종류를 보여주세요'
      );
      
      // 2) 제품 상세 조회
      const productDetailSearch = await dialogAgent.processUserMessage(
        flowSession,
        'GC-B257JVDA 모델에 대해 알려주세요'
      );
      
      // 3) 장바구니에 추가
      const addToCartMessage = await dialogAgent.processUserMessage(
        flowSession,
        '이 제품을 장바구니에 추가해주세요'
      );
      
      // 4) 구매 의사 표현
      const purchaseInitMessage = await dialogAgent.processUserMessage(
        flowSession,
        '이제 구매하고 싶어요'
      );
      
      // 5) 배송지 정보 제공
      const addressMessage = await dialogAgent.processUserMessage(
        flowSession,
        '배송지는 상파울루 아베니다 파울리스타 1000번지 아파트 502호, 우편번호 01310-100입니다'
      );
      
      // 6) 연락처 정보 제공
      const contactMessage = await dialogAgent.processUserMessage(
        flowSession,
        '연락처는 11-98765-4321입니다'
      );
      
      // 7) 결제 방법 선택
      const paymentMessage = await dialogAgent.processUserMessage(
        flowSession,
        '신용카드로 결제할게요'
      );
      
      // 응답 검증
      if (!paymentMessage || !paymentMessage.response) {
        throw new Error('전체 흐름 응답이 유효하지 않습니다.');
      }
      
      results.tests.push({
        name: 'Full Integration Flow',
        passed: true,
        duration: Date.now() - fullFlowStartTime
      });
    } catch (error) {
      logger.error('전체 통합 흐름 테스트 실패:', error);
      
      results.tests.push({
        name: 'Full Integration Flow',
        passed: false,
        error: error.message,
        duration: Date.now() - fullFlowStartTime
      });
    }
    
    // 테스트 종료 시간 기록
    const endTime = Date.now();
    const totalDuration = endTime - startTime;
    
    // 모든 테스트 통과 여부 확인
    const allPassed = results.tests.every(test => test.passed);
    
    // 최종 결과 기록
    results.endTime = new Date().toISOString();
    results.totalDuration = totalDuration;
    results.allPassed = allPassed;
    
    // 결과 저장
    saveTestResults(results);
    
    // 결과 요약 출력
    logger.info('\n======== 통합 테스트 결과 요약 ========');
    logger.info(`총 테스트 수: ${results.tests.length}`);
    logger.info(`통과한 테스트 수: ${results.tests.filter(t => t.passed).length}`);
    logger.info(`실패한 테스트 수: ${results.tests.filter(t => !t.passed).length}`);
    logger.info(`총 테스트 실행 시간: ${totalDuration}ms`);
    logger.info(`전체 테스트 통과 여부: ${allPassed ? '성공' : '실패'}`);
    
    // 실패한 테스트 목록 출력
    const failedTests = results.tests.filter(t => !t.passed);
    if (failedTests.length > 0) {
      logger.info('\n실패한 테스트:');
      failedTests.forEach(test => {
        logger.info(`- ${test.name}: ${test.error}`);
      });
    }
    
    logger.info('======== 통합 테스트 종료 ========');
    
  } catch (error) {
    logger.error('통합 테스트 실행 중 예상치 못한 오류 발생:', error);
    
    // 오류와 함께 결과 저장
    results.error = error.message;
    results.endTime = new Date().toISOString();
    results.totalDuration = Date.now() - startTime;
    results.allPassed = false;
    
    saveTestResults(results);
  }
  
  return results;
}

// 테스트 실행
if (require.main === module) {
  runIntegrationTest().catch(error => {
    console.error('통합 테스트 실행 중 오류 발생:', error);
    process.exit(1);
  });
}

module.exports = {
  runIntegrationTest
};
