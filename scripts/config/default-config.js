/**
 * 기본 설정 - 프로젝트 전역 설정 정보
 */
module.exports = {
  // 브라우저 설정
  browser: {
    // 브라우저 옵션
    headless: process.env.HEADLESS !== 'false', // 환경 변수로 헤드리스 모드 제어
    slowMo: parseInt(process.env.SLOW_MO || '50', 10),
    timeout: parseInt(process.env.BROWSER_TIMEOUT || '30000', 10),
    defaultViewport: {
      width: 1280,
      height: 800
    },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
    
    // 지역화 설정 (브라질)
    locale: 'pt-BR',
    geolocation: {
      longitude: -46.6333,
      latitude: -23.5505 // 브라질 상파울루 좌표
    },
    
    // 자원 제한
    maxConcurrentBrowsers: parseInt(process.env.MAX_CONCURRENT_BROWSERS || '5', 10),
    maxConcurrentPages: parseInt(process.env.MAX_CONCURRENT_PAGES || '10', 10)
  },
  
  // 크롤링 설정
  crawling: {
    // 재시도 설정
    maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
    initialDelay: parseInt(process.env.INITIAL_DELAY || '1000', 10),
    maxDelay: parseInt(process.env.MAX_DELAY || '30000', 10),
    
    // 병렬 처리 설정
    maxConcurrency: parseInt(process.env.MAX_CONCURRENCY || '5', 10),
    
    // 데이터 저장 설정
    dataDir: process.env.DATA_DIR || './data',
    
    // 크롤링 제한
    maxProductsPerCategory: parseInt(process.env.CRAWL_MAX_PRODUCTS_PER_CATEGORY || process.env.MAX_PRODUCTS_PER_CATEGORY || '30', 10),
    maxCategoriesPerRun: parseInt(process.env.CRAWL_MAX_CATEGORIES || process.env.MAX_CATEGORIES_PER_RUN || '10', 10),
    
    // 크롤링 간격 (밀리초)
    pageCrawlDelay: parseInt(process.env.PAGE_CRAWL_DELAY || '1000', 10),
    categoryDelay: parseInt(process.env.CATEGORY_DELAY || '5000', 10),
    batchDelay: parseInt(process.env.BATCH_DELAY || '2000', 10),
    
    // 카테고리 새로고침 설정
    refreshCategories: process.env.REFRESH_CATEGORIES === 'true'
  },
  
  // LLM 설정
  llm: {
    provider: process.env.LLM_PROVIDER || 'google',
    model: process.env.LLM_MODEL || 'gemini-pro',
    credentials: {
      // Google Vertex AI 설정
      project: process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_PROJECT_ID,
      location: process.env.GOOGLE_CLOUD_LOCATION || process.env.GOOGLE_LOCATION || 'us-central1',
      
      // OpenAI 설정
      openai: {
        apiKey: process.env.OPENAI_API_KEY,
        organization: process.env.OPENAI_ORGANIZATION
      },
      
      // Anthropic 설정
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY
      },
      
      // 일반 API 키 설정 (필요한 경우)
      apiKey: process.env.LLM_API_KEY || process.env.GEMINI_API_KEY
    },
    
    // 모델 파라미터
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.2'),
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '1024', 10),
    topP: parseFloat(process.env.LLM_TOP_P || '0.8'),
    topK: parseInt(process.env.LLM_TOP_K || '40', 10),
    
    // 추출 관련 설정
    chunkSize: parseInt(process.env.EXTRACTION_CHUNK_SIZE || process.env.CHUNK_SIZE || '4000', 10),
    maxParallelChunks: parseInt(process.env.MAX_PARALLEL_CHUNKS || '3', 10),
    
    // 캐싱 설정
    useCache: process.env.USE_EXTRACTION_CACHE !== 'false',
    cacheTTL: parseInt(process.env.EXTRACTION_CACHE_TTL || '86400000', 10) // 기본 24시간
  },
  
  // 체크아웃 설정
  checkout: {
    // 체크아웃 프로세스 데이터 저장 경로
    checkoutProcessFile: process.env.CHECKOUT_PROCESS_FILE || './data/checkout-process.json',
    
    // 사용자 정보 (테스트 데이터)
    testUserInfo: {
      name: 'Teste Usuario',
      email: 'teste@exemplo.com',
      phone: '11987654321',
      address: 'Avenida Paulista, 1000',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01310-100',
      country: 'Brasil',
      paymentMethod: 'credit'
    }
  },
  
  // 외부 서비스 설정
  services: {
    // Algolia 설정
    algolia: {
      appId: process.env.ALGOLIA_APP_ID,
      apiKey: process.env.ALGOLIA_API_KEY,
      indexName: process.env.ALGOLIA_INDEX_NAME || 'lge_products'
    },
    
    // Firebase 설정
    firebase: {
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN,
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.FIREBASE_APP_ID
    },
    
    // Intercom 설정
    intercom: {
      appId: process.env.INTERCOM_APP_ID,
      apiKey: process.env.INTERCOM_API_KEY
    },
    
    // Apify 설정
    apify: {
      apiKey: process.env.APIFY_API_KEY
    }
  },
  
  // 로깅 설정
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: {
      enabled: process.env.LOG_TO_FILE !== 'false',
      path: './logs'
    }
  },
  
  // 디버깅 설정
  debug: {
    enabled: process.env.DEBUG_MODE === 'true',
    saveHtml: process.env.SAVE_HTML === 'true',
    takeScreenshots: process.env.TAKE_SCREENSHOTS === 'true',
    screenshotsDir: './screenshots'
  }
};
