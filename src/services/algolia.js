// src/services/algolia.js - Algolia 검색 서비스
import algoliasearch from 'algoliasearch';
import { getAlgoliaConfig } from '../utils/config';

let algoliaClientInstance = null;

/**
 * Algolia 클라이언트 초기화 및 반환
 * @returns {Object} Algolia 클라이언트 인스턴스
 */
export function getAlgoliaClient() {
  if (!algoliaClientInstance) {
    const config = getAlgoliaConfig();
    algoliaClientInstance = algoliasearch(
      config.appId,
      config.adminApiKey // 관리 작업에는 adminApiKey 사용
    );
  }
  return algoliaClientInstance;
}

/**
 * 제품 데이터 Algolia에 색인화
 * @param {Array} products 제품 객체 배열
 * @param {string} indexName 인덱스 이름 (기본값: 환경 변수에서 가져옴)
 * @returns {Promise<Object>} 색인화 결과
 */
export async function indexProducts(products, indexName = getAlgoliaConfig().indexName) {
  const client = getAlgoliaClient();
  const index = client.initIndex(indexName);
  
  // 배치 처리를 위한 객체 배열 준비
  const objects = products.map(product => ({
    objectID: product.id,
    name: product.name,
    description: product.description,
    price: product.price,
    category: product.category,
    imageUrl: product.imageUrl,
    url: product.url,
    stockStatus: product.stockStatus || 'unknown',
    features: product.features || [],
    specifications: product.specifications || {},
    updatedAt: new Date().toISOString(),
    // 추가 필드...
  }));
  
  // 색인화 실행
  return await index.saveObjects(objects);
}

/**
 * 제품 검색
 * @param {string} query 검색 쿼리
 * @param {Object} options 검색 옵션
 * @param {string} indexName 인덱스 이름 (기본값: 환경 변수에서 가져옴)
 * @returns {Promise<Object>} 검색 결과
 */
export async function searchProducts(query, options = {}, indexName = getAlgoliaConfig().indexName) {
  const client = getAlgoliaClient();
  const index = client.initIndex(indexName);
  
  // 기본 옵션
  const defaultOptions = {
    hitsPerPage: 10,
    page: 0
  };
  
  // 옵션 병합
  const searchOptions = {
    ...defaultOptions,
    ...options
  };
  
  // 검색 실행
  return await index.search(query, searchOptions);
}

/**
 * 카테고리별 인기 제품 가져오기
 * @param {string} category 카테고리
 * @param {number} limit 결과 수 (기본값: 5)
 * @param {string} indexName 인덱스 이름 (기본값: 환경 변수에서 가져옴)
 * @returns {Promise<Array>} 제품 배열
 */
export async function getPopularProductsByCategory(category, limit = 5, indexName = getAlgoliaConfig().indexName) {
  const client = getAlgoliaClient();
  const index = client.initIndex(indexName);
  
  const searchOptions = {
    filters: `category:${category}`,
    hitsPerPage: limit
  };
  
  const results = await index.search('', searchOptions);
  return results.hits;
}

/**
 * 제품 가격 업데이트
 * @param {string} productId 제품 ID
 * @param {number} newPrice 새 가격
 * @param {string} indexName 인덱스 이름 (기본값: 환경 변수에서 가져옴)
 * @returns {Promise<Object>} 업데이트 결과
 */
export async function updateProductPrice(productId, newPrice, indexName = getAlgoliaConfig().indexName) {
  const client = getAlgoliaClient();
  const index = client.initIndex(indexName);
  
  return await index.partialUpdateObject({
    objectID: productId,
    price: newPrice,
    updatedAt: new Date().toISOString()
  });
}

/**
 * 제품 재고 상태 업데이트
 * @param {string} productId 제품 ID
 * @param {string} stockStatus 재고 상태
 * @param {string} indexName 인덱스 이름 (기본값: 환경 변수에서 가져옴)
 * @returns {Promise<Object>} 업데이트 결과
 */
export async function updateProductStockStatus(productId, stockStatus, indexName = getAlgoliaConfig().indexName) {
  const client = getAlgoliaClient();
  const index = client.initIndex(indexName);
  
  return await index.partialUpdateObject({
    objectID: productId,
    stockStatus,
    updatedAt: new Date().toISOString()
  });
}
