/**
 * 프로덕션 환경 설정
 * 실제 배포 환경에서 사용하는 설정
 */
const defaultConfig = require('./default');

module.exports = {
  ...defaultConfig,
  env: 'production',
  
  // 프로덕션 서버 설정
  server: {
    ...defaultConfig.server,
    cors: {
      origin: ['https://www.lge.com'], // 프로덕션에서는 특정 도메인만 허용
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    },
  },
  
  // 프로덕션 로깅 설정
  logging: {
    level: 'info',
    format: 'combined',
  },
  
  // 크롤링 설정 오버라이드
  crawling: {
    ...defaultConfig.crawling,
    // 프로덕션 환경에서는 더 긴 간격으로 크롤링
    interval: 60 * 60 * 1000, // 1시간
  },
  
  // MCP 설정 오버라이드
  mcp: {
    ...defaultConfig.mcp,
    // 프로덕션 환경에서는 더 긴 컨텍스트 TTL
    contextTTL: 60 * 60 * 1000, // 1시간
    // 프로덕션 환경에서는 더 낮은 온도로 더 결정적인 응답
    temperatureDefault: 0.4,
  },
  
  // 캐싱 설정
  cache: {
    enabled: true,
    ttl: 24 * 60 * 60, // 24시간 (초)
  },
};
