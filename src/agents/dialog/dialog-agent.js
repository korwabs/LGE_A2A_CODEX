/**
 * 대화 인터페이스 에이전트
 * 사용자와의 자연어 대화, 의도 파악, 다른 에이전트 조율을 담당합니다.
 */
const A2ABaseAgent = require('../../protocols/a2a-base-agent');

class DialogAgent extends A2ABaseAgent {
  /**
   * 생성자
   * @param {Object} router - A2A 라우터 인스턴스
   * @param {Object} mcpPromptManager - MCP 프롬프트 관리자
   * @param {Object} sessionService - 세션 관리 서비스
   */
  constructor(router, mcpPromptManager, sessionService) {
    super('dialogAgent', router);
    this.mcpPromptManager = mcpPromptManager;
    this.sessionService = sessionService;
    this.setupMessageHandlers();
  }
  
  /**
   * 메시지 핸들러 설정
   */
  setupMessageHandlers() {
    // 사용자 메시지 처리
    this.registerMessageHandler('userMessage', async (message) => {
      const { sessionId, userMessage, language = 'pt-BR' } = message.payload;
      
      try {
        this.logger.info(`사용자 메시지 처리: ${sessionId}`);
        
        // 세션 가져오기 또는 생성
        let session = await this.sessionService.getSession(sessionId);
        if (!session) {
          const newSessionId = await this.sessionService.createSession();
          session = await this.sessionService.getSession(newSessionId);
        }
        
        // 대화 기록에 사용자 메시지 추가
        await this.sessionService.addConversationMessage(sessionId, 'user', userMessage);
        
        // 대화 기록 가져오기
        const conversationHistory = await this.sessionService.getConversationHistory(sessionId, 10);
        
        // 사용자 의도 분석
        const intent = await this.mcpPromptManager.analyzeIntent(
          sessionId, 
          userMessage, 
          conversationHistory
        );
        
        // 의도에 따른 처리
        let response;
        switch (intent.type) {
          case 'productSearch':
            // 제품 추천 에이전트에 요청
            response = await this.handleProductSearch(sessionId, userMessage, intent, language);
            break;
            
          case 'purchaseIntent':
            // 구매 프로세스 에이전트에 요청
            response = await this.handlePurchaseIntent(sessionId, userMessage, intent, language);
            break;
            
          case 'cartOperation':
            // 장바구니 에이전트에 요청
            response = await this.handleCartOperation(sessionId, userMessage, intent, language);
            break;
            
          case 'generalQuery':
          default:
            // 일반 질문에 대한 응답 생성
            response = await this.handleGeneralQuery(sessionId, userMessage, intent, language);
            break;
        }
        
        // 대화 기록에 어시스턴트 응답 추가
        await this.sessionService.addConversationMessage(sessionId, 'assistant', response);
        
        return {
          success: true,
          sessionId,
          response,
          intent: intent.type
        };
      } catch (error) {
        this.logger.error(`사용자 메시지 처리 오류: ${sessionId}`, error);
        
        // 오류 처리 응답
        const errorResponse = (language === 'pt-BR')
          ? 'Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.'
          : '죄송합니다, 메시지 처리 중 오류가 발생했습니다. 다시 시도해 주세요.';
          
        return {
          success: false,
          sessionId,
          response: errorResponse,
          error: error.message
        };
      }
    });
    
    // 제품 추천 결과 처리
    this.registerMessageHandler('recommendationResult', async (message) => {
      const { sessionId, recommendations, userQuery, language = 'pt-BR' } = message.payload;
      
      try {
        this.logger.info(`제품 추천 결과 처리: ${sessionId}`);
        
        // 추천 결과를 사용자 친화적 형식으로 변환
        const response = await this.mcpPromptManager.generateGeminiResponse(
          sessionId,
          'formatRecommendations',
          { recommendations: JSON.stringify(recommendations), userQuery, language }
        );
        
        return {
          success: true,
          sessionId,
          response
        };
      } catch (error) {
        this.logger.error(`제품 추천 결과 처리 오류: ${sessionId}`, error);
        
        // 오류 처리 응답
        const errorResponse = (language === 'pt-BR')
          ? 'Desculpe, não consegui encontrar recomendações de produtos. Por favor, tente novamente com outras palavras-chave.'
          : '죄송합니다, 제품 추천을 찾을 수 없습니다. 다른 키워드로 다시 시도해 주세요.';
          
        return {
          success: false,
          sessionId,
          response: errorResponse,
          error: error.message
        };
      }
    });
    
    // 구매 프로세스 안내 처리
    this.registerMessageHandler('purchaseStepGuide', async (message) => {
      const { sessionId, guideText } = message.payload;
      
      try {
        this.logger.info(`구매 프로세스 안내 처리: ${sessionId}`);
        
        return {
          success: true,
          sessionId,
          response: guideText
        };
      } catch (error) {
        this.logger.error(`구매 프로세스 안내 처리 오류: ${sessionId}`, error);
        
        return {
          success: false,
          sessionId,
          response: '구매 프로세스 안내 중 오류가 발생했습니다.',
          error: error.message
        };
      }
    });
    
    // 추가 정보 요청 처리
    this.registerMessageHandler('requestMoreInfo', async (message) => {
      const { sessionId, promptText } = message.payload;
      
      try {
        this.logger.info(`추가 정보 요청 처리: ${sessionId}`);
        
        return {
          success: true,
          sessionId,
          response: promptText
        };
      } catch (error) {
        this.logger.error(`추가 정보 요청 처리 오류: ${sessionId}`, error);
        
        return {
          success: false,
          sessionId,
          response: '정보 요청 중 오류가 발생했습니다.',
          error: error.message
        };
      }
    });
    
    // 장바구니 업데이트 결과 처리
    this.registerMessageHandler('cartUpdateResult', async (message) => {
      const { sessionId, cart, action, language = 'pt-BR' } = message.payload;
      
      try {
        this.logger.info(`장바구니 업데이트 결과 처리: ${sessionId}`);
        
        // 장바구니 결과에 따른 응답 생성
        let response;
        
        if (language === 'pt-BR') {
          switch (action) {
            case 'add':
              response = `Produto adicionado ao carrinho! Você tem ${cart.totalItems} item(s) no carrinho.`;
              break;
            case 'remove':
              response = `Produto removido do carrinho. Você tem ${cart.totalItems} item(s) no carrinho.`;
              break;
            case 'update':
              response = `Carrinho atualizado! Você tem ${cart.totalItems} item(s) no carrinho.`;
              break;
            case 'view':
              if (cart.items.length === 0) {
                response = 'Seu carrinho está vazio.';
              } else {
                response = `Você tem ${cart.totalItems} item(s) no carrinho:\n\n`;
                cart.items.forEach(item => {
                  response += `- ${item.product.name} (${item.quantity}x): ${item.product.price}\n`;
                });
                response += `\nTotal: ${cart.totalPrice}`;
              }
              break;
            default:
              response = `Carrinho atualizado! Você tem ${cart.totalItems} item(s) no carrinho.`;
          }
        } else {
          switch (action) {
            case 'add':
              response = `장바구니에 상품이 추가되었습니다! 장바구니에 ${cart.totalItems}개의 상품이 있습니다.`;
              break;
            case 'remove':
              response = `장바구니에서 상품이 제거되었습니다. 장바구니에 ${cart.totalItems}개의 상품이 있습니다.`;
              break;
            case 'update':
              response = `장바구니가 업데이트되었습니다! 장바구니에 ${cart.totalItems}개의 상품이 있습니다.`;
              break;
            case 'view':
              if (cart.items.length === 0) {
                response = '장바구니가 비어 있습니다.';
              } else {
                response = `장바구니에 ${cart.totalItems}개의 상품이 있습니다:\n\n`;
                cart.items.forEach(item => {
                  response += `- ${item.product.name} (${item.quantity}개): ${item.product.price}\n`;
                });
                response += `\n총액: ${cart.totalPrice}`;
              }
              break;
            default:
              response = `장바구니가 업데이트되었습니다! 장바구니에 ${cart.totalItems}개의 상품이 있습니다.`;
          }
        }
        
        return {
          success: true,
          sessionId,
          response,
          cart
        };
      } catch (error) {
        this.logger.error(`장바구니 업데이트 결과 처리 오류: ${sessionId}`, error);
        
        // 오류 처리 응답
        const errorResponse = (language === 'pt-BR')
          ? 'Desculpe, ocorreu um erro ao atualizar seu carrinho. Por favor, tente novamente.'
          : '죄송합니다, 장바구니 업데이트 중 오류가 발생했습니다. 다시 시도해 주세요.';
          
        return {
          success: false,
          sessionId,
          response: errorResponse,
          error: error.message
        };
      }
    });
  }
  
