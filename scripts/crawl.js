/**
 * 메인 크롤링 스크립트 - CrawlingManager를 사용하여 LG 브라질 웹사이트 크롤링
 */
require('dotenv').config();
const CrawlingManager = require('./crawlers/crawling-manager');
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

// 명령줄 인자 확인
const args = process.argv.slice(2);
const isDebug = args.includes('--debug') || process.env.DEBUG_MODE === 'true';
const isTest = args.includes('--test');
const isForce = args.includes('--force');
const refreshCategories = args.includes('--refresh') || process.env.REFRESH_CATEGORIES === 'true';

/**
 * 카테고리 정보를 가져오는 함수
 * @returns {Promise<Array>} 카테고리 목록
 */
async function getCategories() {
  const categoriesPath = path.join(dataDir, 'categories.json');
  
  // 카테고리 새로고침 또는 파일이 없는 경우
  if (refreshCategories || !fs.existsSync(categoriesPath)) {
    console.log('카테고리 정보 새로 발견 시작');
    
    // 카테고리 발견 로직
    const categories = await discoverCategories();
    
    // 파일에 저장
    fs.writeFileSync(categoriesPath, JSON.stringify(categories, null, 2));
    
    console.log(`카테고리 발견 완료: ${categories.length}개 카테고리`);
    return categories;
  } else {
    // 기존 파일에서 읽기
    console.log('캐시된 카테고리 정보 사용');
    return JSON.parse(fs.readFileSync(categoriesPath, 'utf8'));
  }
}

/**
 * 카테고리 발견 함수
 * @returns {Promise<Array>} 발견된 카테고리 목록
 */
async function discoverCategories() {
  const crawlingManager = new CrawlingManager({
    browserOptions: {
      headless: !isDebug,
      slowMo: isDebug ? 100 : 50
    },
    dataDir
  });
  
  // 브라우저 시작
  await crawlingManager.browserController.launchBrowser();
  
  try {
    // LG 브라질 메인 페이지 방문
    await crawlingManager.browserController.executeAction('goToUrl', { url: 'https://www.lge.com/br' });
    
    // 현재 페이지 가져오기
    const page = await crawlingManager.browserController.getCurrentPage();
    
    // 네비게이션 메뉴에서 카테고리 추출
    const categories = await page.evaluate(() => {
      const categoryNodes = document.querySelectorAll('.main-nav a, .navigation a, .menu a');
      
      return Array.from(categoryNodes)
        .filter(node => {
          const href = node.getAttribute('href');
          const text = node.textContent.trim();
          // 카테고리 링크 필터링 (제품 카테고리만 포함)
          return href && text && 
                 href.includes('/br/') && 
                 !href.includes('javascript:') &&
                 !href.includes('login') &&
                 !href.includes('support') &&
                 node.offsetParent !== null; // 화면에 표시되는 요소만
        })
        .map(node => ({
          name: node.textContent.trim(),
          url: new URL(node.href, window.location.origin).href,
          id: node.getAttribute('data-id') || 
              node.href.split('/').filter(Boolean).pop()
        }));
    });
    
    return categories;
  } finally {
    // 브라우저 종료
    await crawlingManager.browserController.executeAction('closeBrowser');
  }
}

/**
 * 메인 크롤링 함수
 */
async function main() {
  console.log('LG 브라질 쇼핑몰 크롤링 시작');
  console.log(`모드: ${isDebug ? '디버그' : '일반'}, ${isTest ? '테스트' : '전체'}, ${isForce ? '강제' : '일반'}, ${refreshCategories ? '카테고리 새로고침' : '기존 카테고리'}`);
  
  try {
    // 크롤링 매니저 인스턴스 생성
    const crawlingManager = new CrawlingManager({
      browserOptions: {
        headless: !isDebug,
        slowMo: isDebug ? 100 : 50
      },
      extractorOptions: {
        chunkSize: 4000,
        maxParallelChunks: isTest ? 2 : 3
      },
      checkoutOptions: {
        dataDir
      },
      maxRetries: isTest ? 2 : 3,
      maxConcurrency: isTest ? 2 : 5,
      dataDir
    });
    
    // 테스트 모드인 경우
    if (isTest) {
      console.log('테스트 모드: 일부 카테고리와 제품만 크롤링');
      
      // 테스트용 카테고리
      const testCategories = [
        { name: 'TVs', url: 'https://www.lge.com/br/tvs' },
        { name: 'Refrigeradores', url: 'https://www.lge.com/br/refrigeradores' }
      ];
      
      // 테스트 카테고리 크롤링
      const results = {};
      
      for (const category of testCategories) {
        console.log(`카테고리 크롤링: ${category.name}`);
        const products = await crawlingManager.crawlCategory(
          category, 
          { limit: 5, crawlDetails: true }
        );
        results[category.name] = products;
      }
      
      console.log('테스트 크롤링 완료');
      console.log(`결과: ${Object.keys(results).length} 카테고리, ${Object.values(results).flat().length} 제품`);
      
      return;
    }
    
    // 전체 카테고리 크롤링
    const categories = await getCategories();
    
    // 카테고리 제한 (필요한 경우)
    const maxCategories = config.crawling.maxCategoriesPerRun;
    const categoriesToCrawl = categories.slice(0, maxCategories);
    
    console.log(`크롤링 대상 카테고리: ${categoriesToCrawl.length}/${categories.length}개`);
    
    // 모든 카테고리 크롤링
    const result = await crawlingManager.crawlAllCategories(
      categoriesToCrawl,
      { 
        limit: config.crawling.maxProductsPerCategory,
        crawlDetails: true,
        maxConcurrency: config.crawling.maxConcurrency
      }
    );
    
    console.log('크롤링 완료');
    console.log(`결과: ${result.successfulCategories} 성공, ${result.failedCategories} 실패, ${Object.values(result.results).flat().length} 제품`);
    
    // 체크아웃 프로세스 분석 (별도 실행)
    if (!isDebug) {
      console.log('체크아웃 프로세스 분석은 디버그 모드에서만 실행됩니다.');
    } else {
      // 샘플 제품 URL (실제 환경에서는 크롤링한 제품 중에서 선택)
      const sampleProductUrl = 'https://www.lge.com/br/tvs/lg-oled65c1';
      console.log(`체크아웃 프로세스 분석 시작: ${sampleProductUrl}`);
      await crawlingManager.crawlCheckoutProcess(sampleProductUrl);
    }
    
  } catch (error) {
    console.error('크롤링 중 오류 발생:', error);
    process.exit(1);
  }
}

// 스크립트 실행
if (require.main === module) {
  main()
    .then(() => {
      console.log('크롤링 작업이 완료되었습니다.');
      process.exit(0);
    })
    .catch(error => {
      console.error('크롤링 작업 실행 중 오류 발생:', error);
      process.exit(1);
    });
} else {
  // 모듈로 사용될 때
  module.exports = {
    main,
    getCategories,
    discoverCategories
  };
}
