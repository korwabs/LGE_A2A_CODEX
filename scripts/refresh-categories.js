/**
 * LG A2A 쇼핑 어시스턴트 카테고리 새로고침 스크립트
 * 기존에 발견된 카테고리의 최신 정보를 가져옵니다.
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
 * 카테고리 정보를 로드하는 함수
 * @returns {Array} 카테고리 배열
 */
function loadCategories() {
  const categoriesPath = path.join(dataDir, 'categories.json');
  
  if (fs.existsSync(categoriesPath)) {
    return JSON.parse(fs.readFileSync(categoriesPath, 'utf8'));
  }
  
  return [];
}

/**
 * 카테고리 정보를 새로고침하는 함수
 * @param {object} options 새로고침 옵션
 * @returns {Promise<Array>} 새로고침된 카테고리 배열
 */
async function refreshCategories(options = {}) {
  const { debug = false, force = false } = options;
  
  console.log('카테고리 정보 새로고침 시작');
  
  // 기존 카테고리 로드
  const existingCategories = loadCategories();
  
  if (existingCategories.length === 0) {
    console.log('기존 카테고리 정보가 없습니다. 새로운 카테고리를 발견해야 합니다.');
    throw new Error('No existing categories found');
  }
  
  console.log(`기존 카테고리: ${existingCategories.length}개`);
  
  // 강제 새로고침이 아니면 그대로 반환
  if (!force) {
    console.log('강제 새로고침이 아닙니다. 기존 카테고리를 반환합니다.');
    return existingCategories;
  }
  
  // 브라우저 컨트롤러 생성
  const browserController = new BrowserController({
    headless: !debug,
    slowMo: debug ? 100 : 50
  });
  
  // 새로고침된 카테고리 목록
  const refreshedCategories = [...existingCategories];
  
  try {
    // 브라우저 시작
    await browserController.launchBrowser();
    
    // 각 카테고리 정보 새로고침
    for (let i = 0; i < refreshedCategories.length; i++) {
      const category = refreshedCategories[i];
      
      try {
        console.log(`카테고리 ${i + 1}/${refreshedCategories.length} 새로고침: ${category.name}`);
        
        // 카테고리 URL 방문
        await browserController.executeAction('goToUrl', { url: category.url });
        
        // 현재 페이지에서 정보 추출
        const page = await browserController.getCurrentPage();
        
        // 카테고리 정보 업데이트
        const updatedInfo = await page.evaluate((categoryName) => {
          // 카테고리 제목 업데이트
          const titleElement = document.querySelector('h1, .category-title, .title');
          const title = titleElement ? titleElement.textContent.trim() : categoryName;
          
          // 카테고리 설명 추출
          const descriptionElement = document.querySelector('.category-description, .description');
          const description = descriptionElement ? descriptionElement.textContent.trim() : '';
          
          // 제품 수 추정
          const productElements = document.querySelectorAll('.product-item, .product-card, .product');
          const productCount = productElements.length;
          
          // 서브카테고리 추출
          const subCategoryElements = document.querySelectorAll('.subcategory a, .subcategories a');
          const subCategories = Array.from(subCategoryElements).map(el => ({
            name: el.textContent.trim(),
            url: el.href
          }));
          
          return {
            title,
            description,
            productCount,
            subCategories,
            lastRefreshed: new Date().toISOString()
          };
        }, category.name);
        
        // 카테고리 정보 업데이트
        refreshedCategories[i] = {
          ...category,
          name: updatedInfo.title || category.name,
          description: updatedInfo.description,
          productCount: updatedInfo.productCount,
          subCategories: updatedInfo.subCategories,
          lastRefreshed: updatedInfo.lastRefreshed
        };
        
        // 지연 추가 (서버 부하 방지)
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`카테고리 '${category.name}' 새로고침 중 오류:`, error.message);
        // 오류 발생 시에도 계속 진행, 기존 정보 유지
      }
    }
    
    // 새로고침된 카테고리 정보 저장
    fs.writeFileSync(
      path.join(dataDir, 'categories.json'),
      JSON.stringify(refreshedCategories, null, 2)
    );
    
    console.log(`카테고리 새로고침 완료: ${refreshedCategories.length}개 카테고리`);
    
    return refreshedCategories;
  } catch (error) {
    console.error('카테고리 새로고침 중 오류 발생:', error);
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
  const force = args.includes('--force') || args.includes('-f');
  
  // 카테고리 새로고침 실행
  refreshCategories({ debug, force })
    .then(categories => {
      console.log(`새로고침된 카테고리: ${categories.length}개`);
      process.exit(0);
    })
    .catch(error => {
      console.error('카테고리 새로고침 실패:', error);
      process.exit(1);
    });
} else {
  // 모듈로 사용될 때
  module.exports = refreshCategories;
}
