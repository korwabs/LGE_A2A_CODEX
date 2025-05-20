// src/agents/index.js - 에이전트 초기화 및 등록
import { DialogAgent } from './dialog-agent';
import { ProductRecommendationAgent } from './product-recommendation-agent';
import { PurchaseProcessAgent } from './purchase-process-agent';
import { CartAgent } from './cart-agent';
import { CrawlingCoordinatorAgent } from './crawling-coordinator-agent';
import { getAlgoliaClient } from '../services/algolia';
import { getApifyClient } from '../services/apify';

// 에이전트 인스턴스 저장
let agentInstances = null;

/**
 * 모든 에이전트 초기화 및 등록
 * @param {Object} router A2A 라우터
 * @param {Object} contextManager MCP 컨텍스트 관리자
 * @param {Object} db Firestore 인스턴스
 * @param {Object} vertexAI Vertex AI 인스턴스
 * @returns {Object} 초기화된 에이전트 객체
 */
export async function initializeAgents(router, contextManager, db, vertexAI) {
  if (agentInstances) {
    return agentInstances;
  }

  const algoliaClient = getAlgoliaClient();
  const apifyClient = getApifyClient();

  // 대화 인터페이스 에이전트 초기화
  const dialogAgent = new DialogAgent(
    'dialogAgent',
    router,
    contextManager,
    vertexAI,
    db
  );

  // 제품 추천 에이전트 초기화
  const productRecommendationAgent = new ProductRecommendationAgent(
    'productRecommendationAgent',
    router,
    algoliaClient
  );

  // 구매 프로세스 지원 에이전트 초기화
  const purchaseProcessAgent = new PurchaseProcessAgent(
    'purchaseProcessAgent',
    router,
    contextManager,
    apifyClient,
    db
  );

  // 장바구니 에이전트 초기화
  const cartAgent = new CartAgent(
    'cartAgent',
    router,
    db
  );

  // 크롤링 조율 에이전트 초기화
  const crawlingCoordinatorAgent = new CrawlingCoordinatorAgent(
    'crawlingCoordinatorAgent',
    router,
    apifyClient,
    algoliaClient,
    db
  );

  // 에이전트 인스턴스 저장
  agentInstances = {
    dialogAgent,
    productRecommendationAgent,
    purchaseProcessAgent,
    cartAgent,
    crawlingCoordinatorAgent
  };

  console.log('All agents initialized and registered');
  return agentInstances;
}

/**
 * 대화 인터페이스 에이전트 반환
 * @returns {Object} 대화 인터페이스 에이전트
 */
export async function getDialogAgent() {
  if (!agentInstances) {
    throw new Error('Agents not initialized. Call initializeAgents first.');
  }
  return agentInstances.dialogAgent;
}

/**
 * 제품 추천 에이전트 반환
 * @returns {Object} 제품 추천 에이전트
 */
export async function getProductRecommendationAgent() {
  if (!agentInstances) {
    throw new Error('Agents not initialized. Call initializeAgents first.');
  }
  return agentInstances.productRecommendationAgent;
}

/**
 * 구매 프로세스 지원 에이전트 반환
 * @returns {Object} 구매 프로세스 지원 에이전트
 */
export async function getPurchaseProcessAgent() {
  if (!agentInstances) {
    throw new Error('Agents not initialized. Call initializeAgents first.');
  }
  return agentInstances.purchaseProcessAgent;
}

/**
 * 장바구니 에이전트 반환
 * @returns {Object} 장바구니 에이전트
 */
export async function getCartAgent() {
  if (!agentInstances) {
    throw new Error('Agents not initialized. Call initializeAgents first.');
  }
  return agentInstances.cartAgent;
}

/**
 * 크롤링 조율 에이전트 반환
 * @returns {Object} 크롤링 조율 에이전트
 */
export async function getCrawlingCoordinatorAgent() {
  if (!agentInstances) {
    throw new Error('Agents not initialized. Call initializeAgents first.');
  }
  return agentInstances.crawlingCoordinatorAgent;
}
