/**
 * 개발 환경 설정
 * 로컬 개발 환경에서 사용하는 설정
 */
const defaultConfig = require('./default');

module.exports = {
  ...defaultConfig,
  env: 'development',
  
  // 개발 환경 서버 설정
  server: {
    ...defaultConfig.server,
    cors: {
      origin: '*', // 로컬 개발시 모든 오리진 허용
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    },
  },
  
  // 개발 로깅 설정
  logging: {
    level: 'debug',
    format: 'dev',
  },
  
  // 크롤링 설정 오버라이드
  crawling: {
    ...defaultConfig.crawling,
    // 개발 환경에서는 더 짧은 간격으로 크롤링
    interval: 10 * 60 * 1000, // 10분
    // 더 작은 데이터셋으로 테스트
    maxItems: 100,
  },
  
  // MCP 설정 오버라이드
  mcp: {
    ...defaultConfig.mcp,
    // 개발 환경에서는 더 짧은 컨텍스트 TTL
    contextTTL: 10 * 60 * 1000, // 10분
    // 더 낮은 온도로 테스트하기 위해
    temperatureDefault: 0.5,
  },
};
