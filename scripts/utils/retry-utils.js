/**
 * Retry Utility - 재시도 메커니즘을 제공하는 유틸리티
 */
const logger = require('./logger');

/**
 * 지정된 함수를 재시도 옵션에 따라 실행합니다.
 * @param {Function} fn - 실행할 함수 (Promise를 반환해야 합니다)
 * @param {Object} options - 재시도 옵션
 * @param {number} options.maxRetries - 최대 재시도 횟수 (기본값: 3)
 * @param {number} options.initialDelay - 초기 지연 시간 (ms) (기본값: 1000)
 * @param {number} options.maxDelay - 최대 지연 시간 (ms) (기본값: 30000)
 * @param {Function} options.shouldRetry - 재시도 여부를 결정하는 함수 (error => boolean)
 * @param {Function} options.onRetry - 재시도 전 호출되는 함수 (error, retryCount => void)
 * @returns {Promise<any>} 함수 실행 결과
 */
async function retry(fn, options = {}) {
  const maxRetries = options.maxRetries || 3;
  const initialDelay = options.initialDelay || 1000;
  const maxDelay = options.maxDelay || 30000;
  const shouldRetry = options.shouldRetry || (() => true);
  const onRetry = options.onRetry || (() => {});
  
  let retryCount = 0;
  let delay = initialDelay;
  
  while (true) {
    try {
      return await fn();
    } catch (error) {
      // 최대 재시도 횟수 초과 또는 재시도하지 않아야 하는 경우
      if (retryCount >= maxRetries || !shouldRetry(error)) {
        logger.error(`Max retries exceeded or retry not advised: ${error.message}`);
        throw error;
      }
      
      retryCount++;
      logger.warn(`Retry attempt ${retryCount}/${maxRetries}: ${error.message}`);
      
      // 재시도 콜백 호출
      await onRetry(error, retryCount);
      
      // 지수 백오프를 사용한 지연
      delay = Math.min(delay * 2, maxDelay);
      
      // 임의성 추가 (지터)
      const jitter = delay * 0.2 * Math.random();
      const actualDelay = delay + jitter;
      
      logger.debug(`Waiting ${actualDelay}ms before next retry...`);
      await sleep(actualDelay);
    }
  }
}

/**
 * 지정된 시간 동안 지연합니다.
 * @param {number} ms - 지연 시간 (ms)
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  retry,
  sleep
};
