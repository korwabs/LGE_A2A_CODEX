// src/agents/base-agent.js - 기본 에이전트 클래스
/**
 * A2A 기본 에이전트 클래스
 * 모든 에이전트의 기본 기능을 제공
 */
export class BaseAgent {
  /**
   * 생성자
   * @param {string} agentId 에이전트 식별자
   * @param {Object} router A2A 라우터 인스턴스
   */
  constructor(agentId, router) {
    this.agentId = agentId;
    this.router = router;
    this.messageHandlers = new Map();
    
    // 라우터에 에이전트 등록
    this.router.registerAgent(agentId, this);
    
    console.log(`Agent ${agentId} initialized`);
  }
  
  /**
   * 메시지 핸들러 등록
   * @param {string} intent 처리할 메시지 의도
   * @param {Function} handler 핸들러 함수
   */
  registerMessageHandler(intent, handler) {
    this.messageHandlers.set(intent, handler);
  }
  
  /**
   * 메시지 처리
   * @param {Object} message A2A 메시지 객체
   * @returns {Promise<Object>} 응답 메시지
   * @throws {Error} 핸들러가 없는 경우
   */
  async processMessage(message) {
    if (!this.messageHandlers.has(message.intent)) {
      throw new Error(`No handler registered for intent: ${message.intent}`);
    }
    
    const handler = this.messageHandlers.get(message.intent);
    return await handler.call(this, message);
  }
  
  /**
   * 다른 에이전트에 메시지 전송
   * @param {string} toAgent 목적지 에이전트 ID
   * @param {string} messageType 메시지 유형
   * @param {string} intent 메시지 의도
   * @param {Object} payload 메시지 페이로드
   * @returns {Promise<Object>} 목적지 에이전트의 응답
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
  
  /**
   * 모든 에이전트에 브로드캐스트 메시지 전송
   * @param {string} messageType 메시지 유형
   * @param {string} intent 메시지 의도
   * @param {Object} payload 메시지 페이로드
   * @returns {Promise<Array>} 각 에이전트의 응답 배열
   */
  async broadcastMessage(messageType, intent, payload) {
    return await this.router.broadcastMessage(
      this.agentId,
      messageType,
      intent,
      payload
    );
  }
  
  /**
   * 에이전트 초기화
   * @returns {Promise<void>}
   */
  async initialize() {
    // 자식 클래스에서 필요한 경우 오버라이드
    console.log(`Agent ${this.agentId} setup completed`);
  }
  
  /**
   * 에이전트 정리
   * @returns {Promise<void>}
   */
  async cleanup() {
    // 라우터에서 에이전트 등록 해제
    this.router.unregisterAgent(this.agentId);
    console.log(`Agent ${this.agentId} cleaned up`);
  }
  
  /**
   * 에이전트 상태 가져오기
   * @returns {Object} 에이전트 상태
   */
  getStatus() {
    return {
      agentId: this.agentId,
      registeredHandlers: Array.from(this.messageHandlers.keys()),
      isActive: true,
      timestamp: new Date().toISOString()
    };
  }
}
