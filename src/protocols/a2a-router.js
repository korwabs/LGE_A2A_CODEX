/**
 * A2A 프로토콜을 위한 기본 라우터 클래스
 * 다양한 에이전트 간의 메시지 라우팅을 담당합니다.
 */
class A2ARouter {
  constructor() {
    this.agents = new Map();
    this.messageQueue = [];
    this.logger = console; // 나중에 더 좋은 로깅 시스템으로 교체 가능
  }

  /**
   * 에이전트를 등록합니다.
   * @param {string} agentId - 에이전트 식별자
   * @param {Object} agentInstance - 에이전트 인스턴스
   */
  registerAgent(agentId, agentInstance) {
    this.logger.info(`에이전트 등록: ${agentId}`);
    this.agents.set(agentId, agentInstance);
    return this;
  }

  /**
   * 메시지를 검증합니다.
   * @param {Object} message - 검증할 메시지
   * @throws {Error} 메시지가 유효하지 않을 경우 에러를 던집니다.
   */
  validateMessage(message) {
    const requiredFields = ['messageId', 'fromAgent', 'toAgent', 'messageType', 'intent', 'payload'];
    for (const field of requiredFields) {
      if (!message[field]) {
        throw new Error(`메시지 유효성 검증 실패: ${field} 필드가 없습니다.`);
      }
    }
  }

  /**
   * 메시지를 로깅합니다.
   * @param {Object} message - 로깅할 메시지
   */
  logMessage(message) {
    this.logger.info(`메시지: ${message.messageId} - 전송 [${message.fromAgent} -> ${message.toAgent}] (${message.intent})`);
    this.logger.debug('메시지 내용:', message);
  }

  /**
   * 메시지를 전송합니다.
   * @param {Object} message - 전송할 메시지
   * @returns {Promise<Object>} 대상 에이전트의 응답
   * @throws {Error} 대상 에이전트가 등록되지 않았거나 메시지가 유효하지 않을 경우 에러를 던집니다.
   */
  async sendMessage(message) {
    if (!this.agents.has(message.toAgent)) {
      throw new Error(`에이전트 ${message.toAgent}가 등록되지 않았습니다.`);
    }
    
    // 메시지 유효성 검증
    this.validateMessage(message);
    
    // 메시지 로깅
    this.logMessage(message);
    
    // 메시지 전달
    const targetAgent = this.agents.get(message.toAgent);
    try {
      const response = await targetAgent.processMessage(message);
      this.logger.info(`메시지: ${message.messageId} - 응답 수신 완료`);
      return response;
    } catch (error) {
      this.logger.error(`메시지 처리 오류 (${message.messageId}):`, error);
      throw error;
    }
  }
  
  /**
   * 모든 에이전트에게 메시지를 브로드캐스트합니다.
   * @param {string} fromAgent - 발신 에이전트 ID
   * @param {string} messageType - 메시지 타입
   * @param {string} intent - 메시지 의도
   * @param {Object} payload - 메시지 페이로드
   * @returns {Promise<Array>} 모든 에이전트의 응답 배열
   */
  async broadcastMessage(fromAgent, messageType, intent, payload) {
    const promises = [];
    const timestamp = new Date().toISOString();
    
    for (const [agentId, agent] of this.agents.entries()) {
      if (agentId !== fromAgent) {
        const message = {
          messageId: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          fromAgent,
          toAgent: agentId,
          messageType,
          intent,
          payload,
          timestamp
        };
        
        promises.push(this.sendMessage(message));
      }
    }
    
    return await Promise.all(promises);
  }
}

module.exports = A2ARouter;
