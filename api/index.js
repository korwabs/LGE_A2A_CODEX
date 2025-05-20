/**
 * Vercel 서버리스 함수의 진입점
 */
const app = require('../src/api/server');

/**
 * 모든 요청을 Express 앱으로 라우팅
 * @param {Object} req - 요청 객체
 * @param {Object} res - 응답 객체
 */
module.exports = (req, res) => {
  // Express 앱으로 요청 전달
  app(req, res);
};
