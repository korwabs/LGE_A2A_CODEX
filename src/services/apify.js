// src/services/apify.js - Apify 크롤링 서비스
import { ApifyClient } from 'apify-client';

let apifyClientInstance = null;

/**
 * Apify 클라이언트 초기화 및 반환
 * @returns {Object} Apify 클라이언트 인스턴스
 */
export function getApifyClient() {
  if (!apifyClientInstance) {
    apifyClientInstance = new ApifyClient({
      token: process.env.APIFY_API_TOKEN,
    });
  }
  return apifyClientInstance;
}

/**
 * 제품 목록 크롤링 작업 실행
 * @param {string} url 크롤링 시작 URL (기본값: LG 브라질 제품 페이지)
 * @param {number} maxRequestsPerCrawl 최대 요청 수 (기본값: 100)
 * @returns {Promise<Object>} 크롤링 작업 실행 결과
 */
export async function crawlProductList(url = 'https://www.lge.com/br/produtos', maxRequestsPerCrawl = 100) {
  const client = getApifyClient();
  
  const runInput = {
    startUrls: [{ url }],
    maxRequestsPerCrawl,
    includeDescription: true
  };
  
  return await client.actor('LG-product-list-crawler').call(runInput);
}

/**
 * 제품 상세 정보 크롤링 작업 실행
 * @param {string} url 제품 상세 페이지 URL
 * @param {boolean} includeReviews 리뷰 포함 여부 (기본값: true)
 * @returns {Promise<Object>} 크롤링 작업 실행 결과
 */
export async function crawlProductDetail(url, includeReviews = true) {
  const client = getApifyClient();
  
  const runInput = {
    urls: [url],
    includeReviews,
    includeSpecifications: true
  };
  
  return await client.actor('LG-product-detail-crawler').call(runInput);
}

/**
 * 카테고리 크롤링 작업 실행
 * @param {string} category 크롤링할 카테고리
 * @param {number} maxDepth 최대 탐색 깊이 (기본값: 3)
 * @returns {Promise<Object>} 크롤링 작업 실행 결과
 */
export async function crawlCategory(category, maxDepth = 3) {
  const client = getApifyClient();
  
  const runInput = {
    category,
    maxDepth,
    extractProductLinks: true
  };
  
  return await client.actor('LG-category-crawler').call(runInput);
}

/**
 * 체크아웃 프로세스 크롤링 작업 실행
 * @param {string} url 체크아웃 시작 URL (기본값: LG 브라질 장바구니 페이지)
 * @returns {Promise<Object>} 크롤링 작업 실행 결과
 */
export async function crawlCheckoutProcess(url = 'https://www.lge.com/br/carrinho-de-compras') {
  const client = getApifyClient();
  
  const runInput = {
    startUrls: [{ url }],
    includeFieldMapping: true
  };
  
  return await client.actor('LG-checkout-process-crawler').call(runInput);
}

/**
 * 크롤링 결과 데이터 가져오기
 * @param {string} runId 크롤링 작업 실행 ID
 * @param {boolean} clean 데이터 정제 여부 (기본값: true)
 * @returns {Promise<Array>} 크롤링된 데이터 배열
 */
export async function getCrawlResults(runId, clean = true) {
  const client = getApifyClient();
  
  // 작업 결과 데이터셋 가져오기
  const { items } = await client.dataset(runId).listItems();
  
  if (!clean) {
    return items;
  }
  
  // 데이터 정제 (필요에 따라 커스터마이징)
  return items.map(item => {
    if (item.error) {
      console.error(`Error in crawl result: ${item.error}`);
      return null;
    }
    
    return item;
  }).filter(Boolean);
}

/**
 * 모든 크롤링된 제품 가져오기
 * @param {string} runId 크롤링 작업 실행 ID
 * @returns {Promise<Array>} 제품 데이터 배열
 */
export async function getAllCrawledProducts(runId) {
  const results = await getCrawlResults(runId);
  
  // 제품 데이터만 추출
  return results.filter(item => item.type === 'product');
}

/**
 * 크롤링 작업 정기 예약 (weekly)
 * @param {string} actorId 액터 ID
 * @param {Object} runInput 크롤링 작업 입력
 * @returns {Promise<Object>} 예약 결과
 */
