/**
 * 구매 프로세스 지원 에이전트
 * 크롤링을 통해 파악한 구매 프로세스 단계별 정보 수집 및 안내를 담당합니다.
 */
const A2ABaseAgent = require('../../protocols/a2a-base-agent');

class PurchaseProcessAgent extends A2ABaseAgent {
  /**
   * 생성자
   * @param {Object} router - A2A 라우터 인스턴스
   * @param {Object} mcpPromptManager - MCP 프롬프트 관리자
   * @param {Object} sessionService - 세션 관리 서비스
   * @param {Object} crawlingService - 크롤링 서비스
   * @param {Object} searchService - 검색 서비스
   */
  constructor(router, mcpPromptManager, sessionService, crawlingService, searchService) {
    super('purchaseProcessAgent', router);

    // legacy signature: (router, contextManager, apifyClient)
    if (crawlingService === undefined && searchService === undefined && mcpPromptManager && mcpPromptManager.storeContext) {
      this.legacyMode = true;
      this.contextManager = mcpPromptManager;
      this.apifyClient = sessionService;
      this.checkoutFlows = new Map();
      this.initializeCheckoutFlowData = () => {};
      this.setupLegacyHandlers();
      return;
    }

    this.mcpPromptManager = mcpPromptManager;
    this.sessionService = sessionService;
    this.crawlingService = crawlingService;
    this.searchService = searchService;
    this.checkoutFlows = new Map(); // 제품별 체크아웃 프로세스 정보
    this.setupMessageHandlers();
  }
  
