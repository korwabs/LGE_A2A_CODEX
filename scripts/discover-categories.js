/**
 * LG A2A 쇼핑 어시스턴트 카테고리 발견 스크립트
 * LG 브라질 웹사이트에서 제품 카테고리를 자동으로 발견합니다.
 */
require('dotenv').config();
const BrowserController = require('./controllers/browser-controller');
const fs = require('fs');
const path = require('path');

// 데이터 디렉토리 확인 및 생성
const dataDir = path.resolve(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * LG 브라질 웹사이트에서 카테고리를 발견하는 함수
 * @param {object} options 발견 옵션
 * @returns {Promise<Array>} 발견된 카테고리 배열
 */
async function discoverCategories(options = {}) {
  const { debug = false } = options;
  
  console.log('LG 브라질 웹사이트에서 카테고리 발견 시작');
  
  // 브라우저 컨트롤러 생성
  const browserController = new BrowserController({
    headless: !debug,
    slowMo: debug ? 100 : 50
  });
  
  // 결과 배열
  let categories = [];
  
  try {
    // 브라우저 시작
    await browserController.launchBrowser();
    
    // LG 브라질 메인 페이지 방문
    await browserController.executeAction('goToUrl', { url: 'https://www.lge.com/br' });
    
    // 현재 페이지 가져오기
    const page = await browserController.getCurrentPage();
    
    // 네비게이션 메뉴에서 카테고리 추출
    categories = await page.evaluate(() => {
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
    
    console.log(`카테고리 발견 완료: ${categories.length}개 카테고리`);
    
    // 카테고리 정보 저장
    fs.writeFileSync(
      path.join(dataDir, 'categories.json'), 
      JSON.stringify(categories, null, 2)
    );
    
    // 스크린샷 저장 (디버그 모드에서만)
    if (debug) {
      await page.screenshot({ 
        path: path.join(dataDir, 'homepage.png'),
        fullPage: true
      });
      console.log('홈페이지 스크린샷 저장 완료');
    }
    
    return categories;
  } catch (error) {
    console.error('카테고리 발견 중 오류 발생:', error);
    throw error;
  } finally {
    // 브라우저 종료
    await browserController.executeAction('closeBrowser');
  }
}

// 직접 실행될 때
if (require.main === module) {
  // 명령줄 인자 확인
  const args = process.argv.slice(2);
  const debug = args.includes('--debug') || args.includes('-d');
  
  // 카테고리 발견 실행
  discoverCategories({ debug })
    .then(categories => {
      console.log(`발견된 카테고리: ${categories.length}개`);
      categories.forEach((category, index) => {
        console.log(`${index + 1}. ${category.name} - ${category.url}`);
      });
      process.exit(0);
    })
    .catch(error => {
      console.error('카테고리 발견 실패:', error);
      process.exit(1);
    });
} else {
  // 모듈로 사용될 때
  module.exports = discoverCategories;
}