  /**
   * 제품 검색 처리
   * @param {string} sessionId - 세션 ID
   * @param {string} userMessage - 사용자 메시지
   * @param {Object} intent - 분석된 의도
   * @param {string} language - 언어 코드
   * @returns {Promise<string>} 응답 메시지
   */
  async handleProductSearch(sessionId, userMessage, intent, language) {
    this.logger.info(`제품 검색 처리: ${sessionId}`);
    
    // 제품 추천 에이전트에 요청
    const response = await this.sendMessage(
      'productRecommendationAgent',
      'request',
      'getRecommendation',
      { 
        sessionId, 
        userQuery: userMessage, 
        filters: intent.filters,
        language
      }
    );
    
    return response.response;
  }
  
  /**
   * 구매 의도 처리
   * @param {string} sessionId - 세션 ID
   * @param {string} userMessage - 사용자 메시지
   * @param {Object} intent - 분석된 의도
   * @param {string} language - 언어 코드
   * @returns {Promise<string>} 응답 메시지
   */
  async handlePurchaseIntent(sessionId, userMessage, intent, language) {
    this.logger.info(`구매 의도 처리: ${sessionId}`);
    
    // 구매 프로세스 에이전트에 요청
    const response = await this.sendMessage(
      'purchaseProcessAgent',
      'request',
      'initiatePurchase',
      { 
        sessionId, 
        productId: intent.productId,
        userMessage,
        language
      }
    );
    
    return response.response;
  }
  
