// src/services/a2a-router.js - A2A 라우터 서비스
/**
 * A2A(Agent-to-Agent) 메시지 라우터 클래스
 * 에이전트 간 메시지 라우팅 및 통신 관리
 */
export class A2ARouter {
  constructor() {
    this.agents = new Map();
    this.messageQueue = [];
    this.messageLogEnabled = process.env.NODE_ENV === 'development';
  }

  /**
   * 에이전트 등록
   * @param {string} agentId 에이전트 식별자
   * @param {Object} agentInstance 에이전트 인스턴스
   */
  registerAgent(agentId, agentInstance) {
    this.agents.set(agentId, agentInstance);
    if (this.messageLogEnabled) {
      console.log(`Agent registered: ${agentId}`);
    }
  }

  /**
   * 에이전트 등록 해제
   * @param {string} agentId 에이전트 식별자
   */
  unregisterAgent(agentId) {
    this.agents.delete(agentId);
    if (this.messageLogEnabled) {
      console.log(`Agent unregistered: ${agentId}`);
    }
  }

  /**
   * 등록된 에이전트 가져오기
   * @param {string} agentId 에이전트 식별자
   * @returns {Object} 에이전트 인스턴스
   */
  getAgent(agentId) {
    if (!this.agents.has(agentId)) {
      throw new Error(`Agent ${agentId} not registered`);
    }
    return this.agents.get(agentId);
  }

  /**
   * 메시지 전송
   * @param {Object} message A2A 메시지 객체
   * @returns {Promise<Object>} 목적지 에이전트의 응답
   */
  async sendMessage(message) {
    if (!message.messageId) {
      message.messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    
    if (!message.timestamp) {
      message.timestamp = new Date().toISOString();
    }
    
    if (!this.agents.has(message.toAgent)) {
      throw new Error(`Agent ${message.toAgent} not registered`);
    }
    
    // 메시지 유효성 검증
    this.validateMessage(message);
    
    // 메시지 로깅
    this.logMessage(message);
    
    // 메시지 큐에 추가
    this.messageQueue.push(message);
    
    // 메시지 전달
    const targetAgent = this.agents.get(message.toAgent);
    return await targetAgent.processMessage(message);
  }
  
  /**
   * 메시지 브로드캐스트
   * @param {string} fromAgent 발신 에이전트 ID
   * @param {string} messageType 메시지 유형
   * @param {string} intent 메시지 의도
   * @param {Object} payload 메시지 페이로드
   * @returns {Promise<Array>} 각 에이전트의 응답 배열
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
  
  /**
   * 메시지 유효성 검증
   * @param {Object} message A2A 메시지 객체
   * @throws {Error} 유효하지 않은 메시지 형식인 경우
   */
  validateMessage(message) {
    const requiredFields = ['fromAgent', 'toAgent', 'messageType', 'intent'];
    
    for (const field of requiredFields) {
      if (!message[field]) {
        throw new Error(`Invalid message: missing required field '${field}'`);
      }
    }
    
    if (!message.payload && message.messageType !== 'ping') {
      throw new Error('Invalid message: missing payload');
    }
  }
  
  /**
   * 메시지 로깅
   * @param {Object} message A2A 메시지 객체
   */
  logMessage(message) {
    if (this.messageLogEnabled) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        messageId: message.messageId,
        from: message.fromAgent,
        to: message.toAgent,
        type: message.messageType,
        intent: message.intent
      };
      
      console.log(`A2A Message: ${JSON.stringify(logEntry)}`);
    }
  }
  
  /**
   * 메시지 큐 가져오기
   * @param {number} limit 가져올 메시지 수 (기본값: 10)
   * @returns {Array} 메시지 배열
   */
  getMessageQueue(limit = 10) {
    return this.messageQueue.slice(-limit);
  }
  
  /**
   * 에이전트 간 통신 지연시간 시뮬레이션 (개발 모드에서만 활성화)
   * @param {number} minMs 최소 지연시간 (밀리초)
   * @param {number} maxMs 최대 지연시간 (밀리초)
   * @returns {Promise<void>}
   */
  async simulateNetworkDelay(minMs = 50, maxMs = 200) {
    if (this.messageLogEnabled) {
      const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
