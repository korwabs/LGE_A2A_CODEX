/**
 * 세션 관리 라우터
 */
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// 서비스 의존성
let sessionService;

/**
 * 의존성 주입
 * @param {Object} services - 서비스 객체
 * @param {Object} agents - 에이전트 객체
 */
const init = (services, agents) => {
  sessionService = services.sessionService;
};

/**
 * 세션 생성 API
 */
router.post('/', async (req, res, next) => {
  try {
    // 새 세션 ID 생성
    const sessionId = req.body.sessionId || uuidv4();
    const language = req.body.language || req.headers['accept-language'] || 'pt-BR';
    
    // 기존 세션 확인
    const existingSession = await sessionService.getSession(sessionId);
    
    if (existingSession) {
      return res.json({
        status: 'success',
        data: {
          sessionId,
          new: false,
          message: language === 'pt-BR'
            ? 'Sessão existente recuperada'
            : '기존 세션을 복구했습니다.'
        }
      });
    }
    
    // 새 세션 생성
    await sessionService.createSession(sessionId, {
      createdAt: new Date(),
      language
    });
    
    // 환영 메시지
    const welcomeMessage = language === 'pt-BR'
      ? 'Olá! Sou o assistente de compras LG. Como posso ajudá-lo hoje?'
      : '안녕하세요! LG 쇼핑 어시스턴트입니다. 오늘 어떻게 도와드릴까요?';
    
    res.json({
      status: 'success',
      data: {
        sessionId,
        new: true,
        message: welcomeMessage
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 세션 정보 조회 API
 */
router.get('/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    
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
    
    res.json({
      status: 'success',
      data: {
        sessionId,
        session
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 세션 설정 업데이트 API
 */
router.put('/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { language, preferences } = req.body;
    
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
    
    // 세션 업데이트
    const updates = {};
    
    if (language) {
      updates.language = language;
    }
    
    if (preferences) {
      updates.preferences = { ...session.preferences, ...preferences };
    }
    
    if (Object.keys(updates).length > 0) {
      await sessionService.updateSession(sessionId, updates);
    }
    
    // 업데이트된 세션 조회
    const updatedSession = await sessionService.getSession(sessionId);
    
    res.json({
      status: 'success',
      data: {
        sessionId,
        session: updatedSession
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 세션 삭제 API
 */
router.delete('/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    
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
    
    // 세션 삭제
    await sessionService.deleteSession(sessionId);
    
    res.json({
      status: 'success',
      data: {
        sessionId,
        message: '세션이 삭제되었습니다.'
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 세션 활성화 API (세션 만료 방지)
 */
router.post('/:sessionId/heartbeat', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    
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
    
    // 세션 만료 시간 업데이트
    await sessionService.updateSession(sessionId, {
      lastActivity: new Date()
    });
    
    res.json({
      status: 'success',
      data: {
        sessionId,
        message: '세션이 활성화되었습니다.'
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.init = init;
