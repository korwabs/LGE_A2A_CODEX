/**
 * 체크아웃 세션 매니저 - 사용자 체크아웃 세션을 관리하고 딥링크를 생성합니다.
 */
const logger = require('../../utils/logger');
const crypto = require('crypto');

class CheckoutSessionManager {
  /**
   * @param {object} options - 체크아웃 세션 매니저 옵션
   * @param {object} options.formFieldMappingManager - 폼 필드 매핑 매니저 인스턴스
   * @param {object} options.checkoutProcessManager - 체크아웃 프로세스 매니저 인스턴스
   */
  constructor(options = {}) {
    this.formFieldMappingManager = options.formFieldMappingManager;
    this.checkoutProcessManager = options.checkoutProcessManager;
    this.sessions = new Map();
    this.logger = logger;
  }
  
  /**
   * 새 체크아웃 세션을 생성합니다.
   * @param {string} userId - 사용자 ID
   * @param {string} productId - 제품 ID
   * @returns {string} 세션 ID
   */
  createSession(userId, productId) {
    const sessionId = this._generateSessionId();
    
    this.sessions.set(sessionId, {
      userId,
      productId,
      createdAt: new Date(),
      updatedAt: new Date(),
      state: 'created',
      collectedInfo: {},
      completedSteps: []
    });
    
    this.logger.info(`Created checkout session ${sessionId} for user ${userId}, product ${productId}`);
    return sessionId;
  }
  
  /**
   * 세션 정보를 가져옵니다.
   * @param {string} sessionId - 세션 ID
   * @returns {object|null} 세션 정보
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }
  
  /**
   * 세션에 정보를 추가합니다.
   * @param {string} sessionId - 세션 ID
   * @param {object} info - 추가할 정보
   * @returns {boolean} 성공 여부
   */
  updateSessionInfo(sessionId, info) {
    const session = this.getSession(sessionId);
    if (!session) return false;
    
    // 정보 업데이트
    session.collectedInfo = {
      ...session.collectedInfo,
      ...info
    };
    
    session.updatedAt = new Date();
    
    this.logger.info(`Updated info for session ${sessionId}`);
    return true;
  }
  
  /**
   * 세션 상태를 업데이트합니다.
   * @param {string} sessionId - 세션 ID
   * @param {string} state - 새 상태
   * @returns {boolean} 성공 여부
   */
  updateSessionState(sessionId, state) {
    const session = this.getSession(sessionId);
    if (!session) return false;
    
    session.state = state;
    session.updatedAt = new Date();
    
    this.logger.info(`Updated state for session ${sessionId} to ${state}`);
    return true;
  }
  
  /**
   * 완료된 단계를 추가합니다.
   * @param {string} sessionId - 세션 ID
   * @param {string} stepName - 단계 이름
   * @returns {boolean} 성공 여부
   */
  addCompletedStep(sessionId, stepName) {
    const session = this.getSession(sessionId);
    if (!session) return false;
    
    if (!session.completedSteps.includes(stepName)) {
      session.completedSteps.push(stepName);
      session.updatedAt = new Date();
    }
    
    this.logger.info(`Added completed step ${stepName} for session ${sessionId}`);
    return true;
  }
  
  /**
   * 다음 단계 정보를 가져옵니다.
   * @param {string} sessionId - 세션 ID
   * @returns {object|null} 다음 단계 정보
   */
  getNextStep(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) return null;
    
    // 체크아웃 프로세스 로드
    const checkoutProcess = this.checkoutProcessManager.loadCheckoutProcess(session.productId);
    if (!checkoutProcess) return null;
    
    // 모든 단계 정보 추출
    const steps = this.checkoutProcessManager.extractCheckoutSteps(checkoutProcess);
    
    // 완료되지 않은 다음 단계 찾기
    for (const step of steps) {
      if (!session.completedSteps.includes(step.name)) {
        return step;
      }
    }
    
