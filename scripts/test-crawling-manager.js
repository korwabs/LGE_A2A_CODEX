/**
 * 크롤링 관리자 테스트 스크립트
 */
const CrawlingManager = require('./crawlers/crawling-manager');
const logger = require('./utils/logger');
const path = require('path');

// 명령행 인수 처리
const args = process.argv.slice(2);
const testType = args[0] || 'queue'; // 기본 테스트 유형: 'queue'
const testParam = args[1]; // 테스트 매개변수 (URL, 카테고리명 등)

// 크롤링 관리자 인스턴스 생성
const crawlingManager = new CrawlingManager({
  dataDir: path.join(__dirname, '../data/test'),
  logDir: path.join(__dirname, '../logs'),
  maxRetries: 2,
  maxConcurrency: 3,
  browserOptions: {
    headless: true, // 테스트 시 브라우저 표시
    timeout: 30000
  }
});

// 이벤트 리스너 설정
crawlingManager.on('categoryCrawled', ({ category, products }) => {
  logger.info(`이벤트: 카테고리 크롤링 완료 - ${category.name || category.url}, ${products.length}개 제품 발견`);
});

crawlingManager.on('productCrawled', ({ product }) => {
  logger.info(`이벤트: 제품 크롤링 완료 - ${product.title || product.url}`);
});

crawlingManager.on('error', ({ type, error }) => {
  logger.error(`이벤트: 오류 발생 - ${type}, ${error.message || error}`);
});

crawlingManager.on('taskCompleted', ({ task }) => {
  logger.info(`이벤트: 작업 완료 - ${task.id} (${task.type})`);
});

crawlingManager.on('taskFailed', ({ task, error }) => {
  logger.error(`이벤트: 작업 실패 - ${task.id} (${task.type}), ${error.message || error}`);
});

// 테스트 함수
async function runTest() {
  try {
    switch (testType) {
      case 'category':
        await testCategoryStandalone();
        break;
      case 'product':
        await testProductStandalone();
        break;
      case 'multiple':
        await testMultipleProducts();
        break;
      case 'categories':
        await testAllCategories();
        break;
      case 'search':
        await testSearch();
        break;
      case 'checkout':
        await testCheckout();
        break;
      case 'update':
        await testUpdate();
        break;
      case 'queue':
      default:
        await testQueue();
        break;
    }
    
    logger.info('테스트 완료');
    
    // 크롤링 통계 출력
    const stats = crawlingManager.getStats();
    logger.info('크롤링 통계:', stats);
  } catch (error) {
    logger.error('테스트 실패:', error);
  }
}

// 개별 카테고리 크롤링 테스트
async function testCategoryStandalone() {
  const categoryUrl = testParam || 'https://www.lge.com/br/tvs';
  
  logger.info(`카테고리 크롤링 테스트 시작 - ${categoryUrl}`);
  
  const category = {
    name: 'TV',
    url: categoryUrl,
    type: 'tv' // 카테고리 타입 (셀렉터 선택에 사용)
  };
  
  const products = await crawlingManager.crawlCategory(category, {
    limit: 5,
    crawlDetails: false // 제품 상세 정보 크롤링 비활성화 (테스트 속도 향상)
  });
  
  logger.info(`카테고리 크롤링 결과: ${products.length}개 제품 발견`);
  
  if (products.length > 0) {
    logger.info('첫 번째 제품:', products[0]);
  }
}

// 개별 제품 크롤링 테스트
async function testProductStandalone() {
  const productUrl = testParam || 'https://www.lge.com/br/tvs/lg-OLED65C1PSA';
  
  logger.info(`제품 크롤링 테스트 시작 - ${productUrl}`);
  
  const product = await crawlingManager.crawlProductDetails(productUrl, 'tv', {
    includeReviews: true,
    includeRelatedProducts: true
  });
  
  logger.info('제품 크롤링 결과:', product);
}

// 다중 제품 병렬 크롤링 테스트
async function testMultipleProducts() {
  // 테스트용 제품 URL 배열
  const productUrls = [
    'https://www.lge.com/br/tvs/lg-OLED65C1PSA',
    'https://www.lge.com/br/tvs/lg-65NANO80SPA',
    'https://www.lge.com/br/tvs/lg-43UP7500PSF'
  ];
  
  logger.info(`다중 제품 크롤링 테스트 시작 - ${productUrls.length}개 제품`);
  
  const products = await crawlingManager.crawlMultipleProducts(productUrls, 'tv', {
    concurrency: 2,
    includeReviews: false
  });
  
  logger.info(`다중 제품 크롤링 결과: ${products.length}개 제품 크롤링 완료`);
  
  products.forEach((product, index) => {
    logger.info(`제품 ${index + 1}:`, product.title || product.url);
  });
}

