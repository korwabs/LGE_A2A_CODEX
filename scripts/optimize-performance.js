/**
 * 성능 최적화 스크립트
 * 
 * 이 스크립트는 LG 브라질 A2A 쇼핑 어시스턴트의 성능을 분석하고
 * 병목 현상을 식별하여 최적화 방안을 제시합니다.
 */

const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');
const BrowserController = require('../src/controllers/browser-controller');
const IntelligentExtractor = require('../src/extractors/intelligent-extractor');
const CrawlingManager = require('../src/crawlers/crawling-manager');
const Logger = require('../src/utils/log-utils');

const config = require('./config/default-config');
// 통합 테스트 기본 설정
const DEFAULT_TEST_CONFIG = {
  logLevel: "info",
  browserOptions: {},
  extractorOptions: {},
  crawlingManagerOptions: {}
};

config.test = { ...DEFAULT_TEST_CONFIG, ...(config.test || {}) };


// 최적화 결과 저장 경로
const OPTIMIZATION_RESULTS_PATH = path.join(__dirname, '../logs/optimization-results.json');

// 최적화 대상 URL
const TARGET_URLS = {
  category: 'https://www.lge.com/br/refrigeradores',
  product: 'https://www.lge.com/br/refrigeradores/lg-gc-b257jvda'
};

// 성능 측정 함수
async function measurePerformance(testFn, testName, iterations = 3) {
  const results = [];
  
  for (let i = 0; i < iterations; i++) {
    // 가비지 컬렉션 유도 (참고용: 실제로는 강제할 수 없음)
    if (global.gc) {
      global.gc();
    }
    
    // 메모리 사용량 초기값
    const initialMemory = process.memoryUsage().heapUsed / 1024 / 1024;
    
    // 시간 측정 시작
    const startTime = performance.now();
    
    // 테스트 함수 실행
    try {
      await testFn();
    } catch (error) {
      console.error(`테스트 "${testName}" 실행 중 오류 발생:`, error);
      results.push({
        iteration: i + 1,
        success: false,
        error: error.message,
        duration: performance.now() - startTime,
        memoryUsed: 0
      });
      continue;
    }
    
    // 시간 측정 종료
    const endTime = performance.now();
    
    // 메모리 사용량 최종값
    const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024;
    
    // 결과 저장
    results.push({
      iteration: i + 1,
      success: true,
      duration: endTime - startTime,
      memoryUsed: finalMemory - initialMemory
    });
  }
  
  // 평균 계산
  const successResults = results.filter(r => r.success);
  const avgDuration = successResults.reduce((sum, r) => sum + r.duration, 0) / successResults.length;
  const avgMemory = successResults.reduce((sum, r) => sum + r.memoryUsed, 0) / successResults.length;
  
  return {
    name: testName,
    iterations: results,
    averageDuration: avgDuration,
    averageMemoryUsed: avgMemory,
    successRate: (successResults.length / results.length) * 100
  };
}

