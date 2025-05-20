/**
 * 장바구니 연동 에이전트
 * LG 쇼핑몰의 장바구니 기능과 A2A 시스템 연동을 담당합니다.
 */
const A2ABaseAgent = require('../../protocols/a2a-base-agent');

class CartAgent extends A2ABaseAgent {
  /**
   * 생성자
   * @param {Object} router - A2A 라우터 인스턴스
   * @param {Object} mcpPromptManager - MCP 프롬프트 관리자
   * @param {Object} sessionService - 세션 관리 서비스
   * @param {Object} searchService - 검색 서비스
   * @param {Object} crawlingService - 크롤링 서비스
   */
  constructor(router, mcpPromptManager, sessionService, searchService, crawlingService) {
    super('cartAgent', router);
    this.mcpPromptManager = mcpPromptManager;
    this.sessionService = sessionService;
    this.searchService = searchService;
    this.crawlingService = crawlingService;
    this.setupMessageHandlers();
  }
  
  /**
   * 메시지 핸들러 설정
   */
  setupMessageHandlers() {
    // 장바구니에 제품 추가 처리
    this.registerMessageHandler('addToCart', async (message) => {
      const { sessionId, productId, quantity = 1, language = 'pt-BR' } = message.payload;
      
      try {
        this.logger.info(`장바구니에 제품 추가: ${sessionId}, 제품 ID: ${productId}, 수량: ${quantity}`);
        
        // 세션 확인
        const session = await this.sessionService.getSession(sessionId);
        if (!session) {
          throw new Error(`세션을 찾을 수 없음: ${sessionId}`);
        }
        
        // 제품 정보 가져오기
        const productInfo = await this.searchService.getProductById(productId);
        if (!productInfo) {
          throw new Error(`제품을 찾을 수 없음: ${productId}`);
        }
        
        // 제품 재고 확인
        const isAvailable = await this.checkProductAvailability(productId, quantity);
        if (!isAvailable) {
          const outOfStockResponse = (language === 'pt-BR')
            ? `Desculpe, o produto "${productInfo.name}" não está disponível na quantidade solicitada. Gostaria de ser notificado quando estiver disponível?`
            : `죄송합니다, "${productInfo.name}" 제품이 요청하신 수량만큼 재고가 없습니다. 재입고 시 알림을 받으시겠어요?`;
            
          return {
            success: false,
            sessionId,
            response: outOfStockResponse,
            error: 'OUT_OF_STOCK'
          };
        }
        
        // 장바구니에 제품 추가
        const updatedCart = await this.sessionService.addToCart(sessionId, productInfo, quantity);
        
        // 장바구니에 추가 성공 응답
        const addedToCartResponse = (language === 'pt-BR')
          ? `O produto "${productInfo.name}" foi adicionado ao seu carrinho. Seu carrinho agora tem ${updatedCart.totalItems} ${updatedCart.totalItems === 1 ? 'item' : 'itens'} (R$ ${updatedCart.totalPrice.toFixed(2)}). Deseja continuar comprando ou finalizar a compra?`
          : `"${productInfo.name}" 제품이 장바구니에 추가되었습니다. 장바구니에 현재 ${updatedCart.totalItems}개 상품(R$ ${updatedCart.totalPrice.toFixed(2)})이 있습니다. 계속 쇼핑하시겠어요, 아니면 구매를 완료하시겠어요?`;
          
        return {
          success: true,
          sessionId,
          response: addedToCartResponse,
          cart: updatedCart
        };
      } catch (error) {
        this.logger.error(`장바구니 추가 오류: ${sessionId}, 제품 ID: ${productId}`, error);
        
        // 오류 처리 응답
        const errorResponse = (language === 'pt-BR')
          ? 'Desculpe, ocorreu um erro ao adicionar o produto ao carrinho. Por favor, tente novamente.'
          : '죄송합니다, 장바구니에 제품을 추가하는 중 오류가 발생했습니다. 다시 시도해 주세요.';
          
        return {
          success: false,
          sessionId,
          response: errorResponse,
          error: error.message
        };
      }
    });
    
    // 장바구니에서 제품 제거 처리
    this.registerMessageHandler('removeFromCart', async (message) => {
      const { sessionId, productId, language = 'pt-BR' } = message.payload;
      
      try {
        this.logger.info(`장바구니에서 제품 제거: ${sessionId}, 제품 ID: ${productId}`);
        
        // 세션 확인
        const session = await this.sessionService.getSession(sessionId);
        if (!session) {
          throw new Error(`세션을 찾을 수 없음: ${sessionId}`);
        }
        
        // 장바구니에서 제품 제거
        const updatedCart = await this.sessionService.removeFromCart(sessionId, productId);
        
        // 제품명 가져오기
        let productName = productId;
        try {
          const productInfo = await this.searchService.getProductById(productId);
          if (productInfo) {
            productName = productInfo.name;
          }
        } catch (error) {
          this.logger.warn(`제품 정보 가져오기 실패: ${productId}`, error);
        }
        
        // 장바구니에서 제거 성공 응답
        const removedFromCartResponse = (language === 'pt-BR')
          ? `O produto "${productName}" foi removido do seu carrinho. ${updatedCart.totalItems > 0 ? `Seu carrinho agora tem ${updatedCart.totalItems} ${updatedCart.totalItems === 1 ? 'item' : 'itens'} (R$ ${updatedCart.totalPrice.toFixed(2)}).` : 'Seu carrinho está vazio.'}`
          : `"${productName}" 제품이 장바구니에서 제거되었습니다. ${updatedCart.totalItems > 0 ? `장바구니에 현재 ${updatedCart.totalItems}개 상품(R$ ${updatedCart.totalPrice.toFixed(2)})이 있습니다.` : '장바구니가 비어 있습니다.'}`;
          
        return {
          success: true,
          sessionId,
          response: removedFromCartResponse,
          cart: updatedCart
        };
      } catch (error) {
        this.logger.error(`장바구니 제거 오류: ${sessionId}, 제품 ID: ${productId}`, error);
        
        // 오류 처리 응답
        const errorResponse = (language === 'pt-BR')
          ? 'Desculpe, ocorreu um erro ao remover o produto do carrinho. Por favor, tente novamente.'
          : '죄송합니다, 장바구니에서 제품을 제거하는 중 오류가 발생했습니다. 다시 시도해 주세요.';
          
        return {
          success: false,
          sessionId,
          response: errorResponse,
          error: error.message
        };
      }
    });
    
    // 장바구니 수량 업데이트 처리
    this.registerMessageHandler('updateCartQuantity', async (message) => {
      const { sessionId, productId, quantity, language = 'pt-BR' } = message.payload;
      
      try {
        this.logger.info(`장바구니 수량 업데이트: ${sessionId}, 제품 ID: ${productId}, 수량: ${quantity}`);
        
        // 세션 확인
        const session = await this.sessionService.getSession(sessionId);
        if (!session) {
          throw new Error(`세션을 찾을 수 없음: ${sessionId}`);
        }
        
        // 제품 정보 가져오기
        const productInfo = await this.searchService.getProductById(productId);
        if (!productInfo) {
          throw new Error(`제품을 찾을 수 없음: ${productId}`);
        }
        
        // 제품 재고 확인
        if (quantity > 0) {
          const isAvailable = await this.checkProductAvailability(productId, quantity);
          if (!isAvailable) {
            const outOfStockResponse = (language === 'pt-BR')
              ? `Desculpe, o produto "${productInfo.name}" não está disponível na quantidade solicitada. A quantidade máxima disponível será adicionada ao seu carrinho.`
              : `죄송합니다, "${productInfo.name}" 제품이 요청하신 수량만큼 재고가 없습니다. 가능한 최대 수량이 장바구니에 추가됩니다.`;
              
            return {
              success: false,
              sessionId,
              response: outOfStockResponse,
              error: 'OUT_OF_STOCK'
            };
          }
        }
        
        // 장바구니 수량 업데이트
        const updatedCart = await this.sessionService.updateCartQuantity(sessionId, productId, quantity);
        
        // 장바구니 수량 업데이트 성공 응답
        const updatedCartResponse = (language === 'pt-BR')
          ? `A quantidade do produto "${productInfo.name}" foi atualizada para ${quantity}. Seu carrinho agora tem ${updatedCart.totalItems} ${updatedCart.totalItems === 1 ? 'item' : 'itens'} (R$ ${updatedCart.totalPrice.toFixed(2)}).`
          : `"${productInfo.name}" 제품의 수량이 ${quantity}개로 업데이트되었습니다. 장바구니에 현재 ${updatedCart.totalItems}개 상품(R$ ${updatedCart.totalPrice.toFixed(2)})이 있습니다.`;
          
        return {
          success: true,
          sessionId,
          response: updatedCartResponse,
          cart: updatedCart
        };
      } catch (error) {
        this.logger.error(`장바구니 수량 업데이트 오류: ${sessionId}, 제품 ID: ${productId}`, error);
        
        // 오류 처리 응답
        const errorResponse = (language === 'pt-BR')
          ? 'Desculpe, ocorreu um erro ao atualizar a quantidade do produto no carrinho. Por favor, tente novamente.'
          : '죄송합니다, 장바구니에서 제품 수량을 업데이트하는 중 오류가 발생했습니다. 다시 시도해 주세요.';
          
        return {
          success: false,
          sessionId,
          response: errorResponse,
          error: error.message
        };
      }
    });
    
    // 장바구니 조회 처리
    this.registerMessageHandler('getCart', async (message) => {
      const { sessionId, language = 'pt-BR' } = message.payload;
      
      try {
        this.logger.info(`장바구니 조회: ${sessionId}`);
        
        // 세션 확인
        const session = await this.sessionService.getSession(sessionId);
        if (!session) {
          throw new Error(`세션을 찾을 수 없음: ${sessionId}`);
        }
        
        // 장바구니 조회
        const cart = await this.sessionService.getCart(sessionId);
        
        // 장바구니가 비어 있는 경우
        if (cart.items.length === 0) {
          const emptyCartResponse = (language === 'pt-BR')
            ? 'Seu carrinho está vazio. Gostaria de ver alguns produtos recomendados?'
            : '장바구니가 비어 있습니다. 추천 제품을 보시겠어요?';
            
          return {
            success: true,
            sessionId,
            response: emptyCartResponse,
            cart
          };
        }
        
        // 장바구니 내용 요약 생성
        const cartSummary = await this.generateCartSummary(cart, language);
        
        return {
          success: true,
          sessionId,
          response: cartSummary,
          cart
        };
      } catch (error) {
        this.logger.error(`장바구니 조회 오류: ${sessionId}`, error);
        
        // 오류 처리 응답
        const errorResponse = (language === 'pt-BR')
          ? 'Desculpe, ocorreu um erro ao consultar seu carrinho. Por favor, tente novamente.'
          : '죄송합니다, 장바구니를 조회하는 중 오류가 발생했습니다. 다시 시도해 주세요.';
          
        return {
          success: false,
          sessionId,
          response: errorResponse,
          error: error.message
        };
      }
    });
    
    // 장바구니 비우기 처리
    this.registerMessageHandler('clearCart', async (message) => {
      const { sessionId, language = 'pt-BR' } = message.payload;
      
      try {
        this.logger.info(`장바구니 비우기: ${sessionId}`);
        
        // 세션 확인
        const session = await this.sessionService.getSession(sessionId);
        if (!session) {
          throw new Error(`세션을 찾을 수 없음: ${sessionId}`);
        }
        
        // 장바구니 비우기
        const emptyCart = await this.sessionService.clearCart(sessionId);
        
        // 장바구니 비우기 성공 응답
        const clearedCartResponse = (language === 'pt-BR')
          ? 'Seu carrinho foi esvaziado. Gostaria de ver alguns produtos recomendados?'
          : '장바구니가 비워졌습니다. 추천 제품을 보시겠어요?';
          
        return {
          success: true,
          sessionId,
          response: clearedCartResponse,
          cart: emptyCart
        };
      } catch (error) {
        this.logger.error(`장바구니 비우기 오류: ${sessionId}`, error);
        
        // 오류 처리 응답
        const errorResponse = (language === 'pt-BR')
          ? 'Desculpe, ocorreu um erro ao esvaziar seu carrinho. Por favor, tente novamente.'
          : '죄송합니다, 장바구니를 비우는 중 오류가 발생했습니다. 다시 시도해 주세요.';
          
        return {
          success: false,
          sessionId,
          response: errorResponse,
          error: error.message
        };
      }
    });
    
    // 장바구니에서 구매로 진행 처리
    this.registerMessageHandler('proceedToCheckout', async (message) => {
      const { sessionId, language = 'pt-BR' } = message.payload;
      
      try {
        this.logger.info(`장바구니에서 구매로 진행: ${sessionId}`);
        
        // 세션 확인
        const session = await this.sessionService.getSession(sessionId);
        if (!session) {
          throw new Error(`세션을 찾을 수 없음: ${sessionId}`);
        }
        
        // 장바구니 조회
        const cart = await this.sessionService.getCart(sessionId);
        
        // 장바구니가 비어 있는 경우
        if (cart.items.length === 0) {
          const emptyCartResponse = (language === 'pt-BR')
            ? 'Seu carrinho está vazio. Adicione produtos antes de finalizar a compra.'
            : '장바구니가 비어 있습니다. 구매를 진행하기 전에 제품을 추가해 주세요.';
            
          return {
            success: false,
            sessionId,
            response: emptyCartResponse,
            error: 'EMPTY_CART'
          };
        }
        
        // 구매 프로세스 에이전트에 요청 전달
        return await this.sendMessage(
          'purchaseProcessAgent',
          'request',
          'initiatePurchase',
          {
            sessionId,
            productId: null, // 장바구니에서 구매 시작
            userMessage: '',
            language
          }
        );
      } catch (error) {
        this.logger.error(`구매 진행 오류: ${sessionId}`, error);
        
        // 오류 처리 응답
        const errorResponse = (language === 'pt-BR')
          ? 'Desculpe, ocorreu um erro ao iniciar o processo de compra. Por favor, tente novamente.'
          : '죄송합니다, 구매 프로세스를 시작하는 중 오류가 발생했습니다. 다시 시도해 주세요.';
          
        return {
          success: false,
          sessionId,
          response: errorResponse,
          error: error.message
        };
      }
    });
    
    // 사용자 의도에서 장바구니 작업 추출 처리
    this.registerMessageHandler('extractCartIntent', async (message) => {
      const { sessionId, userMessage, language = 'pt-BR' } = message.payload;
      
      try {
        this.logger.info(`장바구니 의도 추출: ${sessionId}`);
        
        // MCP 프롬프트를 사용하여 의도 추출
        const prompt = `
          당신은 LG 브라질 쇼핑 어시스턴트의 의도 분석 담당입니다.
          
          # 사용자 메시지
          ${userMessage}
          
          # 지시사항
          사용자 메시지에서 장바구니 관련 의도를 추출하세요.
          다음 중 가장 적합한 의도와 관련 정보를 JSON 형식으로 반환하세요:
          
          1. 장바구니에 추가 (addToCart): 제품 ID와 수량 추출
          2. 장바구니에서 제거 (removeFromCart): 제품 ID 추출
          3. 장바구니 수량 변경 (updateCartQuantity): 제품 ID와 수량 추출
          4. 장바구니 조회 (getCart): 추가 정보 필요 없음
          5. 장바구니 비우기 (clearCart): 추가 정보 필요 없음
          6. 구매 진행 (proceedToCheckout): 추가 정보 필요 없음
          7. 장바구니 관련 아님 (notCartRelated): 추가 정보 필요 없음
          
          반환 형식: 
          {
            "intent": "의도",
            "productId": "제품 ID", // 해당하는 경우만
            "quantity": 수량, // 해당하는 경우만
            "confidence": 0.0-1.0 // 의도 확신도
          }
        `;
        
        // Gemini를 사용하여 의도 추출
        const responseText = await this.mcpPromptManager.generateGeminiResponse(
          sessionId,
          'extractCartIntent',
          {
            userMessage,
            language
          }
        );
        
        // JSON 형식 응답에서 의도 정보 파싱
        try {
          const intentInfo = JSON.parse(responseText);
          
          // 사용자 의도에 따른 처리
          if (intentInfo.intent !== 'notCartRelated' && intentInfo.confidence >= 0.7) {
            // 의도가 감지되고 신뢰도가 높은 경우, 해당 액션 실행
            return await this.processCartAction(sessionId, intentInfo, language);
          } else {
            // 장바구니 관련 의도가 아니거나 신뢰도가 낮은 경우
            return {
              success: false,
              sessionId,
              response: null,
              intent: intentInfo.intent,
              confidence: intentInfo.confidence
            };
          }
        } catch (error) {
          this.logger.error('JSON 파싱 오류:', error);
          
          // 의도 추출 실패
          return {
            success: false,
            sessionId,
            response: null,
            error: 'PARSING_ERROR'
          };
        }
      } catch (error) {
        this.logger.error(`장바구니 의도 추출 오류: ${sessionId}`, error);
        
        // 오류 처리
        return {
          success: false,
          sessionId,
          response: null,
          error: error.message
        };
      }
    });
  }
  
