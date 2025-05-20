/**
 * Firebase 세션 관리 서비스
 * 사용자 세션, 대화 컨텍스트, 장바구니 상태 등을 관리합니다.
 */
const { initializeApp } = require('firebase/app');
const { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  Timestamp,
  arrayUnion,
  arrayRemove,
  increment 
} = require('firebase/firestore');
const { v4: uuidv4 } = require('uuid');

class FirebaseSessionService {
  /**
   * 생성자
   * @param {Object} config - Firebase 설정 객체
   */
  constructor(config = {}) {
    // Firebase 설정
    this.config = {
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN,
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.FIREBASE_APP_ID,
      ...config
    };
    
    // Firebase 앱 초기화
    this.app = initializeApp(this.config);
    this.db = getFirestore(this.app);
    
    this.logger = console; // 나중에 더 좋은 로깅 시스템으로 교체 가능
  }
  
  /**
   * 새 세션 생성
   * @param {Object} userData - 사용자 데이터 (옵션)
   * @returns {Promise<string>} 세션 ID
   */
  async createSession(userData = {}) {
    try {
      const sessionId = uuidv4();
      this.logger.info(`새 세션 생성: ${sessionId}`);
      
      // 세션 데이터 생성
      const sessionData = {
        id: sessionId,
        createdAt: Timestamp.now(),
        lastActive: Timestamp.now(),
        userData,
        conversationHistory: [],
        cart: {
          items: [],
          totalItems: 0,
          totalPrice: 0
        },
        preferences: {},
        checkoutProcess: {
          currentStep: null,
          collectedInfo: {}
        }
      };
      
      // Firestore에 세션 저장
      await setDoc(doc(this.db, 'sessions', sessionId), sessionData);
      
      return sessionId;
    } catch (error) {
      this.logger.error('세션 생성 오류:', error);
      throw error;
    }
  }
  
  /**
   * 세션 조회
   * @param {string} sessionId - 세션 ID
   * @returns {Promise<Object>} 세션 데이터
   */
  async getSession(sessionId) {
    try {
      this.logger.info(`세션 조회: ${sessionId}`);
      
      const sessionDoc = await getDoc(doc(this.db, 'sessions', sessionId));
      
      if (!sessionDoc.exists()) {
        this.logger.warn(`세션을 찾을 수 없음: ${sessionId}`);
        return null;
      }
      
      // 세션 활성 시간 업데이트
      await updateDoc(doc(this.db, 'sessions', sessionId), {
        lastActive: Timestamp.now()
      });
      
      return sessionDoc.data();
    } catch (error) {
      this.logger.error(`세션 조회 오류: ${sessionId}`, error);
      throw error;
    }
  }
  
  /**
   * 세션 업데이트
   * @param {string} sessionId - 세션 ID
   * @param {Object} updateData - 업데이트할 데이터
   * @returns {Promise<boolean>} 성공 여부
   */
  async updateSession(sessionId, updateData) {
    try {
      this.logger.info(`세션 업데이트: ${sessionId}`);
      
      // 마지막 활성 시간 업데이트
      const data = {
        ...updateData,
        lastActive: Timestamp.now()
      };
      
      await updateDoc(doc(this.db, 'sessions', sessionId), data);
      
      return true;
    } catch (error) {
      this.logger.error(`세션 업데이트 오류: ${sessionId}`, error);
      throw error;
    }
  }
  
  /**
   * 대화 기록 추가
   * @param {string} sessionId - 세션 ID
   * @param {string} role - 메시지 역할 ('user' 또는 'assistant')
   * @param {string} content - 메시지 내용
   * @returns {Promise<boolean>} 성공 여부
   */
  async addConversationMessage(sessionId, role, content) {
    try {
      this.logger.info(`대화 기록 추가: ${sessionId} (${role})`);
      
      const message = {
        role,
        content,
        timestamp: Timestamp.now()
      };
      
      await updateDoc(doc(this.db, 'sessions', sessionId), {
        conversationHistory: arrayUnion(message),
        lastActive: Timestamp.now()
      });
      
      return true;
    } catch (error) {
      this.logger.error(`대화 기록 추가 오류: ${sessionId}`, error);
      throw error;
    }
  }
  
