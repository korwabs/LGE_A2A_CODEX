/**
 * 대화형 체크아웃 핸들러 - LLM과 체크아웃 자동화 시스템 간의 연결을 관리합니다.
 */
const logger = require('../../utils/logger');

class ConversationalCheckoutHandler {
  /**
   * @param {object} options - 핸들러 옵션
   * @param {object} options.checkoutAutomation - 체크아웃 자동화 인스턴스
   * @param {object} options.llmClient - LLM 클라이언트 인스턴스
   */
  constructor(options = {}) {
    this.checkoutAutomation = options.checkoutAutomation;
    this.llmClient = options.llmClient;
    this.logger = logger;
    this.activeSessions = new Map();
  }
  
  /**
   * 체크아웃 프로세스를 시작합니다.
   * @param {string} userId - 사용자 ID
   * @param {string} productId - 제품 ID
   * @param {object} sessionContext - 세션 컨텍스트 정보
   * @returns {Promise<object>} 세션 정보 및 첫 단계 안내
   */
  async startCheckout(userId, productId, sessionContext = {}) {
    try {
      // 세션 생성
      const sessionId = this.checkoutAutomation.createCheckoutSession(userId, productId);
      
      // 세션 컨텍스트 추가
      if (sessionContext && Object.keys(sessionContext).length > 0) {
        this.checkoutAutomation.updateSessionInfo(sessionId, sessionContext);
      }
      
      // 현재 단계에 필요한 필드 가져오기
      const requiredFields = this.checkoutAutomation.getRequiredFieldsForSession(sessionId);
      
      // 누락된 필드 확인
      const missingFields = this.checkoutAutomation.getMissingFields(sessionId);
      
      // 활성 세션에 추가
      this.activeSessions.set(userId, {
        sessionId,
        productId,
        state: 'collecting_info',
        startedAt: new Date(),
        lastUpdatedAt: new Date(),
        collectedFields: [],
        requiredFields: requiredFields.map(field => field.name)
      });
      
      // LLM을 사용하여 첫 단계 안내 생성
      const nextPrompt = await this._generateFieldRequestPrompt(missingFields, {
        userId,
        sessionId,
        productInfo: this.checkoutAutomation.loadCheckoutProcess(productId)?.productInfo || {}
      });
      
      return {
        sessionId,
        state: 'collecting_info',
        nextPrompt,
        requiredFields,
        missingFields,
        progress: this._calculateProgress(sessionContext, requiredFields)
      };
    } catch (error) {
      this.logger.error('Failed to start checkout process:', error);
      throw error;
    }
  }
  
  /**
   * 대화 메시지를 처리하고 체크아웃 세션을 업데이트합니다.
   * @param {string} userId - 사용자 ID
   * @param {string} message - 사용자 메시지
   * @returns {Promise<object>} 처리 결과 및 다음 단계 안내
   */
  async processMessage(userId, message) {
    try {
      // 활성 세션 확인
      const userSession = this.activeSessions.get(userId);
      if (!userSession) {
        return {
          error: 'No active checkout session found',
          suggestedAction: 'start_new_session'
        };
      }
      
      const { sessionId, productId } = userSession;
      
      // 메시지에서 필요한 정보 추출
      const extractedInfo = await this._extractInformationFromMessage(
        message, 
        this.checkoutAutomation.getMissingFields(sessionId)
      );
      
      // 유효성 검사
      const validationResults = this._validateExtractedInfo(extractedInfo);
      
      if (validationResults.hasErrors) {
        // 유효성 검사 오류가 있는 경우
        return {
          state: 'validation_error',
          errors: validationResults.errors,
          nextPrompt: await this._generateValidationErrorPrompt(
            validationResults.errors, 
            { userId, sessionId, productId }
          )
        };
      }
      
      // 세션 업데이트
      this.checkoutAutomation.updateSessionInfo(sessionId, extractedInfo);
      
      // 세션 상태 업데이트
      userSession.lastUpdatedAt = new Date();
      userSession.collectedFields = [
        ...userSession.collectedFields,
        ...Object.keys(extractedInfo)
      ];
      
      // 누락된 필드 확인
      const missingFields = this.checkoutAutomation.getMissingFields(sessionId);
      
      if (missingFields.length === 0) {
        // 모든 필수 정보가 수집된 경우
        userSession.state = 'ready_for_checkout';
        
        // 딥링크 생성
        const deeplinkResult = this.checkoutAutomation.generateDeeplinkFromSession(sessionId);
        
        if (deeplinkResult.success) {
          // 체크아웃 준비 완료
          return {
            state: 'ready_for_checkout',
            deeplink: deeplinkResult.url,
            nextPrompt: await this._generateCheckoutReadyPrompt(
              extractedInfo, 
              { userId, sessionId, productId }
            )
          };
        } else {
          // 딥링크 생성 실패
          return {
            state: 'deeplink_error',
            error: deeplinkResult.error,
            nextPrompt: await this._generateDeeplinkErrorPrompt(
              deeplinkResult.error, 
              { userId, sessionId, productId }
            )
          };
        }
      } else {
        // 추가 정보가 필요한 경우
        return {
          state: 'collecting_info',
          processedFields: Object.keys(extractedInfo),
          missingFields,
          nextPrompt: await this._generateFieldRequestPrompt(
            missingFields, 
            { userId, sessionId, productId, lastInfo: extractedInfo }
          ),
          progress: this._calculateProgress(
            this.checkoutAutomation.sessionManager.getSession(sessionId)?.collectedInfo || {},
            this.checkoutAutomation.getRequiredFieldsForSession(sessionId)
          )
        };
      }
    } catch (error) {
      this.logger.error('Failed to process message:', error);
      
      return {
        state: 'error',
        error: error.message,
        nextPrompt: '죄송합니다, 체크아웃 과정에서 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
      };
    }
  }
  
