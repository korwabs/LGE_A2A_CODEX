/**
 * MCP(Model Context Protocol) 컨텍스트 관리 클래스
 * LLM과의 효율적인 컨텍스트 관리를 위한 프로토콜을 제공합니다.
 */
class MCPContextManager {
  constructor() {
    this.templateCache = new Map();
    this.contextStore = new Map();
    this.logger = console; // 나중에 더 좋은 로깅 시스템으로 교체 가능
  }
  
  /**
   * 프롬프트 템플릿을 등록합니다.
   * @param {string} templateId - 템플릿 식별자
   * @param {string} template - 템플릿 내용
   */
  registerTemplate(templateId, template) {
    this.logger.info(`템플릿 등록: ${templateId}`);
    this.templateCache.set(templateId, template);
    return this;
  }
  
  /**
   * 사용자별 컨텍스트를 저장합니다.
   * @param {string} userId - 사용자 식별자
   * @param {Object} contextData - 컨텍스트 데이터
   */
  storeContext(userId, contextData) {
    this.logger.debug(`사용자 ${userId}의 컨텍스트 저장:`, contextData);
    
    const existingContext = this.contextStore.get(userId) || {};
    this.contextStore.set(userId, {
      ...existingContext,
      ...contextData,
      updatedAt: new Date().toISOString()
    });
    
    return this;
  }
  
  /**
   * 사용자 컨텍스트를 조회합니다.
   * @param {string} userId - 사용자 식별자
   * @returns {Object} 사용자 컨텍스트
   */
  getContext(userId) {
    return this.contextStore.get(userId) || {};
  }
  
  /**
   * 컨텍스트 기반 프롬프트를 생성합니다.
   * @param {string} userId - 사용자 식별자
   * @param {string} templateId - 템플릿 식별자
   * @param {Object} additionalData - 추가 데이터
   * @returns {string} 생성된 프롬프트
   * @throws {Error} 템플릿이 존재하지 않을 경우 에러를 던집니다.
   */
  generatePrompt(userId, templateId, additionalData = {}) {
    if (!this.templateCache.has(templateId)) {
      throw new Error(`템플릿 ${templateId}을(를) 찾을 수 없습니다.`);
    }
    
    const template = this.templateCache.get(templateId);
    const userContext = this.contextStore.get(userId) || {};
    
    const contextData = {
      ...userContext,
      ...additionalData
    };
    
    // 템플릿의 플레이스홀더를 데이터로 대체
    const prompt = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return contextData[key] !== undefined ? contextData[key] : match;
    });
    
    this.logger.debug(`사용자 ${userId}를 위한 '${templateId}' 프롬프트 생성 완료`);
    return prompt;
  }
  
  /**
   * 컨텍스트의 일부를 업데이트합니다.
   * @param {string} userId - 사용자 식별자
   * @param {string} key - 업데이트할 키
   * @param {any} value - 새로운 값
   */
  updateContext(userId, key, value) {
    const currentContext = this.contextStore.get(userId) || {};
    currentContext[key] = value;
    currentContext.updatedAt = new Date().toISOString();
    this.contextStore.set(userId, currentContext);
    
    this.logger.debug(`사용자 ${userId}의 컨텍스트 키 '${key}' 업데이트`);
    return this;
  }
  
  /**
   * 사용자 컨텍스트를 비웁니다.
   * @param {string} userId - 사용자 식별자
   */
  clearContext(userId) {
    this.contextStore.delete(userId);
    this.logger.info(`사용자 ${userId}의 컨텍스트 삭제`);
    return this;
  }
}

module.exports = MCPContextManager;
