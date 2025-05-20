/**
 * A2A 에이전트 기본 클래스
 * 모든 에이전트의 기본 기능을 제공합니다.
 */
class A2ABaseAgent {
  /**
   * A2A 에이전트 생성자
   * @param {string} agentId - 에이전트 식별자
   * @param {object} router - A2A 라우터 인스턴스
   */
  constructor(agentId, router) {
    this.agentId = agentId;
    this.router = router;
    this.messageHandlers = new Map();
    
    // 라우터에 자기 자신을 등록
    if (router) {
      router.registerAgent(agentId, this);
    }
    
    this.logger = console; // 나중에 더 좋은 로깅 시스템으로 교체 가능
  }
  
  /**
   * 메시지 핸들러를 등록합니다.
   * @param {string} intent - 처리할 메시지 의도
   * @param {Function} handler - 메시지 처리 함수
   */
  registerMessageHandler(intent, handler) {
    this.logger.info(`에이전트 ${this.agentId}: '${intent}' 의도에 대한 핸들러 등록`);
    this.messageHandlers.set(intent, handler);
  }
  
  /**
   * 메시지를 처리합니다.
   * @param {Object} message - 처리할 메시지
   * @returns {Promise<Object>} 처리 결과
   * @throws {Error} 등록된 핸들러가 없을 경우 에러를 던집니다.
   */
  async processMessage(message) {
    this.logger.info(`에이전트 ${this.agentId}: '${message.intent}' 메시지 처리 시작`);
    
    if (!this.messageHandlers.has(message.intent)) {
      throw new Error(`에이전트 ${this.agentId}: '${message.intent}' 의도를 처리할 핸들러가 없습니다.`);
    }
    
    const handler = this.messageHandlers.get(message.intent);
    try {
      const result = await handler(message);
      this.logger.info(`에이전트 ${this.agentId}: '${message.intent}' 메시지 처리 완료`);
      return result;
    } catch (error) {
      this.logger.error(`에이전트 ${this.agentId}: 메시지 처리 오류:`, error);
      throw error;
    }
  }
  
  /**
   * 다른 에이전트에 메시지를 전송합니다.
   * @param {string} toAgent - 수신 에이전트 ID
   * @param {string} messageType - 메시지 타입
   * @param {string} intent - 메시지 의도
   * @param {Object} payload - 메시지 페이로드
   * @returns {Promise<Object>} 수신 에이전트의 응답
   */
  async sendMessage(toAgent, messageType, intent, payload) {
    const message = {
      messageId: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      fromAgent: this.agentId,
      toAgent,
      messageType,
      intent,
      payload,
      timestamp: new Date().toISOString()
    };
    
    return await this.router.sendMessage(message);
  }
}

module.exports = A2ABaseAgent;