  /**
   * 장바구니 액션 처리
   * @param {string} sessionId - 세션 ID
   * @param {Object} intentInfo - 의도 정보
   * @param {string} language - 언어 코드
   * @returns {Promise<Object>} 처리 결과
   */
  async processCartAction(sessionId, intentInfo, language) {
    try {
      const { intent, productId, quantity } = intentInfo;
      
      switch (intent) {
        case 'addToCart':
          return await this.processMessage({
            intent: 'addToCart',
            payload: { sessionId, productId, quantity: quantity || 1, language }
          });
          
        case 'removeFromCart':
          return await this.processMessage({
            intent: 'removeFromCart',
            payload: { sessionId, productId, language }
          });
          
        case 'updateCartQuantity':
          return await this.processMessage({
            intent: 'updateCartQuantity',
            payload: { sessionId, productId, quantity, language }
          });
          
        case 'getCart':
          return await this.processMessage({
            intent: 'getCart',
            payload: { sessionId, language }
          });
          
        case 'clearCart':
          return await this.processMessage({
            intent: 'clearCart',
            payload: { sessionId, language }
          });
          
        case 'proceedToCheckout':
          return await this.processMessage({
            intent: 'proceedToCheckout',
            payload: { sessionId, language }
          });
          
        default:
          // 알 수 없는 의도
          return {
            success: false,
            sessionId,
            response: null,
            error: 'UNKNOWN_INTENT'
          };
      }
    } catch (error) {
      this.logger.error(`장바구니 액션 처리 오류: ${sessionId}`, error);
      
      // 오류 처리
      return {
        success: false,
        sessionId,
        response: null,
        error: error.message
      };
    }
  }
  
