/**
 * 액션 레지스트리 - 브라우저 조작 액션을 등록하고 관리합니다.
 * blast_luxia 프로젝트의 Registry 클래스를 참고하여 구현
 */
class ActionRegistry {
  constructor(options = {}) {
    this.actions = new Map();
    this.excludeActions = options.excludeActions || [];
    this.logger = options.logger || console;
  }

  /**
   * 새로운 액션을 등록합니다.
   * @param {string} name - 액션의 이름
   * @param {string} description - 액션에 대한 설명
   * @param {function} handler - 액션을 실행할 함수
   * @param {object} options - 추가 설정
   */
  registerAction(name, description, handler, options = {}) {
    if (this.excludeActions.includes(name)) {
      this.logger.info(`Action "${name}" is excluded from registration`);
      return;
    }

    this.actions.set(name, {
      name,
      description,
      handler,
      options
    });

    this.logger.debug(`Registered action: ${name}`);
    return handler;
  }

  /**
   * 등록된 액션을 실행합니다.
   * @param {string} name - 실행할 액션의 이름
   * @param {object} params - 액션에 전달할 파라미터
   * @param {object} context - 실행 컨텍스트 (브라우저, LLM 등)
   * @returns {Promise<ActionResult>} 실행 결과
   */
  async executeAction(name, params, context = {}) {
    const action = this.actions.get(name);
    
    if (!action) {
      throw new Error(`Action "${name}" not found`);
    }

    this.logger.debug(`Executing action: ${name}`, { params });
    
    try {
      const result = await action.handler(params, context);
      return result;
    } catch (error) {
      this.logger.error(`Error executing action "${name}":`, error);
      return {
        success: false,
        error: error.message || 'Unknown error occurred',
      };
    }
  }

  /**
   * 등록된 모든 액션 목록을 반환합니다.
   * @returns {Array} 등록된 액션 목록
   */
  getRegisteredActions() {
    return Array.from(this.actions.entries()).map(([name, action]) => ({
      name,
      description: action.description,
      options: action.options
    }));
  }

  /**
   * 액션 등록을 위한 데코레이터 함수
   * @param {string} description - 액션에 대한 설명
   * @param {object} options - 추가 설정
   * @returns {function} 데코레이터 함수
   */
  action(description, options = {}) {
    return (handler) => {
      const name = handler.name || 'anonymous_action';
      return this.registerAction(name, description, handler, options);
    };
  }
}

module.exports = ActionRegistry;
