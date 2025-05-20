/**
 * 체크아웃 자동화 에이전트
 * 크롤링으로 파악한 구매 프로세스를 자동화하여 사용자에게 편리한 구매 경험을 제공합니다.
 */
const A2ABaseAgent = require('../../protocols/a2a-base-agent');
const CheckoutProcessService = require('../../services/crawling/checkout/checkout-process-service');

class CheckoutAutomationAgent extends A2ABaseAgent {
  /**
   * 생성자
   * @param {Object} router - A2A 라우터
   * @param {Object} checkoutProcessService - 체크아웃 프로세스 서비스
   * @param {Object} apifyClient - Apify 클라이언트
   * @param {Object} llmService - LLM 서비스
   */
  constructor(router, checkoutProcessService, apifyClient, llmService) {
    super('checkoutAutomationAgent', router);
    this.checkoutProcessService = checkoutProcessService || new CheckoutProcessService();
    this.apifyClient = apifyClient;
    this.llmService = llmService;
    this.activeSessions = new Map();
    this.setupMessageHandlers();
  }
  
  /**
   * 메시지 핸들러 설정
   */
  setupMessageHandlers() {
    // 체크아웃 프로세스 정보 요청 처리
    this.registerMessageHandler('getCheckoutProcess', async (message) => {
      const { productId, force = false } = message.payload;
      
      try {
        this.logger.info(`체크아웃 프로세스 정보 요청: ${productId}`);
        
        let checkoutProcess;
        
        // 강제 크롤링 요청이거나 캐시에 없는 경우 크롤링 수행
        if (force) {
          checkoutProcess = await this.crawlCheckoutProcess(productId);
        } else {
          // 캐시에서 조회
          checkoutProcess = await this.checkoutProcessService.getCheckoutProcess(productId);
        }
        
        return {
          success: true,
          checkoutProcess
        };
      } catch (error) {
        this.logger.error(`체크아웃 프로세스 정보 요청 오류: ${error.message}`);
        
        return {
          success: false,
          error: error.message
        };
      }
    });
    
    // 체크아웃 세션 시작 요청 처리
    this.registerMessageHandler('startCheckoutSession', async (message) => {
      const { productId, userId, initialData = {} } = message.payload;
      
      try {
        this.logger.info(`체크아웃 세션 시작 요청: 사용자 ${userId}, 제품 ${productId}`);
        
        // 기존 세션 확인
        if (this.activeSessions.has(`${userId}:${productId}`)) {
          const existingSession = this.activeSessions.get(`${userId}:${productId}`);
          
          return {
            success: true,
            sessionId: existingSession.sessionId,
            currentStep: existingSession.currentStep,
            message: '기존 세션을 사용합니다.'
          };
        }
        
        // 체크아웃 프로세스 정보 조회
        const checkoutProcess = await this.checkoutProcessService.getCheckoutProcess(productId);
        
        if (!checkoutProcess || !checkoutProcess.steps || checkoutProcess.steps.length === 0) {
          throw new Error('체크아웃 프로세스 정보를 찾을 수 없습니다.');
        }
        
        // 새 세션 ID 생성
        const sessionId = `checkout-${userId}-${productId}-${Date.now()}`;
        
        // 세션 정보 저장
        this.activeSessions.set(`${userId}:${productId}`, {
          sessionId,
          userId,
          productId,
          checkoutProcess,
          currentStep: 1,
          collectedData: {
            ...initialData,
            productId
          },
          startTime: new Date(),
          lastActivity: new Date()
        });
        
        // 첫 번째 단계 정보 반환
        const firstStep = checkoutProcess.steps[0];
        
        return {
          success: true,
          sessionId,
          currentStep: 1,
          stepInfo: firstStep,
          totalSteps: checkoutProcess.steps.length,
          message: '체크아웃 세션이 시작되었습니다.'
        };
      } catch (error) {
        this.logger.error(`체크아웃 세션 시작 오류: ${error.message}`);
        
        return {
          success: false,
          error: error.message
        };
      }
    });
    
    // 정보 수집 요청 처리
    this.registerMessageHandler('collectCheckoutInfo', async (message) => {
      const { sessionId, userInput, extractedInfo } = message.payload;
      
      try {
        this.logger.info(`체크아웃 정보 수집 요청: 세션 ${sessionId}`);
        
        // 세션 찾기
        const sessionEntry = [...this.activeSessions.entries()]
          .find(([_, session]) => session.sessionId === sessionId);
        
        if (!sessionEntry) {
          throw new Error('체크아웃 세션을 찾을 수 없습니다.');
        }
        
        const [sessionKey, session] = sessionEntry;
        
        // 현재 단계 정보 가져오기
        const { checkoutProcess, currentStep, collectedData } = session;
        const currentStepInfo = checkoutProcess.steps.find(step => step.step === currentStep);
        
        if (!currentStepInfo) {
          throw new Error(`체크아웃 단계 ${currentStep}을(를) 찾을 수 없습니다.`);
        }
        
        // 사용자 입력에서 정보 추출
        let processedInfo = extractedInfo;
        
        if (!processedInfo && userInput) {
          processedInfo = await this.extractInfoFromUserInput(userInput, currentStepInfo, collectedData);
        }
        
        // 추출된 정보 매핑
        const mappedData = await this.checkoutProcessService.mapExtractedInfoToFields(
          session.productId, 
          processedInfo
        );
        
        // 기존 수집 데이터와 병합
        const updatedData = {
          ...collectedData,
          ...mappedData
        };
        
        // 세션 업데이트
        session.collectedData = updatedData;
        session.lastActivity = new Date();
        this.activeSessions.set(sessionKey, session);
        
        // 현재 단계의 필수 필드 확인
        const missingFields = this.getMissingRequiredFields(currentStepInfo, updatedData);
        
        // 누락된 필드가 있으면 추가 정보 요청
        if (missingFields.length > 0) {
          const nextField = missingFields[0];
          
          return {
            success: true,
            sessionId,
            currentStep,
            needMoreInfo: true,
            fieldToCollect: nextField,
            prompt: this.generateFieldPrompt(nextField, currentStepInfo),
            collectedData: updatedData
          };
        }
        
        // 모든 필드가 수집된 경우 다음 단계로 진행
        const nextStep = currentStep + 1;
        
        // 마지막 단계인지 확인
        if (nextStep > checkoutProcess.steps.length) {
          // 체크아웃 프로세스 완료
          const checkoutUrl = await this.generateCheckoutUrl(session);
          
          // 세션 최종 상태 업데이트
          session.currentStep = nextStep;
          session.completed = true;
          session.completionTime = new Date();
          this.activeSessions.set(sessionKey, session);
          
          return {
            success: true,
            sessionId,
            completed: true,
            collectedData: updatedData,
            checkoutUrl
          };
        } else {
          // 다음 단계 정보 가져오기
          const nextStepInfo = checkoutProcess.steps.find(step => step.step === nextStep);
          
          // 세션 상태 업데이트
          session.currentStep = nextStep;
          this.activeSessions.set(sessionKey, session);
          
          return {
            success: true,
            sessionId,
            currentStep: nextStep,
            stepCompleted: true,
            stepInfo: nextStepInfo,
            collectedData: updatedData
          };
        }
      } catch (error) {
        this.logger.error(`체크아웃 정보 수집 오류: ${error.message}`);
        
        return {
          success: false,
          error: error.message
        };
      }
    });
    
    // 체크아웃 단계 이동 요청 처리
    this.registerMessageHandler('navigateCheckoutStep', async (message) => {
      const { sessionId, stepNumber } = message.payload;
      
      try {
        this.logger.info(`체크아웃 단계 이동 요청: 세션 ${sessionId}, 단계 ${stepNumber}`);
        
        // 세션 찾기
        const sessionEntry = [...this.activeSessions.entries()]
          .find(([_, session]) => session.sessionId === sessionId);
        
        if (!sessionEntry) {
          throw new Error('체크아웃 세션을 찾을 수 없습니다.');
        }
        
        const [sessionKey, session] = sessionEntry;
        const { checkoutProcess } = session;
        
        // 요청한 단계 유효성 검사
        if (stepNumber < 1 || stepNumber > checkoutProcess.steps.length) {
          throw new Error(`유효하지 않은 단계 번호: ${stepNumber}`);
        }
        
        // 요청 단계 정보 가져오기
        const stepInfo = checkoutProcess.steps.find(step => step.step === stepNumber);
        
        if (!stepInfo) {
          throw new Error(`체크아웃 단계 ${stepNumber}을(를) 찾을 수 없습니다.`);
        }
        
        // 세션 상태 업데이트
        session.currentStep = stepNumber;
        session.lastActivity = new Date();
        this.activeSessions.set(sessionKey, session);
        
        // 현재 단계의 필수 필드 확인
        const missingFields = this.getMissingRequiredFields(stepInfo, session.collectedData);
        
        return {
          success: true,
          sessionId,
          currentStep: stepNumber,
          stepInfo,
          needMoreInfo: missingFields.length > 0,
          fieldToCollect: missingFields.length > 0 ? missingFields[0] : null,
          prompt: missingFields.length > 0 ? this.generateFieldPrompt(missingFields[0], stepInfo) : null,
          collectedData: session.collectedData
        };
      } catch (error) {
        this.logger.error(`체크아웃 단계 이동 오류: ${error.message}`);
        
        return {
          success: false,
          error: error.message
        };
      }
    });
    
    // 체크아웃 세션 종료 요청 처리
    this.registerMessageHandler('endCheckoutSession', async (message) => {
      const { sessionId } = message.payload;
      
      try {
        this.logger.info(`체크아웃 세션 종료 요청: ${sessionId}`);
        
        // 세션 찾기
        const sessionEntry = [...this.activeSessions.entries()]
          .find(([key, session]) => session.sessionId === sessionId);
        
        if (!sessionEntry) {
          throw new Error('체크아웃 세션을 찾을 수 없습니다.');
        }
        
        const [sessionKey, session] = sessionEntry;
        
        // 세션 종료 및 삭제
        this.activeSessions.delete(sessionKey);
        
        return {
          success: true,
          message: '체크아웃 세션이 종료되었습니다.'
        };
      } catch (error) {
        this.logger.error(`체크아웃 세션 종료 오류: ${error.message}`);
        
        return {
          success: false,
          error: error.message
        };
      }
    });
    
    // 체크아웃 URL 생성 요청 처리
    this.registerMessageHandler('generateCheckoutUrl', async (message) => {
      const { sessionId } = message.payload;
      
      try {
        this.logger.info(`체크아웃 URL 생성 요청: ${sessionId}`);
        
        // 세션 찾기
        const sessionEntry = [...this.activeSessions.entries()]
          .find(([_, session]) => session.sessionId === sessionId);
        
        if (!sessionEntry) {
          throw new Error('체크아웃 세션을 찾을 수 없습니다.');
        }
        
        const [_, session] = sessionEntry;
        
        // 체크아웃 URL 생성
        const checkoutUrl = await this.generateCheckoutUrl(session);
        
        return {
          success: true,
          sessionId,
          checkoutUrl
        };
      } catch (error) {
        this.logger.error(`체크아웃 URL 생성 오류: ${error.message}`);
        
        return {
          success: false,
          error: error.message
        };
      }
    });
  }
  
