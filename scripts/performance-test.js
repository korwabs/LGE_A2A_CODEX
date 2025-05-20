/**
 * 성능 테스트 스크립트
 * 
 * 이 스크립트는 LG 브라질 A2A 쇼핑 어시스턴트의 크롤링 및 처리 성능을 측정합니다.
 * 다양한 시나리오에서의 응답 시간, 메모리 사용량, CPU 사용량 등을 측정합니다.
 */

const BrowserController = require('../src/controllers/browser-controller');
const IntelligentExtractor = require('../src/extractors/intelligent-extractor');
const CrawlingManager = require('../src/crawlers/crawling-manager');
const CheckoutAutomation = require('../src/checkout/checkout-automation');
const Logger = require('../src/utils/log-utils');
const config = require('../config/default-config');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

// 성능 테스트 설정
const PERFORMANCE_TEST_CONFIG = {
  // 테스트 시나리오 횟수
  iterations: 3,
  
  // 테스트할 카테고리 및 제품 URL
  testUrls: {
    categories: [
      'https://www.lge.com/br/refrigeradores',
      'https://www.lge.com/br/tv'
    ],
    products: [
      'https://www.lge.com/br/refrigeradores/lg-gc-b257jvda',
      'https://www.lge.com/br/tv/lg-oled65c1'
    ]
  },
  
  // 성능 데이터 저장 경로
  outputPath: path.join(__dirname, '../logs/performance-test-results.json'),
  
  // 테스트 설정
  testOptions: {
    // 브라우저 컨트롤러 설정
    browserOptions: {
      headless: true,
      timeout: 30000
    },
    
    // 추출기 설정
    extractorOptions: {
      chunkSize: 3000,
      llmProvider: 'gemini',
      maxParallelChunks: 4
    },
    
    // 크롤링 관리자 설정
    crawlingManagerOptions: {
      maxRetries: 2,
      maxConcurrency: 3
    }
  }
};

// 성능 측정 함수
async function measurePerformance(testFn, testName) {
  // 메모리 사용량 초기값
  const initialMemory = process.memoryUsage().heapUsed / 1024 / 1024;
  
  // 시간 측정 시작
  const startTime = performance.now();
  
  // 테스트 함수 실행
  try {
    await testFn();
  } catch (error) {
    console.error(`테스트 "${testName}" 실행 중 오류 발생:`, error);
    return {
      name: testName,
      success: false,
      error: error.message,
      duration: performance.now() - startTime,
      memoryUsed: 0
    };
  }
  
  // 시간 측정 종료
  const endTime = performance.now();
  
  // 메모리 사용량 최종값
  const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024;
  
  // 결과 반환
  return {
    name: testName,
    success: true,
    duration: endTime - startTime,
    memoryUsed: finalMemory - initialMemory
  };
}

