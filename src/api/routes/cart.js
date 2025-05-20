/**
 * 장바구니 관리 라우터
 */
const express = require('express');
const router = express.Router();

// 서비스 및 에이전트 의존성
let sessionService;
let cartAgent;

/**
 * 의존성 주입
 * @param {Object} services - 서비스 객체
 * @param {Object} agents - 에이전트 객체
 */
const init = (services, agents) => {
  sessionService = services.sessionService;
  cartAgent = agents.cartAgent;
};

/**
 * 세션 ID 확인 미들웨어
 */
const requireSessionId = async (req, res, next) => {
  const sessionId = req.headers['x-session-id'] || req.body.sessionId;
  
  if (!sessionId) {
    return res.status(400).json({
      status: 'error',
      message: '세션 ID가 필요합니다.'
    });
  }
  
  // 세션 존재 여부 확인
  const session = await sessionService.getSession(sessionId);
  if (!session) {
    return res.status(404).json({
      status: 'error',
      message: '세션을 찾을 수 없습니다.'
    });
  }
  
  req.sessionId = sessionId;
  next();
};

/**
 * 장바구니 조회 API
 */
router.get('/', requireSessionId, async (req, res, next) => {
  try {
    const { sessionId } = req;
    
    // 장바구니 조회
    const cart = await sessionService.getCart(sessionId);
    
    res.json({
      status: 'success',
      data: cart
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 장바구니에 제품 추가 API
 */
router.post('/items', requireSessionId, async (req, res, next) => {
  try {
    const { sessionId } = req;
    const { productId, quantity = 1 } = req.body;
    const language = req.body.language || req.headers['accept-language'] || 'pt-BR';
    
    if (!productId) {
      return res.status(400).json({
        status: 'error',
        message: '제품 ID가 필요합니다.'
      });
    }
    
    // 장바구니 에이전트에 메시지 전송
    const result = await cartAgent.processMessage({
      intent: 'addToCart',
      payload: {
        sessionId,
        productId,
        quantity: parseInt(quantity),
        language
      }
    });
    
    if (!result.success) {
      return res.status(400).json({
        status: 'error',
        message: result.response || '장바구니에 제품을 추가할 수 없습니다.',
        code: result.error
      });
    }
    
    res.json({
      status: 'success',
      data: {
        cart: result.cart,
        message: result.response
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 장바구니에서 제품 제거 API
 */
router.delete('/items/:productId', requireSessionId, async (req, res, next) => {
  try {
    const { sessionId } = req;
    const { productId } = req.params;
    const language = req.query.language || req.headers['accept-language'] || 'pt-BR';
    
    if (!productId) {
      return res.status(400).json({
        status: 'error',
        message: '제품 ID가 필요합니다.'
      });
    }
    
    // 장바구니 에이전트에 메시지 전송
    const result = await cartAgent.processMessage({
      intent: 'removeFromCart',
      payload: {
        sessionId,
        productId,
        language
      }
    });
    
    if (!result.success) {
      return res.status(400).json({
        status: 'error',
        message: result.response || '장바구니에서 제품을 제거할 수 없습니다.',
        code: result.error
      });
    }
    
    res.json({
      status: 'success',
      data: {
        cart: result.cart,
        message: result.response
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 장바구니 제품 수량 업데이트 API
 */
router.put('/items/:productId', requireSessionId, async (req, res, next) => {
  try {
    const { sessionId } = req;
    const { productId } = req.params;
    const { quantity } = req.body;
    const language = req.body.language || req.headers['accept-language'] || 'pt-BR';
    
    if (!productId) {
      return res.status(400).json({
        status: 'error',
        message: '제품 ID가 필요합니다.'
      });
    }
    
    if (quantity === undefined) {
      return res.status(400).json({
        status: 'error',
        message: '수량이 필요합니다.'
      });
    }
    
    // 장바구니 에이전트에 메시지 전송
    const result = await cartAgent.processMessage({
      intent: 'updateCartQuantity',
      payload: {
        sessionId,
        productId,
        quantity: parseInt(quantity),
        language
      }
    });
    
    if (!result.success) {
      return res.status(400).json({
        status: 'error',
        message: result.response || '장바구니 수량을 업데이트할 수 없습니다.',
        code: result.error
      });
    }
    
    res.json({
      status: 'success',
      data: {
        cart: result.cart,
        message: result.response
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 장바구니 비우기 API
 */
router.delete('/', requireSessionId, async (req, res, next) => {
  try {
    const { sessionId } = req;
    const language = req.query.language || req.headers['accept-language'] || 'pt-BR';
    
    // 장바구니 에이전트에 메시지 전송
    const result = await cartAgent.processMessage({
      intent: 'clearCart',
      payload: {
        sessionId,
        language
      }
    });
    
    if (!result.success) {
      return res.status(400).json({
        status: 'error',
        message: result.response || '장바구니를 비울 수 없습니다.',
        code: result.error
      });
    }
    
    res.json({
      status: 'success',
      data: {
        cart: result.cart,
        message: result.response
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 장바구니에서 구매로 진행 API
 */
router.post('/checkout', requireSessionId, async (req, res, next) => {
  try {
    const { sessionId } = req;
    const language = req.body.language || req.headers['accept-language'] || 'pt-BR';
    
    // 장바구니 에이전트에 메시지 전송
    const result = await cartAgent.processMessage({
      intent: 'proceedToCheckout',
      payload: {
        sessionId,
        language
      }
    });
    
    if (!result.success) {
      return res.status(400).json({
        status: 'error',
        message: result.response || '구매를 진행할 수 없습니다.',
        code: result.error
      });
    }
    
    res.json({
      status: 'success',
      data: {
        checkoutUrl: result.checkoutUrl,
        message: result.response
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.init = init;