  /**
   * 제품 재고 확인
   * @param {string} productId - 제품 ID
   * @param {number} quantity - 수량
   * @returns {Promise<boolean>} 재고 가능 여부
   */
  async checkProductAvailability(productId, quantity) {
    try {
      // 크롤링 서비스를 통해 제품 재고 정보 확인
      const stockInfo = await this.crawlingService.getProductStock(productId);
      
      if (!stockInfo || !stockInfo.available) {
        return false;
      }
      
      if (stockInfo.quantity !== undefined && stockInfo.quantity < quantity) {
        return false;
      }
      
      return true;
    } catch (error) {
      this.logger.error(`제품 재고 확인 오류: ${productId}`, error);
      
      // 오류 발생 시 기본적으로 재고 있다고 가정 (더 나은 사용자 경험을 위해)
      return true;
    }
  }
  
  /**
   * 장바구니 요약 생성
   * @param {Object} cart - 장바구니 정보
   * @param {string} language - 언어 코드
   * @returns {Promise<string>} 장바구니 요약
   */
  async generateCartSummary(cart, language = 'pt-BR') {
    try {
      if (!cart || !cart.items || cart.items.length === 0) {
        return (language === 'pt-BR')
          ? 'Seu carrinho está vazio. Gostaria de ver alguns produtos recomendados?'
          : '장바구니가 비어 있습니다. 추천 제품을 보시겠어요?';
      }
      
      // MCP 프롬프트 템플릿을 활용한 장바구니 요약 생성
      const prompt = `
        당신은 LG 브라질 쇼핑 어시스턴트의 장바구니 관리 담당입니다.
        
        # 장바구니 정보
        ${JSON.stringify(cart, null, 2)}
        
        # 지시사항
        위 장바구니 정보를 바탕으로 사용자에게 친절한 요약을 제공하세요.
        총 제품 수, 총 금액, 각 제품의 간략한 정보를 포함하세요.
        사용자에게 다음 단계로 구매할지, 계속 쇼핑할지 물어보세요.
        ${language === 'pt-BR' ? '포르투갈어(브라질)로 응답하세요.' : '한국어로 응답하세요.'}
      `;
      
      // Gemini를 사용하여 요약 생성
      const response = await this.mcpPromptManager.generateGeminiResponse(
        'system', // 시스템 사용자 ID로 처리
        'cartSummary',
        {
          cart: JSON.stringify(cart),
          language
        }
      );
      
      return response;
    } catch (error) {
      this.logger.error('장바구니 요약 생성 오류:', error);
      
      // 오류 발생 시 기본 메시지 반환
      const itemCount = cart && cart.items ? cart.items.length : 0;
      const totalPrice = cart && cart.totalPrice ? cart.totalPrice.toFixed(2) : '0.00';
      
      return (language === 'pt-BR')
        ? `Seu carrinho tem ${itemCount} ${itemCount === 1 ? 'item' : 'itens'} no total de R$ ${totalPrice}. Deseja continuar comprando ou finalizar a compra?`
        : `장바구니에 ${itemCount}개 상품이 있으며, 총액은 R$ ${totalPrice}입니다. 계속 쇼핑하시겠어요, 아니면 구매를 완료하시겠어요?`;
    }
  }
  
