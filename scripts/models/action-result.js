/**
 * ActionResult - 브라우저 액션의 결과를 표현하는 클래스
 * blast_luxia 프로젝트의 ActionResult 클래스를 참고하여 구현
 */
class ActionResult {
  /**
   * @param {object} options
   * @param {boolean} options.success - 액션 성공 여부
   * @param {string} options.extractedContent - 추출된 콘텐츠
   * @param {string} options.error - 오류 메시지
   * @param {boolean} options.isDone - 작업 완료 여부
   * @param {boolean} options.includeInMemory - 메모리에 포함 여부
   */
  constructor(options = {}) {
    this.success = options.success !== false; // 기본값은 true
    this.extractedContent = options.extractedContent || '';
    this.error = options.error || null;
    this.isDone = options.isDone || false;
    this.includeInMemory = options.includeInMemory !== false;
    this.timestamp = new Date();
  }

  /**
   * 결과를 JSON 형식으로 변환합니다.
   */
  toJSON() {
    return {
      success: this.success,
      extracted_content: this.extractedContent,
      error: this.error,
      is_done: this.isDone,
      include_in_memory: this.includeInMemory,
      timestamp: this.timestamp.toISOString()
    };
  }

  /**
   * 최종 결과를 문자열로 반환합니다.
   */
  finalResult() {
    if (!this.success && this.error) {
      return `Error: ${this.error}`;
    }
    return this.extractedContent;
  }

  /**
   * 성공 결과 객체를 생성합니다.
   * @param {string} content - 추출된 콘텐츠
   * @param {boolean} includeInMemory - 메모리에 포함 여부
   */
  static success(content, includeInMemory = true) {
    return new ActionResult({
      success: true,
      extractedContent: content,
      includeInMemory
    });
  }

  /**
   * 오류 결과 객체를 생성합니다.
   * @param {string} errorMessage - 오류 메시지
   */
  static error(errorMessage) {
    return new ActionResult({
      success: false,
      error: errorMessage
    });
  }

  /**
   * 최종 결과 객체를 생성합니다.
   * @param {string} content - 추출된 콘텐츠
   * @param {boolean} success - 성공 여부
   */
  static done(content, success = true) {
    return new ActionResult({
      success,
      extractedContent: content,
      isDone: true,
      includeInMemory: true
    });
  }
}

module.exports = ActionResult;
