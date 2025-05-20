/**
 * Delay Utility - 지연 관련 함수들을 제공하는 유틸리티
 */

/**
 * 지정된 시간만큼 실행을 지연합니다.
 * @param {number} ms - 지연 시간 (ms)
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 지정된 함수 실행 후 일정 시간 동안 지연합니다.
 * @param {Function} fn - 실행할 함수
 * @param {number} ms - 지연 시간 (ms)
 * @returns {Promise<any>} 함수 실행 결과
 */
async function delayAfter(fn, ms) {
  const result = await fn();
  await delay(ms);
  return result;
}

/**
 * 일정 시간 지연 후 지정된 함수를 실행합니다.
 * @param {Function} fn - 실행할 함수
 * @param {number} ms - 지연 시간 (ms)
 * @returns {Promise<any>} 함수 실행 결과
 */
async function delayBefore(fn, ms) {
  await delay(ms);
  return await fn();
}

/**
 * 실행 속도 제한 유틸리티
 * 일정 기간동안 함수 호출을 제한합니다.
 * @param {Function} fn - 제한할 함수
 * @param {number} limit - 제한 시간 (ms)
 * @returns {Function} 속도 제한이 적용된 함수
 */
function rateLimit(fn, limit) {
  let lastExecuted = 0;
  
  return async function(...args) {
    const now = Date.now();
    const timeSinceLastExecution = now - lastExecuted;
    
    if (timeSinceLastExecution < limit) {
      const timeToWait = limit - timeSinceLastExecution;
      await delay(timeToWait);
    }
    
    lastExecuted = Date.now();
    return await fn(...args);
  };
}

module.exports = {
  delay,
  delayAfter,
  delayBefore,
  rateLimit
};