  /**
   * 체크아웃 세션을 완료합니다.
   * @param {string} userId - 사용자 ID
   * @returns {Promise<object>} 완료 결과
   */
  async completeCheckout(userId) {
    try {
      // 활성 세션 확인
      const userSession = this.activeSessions.get(userId);
      if (!userSession) {
        return {
          error: 'No active checkout session found'
        };
      }
      
      const { sessionId } = userSession;
      
      // 딥링크 생성
      const deeplinkResult = this.checkoutAutomation.generateDeeplinkFromSession(sessionId);
      
      // 세션 종료
      this.activeSessions.delete(userId);
      
      return {
        state: 'completed',
        sessionId,
        deeplink: deeplinkResult.success ? deeplinkResult.url : null,
        error: deeplinkResult.success ? null : deeplinkResult.error,
        completedAt: new Date()
      };
    } catch (error) {
      this.logger.error('Failed to complete checkout:', error);
      return {
        state: 'error',
        error: error.message
      };
    }
  }
  
  /**
   * 체크아웃 세션을 취소합니다.
   * @param {string} userId - 사용자 ID
   * @returns {object} 취소 결과
   */
  cancelCheckout(userId) {
    try {
      // 활성 세션 확인
      const userSession = this.activeSessions.get(userId);
      if (!userSession) {
        return {
          error: 'No active checkout session found'
        };
      }
      
      // 세션 종료
      this.activeSessions.delete(userId);
      
      return {
        state: 'cancelled',
        sessionId: userSession.sessionId,
        cancelledAt: new Date()
      };
    } catch (error) {
      this.logger.error('Failed to cancel checkout:', error);
      return {
        state: 'error',
        error: error.message
      };
    }
  }
  
