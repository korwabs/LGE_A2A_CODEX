/**
 * 개선된 체크아웃 자동화 테스트 스크립트
 */
require('dotenv').config();
const CheckoutAutomation = require('./checkout/checkout-automation');
const BrowserController = require('./controllers/browser-controller');
const config = require('./config/default-config');
const path = require('path');
const fs = require('fs');

// 데이터 디렉토리 확인 및 생성
const dataDir = path.resolve(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 디버그 모드 확인
const isDebug = process.argv.includes('--debug');
const isDetailed = process.argv.includes('--detailed');

// 테스트할 제품 URL (LG 브라질 사이트)
const TEST_URLS = [
  'https://www.lge.com/br/tvs/lg-oled65c1',
  'https://www.lge.com/br/celulares/lg-k62'
];

// 테스트할 제품 URL 선택
const TEST_PRODUCT_URL = process.argv[2] || TEST_URLS[0];

// 테스트 사용자 정보
const TEST_USER_INFO = {
  name: 'João Silva',
  email: 'joao.silva@example.com',
  phone: '11987654321',
  address: 'Avenida Paulista 1000',
  complement: 'Apto 502',
  neighborhood: 'Bela Vista',
  city: 'São Paulo',
  state: 'SP',
  zipCode: '01310-100',
  country: 'Brasil',
  paymentMethod: 'credit',
  shippingMethod: 'standard'
};

/**
 * 체크아웃 프로세스 분석 테스트
 * @param {CheckoutAutomation} checkoutAutomation - 체크아웃 자동화 인스턴스
 * @returns {Promise<boolean>} 테스트 성공 여부
 */
async function testCheckoutProcessAnalysis(checkoutAutomation) {
  console.log(`\n1. 체크아웃 프로세스 분석: ${TEST_PRODUCT_URL}`);
  console.log('---------------------------------------');
  
  try {
    // 체크아웃 프로세스 분석
    const checkoutProcess = await checkoutAutomation.analyzeCheckoutProcess(TEST_PRODUCT_URL, {
      detailed: isDetailed,
      maxDepth: 3
    });
    
    if (checkoutProcess) {
      console.log('✅ 체크아웃 프로세스 분석 성공:');
      console.log(`  - URL: ${checkoutProcess.url}`);
      console.log(`  - 제목: ${checkoutProcess.title}`);
      console.log(`  - 폼 수: ${checkoutProcess.forms?.length || 0}개`);
      
      // 폼 필드 정보 출력
      let totalFields = 0;
      let requiredFields = 0;
      
      if (checkoutProcess.forms && checkoutProcess.forms.length > 0) {
        checkoutProcess.forms.forEach((form, formIndex) => {
          console.log(`  - 폼 #${formIndex + 1}: ${form.fields?.length || 0}개 필드`);
          
          if (form.fields && form.fields.length > 0) {
            totalFields += form.fields.length;
            
            form.fields.forEach(field => {
              if (field.required) {
                requiredFields++;
              }
            });
          }
        });
      }
      
      console.log(`  - 총 필드 수: ${totalFields}개 (필수 필드: ${requiredFields}개)`);
      
      // 다음 단계 존재 여부 확인
      let nextStep = checkoutProcess.nextStep;
      let stepCount = 1;
      
      while (nextStep) {
        stepCount++;
        console.log(`  - 단계 ${stepCount}: ${nextStep.url}`);
        console.log(`    - 폼 수: ${nextStep.forms?.length || 0}개`);
        
        // 이 단계의 폼 필드 정보 출력
        let stepTotalFields = 0;
        let stepRequiredFields = 0;
        
        if (nextStep.forms && nextStep.forms.length > 0) {
          nextStep.forms.forEach(form => {
            if (form.fields && form.fields.length > 0) {
              stepTotalFields += form.fields.length;
              
              form.fields.forEach(field => {
                if (field.required) {
                  stepRequiredFields++;
                }
              });
            }
          });
        }
        
        console.log(`    - 총 필드 수: ${stepTotalFields}개 (필수 필드: ${stepRequiredFields}개)`);
        
        // 다음 단계 설정
        nextStep = nextStep.nextStep;
      }
      
      console.log(`  - 총 단계 수: ${stepCount}개`);
      
      return true;
    } else {
      console.log('❌ 체크아웃 프로세스 분석 실패');
      return false;
    }
  } catch (error) {
    console.error('❌ 체크아웃 프로세스 분석 중 오류 발생:', error);
    return false;
  }
}

/**
 * 필드 매핑 및 세션 관리 테스트
 * @param {CheckoutAutomation} checkoutAutomation - 체크아웃 자동화 인스턴스
 * @returns {Promise<boolean>} 테스트 성공 여부
 */
async function testFieldMappingAndSession(checkoutAutomation) {
  console.log('\n2. 필드 매핑 및 세션 관리 테스트');
  console.log('---------------------------------------');
  
  try {
    // 제품 ID 추출
    const productId = path.basename(TEST_PRODUCT_URL);
    
    // 체크아웃 세션 생성
    const sessionId = checkoutAutomation.createCheckoutSession('test-user', productId);
    console.log(`✅ 체크아웃 세션 생성 성공: ${sessionId}`);
    
    // 현재 단계에 필요한 필드 확인
    const requiredFields = checkoutAutomation.getRequiredFieldsForSession(sessionId);
    console.log(`✅ 현재 단계 필수 필드: ${requiredFields.length}개`);
    
    if (requiredFields.length > 0) {
      console.log('  필수 필드 샘플:');
      requiredFields.slice(0, 3).forEach(field => {
        console.log(`  - ${field.name} (${field.type}): ${field.label || '라벨 없음'}`);
      });
      
      if (requiredFields.length > 3) {
        console.log(`  - ... 그 외 ${requiredFields.length - 3}개`);
      }
    }
    
    // 사용자 정보 업데이트
    const updateResult = checkoutAutomation.updateSessionInfo(sessionId, TEST_USER_INFO);
    console.log(`✅ 세션 정보 업데이트: ${updateResult ? '성공' : '실패'}`);
    
    // 누락된 필드 확인
    const missingFields = checkoutAutomation.getMissingFields(sessionId);
    console.log(`✅ 누락된 필드: ${missingFields.length}개`);
    
    if (missingFields.length > 0) {
      console.log('  누락된 필드 목록:');
      missingFields.forEach(field => {
        console.log(`  - ${field.name} (${field.type}): ${field.label || '라벨 없음'}`);
      });
    }
    
    // 딥링크 생성
    const deeplinkResult = checkoutAutomation.generateDeeplinkFromSession(sessionId);
    
    if (deeplinkResult.success) {
      console.log(`✅ 딥링크 생성 성공: ${deeplinkResult.hasAllRequiredInfo ? '모든 필수 정보 포함' : '일부 정보 누락'}`);
      console.log(`  딥링크: ${deeplinkResult.url}`);
    } else {
      console.log(`❌ 딥링크 생성 실패: ${deeplinkResult.error}`);
    }
    
    return true;
  } catch (error) {
    console.error('❌ 필드 매핑 및 세션 관리 테스트 중 오류 발생:', error);
    return false;
  }
}

/**
 * 직접 딥링크 생성 테스트
 * @param {CheckoutAutomation} checkoutAutomation - 체크아웃 자동화 인스턴스
 * @returns {Promise<boolean>} 테스트 성공 여부
 */
async function testDirectDeeplinkGeneration(checkoutAutomation) {
  console.log('\n3. 직접 딥링크 생성 테스트');
  console.log('---------------------------------------');
  
  try {
    // 제품 ID 추출
    const productId = path.basename(TEST_PRODUCT_URL);
    
    // 직접 딥링크 생성
    const deeplink = checkoutAutomation.generateDeeplink(productId, TEST_USER_INFO);
    console.log(`✅ 직접 딥링크 생성 성공: ${deeplink}`);
    
    // 링크의 URL 파라미터 확인
    const url = new URL(deeplink);
    const params = url.searchParams;
    
    console.log('  URL 파라미터:');
    let paramCount = 0;
    
    for (const [key, value] of params.entries()) {
      if (paramCount < 5) {
        console.log(`  - ${key}: ${value}`);
      }
      paramCount++;
    }
    
    if (paramCount > 5) {
      console.log(`  - ... 그 외 ${paramCount - 5}개 파라미터`);
    }
    
    return true;
  } catch (error) {
    console.error('❌ 직접 딥링크 생성 테스트 중 오류 발생:', error);
    return false;
  }
}

/**
 * 프로세스 데이터 저장 및 로드 테스트
 * @param {CheckoutAutomation} checkoutAutomation - 체크아웃 자동화 인스턴스
 * @returns {Promise<boolean>} 테스트 성공 여부
 */
async function testProcessDataStorage(checkoutAutomation) {
  console.log('\n4. 프로세스 데이터 저장 및 로드 테스트');
  console.log('---------------------------------------');
  
  try {
    // 제품 ID 추출
    const productId = path.basename(TEST_PRODUCT_URL);
    
    // 체크아웃 프로세스 데이터 로드
    const checkoutProcess = checkoutAutomation.loadCheckoutProcess(productId);
    
    if (checkoutProcess) {
      console.log('✅ 체크아웃 프로세스 데이터 로드 성공:');
      console.log(`  - URL: ${checkoutProcess.url}`);
      console.log(`  - 캡처 시간: ${checkoutProcess.capturedAt}`);
      
      // 제품 정보 출력
      if (checkoutProcess.productInfo) {
        console.log('  - 제품 정보:');
        Object.entries(checkoutProcess.productInfo).forEach(([key, value]) => {
          if (typeof value === 'string' && value.length <= 50) {
            console.log(`    - ${key}: ${value}`);
          } else if (typeof value === 'string') {
            console.log(`    - ${key}: ${value.substring(0, 47)}...`);
          }
        });
      }
    } else {
      console.log('❌ 체크아웃 프로세스 데이터 로드 실패');
      return false;
    }
    
    // 최근 체크아웃 프로세스 가져오기
    const recentProcesses = checkoutAutomation.getRecentCheckoutProcesses(3);
    console.log(`✅ 최근 체크아웃 프로세스: ${recentProcesses.length}개`);
    
    recentProcesses.forEach((process, index) => {
      console.log(`  - 프로세스 #${index + 1}: ${process.url} (${process.capturedAt})`);
    });
    
    return true;
  } catch (error) {
    console.error('❌ 프로세스 데이터 저장 및 로드 테스트 중 오류 발생:', error);
    return false;
  }
}

/**
 * 체크아웃 자동화 종합 테스트
 */
async function testCheckoutAutomation() {
  console.log('=== 체크아웃 자동화 테스트 시작 ===');
  console.log(`모드: ${isDebug ? '디버그' : '일반'}, 상세 분석: ${isDetailed ? '예' : '아니오'}`);
  console.log(`테스트 제품 URL: ${TEST_PRODUCT_URL}`);
  
  // 브라우저 컨트롤러 생성
  const browserController = new BrowserController({
    browserOptions: {
      headless: !isDebug,
      slowMo: isDebug ? 100 : 50
    }
  });
  
  // 체크아웃 자동화 인스턴스 생성
  const checkoutAutomation = new CheckoutAutomation({
    dataDir,
    browserController
  });
  
  try {
    // 테스트 1: 체크아웃 프로세스 분석
    const analysisResult = await testCheckoutProcessAnalysis(checkoutAutomation);
    
    // 테스트 2: 필드 매핑 및 세션 관리
    const mappingResult = await testFieldMappingAndSession(checkoutAutomation);
    
    // 테스트 3: 직접 딥링크 생성
    const deeplinkResult = await testDirectDeeplinkGeneration(checkoutAutomation);
    
    // 테스트 4: 프로세스 데이터 저장 및 로드
    const storageResult = await testProcessDataStorage(checkoutAutomation);
    
    // 테스트 결과 종합
    console.log('\n=== 체크아웃 자동화 테스트 결과 ===');
    console.log(`1. 체크아웃 프로세스 분석: ${analysisResult ? '✅ 성공' : '❌ 실패'}`);
    console.log(`2. 필드 매핑 및 세션 관리: ${mappingResult ? '✅ 성공' : '❌ 실패'}`);
    console.log(`3. 직접 딥링크 생성: ${deeplinkResult ? '✅ 성공' : '❌ 실패'}`);
    console.log(`4. 프로세스 데이터 저장 및 로드: ${storageResult ? '✅ 성공' : '❌ 실패'}`);
    
    const overallResult = analysisResult && mappingResult && deeplinkResult && storageResult;
    console.log(`\n종합 결과: ${overallResult ? '✅ 성공' : '❌ 실패'}`);
    
    return overallResult;
  } catch (error) {
    console.error('\n❌ 테스트 실행 중 오류 발생:', error);
    return false;
  }
}

/**
 * 메인 함수
 */
async function main() {
  console.log('LG A2A 쇼핑 어시스턴트 체크아웃 자동화 테스트');
  
  try {
    const result = await testCheckoutAutomation();
    process.exit(result ? 0 : 1);
  } catch (error) {
    console.error('테스트 실행 중 치명적인 오류 발생:', error);
    process.exit(1);
  }
}

// 스크립트 실행
if (require.main === module) {
  main();
} else {
  module.exports = {
    testCheckoutAutomation
  };
}