  /**
   * 장바구니 작업 처리
   * @param {string} sessionId - 세션 ID
   * @param {string} userMessage - 사용자 메시지
   * @param {Object} intent - 분석된 의도
   * @param {string} language - 언어 코드
   * @returns {Promise<string>} 응답 메시지
   */
  async handleCartOperation(sessionId, userMessage, intent, language) {
    this.logger.info(`장바구니 작업 처리: ${sessionId}, 작업: ${intent.operation}`);
    
    // 장바구니 에이전트에 요청
    const response = await this.sendMessage(
      'cartAgent',
      'request',
      intent.operation,
      { 
        sessionId, 
        productId: intent.productId,
        quantity: intent.quantity,
        language
      }
    );
    
    return response.response;
  }
  
  /**
   * 일반 질문 처리
   * @param {string} sessionId - 세션 ID
   * @param {string} userMessage - 사용자 메시지
   * @param {Object} intent - 분석된 의도
   * @param {string} language - 언어 코드
   * @returns {Promise<string>} 응답 메시지
   */
  async handleGeneralQuery(sessionId, userMessage, intent, language) {
    this.logger.info(`일반 질문 처리: ${sessionId}`);
    
    // 대화 기록 가져오기
    const conversationHistory = await this.sessionService.getConversationHistory(sessionId, 5);
    
    // 세션 정보 가져오기
    const session = await this.sessionService.getSession(sessionId);
    const preferences = session ? (session.preferences || {}) : {};
    
    // 일반 응답 생성
    const response = await this.mcpPromptManager.generateGeminiResponse(
      sessionId,
      'generalQuery',
      {
        userMessage,
        conversationHistory: JSON.stringify(conversationHistory),
        preferences: JSON.stringify(preferences),
        language
      }
    );
    
    return response;
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
      // userMessage 메시지 핸들러에게 메시지 전달
      const message = {
        messageId: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        fromAgent: 'api',
        toAgent: 'dialogAgent',
        messageType: 'request',
        intent: 'userMessage',
        payload: {
          sessionId,
          userMessage,
          language
        },
        timestamp: new Date().toISOString()
      };
      
      return await this.processMessage(message);
    } catch (error) {
      this.logger.error(`사용자 메시지 처리 오류 (API): ${sessionId}`, error);
      
      // 오류 처리 응답
      const errorResponse = (language === 'pt-BR')
        ? 'Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.'
        : '죄송합니다, 메시지 처리 중 오류가 발생했습니다. 다시 시도해 주세요.';
        
      return {
        success: false,
        sessionId,
        response: errorResponse,
        error: error.message
      };
    }
  }
}

module.exports = DialogAgent;
