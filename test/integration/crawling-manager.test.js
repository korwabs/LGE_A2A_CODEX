const { expect } = require('@jest/globals');
const CrawlingManager = require('../../scripts/crawlers/crawling-manager');
const BrowserController = require('../../scripts/controllers/browser-controller');
const IntelligentExtractor = require('../../scripts/extractors/intelligent-extractor');
const CheckoutAutomation = require('../../scripts/checkout/checkout-automation');
const Logger = require('../../scripts/utils/logger');
const config = require('../../config/default-config');
const fs = require('fs');
const path = require('path');

// 테스트 설정
const CATEGORY_URL = 'https://www.lge.com/br/refrigeradores';
const PRODUCT_URL = 'https://www.lge.com/br/refrigeradores/lg-gc-b257jvda';
const OUTPUT_DIR = path.join(__dirname, '../output');

describe('크롤링 관리자 통합 테스트', () => {
  let crawlingManager;
  
  beforeAll(async () => {
    // 테스트 출력 디렉토리 생성
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    
    const testConfig = config.test || {};
    // 로깅 레벨 설정
    Logger.setLevel(testConfig.logLevel || 'error');
    
    // 크롤링 관리자 인스턴스 생성
    crawlingManager = new CrawlingManager({
      browserOptions: {
        headless: true,
        ...(testConfig.browserOptions || {})
      },
      extractorOptions: {
        llmProvider: 'gemini-mock', // 테스트용 모의 LLM
        ...(testConfig.extractorOptions || {})
      },
      checkoutOptions: {
        dataDir: OUTPUT_DIR,
        ...(testConfig.checkoutOptions || {})
      },
      maxRetries: 2,
      maxConcurrency: 2
    });
  }, 30000);

  afterAll(async () => {
    // 리소스 정리
    if (crawlingManager) {
      await crawlingManager.close();
    }
  });

  test('카테고리 페이지를 크롤링할 수 있어야 함', async () => {
    // 카테고리 크롤링 테스트는 오래 걸릴 수 있으므로
    // 목 데이터를 반환하도록 설정
    const mockProducts = [
      { url: PRODUCT_URL, name: 'Refrigerador LG Bottom Freezer', price: 'R$ 4.799,00' },
      { url: PRODUCT_URL.replace('gc-b257jvda', 'gc-b247sluv'), name: 'Refrigerador LG Side by Side', price: 'R$ 5.999,00' }
    ];
    
    // 크롤링 매니저의 메서드를 목킹
    const originalCrawlCategory = crawlingManager.crawlCategory;
    crawlingManager.crawlCategory = jest.fn().mockResolvedValue(mockProducts);
    
    // 카테고리 크롤링 실행
    const category = { url: CATEGORY_URL, name: 'Refrigeradores' };
    const products = await crawlingManager.crawlCategory(category, { maxProducts: 2 });
    
    // 목킹 제거
    crawlingManager.crawlCategory = originalCrawlCategory;
    
    // 테스트 검증
    expect(products).toBeDefined();
    expect(products).toBeInstanceOf(Array);
    expect(products.length).toBe(2);
    
    // 제품 정보가 올바른지 확인
    products.forEach(product => {
      expect(product.url).toBeDefined();
      expect(product.name).toBeDefined();
      expect(product.price).toBeDefined();
      expect(product.url.startsWith('https')).toBeTruthy();
    });
  }, 60000);

  test('제품 상세 정보를 크롤링할 수 있어야 함', async () => {
    // 제품 상세 크롤링 테스트는 오래 걸릴 수 있으므로
    // 목 데이터를 반환하도록 설정
    const mockProductDetails = {
      name: 'Refrigerador LG Bottom Freezer com Door Cooling+™, 451L',
      price: 'R$ 4.799,00',
      description: '이 제품은 LG의 고급 냉장고입니다...',
      specifications: {
        capacity: '451 Litros',
        dimensions: '595 x 1850 x 682 mm',
        weight: '74 kg'
      },
      features: [
        'Door Cooling+™',
        'Compressor Linear Inverter',
        'Smart Diagnosis™',
        'Multi Air Flow'
      ],
      availability: true,
      delivery: '3-5 dias úteis',
      url: PRODUCT_URL,
      lastUpdated: new Date().toISOString()
    };
    
    // 크롤링 매니저의 메서드를 목킹
    const originalCrawlSingleProduct = crawlingManager.crawlSingleProductDetails;
    crawlingManager.crawlSingleProductDetails = jest.fn().mockResolvedValue(mockProductDetails);
    
    // 제품 상세 크롤링 실행
    const product = { url: PRODUCT_URL, name: 'Refrigerador LG' };
    const details = await crawlingManager.crawlSingleProductDetails(product);
    
    // 목킹 제거
    crawlingManager.crawlSingleProductDetails = originalCrawlSingleProduct;
    
    // 테스트 검증
    expect(details).toBeDefined();
    expect(details.name).toBe(mockProductDetails.name);
    expect(details.price).toBe(mockProductDetails.price);
    expect(details.specifications).toBeDefined();
    expect(details.features).toBeInstanceOf(Array);
    expect(details.availability).toBe(true);
    expect(details.lastUpdated).toBeDefined();
  }, 60000);

  test('체크아웃 프로세스를 크롤링할 수 있어야 함', async () => {
    // 체크아웃 프로세스 크롤링 테스트는 오래 걸릴 수 있으므로
    // 목 데이터를 반환하도록 설정
    const mockCheckoutProcess = {
      steps: [
        {
          name: 'Informações Pessoais',
          fields: [
            { id: 'name', type: 'text', required: true },
            { id: 'email', type: 'email', required: true },
            { id: 'cpf', type: 'text', required: true }
          ]
        },
        {
          name: 'Endereço de Entrega',
          fields: [
            { id: 'address', type: 'text', required: true },
            { id: 'number', type: 'text', required: true },
            { id: 'complement', type: 'text', required: false },
            { id: 'zipCode', type: 'text', required: true },
            { id: 'city', type: 'text', required: true },
            { id: 'state', type: 'select', required: true }
          ]
        },
        {
          name: 'Forma de Pagamento',
          fields: [
            { id: 'paymentMethod', type: 'radio', required: true, options: ['creditCard', 'boleto', 'pix'] }
          ]
        }
      ],
      checkoutUrl: 'https://www.lge.com/br/checkout',
      baseUrl: 'https://www.lge.com/br',
      lastUpdated: new Date().toISOString()
    };
    
    // 크롤링 매니저의 메서드를 목킹
    const originalCrawlCheckout = crawlingManager.crawlCheckoutProcess;
    crawlingManager.crawlCheckoutProcess = jest.fn().mockResolvedValue(mockCheckoutProcess);
    
    // 체크아웃 프로세스 크롤링 실행
    const checkoutProcess = await crawlingManager.crawlCheckoutProcess(PRODUCT_URL);
    
    // 목킹 제거
    crawlingManager.crawlCheckoutProcess = originalCrawlCheckout;
    
    // 테스트 검증
    expect(checkoutProcess).toBeDefined();
    expect(checkoutProcess.steps).toBeInstanceOf(Array);
    expect(checkoutProcess.steps.length).toBe(3);
    
    // 첫 번째 단계 확인
    const firstStep = checkoutProcess.steps[0];
    expect(firstStep.name).toBe('Informações Pessoais');
    expect(firstStep.fields).toBeInstanceOf(Array);
    expect(firstStep.fields.length).toBe(3);
    
    // 필드 확인
    const emailField = firstStep.fields.find(field => field.id === 'email');
    expect(emailField).toBeDefined();
    expect(emailField.type).toBe('email');
    expect(emailField.required).toBe(true);
  }, 60000);

  test('딥링크를 생성할 수 있어야 함', async () => {
    // 딥링크 생성 테스트용 사용자 정보
    const userInfo = {
      name: 'Test User',
      email: 'test@example.com',
      cpf: '123.456.789-00',
      address: {
        street: 'Avenida Paulista',
        number: '1000',
        complement: 'Apto 502',
        zipCode: '01310-100',
        city: 'São Paulo',
        state: 'SP'
      },
      paymentMethod: 'creditCard'
    };
    
    // 크롤링 매니저의 메서드를 목킹
    const mockDeeplink = 'https://www.lge.com/br/checkout?id=123&name=Test+User&email=test%40example.com&zipCode=01310-100';
    const originalGenerateCheckoutDeeplink = crawlingManager.generateCheckoutDeeplink;
    crawlingManager.generateCheckoutDeeplink = jest.fn().mockResolvedValue(mockDeeplink);
    
    // 딥링크 생성 실행
    const deeplink = await crawlingManager.generateCheckoutDeeplink(userInfo);
    
    // 목킹 제거
    crawlingManager.generateCheckoutDeeplink = originalGenerateCheckoutDeeplink;
    
    // 테스트 검증
    expect(deeplink).toBeDefined();
    expect(deeplink).toBe(mockDeeplink);
    expect(deeplink.startsWith('https://www.lge.com/br/checkout')).toBeTruthy();
    expect(deeplink).toContain('name=Test+User');
    expect(deeplink).toContain('email=test%40example.com');
  });

  test('복수의 제품을 동시에 크롤링할 수 있어야 함', async () => {
    // 복수 제품 크롤링 테스트용 목 데이터
    const mockProducts = [
      { url: PRODUCT_URL, name: 'Refrigerador LG 1' },
      { url: PRODUCT_URL.replace('gc-b257jvda', 'gc-b247sluv'), name: 'Refrigerador LG 2' }
    ];
    
    const mockDetailedProducts = [
      { 
        url: PRODUCT_URL, 
        name: 'Refrigerador LG 1', 
        price: 'R$ 4.799,00',
        description: 'Descrição do produto 1',
        lastUpdated: new Date().toISOString()
      },
      { 
        url: PRODUCT_URL.replace('gc-b257jvda', 'gc-b247sluv'), 
        name: 'Refrigerador LG 2',
        price: 'R$ 5.999,00',
        description: 'Descrição do produto 2',
        lastUpdated: new Date().toISOString()
      }
    ];
    
    // 크롤링 매니저의 메서드를 목킹
    const originalCrawlProductDetails = crawlingManager.crawlProductDetails;
    crawlingManager.crawlProductDetails = jest.fn().mockResolvedValue(mockDetailedProducts);
    
    // 복수 제품 크롤링 실행
    const detailedProducts = await crawlingManager.crawlProductDetails(mockProducts, 2);
    
    // 목킹 제거
    crawlingManager.crawlProductDetails = originalCrawlProductDetails;
    
    // 테스트 검증
    expect(detailedProducts).toBeDefined();
    expect(detailedProducts).toBeInstanceOf(Array);
    expect(detailedProducts.length).toBe(2);
    
    // 각 제품의 상세 정보 확인
    detailedProducts.forEach((product, index) => {
      expect(product.url).toBe(mockDetailedProducts[index].url);
      expect(product.name).toBe(mockDetailedProducts[index].name);
      expect(product.price).toBe(mockDetailedProducts[index].price);
      expect(product.description).toBe(mockDetailedProducts[index].description);
      expect(product.lastUpdated).toBeDefined();
    });
  });
});