  /**
   * 필드 요청 프롬프트를 생성합니다.
   * @param {Array} missingFields - 누락된 필드 목록
   * @param {object} context - 컨텍스트 정보
   * @returns {Promise<string>} 생성된 프롬프트
   * @private
   */
  async _generateFieldRequestPrompt(missingFields, context) {
    if (!this.llmClient) {
      return this._generateDefaultFieldRequestPrompt(missingFields);
    }
    
    try {
      // 제품 정보 가져오기
      const productInfo = context.productInfo || {};
      
      // 시스템 프롬프트
      const systemPrompt = `당신은 LG 브라질의 쇼핑 어시스턴트입니다. 
체크아웃 과정에서 고객으로부터 필요한 정보를 수집하고 있습니다.
친절하고 자연스러운 대화 방식으로 필요한 정보를 요청하세요.
제품: ${productInfo.title || '선택한 제품'}
가격: ${productInfo.price || ''}

다음과 같은 필드에 대한 정보가 누락되어 있습니다:
${missingFields.map(field => `- ${field.label || field.name} (${field.type})`).join('\n')}

한 번에 너무 많은 정보를 요청하지 말고, 가장 중요한 2-3개 필드에 집중하세요.
사용자가 이미 제공한 정보를 다시 요청하지 마세요.
포르투갈어와 영어 표현을 적절히 혼합하여 브라질 현지화된 느낌을 주세요.`;
      
      // 사용자 프롬프트
      const userPrompt = `다음 필드에 대한 정보를 수집해야 합니다:
${missingFields.slice(0, 3).map(field => `- ${field.label || field.name}`).join('\n')}

사용자가 이미 제공한 정보:
${context.lastInfo ? Object.entries(context.lastInfo).map(([key, value]) => `- ${key}: ${value}`).join('\n') : '아직 제공된 정보 없음'}

자연스러운 대화 방식으로 필요한 정보를 요청하는 응답을 작성해 주세요.`;
      
      // LLM으로 프롬프트 생성
      const response = await this.llmClient.generateContent(systemPrompt, userPrompt);
      
      return response || this._generateDefaultFieldRequestPrompt(missingFields);
    } catch (error) {
      this.logger.error('Failed to generate field request prompt:', error);
      return this._generateDefaultFieldRequestPrompt(missingFields);
    }
  }
  
  /**
   * 기본 필드 요청 프롬프트를 생성합니다.
   * @param {Array} missingFields - 누락된 필드 목록
   * @returns {string} 생성된 프롬프트
   * @private
   */
  _generateDefaultFieldRequestPrompt(missingFields) {
    if (missingFields.length === 0) {
      return '모든 필요한 정보가 수집되었습니다. 주문을 계속 진행하시겠습니까?';
    }
    
    const nextField = missingFields[0];
    const fieldName = nextField.label || nextField.name;
    
    // 필드 유형에 따른 프롬프트 생성
    let prompt = '';
    
    switch (nextField.type) {
      case 'text':
      case 'email':
      case 'tel':
        prompt = `${fieldName}을(를) 알려주시겠어요?`;
        break;
        
      case 'select':
      case 'select-one':
        if (nextField.options && nextField.options.length > 0) {
          const optionTexts = nextField.options.map(opt => opt.text).join(', ');
          prompt = `${fieldName}을(를) 선택해 주세요: ${optionTexts}`;
        } else {
          prompt = `${fieldName}을(를) 선택해 주세요.`;
        }
        break;
        
      case 'radio':
        prompt = `${fieldName}에 대한 선택지를 알려주세요.`;
        break;
        
      default:
        prompt = `${fieldName}에 대한 정보를 알려주세요.`;
        break;
    }
    
    return prompt;
  }
  
  /**
   * 유효성 검사 오류 프롬프트를 생성합니다.
   * @param {Array} errors - 오류 목록
   * @param {object} context - 컨텍스트 정보
   * @returns {Promise<string>} 생성된 프롬프트
   * @private
   */
  async _generateValidationErrorPrompt(errors, context) {
    if (!this.llmClient) {
      return this._generateDefaultValidationErrorPrompt(errors);
    }
    
    try {
      // 시스템 프롬프트
      const systemPrompt = `당신은 LG 브라질의 쇼핑 어시스턴트입니다.
체크아웃 과정에서 고객이 제공한 정보에 문제가 있습니다.
친절하고 명확하게 오류를 설명하고 올바른 정보를 요청하세요.`;
      
      // 사용자 프롬프트
      const userPrompt = `다음과 같은 유효성 검사 오류가 발생했습니다:
${errors.map(error => `- ${error.field}: ${error.message}`).join('\n')}

사용자에게 친절하게 오류를 설명하고 올바른 정보를 요청하는 응답을 작성해 주세요.`;
      
      // LLM으로 프롬프트 생성
      const response = await this.llmClient.generateContent(systemPrompt, userPrompt);
      
      return response || this._generateDefaultValidationErrorPrompt(errors);
    } catch (error) {
      this.logger.error('Failed to generate validation error prompt:', error);
      return this._generateDefaultValidationErrorPrompt(errors);
    }
  }
  
