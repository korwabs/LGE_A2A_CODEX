/**
 * Gemini 통합 MCP 프롬프트 관리 클래스
 * Gemini AI와 MCP를 연동하여 효율적인 프롬프트 관리를 제공합니다.
 */
const { VertexAI } = require('@google-cloud/vertexai');

class MCPGeminiPromptManager {
  /**
   * 생성자
   * @param {MCPContextManager} contextManager - MCP 컨텍스트 관리자
   * @param {Object} config - 설정 객체
   */
  constructor(contextManager, config = {}) {
    this.contextManager = contextManager;
    this.config = {
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
      modelName: process.env.GEMINI_MODEL_NAME || 'gemini-pro',
      ...config
    };
    
    // Vertex AI 클라이언트 초기화
    this.vertexAI = new VertexAI({
      project: this.config.projectId,
      location: this.config.location
    });
    
    // Gemini 모델 초기화
    this.geminiModel = this.vertexAI.getGenerativeModel({
      model: this.config.modelName
    });
    
    this.logger = console; // 나중에 더 좋은 로깅 시스템으로 교체 가능
    
    // 기본 프롬프트 템플릿 설정
    this.setupPromptTemplates();
  }
  
  /**
   * 프롬프트 템플릿 설정
   */
  setupPromptTemplates() {
    // 제품 검색용 프롬프트 템플릿
    this.contextManager.registerTemplate('productSearch', `
      당신은 LG 브라질 쇼핑 어시스턴트입니다.
      
      # 사용자 정보
      사용자 ID: {{userId}}
      선호 카테고리: {{preferredCategories}}
      최근 검색어: {{recentSearches}}
      
      # 제품 데이터 컨텍스트
      {{productContext}}
      
      # 현재 대화 컨텍스트
      {{conversationHistory}}
      
      # 지시사항
      사용자의 질문에서 제품 검색 의도를 파악하여 관련된 제품을 추천해주세요.
      제품 추천 시 사용자의 선호도와 이전 검색 기록을 고려하세요.
      제품의 주요 특징, 가격, 재고 상태를 명확하게 설명해주세요.
      포르투갈어로 응답해야 할 경우 자연스러운 포르투갈어(브라질)로 응답하세요.
      
      사용자 질문: {{userQuery}}
    `);
    
    // 구매 프로세스 지원용 프롬프트 템플릿
    this.contextManager.registerTemplate('purchaseProcess', `
      당신은 LG 브라질 쇼핑 어시스턴트입니다.
      
      # 구매 프로세스 정보
      현재 단계: {{currentCheckoutStep}}
      필요한 정보: {{requiredFields}}
      이미 수집된 정보: {{collectedInfo}}
      
      # 지시사항
      사용자가 구매 프로세스를 완료할 수 있도록 필요한 정보를 자연스러운 대화로 수집하세요.
      누락된 정보가 있다면 친절하게 요청하세요.
      이미 제공된 정보는 다시 묻지 마세요.
      포르투갈어로 응답해야 할 경우 자연스러운 포르투갈어(브라질)로 응답하세요.
      
      사용자 메시지: {{userMessage}}
    `);
    
    // 의도 분석용 프롬프트 템플릿
    this.contextManager.registerTemplate('intentAnalysis', `
      당신은 LG 브라질 쇼핑 어시스턴트의 의도 분석 컴포넌트입니다.
      
      # 지시사항
      사용자 메시지에서 의도를 분석하고 JSON 형식으로 반환하세요.
      다음 의도 유형을 사용하세요:
      - productSearch: 제품 검색 또는 추천 요청
      - purchaseIntent: 구매 의도
      - cartOperation: 장바구니 조작 요청
      - generalQuery: 일반적인 질문이나 도움 요청
      
      의도 분석 결과에는 다음 필드를 포함하세요:
      - type: 위에서 정의한 의도 유형 중 하나
      - filters: 제품 검색 시 적용할 필터 (제품 카테고리, 가격 범위, 특성 등)
      - productId: 구매 의도일 경우 관련 제품 ID
      - operation: 장바구니 조작 요청 시 수행할 작업 (추가, 삭제, 조회 등)
      
      # 현재 대화 컨텍스트
      {{conversationHistory}}
      
      사용자 메시지: {{userMessage}}
    `);
    
    // 제품 추천 결과 형식화용 프롬프트 템플릿
    this.contextManager.registerTemplate('formatRecommendations', `
      당신은 LG 브라질 쇼핑 어시스턴트입니다.
      
      # 지시사항
      사용자의 질문에 대한 제품 추천 결과를 사용자 친화적인 형식으로 변환하세요.
      추천 제품의 핵심 특징과 장점을 강조하세요.
      가격과 재고 상태 정보를 명확하게 제시하세요.
      포르투갈어로 응답해야 할 경우 자연스러운 포르투갈어(브라질)로 응답하세요.
      
      사용자 질문: {{userQuery}}
      
      추천 제품:
      {{recommendations}}
    `);
  }
  
  /**
   * Gemini AI 응답 생성
   * @param {string} userId - 사용자 식별자
   * @param {string} templateId - 템플릿 식별자
   * @param {Object} additionalData - 추가 데이터
   * @returns {Promise<string>} Gemini 응답 텍스트
   */
  async generateGeminiResponse(userId, templateId, additionalData = {}) {
    try {
      // MCP 프롬프트 생성
      const prompt = this.contextManager.generatePrompt(userId, templateId, additionalData);
      
      this.logger.info(`사용자 ${userId}를 위한 Gemini 응답 생성 시작 (템플릿: ${templateId})`);
      
      // Gemini AI API 호출
      const geminiResponse = await this.geminiModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });
      
      const response = geminiResponse.response;
      const responseText = response.text();
      
      this.logger.info(`사용자 ${userId}를 위한 Gemini 응답 생성 완료`);
      
      return responseText;
    } catch (error) {
      this.logger.error(`Gemini 응답 생성 오류:`, error);
      throw error;
    }
  }
  
  /**
   * 의도 분석 수행
   * @param {string} userId - 사용자 식별자
   * @param {string} userMessage - 사용자 메시지
   * @param {Object} conversationHistory - 대화 히스토리
   * @returns {Promise<Object>} 분석된 의도 객체
   */
  async analyzeIntent(userId, userMessage, conversationHistory = []) {
    try {
      const response = await this.generateGeminiResponse(
        userId,
        'intentAnalysis',
        { userMessage, conversationHistory: JSON.stringify(conversationHistory) }
      );
      
      // 응답을 JSON으로 파싱
      return JSON.parse(response);
    } catch (error) {
      this.logger.error(`의도 분석 오류:`, error);
      // 기본 의도 반환
      return { type: 'generalQuery' };
    }
  }
}

module.exports = MCPGeminiPromptManager;