// 전체 카테고리 크롤링 테스트
async function testAllCategories() {
  // 테스트용 카테고리 배열
  const categories = [
    { name: 'TV', url: 'https://www.lge.com/br/tvs', type: 'tv' },
    { name: 'Refrigerators', url: 'https://www.lge.com/br/refrigerators', type: 'refrigerator' },
    { name: 'Monitors', url: 'https://www.lge.com/br/monitors', type: 'monitor' }
  ];
  
  logger.info(`전체 카테고리 크롤링 테스트 시작 - ${categories.length}개 카테고리`);
  
  const result = await crawlingManager.crawlAllCategories(categories, {
    parallel: true, // 병렬 처리 활성화
    concurrency: 2, // 최대 2개 카테고리 동시 처리
    limit: 3, // 카테고리당 최대 3개 제품
    crawlDetails: false // 제품 상세 정보 크롤링 비활성화 (테스트 속도 향상)
  });
  
  logger.info('전체 카테고리 크롤링 결과:', {
    totalCategories: result.totalCategories,
    successfulCategories: result.successfulCategories,
    failedCategories: result.failedCategories
  });
  
  // 각 카테고리별 제품 수 출력
  Object.entries(result.results).forEach(([category, products]) => {
    logger.info(`${category}: ${products.length}개 제품`);
  });
}

// 검색 결과 크롤링 테스트
async function testSearch() {
  const searchQuery = testParam || 'smart tv 4k';
  
  logger.info(`검색 결과 크롤링 테스트 시작 - "${searchQuery}"`);
  
  const searchResults = await crawlingManager.crawlSearchResults(searchQuery, {
    limit: 5,
    crawlDetails: false // 제품 상세 정보 크롤링 비활성화 (테스트 속도 향상)
  });
  
  logger.info(`검색 결과 크롤링 결과: ${searchResults.length}개 제품 발견`);
  
  if (searchResults.length > 0) {
    logger.info('첫 번째 검색 결과:', searchResults[0]);
  }
}

// 체크아웃 프로세스 크롤링 테스트
async function testCheckout() {
  const productUrl = testParam || 'https://www.lge.com/br/tvs/lg-OLED65C1PSA';
  
  logger.info(`체크아웃 프로세스 크롤링 테스트 시작 - ${productUrl}`);
  
  const checkoutProcess = await crawlingManager.crawlCheckoutProcess(productUrl);
  
  logger.info('체크아웃 프로세스 크롤링 결과:', checkoutProcess);
  
  // 테스트용 사용자 정보
  const userInfo = {
    name: 'Test User',
    email: 'test@example.com',
    address: 'Av. Paulista, 1000',
    city: 'São Paulo',
    postalCode: '01310-100',
    phone: '11-98765-4321'
  };
  
  // 딥링크 생성 테스트
  const deeplink = crawlingManager.generateCheckoutDeeplink(userInfo);
  logger.info('생성된 체크아웃 딥링크:', deeplink);
}

// 제품 정보 업데이트 테스트
async function testUpdate() {
  // 먼저 카테고리에서 제품 정보 가져오기
  const categoryUrl = 'https://www.lge.com/br/tvs';
  
  logger.info('업데이트를 위한 제품 정보 가져오기...');
  
  const category = {
    name: 'TV',
    url: categoryUrl,
    type: 'tv'
  };
  
  const products = await crawlingManager.crawlCategory(category, {
    limit: 3,
    crawlDetails: false
  });
  
  if (products.length === 0) {
    logger.error('업데이트할 제품이 없습니다');
    return;
  }
  
  logger.info(`제품 정보 업데이트 테스트 시작 - ${products.length}개 제품`);
  
  const updateResult = await crawlingManager.updateProductsInfo(products, 'tv', {
    concurrency: 2
  });
  
  logger.info('제품 정보 업데이트 결과:', updateResult);
}

// 작업 큐 테스트
async function testQueue() {
  logger.info('작업 큐 테스트 시작');
  
  // 여러 작업 추가
  const tasks = [
    // 카테고리 크롤링 작업
    {
      type: 'category',
      data: { name: 'TV', url: 'https://www.lge.com/br/tvs', type: 'tv' },
      options: { limit: 3, crawlDetails: false },
      priority: 5 // 높은 우선순위
    },
    // 제품 크롤링 작업
    {
      type: 'product',
      data: 'https://www.lge.com/br/tvs/lg-OLED65C1PSA',
      options: { category: 'tv' },
      priority: 10
    },
    // 검색 작업
    {
      type: 'search',
      data: 'smart tv 4k',
      options: { limit: 3 },
      priority: 15
    }
  ];
  
  // 작업 큐에 추가
  const taskIds = tasks.map(task => crawlingManager.addTaskToQueue(task));
  
  logger.info(`${taskIds.length}개 작업이 큐에 추가됨:`, taskIds);
  
  // 모든 작업이 완료될 때까지 대기
  await new Promise(resolve => {
    const checkQueue = () => {
      const stats = crawlingManager.getStats();
      if (stats.queueLength === 0 && stats.activeTasks === 0) {
        resolve();
      } else {
        // 10초마다 상태 출력
        logger.info('큐 상태:', {
          queueLength: stats.queueLength,
          activeTasks: stats.activeTasks,
          completed: stats.successfulRequests
        });
        setTimeout(checkQueue, 10000);
      }
    };
    
    // 처음 상태 확인은 5초 후
    setTimeout(checkQueue, 5000);
  });
  
  logger.info('모든 작업이 완료됨');
}

// 테스트 실행
runTest().catch(error => {
  logger.error('테스트 실행 오류:', error);
  process.exit(1);
}).finally(() => {
  // 테스트 완료 후 종료 (필요한 경우)
  // process.exit(0);
});