    return null;
  }
  
  /**
   * 현재 단계에 필요한 필드 정보를 가져옵니다.
   * @param {string} sessionId - 세션 ID
   * @returns {Array} 필요한 필드 목록
   */
  getRequiredFieldsForCurrentStep(sessionId) {
    const nextStep = this.getNextStep(sessionId);
    if (!nextStep) return [];
    
    const requiredFields = [];
    
    // 현재 단계의 모든 폼에서 필수 필드 추출
    for (const form of nextStep.forms) {
      for (const field of form.fields || []) {
        if (field.required) {
          requiredFields.push({
            name: field.name,
            type: field.type,
            label: field.label,
            placeholder: field.placeholder,
            options: field.options || []
          });
        }
      }
    }
    
    return requiredFields;
  }
  
  /**
   * 세션에 수집된 정보에서 아직 수집되지 않은 필수 필드를 찾습니다.
   * @param {string} sessionId - 세션 ID
   * @returns {Array} 누락된 필수 필드 목록
   */
  getMissingRequiredFields(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) return [];
    
    const requiredFields = this.getRequiredFieldsForCurrentStep(sessionId);
    const collectedInfo = session.collectedInfo;
    
    // 아직 수집되지 않은 필드 찾기
    return requiredFields.filter(field => {
      const fieldName = field.name.toLowerCase();
      
      // 이름 기반 매칭
      if (collectedInfo[fieldName] !== undefined) {
        return false;
      }
      
      // 라벨 기반 매칭 (필드 라벨에 해당하는 정보가 있는지 확인)
      const fieldLabel = (field.label || '').toLowerCase().split(' ')[0];
      if (fieldLabel && collectedInfo[fieldLabel] !== undefined) {
        return false;
      }
      
      // 공통 필드 이름 패턴과 수집된 정보의 키 비교
      for (const infoKey of Object.keys(collectedInfo)) {
        // 이름 관련 필드
        if ((fieldName.includes('name') || fieldName.includes('nome')) && 
            (infoKey === 'name' || infoKey === 'firstName' || infoKey === 'lastName')) {
          return false;
        }
        
        // 주소 관련 필드
        if ((fieldName.includes('address') || fieldName.includes('endereco')) && 
            (infoKey === 'address' || infoKey === 'street')) {
          return false;
        }
        
        // 이메일 필드
        if (fieldName.includes('email') && infoKey === 'email') {
          return false;
        }
        
        // 전화번호 필드
        if ((fieldName.includes('phone') || fieldName.includes('tel') || fieldName.includes('telefone')) && 
            (infoKey === 'phone' || infoKey === 'telephone' || infoKey === 'mobile')) {
          return false;
        }
      }
      
      return true;
    });
  }
  
  /**
   * 체크아웃 딥링크를 생성합니다.
   * @param {string} sessionId - 세션 ID
   * @returns {object} 생성된 딥링크 정보
   */
  generateDeeplink(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) {
      return {
        success: false,
        error: 'Session not found'
      };
    }
    
    try {
      // 체크아웃 프로세스 데이터 로드
      const checkoutProcess = this.checkoutProcessManager.loadCheckoutProcess(session.productId);
      if (!checkoutProcess) {
        return {
          success: false,
          error: 'Checkout process data not available'
        };
      }
      
      // 기본 URL 설정
      const baseUrl = checkoutProcess.url || 'https://www.lge.com/br/checkout';
      const url = new URL(baseUrl);
      const params = url.searchParams;
      
      // 세션 정보를 URL 파라미터에 매핑
      if (this.formFieldMappingManager) {
        this.formFieldMappingManager.mapUserInfoToParams(checkoutProcess, session.collectedInfo, params);
      }
      
      // 세션 ID 추가 (추후 연동을 위해)
      params.set('session_id', sessionId);
      
      // 타임스탬프 추가 (캐시 방지)
      params.set('_t', Date.now().toString());
      
      // 최종 URL 반환
      return {
        success: true,
        url: url.toString(),
        hasAllRequiredInfo: this.getMissingRequiredFields(sessionId).length === 0
      };
    } catch (error) {
      this.logger.error(`Failed to generate checkout deeplink for session ${sessionId}:`, error);
      
      return {
        success: false,
        error: error.message || 'Unknown error',
        url: 'https://www.lge.com/br/checkout'
      };
    }
  }
  
  /**
   * 세션을 제거합니다.
   * @param {string} sessionId - 세션 ID
   * @returns {boolean} 성공 여부
   */
  removeSession(sessionId) {
    return this.sessions.delete(sessionId);
  }
  
  /**
   * 만료된 세션을 정리합니다.
   * @param {number} expirationMinutes - 세션 만료 시간(분)
   * @returns {number} 정리된 세션 수
   */
  cleanupExpiredSessions(expirationMinutes = 30) {
    const now = new Date();
    let count = 0;
    
    for (const [sessionId, session] of this.sessions.entries()) {
      const updatedAt = session.updatedAt || session.createdAt;
      const diffMinutes = (now - updatedAt) / (1000 * 60);
      
      if (diffMinutes > expirationMinutes) {
        this.sessions.delete(sessionId);
        count++;
      }
    }
    
    if (count > 0) {
      this.logger.info(`Cleaned up ${count} expired checkout sessions`);
    }
    
    return count;
  }
  
  /**
   * 세션 ID를 생성합니다.
   * @returns {string} 생성된 세션 ID
   * @private
   */
  _generateSessionId() {
    return crypto.randomBytes(16).toString('hex');
  }
}

module.exports = CheckoutSessionManager;