  /**
   * 기본 유효성 검사 오류 프롬프트를 생성합니다.
   * @param {Array} errors - 오류 목록
   * @returns {string} 생성된 프롬프트
   * @private
   */
  _generateDefaultValidationErrorPrompt(errors) {
    if (errors.length === 0) {
      return '죄송합니다, 입력을 처리하는 중에 문제가 발생했습니다. 다시 시도해 주세요.';
    }
    
    const errorMessages = errors.map(error => `- ${error.field}: ${error.message}`).join('\n');
    
    return `입력하신 정보에 문제가 있습니다:\n${errorMessages}\n\n올바른 정보를 다시 입력해 주세요.`;
  }
  
  /**
   * 체크아웃 준비 완료 프롬프트를 생성합니다.
   * @param {object} collectedInfo - 수집된 정보
   * @param {object} context - 컨텍스트 정보
   * @returns {Promise<string>} 생성된 프롬프트
   * @private
   */
  async _generateCheckoutReadyPrompt(collectedInfo, context) {
    if (!this.llmClient) {
      return this._generateDefaultCheckoutReadyPrompt(collectedInfo);
    }
    
    try {
      // 제품 정보 가져오기
      const checkoutProcess = this.checkoutAutomation.loadCheckoutProcess(context.productId);
      const productInfo = checkoutProcess?.productInfo || {};
      
      // 시스템 프롬프트
      const systemPrompt = `당신은 LG 브라질의 쇼핑 어시스턴트입니다.
체크아웃에 필요한 모든 정보가 수집되었습니다.
사용자에게 수집된 정보를 요약하고, 체크아웃 링크를 제공하세요.
친절하고 전문적인 어조를 유지하세요.`;
      
      // 사용자 프롬프트
      const userPrompt = `제품: ${productInfo.title || '선택한 제품'}
가격: ${productInfo.price || ''}

수집된 정보:
${Object.entries(collectedInfo).map(([key, value]) => `- ${key}: ${value}`).join('\n')}

사용자에게 수집된 정보를 요약하고, 체크아웃 준비가 완료되었음을 알리는 응답을 작성해 주세요.
응답에 "[안전한 결제 페이지로 이동]" 링크가 포함되어야 합니다.`;
      
      // LLM으로 프롬프트 생성
      const response = await this.llmClient.generateContent(systemPrompt, userPrompt);
      
      return response || this._generateDefaultCheckoutReadyPrompt(collectedInfo);
    } catch (error) {
      this.logger.error('Failed to generate checkout ready prompt:', error);
      return this._generateDefaultCheckoutReadyPrompt(collectedInfo);
    }
  }
  
  /**
   * 기본 체크아웃 준비 완료 프롬프트를 생성합니다.
   * @param {object} collectedInfo - 수집된 정보
   * @returns {string} 생성된 프롬프트
   * @private
   */
  _generateDefaultCheckoutReadyPrompt(collectedInfo) {
    const infoSummary = Object.entries(collectedInfo)
      .filter(([key, value]) => !key.startsWith('_') && value) // 시스템 필드 제외
      .map(([key, value]) => `- ${key}: ${value}`)
      .join('\n');
    
    return `모든 필요한 정보가 수집되었습니다. 다음 정보로 주문을 진행합니다:\n\n${infoSummary}\n\n[안전한 결제 페이지로 이동] 링크를 클릭하면 카드 정보만 입력하면 바로 구매가 완료됩니다.`;
  }
  
  /**
   * 딥링크 오류 프롬프트를 생성합니다.
   * @param {string} error - 오류 메시지
   * @param {object} context - 컨텍스트 정보
   * @returns {Promise<string>} 생성된 프롬프트
   * @private
   */
  async _generateDeeplinkErrorPrompt(error, context) {
    if (!this.llmClient) {
      return this._generateDefaultDeeplinkErrorPrompt(error);
    }
    
    try {
      // 시스템 프롬프트
      const systemPrompt = `당신은 LG 브라질의 쇼핑 어시스턴트입니다.
체크아웃 링크를 생성하는 중에 오류가 발생했습니다.
사용자에게 문제를 설명하고 대안을 제시하세요.`;
      
      // 사용자 프롬프트
      const userPrompt = `다음과 같은 오류가 발생했습니다:
${error}

사용자에게 문제를 설명하고, 대안적인 해결책을 제시하는 응답을 작성해 주세요.
예를 들어, 직접 LG 브라질 웹사이트를 방문하도록 안내할 수 있습니다.`;
      
      // LLM으로 프롬프트 생성
      const response = await this.llmClient.generateContent(systemPrompt, userPrompt);
      
      return response || this._generateDefaultDeeplinkErrorPrompt(error);
    } catch (error) {
      this.logger.error('Failed to generate deeplink error prompt:', error);
      return this._generateDefaultDeeplinkErrorPrompt(error);
    }
  }
  
