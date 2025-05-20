/**
 * 기본 설정 파일
 * 모든 환경에서 공통으로 사용하는 설정
 */
module.exports = {
  // 서버 설정
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || 'localhost',
    apiPrefix: '/api',
  },

  // API 키 및 외부 서비스 설정
  services: {
    // Google Cloud Vertex AI (Gemini)
    gemini: {
      apiKey: process.env.GEMINI_API_KEY,
      model: 'gemini-pro',
      region: 'us-central1',
    },

    // Apify
    apify: {
      apiKey: process.env.APIFY_API_KEY,
    },

    // Algolia
    algolia: {
      appId: process.env.ALGOLIA_APP_ID,
      apiKey: process.env.ALGOLIA_API_KEY,
      productsIndex: 'lg_products',
      categoriesIndex: 'lg_categories',
    },

    // Firebase
    firebase: {
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN,
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.FIREBASE_APP_ID,
    },

    // Intercom
    intercom: {
      appId: process.env.INTERCOM_APP_ID,
      apiKey: process.env.INTERCOM_API_KEY,
    },
  },

  // 크롤링 설정
  crawling: {
    lgBrazilUrl: process.env.LG_BRAZIL_URL || 'https://www.lge.com/br',
    interval: parseInt(process.env.CRAWL_INTERVAL) || 3600000, // 기본값: 1시간 (밀리초)
    maxDepth: parseInt(process.env.CRAWL_MAX_DEPTH) || 3,
    priorityCategories: (process.env.CRAWL_PRIORITY_CATEGORIES || 'refrigerator,tv,washing-machine,air-conditioner').split(','),
  },

  // A2A 프로토콜 설정
  a2a: {
    messageTimeout: 30000, // 메시지 타임아웃 (밀리초)
    retryAttempts: 3, // 재시도 횟수
    retryDelay: 1000, // 재시도 간격 (밀리초)
  },

  // MCP 설정
  mcp: {
    contextTTL: 1800000, // 컨텍스트 TTL (30분)
    maxTokens: 2048, // LLM 최대 토큰 수
    temperatureDefault: 0.7, // 기본 온도 설정
    promptTemplateDir: './src/protocols/mcp/templates', // 프롬프트 템플릿 디렉토리
  },
};
