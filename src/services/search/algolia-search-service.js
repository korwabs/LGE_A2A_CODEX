/**
 * Algolia 검색 서비스
 * 크롤링된 제품 데이터를 인덱싱하고 검색 기능을 제공합니다.
 */
const algoliasearch = require('algoliasearch');
const { getAlgoliaConfig } = require('../../utils/config');

class AlgoliaSearchService {
  /**
   * 생성자
   * @param {Object} config - 설정 객체
   */
  constructor(config = {}) {
    const defaultConfig = getAlgoliaConfig();
    
    this.config = {
      appId: defaultConfig.appId,
      apiKey: defaultConfig.adminApiKey, // 관리 작업에는 adminApiKey 사용
      indexName: defaultConfig.indexName,
      ...config
    };
    
    // Algolia 클라이언트 초기화
    this.client = algoliasearch(this.config.appId, this.config.apiKey);
    this.index = this.client.initIndex(this.config.indexName);
    
    this.logger = console; // 나중에 더 좋은 로깅 시스템으로 교체 가능
  }
  
  /**
   * 제품 데이터 인덱싱
   * @param {Array} products - 인덱싱할 제품 배열
   * @returns {Promise<Object>} 인덱싱 결과
   */
  async indexProducts(products) {
    try {
      this.logger.info(`${products.length}개 제품 인덱싱 시작`);
      
      // 제품 데이터 전처리
      const processedProducts = products.map(product => ({
        objectID: product.id, // Algolia에서 필요한 고유 식별자
        ...product,
        _tags: this._generateTags(product)
      }));
      
      // 제품 데이터 인덱싱
      const result = await this.index.saveObjects(processedProducts);
      
      this.logger.info(`제품 인덱싱 완료: ${result.objectIDs.length}개 객체`);
      
      return result;
    } catch (error) {
      this.logger.error(`제품 인덱싱 오류:`, error);
      throw error;
    }
  }
  
  /**
   * 제품 데이터 부분 업데이트
   * @param {Array} products - 업데이트할 제품 배열
   * @returns {Promise<Object>} 업데이트 결과
   */
  async updateProducts(products) {
    try {
      this.logger.info(`${products.length}개 제품 부분 업데이트 시작`);
      
      // 제품 데이터 전처리
      const processedProducts = products.map(product => ({
        objectID: product.id,
        ...product
      }));
      
      // 제품 데이터 부분 업데이트
      const result = await this.index.partialUpdateObjects(processedProducts);
      
      this.logger.info(`제품 부분 업데이트 완료: ${result.objectIDs.length}개 객체`);
      
      return result;
    } catch (error) {
      this.logger.error(`제품 부분 업데이트 오류:`, error);
      throw error;
    }
  }
  
  /**
   * 제품 검색
   * @param {string} query - 검색 쿼리
   * @param {Object} options - 검색 옵션
   * @returns {Promise<Object>} 검색 결과
   */
  async searchProducts(query, options = {}) {
    try {
      this.logger.info(`제품 검색 시작: "${query}"`);
      
      const defaultOptions = {
        hitsPerPage: 10,
        page: 0,
        attributesToRetrieve: [
          'id', 'name', 'price', 'description', 'features',
          'imageUrl', 'url', 'category', 'stockStatus'
        ],
        attributesToHighlight: ['name', 'description', 'features'],
      };
      
      const searchOptions = {
        ...defaultOptions,
        ...options
      };
      
      // 검색 수행
      const result = await this.index.search(query, searchOptions);
      
      this.logger.info(`제품 검색 완료: ${result.hits.length}개 결과 (총 ${result.nbHits}개 중)`);
      
      return result;
    } catch (error) {
      this.logger.error(`제품 검색 오류:`, error);
      throw error;
    }
  }
  
  /**
   * 필터 기반 제품 검색
   * @param {Object} filters - 필터 객체
   * @param {Object} options - 검색 옵션
   * @returns {Promise<Object>} 검색 결과
   */
  async searchByFilters(filters, options = {}) {
    try {
      const filterString = this._buildFilterString(filters);
      
      this.logger.info(`필터 기반 제품 검색 시작: "${filterString}"`);
      
      const defaultOptions = {
        hitsPerPage: 10,
        page: 0,
        filters: filterString
      };
      
      const searchOptions = {
        ...defaultOptions,
        ...options
      };
      
      // 필터 검색 수행
      const result = await this.index.search('', searchOptions);
      
      this.logger.info(`필터 검색 완료: ${result.hits.length}개 결과 (총 ${result.nbHits}개 중)`);
      
      return result;
    } catch (error) {
      this.logger.error(`필터 검색 오류:`, error);
      throw error;
    }
  }
  
