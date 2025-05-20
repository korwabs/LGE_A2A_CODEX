/**
 * 환경 변수 접근 유틸리티
 * 환경 변수 이름이 변경되어도 코드 수정을 한 곳에서만 하도록 합니다.
 */

/**
 * Algolia 관련 환경 변수 반환
 * @returns {Object} Algolia 설정 객체
 */
function getAlgoliaConfig() {
  return {
    appId: process.env.ALGOLIA_APP_ID,
    adminApiKey: process.env.ALGOLIA_ADMIN_API_KEY || process.env.ALGOLIA_API_KEY,
    searchApiKey: process.env.ALGOLIA_SEARCH_API_KEY || process.env.ALGOLIA_API_KEY,
    indexName: process.env.ALGOLIA_INDEX_NAME || process.env.ALGOLIA_PRODUCTS_INDEX || 'lg_br_products'
  };
}

/**
 * Intercom 관련 환경 변수 반환
 * @returns {Object} Intercom 설정 객체
 */
function getIntercomConfig() {
  return {
    appId: process.env.INTERCOM_APP_ID,
    apiKey: process.env.INTERCOM_API_KEY || process.env.INTERCOM_ACCESS_TOKEN
  };
}

/**
 * LLM 관련 환경 변수 반환
 * @returns {Object} LLM 설정 객체
 */
function getLLMConfig() {
  return {
    provider: process.env.LLM_PROVIDER || 'google',
    model: process.env.LLM_MODEL || 'gemini-pro',
    apiKey: process.env.LLM_API_KEY,
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.2'),
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '1024', 10)
  };
}

/**
 * 크롤링 관련 환경 변수 반환
 * @returns {Object} 크롤링 설정 객체
 */
function getCrawlingConfig() {
  return {
    maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
    maxConcurrency: parseInt(process.env.MAX_CONCURRENCY || '5', 10),
    maxProductsPerCategory: parseInt(process.env.MAX_PRODUCTS_PER_CATEGORY || '30', 10),
    maxCategoriesPerRun: parseInt(process.env.MAX_CATEGORIES_PER_RUN || '10', 10),
    pageCrawlDelay: parseInt(process.env.PAGE_CRAWL_DELAY || '1000', 10),
    categoryDelay: parseInt(process.env.CATEGORY_DELAY || '5000', 10),
    batchDelay: parseInt(process.env.BATCH_DELAY || '2000', 10),
    dataDir: process.env.DATA_DIR || './data'
  };
}

/**
 * 웹사이트 URL 관련 환경 변수 반환
 * @returns {Object} URL 설정 객체
 */
function getUrlConfig() {
  return {
    lgBrazilUrl: process.env.LG_BRAZIL_URL || 'https://www.lge.com/br',
    backendApiUrl: process.env.BACKEND_API_URL || 'http://localhost:3000/api'
  };
}

module.exports = {
  getAlgoliaConfig,
  getIntercomConfig,
  getLLMConfig,
  getCrawlingConfig,
  getUrlConfig
};
