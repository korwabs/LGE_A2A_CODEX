/**
 * 대화 인터페이스 라우터
 */
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// 서비스 및 에이전트 의존성
let dialogAgent;
let sessionService;

/**
 * 의존성 주입
 * @param {Object} services - 서비스 객체
 * @param {Object} agents - 에이전트 객체
 */
const init = (services, agents) => {
  dialogAgent = agents.dialogAgent;
  sessionService = services.sessionService;
};

/**
 * 세션 ID 확인 및 생성
 * @param {Object} req - 요청 객체
 * @returns {string} 세션 ID
 */
const ensureSessionId = async (req) => {
  let sessionId = req.headers['x-session-id'] || req.body.sessionId;
  
  // 세션 ID가 없거나 유효하지 않은 경우 새로 생성
  if (!sessionId || !(await sessionService.getSession(sessionId))) {
    sessionId = uuidv4();
    await sessionService.createSession(sessionId);
  }
  
  return sessionId;
};

/**
 * 대화 메시지 처리 API
 */
router.post('/message', async (req, res, next) => {
  try {
    const { message } = req.body;
    const language = req.body.language || req.headers['accept-language'] || 'pt-BR';
    
    if (!message) {
      return res.status(400).json({
        status: 'error',
        message: '메시지가 필요합니다.'
      });
    }
    
    // 세션 ID 확인
    const sessionId = await ensureSessionId(req);
    
    // 대화 에이전트에 메시지 전송
    const response = await dialogAgent.processUserMessage(sessionId, message, language);
    
    // 응답에 세션 ID 추가
    response.sessionId = sessionId;
    
    res.json({
      status: 'success',
      data: response
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 세션 초기화 API
 */
router.post('/session', async (req, res, next) => {
  try {
    const language = req.body.language || req.headers['accept-language'] || 'pt-BR';
    
    // 새 세션 생성
    const sessionId = uuidv4();
    await sessionService.createSession(sessionId);
    
    // 환영 메시지 생성
    const welcomeMessage = language === 'pt-BR'
      ? 'Olá! Sou o assistente de compras LG. Como posso ajudá-lo hoje?'
      : '안녕하세요! LG 쇼핑 어시스턴트입니다. 오늘 어떻게 도와드릴까요?';
    
    res.json({
      status: 'success',
      data: {
        sessionId,
        message: welcomeMessage
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 대화 기록 조회 API
 */
router.get('/history/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    
    if (!sessionId) {
      return res.status(400).json({
        status: 'error',
        message: '세션 ID가 필요합니다.'
      });
    }
    
    // 세션 조회
    const session = await sessionService.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        status: 'error',
        message: '세션을 찾을 수 없습니다.'
      });
    }
    
    // 대화 기록 조회
    const history = await sessionService.getConversationHistory(sessionId, limit);
    
    res.json({
      status: 'success',
      data: {
        sessionId,
        history
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.init = init;
