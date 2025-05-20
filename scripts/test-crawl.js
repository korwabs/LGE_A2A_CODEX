/**
 * 테스트 크롤링 스크립트 - 크롤링 기능 테스트를 위한 스크립트
 */
const CrawlingManager = require('./crawlers/crawling-manager');
const BrowserController = require('./controllers/browser-controller');
const IntelligentExtractor = require('./extractors/intelligent-extractor');
const CheckoutAutomation = require('./checkout/checkout-automation');
const config = require('./config/default-config');
const path = require('path');
const fs = require('fs');

// 데이터 디렉토리 확인 및 생성
const dataDir = path.resolve(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 로그 디렉토리 확인 및 생성
const logsDir = path.resolve(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// 디버그 모드 확인
const isDebug = process.argv.includes('--debug');
const testMode = process.argv.includes('--test');

// 테스트 제품 URL (LG 브라질 사이트)
const TEST_PRODUCT_URL = 'https://www.lge.com/br/tvs/lg-oled65c1';
const TEST_CATEGORY_URL = 'https://www.lge.com/br/tvs';
const TEST_SEARCH_QUERY = 'geladeira';

/**
 * 크롤링 관리자 테스트를 수행합니다.
 */
async function testCrawlingManager() {
  console.log('=== 크롤링 관리자 테스트 시작 ===');
  
  // 크롤링 관리자 인스턴스 생성
  const crawlingManager = new CrawlingManager({
    browserOptions: {
      headless: !isDebug,
      slowMo: isDebug ? 100 : 50
    },
    extractorOptions: {
      chunkSize: 4000,
      maxParallelChunks: 2
    },
    checkoutOptions: {
      dataDir
    },
    maxRetries: 2,
    maxConcurrency: 2,
    dataDir
  });
  
  try {
    // 테스트 모드인 경우 간단한 페이지 방문만 수행
    if (testMode) {
      console.log('테스트 모드: 기본 브라우저 동작 확인');
      const browserController = new BrowserController({
        headless: !isDebug,
        slowMo: isDebug ? 100 : 50
      });
      
      await browserController.launchBrowser();
      console.log('브라우저가 성공적으로 시작되었습니다.');
      
      await browserController.executeAction('goToUrl', { url: 'https://www.lge.com/br' });
      console.log('LG 브라질 웹사이트에 성공적으로 접속했습니다.');
      
      const page = await browserController.getCurrentPage();
      const title = await page.title();
      console.log(`페이지 제목: ${title}`);
      
      await browserController.executeAction('closeBrowser');
      console.log('브라우저가 성공적으로 종료되었습니다.');
      
      console.log('테스트가 성공적으로 완료되었습니다.');
      return;
    }
    
    console.log('1. 단일 제품 페이지 크롤링 테스트');
    const productResult = await crawlingManager.crawlSingleProductDetails({ url: TEST_PRODUCT_URL });
    console.log('제품 크롤링 결과:', productResult.title || '제목 없음');
    
    console.log('\n2. 카테고리 페이지 크롤링 테스트 (제한된 제품 수)');
    const categoryResult = await crawlingManager.crawlCategory(
      { url: TEST_CATEGORY_URL, name: '테스트 카테고리' },
      { limit: 3, crawlDetails: false }
    );
    console.log(`카테고리 크롤링 결과: ${categoryResult.length}개 제품 발견`);
    
    console.log('\n3. 검색 결과 크롤링 테스트');
    const searchResult = await crawlingManager.crawlSearchResults(
      TEST_SEARCH_QUERY,
      { limit: 3, crawlDetails: false }
    );
    console.log(`검색 결과 크롤링 결과: ${searchResult.length}개 제품 발견`);
    
    if (!isDebug) {
      console.log('\n4. 체크아웃 프로세스 분석 테스트 (건너뜀 - 디버그 모드가 아님)');
    } else {
      console.log('\n4. 체크아웃 프로세스 분석 테스트');
      const checkoutResult = await crawlingManager.crawlCheckoutProcess(TEST_PRODUCT_URL);
      console.log('체크아웃 프로세스 분석 결과:', checkoutResult ? '성공' : '실패');
      
      const userInfo = config.checkout.testUserInfo;
      const deeplink = crawlingManager.generateCheckoutDeeplink(userInfo);
      console.log('생성된 체크아웃 딥링크:', deeplink);
    }
  } catch (error) {
    console.error('크롤링 관리자 테스트 실패:', error);
  }
  
  console.log('=== 크롤링 관리자 테스트 완료 ===');
}

/**
 * 메인 함수
 */
async function main() {
  console.log('LG A2A 쇼핑 어시스턴트 크롤링 기능 테스트');
  console.log(`모드: ${isDebug ? '디버그' : '일반'}, ${testMode ? '테스트' : '전체'}`);
  
  try {
    await testCrawlingManager();
    
    console.log('\n모든 테스트가 완료되었습니다.');
    process.exit(0);
  } catch (error) {
    console.error('테스트 실행 중 오류 발생:', error);
    process.exit(1);
  }
}

// 스크립트 실행
main();
