// api/chat.js - 대화 처리 API 엔드포인트
import { VertexAI } from '@google-cloud/vertexai';
import { MCPContextManager } from '../src/services/mcp-context-manager';
import { DialogAgent } from '../src/agents/dialog-agent';
import { A2ARouter } from '../src/services/a2a-router';
import { initializeAgents } from '../src/agents';
import { getFirestore } from '../src/services/firebase';

// MCP 컨텍스트 관리자 초기화
const contextManager = new MCPContextManager();

// A2A 라우터 초기화
const router = new A2ARouter();

// 모든 에이전트 초기화 및 라우터에 등록
let agents = null;

async function ensureAgentsInitialized() {
  if (!agents) {
    const db = getFirestore();
    const vertexAI = new VertexAI({
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION,
    });
    
    agents = await initializeAgents(router, contextManager, db, vertexAI);
  }
  return agents;
}

export default async function handler(req, res) {
  // POST 요청만 처리
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 요청 바디에서 필요한 데이터 추출
    const { userId, message, sessionId } = req.body;

    if (!userId || !message) {
      return res.status(400).json({ error: 'Missing required fields: userId and message are required' });
    }

    // 에이전트 초기화 확인
    await ensureAgentsInitialized();
    
    const dialogAgent = agents.dialogAgent;

    // 대화 에이전트에 사용자 메시지 전송
    const response = await dialogAgent.processUserMessage({
      userId,
      sessionId: sessionId || userId, // 세션 ID가 없으면 userId를 사용
      message,
    });

    // 응답 반환
    return res.status(200).json({
      userId,
      sessionId: sessionId || userId,
      response: response.text,
      suggestions: response.suggestions || [],
      context: response.context || {},
    });
  } catch (error) {
    console.error('Error processing chat request:', error);
    return res.status(500).json({
      error: 'Failed to process your request',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
