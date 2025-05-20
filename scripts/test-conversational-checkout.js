/**
 * 대화형 체크아웃 핸들러 테스트 스크립트
 */
require('dotenv').config();
const CheckoutAutomation = require('./checkout/checkout-automation');
const BrowserController = require('./controllers/browser-controller');
const ConversationalCheckoutHandler = require('./checkout/handlers/conversational-checkout-handler');
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

// 테스트할 제품 URL (LG 브라질 사이트)
const TEST_PRODUCT_URL = 'https://www.lge.com/br/tvs/lg-oled65c1';

// LLM 클라이언트 모의 객체
class MockLLMClient {
  /**
   * 컨텐츠를 생성합니다.
   * @param {string} systemPrompt - 시스템 프롬프트
   * @param {string} userPrompt - 사용자 프롬프트
   * @returns {Promise<string>} 생성된 텍스트
   */
  async generateContent(systemPrompt, userPrompt) {
    console.log('\n[LLM 시스템 프롬프트]:\n', systemPrompt);
    console.log('\n[LLM 사용자 프롬프트]:\n', userPrompt);
    
    // 시나리오별 응답 생성
    if (userPrompt.includes('다음 필드에 대한 정보를 수집해야 합니다')) {
      return '안녕하세요! LG OLED TV 구매를 위한 정보를 수집하고 있습니다. 배송지 주소를 알려주시겠어요? (Olá! Estamos coletando informações para a compra da sua TV LG OLED. Poderia me informar seu endereço de entrega?)';
    } else if (userPrompt.includes('수집된 정보를 요약하고, 체크아웃 준비가 완료되었음을 알리는 응답')) {
      return '모든 정보가 수집되었습니다! 다음 정보로 주문을 진행합니다:\n\n- 이름: João Silva\n- 이메일: joao.silva@example.com\n- 주소: Avenida Paulista 1000, Apto 502\n- 도시: São Paulo\n- 우편번호: 01310-100\n\n[안전한 결제 페이지로 이동] 링크를 클릭하시면 카드 정보만 입력하면 바로 구매가 완료됩니다. Obrigado pela preferência! (LG를 선택해 주셔서 감사합니다!)';
    } else {
      return '죄송합니다, 적절한 응답을 생성할 수 없습니다.';
    }
  }
  
  /**
   * 구조화된 컨텐츠를 생성합니다.
   * @param {string} systemPrompt - 시스템 프롬프트
   * @param {string} userPrompt - 사용자 프롬프트
   * @param {object} options - 구조화 옵션
   * @returns {Promise<object>} 생성된 객체
   */
  async generateContentStructured(systemPrompt, userPrompt, options) {
    console.log('\n[LLM 구조화 프롬프트]:\n', systemPrompt);
    console.log('\n[LLM 사용자 프롬프트]:\n', userPrompt);
    
    // 사용자 메시지에 따른 정보 추출
    if (userPrompt.includes('Avenida Paulista')) {
      return {
        address: 'Avenida Paulista 1000',
        complement: 'Apto 502',
        city: 'São Paulo',
        state: 'SP'
      };
    } else if (userPrompt.includes('01310-100')) {
      return {
        zipCode: '01310-100'
      };
    } else if (userPrompt.includes('joao.silva@example.com')) {
      return {
        name: 'João Silva',
        email: 'joao.silva@example.com'
      };
    } else if (userPrompt.includes('11987654321')) {
      return {
        phone: '11987654321'
      };
    } else {
      return {};
    }
  }
}

/**
 * 대화형 체크아웃 핸들러 테스트
 */
