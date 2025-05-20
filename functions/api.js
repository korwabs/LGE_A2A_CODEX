// functions/api.js - API 서버리스 함수
const { initializeAgents, getDialogAgent } = require('../src/agents');
const { initializeRouter } = require('../src/protocols/a2a');
const { initializeContextManager } = require('../src/agents/context-manager');
const config = require('../config');
const admin = require('firebase-admin');
const { VertexAI } = require('@google-cloud/vertexai');

// Firebase 초기화
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    })
  });
}

const db = admin.firestore();

// Vertex AI 초기화
const vertexAI = new VertexAI({
  project: process.env.GOOGLE_CLOUD_PROJECT_ID,
  location: config.services.gemini.region,
});

// A2A 라우터, 컨텍스트 매니저, 에이전트 인스턴스
let router = null;
let contextManager = null;
let agents = null;

/**
 * API 핸들러 초기화
 */
async function initialize() {
  if (router && contextManager && agents) {
    return { router, contextManager, agents };
  }

  // A2A 라우터 초기화
  router = await initializeRouter();

  // 컨텍스트 매니저 초기화
  contextManager = await initializeContextManager('contextManagerAgent', router, db);

  // 에이전트 초기화
  agents = await initializeAgents(router, contextManager, db, vertexAI);

  return { router, contextManager, agents };
}

/**
 * 대화 처리 API 핸들러
 * @param {Object} req 요청 객체
 * @param {Object} res 응답 객체
 */
exports.conversation = async (req, res) => {
  try {
    const { userId, message, timestamp } = req.body;

    if (!userId || !message) {
      return res.status(400).json({
        success: false,
        error: 'UserId and message are required'
      });
    }

    // API 핸들러 초기화
    await initialize();

    // 대화 에이전트 가져오기
    const dialogAgent = await getDialogAgent();

    // 대화 처리
    const response = await dialogAgent.processUserMessage(userId, message, timestamp);

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error processing conversation:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * 장바구니 추가 API 핸들러
 * @param {Object} req 요청 객체
 * @param {Object} res 응답 객체
 */
exports.addToCart = async (req, res) => {
  try {
    const { userId, productId, quantity } = req.body;

    if (!userId || !productId) {
      return res.status(400).json({
        success: false,
        error: 'UserId and productId are required'
      });
    }

    // API 핸들러 초기화
    const { agents } = await initialize();

    // 장바구니 에이전트로 제품 추가
    const response = await agents.cartAgent.addToCart(userId, productId, quantity || 1);

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error adding to cart:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * 제품 검색 API 핸들러
 * @param {Object} req 요청 객체
 * @param {Object} res 응답 객체
 */
exports.searchProducts = async (req, res) => {
  try {
    const { userId, query, filters, page, limit } = req.body;

    if (!userId || !query) {
      return res.status(400).json({
        success: false,
        error: 'UserId and query are required'
      });
    }

    // API 핸들러 초기화
    const { agents } = await initialize();

    // 제품 검색 수행
    const response = await agents.productRecommendationAgent.searchProducts(
      userId,
      query,
      filters,
      page || 1,
      limit || 10
    );

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error searching products:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * 정기 크롤링 API 핸들러
 * @param {Object} req 요청 객체
 * @param {Object} res 응답 객체
 */
exports.scheduledCrawling = async (req, res) => {
  try {
    // API 핸들러 초기화
    const { agents } = await initialize();

    // 크롤링 시작
    const response = await agents.crawlingCoordinatorAgent.startCrawling();

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error in scheduled crawling:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * 건강 체크 API 핸들러
 * @param {Object} req 요청 객체
 * @param {Object} res 응답 객체
 */
exports.healthCheck = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      message: 'LG 브라질 A2A 쇼핑 어시스턴트 API가 정상 작동 중입니다.'
    });
  } catch (error) {
    console.error('Error in health check:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
