// src/ui/widget.js - 쇼핑 어시스턴트 UI 위젯
import { config } from '../../config';

/**
 * 쇼핑 어시스턴트 UI 위젯
 * Intercom을 활용한 대화형 인터페이스
 */
export class ShoppingAssistantWidget {
  /**
   * 생성자
   * @param {Object} options 옵션
   * @param {string} options.apiUrl API URL
   * @param {string} options.intercomAppId Intercom 앱 ID
   */
  constructor(options = {}) {
    this.apiUrl = options.apiUrl || config.server.apiPrefix;
    this.intercomAppId = options.intercomAppId || config.services.intercom.appId;
    this.isInitialized = false;
    this.userId = null;
    this.pendingMessages = [];
  }

  /**
   * 위젯 초기화
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    // Intercom 스크립트 로드
    await this.loadIntercomScript();
    
    // Intercom 설정
    window.Intercom('boot', {
      app_id: this.intercomAppId,
      custom_launcher_selector: '#shopping-assistant-btn',
      hide_default_launcher: true
    });
    
    // 메시지 핸들러 설정
    this.setupMessageHandlers();
    
    // 사용자 ID 생성 (또는 기존 ID 가져오기)
    this.userId = this.getUserId();
    
    this.isInitialized = true;
    
    // 대기 중인 메시지 처리
    this.processPendingMessages();
  }

  /**
   * Intercom 스크립트 로드
   * @returns {Promise<void>}
   */
  loadIntercomScript() {
    return new Promise((resolve, reject) => {
      // 이미 로드된 경우
      if (window.Intercom) {
        resolve();
        return;
      }
      
      // Intercom 스크립트 생성
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://widget.intercom.io/widget/' + this.intercomAppId;
      
      script.onload = () => {
        window.Intercom = window.Intercom || function() {
          (window.Intercom.q = window.Intercom.q || []).push(arguments);
        };
        resolve();
      };
      
      script.onerror = (error) => {
        reject(new Error('Failed to load Intercom script: ' + error));
      };
      
      // 페이지에 스크립트 추가
      document.head.appendChild(script);
    });
  }

  /**
   * 메시지 핸들러 설정
   */
  setupMessageHandlers() {
    // Intercom 메시지 이벤트
    window.Intercom('onMessage', (event) => {
      if (event.type === 'user') {
        const message = event.message;
        this.handleUserMessage(message.body);
      }
    });
    
    // 위젯 열기 이벤트
    window.Intercom('onShow', () => {
      this.trackEvent('widget_opened');
    });
    
    // 위젯 닫기 이벤트
    window.Intercom('onHide', () => {
      this.trackEvent('widget_closed');
    });
  }