  /**
   * 체크아웃 프로세스 크롤링
   * @param {string} productId - 제품 ID
   * @returns {Promise<Object>} 체크아웃 프로세스 정보
   */
  async crawlCheckoutProcess(productId) {
    try {
      this.logger.info(`체크아웃 프로세스 크롤링 시작: ${productId}`);
      
      // 제품 URL 생성
      const productUrl = `https://www.lge.com/br/product/${productId}`;
      
      // Apify를 사용하여 체크아웃 프로세스 크롤링
      const run = await this.apifyClient.actor('user~lg-brazil-checkout-process').call({
        productUrl,
        waitForLoading: true,
        maxRetries: 3,
        captureScreenshots: false
      });
      
      // 크롤링 결과 가져오기
      const { items } = await this.apifyClient.dataset(run.defaultDatasetId).listItems();
      
      if (!items || items.length === 0) {
        throw new Error('체크아웃 프로세스 크롤링 결과가 없습니다.');
      }
      
      const checkoutProcess = items[0];
      
      // 결과 유효성 확인
      if (!checkoutProcess || !checkoutProcess.steps || checkoutProcess.steps.length === 0) {
        throw new Error('유효하지 않은 체크아웃 프로세스 데이터');
      }
      
      // 체크아웃 프로세스 데이터 저장
      await this.checkoutProcessService.saveCheckoutProcess(productId, checkoutProcess);
      
      this.logger.info(`체크아웃 프로세스 크롤링 완료: ${productId}`);
      
      return checkoutProcess;
    } catch (error) {
      this.logger.error(`체크아웃 프로세스 크롤링 오류: ${error.message}`);
      
      // 기본 체크아웃 프로세스 반환
      const defaultProcess = this.checkoutProcessService.getDefaultCheckoutProcess();
      
      // 기본 데이터 저장 (캐시 만료 시간을 짧게 설정)
      await this.checkoutProcessService.saveCheckoutProcess(productId, {
        ...defaultProcess,
        isDefault: true
      });
      
      return defaultProcess;
    }
  }
  
