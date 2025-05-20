// algolia.config.js - Algolia 설정
// 이 파일은 실제 배포에서는 사용되지 않습니다.
// 실제 배포에서는 환경 변수에서 Algolia 구성을 불러옵니다.
// 이 파일은 로컬 개발 환경에서 테스트 목적으로만 사용됩니다.

module.exports = {
  appId: process.env.ALGOLIA_APP_ID || 'YOUR_ALGOLIA_APP_ID',
  apiKey: process.env.ALGOLIA_ADMIN_API_KEY || process.env.ALGOLIA_API_KEY || 'YOUR_ALGOLIA_API_KEY',
  searchApiKey: process.env.ALGOLIA_SEARCH_API_KEY || process.env.ALGOLIA_API_KEY || 'YOUR_ALGOLIA_SEARCH_API_KEY',
  indexName: process.env.ALGOLIA_INDEX_NAME || 'lg_br_products'
};