  /**
   * 딥링크 생성
   * @param {string} productId - 제품 ID
   * @param {Object} options - 딥링크 옵션
   * @returns {Promise<string>} 딥링크 URL
   */
  async generateDeepLink(productId, options = {}) {
    try {
      // 기본 딥링크 URL 구성
      const baseUrl = 'https://www.lge.com/br';
      const params = new URLSearchParams();
      
      // 제품 ID 추가
      if (productId) {
        params.append('product_id', productId);
      }
      
      // 추가 옵션 처리
      for (const [key, value] of Object.entries(options)) {
        if (value !== undefined && value !== null) {
          params.append(key, value.toString());
        }
      }
      
      // 어시스턴트 표시 추가
      params.append('assistant', 'true');
      
      // 경로 구성
      let path = '/shopping/cart';
      if (options.action === 'checkout') {
        path = '/shopping/checkout';
      } else if (options.action === 'product' && productId) {
        path = `/product/${productId}`;
      }
      
      return `${baseUrl}${path}?${params.toString()}`;
    } catch (error) {
      this.logger.error(`딥링크 생성 오류: ${productId}`, error);
      
      // 오류 발생 시 기본 URL 반환
      return 'https://www.lge.com/br/shopping/cart';
    }
  }
  
  /**
   * 사용자 메시지 처리 (외부 API용)
   * @param {string} sessionId - 세션 ID
   * @param {string} userMessage - 사용자 메시지
   * @param {string} language - 언어 코드
   * @returns {Promise<Object>} 응답 객체
   */
  async processUserMessage(sessionId, userMessage, language = 'pt-BR') {
    try {
      // 장바구니 의도 추출
      const message = {
        messageId: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        fromAgent: 'api',
        toAgent: 'cartAgent',
        messageType: 'request',
        intent: 'extractCartIntent',
        payload: {
          sessionId,
          userMessage,
          language
        },
        timestamp: new Date().toISOString()
      };
      
      const intentResult = await this.processMessage(message);
      
      // 장바구니 관련 의도가 감지되었고 처리에 성공한 경우
      if (intentResult.success && intentResult.response) {
        return intentResult;
      }
      
      // 장바구니 관련 의도가 아니거나 처리에 실패한 경우
      return {
        success: false,
        sessionId,
        response: null,
        handled: false
      };
    } catch (error) {
      this.logger.error(`사용자 메시지 처리 오류 (API): ${sessionId}`, error);
      
      // 오류 처리
      return {
        success: false,
        sessionId,
        response: null,
        error: error.message,
        handled: false
      };
    }
  }
}

module.exports = CartAgent;