export async function scheduleWeeklyCrawl(actorId, runInput) {
  const client = getApifyClient();
  
  return await client.schedules().create({
    name: `Weekly ${actorId} crawl`,
    cronExpression: '0 0 * * 0', // 매주 일요일 자정
    timezone: 'America/Sao_Paulo', // 브라질 시간대
    isEnabled: true,
    isExclusive: true,
    actorId,
    actorRunInput: runInput
  });
}

/**
 * 커스텀 Apify 액터 실행
 * @param {string} actorId 액터 ID 또는 이름
 * @param {Object} runInput 액터 입력 파라미터
 * @param {number} timeoutSecs 타임아웃 (초)
 * @returns {Promise<Object>} 액터 실행 결과
 */
export async function runCustomActor(actorId, runInput, timeoutSecs = 300) {
  const client = getApifyClient();
  
  const run = await client.actor(actorId).call(runInput, { timeoutSecs });
  
  return {
    runId: run.id,
    status: run.status,
    datasetId: run.defaultDatasetId,
    results: await getCrawlResults(run.defaultDatasetId)
  };
}

/**
 * LG 브라질 사이트 모니터링 설정
 * 사이트 변경 감지 시 알림 트리거
 * @param {string} url 모니터링할 URL
 * @param {string} webhook 웹훅 URL
 * @returns {Promise<Object>} 모니터링 설정 결과
 */
export async function setupSiteMonitoring(url = 'https://www.lge.com/br', webhook) {
  const client = getApifyClient();
  
  // Website Content Checker 액터 사용
  return await client.actor('apify/website-content-checker').call({
    startUrls: [{ url }],
    maxDepth: 1,
    maxPagesPerCrawl: 10,
    checkIntervalMinutes: 60, // 1시간마다 확인
    notifyAfterNoChange: 10, // 10회 연속 변경 없을 시 알림 중단
    sendNotificationEmails: false,
    webhook: {
      url: webhook,
      payload: {
        event: 'site_changed',
        url,
        timestamp: new Date().toISOString()
      }
    }
  });
}

/**
 * 경쟁사 가격 모니터링 설정
 * 경쟁사 제품 가격 변경 감지 시 알림 트리거
 * @param {Array} productUrls 모니터링할 제품 URL 배열
 * @param {string} webhook 웹훅 URL
 * @returns {Promise<Object>} 모니터링 설정 결과
 */
export async function setupPriceMonitoring(productUrls, webhook) {
  const client = getApifyClient();
  
  // Price Checker 액터 사용
  return await client.actor('junglee/price-checker').call({
    startUrls: productUrls.map(url => ({ url })),
    selectors: {
      price: '.product-price, .price-current', // LG 브라질 사이트에 맞게 조정 필요
      name: '.product-title, h1.title',
      availability: '.product-availability, .stock-status'
    },
    checkIntervalMinutes: 180, // 3시간마다 확인
    notifyOnPriceChange: true,
    notifyOnAvailabilityChange: true,
    webhook: {
      url: webhook,
      payload: {
        event: 'price_changed',
        timestamp: new Date().toISOString()
      }
    }
  });
}

/**
 * 구매 프로세스 분석 액터 실행
 * 체크아웃 과정의 각 단계별 필드 및 요구 사항 분석
 * @param {string} url 체크아웃 시작 URL
 * @returns {Promise<Object>} 분석 결과
 */
export async function analyzeCheckoutProcess(url = 'https://www.lge.com/br/carrinho-de-compras') {
  const client = getApifyClient();
  
  return await client.actor('LG-checkout-analyzer').call({
    startUrl: url,
    maxSteps: 10,
    extractFields: true,
    followRedirects: true,
    includeScreenshots: true
  });
}

/**
 * 경쟁사 제품 비교 데이터 수집
 * @param {Array} competitorUrls 경쟁사 URL 배열
 * @param {Array} productCategories 수집할 제품 카테고리 배열
 * @returns {Promise<Object>} 데이터 수집 결과
 */
export async function collectCompetitorData(competitorUrls, productCategories) {
  const client = getApifyClient();
  
  return await client.actor('LG-competitor-analyzer').call({
    startUrls: competitorUrls.map(url => ({ url })),
    categories: productCategories,
    maxProductsPerCategory: 20,
    extractPrices: true,
    extractSpecs: true,
    extractReviews: true
  });
}
