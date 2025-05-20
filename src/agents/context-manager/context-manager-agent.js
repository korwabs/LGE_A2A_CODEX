// src/agents/context-manager/context-manager-agent.js
import { BaseAgent } from '../base-agent';
import { config } from '../../../config';

/**
 * 대화 컨텍스트 관리 에이전트
 * 사용자 대화 세션 관리 및 컨텍스트 유지
 */
export class ContextManagerAgent extends BaseAgent {
  /**
   * 생성자
   * @param {string} agentId 에이전트 식별자
   * @param {Object} router A2A 라우터 인스턴스
   * @param {Object} db Firestore 인스턴스
   */
  constructor(agentId, router, db) {
    super(agentId, router);
    this.db = db;
    this.contextStore = new Map(); // 메모리 컨텍스트 저장소
    this.templateCache = new Map(); // 프롬프트 템플릿 캐시
    this.setupMessageHandlers();
  }

  /**
   * 메시지 핸들러 설정
   */
  setupMessageHandlers() {
    // 컨텍스트 저장 핸들러
    this.registerMessageHandler('storeContext', this.handleStoreContext);
    
    // 컨텍스트 조회 핸들러
    this.registerMessageHandler('getContext', this.handleGetContext);
    
    // 컨텍스트 업데이트 핸들러
    this.registerMessageHandler('updateContext', this.handleUpdateContext);
    
    // 템플릿 기반 프롬프트 생성 핸들러
    this.registerMessageHandler('generatePrompt', this.handleGeneratePrompt);
    
    // 컨텍스트 삭제 핸들러
    this.registerMessageHandler('clearContext', this.handleClearContext);
  }