  /**
   * 대화 기록 조회
   * @param {string} sessionId - 세션 ID
   * @param {number} limit - 최대 메시지 수 (최신순)
   * @returns {Promise<Array>} 대화 기록 배열
   */
  async getConversationHistory(sessionId, limit = 10) {
    try {
      this.logger.info(`대화 기록 조회: ${sessionId}`);
      
      const sessionDoc = await getDoc(doc(this.db, 'sessions', sessionId));
      
      if (!sessionDoc.exists()) {
        return [];
      }
      
      const data = sessionDoc.data();
      const history = data.conversationHistory || [];
      
      // 최신 메시지부터 limit 개수만큼 반환
      return history.slice(-limit).reverse();
    } catch (error) {
      this.logger.error(`대화 기록 조회 오류: ${sessionId}`, error);
      throw error;
    }
  }
  
  /**
   * 장바구니에 상품 추가
   * @param {string} sessionId - 세션 ID
   * @param {Object} product - 추가할 상품 정보
   * @param {number} quantity - 수량 (기본값: 1)
   * @returns {Promise<Object>} 업데이트된 장바구니
   */
  async addToCart(sessionId, product, quantity = 1) {
    try {
      this.logger.info(`장바구니 상품 추가: ${sessionId}, 상품 ID: ${product.id}, 수량: ${quantity}`);
      
      const sessionDoc = await getDoc(doc(this.db, 'sessions', sessionId));
      
      if (!sessionDoc.exists()) {
        throw new Error(`세션을 찾을 수 없음: ${sessionId}`);
      }
      
      const sessionData = sessionDoc.data();
      const cart = sessionData.cart || { items: [], totalItems: 0, totalPrice: 0 };
      
      // 장바구니에 이미 있는 상품인지 확인
      const existingItemIndex = cart.items.findIndex(item => item.product.id === product.id);
      
      if (existingItemIndex >= 0) {
        // 기존 상품 수량 증가
        cart.items[existingItemIndex].quantity += quantity;
      } else {
        // 새 상품 추가
        cart.items.push({
          product,
          quantity,
          addedAt: Timestamp.now()
        });
      }
      
      // 장바구니 합계 업데이트
      cart.totalItems = cart.items.reduce((total, item) => total + item.quantity, 0);
      cart.totalPrice = cart.items.reduce((total, item) => {
        const price = parseFloat(item.product.price) || 0;
        return total + (price * item.quantity);
      }, 0);
      
      // 세션 업데이트
      await updateDoc(doc(this.db, 'sessions', sessionId), {
        cart,
        lastActive: Timestamp.now()
      });
      
      return cart;
    } catch (error) {
      this.logger.error(`장바구니 상품 추가 오류: ${sessionId}`, error);
      throw error;
    }
  }
  
  /**
   * 장바구니에서 상품 제거
   * @param {string} sessionId - 세션 ID
   * @param {string} productId - 제거할 상품 ID
   * @returns {Promise<Object>} 업데이트된 장바구니
   */
  async removeFromCart(sessionId, productId) {
    try {
      this.logger.info(`장바구니 상품 제거: ${sessionId}, 상품 ID: ${productId}`);
      
      const sessionDoc = await getDoc(doc(this.db, 'sessions', sessionId));
      
      if (!sessionDoc.exists()) {
        throw new Error(`세션을 찾을 수 없음: ${sessionId}`);
      }
      
      const sessionData = sessionDoc.data();
      const cart = sessionData.cart || { items: [], totalItems: 0, totalPrice: 0 };
      
      // 상품 제거
      cart.items = cart.items.filter(item => item.product.id !== productId);
      
      // 장바구니 합계 업데이트
      cart.totalItems = cart.items.reduce((total, item) => total + item.quantity, 0);
      cart.totalPrice = cart.items.reduce((total, item) => {
        const price = parseFloat(item.product.price) || 0;
        return total + (price * item.quantity);
      }, 0);
      
      // 세션 업데이트
      await updateDoc(doc(this.db, 'sessions', sessionId), {
        cart,
        lastActive: Timestamp.now()
      });
      
      return cart;
    } catch (error) {
      this.logger.error(`장바구니 상품 제거 오류: ${sessionId}`, error);
      throw error;
    }
  }
  
