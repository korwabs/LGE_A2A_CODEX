/**
 * 크롤링 오류 처리 및 복구 전략
 */
const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

/**
 * 크롤링 오류 처리기 클래스
 */
class CrawlingErrorHandler {
  /**
   * @param {object} options - 오류 처리기 옵션
   * @param {string} options.logDir - 로그 디렉토리
   * @param {number} options.maxRetryAttempts - 최대 재시도 횟수
   * @param {boolean} options.logDetailedErrors - 상세 오류 로깅 여부
   * @param {object} options.browserController - 브라우저 컨트롤러 인스턴스
   */
  constructor(options = {}) {
    this.logDir = options.logDir || path.join(__dirname, '../../../logs');
    this.maxRetryAttempts = options.maxRetryAttempts || 3;
    this.logDetailedErrors = options.logDetailedErrors !== false;
    this.browserController = options.browserController;
    this.logger = logger;
    
    // 로그 디렉토리 확인
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    
    // 오류 유형별 처리 전략 맵
    this.errorStrategies = {
      // 네트워크 관련 오류
      'net::ERR_CONNECTION': this._handleNetworkError.bind(this),
      'net::ERR_TIMED_OUT': this._handleTimeoutError.bind(this),
      'Navigation timeout': this._handleTimeoutError.bind(this),
      'ERR_CONNECTION_REFUSED': this._handleConnectionRefusedError.bind(this),
      
      // 접근 제한 관련 오류
      '403': this._handleAccessDeniedError.bind(this),
      'Access denied': this._handleAccessDeniedError.bind(this),
      'Forbidden': this._handleAccessDeniedError.bind(this),
      'CAPTCHA': this._handleCaptchaError.bind(this),
      
      // 컨텐츠 관련 오류
      '404': this._handleNotFoundError.bind(this),
      'Not found': this._handleNotFoundError.bind(this),
      
      // 브라우저 관련 오류
      'Protocol error': this._handleBrowserError.bind(this),
      'Target closed': this._handleBrowserCrashError.bind(this),
      
      // 기타 오류
      'default': this._handleDefaultError.bind(this)
    };
  }
  
  /**
   * 오류를 식별하고 적절한 처리 전략을 적용합니다.
   * @param {Error} error - 발생한 오류
   * @param {object} context - 오류 컨텍스트
   * @param {number} retryCount - 현재 재시도 횟수
   * @returns {Promise<object>} 처리 결과
   */
  async handleError(error, context = {}, retryCount = 0) {
    const errorMessage = error.message || String(error);
    this.logger.error(`CrawlingErrorHandler: 오류 발생 (시도 ${retryCount + 1}/${this.maxRetryAttempts + 1})`, errorMessage);
    
    // 상세 오류 정보 로깅
    if (this.logDetailedErrors) {
      this._logDetailedError(error, context, retryCount);
    }
    
    // 재시도 횟수 초과 확인
    if (retryCount >= this.maxRetryAttempts) {
      this.logger.warn(`CrawlingErrorHandler: 최대 재시도 횟수 초과 (${this.maxRetryAttempts})`);
      return { success: false, error: errorMessage, action: 'abort' };
    }
    
    // 오류 유형 식별 및 처리 전략 선택
    const strategy = this._identifyErrorStrategy(errorMessage);
    
    try {
      // 전략 적용
      const result = await strategy(error, context, retryCount);
      
      // 전략 적용 결과 로깅
      this.logger.info(`CrawlingErrorHandler: 오류 처리 전략 적용 - ${result.action}`);
      
      return result;
    } catch (strategyError) {
      // 전략 적용 중 오류 발생
      this.logger.error(`CrawlingErrorHandler: 오류 처리 전략 실패`, strategyError);
      
      // 기본 전략 적용 (재시도)
      return {
        success: false,
        error: errorMessage,
        action: 'retry',
        delay: 5000,
        message: '오류 처리 전략 실패, 기본 재시도'
      };
    }
  }
  
  /**
   * 오류 유형을 식별하고 적절한 처리 전략을 반환합니다.
   * @param {string} errorMessage - 오류 메시지
   * @returns {Function} 오류 처리 전략
   * @private
   */
  _identifyErrorStrategy(errorMessage) {
    // 오류 메시지로 적절한 전략 찾기
    for (const [errorType, strategy] of Object.entries(this.errorStrategies)) {
      if (errorMessage.includes(errorType)) {
        return strategy;
      }
    }
    
    // 매칭되는 전략이 없으면 기본 전략 반환
    return this.errorStrategies.default;
  }
  