  /**
   * 제품 추천 (유사 제품 검색)
   * @param {string} productId - 기준 제품 ID
   * @param {number} limit - 최대 결과 수
   * @returns {Promise<Array>} 추천 제품 배열
   */
  async recommendSimilarProducts(productId, limit = 5) {
    try {
      this.logger.info(`제품 ID: ${productId}에 대한 유사 제품 추천 시작`);
      
      // 기준 제품 조회
      const product = await this.getProductById(productId);
      
      if (!product) {
        throw new Error(`ID가 ${productId}인 제품을 찾을 수 없습니다.`);
      }
      
      // 유사 제품 검색 (동일 카테고리 내에서)
      const result = await this.index.search('', {
        filters: `category:${product.category} AND NOT objectID:${productId}`,
        hitsPerPage: limit
      });
      
      this.logger.info(`유사 제품 추천 완료: ${result.hits.length}개 결과`);
      
      return result.hits;
    } catch (error) {
      this.logger.error(`유사 제품 추천 오류:`, error);
      throw error;
    }
  }
  
  /**
   * ID로 제품 조회
   * @param {string} productId - 제품 ID
   * @returns {Promise<Object>} 제품 정보
   */
  async getProductById(productId) {
    try {
      this.logger.info(`ID로 제품 조회: ${productId}`);
      
      const product = await this.index.getObject(productId).catch(() => null);
      
      if (product) {
        this.logger.info(`제품 조회 성공: ${productId}`);
      } else {
        this.logger.warn(`제품을 찾을 수 없음: ${productId}`);
      }
      
      return product;
    } catch (error) {
      this.logger.error(`제품 조회 오류:`, error);
      return null;
    }
  }
  
  /**
   * 인덱스 설정
   * @returns {Promise<Object>} 설정 결과
   */
  async configureIndex() {
    try {
      this.logger.info(`Algolia 인덱스 설정 시작`);
      
      // 검색 가능 속성 설정
      await this.index.setSettings({
        searchableAttributes: [
          'name',
          'description',
          'features',
          'category',
          'specifications'
        ],
        // 필터링 가능 속성 설정
        attributesForFaceting: [
          'category',
          'stockStatus',
          'price',
          'features',
          'specifications.brand'
        ],
        // 순위 설정
        ranking: [
          'typo',
          'geo',
          'words',
          'filters',
          'proximity',
          'attribute',
          'exact',
          'custom'
        ],
        // 커스텀 순위 설정
        customRanking: [
          'desc(popularity)',
          'desc(rating)'
        ]
      });
      
      this.logger.info(`Algolia 인덱스 설정 완료`);
      
      return { success: true };
    } catch (error) {
      this.logger.error(`인덱스 설정 오류:`, error);
      throw error;
    }
  }
  
  /**
   * 필터 문자열 생성
   * @param {Object} filters - 필터 객체
   * @returns {string} Algolia 필터 문자열
   * @private
   */
  _buildFilterString(filters) {
    const filterParts = [];
    
    if (filters.category) {
      filterParts.push(`category:${filters.category}`);
    }
    
    if (filters.priceRange) {
      const [min, max] = filters.priceRange.split('-').map(Number);
      if (!isNaN(min)) filterParts.push(`price >= ${min}`);
      if (!isNaN(max)) filterParts.push(`price <= ${max}`);
    }
    
    if (filters.features && Array.isArray(filters.features)) {
      const featureFilters = filters.features.map(feature => `features:${feature}`);
      if (featureFilters.length > 0) {
        filterParts.push(`(${featureFilters.join(' OR ')})`);
      }
    }
    
    if (filters.stockStatus) {
      filterParts.push(`stockStatus:${filters.stockStatus}`);
    }
    
    // 추가 필터 처리...
    
    return filterParts.join(' AND ');
  }
  
  /**
   * 제품 데이터에서 태그 생성
   * @param {Object} product - 제품 데이터
   * @returns {Array} 태그 배열
   * @private
   */
  _generateTags(product) {
    const tags = [
      product.category,
      product.stockStatus
    ];
    
    // 특징에서 태그 추출
    if (product.features && Array.isArray(product.features)) {
      tags.push(...product.features);
    }
    
    // 사양에서 태그 추출
    if (product.specifications) {
      for (const [key, value] of Object.entries(product.specifications)) {
        if (value) {
          tags.push(`${key}:${value}`);
        }
      }
    }
    
    // 중복 제거
    return [...new Set(tags)].filter(Boolean);
  }
}

module.exports = AlgoliaSearchService;
