// src/agents/context-manager/index.js - Context Manager 모듈 진입점
import { ContextManagerAgent } from './context-manager-agent';

// Context Manager Agent 인스턴스
let contextManagerInstance = null;

/**
 * Context Manager Agent 초기화
 * @param {string} agentId 에이전트 ID
 * @param {Object} router A2A 라우터 인스턴스
 * @param {Object} db Firestore 인스턴스
 * @returns {Object} Context Manager Agent 인스턴스
 */
export async function initializeContextManager(agentId, router, db) {
  if (contextManagerInstance) {
    return contextManagerInstance;
  }

  // Context Manager Agent 생성
  contextManagerInstance = new ContextManagerAgent(agentId, router, db);
  
  // 초기화
  await contextManagerInstance.initialize();
  
  return contextManagerInstance;
}

/**
 * Context Manager Agent 인스턴스 가져오기
 * @returns {Object} Context Manager Agent 인스턴스
 * @throws {Error} Context Manager가 초기화되지 않은 경우
 */
export function getContextManager() {
  if (!contextManagerInstance) {
    throw new Error('Context Manager not initialized. Call initializeContextManager first.');
  }
  return contextManagerInstance;
}

export { ContextManagerAgent };
