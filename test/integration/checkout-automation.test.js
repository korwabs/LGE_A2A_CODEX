const { expect } = require('@jest/globals');
const CheckoutAutomation = require('../../scripts/checkout/checkout-automation');
const BrowserController = require('../../scripts/controllers/browser-controller');
const Logger = require('../../scripts/utils/logger');
const config = require('../../config/default-config');

// 테스트 설정
const PRODUCT_URL = 'https://www.lge.com/br/refrigeradores/lg-gc-b257jvda';
const TEST_USER_INFO = {
  name: 'Test User',
  email: 'testuser@example.com',
  phone: '11-98765-4321',
  address: {
    street: 'Avenida Paulista',
    number: '1000',
    apartment: '502',
    city: 'São Paulo',
    state: 'SP',
    zipCode: '01310-100'
  },
  paymentMethod: 'creditCard'
};

describe('체크아웃 자동화 통합 테스트', () => {
  let checkoutAutomation;
  let browserController;
  let checkoutProcess;

  beforeAll(async () => {
    const testConfig = config.test || {};
    // 로깅 레벨 설정
    Logger.setLevel(testConfig.logLevel || 'error');

    // 브라우저 컨트롤러 및 체크아웃 자동화 인스턴스 생성
    browserController = new BrowserController({
      headless: true,
      ...(testConfig.browserOptions || {})
    });

    checkoutAutomation = new CheckoutAutomation({
      browserController,
      dataDir: testConfig.tempDataDir,
      ...(testConfig.checkoutOptions || {})
    });
  }, 30000);

  afterAll(async () => {
    // 리소스 정리
    if (browserController) {
      await browserController.close();
    }
  });

  test('체크아웃 프로세스 분석이 작동해야 함', async () => {
    // 제품 URL에서 체크아웃 프로세스 분석
    checkoutProcess = await checkoutAutomation.analyzeCheckoutProcess(PRODUCT_URL);
    
    // 체크아웃 프로세스가 필요한 모든 정보를 포함해야 함
    expect(checkoutProcess).toBeDefined();
    expect(checkoutProcess.steps).toBeInstanceOf(Array);
    expect(checkoutProcess.steps.length).toBeGreaterThan(0);
    
    // 첫 번째 단계에는 배송 정보 필드가 포함되어야 함
    const firstStep = checkoutProcess.steps[0];
    expect(firstStep.fields).toBeInstanceOf(Array);
    
    // 필드에 적절한 속성이 있는지 확인
    const addressField = firstStep.fields.find(field => 
      field.type === 'text' && field.id.includes('address'));
    
    expect(addressField).toBeDefined();
    expect(addressField.required).toBeDefined();
  }, 60000);

  test('사용자 정보를 체크아웃 필드에 매핑할 수 있어야 함', async () => {
    // 체크아웃 프로세스 로드 확인
    expect(checkoutProcess).toBeDefined();
    
    // 사용자 정보를 매핑하여 파라미터 생성
    const params = new URLSearchParams();
    await checkoutAutomation.mapUserInfoToParams(checkoutProcess, TEST_USER_INFO, params);
    
    // 파라미터가 올바르게 생성되었는지 확인
    expect(params.toString()).toBeTruthy();
    
    // 주소 정보가 포함되어 있어야 함
    expect(params.has('address') || 
          params.has('shipping.address') || 
          params.has('endereco')).toBeTruthy();
    
    // 우편번호 정보가 포함되어 있어야 함
    expect(params.has('zipCode') || 
          params.has('shipping.zipCode') || 
          params.has('cep')).toBeTruthy();
  });

  test('딥링크 생성이 작동해야 함', async () => {
    // 체크아웃 프로세스 로드 확인
    expect(checkoutProcess).toBeDefined();
    
    // 딥링크 생성
    const deeplink = await checkoutAutomation.generateDeeplink(TEST_USER_INFO);
    
    // 딥링크가 유효한 URL이어야 함
    expect(deeplink).toBeTruthy();
    expect(deeplink.startsWith('http')).toBeTruthy();
    
    // 사용자 정보 파라미터가 URL에 포함되어 있어야 함
    expect(deeplink).toContain('?');
    
    // 민감한 결제 정보는 URL에 포함되지 않아야 함
    expect(deeplink).not.toContain('cardNumber');
    expect(deeplink).not.toContain('cvv');
  });

  test('전체 체크아웃 프로세스 흐름이 작동해야 함', async () => {
    // 이 테스트는 실제 체크아웃을 수행하지 않고, 
    // 체크아웃 프로세스의 각 단계를 시뮬레이션합니다.
    
    // 1. 체크아웃 세션 시작
    const sessionId = await checkoutAutomation.startCheckoutSession(PRODUCT_URL);
    expect(sessionId).toBeTruthy();
    
    // 2. 첫 번째 단계 정보 요청
    const stepInfo = await checkoutAutomation.getNextRequiredFields(sessionId);
    expect(stepInfo).toBeDefined();
    expect(stepInfo.fields).toBeInstanceOf(Array);
    
    // 3. 첫 번째 단계 정보 제공
    const submitResult = await checkoutAutomation.submitStepInfo(sessionId, {
      address: TEST_USER_INFO.address.street,
      number: TEST_USER_INFO.address.number,
      apartment: TEST_USER_INFO.address.apartment,
      city: TEST_USER_INFO.address.city,
      state: TEST_USER_INFO.address.state,
      zipCode: TEST_USER_INFO.address.zipCode
    });
    
    expect(submitResult.success).toBeTruthy();
    expect(submitResult.nextStep).toBeDefined();
    
    // 4. 마지막 단계에서 딥링크 생성
    const finalStepResult = await checkoutAutomation.submitStepInfo(sessionId, {
      paymentMethod: TEST_USER_INFO.paymentMethod
    });
    
    expect(finalStepResult.success).toBeTruthy();
    expect(finalStepResult.deeplink).toBeTruthy();
    expect(finalStepResult.deeplink.startsWith('http')).toBeTruthy();
  }, 90000);
});