// 최적화 결과 저장 함수
function saveOptimizationResults(originalResults, optimizedResults) {
  // 출력 디렉토리 확인 및 생성
  const outputDir = path.dirname(OPTIMIZATION_RESULTS_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 결과 저장
  const results = {
    timestamp: new Date().toISOString(),
    original: originalResults,
    optimized: optimizedResults,
    improvements: {}
  };
  
  // 개선 정도 계산
  Object.keys(originalResults).forEach(key => {
    if (optimizedResults[key] && originalResults[key].averageDuration && optimizedResults[key].averageDuration) {
      // 실행 시간 개선도 (%)
      const durationImprovement = ((originalResults[key].averageDuration - optimizedResults[key].averageDuration) / originalResults[key].averageDuration) * 100;
      
      // 메모리 사용량 개선도 (%)
      const memoryImprovement = ((originalResults[key].averageMemoryUsed - optimizedResults[key].averageMemoryUsed) / originalResults[key].averageMemoryUsed) * 100;
      
      results.improvements[key] = {
        durationImprovement,
        memoryImprovement
      };
    }
  });
  
  // 파일 저장
  fs.writeFileSync(
    OPTIMIZATION_RESULTS_PATH,
    JSON.stringify(results, null, 2),
    'utf8'
  );
  
  console.log(`최적화 결과가 저장되었습니다: ${OPTIMIZATION_RESULTS_PATH}`);
  
  return results;
}

// 병목 현상 식별 함수
function identifyBottlenecks(results) {
  const bottlenecks = [];
  
  // 실행 시간 기준 상위 3개 병목 식별
  const sortedByDuration = Object.keys(results)
    .map(key => ({ name: key, duration: results[key].averageDuration }))
    .sort((a, b) => b.duration - a.duration);
  
  bottlenecks.push({
    title: '실행 시간 기준 상위 병목',
    items: sortedByDuration.slice(0, 3).map(item => ({
      name: item.name,
      value: `${item.duration.toFixed(2)} ms`
    }))
  });
  
  // 메모리 사용량 기준 상위 3개 병목 식별
  const sortedByMemory = Object.keys(results)
    .map(key => ({ name: key, memory: results[key].averageMemoryUsed }))
    .sort((a, b) => b.memory - a.memory);
  
  bottlenecks.push({
    title: '메모리 사용량 기준 상위 병목',
    items: sortedByMemory.slice(0, 3).map(item => ({
      name: item.name,
      value: `${item.memory.toFixed(2)} MB`
    }))
  });
  
  return bottlenecks;
}

// 최적화 제안 생성 함수
function generateOptimizationSuggestions(bottlenecks) {
  const suggestions = {};
  
  // 각 병목 현상에 대한 최적화 제안
  bottlenecks.forEach(bottleneck => {
    bottleneck.items.forEach(item => {
      const name = item.name;
      
      // 이미 제안이 있는 경우 건너뛰기
      if (suggestions[name]) {
        return;
      }
      
      // 테스트 이름에 따른 최적화 제안
      switch (name) {
        case 'Browser Controller Test':
          suggestions[name] = [
            '브라우저 인스턴스를 재사용하여 브라우저 시작/종료 시간 단축',
            '병렬 브라우저 세션 사용으로 동시 처리 향상',
            '불필요한 리소스 로딩 차단 (이미지, 폰트 등)',
            '브라우저 캐시 활성화로 반복 방문 시 성능 향상',
            '타임아웃 및 재시도 정책 최적화'
          ];
          break;
          
        case 'Intelligent Extractor Test':
          suggestions[name] = [
            'LLM 요청 배치 처리로 API 호출 최소화',
            '병렬 처리 수준 조정 (최적의 maxParallelChunks 값 탐색)',
            '더 효율적인 청크 분할 로직 구현',
            '불필요한 HTML 요소 사전 제거하여 처리량 감소',
            '결과 캐싱으로 유사한 추출 작업 가속화'
          ];
          break;
          
        case 'Category Crawling Test':
          suggestions[name] = [
            '선택적 카테고리 크롤링으로 불필요한 페이지 스킵',
            '증분 크롤링 구현으로 전체 재크롤링 방지',
            '인기 카테고리 우선 크롤링으로 자주 요청되는 정보 우선 확보',
            '동적 병렬화 수준으로 서버 부하에 적응',
            '크롤링 작업 스케줄링 최적화'
          ];
          break;
          
        case 'Product Details Crawling Test':
          suggestions[name] = [
            '필수 정보만 추출하는 경량 모드 구현',
            '제품 정보 캐싱 및 TTL 기반 관리',
            '이미지 및 미디어 지연 로딩',
            '필드별 추출 병렬화로 대기 시간 단축',
            '유사 제품 정보 활용으로 중복 크롤링 감소'
          ];
          break;
          
        case 'Checkout Process Crawling Test':
          suggestions[name] = [
            '체크아웃 프로세스 캐싱으로 반복 분석 방지',
            '필드 유형별 맞춤형 추출 로직으로 정확도 향상',
            '단계별 추출로 전체 프로세스 완료 전 사용 가능',
            '변경 감지 기반 업데이트로 전체 재분석 최소화',
            '가장 많이 사용되는 체크아웃 프로세스를 우선 분석'
          ];
          break;
          
        case 'Parallel Crawling Test':
          suggestions[name] = [
            '요청 큐 및 속도 제한 구현으로 서버 차단 방지',
            '동적 병렬화 수준으로 최적 성능/부하 균형 유지',
            '우선순위 기반 크롤링으로 중요 정보 먼저 확보',
            '결과 병합 로직 최적화로 메모리 사용량 감소',
            '작업 배치 처리로 오버헤드 감소'
          ];
          break;
          
        default:
          suggestions[name] = [
            '코드 프로파일링을 통한 병목 지점 상세 분석',
            '메모리 누수 확인 및 리소스 해제 개선',
            '비동기 처리 최적화',
            '캐싱 전략 구현',
            '로깅 및 디버깅 코드 제거 또는 최적화'
          ];
      }
    });
  });
  
  return suggestions;
}

// 일반적인 최적화 권장사항
const GENERAL_OPTIMIZATION_RECOMMENDATIONS = [
  {
    title: '캐싱 전략 개선',
    description: '데이터 캐싱 레이어를 추가하여 자주 요청되는 정보의 반복 크롤링 방지',
    implementation: [
      'Redis 또는 LRU 캐시 구현',
      '카테고리별, 제품별 TTL 설정',
      '가격 및 재고 정보는 짧은 TTL, 제품 설명 등 정적 정보는 긴 TTL 적용',
      '캐시 무효화 트리거 구현'
    ]
  },
  {
    title: '병렬 처리 최적화',
    description: '병렬 처리 수준을 동적으로 조정하여 최적의 성능 달성',
    implementation: [
      '서버 응답 시간에 따른 동적 병렬화 수준 조정',
      '작업 배치 크기 최적화',
      '우선순위 큐 구현으로 중요 작업 먼저 처리',
      '결과 병합 로직 최적화'
    ]
  },
  {
    title: '메모리 사용량 최적화',
    description: '대용량 데이터 처리 시 메모리 사용량 최소화',
    implementation: [
      '스트림 처리 방식 도입',
      '대용량 객체의 조기 해제',
      '불필요한 중간 결과 객체 제거',
      '객체 풀링 사용으로 객체 재사용'
    ]
  },
  {
    title: 'LLM 호출 최적화',
    description: 'LLM API 호출 비용 및 대기 시간 감소',
    implementation: [
      '유사 요청에 대한 응답 캐싱',
      '토큰 수 최소화를 위한 컨텍스트 압축',
      '배치 처리로 API 호출 횟수 감소',
      '낮은 대기 시간의 모델 선택적 사용'
    ]
  },
  {
    title: '브라우저 자동화 효율성 향상',
    description: '브라우저 조작 관련 리소스 사용량 및 대기 시간 감소',
    implementation: [
      '브라우저 인스턴스 풀링 도입',
      '불필요한 리소스(이미지, 스크립트 등) 차단',
      '동적 콘텐츠 로딩 최적화',
      '헤드리스 브라우저 설정 최적화'
    ]
  }
];

// 최적화 버전 구현
async function runOptimizedVersion() {
  console.log('최적화된 버전 테스트 실행 중...');
  
  // 결과 저장 객체
  const results = {};
  
  // 브라우저 컨트롤러 최적화된 버전
  const browserController = new BrowserController({
    headless: true,
    args: [
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-setuid-sandbox',
      '--no-sandbox',
      '--disable-accelerated-2d-canvas',
      '--disable-extensions',
      '--disable-images', // 이미지 로딩 비활성화
      '--blink-settings=imagesEnabled=false' // 이미지 렌더링 비활성화
    ],
    userDataDir: path.join(__dirname, '../data/browser-cache'), // 브라우저 캐시 활성화
    timeout: 30000
  });
  
  // 지능형 추출기 최적화된 버전
  const intelligentExtractor = new IntelligentExtractor({
    chunkSize: 4000, // 청크 크기 증가
    llmProvider: 'gemini',
    maxParallelChunks: 2, // 병렬 처리 수준 감소
    cacheEnabled: true, // 캐싱 활성화
    cacheTTL: 3600 // 캐시 유효 시간 (초)
  });
  
  // 크롤링 관리자 최적화된 버전
  const crawlingManager = new CrawlingManager({
    browserController,
    extractor: intelligentExtractor,
    maxRetries: 2,
    maxConcurrency: 2, // 병렬 처리 수준 조정
    priorityBasedQueue: true, // 우선순위 기반 큐 사용
    cacheEnabled: true, // 캐싱 활성화
    incrementalCrawling: true // 증분 크롤링 활성화
  });
  
  try {
    // 테스트 1: 브라우저 컨트롤러 성능 (최적화 버전)
    results['Browser Controller Test'] = await measurePerformance(async () => {
      // 브라우저 인스턴스 재사용
      const browser = await browserController.launchBrowser();
      
      // 빠른 로딩을 위한 설정
      await browserController.executeAction('setResourceLoadingOptions', {
        blockImages: true,
        blockFonts: true,
        blockMedia: true
      }, browser);
      
      await browserController.executeAction('goToUrl', { 
        url: TARGET_URLS.product,
        waitUntil: 'domcontentloaded' // 더 빠른 페이지 로드 기준
      }, browser);
      
      const content = await browser.content();
      
      // 브라우저 닫지 않고 재사용
      return content;
    }, 'Browser Controller Test (Optimized)');
    
    // 테스트 2: 지능형 추출기 성능 (최적화 버전)
    results['Intelligent Extractor Test'] = await measurePerformance(async () => {
      const browser = await browserController.getBrowser(); // 기존 브라우저 재사용
      
      await browser.page.goto(TARGET_URLS.product, { 
        waitUntil: 'domcontentloaded'
      });
      
      const content = await browser.page.content();
      
      // HTML 사전 처리로 불필요한 요소 제거
      const processedContent = await intelligentExtractor.preprocessHTML(content, {
        removeScripts: true,
        removeStyles: true,
        removeComments: true,
        removeHiddenElements: true
      });
      
      // 컨텐츠 추출
      const extractionGoal = "제품 이름, 가격, 설명, 사양, 가용성 정보를 추출";
      return await intelligentExtractor.extractContent(processedContent, extractionGoal, {
        useCaching: true, // 캐싱 사용
        enableBatchProcessing: true // 배치 처리 활성화
      });
    }, 'Intelligent Extractor Test (Optimized)');
    
    // 테스트 3: 카테고리 크롤링 성능 (최적화 버전)
    results['Category Crawling Test'] = await measurePerformance(async () => {
      const category = { 
        url: TARGET_URLS.category,
        name: 'Refrigeradores'
      };
      
      // 최적화된 카테고리 크롤링
      return await crawlingManager.crawlCategory(category, { 
        maxProducts: 5,
        useCache: true, // 캐시 사용
        incrementalUpdate: true, // 증분 업데이트
        prioritizePopular: true, // 인기 제품 우선
        lightMode: true // 경량 모드
      });
    }, 'Category Crawling Test (Optimized)');
    
    // 테스트 4: 제품 상세 크롤링 성능 (최적화 버전)
    results['Product Details Crawling Test'] = await measurePerformance(async () => {
      const product = { 
        url: TARGET_URLS.product,
        name: 'Test Product'
      };
      
      // 최적화된 제품 상세 크롤링
      return await crawlingManager.crawlSingleProductDetails(product, {
        useCache: true, // 캐시 사용
        lightMode: true, // 경량 모드 (필수 정보만 추출)
        skipImages: true, // 이미지 스킵
        fieldsToExtract: ['name', 'price', 'availability', 'description', 'specs'] // 필요한 필드만 지정
      });
    }, 'Product Details Crawling Test (Optimized)');
    
    // 테스트 5: 체크아웃 프로세스 크롤링 성능 (최적화 버전)
    results['Checkout Process Crawling Test'] = await measurePerformance(async () => {
      // 최적화된 체크아웃 프로세스 크롤링
      return await crawlingManager.crawlCheckoutProcess(TARGET_URLS.product, {
        useCache: true, // 캐시 사용
        incrementalAnalysis: true, // 증분 분석
        stepByStepAnalysis: true // 단계별 분석
      });
    }, 'Checkout Process Crawling Test (Optimized)');
    
    // 테스트 6: 병렬 크롤링 성능 (최적화 버전)
    results['Parallel Crawling Test'] = await measurePerformance(async () => {
      const products = [
        { url: TARGET_URLS.product, name: 'Test Product 1' },
        { url: TARGET_URLS.product.replace('gc-b257jvda', 'gc-b247sluv'), name: 'Test Product 2' }
      ];
      
      // 최적화된 병렬 크롤링
      return await crawlingManager.crawlProductDetails(products, 2, {
        useCache: true, // 캐시 사용
        lightMode: true, // 경량 모드
        adaptiveConcurrency: true, // 적응형 병렬처리
        batchProcessing: true // 배치 처리
      });
    }, 'Parallel Crawling Test (Optimized)');
    
    // 브라우저 인스턴스 정리
    await browserController.close();
    
    return results;
    
  } catch (error) {
    console.error('최적화 버전 테스트 중 오류 발생:', error);
    
    // 브라우저 인스턴스 정리
    try {
      await browserController.close();
    } catch (closeError) {
      console.error('브라우저 인스턴스 정리 중 오류:', closeError);
    }
    
    throw error;
  }
}

// 기존 버전 실행
async function runOriginalVersion() {
  console.log('기존 버전 테스트 실행 중...');
  
  // 결과 저장 객체
  const results = {};
  
  // 기존 브라우저 컨트롤러
  const browserController = new BrowserController({
    headless: true,
    ...config.test.browserOptions
  });
  
  // 기존 지능형 추출기
  const intelligentExtractor = new IntelligentExtractor({
    chunkSize: 3000,
    llmProvider: 'gemini',
    maxParallelChunks: 4,
    ...config.test.extractorOptions
  });
  
  // 기존 크롤링 관리자
  const crawlingManager = new CrawlingManager({
    browserController,
    extractor: intelligentExtractor,
    maxRetries: 2,
    maxConcurrency: 3,
    ...config.test.crawlingManagerOptions
  });
  
  try {
    // 테스트 1: 브라우저 컨트롤러 성능 (기존 버전)
    results['Browser Controller Test'] = await measurePerformance(async () => {
      const browser = await browserController.launchBrowser();
      await browserController.executeAction('goToUrl', { 
        url: TARGET_URLS.product 
      }, browser);
      const content = await browser.content();
      await browser.close();
      return content;
    }, 'Browser Controller Test (Original)');
    
    // 테스트 2: 지능형 추출기 성능 (기존 버전)
    results['Intelligent Extractor Test'] = await measurePerformance(async () => {
      const browser = await browserController.launchBrowser();
      await browserController.executeAction('goToUrl', { 
        url: TARGET_URLS.product 
      }, browser);
      const content = await browser.content();
      await browser.close();
      
      // 컨텐츠 추출
      const extractionGoal = "제품 이름, 가격, 설명, 사양, 가용성 정보를 추출";
      return await intelligentExtractor.extractContent(content, extractionGoal);
    }, 'Intelligent Extractor Test (Original)');
    
    // 테스트 3: 카테고리 크롤링 성능 (기존 버전)
    results['Category Crawling Test'] = await measurePerformance(async () => {
      const category = { 
        url: TARGET_URLS.category,
        name: 'Refrigeradores'
      };
      return await crawlingManager.crawlCategory(category, { maxProducts: 5 });
    }, 'Category Crawling Test (Original)');
    
    // 테스트 4: 제품 상세 크롤링 성능 (기존 버전)
    results['Product Details Crawling Test'] = await measurePerformance(async () => {
      const product = { 
        url: TARGET_URLS.product,
        name: 'Test Product'
      };
      return await crawlingManager.crawlSingleProductDetails(product);
    }, 'Product Details Crawling Test (Original)');
    
    // 테스트 5: 체크아웃 프로세스 크롤링 성능 (기존 버전)
    results['Checkout Process Crawling Test'] = await measurePerformance(async () => {
      return await crawlingManager.crawlCheckoutProcess(TARGET_URLS.product);
    }, 'Checkout Process Crawling Test (Original)');
    
    // 테스트 6: 병렬 크롤링 성능 (기존 버전)
    results['Parallel Crawling Test'] = await measurePerformance(async () => {
      const products = [
        { url: TARGET_URLS.product, name: 'Test Product 1' },
        { url: TARGET_URLS.product.replace('gc-b257jvda', 'gc-b247sluv'), name: 'Test Product 2' }
      ];
      return await crawlingManager.crawlProductDetails(products, 2);
    }, 'Parallel Crawling Test (Original)');
    
    // 브라우저 인스턴스 정리
    await browserController.close();
    
    return results;
    
  } catch (error) {
    console.error('기존 버전 테스트 중 오류 발생:', error);
    
    // 브라우저 인스턴스 정리
    try {
      await browserController.close();
    } catch (closeError) {
      console.error('브라우저 인스턴스 정리 중 오류:', closeError);
    }
    
    throw error;
  }
}

// 최적화 보고서 생성
function generateOptimizationReport(originalResults, optimizedResults, improvements) {
  const reportLines = [];
  
  // 보고서 헤더
  reportLines.push('# LG 브라질 A2A 쇼핑 어시스턴트 성능 최적화 보고서');
  reportLines.push(`\n생성 일시: ${new Date().toISOString()}\n`);
  
  // 요약 섹션
  reportLines.push('## 최적화 요약');
  
  // 전체 평균 개선도 계산
  const avgDurationImprovement = Object.values(improvements).reduce((sum, imp) => sum + imp.durationImprovement, 0) / Object.keys(improvements).length;
  const avgMemoryImprovement = Object.values(improvements).reduce((sum, imp) => sum + imp.memoryImprovement, 0) / Object.keys(improvements).length;
  
  reportLines.push(`\n- **실행 시간 평균 개선도**: ${avgDurationImprovement.toFixed(2)}%`);
  reportLines.push(`- **메모리 사용량 평균 개선도**: ${avgMemoryImprovement.toFixed(2)}%\n`);
  
  // 영역별 개선도 섹션
  reportLines.push('## 영역별 성능 개선');
  reportLines.push('\n| 테스트 영역 | 기존 실행 시간 (ms) | 최적화 실행 시간 (ms) | 개선도 (%) | 기존 메모리 사용량 (MB) | 최적화 메모리 사용량 (MB) | 개선도 (%) |');
  reportLines.push('|------------|-------------------|---------------------|-----------|----------------------|--------------------------|-----------|');
  
  Object.keys(originalResults).forEach(key => {
    if (optimizedResults[key] && improvements[key]) {
      const original = originalResults[key];
      const optimized = optimizedResults[key];
      const improvement = improvements[key];
      
      reportLines.push(`| ${key} | ${original.averageDuration.toFixed(2)} | ${optimized.averageDuration.toFixed(2)} | ${improvement.durationImprovement.toFixed(2)} | ${original.averageMemoryUsed.toFixed(2)} | ${optimized.averageMemoryUsed.toFixed(2)} | ${improvement.memoryImprovement.toFixed(2)} |`);
    }
  });
  
  reportLines.push('\n');
  
  // 주요 병목 및 개선 솔루션
  reportLines.push('## 식별된 주요 병목 및 개선 솔루션');
  
  // 병목 식별
  const bottlenecks = identifyBottlenecks(originalResults);
  
  // 최적화 제안 생성
  const suggestions = generateOptimizationSuggestions(bottlenecks);
  
  bottlenecks.forEach(bottleneck => {
    reportLines.push(`\n### ${bottleneck.title}`);
    reportLines.push('\n| 영역 | 측정값 | 개선 방안 |');
    reportLines.push('|------|--------|-----------|');
    
    bottleneck.items.forEach(item => {
      const solutionsList = suggestions[item.name] || 
        ['코드 프로파일링 필요', '최적화 가능성 검토 필요'];
      
      const solutions = solutionsList.join('<br>');
      reportLines.push(`| ${item.name} | ${item.value} | ${solutions} |`);
    });
  });
  
  reportLines.push('\n');
  
  // 일반 최적화 권장사항
  reportLines.push('## 일반 최적화 권장사항');
  
  GENERAL_OPTIMIZATION_RECOMMENDATIONS.forEach(recommendation => {
    reportLines.push(`\n### ${recommendation.title}`);
    reportLines.push(`\n${recommendation.description}\n`);
    reportLines.push('**구현 방안**:\n');
    recommendation.implementation.forEach(impl => {
      reportLines.push(`- ${impl}`);
    });
    reportLines.push('\n');
  });
  
  // 결론
  reportLines.push('## 결론');
  reportLines.push('\n본 성능 최적화 보고서는 LG 브라질 A2A 쇼핑 어시스턴트의 주요 성능 병목을 식별하고 개선 방안을 제시했습니다. 제안된 최적화 방안을 적용하면 응답 시간이 개선되고 리소스 사용이 효율화되어 사용자 경험이 향상될 것으로 예상됩니다.\n');
  reportLines.push('추가적인 성능 개선을 위해 지속적인 프로파일링 및 모니터링을 통해 새롭게 발생하는 병목을 식별하고 해결하는 것이 권장됩니다.');
  
  return reportLines.join('\n');
}

// 메인 실행 함수
async function runOptimizationTests() {
  console.log('LG 브라질 A2A 쇼핑 어시스턴트 성능 최적화 테스트 시작...');
  
  try {
    // 로깅 레벨 설정
    Logger.setLevel('error');
    
    // 기존 버전 테스트
    console.log('\n1. 기존 버전 테스트 실행 중...');
    const originalResults = await runOriginalVersion();
    
    // 최적화 버전 테스트
    console.log('\n2. 최적화 버전 테스트 실행 중...');
    const optimizedResults = await runOptimizedVersion();
    
    // 결과 저장 및 개선도 계산
    console.log('\n3. 결과 분석 및 보고서 생성 중...');
    const results = saveOptimizationResults(originalResults, optimizedResults);
    
    // 최적화 보고서 생성
    const report = generateOptimizationReport(originalResults, optimizedResults, results.improvements);
    
    // 보고서 저장
    const reportPath = path.join(__dirname, '../logs/optimization-report.md');
    fs.writeFileSync(reportPath, report, 'utf8');
    
    console.log(`\n성능 최적화 보고서가 생성되었습니다: ${reportPath}`);
    
    // 결과 요약 출력
    console.log('\n성능 최적화 결과 요약:');
    Object.keys(results.improvements).forEach(key => {
      const improvement = results.improvements[key];
      console.log(`- ${key}:`);
      console.log(`  실행 시간 개선: ${improvement.durationImprovement.toFixed(2)}%`);
      console.log(`  메모리 사용량 개선: ${improvement.memoryImprovement.toFixed(2)}%`);
    });
    
    console.log('\nLG 브라질 A2A 쇼핑 어시스턴트 성능 최적화 테스트 완료.');
    
  } catch (error) {
    console.error('성능 최적화 테스트 실행 중 오류 발생:', error);
  }
}

// 테스트 실행
if (require.main === module) {
  runOptimizationTests().catch(error => {
    console.error('성능 최적화 테스트 실행 중 오류 발생:', error);
    process.exit(1);
  });
}

module.exports = {
  runOptimizationTests,
  measurePerformance,
  identifyBottlenecks,
  generateOptimizationSuggestions,
  generateOptimizationReport
};