  /**
   * 기본 딥링크 오류 프롬프트를 생성합니다.
   * @param {string} error - 오류 메시지
   * @returns {string} 생성된 프롬프트
   * @private
   */
  _generateDefaultDeeplinkErrorPrompt(error) {
    return `죄송합니다, 체크아웃 링크를 생성하는 중에 문제가 발생했습니다. 직접 LG 브라질 웹사이트(https://www.lge.com/br)에 방문하여 장바구니에서 구매를 진행해 주세요.`;
  }
  
  /**
   * 사용자 메시지에서 정보를 추출합니다.
   * @param {string} message - 사용자 메시지
   * @param {Array} targetFields - 대상 필드 목록
   * @returns {Promise<object>} 추출된 정보
   * @private
   */
  async _extractInformationFromMessage(message, targetFields) {
    if (!this.llmClient) {
      return this._extractBasicInformation(message, targetFields);
    }
    
    try {
      // 필드 정보 구성
      const fieldsInfo = targetFields
        .map(field => {
          let description = `${field.label || field.name} (${field.type})`;
          
          if (field.options && field.options.length > 0) {
            description += `: 옵션 - ${field.options.map(opt => opt.text).join(', ')}`;
          }
          
          return description;
        })
        .join('\n');
      
      // 시스템 프롬프트
      const systemPrompt = `당신은 LG 브라질의 쇼핑 어시스턴트입니다.
사용자 메시지에서 체크아웃에 필요한 정보를 추출하는 작업을 수행하고 있습니다.
다음 필드에 대한 정보를 추출해 주세요:

${fieldsInfo}

요청된 필드의 정보만 추출하고, 나머지는 무시하세요.
결과는 JSON 형식으로 반환해 주세요.
예: {"name": "João Silva", "email": "joao@example.com"}`;
      
      // 사용자 프롬프트
      const userPrompt = `다음 사용자 메시지에서 필요한 정보를 추출해 주세요:

"${message}"

JSON 형식으로 결과만 반환하세요.`;
      
      // LLM으로 정보 추출
      const response = await this.llmClient.generateContentStructured(
        systemPrompt, 
        userPrompt, 
        {
          schema: {
            type: 'object',
            properties: Object.fromEntries(
              targetFields.map(field => [
                field.name,
                { type: 'string' }
              ])
            ),
            additionalProperties: false
          }
        }
      );
      
      return response || this._extractBasicInformation(message, targetFields);
    } catch (error) {
      this.logger.error('Failed to extract information from message:', error);
      return this._extractBasicInformation(message, targetFields);
    }
  }
  
