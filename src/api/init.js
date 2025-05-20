/**
 * API 및 에이전트 통합 초기화
 */
const dotenv = require('dotenv');
const A2ARouter = require('../protocols/a2a-router');
const MCPContextManager = require('../protocols/mcp-context-manager');

// 에이전트
const DialogAgent = require('../agents/dialog/dialog-agent');
const CartAgent = require('../agents/cart/cart-agent');
const ProductRecommendationAgent = require('../agents/product-recommendation/product-recommendation-agent');
const PurchaseProcessAgent = require('../agents/purchase-process/purchase-process-agent');
const CrawlingCoordinatorAgent = require('../agents/crawling-coordinator/crawling-coordinator-agent');
const ContextManagerAgent = require('../agents/context-manager/context-manager-agent');

// 서비스
const SessionService = require('../services/session/session-service');
const SearchService = require('../services/search/search-service');
const CrawlingService = require('../services/crawling/crawling-service');
const LLMService = require('../services/llm/llm-service');

// 외부 클라이언트
const { Apify } = require('apify');
const algoliasearch = require('algoliasearch');
const { GoogleAuth } = require('google-auth-library');
const { VertexAI } = require('@google-cloud/vertexai');

// Redis 클라이언트
const redis = require('redis');

// Firebase 초기화
const admin = require('firebase-admin');

// 환경 변수 로드
dotenv.config();

/**
 * 서비스 및 에이전트 초기화
 * @returns {Object} 초기화된 서비스 및 에이전트 객체
 */
async function initialize() {
  try {
    console.log('서비스 및 에이전트 초기화 중...');
    
    // Firebase 초기화
    let firebaseApp;
    
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL
      });
    } else {
      // 개발 환경에서는 기본 설정으로 초기화
      firebaseApp = admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || 'lge-a2a-dev'
      });
    }
    
    // Firestore 및 Firebase 실시간 데이터베이스 초기화
    const firestore = admin.firestore();
    const realtimeDb = admin.database();
    
    // Redis 클라이언트 초기화
    const redisClient = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    
    await redisClient.connect();
    
    // Apify 클라이언트 초기화
    const apifyClient = new Apify.ApifyClient({
      token: process.env.APIFY_API_KEY
    });
    
    // Algolia 클라이언트 초기화
    const algoliaClient = algoliasearch(
      process.env.ALGOLIA_APP_ID,
      process.env.ALGOLIA_API_KEY
    );
    
    // Google Vertex AI 클라이언트 초기화
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    
    const vertexAI = new VertexAI({
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
      auth
    });
    
    // Gemini 모델 초기화
    const generativeModel = vertexAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL_ID || 'gemini-pro'
    });
    
    // A2A 라우터 초기화
    const a2aRouter = new A2ARouter();
    
    // MCP 컨텍스트 관리자 초기화
    const mcpContextManager = new MCPContextManager();
    
    // MCP 프롬프트 매니저 초기화
    const mcpPromptManager = new LLMService.MCPGeminiPromptManager(mcpContextManager, generativeModel);
    await mcpPromptManager.setupPromptTemplates();
    
    // 서비스 초기화
    const services = {
      sessionService: new SessionService(firestore, redisClient),
      searchService: new SearchService(algoliaClient),
      crawlingService: new CrawlingService(apifyClient, redisClient),
      llmService: new LLMService(generativeModel, mcpPromptManager)
    };
    
    // 에이전트 초기화
    const agents = {
      dialogAgent: new DialogAgent(a2aRouter, mcpPromptManager, services.sessionService, services.searchService),
      cartAgent: new CartAgent(a2aRouter, mcpPromptManager, services.sessionService, services.searchService, services.crawlingService),
      productRecommendationAgent: new ProductRecommendationAgent(a2aRouter, services.searchService, mcpPromptManager),
      purchaseProcessAgent: new PurchaseProcessAgent(a2aRouter, mcpPromptManager, services.sessionService, services.crawlingService, services.searchService),
      crawlingCoordinatorAgent: new CrawlingCoordinatorAgent(a2aRouter, apifyClient, algoliaClient, services.crawlingService),
      contextManagerAgent: new ContextManagerAgent(a2aRouter, mcpContextManager, services.sessionService)
    };
    
    console.log('서비스 및 에이전트 초기화 완료');
    
    return {
      services,
      agents,
      a2aRouter,
      mcpContextManager
    };
  } catch (error) {
    console.error('서비스 및 에이전트 초기화 오류:', error);
    throw error;
  }
}

module.exports = initialize;
