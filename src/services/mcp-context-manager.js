// src/services/mcp-context-manager.js - MCP 컨텍스트 관리자
/**
 * MCP(Model Context Protocol) 컨텍스트 관리 클래스
 * 에이전트와 LLM 사이의 효율적인 컨텍스트 관리
 */
export class MCPContextManager {
  constructor() {
    this.templateCache = new Map();
    this.contextStore = new Map();
    this.expirationTime = 30 * 60 * 1000; // 기본 만료 시간: 30분
  }
  
  /**
   * 프롬프트 템플릿 등록
   * @param {string} templateId 템플릿 식별자
   * @param {string} template 프롬프트 템플릿 문자열
   */
  registerTemplate(templateId, template) {
    this.templateCache.set(templateId, template);
  }
  
  /**
   * 등록된 템플릿 가져오기
   * @param {string} templateId 템플릿 식별자
   * @returns {string} 프롬프트 템플릿 문자열
   */
  getTemplate(templateId) {
    if (!this.templateCache.has(templateId)) {
      throw new Error(`Template ${templateId} not found`);
    }
    return this.templateCache.get(templateId);
  }
  
  /**
   * 모든 등록된 템플릿 목록
   * @returns {Array<string>} 템플릿 ID 배열
   */
  listTemplates() {
    return Array.from(this.templateCache.keys());
  }
  
  /**
   * 사용자별 컨텍스트 저장
   * @param {string} userId 사용자 식별자
   * @param {Object} contextData 컨텍스트 데이터
   * @param {number} ttl 만료 시간 (밀리초, 기본값: 30분)
   */
  storeContext(userId, contextData, ttl = this.expirationTime) {
    this.contextStore.set(userId, {
      ...this.contextStore.get(userId) || {},
      ...contextData,
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttl).toISOString()
    });
  }
  
  /**
   * 사용자 컨텍스트 가져오기
   * @param {string} userId 사용자 식별자
   * @returns {Object} 사용자 컨텍스트 데이터
   */
  getContext(userId) {
    const context = this.contextStore.get(userId);
    
    if (!context) {
      return null;
    }
    
    // 만료된 컨텍스트 확인
    if (context.expiresAt && new Date(context.expiresAt) < new Date()) {
      this.contextStore.delete(userId);
      return null;
    }
    
    return context;
  }
  
  /**
   * 컨텍스트에서 특정 키 가져오기
   * @param {string} userId 사용자 식별자
   * @param {string} key 데이터 키
   * @returns {any} 키에 해당하는 값
   */
  getContextValue(userId, key) {
    const context = this.getContext(userId);
    return context ? context[key] : undefined;
  }
  
  /**
   * 컨텍스트 일부 업데이트
   * @param {string} userId 사용자 식별자
   * @param {string} key 데이터 키
   * @param {any} value 업데이트할 값
   */
  updateContext(userId, key, value) {
    const currentContext = this.getContext(userId) || {};
    currentContext[key] = value;
    currentContext.updatedAt = new Date().toISOString();
    
    // 만료 시간이 없는 경우 기본 만료 시간 설정
    if (!currentContext.expiresAt) {
      currentContext.expiresAt = new Date(Date.now() + this.expirationTime).toISOString();
    }
    
    this.contextStore.set(userId, currentContext);
  }
  
  /**
   * 컨텍스트 만료 시간 업데이트
   * @param {string} userId 사용자 식별자
   * @param {number} ttl 새 만료 시간 (밀리초)
   */
  extendContextExpiration(userId, ttl = this.expirationTime) {
    const context = this.getContext(userId);
    
    if (context) {
      context.expiresAt = new Date(Date.now() + ttl).toISOString();
      this.contextStore.set(userId, context);
    }
  }
  
  /**
   * 사용자 컨텍스트 삭제
   * @param {string} userId 사용자 식별자
   */
  deleteContext(userId) {
    this.contextStore.delete(userId);
  }
  
  /**
   * 컨텍스트 기반 프롬프트 생성
   * @param {string} userId 사용자 식별자
   * @param {string} templateId 템플릿 식별자
   * @param {Object} additionalData 추가 데이터
   * @returns {string} 완성된 프롬프트
   */
  generatePrompt(userId, templateId, additionalData = {}) {
    if (!this.templateCache.has(templateId)) {
      throw new Error(`Template ${templateId} not found`);
    }
    
    const template = this.templateCache.get(templateId);
    const userContext = this.getContext(userId) || {};
    
    const contextData = {
      ...userContext,
      ...additionalData
    };
    
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return contextData[key] !== undefined ? contextData[key] : match;
    });
  }
  
  /**
   * 만료된 컨텍스트 청소
   * @returns {number} 삭제된 컨텍스트 수
   */
  cleanupExpiredContexts() {
    const now = new Date();
    let deletedCount = 0;
    
    for (const [userId, context] of this.contextStore.entries()) {
      if (context.expiresAt && new Date(context.expiresAt) < now) {
        this.contextStore.delete(userId);
        deletedCount++;
      }
    }
    
    return deletedCount;
  }
  
  /**
   * 컨텍스트 저장소 전체 정리
   */
  clearAllContexts() {
    this.contextStore.clear();
  }
}
