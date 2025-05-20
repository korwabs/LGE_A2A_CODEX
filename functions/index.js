// functions/index.js - 서버리스 함수 진입점
const api = require('./api');

// API 함수 내보내기
exports.conversation = api.conversation;
exports.addToCart = api.addToCart;
exports.searchProducts = api.searchProducts;
exports.scheduledCrawling = api.scheduledCrawling;
exports.healthCheck = api.healthCheck;