  /**
   * 사용자 입력에서 정보 추출
   * @param {string} userInput - 사용자 입력 텍스트
   * @param {Object} stepInfo - 현재 단계 정보
   * @param {Object} collectedData - 이미 수집된 데이터
   * @returns {Promise<Object>} 추출된 정보
   */
  async extractInfoFromUserInput(userInput, stepInfo, collectedData) {
    try {
      if (!userInput) {
        return {};
      }
      
      if (!this.llmService) {
        // LLM 서비스가 없는 경우 간단한 파싱 수행
        return this.simpleInfoExtraction(userInput, stepInfo);
      }
      
      // 단계 필드 정보 추출
      const fieldDescriptions = stepInfo.fields
        .filter(f => !collectedData[f.name] && !collectedData[f.id])
        .map(f => {
          let description = `${f.label || f.name}: ${f.type} 타입`;
          
          if (f.required) {
            description += ' (필수)';
          }
          
          if (f.options && f.options.length > 0) {
            description += `, 옵션: ${f.options.map(o => o.text).join(', ')}`;
          }
          
          return description;
        })
        .join('\n');
      
      // LLM 프롬프트 구성
      const prompt = `
        사용자 입력에서 체크아웃 프로세스에 필요한 정보를 추출해주세요.
        
        현재 체크아웃 단계: ${stepInfo.name}
        필요한 정보 필드:
        ${fieldDescriptions}
        
        이미 수집된 정보:
        ${Object.entries(collectedData)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n')}
        
        사용자 입력:
        "${userInput}"
        
        추출된 정보를 JSON 형식으로 반환해주세요 (필드명: 값).
        값이 없거나 확실하지 않은 필드는 포함하지 마세요.
      `;
      
      // LLM 호출
      const result = await this.llmService.extractStructuredInfo(prompt);
      
      // JSON 파싱
      let extractedInfo = {};
      
      try {
        if (typeof result === 'string') {
          // JSON 문자열에서 객체 부분만 추출
          const jsonMatch = result.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            extractedInfo = JSON.parse(jsonMatch[0]);
          }
        } else if (typeof result === 'object') {
          extractedInfo = result;
        }
      } catch (parseError) {
        this.logger.error(`JSON 파싱 오류: ${parseError.message}`);
        // 파싱 실패 시 간단한 추출 방식 사용
        extractedInfo = this.simpleInfoExtraction(userInput, stepInfo);
      }
      
      return extractedInfo;
    } catch (error) {
      this.logger.error(`정보 추출 오류: ${error.message}`);
      return {};
    }
  }
  
  /**
   * 간단한 정보 추출 (LLM 없이)
   * @param {string} userInput - 사용자 입력 텍스트
   * @param {Object} stepInfo - 현재 단계 정보
   * @returns {Object} 추출된 정보
   */
  simpleInfoExtraction(userInput, stepInfo) {
    const extractedInfo = {};
    
    // 각 필드 유형에 맞게 정보 추출 시도
    for (const field of stepInfo.fields) {
      const fieldName = field.name || field.id;
      const fieldLabel = field.label || fieldName;
      
      if (!fieldName) continue;
      
      // 이메일 추출
      if (field.type === 'email') {
        const emailMatch = userInput.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
        if (emailMatch) {
          extractedInfo[fieldName] = emailMatch[0];
          continue;
        }
      }
      
      // 전화번호 추출
      if (field.type === 'tel') {
        const phoneMatch = userInput.match(/\b\d{2}[\s-]?\d{4,5}[\s-]?\d{4}\b/);
        if (phoneMatch) {
          extractedInfo[fieldName] = phoneMatch[0];
          continue;
        }
      }
      
      // 우편번호 추출 (브라질 CEP 형식: 00000-000)
      if (fieldName.toLowerCase().includes('cep') || 
          fieldName.toLowerCase().includes('zip') || 
          fieldName.toLowerCase().includes('postal')) {
        const zipMatch = userInput.match(/\b\d{5}[\s-]?\d{3}\b/);
        if (zipMatch) {
          extractedInfo[fieldName] = zipMatch[0];
          continue;
        }
      }
      
      // 선택 필드 (radio, select) 처리
      if ((field.type === 'radio' || field.type === 'select') && field.options && field.options.length > 0) {
        for (const option of field.options) {
          if (userInput.toLowerCase().includes(option.text.toLowerCase())) {
            extractedInfo[fieldName] = option.value;
            break;
          }
        }
        continue;
      }
      
      // 일반 텍스트 필드 - 라벨 기반 추출
      if (fieldLabel) {
        const labelPattern = new RegExp(`${fieldLabel}[:\\s]\\s*([^\\n\\.,]+)`, 'i');
        const labelMatch = userInput.match(labelPattern);
        
        if (labelMatch && labelMatch[1]) {
          extractedInfo[fieldName] = labelMatch[1].trim();
          continue;
        }
      }
    }
    
    return extractedInfo;
  }
  
  /**
   * 누락된 필수 필드 가져오기
   * @param {Object} stepInfo - 단계 정보
   * @param {Object} collectedData - 수집된 데이터
   * @returns {Array} 누락된 필수 필드 배열
   */
  getMissingRequiredFields(stepInfo, collectedData) {
    if (!stepInfo || !stepInfo.fields || !Array.isArray(stepInfo.fields)) {
      return [];
    }
    
    return stepInfo.fields
      .filter(field => field.required && !(
        (field.name && collectedData[field.name]) || 
        (field.id && collectedData[field.id])
      ))
      .map(field => ({
        name: field.name || field.id,
        label: field.label || field.name || field.id,
        type: field.type,
        options: field.options
      }));
  }
  
  /**
   * 필드 정보 수집 프롬프트 생성
   * @param {Object} field - 필드 정보
   * @param {Object} stepInfo - 단계 정보
   * @returns {string} 사용자에게 보여줄 프롬프트
   */
  generateFieldPrompt(field, stepInfo) {
    if (!field) {
      return '구매를 진행하기 위해 필요한 정보를 알려주세요.';
    }
    
    // 필드 유형에 따른 프롬프트 생성
    const fieldType = field.type || 'text';
    const fieldLabel = field.label || field.name;
    
    switch (fieldType) {
      case 'email':
        return `이메일 주소를 알려주세요.`;
        
      case 'tel':
        return `연락 가능한 전화번호를 알려주세요.`;
        
      case 'text':
        if (field.name.toLowerCase().includes('name') || field.name.toLowerCase().includes('nome')) {
          return `성함을 알려주세요.`;
        } else if (field.name.toLowerCase().includes('address') || field.name.toLowerCase().includes('endereco')) {
          return `배송지 주소를 알려주세요.`;
        } else if (field.name.toLowerCase().includes('zip') || field.name.toLowerCase().includes('cep') || field.name.toLowerCase().includes('postal')) {
          return `우편번호를 알려주세요.`;
        } else if (field.name.toLowerCase().includes('city') || field.name.toLowerCase().includes('cidade')) {
          return `도시명을 알려주세요.`;
        } else if (field.name.toLowerCase().includes('state') || field.name.toLowerCase().includes('estado')) {
          return `주/도를 알려주세요.`;
        }
        break;
        
      case 'select':
      case 'radio':
        if (field.options && field.options.length > 0) {
          const options = field.options.map(opt => opt.text || opt.value).join(', ');
          return `${fieldLabel}을(를) 선택해주세요: ${options}`;
        }
        break;
    }
    
    // 기본 프롬프트
    return `${fieldLabel}을(를) 입력해주세요.`;
  }
  
  /**
   * 체크아웃 URL 생성
   * @param {Object} session - 체크아웃 세션 정보
   * @returns {Promise<string>} 체크아웃 URL
   */
  async generateCheckoutUrl(session) {
    try {
      const { productId, collectedData } = session;
      
      // 체크아웃 데이터 인코딩
      const encodedData = this.encodeCheckoutData(collectedData);
      
      // 기본 URL 생성
      let checkoutUrl = `https://www.lge.com/br/checkout?productId=${productId}`;
      
      // 프리필 데이터 추가 (사이트에서 지원하는 경우)
      if (encodedData) {
        checkoutUrl += `&prefill=${encodedData}`;
      }
      
      // 딥링크 URL 생성 옵션
      const deepLinkOptions = {
        generateDeepLink: true,
        autoFill: true,
        sessionId: session.sessionId
      };
      
      // 자동화 URL 생성 시도
      try {
        // Apify 딥링크 액터 실행 (가정)
        const run = await this.apifyClient.actor('user~checkout-deeplink-generator').call({
          productId,
          productUrl: `https://www.lge.com/br/product/${productId}`,
          checkoutData: collectedData,
          options: deepLinkOptions
        });
        
        // 결과 가져오기
        const { items } = await this.apifyClient.dataset(run.defaultDatasetId).listItems();
        
        if (items && items.length > 0 && items[0].deepLink) {
          return items[0].deepLink;
        }
      } catch (deepLinkError) {
        this.logger.error(`딥링크 생성 오류: ${deepLinkError.message}`);
        // 오류 시 기본 URL 반환
      }
      
      return checkoutUrl;
    } catch (error) {
      this.logger.error(`체크아웃 URL 생성 오류: ${error.message}`);
      return `https://www.lge.com/br/checkout?productId=${session.productId}`;
    }
  }
  
  /**
   * 체크아웃 데이터 인코딩
   * @param {Object} data - 체크아웃 데이터
   * @returns {string} 인코딩된 데이터
   */
  encodeCheckoutData(data) {
    try {
      // 민감한 데이터 필터링 (신용카드 등)
      const sanitizedData = { ...data };
      
      // 민감 정보 필드 제거
      const sensitiveFields = [
        'creditCardNumber', 'cardNumber', 'cvv', 'securityCode', 
        'cardVerificationCode', 'password', 'senha'
      ];
      
      for (const field of sensitiveFields) {
        if (sanitizedData[field]) {
          delete sanitizedData[field];
        }
      }
      
      // 데이터 직렬화 및 인코딩
      return encodeURIComponent(JSON.stringify(sanitizedData));
    } catch (error) {
      this.logger.error(`데이터 인코딩 오류: ${error.message}`);
      return '';
    }
  }
  
  /**
   * 주기적으로 오래된 세션 정리
   * @param {number} maxIdleTimeMs - 최대 유휴 시간 (밀리초, 기본 30분)
   */
  cleanupOldSessions(maxIdleTimeMs = 30 * 60 * 1000) {
    // 현재 시간
    const now = new Date();
    
    // 정리할 세션 키 목록
    const keysToRemove = [];
    
    // 각 세션 확인
    for (const [key, session] of this.activeSessions.entries()) {
      const lastActivity = session.lastActivity || session.startTime;
      const idleTime = now - lastActivity;
      
      // 최대 유휴 시간 초과 세션 정리
      if (idleTime > maxIdleTimeMs) {
        keysToRemove.push(key);
      }
    }
    
    // 오래된 세션 삭제
    for (const key of keysToRemove) {
      this.activeSessions.delete(key);
    }
    
    if (keysToRemove.length > 0) {
      this.logger.info(`${keysToRemove.length}개 오래된 세션 정리 완료`);
    }
  }
}

module.exports = CheckoutAutomationAgent;