  /**
   * 컨텍스트 저장 핸들러
   * @param {Object} message A2A 메시지
   * @returns {Object} 응답
   */
  async handleStoreContext(message) {
    const { userId, contextData } = message.payload;
    
    try {
      await this.storeContext(userId, contextData);
      return {
        success: true,
        message: 'Context stored successfully',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error storing context:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 컨텍스트 조회 핸들러
   * @param {Object} message A2A 메시지
   * @returns {Object} 응답
   */
  async handleGetContext(message) {
    const { userId, keys } = message.payload;
    
    try {
      const contextData = await this.getContext(userId, keys);
      return {
        success: true,
        contextData,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting context:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 컨텍스트 업데이트 핸들러
   * @param {Object} message A2A 메시지
   * @returns {Object} 응답
   */
  async handleUpdateContext(message) {
    const { userId, key, value } = message.payload;
    
    try {
      await this.updateContext(userId, key, value);
      return {
        success: true,
        message: 'Context updated successfully',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error updating context:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 템플릿 기반 프롬프트 생성 핸들러
   * @param {Object} message A2A 메시지
   * @returns {Object} 응답
   */
  async handleGeneratePrompt(message) {
    const { userId, templateId, additionalData } = message.payload;
    
    try {
      const prompt = await this.generatePrompt(userId, templateId, additionalData);
      return {
        success: true,
        prompt,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error generating prompt:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 컨텍스트 삭제 핸들러
   * @param {Object} message A2A 메시지
   * @returns {Object} 응답
   */
  async handleClearContext(message) {
    const { userId } = message.payload;
    
    try {
      await this.clearContext(userId);
      return {
        success: true,
        message: 'Context cleared successfully',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error clearing context:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 프롬프트 템플릿 등록
   * @param {string} templateId 템플릿 식별자
   * @param {string} template 템플릿 문자열
   */
  registerTemplate(templateId, template) {
    this.templateCache.set(templateId, template);
  }

  /**
   * 사용자별 컨텍스트 저장
   * @param {string} userId 사용자 ID
   * @param {Object} contextData 컨텍스트 데이터
   * @returns {Promise<void>}
   */
  async storeContext(userId, contextData) {
    // 메모리 저장
    const currentContext = this.contextStore.get(userId) || {};
    this.contextStore.set(userId, {
      ...currentContext,
      ...contextData,
      updatedAt: new Date().toISOString()
    });
    
    // Firestore 저장
    const userContextRef = this.db.collection('userContexts').doc(userId);
    await userContextRef.set({
      ...contextData,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  }

  /**
   * 컨텍스트 조회
   * @param {string} userId 사용자 ID
   * @param {Array<string>} keys 조회할 키 배열 (없으면 전체 반환)
   * @returns {Promise<Object>} 컨텍스트 데이터
   */
  async getContext(userId, keys = null) {
    // 메모리에서 조회
    let contextData = this.contextStore.get(userId) || {};
    
    // 메모리에 없으면 Firestore에서 조회
    if (Object.keys(contextData).length === 0) {
      const userContextRef = this.db.collection('userContexts').doc(userId);
      const doc = await userContextRef.get();
      
      if (doc.exists) {
        contextData = doc.data();
        this.contextStore.set(userId, contextData); // 메모리에 캐싱
      }
    }
    
    // 특정 키만 필요한 경우 필터링
    if (keys) {
      const filteredContext = {};
      keys.forEach(key => {
        if (contextData[key] !== undefined) {
          filteredContext[key] = contextData[key];
        }
      });
      return filteredContext;
    }
    
    return contextData;
  }

  /**
   * 컨텍스트 일부 업데이트
   * @param {string} userId 사용자 ID
   * @param {string} key 업데이트할 키
   * @param {any} value 새 값
   * @returns {Promise<void>}
   */
  async updateContext(userId, key, value) {
    // 현재 컨텍스트 조회
    const currentContext = await this.getContext(userId);
    
    // 메모리 업데이트
    currentContext[key] = value;
    currentContext.updatedAt = new Date().toISOString();
    this.contextStore.set(userId, currentContext);
    
    // Firestore 업데이트
    const userContextRef = this.db.collection('userContexts').doc(userId);
    await userContextRef.update({
      [key]: value,
      updatedAt: new Date().toISOString()
    });
  }

  /**
   * 컨텍스트 기반 프롬프트 생성
   * @param {string} userId 사용자 ID
   * @param {string} templateId 템플릿 ID
   * @param {Object} additionalData 추가 데이터
   * @returns {Promise<string>} 생성된 프롬프트
   */
  async generatePrompt(userId, templateId, additionalData = {}) {
    if (!this.templateCache.has(templateId)) {
      throw new Error(`Template ${templateId} not found`);
    }
    
    const template = this.templateCache.get(templateId);
    const userContext = await this.getContext(userId);
    
    const contextData = {
      ...userContext,
      ...additionalData
    };
    
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return contextData[key] !== undefined ? contextData[key] : match;
    });
  }

  /**
   * 컨텍스트 삭제
   * @param {string} userId 사용자 ID
   * @returns {Promise<void>}
   */
  async clearContext(userId) {
    // 메모리에서 삭제
    this.contextStore.delete(userId);
    
    // Firestore에서 삭제
    const userContextRef = this.db.collection('userContexts').doc(userId);
    await userContextRef.delete();
  }

  /**
   * 컨텍스트 클리너 (만료된 컨텍스트 제거)
   * @returns {Promise<void>}
   */
  async cleanExpiredContexts() {
    const ttl = config.mcp.contextTTL;
    const expiryTime = new Date(Date.now() - ttl);
    
    // 메모리 컨텍스트 정리
    for (const [userId, contextData] of this.contextStore.entries()) {
      const updatedAt = new Date(contextData.updatedAt);
      if (updatedAt < expiryTime) {
        this.contextStore.delete(userId);
      }
    }
    
    // Firestore 컨텍스트 정리
    const expiredContexts = await this.db.collection('userContexts')
      .where('updatedAt', '<', expiryTime)
      .get();
    
    const batch = this.db.batch();
    expiredContexts.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
  }

  /**
   * 에이전트 초기화
   * @returns {Promise<void>}
   */
  async initialize() {
    // 기본 템플릿 로드
    await this.loadDefaultTemplates();
    
    // 정기적인 만료된 컨텍스트 정리 작업 설정
    setInterval(() => this.cleanExpiredContexts(), config.mcp.contextTTL / 2);
    
    await super.initialize();
  }

  /**
   * 기본 템플릿 로드
   * @returns {Promise<void>}
   */
  async loadDefaultTemplates() {
    // 제품 검색용 템플릿
    this.registerTemplate('productSearch', `
      당신은 LG 브라질 쇼핑 어시스턴트입니다.
      
      # 사용자 정보
      사용자 ID: {{userId}}
      선호 카테고리: {{preferredCategories}}
      최근 검색어: {{recentSearches}}
      
      # 제품 데이터 컨텍스트
      {{productContext}}
      
      # 현재 대화 컨텍스트
      {{conversationHistory}}
      
      # 지시사항
      사용자의 질문에서 제품 검색 의도를 파악하여 관련된 제품을 추천해주세요.
      제품 추천 시 사용자의 선호도와 이전 검색 기록을 고려하세요.
      제품의 주요 특징, 가격, 재고 상태를 명확하게 설명해주세요.
      
      사용자 질문: {{userQuery}}
    `);
    
    // 구매 프로세스 지원용 템플릿
    this.registerTemplate('purchaseProcess', `
      당신은 LG 브라질 쇼핑 어시스턴트입니다.
      
      # 구매 프로세스 정보
      현재 단계: {{currentCheckoutStep}}
      필요한 정보: {{requiredFields}}
      이미 수집된 정보: {{collectedInfo}}
      
      # 지시사항
      사용자가 구매 프로세스를 완료할 수 있도록 필요한 정보를 자연스러운 대화로 수집하세요.
      누락된 정보가 있다면 친절하게 요청하세요.
      이미 제공된 정보는 다시 묻지 마세요.
      
      사용자 메시지: {{userMessage}}
    `);
    
    // 의도 분석용 템플릿
    this.registerTemplate('intentAnalysis', `
      당신은 LG 브라질 쇼핑 어시스턴트를 위한 사용자 의도 분석기입니다.
      
      # 현재 대화 컨텍스트
      {{conversationHistory}}
      
      # 지시사항
      사용자 메시지를 분석하여 사용자의 의도를 파악하세요.
      가능한 의도: productSearch (제품 검색), purchaseIntent (구매 의향), generalQuery (일반 질문), comparison (제품 비교)
      
      분석 결과를 다음 JSON 형식으로 반환하세요:
      {
        "type": "의도 유형",
        "filters": {
          "priceRange": "가격 범위 (예: '1000-2000' 또는 'high', 'medium', 'low')",
          "categories": ["카테고리1", "카테고리2"],
          "features": ["특징1", "특징2"]
        },
        "productId": "구매하려는 제품 ID (구매 의향인 경우)",
        "comparisonProducts": ["제품ID1", "제품ID2"] (제품 비교인 경우)
      }
      
      사용자 메시지: {{userQuery}}
    `);
    
    // 추천 결과 포맷팅 템플릿
    this.registerTemplate('formatRecommendations', `
      당신은 LG 브라질 쇼핑 어시스턴트입니다.
      
      # 추천 제품 정보
      {{recommendations}}
      
      # 지시사항
      제공된 제품 정보를 사용자 친화적인 형식으로 포맷팅하세요.
      각 제품의 주요 특징, 가격, 재고 상태를 강조하세요.
      제품 간의 핵심 차이점을 비교해주세요.
      사용자에게 어떤 제품이 왜 적합한지 간략하게 설명해주세요.
      
      사용자 질문: {{userQuery}}
    `);
  }
}