async function testConversationalCheckout() {
  console.log('=== 대화형 체크아웃 핸들러 테스트 시작 ===');
  
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
  
  // LLM 클라이언트 모의 객체 생성
  const llmClient = new MockLLMClient();
  
  // 대화형 체크아웃 핸들러 생성
  const checkoutHandler = new ConversationalCheckoutHandler({
    checkoutAutomation,
    llmClient
  });
  
  // 제품 ID 추출
  const productId = path.basename(TEST_PRODUCT_URL);
  
  try {
    // 1. 체크아웃 프로세스 분석 (이미 분석된 데이터가 없는 경우)
    const existingProcess = checkoutAutomation.loadCheckoutProcess(productId);
    
    if (!existingProcess) {
      console.log('\n1. 체크아웃 프로세스 분석 시작');
      await checkoutAutomation.analyzeCheckoutProcess(TEST_PRODUCT_URL, { detailed: true });
      console.log('✅ 체크아웃 프로세스 분석 완료');
    } else {
      console.log('\n1. 기존 체크아웃 프로세스 데이터 사용');
      console.log(`✅ URL: ${existingProcess.url}`);
    }
    
    // 2. 대화형 체크아웃 세션 시작
    console.log('\n2. 대화형 체크아웃 세션 시작');
    const startResult = await checkoutHandler.startCheckout('test-user-1', productId);
    
    console.log(`✅ 세션 ID: ${startResult.sessionId}`);
    console.log(`✅ 상태: ${startResult.state}`);
    console.log(`✅ 필수 필드 수: ${startResult.requiredFields.length}`);
    console.log(`✅ 누락된 필드 수: ${startResult.missingFields.length}`);
    console.log(`✅ 다음 프롬프트: ${startResult.nextPrompt}`);
    
    // 3. 사용자 메시지 처리 - 주소 정보
    console.log('\n3. 사용자 메시지 처리 - 주소 정보');
    const messageResult1 = await checkoutHandler.processMessage(
      'test-user-1',
      '제 주소는 Avenida Paulista 1000, Apto 502, São Paulo, SP입니다.'
    );
    
    console.log(`✅ 상태: ${messageResult1.state}`);
    console.log(`✅ 처리된 필드: ${messageResult1.processedFields?.join(', ')}`);
    console.log(`✅ 진행률: ${messageResult1.progress}%`);
    console.log(`✅ 다음 프롬프트: ${messageResult1.nextPrompt}`);
    
    // 4. 사용자 메시지 처리 - 우편번호
    console.log('\n4. 사용자 메시지 처리 - 우편번호');
    const messageResult2 = await checkoutHandler.processMessage(
      'test-user-1',
      '우편번호는 01310-100입니다.'
    );
    
    console.log(`✅ 상태: ${messageResult2.state}`);
    console.log(`✅ 처리된 필드: ${messageResult2.processedFields?.join(', ')}`);
    console.log(`✅ 진행률: ${messageResult2.progress}%`);
    console.log(`✅ 다음 프롬프트: ${messageResult2.nextPrompt}`);
    
    // 5. 사용자 메시지 처리 - 이름 및 이메일
    console.log('\n5. 사용자 메시지 처리 - 이름 및 이메일');
    const messageResult3 = await checkoutHandler.processMessage(
      'test-user-1',
      '제 이름은 João Silva이고, 이메일은 joao.silva@example.com입니다.'
    );
    
    console.log(`✅ 상태: ${messageResult3.state}`);
    console.log(`✅ 처리된 필드: ${messageResult3.processedFields?.join(', ')}`);
    console.log(`✅ 진행률: ${messageResult3.progress}%`);
    console.log(`✅ 다음 프롬프트: ${messageResult3.nextPrompt}`);
    
    // 6. 사용자 메시지 처리 - 전화번호 (마지막 필수 정보)
    console.log('\n6. 사용자 메시지 처리 - 전화번호');
    const messageResult4 = await checkoutHandler.processMessage(
      'test-user-1',
      '전화번호는 11987654321입니다.'
    );
    
    console.log(`✅ 상태: ${messageResult4.state}`);
    
    if (messageResult4.state === 'ready_for_checkout') {
      console.log(`✅ 딥링크: ${messageResult4.deeplink}`);
      console.log(`✅ 최종 프롬프트: ${messageResult4.nextPrompt}`);
      
      // 7. 체크아웃 완료
      console.log('\n7. 체크아웃 완료');
      const completeResult = await checkoutHandler.completeCheckout('test-user-1');
      
      console.log(`✅ 상태: ${completeResult.state}`);
      console.log(`✅ 세션 ID: ${completeResult.sessionId}`);
    } else {
      console.log(`❌ 예상과 다른 상태: ${messageResult4.state}`);
      console.log(`❌ 에러 메시지: ${messageResult4.error || '없음'}`);
    }
    
    // 활성 세션 확인
    console.log('\n활성 세션 목록:');
    const activeSessions = checkoutHandler.getActiveSessions();
    console.log(`총 ${activeSessions.length}개 세션`);
    
    return true;
  } catch (error) {
    console.error('❌ 대화형 체크아웃 테스트 중 오류 발생:', error);
    return false;
  }
}

/**
 * 메인 함수
 */
async function main() {
  console.log('LG A2A 쇼핑 어시스턴트 대화형 체크아웃 테스트');
  console.log(`모드: ${isDebug ? '디버그' : '일반'}`);
  
  try {
    const result = await testConversationalCheckout();
    console.log(`\n테스트 ${result ? '성공' : '실패'}`);
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
    testConversationalCheckout
  };
}
