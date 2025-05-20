/**
 * 제품 추천 에이전트
 * 사용자 행동 데이터와 대화 컨텍스트 기반 제품 추천을 담당합니다.
 */
const A2ABaseAgent = require('../../protocols/a2a-base-agent');

class ProductRecommendationAgent extends A2ABaseAgent {
  /**
   * 생성자
   * @param {Object} router - A2A 라우터 인스턴스
   * @param {Object} searchService - 검색 서비스 (Algolia)
   * @param {Object} sessionService - 세션 관리 서비스
   */
  constructor(router, searchService, sessionService) {
    super('productRecommendationAgent', router);
    this.searchService = searchService;
    this.sessionService = sessionService;
    this.setupMessageHandlers();
  }
  
  /**
   * 메시지 핸들러 설정
   */
  setupMessageHandlers() {
    // 제품 추천 요청 처리
    this.registerMessageHandler('getRecommendation', async (message) => {
      const { sessionId, userQuery, filters, language = 'pt-BR' } = message.payload;
      
      try {
        this.logger.info(`제품 추천 요청 처리: ${sessionId}, 쿼리: "${userQuery}"`);
        
        // 세션 정보 가져오기
        const session = await this.sessionService.getSession(sessionId);
        if (!session) {
          throw new Error(`세션을 찾을 수 없음: ${sessionId}`);
        }
        
        // 사용자 선호도 및 행동 데이터 가져오기
        const preferences = session.preferences || {};
        
        // 검색 쿼리 구성
        const searchQuery = await this.buildSearchQuery(userQuery, filters, preferences);
        
        // Algolia 검색
        const searchResults = await this.searchService.searchProducts(searchQuery);
        
        // 검색 결과 후처리 및 최적 추천 도출
        const recommendations = this.processSearchResults(searchResults.hits);
        
        // 추천 결과가 없는 경우
        if (recommendations.length === 0) {
          // 추천 결과 없음 응답
          const noResultsResponse = (language === 'pt-BR')
            ? 'Desculpe, não consegui encontrar produtos que correspondam à sua pesquisa. Poderia tentar com outras palavras-chave ou descrever o que está procurando de outra forma?'
            : '죄송합니다, 검색어와 일치하는 제품을 찾을 수 없습니다. 다른 키워드로 시도하거나 찾고 계신 것을 다른 방식으로 설명해 주시겠어요?';
            
          return {
            success: true,
            sessionId,
            response: noResultsResponse,
            recommendations: []
          };
        }
        
        // 검색 결과를 세션에 저장 (최근 검색)
        await this.sessionService.updateSession(sessionId, {
          recentSearches: [
            ...(session.recentSearches || []),
            {
              query: userQuery,
              timestamp: new Date().toISOString(),
              results: recommendations.length
            }
          ].slice(-5) // 최근 5개만 유지
        });
        
        // 결과를 대화 에이전트에 반환
        const result = await this.sendMessage(
          'dialogAgent',
          'response',
          'recommendationResult',
          { 
            sessionId, 
            recommendations, 
            userQuery,
            language
          }
        );
        
        return result;
      } catch (error) {
        this.logger.error(`제품 추천 요청 처리 오류: ${sessionId}`, error);
        
        // 오류 처리 응답
        const errorResponse = (language === 'pt-BR')
          ? 'Desculpe, ocorreu um erro ao buscar recomendações de produtos. Por favor, tente novamente.'
          : '죄송합니다, 제품 추천을 검색하는 중 오류가 발생했습니다. 다시 시도해 주세요.';
          
        return {
          success: false,
          sessionId,
          response: errorResponse,
          error: error.message
        };
      }
    });
    
    // 유사 제품 검색 요청 처리
    this.registerMessageHandler('getSimilarProducts', async (message) => {
      const { sessionId, productId, limit = 5, language = 'pt-BR' } = message.payload;
      
      try {
        this.logger.info(`유사 제품 검색 요청 처리: ${sessionId}, 제품 ID: ${productId}`);
        
        // 유사 제품 검색
        const similarProducts = await this.searchService.recommendSimilarProducts(productId, limit);
        
        // 결과 처리
        const recommendations = this.processSearchResults(similarProducts);
        
        // 결과를 대화 에이전트에 반환
        const result = await this.sendMessage(
          'dialogAgent',
          'response',
          'recommendationResult',
          { 
            sessionId, 
            recommendations, 
            userQuery: `유사 제품: ${productId}`,
            language
          }
        );
        
        return result;
      } catch (error) {
        this.logger.error(`유사 제품 검색 요청 처리 오류: ${sessionId}`, error);
        
        // 오류 처리 응답
        const errorResponse = (language === 'pt-BR')
          ? 'Desculpe, ocorreu um erro ao buscar produtos similares. Por favor, tente novamente.'
          : '죄송합니다, 유사 제품을 검색하는 중 오류가 발생했습니다. 다시 시도해 주세요.';
          
        return {
          success: false,
          sessionId,
          response: errorResponse,
          error: error.message
        };
      }
    });
  }
  
  /**
   * 검색 쿼리 구성
   * @param {string} userQuery - 사용자 쿼리
   * @param {Object} filters - 필터 객체
   * @param {Object} preferences - 사용자 선호도
   * @returns {Promise<string>} 구성된 검색 쿼리
   */
  async buildSearchQuery(userQuery, filters = {}, preferences = {}) {
    // 자연어 쿼리 전처리
    const processedQuery = this._preprocessQuery(userQuery);
    
    // 필터와 선호도를 반영한 검색 옵션 구성
    const searchOptions = {};
    
    // 필터 처리
    if (filters) {
      const filterString = this._buildFilterString(filters);
      if (filterString) {
        searchOptions.filters = filterString;
      }
    }
    
    // 선호도 반영
    if (preferences.categories && preferences.categories.length > 0) {
      // 선호도에 맞는 카테고리 가중치 부여
      searchOptions.optionalFilters = preferences.categories.map(category => 
        `category:${category}<score=10>`
      );
    }
    
    return processedQuery;
  }
  
  /**
   * 검색 결과 처리
   * @param {Array} searchResults - 검색 결과 배열
   * @returns {Array} 처리된 추천 제품 배열
   */
  processSearchResults(searchResults) {
    if (!searchResults || !Array.isArray(searchResults) || searchResults.length === 0) {
      return [];
    }
    
    // 결과 구조화 및 점수 계산
    return searchResults.map(hit => ({
      id: hit.objectID || hit.id,
      name: hit.name,
      description: hit.description,
      price: hit.price,
      imageUrl: hit.imageUrl,
      features: hit.features,
      stockStatus: hit.stockStatus,
      rating: hit.rating,
      url: hit.url,
      category: hit.category,
      relevanceScore: hit._score || 0
    }));
  }
  
  /**
   * 사용자 쿼리 전처리
   * @param {string} query - 사용자 쿼리
   * @returns {string} 전처리된 쿼리
   * @private
   */
  _preprocessQuery(query) {
    // 쿼리 정제 (특수문자 제거, 불용어 처리 등)
    let processedQuery = query.trim();
    
    // 포르투갈어 불용어 처리 (예: 'de', 'para', 'o', 'a' 등)
    // 실제 구현 시 더 정교한 처리 필요
    
    return processedQuery;
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
    
    return filterParts.join(' AND ');
  }
}

module.exports = ProductRecommendationAgent;
