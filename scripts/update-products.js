/**
 * LG A2A 쇼핑 어시스턴트 제품 정보 업데이트 스크립트
 * 이미 크롤링된 제품의 가격과 재고 정보를 갱신합니다.
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

// 명령줄 인자 확인
const args = process.argv.slice(2);
const isDebug = args.includes('--debug') || process.env.DEBUG_MODE === 'true';
const isForce = args.includes('--force');
const isAll = args.includes('--all');

/**
 * 업데이트할 제품 목록을 로드하는 함수
 * @returns {Promise<Array>} 제품 목록
 */
async function loadProductsToUpdate() {
  try {
    // 모든 제품 데이터 파일
    const allProductsPath = path.join(dataDir, 'all-products.json');
    
    if (fs.existsSync(allProductsPath)) {
      console.log('통합 제품 데이터 파일에서 제품 로드');
      return JSON.parse(fs.readFileSync(allProductsPath, 'utf8'));
    }
    
    // 개별 제품 파일들 검색
    console.log('개별 제품 파일에서 제품 로드');
    const productFiles = fs.readdirSync(dataDir)
      .filter(file => file.startsWith('product_') && file.endsWith('.json'));
    
    const products = [];
    for (const file of productFiles) {
      const productData = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
      products.push(productData);
    }
    
    return products;
  } catch (error) {
    console.error('제품 목록 로드 중 오류 발생:', error);
    return [];
  }
}

/**
 * 제품 정보 업데이트 함수
 * @param {boolean} updateAll 모든 제품 업데이트 여부
 * @returns {Promise<object>} 업데이트 결과
 */
async function updateProductsInfo(updateAll = false) {
  console.log('제품 정보 업데이트 시작');
  
  try {
    // 크롤링 매니저 인스턴스 생성
    const crawlingManager = new CrawlingManager({
      browserOptions: {
        headless: !isDebug,
        slowMo: isDebug ? 100 : 50
      },
      maxRetries: 2,
      maxConcurrency: 3,
      dataDir
    });
    
    // 업데이트할 제품 목록 로드
    let products = await loadProductsToUpdate();
    console.log(`로드된 제품 수: ${products.length}개`);
    
    if (products.length === 0) {
      console.log('업데이트할 제품이 없습니다.');
      return { updated: 0, unchanged: 0, errors: 0 };
    }
    
    // 모든 제품을 업데이트하지 않는 경우, 우선순위 부여
    if (!updateAll && !isAll) {
      // 마지막 업데이트 시간 기준으로 정렬 (오래된 것부터)
      products.sort((a, b) => {
        const aTime = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
        const bTime = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
        return aTime - bTime;
      });
      
      // 업데이트할 제품 수 제한
      const maxProducts = process.env.MAX_UPDATE_PRODUCTS ? 
        parseInt(process.env.MAX_UPDATE_PRODUCTS) : 20;
      
      products = products.slice(0, maxProducts);
      console.log(`업데이트 대상: ${products.length}개 제품 (가장 오래된 것부터)`);
    } else {
      console.log(`모든 제품(${products.length}개) 업데이트`);
    }
    
    // 제품 정보 업데이트
    const result = await crawlingManager.updateProductsInfo(products);
    
    console.log('제품 정보 업데이트 완료:');
    console.log(`- 업데이트됨: ${result.updated}개`);
    console.log(`- 변경 없음: ${result.unchanged}개`);
    console.log(`- 오류 발생: ${result.errors}개`);
    
    return result;
  } catch (error) {
    console.error('제품 정보 업데이트 중 오류 발생:', error);
    throw error;
  }
}

/**
 * 메인 실행 함수
 */
async function main() {
  console.log('LG 브라질 제품 정보 업데이트 시작');
  console.log(`모드: ${isDebug ? '디버그' : '일반'}, ${isForce || isAll ? '전체 업데이트' : '부분 업데이트'}`);
  
  try {
    const result = await updateProductsInfo(isForce || isAll);
    
    console.log('\n제품 정보 업데이트가 완료되었습니다.');
    process.exit(0);
  } catch (error) {
    console.error('제품 정보 업데이트 실행 중 오류 발생:', error);
    process.exit(1);
  }
}

// 스크립트 실행
if (require.main === module) {
  main();
} else {
  module.exports = {
    updateProductsInfo
  };
}