  /**
   * 장바구니 상품 수량 업데이트
   * @param {string} sessionId - 세션 ID
   * @param {string} productId - 상품 ID
   * @param {number} quantity - 새 수량
   * @returns {Promise<Object>} 업데이트된 장바구니
   */
  async updateCartItemQuantity(sessionId, productId, quantity) {
    try {
      this.logger.info(`장바구니 상품 수량 업데이트: ${sessionId}, 상품 ID: ${productId}, 수량: ${quantity}`);
      
      if (quantity <= 0) {
        return this.removeFromCart(sessionId, productId);
      }
      
      const sessionDoc = await getDoc(doc(this.db, 'sessions', sessionId));
      
      if (!sessionDoc.exists()) {
        throw new Error(`세션을 찾을 수 없음: ${sessionId}`);
      }
      
      const sessionData = sessionDoc.data();
      const cart = sessionData.cart || { items: [], totalItems: 0, totalPrice: 0 };
      
      // 상품 검색
      const itemIndex = cart.items.findIndex(item => item.product.id === productId);
      
      if (itemIndex === -1) {
        throw new Error(`상품을 찾을 수 없음: ${productId}`);
      }
      
      // 수량 업데이트
      cart.items[itemIndex].quantity = quantity;
      
      // 장바구니 합계 업데이트
      cart.totalItems = cart.items.reduce((total, item) => total + item.quantity, 0);
      cart.totalPrice = cart.items.reduce((total, item) => {
        const price = parseFloat(item.product.price) || 0;
        return total + (price * item.quantity);
      }, 0);
      
      // 세션 업데이트
      await updateDoc(doc(this.db, 'sessions', sessionId), {
        cart,
        lastActive: Timestamp.now()
      });
      
      return cart;
    } catch (error) {
      this.logger.error(`장바구니 상품 수량 업데이트 오류: ${sessionId}`, error);
      throw error;
    }
  }
  
  /**
   * 장바구니 조회
   * @param {string} sessionId - 세션 ID
   * @returns {Promise<Object>} 장바구니 정보
   */
  async getCart(sessionId) {
    try {
      this.logger.info(`장바구니 조회: ${sessionId}`);
      
      const sessionDoc = await getDoc(doc(this.db, 'sessions', sessionId));
      
      if (!sessionDoc.exists()) {
        return { items: [], totalItems: 0, totalPrice: 0 };
      }
      
      const sessionData = sessionDoc.data();
      return sessionData.cart || { items: [], totalItems: 0, totalPrice: 0 };
    } catch (error) {
      this.logger.error(`장바구니 조회 오류: ${sessionId}`, error);
      throw error;
    }
  }
  
  /**
   * 사용자 선호도 저장
   * @param {string} sessionId - 세션 ID
   * @param {Object} preferences - 선호도 정보
   * @returns {Promise<boolean>} 성공 여부
   */
  async savePreferences(sessionId, preferences) {
    try {
      this.logger.info(`사용자 선호도 저장: ${sessionId}`);
      
      await updateDoc(doc(this.db, 'sessions', sessionId), {
        preferences,
        lastActive: Timestamp.now()
      });
      
      return true;
    } catch (error) {
      this.logger.error(`사용자 선호도 저장 오류: ${sessionId}`, error);
      throw error;
    }
  }
  
  /**
   * 구매 프로세스 정보 업데이트
   * @param {string} sessionId - 세션 ID
   * @param {Object} checkoutData - 구매 프로세스 정보
   * @returns {Promise<boolean>} 성공 여부
   */
  async updateCheckoutProcess(sessionId, checkoutData) {
    try {
      this.logger.info(`구매 프로세스 정보 업데이트: ${sessionId}, 단계: ${checkoutData.currentStep}`);
      
      await updateDoc(doc(this.db, 'sessions', sessionId), {
        checkoutProcess: checkoutData,
        lastActive: Timestamp.now()
      });
      
      return true;
    } catch (error) {
      this.logger.error(`구매 프로세스 정보 업데이트 오류: ${sessionId}`, error);
      throw error;
    }
  }
  
  /**
   * 비활성 세션 정리 (오래된 세션 삭제)
   * @param {number} maxAgeHours - 최대 세션 나이 (시간)
   * @returns {Promise<number>} 삭제된 세션 수
   */
  async cleanupInactiveSessions(maxAgeHours = 24) {
    // 실제 구현 시 Firestore 쿼리와 일괄 삭제 작업 추가
    return 0;
  }
}

module.exports = FirebaseSessionService;