  /**
   * 상세 오류 정보를 로깅합니다.
   * @param {Error} error - 발생한 오류
   * @param {object} context - 오류 컨텍스트
   * @param {number} retryCount - 현재 재시도 횟수
   * @private
   */
  _logDetailedError(error, context, retryCount) {
    try {
      const timestamp = new Date().toISOString();
      const fileName = `crawling_error_${timestamp.replace(/[:.]/g, '-')}.json`;
      const filePath = path.join(this.logDir, fileName);
      
      const logData = {
        timestamp,
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name
        },
        context,
        retryCount,
        browserInfo: context.browserInfo || null
      };
      
      fs.writeFileSync(filePath, JSON.stringify(logData, null, 2));
      this.logger.debug(`CrawlingErrorHandler: 상세 오류 정보 로깅 완료 - ${filePath}`);
    } catch (logError) {
      this.logger.error('CrawlingErrorHandler: 상세 오류 정보 로깅 실패', logError);
    }
  }
  
  /**
   * 네트워크 오류 처리 전략
   * @param {Error} error - 발생한 오류
   * @param {object} context - 오류 컨텍스트
   * @param {number} retryCount - 현재 재시도 횟수
   * @returns {Promise<object>} 처리 결과
   * @private
   */
  async _handleNetworkError(error, context, retryCount) {
    // 지수 백오프 지연 계산
    const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
    
    return {
      success: false,
      error: error.message,
      action: 'retry',
      delay,
      message: `네트워크 오류, ${delay}ms 후 재시도`
    };
  }
  
  /**
   * 타임아웃 오류 처리 전략
   * @param {Error} error - 발생한 오류
   * @param {object} context - 오류 컨텍스트
   * @param {number} retryCount - 현재 재시도 횟수
   * @returns {Promise<object>} 처리 결과
   * @private
   */
  async _handleTimeoutError(error, context, retryCount) {
    // 타임아웃 값 증가 및 재시도
    const currentTimeout = context.timeout || 30000;
    const newTimeout = currentTimeout * 1.5;
    
    return {
      success: false,
      error: error.message,
      action: 'retry',
      delay: 3000,
      modifyOptions: {
        timeout: newTimeout
      },
      message: `타임아웃 오류, 타임아웃 값 증가 (${currentTimeout}ms → ${newTimeout}ms)`
    };
  }
  
  /**
   * 연결 거부 오류 처리 전략
   * @param {Error} error - 발생한 오류
   * @param {object} context - 오류 컨텍스트
   * @param {number} retryCount - 현재 재시도 횟수
   * @returns {Promise<object>} 처리 결과
   * @private
   */
  async _handleConnectionRefusedError(error, context, retryCount) {
    // 서버가 일시적으로 요청을 거부하는 경우, 더 긴 지연 후 재시도
    const delay = 10000 * (retryCount + 1);
    
    return {
      success: false,
      error: error.message,
      action: 'retry',
      delay,
      message: `연결 거부 오류, ${delay}ms 후 재시도`
    };
  }
  
  /**
   * 접근 거부 오류 처리 전략
   * @param {Error} error - 발생한 오류
   * @param {object} context - 오류 컨텍스트
   * @param {number} retryCount - 현재 재시도 횟수
   * @returns {Promise<object>} 처리 결과
   * @private
   */
  async _handleAccessDeniedError(error, context, retryCount) {
    if (this.browserController) {
      // 차단 우회 시도
      await this._tryBypassBlocking(context);
    }
    
    // 더 긴 지연 후 재시도
    const delay = 15000 * (retryCount + 1);
    
    return {
      success: false,
      error: error.message,
      action: 'retry',
      delay,
      modifyOptions: {
        useProxy: true, // 프록시 사용 활성화
        rotateUserAgent: true // 사용자 에이전트 변경
      },
      message: `접근 거부 오류, 차단 우회 시도 후 ${delay}ms 후 재시도`
    };
  }
  
  /**
   * CAPTCHA 오류 처리 전략
   * @param {Error} error - 발생한 오류
   * @param {object} context - 오류 컨텍스트
   * @param {number} retryCount - 현재 재시도 횟수
   * @returns {Promise<object>} 처리 결과
   * @private
   */
  async _handleCaptchaError(error, context, retryCount) {
    // CAPTCHA는 자동 처리가 어려움, 로깅 후 건너뛰기
    this.logger.warn(`CrawlingErrorHandler: CAPTCHA 감지됨, 해당 URL 건너뛰기 - ${context.url}`);
    
    return {
      success: false,
      error: 'CAPTCHA detected',
      action: 'skip',
      message: 'CAPTCHA 감지됨, 이 URL은 건너뜁니다'
    };
  }
  
  /**
   * 페이지 찾을 수 없음 오류 처리 전략
   * @param {Error} error - 발생한 오류
   * @param {object} context - 오류 컨텍스트
   * @param {number} retryCount - 현재 재시도 횟수
   * @returns {Promise<object>} 처리 결과
   * @private
   */
  async _handleNotFoundError(error, context, retryCount) {
    // 404는 재시도해도 동일한 결과, 건너뛰기
    return {
      success: false,
      error: 'Page not found (404)',
      action: 'skip',
      message: '페이지를 찾을 수 없음 (404), 이 URL은 건너뜁니다'
    };
  }
  
  /**
   * 브라우저 오류 처리 전략
   * @param {Error} error - 발생한 오류
   * @param {object} context - 오류 컨텍스트
   * @param {number} retryCount - 현재 재시도 횟수
   * @returns {Promise<object>} 처리 결과
   * @private
   */
  async _handleBrowserError(error, context, retryCount) {
    if (this.browserController) {
      // 브라우저 재시작 시도
      await this._restartBrowser();
    }
    
    return {
      success: false,
      error: error.message,
      action: 'retry',
      delay: 3000,
      message: '브라우저 오류, 브라우저 재시작 후 재시도'
    };
  }
  
  /**
   * 브라우저 충돌 오류 처리 전략
   * @param {Error} error - 발생한 오류
   * @param {object} context - 오류 컨텍스트
   * @param {number} retryCount - 현재 재시도 횟수
   * @returns {Promise<object>} 처리 결과
   * @private
   */
  async _handleBrowserCrashError(error, context, retryCount) {
    if (this.browserController) {
      // 브라우저 재시작 시도
      await this._restartBrowser();
    }
    
    return {
      success: false,
      error: error.message,
      action: 'retry',
      delay: 5000,
      message: '브라우저 충돌, 브라우저 재시작 후 재시도'
    };
  }
  
  /**
   * 기본 오류 처리 전략
   * @param {Error} error - 발생한 오류
   * @param {object} context - 오류 컨텍스트
   * @param {number} retryCount - 현재 재시도 횟수
   * @returns {Promise<object>} 처리 결과
   * @private
   */
  async _handleDefaultError(error, context, retryCount) {
    // 지수 백오프 지연 계산
    const delay = Math.min(2000 * Math.pow(1.5, retryCount), 20000);
    
    return {
      success: false,
      error: error.message,
      action: 'retry',
      delay,
      message: `알 수 없는 오류, ${delay}ms 후 재시도`
    };
  }
  
  /**
   * 차단 우회를 시도합니다.
   * @param {object} context - 오류 컨텍스트
   * @returns {Promise<void>}
   * @private
   */
  async _tryBypassBlocking(context) {
    if (!this.browserController) return;
    
    try {
      // 현재 활성 브라우저 가져오기
      const page = await this.browserController.getCurrentPage();
      
      // 쿠키 동의 대화상자 확인 및 처리
      const hasCookieConsent = await page.evaluate(() => {
        const cookieElements = Array.from(document.querySelectorAll('*')).filter(el => {
          const text = el.textContent.toLowerCase();
          return (text.includes('cookie') || text.includes('cookies')) &&
                 (text.includes('accept') || text.includes('agree') || text.includes('consent'));
        });
        
        if (cookieElements.length > 0) {
          // 동의 버튼 찾기
          const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]')).filter(el => {
            const text = el.textContent.toLowerCase();
            return text.includes('accept') || text.includes('agree') || text.includes('consent') || text.includes('ok');
          });
          
          if (buttons.length > 0) {
            buttons[0].click();
            return true;
          }
        }
        
        return false;
      });
      
      if (hasCookieConsent) {
        this.logger.info('CrawlingErrorHandler: 쿠키 동의 대화상자 처리 완료');
        // 처리 후 잠시 대기
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // 사용자 에이전트 변경
      const newUserAgent = this._getRandomUserAgent();
      await page.setUserAgent(newUserAgent);
      
      // 일부 헤더 추가/변경
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://www.google.com/'
      });
      
      this.logger.info('CrawlingErrorHandler: 차단 우회 설정 완료');
    } catch (error) {
      this.logger.error('CrawlingErrorHandler: 차단 우회 시도 실패', error);
    }
  }
  
  /**
   * 브라우저를 재시작합니다.
   * @returns {Promise<void>}
   * @private
   */
  async _restartBrowser() {
    if (!this.browserController) return;
    
    try {
      // 기존 브라우저 닫기
      await this.browserController.executeAction('closeBrowser');
      
      // 잠시 대기
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 새 브라우저 시작
      await this.browserController.launchBrowser();
      
      this.logger.info('CrawlingErrorHandler: 브라우저 재시작 완료');
    } catch (error) {
      this.logger.error('CrawlingErrorHandler: 브라우저 재시작 실패', error);
    }
  }
  
  /**
   * 무작위 사용자 에이전트를 반환합니다.
   * @returns {string} 무작위 사용자 에이전트
   * @private
   */
  _getRandomUserAgent() {
    const userAgents = [
      // 크롬 (Windows)
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
      
      // 크롬 (macOS)
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
      
      // 파이어폭스 (Windows)
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/114.0',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/113.0',
      
      // 파이어폭스 (macOS)
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/114.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/113.0',
      
      // 사파리 (macOS)
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15',
      
      // 엣지 (Windows)
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36 Edg/114.0.1823.43',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36 Edg/113.0.1774.57'
    ];
    
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }
}

module.exports = CrawlingErrorHandler;