  /**
   * 기본 정보 추출 방법입니다.
   * @param {string} message - 사용자 메시지
   * @param {Array} targetFields - 대상 필드 목록
   * @returns {object} 추출된 정보
   * @private
   */
  _extractBasicInformation(message, targetFields) {
    const extractedInfo = {};
    
    // 각 필드에 대해 간단한 패턴 매칭 시도
    for (const field of targetFields) {
      const fieldName = field.name.toLowerCase();
      const fieldLabel = (field.label || '').toLowerCase();
      
      // 이메일 추출
      if (fieldName.includes('email') || fieldLabel.includes('email')) {
        const emailMatch = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (emailMatch) {
          extractedInfo[field.name] = emailMatch[0];
          continue;
        }
      }
      
      // 전화번호 추출
      if (fieldName.includes('phone') || fieldName.includes('tel') || 
          fieldLabel.includes('phone') || fieldLabel.includes('tel') ||
          fieldLabel.includes('telefone')) {
        const phoneMatch = message.match(/(\+\d{1,3})?[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{1,4}[\s.-]?\d{1,9}/);
        if (phoneMatch) {
          extractedInfo[field.name] = phoneMatch[0];
          continue;
        }
      }
      
      // 우편번호 추출
      if (fieldName.includes('zip') || fieldName.includes('cep') || 
          fieldLabel.includes('zip') || fieldLabel.includes('cep') ||
          fieldName.includes('postal') || fieldLabel.includes('postal')) {
        const zipMatch = message.match(/\d{5}[-\s]?\d{3}/);
        if (zipMatch) {
          extractedInfo[field.name] = zipMatch[0];
          continue;
        }
      }
    }
    
    return extractedInfo;
  }
  
  /**
   * 추출된 정보의 유효성을 검사합니다.
   * @param {object} extractedInfo - 추출된 정보
   * @returns {object} 유효성 검사 결과
   * @private
   */
  _validateExtractedInfo(extractedInfo) {
    const errors = [];
    
    // 각 필드 유효성 검사
    for (const [field, value] of Object.entries(extractedInfo)) {
      // 이메일 유효성 검사
      if (field.toLowerCase().includes('email')) {
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailRegex.test(value)) {
          errors.push({
            field,
            message: '유효한 이메일 주소 형식이 아닙니다.'
          });
        }
      }
      
      // 전화번호 유효성 검사 (브라질 형식)
      if (field.toLowerCase().includes('phone') || field.toLowerCase().includes('tel')) {
        const phoneRegex = /^(\+55)?\s?(\d{2})?\s?(\d{4,5})[-\s]?(\d{4})$/;
        if (!phoneRegex.test(value)) {
          errors.push({
            field,
            message: '유효한 전화번호 형식이 아닙니다. 예: (11) 98765-4321'
          });
        }
      }
      
      // 우편번호 유효성 검사 (브라질 CEP 형식)
      if (field.toLowerCase().includes('zip') || 
          field.toLowerCase().includes('cep') || 
          field.toLowerCase().includes('postal')) {
        const cepRegex = /^\d{5}[-\s]?\d{3}$/;
        if (!cepRegex.test(value)) {
          errors.push({
            field,
            message: '유효한 CEP(우편번호) 형식이 아닙니다. 예: 01310-100'
          });
        }
      }
    }
    
    return {
      hasErrors: errors.length > 0,
      errors
    };
  }
  
  /**
   * 체크아웃 진행 상황을 계산합니다.
   * @param {object} collectedInfo - 수집된 정보
   * @param {Array} requiredFields - 필수 필드 목록
   * @returns {number} 진행률 (0-100)
   * @private
   */
  _calculateProgress(collectedInfo, requiredFields) {
    if (!requiredFields || requiredFields.length === 0) {
      return 100;
    }
    
    const totalRequired = requiredFields.length;
    let collectedCount = 0;
    
    // 수집된 필드 수 계산
    for (const field of requiredFields) {
      const fieldName = field.name || field;
      if (collectedInfo[fieldName] !== undefined) {
        collectedCount++;
      }
    }
    
    return Math.round((collectedCount / totalRequired) * 100);
  }
  
  /**
   * 활성 세션 목록을 반환합니다.
   * @returns {Array} 활성 세션 목록
   */
  getActiveSessions() {
    return Array.from(this.activeSessions.entries()).map(([userId, session]) => ({
      userId,
      sessionId: session.sessionId,
      productId: session.productId,
      state: session.state,
      startedAt: session.startedAt,
      lastUpdatedAt: session.lastUpdatedAt,
      progress: this._calculateProgress(
        this.checkoutAutomation.sessionManager.getSession(session.sessionId)?.collectedInfo || {},
        session.requiredFields
      )
    }));
  }
  
  /**
   * 사용자의 활성 세션을 반환합니다.
   * @param {string} userId - 사용자 ID
   * @returns {object|null} 활성 세션 정보
   */
  getUserSession(userId) {
    const session = this.activeSessions.get(userId);
    
    if (!session) {
      return null;
    }
    
    return {
      userId,
      sessionId: session.sessionId,
      productId: session.productId,
      state: session.state,
      startedAt: session.startedAt,
      lastUpdatedAt: session.lastUpdatedAt,
      progress: this._calculateProgress(
        this.checkoutAutomation.sessionManager.getSession(session.sessionId)?.collectedInfo || {},
        session.requiredFields
      )
    };
  }
}

module.exports = ConversationalCheckoutHandler;