  /**
   * 메시지 핸들러 설정
   */
  setupMessageHandlers() {
    // 구매 프로세스 시작 처리
    this.registerMessageHandler('initiatePurchase', async (message) => {
      const { sessionId, productId, userMessage, language = 'pt-BR' } = message.payload;
      
      try {
        this.logger.info(`구매 프로세스 시작: ${sessionId}, 제품 ID: ${productId}`);
        
        // 세션 정보 가져오기
        const session = await this.sessionService.getSession(sessionId);
        if (!session) {
          throw new Error(`세션을 찾을 수 없음: ${sessionId}`);
        }
        
        // 제품 정보 가져오기
        const productInfo = await this.searchService.getProductById(productId);
        
        if (!productInfo) {
          // 제품 ID가 없는 경우 장바구니에서 제품 찾기 시도
          const cart = await this.sessionService.getCart(sessionId);
          
          if (cart.items.length === 0) {
            // 장바구니가 비어 있는 경우
            const emptyCartResponse = (language === 'pt-BR')
              ? 'Parece que seu carrinho está vazio. Deseja procurar algum produto específico antes de iniciar o processo de compra?'
              : '장바구니가 비어 있는 것 같습니다. 구매 프로세스를 시작하기 전에 특정 제품을 찾아보시겠어요?';
              
            return {
              success: true,
              sessionId,
              response: emptyCartResponse
            };
          }
          
          // 장바구니의 첫 번째 제품 사용
          const firstCartItem = cart.items[0];
          
          const cartItemResponse = (language === 'pt-BR')
            ? `Você gostaria de comprar o "${firstCartItem.product.name}" que está no seu carrinho?`
            : `장바구니에 있는 "${firstCartItem.product.name}"을(를) 구매하시겠어요?`;
            
          return {
            success: true,
            sessionId,
            response: cartItemResponse,
            suggestedProductId: firstCartItem.product.id
          };
        }
        
        // 제품 카테고리 또는 기본 체크아웃 프로세스 가져오기
        let checkoutSteps;
        
        if (this.checkoutFlows.has(productInfo.category)) {
          checkoutSteps = this.checkoutFlows.get(productInfo.category);
        } else {
          // 체크아웃 프로세스가 없는 경우 크롤링하거나 기본 프로세스 사용
          try {
            const checkoutProcess = await this.crawlingService.crawlCheckoutProcess(productInfo.url);
            checkoutSteps = checkoutProcess.steps;
            
            // 캐시에 저장
            this.checkoutFlows.set(productInfo.category, checkoutSteps);
          } catch (error) {
            this.logger.error(`체크아웃 프로세스 크롤링 오류: ${productInfo.url}`, error);
            
            // 기본 체크아웃 프로세스 사용
            checkoutSteps = this.getDefaultCheckoutSteps();
          }
        }
        
        // 사용자 컨텍스트에 체크아웃 정보 저장
        await this.sessionService.updateCheckoutProcess(sessionId, {
          currentStep: 0,
          checkoutSteps,
          productInfo,
          collectedInfo: {}
        });
        
        // 첫 단계 안내 생성
        const firstStepGuide = await this.generateStepGuidance(sessionId, language);
        
        // 대화 에이전트에 응답 전송
        return {
          success: true,
          sessionId,
          response: firstStepGuide
        };
      } catch (error) {
        this.logger.error(`구매 프로세스 시작 오류: ${sessionId}`, error);
        
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
    
    // 구매 정보 수집 처리
    this.registerMessageHandler('collectPurchaseInfo', async (message) => {
      const { sessionId, userInput, language = 'pt-BR' } = message.payload;
      
      try {
        this.logger.info(`구매 정보 수집: ${sessionId}`);
        
        // 세션 정보 가져오기
        const session = await this.sessionService.getSession(sessionId);
        if (!session) {
          throw new Error(`세션을 찾을 수 없음: ${sessionId}`);
        }
        
        const checkoutProcess = session.checkoutProcess || {};
        const { currentStep, checkoutSteps, collectedInfo } = checkoutProcess;
        
        if (!checkoutSteps || !Array.isArray(checkoutSteps) || checkoutSteps.length === 0) {
          throw new Error('체크아웃 단계 정보가 없습니다.');
        }
        
        if (currentStep === null || currentStep === undefined || currentStep >= checkoutSteps.length) {
          throw new Error(`유효하지 않은 체크아웃 단계: ${currentStep}`);
        }
        
        // 현재 단계 정보
        const currentStepInfo = checkoutSteps[currentStep];
        
        // 현재 단계에 필요한 정보 추출
        const extractedInfo = await this.extractInfoFromUserInput(
          userInput, 
          currentStepInfo.requiredFields,
          language
        );
        
        // 수집된 정보 업데이트
        const updatedInfo = { ...collectedInfo, ...extractedInfo };
        
        // 체크아웃 프로세스 정보 업데이트
        await this.sessionService.updateCheckoutProcess(sessionId, {
          ...checkoutProcess,
          collectedInfo: updatedInfo
        });
        
        // 현재 단계의 모든 필수 정보가 수집되었는지 확인
        const missingFields = this.checkMissingRequiredFields(
          updatedInfo, 
          currentStepInfo.requiredFields
        );
        
        if (missingFields.length > 0) {
          // 누락된 정보 요청
          const nextFieldPrompt = await this.generateFieldPrompt(sessionId, missingFields[0], language);
          
          return {
            success: true,
            sessionId,
            response: nextFieldPrompt,
            missingField: missingFields[0].name
          };
        } else {
          // 다음 단계로 진행
          const nextStep = currentStep + 1;
          
          // 체크아웃 프로세스 정보 업데이트
          await this.sessionService.updateCheckoutProcess(sessionId, {
            ...checkoutProcess,
            currentStep: nextStep,
            collectedInfo: updatedInfo
          });
          
          if (nextStep >= checkoutSteps.length) {
            // 모든 단계 완료
            const checkoutUrl = await this.generateCheckoutUrl(sessionId, updatedInfo);
            
            const checkoutCompleteResponse = (language === 'pt-BR')
              ? `Ótimo! Coletamos todas as informações necessárias para sua compra. Clique aqui para finalizar sua compra: [Finalizar Compra](${checkoutUrl})`
              : `좋습니다! 구매에 필요한 모든 정보를 수집했습니다. 여기를 클릭하여 구매를 완료하세요: [구매 완료](${checkoutUrl})`;
              
            return {
              success: true,
              sessionId,
              response: checkoutCompleteResponse,
              checkoutUrl
            };
          } else {
            // 다음 단계 안내
            const nextStepGuide = await this.generateStepGuidance(sessionId, language);
            
            return {
              success: true,
              sessionId,
              response: nextStepGuide
            };
          }
        }
      } catch (error) {
        this.logger.error(`구매 정보 수집 오류: ${sessionId}`, error);
        
        // 오류 처리 응답
        const errorResponse = (language === 'pt-BR')
          ? 'Desculpe, ocorreu um erro ao coletar as informações de compra. Por favor, tente novamente.'
          : '죄송합니다, 구매 정보를 수집하는 중 오류가 발생했습니다. 다시 시도해 주세요.';
          
        return {
          success: false,
          sessionId,
          response: errorResponse,
          error: error.message
        };
      }
    });
  }

  /** Simplified handlers for unit tests */
  setupLegacyHandlers() {
    this.registerMessageHandler('initiatePurchase', async (message) => {
      const { userId, productId } = message.payload;
      const productInfo = await this.fetchProductInfo(productId);
      const steps = this.checkoutFlows.get(productInfo.category) || this.checkoutFlows.get('default') || [];
      this.contextManager.storeContext(userId, {
        currentCheckoutStep: 0,
        checkoutSteps: steps,
        productInfo,
        collectedInfo: {}
      });
      const guideText = await this.generateStepGuidance(userId);
      await this.router.sendMessage({
        fromAgent: this.agentId,
        toAgent: 'dialogAgent',
        messageType: 'event',
        intent: 'purchaseStepGuide',
        payload: { userId, guideText }
      });
    });

    this.registerMessageHandler('collectPurchaseInfo', async (message) => {
      const { userId, userInput } = message.payload;
      const context = this.contextManager.get(userId);
      const stepInfo = context.checkoutSteps[context.currentCheckoutStep];
      const extracted = await this.extractInfoFromUserInput(userInput, stepInfo.requiredFields);
      this.contextManager.updateContext(userId, 'collectedInfo', { ...context.collectedInfo, ...extracted });
      const missing = this.checkMissingRequiredFields(this.contextManager.get(userId).collectedInfo, stepInfo.requiredFields);
      if (missing.length > 0) {
        const promptText = await this.generateFieldPrompt(userId, missing[0]);
        await this.router.sendMessage({
          fromAgent: this.agentId,
          toAgent: 'dialogAgent',
          messageType: 'event',
          intent: 'requestMoreInfo',
          payload: { userId, promptText }
        });
        return;
      }
      const nextStep = context.currentCheckoutStep + 1;
      this.contextManager.updateContext(userId, 'currentCheckoutStep', nextStep);
      if (nextStep >= context.checkoutSteps.length) {
        const url = await this.generateCheckoutUrl(userId, this.contextManager.get(userId).collectedInfo);
        await this.router.sendMessage({
          fromAgent: this.agentId,
          toAgent: 'dialogAgent',
          messageType: 'event',
          intent: 'checkoutComplete',
          payload: { userId, checkoutUrl: url }
        });
      } else {
        const guideText = await this.generateStepGuidance(userId);
        await this.router.sendMessage({
          fromAgent: this.agentId,
          toAgent: 'dialogAgent',
          messageType: 'event',
          intent: 'purchaseStepGuide',
          payload: { userId, guideText }
        });
      }
    });
  }

  async fetchProductInfo(productId) {
    if (this.searchService && this.searchService.getProductById) {
      return this.searchService.getProductById(productId);
    }
    return null;
  }
  
  /**
   * 단계별 안내 생성
   * @param {string} sessionId - 세션 ID
   * @param {string} language - 언어 코드
   * @returns {Promise<string>} 안내 메시지
   */
  async generateStepGuidance(sessionId, language = 'pt-BR') {
    try {
      // 세션 정보 가져오기
      const session = await this.sessionService.getSession(sessionId);
      if (!session) {
        throw new Error(`세션을 찾을 수 없음: ${sessionId}`);
      }
      
      const checkoutProcess = session.checkoutProcess || {};
      const { currentStep, checkoutSteps, productInfo } = checkoutProcess;
      
      if (!checkoutSteps || !Array.isArray(checkoutSteps) || checkoutSteps.length === 0) {
        throw new Error('체크아웃 단계 정보가 없습니다.');
      }
      
      if (currentStep === null || currentStep === undefined || currentStep >= checkoutSteps.length) {
        throw new Error(`유효하지 않은 체크아웃 단계: ${currentStep}`);
      }
      
      // 현재 단계 정보
      const currentStepInfo = checkoutSteps[currentStep];
      
      // 제품 정보 포맷
      const productName = productInfo ? productInfo.name : '';
      const productPrice = productInfo ? productInfo.price : '';
      
      // MCP 프롬프트를 사용하여 자연스러운 안내 생성
      const prompt = `
        당신은 LG 브라질 쇼핑 어시스턴트의 구매 과정 안내 담당입니다.
        
        # 현재 구매 단계 정보
        단계: ${currentStep + 1}/${checkoutSteps.length}
        단계명: ${currentStepInfo.name || `단계 ${currentStep + 1}`}
        설명: ${currentStepInfo.description || ''}
        
        # 제품 정보
        제품명: ${productName}
        가격: ${productPrice}
        
        # 필요한 정보
        ${currentStepInfo.requiredFields ? JSON.stringify(currentStepInfo.requiredFields) : '[]'}
        
        # 지시사항
        현재 구매 단계에 대한 자연스러운 안내 메시지를 작성하세요.
        사용자에게 필요한 정보를 친절하게 요청하세요.
        제품 정보를 포함하여 맥락을 제공하세요.
        ${language === 'pt-BR' ? '포르투갈어(브라질)로 응답하세요.' : '한국어로 응답하세요.'}
      `;
      
      // Gemini를 사용하여 안내 메시지 생성
      const response = await this.mcpPromptManager.generateGeminiResponse(
        sessionId,
        'purchaseProcess',
        {
          currentCheckoutStep: `${currentStep + 1}/${checkoutSteps.length}`,
          requiredFields: JSON.stringify(currentStepInfo.requiredFields || []),
          collectedInfo: '{}', // 처음에는 수집된 정보 없음
          userMessage: ''
        }
      );
      
      return response;
    } catch (error) {
      this.logger.error(`단계별 안내 생성 오류: ${sessionId}`, error);
      
      // 오류 발생 시 기본 메시지 반환
      return (language === 'pt-BR')
        ? 'Vamos começar o processo de compra. Por favor, forneça as informações solicitadas passo a passo.'
        : '구매 프로세스를 시작합니다. 요청된 정보를 단계별로 제공해 주세요.';
    }
  }
  
  /**
   * 사용자 입력에서 필요 정보 추출
   * @param {string} userInput - 사용자 입력
   * @param {Array} requiredFields - 필요한 필드 배열
   * @param {string} language - 언어 코드
   * @returns {Promise<Object>} 추출된 정보
   */
  async extractInfoFromUserInput(userInput, requiredFields, language = 'pt-BR') {
    try {
      if (!requiredFields || !Array.isArray(requiredFields) || requiredFields.length === 0) {
        return {};
      }
      
      // 필요한 필드 목록 준비
      const fieldsToExtract = requiredFields.map(field => ({
        name: field.name,
        description: field.description,
        type: field.type
      }));
      
      // MCP 프롬프트를 사용하여 정보 추출
      const prompt = `
        당신은 LG 브라질 쇼핑 어시스턴트의 정보 추출 담당입니다.
        
        # 사용자 입력
        ${userInput}
        
        # 추출할 필드
        ${JSON.stringify(fieldsToExtract)}
        
        # 지시사항
        사용자 입력에서 필요한 정보를 추출하세요.
        추출한 정보를 JSON 형식으로 반환하세요.
        형식: { "필드명": "추출된 값", ... }
        
        정확한 추출을 위해 다음 가이드라인을 따르세요:
        - 주소: 번지수, 거리, 도시, 지역 등 포함
        - 이메일: 유효한 이메일 형식
        - 전화번호: 지역 코드 포함
        - 우편번호: 현지 형식 준수
      `;
      
      // Gemini를 사용하여 정보 추출
      const responseText = await this.mcpPromptManager.generateGeminiResponse(
        'system', // 시스템 사용자 ID로 처리
        'extract',
        {
          userInput,
          fieldsToExtract: JSON.stringify(fieldsToExtract)
        }
      );
      
      // JSON 형식 응답에서 추출된 정보 파싱
      try {
        const extractedInfo = JSON.parse(responseText);
        return extractedInfo;
      } catch (error) {
        this.logger.error('JSON 파싱 오류:', error);
        
        // 정보 추출 실패 시 빈 객체 반환
        return {};
      }
    } catch (error) {
      this.logger.error('정보 추출 오류:', error);
      return {};
    }
  }
  
  /**
   * 누락된 필수 정보 확인
   * @param {Object} collectedInfo - 수집된 정보
   * @param {Array} requiredFields - 필요한 필드 배열
   * @returns {Array} 누락된 필드 배열
   */
  checkMissingRequiredFields(collectedInfo, requiredFields) {
    if (!requiredFields || !Array.isArray(requiredFields)) {
      return [];
    }
    
    return requiredFields.filter(field => 
      field.required && (!collectedInfo || !collectedInfo[field.name])
    );
  }
  
  /**
   * 정보 요청 프롬프트 생성
   * @param {string} sessionId - 세션 ID
   * @param {Object} field - 요청할 필드 정보
   * @param {string} language - 언어 코드
   * @returns {Promise<string>} 프롬프트 메시지
   */
  async generateFieldPrompt(sessionId, field, language = 'pt-BR') {
    try {
      // MCP 프롬프트 템플릿을 활용한 자연스러운 질문 생성
      const prompt = `
        당신은 LG 브라질 쇼핑 어시스턴트의 구매 과정 안내 담당입니다.
        
        # 필요한 정보
        필드명: ${field.name}
        설명: ${field.description || field.name}
        타입: ${field.type || 'text'}
        
        # 지시사항
        위 정보를 수집하기 위한 자연스러운 질문을 생성하세요.
        질문은 친절하고 도움이 되는 톤으로 작성하세요.
        ${language === 'pt-BR' ? '포르투갈어(브라질)로 응답하세요.' : '한국어로 응답하세요.'}
      `;
      
      // Gemini를 사용하여 프롬프트 생성
      const response = await this.mcpPromptManager.generateGeminiResponse(
        sessionId,
        'fieldPrompt',
        {
          fieldName: field.name,
          fieldDescription: field.description || field.name,
          fieldType: field.type || 'text',
          language
        }
      );
      
      return response;
    } catch (error) {
      this.logger.error(`필드 프롬프트 생성 오류: ${field.name}`, error);
      
      // 오류 발생 시 기본 메시지 반환
      const fieldDesc = field.description || field.name;
      
      return (language === 'pt-BR')
        ? `Por favor, forneça ${fieldDesc}.`
        : `${fieldDesc}를 제공해 주세요.`;
    }
  }
  
  /**
   * 체크아웃 URL 생성
   * @param {string} sessionId - 세션 ID
   * @param {Object} collectedInfo - 수집된 정보
   * @returns {Promise<string>} 체크아웃 URL
   */
  async generateCheckoutUrl(sessionId, collectedInfo) {
    try {
      // 세션 정보 가져오기
      const session = await this.sessionService.getSession(sessionId);
      if (!session) {
        throw new Error(`세션을 찾을 수 없음: ${sessionId}`);
      }
      
      const checkoutProcess = session.checkoutProcess || {};
      const { productInfo } = checkoutProcess;
      
      if (!productInfo) {
        throw new Error('제품 정보가 없습니다.');
      }
      
      // 기본 체크아웃 URL
      const baseCheckoutUrl = productInfo.url.replace(/\/[^\/]+$/, '/checkout');
      
      // URL 파라미터 생성
      const params = new URLSearchParams();
      
      // 필요한 정보 추가
      for (const [key, value] of Object.entries(collectedInfo)) {
        if (value) {
          params.append(key, value);
        }
      }
      
      // 세션 ID 추가
      params.append('session_id', sessionId);
      
      // 구매 도우미 모드 추가
      params.append('assistant', 'true');
      
      return `${baseCheckoutUrl}?${params.toString()}`;
    } catch (error) {
      this.logger.error(`체크아웃 URL 생성 오류: ${sessionId}`, error);
      
      // 오류 발생 시 기본 URL 반환
      return 'https://www.lge.com/br/checkout';
    }
  }
  
  /**
   * 기본 체크아웃 단계 정보 가져오기
   * @returns {Array} 기본 체크아웃 단계 배열
   */
  getDefaultCheckoutSteps() {
    return [
      {
        step: 1,
        name: 'Informações Pessoais',
        description: 'Coleta de informações básicas do cliente',
        requiredFields: [
          {
            name: 'name',
            description: 'Nome completo',
            type: 'text',
            required: true
          },
          {
            name: 'email',
            description: 'Endereço de e-mail',
            type: 'email',
            required: true
          },
          {
            name: 'phone',
            description: 'Número de telefone',
            type: 'tel',
            required: true
          }
        ],
        nextButtonSelector: '.next-step-button'
      },
      {
        step: 2,
        name: 'Endereço de Entrega',
        description: 'Endereço para entrega do produto',
        requiredFields: [
          {
            name: 'zipCode',
            description: 'CEP',
            type: 'text',
            required: true
          },
          {
            name: 'address',
            description: 'Endereço completo',
            type: 'text',
            required: true
          },
          {
            name: 'city',
            description: 'Cidade',
            type: 'text',
            required: true
          },
          {
            name: 'state',
            description: 'Estado',
            type: 'text',
            required: true
          }
        ],
        nextButtonSelector: '.next-step-button'
      },
      {
        step: 3,
        name: 'Método de Pagamento',
        description: 'Escolha do método de pagamento',
        requiredFields: [
          {
            name: 'paymentMethod',
            description: 'Método de pagamento',
            type: 'select',
            options: ['creditCard', 'boleto', 'pix'],
            required: true
          }
        ],
        nextButtonSelector: '.next-step-button'
      }
    ];
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
      // collectPurchaseInfo 메시지 핸들러에게 메시지 전달
      const message = {
        messageId: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        fromAgent: 'api',
        toAgent: 'purchaseProcessAgent',
        messageType: 'request',
        intent: 'collectPurchaseInfo',
        payload: {
          sessionId,
          userInput: userMessage,
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

module.exports = PurchaseProcessAgent;