// 테스트 결과 저장 함수
function saveTestResults(results) {
  // 출력 디렉토리 확인 및 생성
  const outputDir = path.dirname(PERFORMANCE_TEST_CONFIG.outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 기존 결과가 있으면 병합
  let allResults = [];
  if (fs.existsSync(PERFORMANCE_TEST_CONFIG.outputPath)) {
    try {
      allResults = JSON.parse(fs.readFileSync(PERFORMANCE_TEST_CONFIG.outputPath, 'utf8'));
    } catch (error) {
      console.warn('기존 결과 파일을 읽는 데 실패했습니다:', error.message);
    }
  }
  
  // 새 결과 추가
  allResults.push({
    timestamp: new Date().toISOString(),
    results: results
  });
  
  // 파일 저장
  fs.writeFileSync(
    PERFORMANCE_TEST_CONFIG.outputPath,
    JSON.stringify(allResults, null, 2),
    'utf8'
  );
  
  console.log(`성능 테스트 결과가 저장되었습니다: ${PERFORMANCE_TEST_CONFIG.outputPath}`);
}

// 메인 테스트 함수
async function runPerformanceTests() {
  console.log('LG 브라질 A2A 쇼핑 어시스턴트 성능 테스트 시작...');
  
  // 결과 저장 배열
  const results = [];
  
  // 로깅 레벨 설정
  Logger.setLevel('error');
  
  // 인스턴스 생성
  const browserController = new BrowserController(PERFORMANCE_TEST_CONFIG.testOptions.browserOptions);
  const intelligentExtractor = new IntelligentExtractor(PERFORMANCE_TEST_CONFIG.testOptions.extractorOptions);
  const crawlingManager = new CrawlingManager({
    browserController,
    extractor: intelligentExtractor,
    ...PERFORMANCE_TEST_CONFIG.testOptions.crawlingManagerOptions
  });
  
  try {
    // 테스트 1: 브라우저 컨트롤러 성능
    for (let i = 0; i < PERFORMANCE_TEST_CONFIG.iterations; i++) {
      const result = await measurePerformance(async () => {
        const browser = await browserController.launchBrowser();
        await browserController.executeAction('goToUrl', { 
          url: PERFORMANCE_TEST_CONFIG.testUrls.products[0] 
        }, browser);
        const content = await browser.content();
        await browser.close();
        return content;
      }, `Browser Controller Test #${i+1}`);
      
      results.push(result);
    }
    
    // 테스트 2: 지능형 추출기 성능
    for (let i = 0; i < PERFORMANCE_TEST_CONFIG.iterations; i++) {
      const result = await measurePerformance(async () => {
        const browser = await browserController.launchBrowser();
        await browserController.executeAction('goToUrl', { 
          url: PERFORMANCE_TEST_CONFIG.testUrls.products[0] 
        }, browser);
        const content = await browser.content();
        await browser.close();
        
        // 컨텐츠 추출
        const extractionGoal = "제품 이름, 가격, 설명, 사양, 가용성 정보를 추출";
        return await intelligentExtractor.extractContent(content, extractionGoal);
      }, `Intelligent Extractor Test #${i+1}`);
      
      results.push(result);
    }
    
    // 테스트 3: 카테고리 크롤링 성능
    for (let i = 0; i < PERFORMANCE_TEST_CONFIG.iterations; i++) {
      const result = await measurePerformance(async () => {
        const category = { 
          url: PERFORMANCE_TEST_CONFIG.testUrls.categories[0],
          name: 'Refrigeradores'
        };
        return await crawlingManager.crawlCategory(category, { maxProducts: 5 });
      }, `Category Crawling Test #${i+1}`);
      
      results.push(result);
    }
    
    // 테스트 4: 제품 상세 크롤링 성능
    for (let i = 0; i < PERFORMANCE_TEST_CONFIG.iterations; i++) {
      const result = await measurePerformance(async () => {
        const product = { 
          url: PERFORMANCE_TEST_CONFIG.testUrls.products[0],
          name: 'Test Product'
        };
        return await crawlingManager.crawlSingleProductDetails(product);
      }, `Product Details Crawling Test #${i+1}`);
      
      results.push(result);
    }
    
    // 테스트 5: 체크아웃 프로세스 크롤링 성능
    for (let i = 0; i < PERFORMANCE_TEST_CONFIG.iterations; i++) {
      const result = await measurePerformance(async () => {
        return await crawlingManager.crawlCheckoutProcess(PERFORMANCE_TEST_CONFIG.testUrls.products[0]);
      }, `Checkout Process Crawling Test #${i+1}`);
      
      results.push(result);
    }
    
    // 테스트 6: 병렬 크롤링 성능
    for (let i = 0; i < PERFORMANCE_TEST_CONFIG.iterations; i++) {
      const result = await measurePerformance(async () => {
        const products = PERFORMANCE_TEST_CONFIG.testUrls.products.map(url => ({
          url,
          name: 'Test Product'
        }));
        return await crawlingManager.crawlProductDetails(products, 2);
      }, `Parallel Crawling Test #${i+1}`);
      
      results.push(result);
    }
    
    // 결과 저장
    saveTestResults(results);
    
  } finally {
    // 리소스 정리
    if (crawlingManager) {
      await crawlingManager.close();
    }
  }
  
  // 결과 요약 출력
  console.log('\n성능 테스트 결과 요약:');
  const testGroups = {};
  results.forEach(result => {
    // 테스트 이름에서 그룹 이름과 반복 횟수 추출 (예: "Browser Controller Test #1")
    const match = result.name.match(/^(.*) Test #\d+$/);
    if (match) {
      const groupName = match[1];
      if (!testGroups[groupName]) {
        testGroups[groupName] = [];
      }
      testGroups[groupName].push(result);
    }
  });
  
  // 그룹별 평균 계산 및 출력
  Object.entries(testGroups).forEach(([groupName, groupResults]) => {
    const avgDuration = groupResults.reduce((sum, r) => sum + r.duration, 0) / groupResults.length;
    const avgMemory = groupResults.reduce((sum, r) => sum + r.memoryUsed, 0) / groupResults.length;
    const successRate = groupResults.filter(r => r.success).length / groupResults.length * 100;
    
    console.log(`\n${groupName}:`);
    console.log(`  평균 실행 시간: ${avgDuration.toFixed(2)} ms`);
    console.log(`  평균 메모리 사용: ${avgMemory.toFixed(2)} MB`);
    console.log(`  성공률: ${successRate.toFixed(2)}%`);
  });
  
  console.log('\nLG 브라질 A2A 쇼핑 어시스턴트 성능 테스트 완료.');
}

// 테스트 실행
if (require.main === module) {
  runPerformanceTests().catch(error => {
    console.error('성능 테스트 실행 중 오류 발생:', error);
    process.exit(1);
  });
}

module.exports = {
  runPerformanceTests,
  measurePerformance,
  PERFORMANCE_TEST_CONFIG
};