  /**
   * 사용자 메시지 처리
   * @param {string} message 사용자 메시지
   * @returns {Promise<void>}
   */
  async handleUserMessage(message) {
    try {
      // API 호출
      const response = await fetch(`${this.apiUrl}/conversation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: this.userId,
          message: message,
          timestamp: new Date().toISOString()
        })
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // 응답 메시지 표시
      if (data.response) {
        this.sendMessage(data.response);
      }
      
      // 제품 리스트 표시
      if (data.products && data.products.length > 0) {
        this.showProducts(data.products);
      }
      
      // 특정 액션 처리
      if (data.action) {
        this.handleAction(data.action);
      }
      
      // 이벤트 추적
      this.trackEvent('message_sent', { message_length: message.length });
      
    } catch (error) {
      console.error('Error handling message:', error);
      this.sendMessage('죄송합니다, 지금 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.');
      this.trackEvent('error', { error_type: error.name, error_message: error.message });
    }
  }

  /**
   * 메시지 전송
   * @param {string} message 메시지
   */
  sendMessage(message) {
    if (!this.isInitialized) {
      this.pendingMessages.push(message);
      return;
    }
    
    window.Intercom('showNewMessage', message);
  }

  /**
   * 제품 리스트 표시
   * @param {Array} products 제품 목록
   */
  showProducts(products) {
    products.forEach(product => {
      const html = `
        <div class="intercom-product-card">
          <img src="${product.imageUrl}" alt="${product.name}" />
          <h3>${product.name}</h3>
          <p class="price">R$ ${product.price.toFixed(2)}</p>
          <p class="description">${product.description}</p>
          <button 
            data-product-id="${product.id}" 
            class="add-to-cart-btn"
            onclick="window.shoppingAssistant.addToCart('${product.id}')"
          >
            장바구니에 추가
          </button>
        </div>
      `;
      
      window.Intercom('showNewMessage', html);
    });
  }

  /**
   * 액션 처리
   * @param {Object} action 액션 객체
   */
  handleAction(action) {
    switch (action.type) {
      case 'open_product':
        window.open(action.url, '_blank');
        break;
        
      case 'add_to_cart':
        this.addToCart(action.productId);
        break;
        
      case 'checkout':
        window.open(action.checkoutUrl, '_blank');
        break;
        
      case 'show_category':
        window.open(action.categoryUrl, '_blank');
        break;
        
      default:
        console.warn('Unknown action type:', action.type);
    }
  }

  /**
   * 장바구니에 제품 추가
   * @param {string} productId 제품 ID
   * @returns {Promise<void>}
   */
  async addToCart(productId) {
    try {
      const response = await fetch(`${this.apiUrl}/cart/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: this.userId,
          productId: productId,
          quantity: 1
        })
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        this.sendMessage('제품이 장바구니에 성공적으로 추가되었습니다!');
        this.trackEvent('product_added_to_cart', { product_id: productId });
      } else {
        this.sendMessage(`장바구니에 추가하는 도중 문제가 발생했습니다: ${data.error}`);
      }
      
    } catch (error) {
      console.error('Error adding to cart:', error);
      this.sendMessage('장바구니에 추가하는 도중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.');
      this.trackEvent('error', { error_type: error.name, error_message: error.message });
    }
  }

  /**
   * 위젯 표시
   */
  show() {
    if (!this.isInitialized) {
      this.initialize().then(() => {
        window.Intercom('show');
      });
    } else {
      window.Intercom('show');
    }
  }

  /**
   * 위젯 숨기기
   */
  hide() {
    if (this.isInitialized) {
      window.Intercom('hide');
    }
  }

  /**
   * 사용자 ID 가져오기
   * @returns {string} 사용자 ID
   */
  getUserId() {
    // 기존 ID 확인
    let userId = localStorage.getItem('lg_assistant_user_id');
    
    // 없으면 새로 생성
    if (!userId) {
      userId = this.generateUserId();
      localStorage.setItem('lg_assistant_user_id', userId);
    }
    
    return userId;
  }

  /**
   * 사용자 ID 생성
   * @returns {string} 생성된 사용자 ID
   */
  generateUserId() {
    return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * 이벤트 추적
   * @param {string} eventName 이벤트 이름
   * @param {Object} properties 이벤트 속성
   */
  trackEvent(eventName, properties = {}) {
    if (this.isInitialized) {
      window.Intercom('trackEvent', eventName, properties);
    }
  }

  /**
   * 대기 중인 메시지 처리
   */
  processPendingMessages() {
    if (this.pendingMessages.length > 0) {
      this.pendingMessages.forEach(message => {
        this.sendMessage(message);
      });
      this.pendingMessages = [];
    }
  }

  /**
   * 위젯 정리
   */
  cleanup() {
    if (this.isInitialized) {
      window.Intercom('shutdown');
      this.isInitialized = false;
    }
  }
}

// 브라우저 환경에서 전역 인스턴스로 등록
if (typeof window !== 'undefined') {
  window.shoppingAssistant = new ShoppingAssistantWidget();
}

export default ShoppingAssistantWidget;
