// public/js/intercom-integration.js - Intercom 연동 스크립트
(function() {
  // 설정 변수
  const API_BASE_URL = '/api';
  let userId = null;
  let sessionId = null;
  let intercomInitialized = false;
  
  // 고유 사용자 ID 생성/가져오기
  function getUserId() {
    let id = localStorage.getItem('lge_shopping_assistant_user_id');
    
    if (!id) {
      id = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem('lge_shopping_assistant_user_id', id);
    }
    
    return id;
  }
  
  // 초기화 함수
  function initialize() {
    userId = getUserId();
    sessionId = 'session_' + Date.now();
    
    // Intercom 초기화
    initializeIntercom();
    
    // 이벤트 리스너 설정
    setupEventListeners();
    
    console.log('LG 쇼핑 어시스턴트가 초기화되었습니다.');
  }
  
  // Intercom 초기화
  function initializeIntercom() {
    if (intercomInitialized) return;
    
    // Intercom App ID 가져오기 (HTML에서 data-app-id 속성으로 설정됨)
    const appIdElement = document.getElementById('intercom-script');
    const appId = appIdElement ? appIdElement.getAttribute('data-app-id') : 'urzkg4lt';
    
    window.intercomSettings = {
      app_id: appId,
      name: 'LG 쇼핑 어시스턴트 사용자',
      user_id: userId,
      custom_data: {
        session_id: sessionId
      },
      hide_default_launcher: true // 기본 런처 숨기기
    };
    
    // Intercom 스크립트 로드
    (function() {
      var w = window;
      var ic = w.Intercom;
      if (typeof ic === "function") {
        ic('reattach_activator');
        ic('update', w.intercomSettings);
      } else {
        var d = document;
        var i = function() {
          i.c(arguments);
        };
        i.q = [];
        i.c = function(args) {
          i.q.push(args);
        };
        w.Intercom = i;
        var l = function() {
          var s = d.createElement('script');
          s.type = 'text/javascript';
          s.async = true;
          s.src = 'https://widget.intercom.io/widget/' + w.intercomSettings.app_id;
          var x = d.getElementsByTagName('script')[0];
          x.parentNode.insertBefore(s, x);
        };
        if (w.attachEvent) {
          w.attachEvent('onload', l);
        } else {
          w.addEventListener('load', l, false);
        }
      }
    })();
    
    intercomInitialized = true;
    
    // Intercom이 로드되면 필요한 설정 적용
    window.Intercom('onHide', function() {
      console.log('Intercom 메신저가 닫혔습니다.');
    });
    
    window.Intercom('onShow', function() {
      console.log('Intercom 메신저가 열렸습니다.');
    });
    
    // 사용자 정의 런처 대신 Intercom 열기
    customizeLauncher();
  }
  
  // 사용자 정의 런처 설정
  function customizeLauncher() {
    // 이미 존재하는 런처 확인
    let launcher = document.getElementById('lg-shopping-assistant-launcher');
    
    if (!launcher) {
      // 새 런처 생성
      launcher = document.createElement('div');
      launcher.id = 'lg-shopping-assistant-launcher';
      launcher.className = 'lg-shopping-assistant-launcher';
      launcher.innerHTML = `
        <div class="lg-launcher-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 5C13.66 5 15 6.34 15 8C15 9.66 13.66 11 12 11C10.34 11 9 9.66 9 8C9 6.34 10.34 5 12 5ZM12 19.2C9.5 19.2 7.29 17.92 6 15.98C6.03 13.99 10 12.9 12 12.9C13.99 12.9 17.97 13.99 18 15.98C16.71 17.92 14.5 19.2 12 19.2Z" fill="white"/>
          </svg>
        </div>
        <div class="lg-launcher-label">쇼핑 도우미</div>
      `;
      
      document.body.appendChild(launcher);
      
      // 클릭 이벤트 리스너 추가
      launcher.addEventListener('click', function() {
        window.Intercom('show');
      });
    }
  }
  
  // 이벤트 리스너 설정
  function setupEventListeners() {
    // LG 제품 페이지 감지 및 처리
    if (window.location.href.includes('/produto/') || window.location.href.includes('/products/')) {
      handleProductPage();
    }
    
    // 장바구니 페이지 감지 및 처리
    if (window.location.href.includes('/carrinho-de-compras') || window.location.href.includes('/cart')) {
      handleCartPage();
    }
    
    // 페이지 변경 감지 (SPA 지원)
    let lastUrl = window.location.href;
    new MutationObserver(() => {
      const url = window.location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        onUrlChange(url);
      }
    }).observe(document, { subtree: true, childList: true });
  }
  
  // URL 변경 처리
  function onUrlChange(url) {
    if (url.includes('/produto/') || url.includes('/products/')) {
      handleProductPage();
    } else if (url.includes('/carrinho-de-compras') || url.includes('/cart')) {
      handleCartPage();
    }
  }
  
  // 제품 페이지 처리
  function handleProductPage() {
    try {
      // 제품 정보 추출
      const productInfo = extractProductInfo();
      
      if (productInfo) {
        // 제품 조회 이벤트 트래킹
        trackProductView(productInfo);
        
        // Intercom 사용자 데이터 업데이트
        window.Intercom('update', {
          last_viewed_product: productInfo.name,
          last_viewed_product_id: productInfo.id,
          last_viewed_product_category: productInfo.category
        });
      }
    } catch (error) {
      console.error('제품 페이지 처리 중 오류:', error);
    }
  }
  
  // 제품 정보 추출
  function extractProductInfo() {
    // 기본 선택자들 (실제 LG 브라질 사이트에 맞게 조정 필요)
    const selectors = {
      id: '[data-product-id]',
      name: '.product-title, h1.title',
      price: '.product-price, .price-current',
      category: '.breadcrumb-item:nth-child(2), .category-name'
    };
    
    const productInfo = {
      id: null,
      name: null,
      price: null,
      category: null,
      url: window.location.href
    };
    
    // ID 추출
    const idElement = document.querySelector(selectors.id);
    if (idElement) {
      productInfo.id = idElement.getAttribute('data-product-id');
    } else {
      // URL에서 ID 추출 시도
      const urlParts = window.location.pathname.split('/');
      const possibleId = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
      
      if (possibleId && !possibleId.includes('.') && possibleId.length > 3) {
        productInfo.id = possibleId;
      }
    }
    
    // 이름 추출
    const nameElement = document.querySelector(selectors.name);
    if (nameElement) {
      productInfo.name = nameElement.textContent.trim();
    }
    
    // 가격 추출
    const priceElement = document.querySelector(selectors.price);
    if (priceElement) {
      const priceText = priceElement.textContent.trim();
      const priceMatch = priceText.match(/[\d,.]+/);
      
      if (priceMatch) {
        // 통화 기호 및 쉼표/점 처리
        productInfo.price = parseFloat(
          priceMatch[0].replace(/\./g, '').replace(',', '.')
        );
      }
    }
    
    // 카테고리 추출
    const categoryElement = document.querySelector(selectors.category);
    if (categoryElement) {
      productInfo.category = categoryElement.textContent.trim();
    }
    
    return productInfo.id && productInfo.name ? productInfo : null;
  }
  
  // 제품 조회 트래킹
  function trackProductView(productInfo) {
    fetch(`${API_BASE_URL}/track-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId,
        sessionId,
        eventType: 'viewProduct',
        eventData: {
          productId: productInfo.id,
          productName: productInfo.name,
          productPrice: productInfo.price,
          productCategory: productInfo.category,
          timestamp: new Date().toISOString(),
          url: window.location.href
        }
      })
    }).catch(error => {
      console.error('제품 조회 트래킹 오류:', error);
    });
  }
  
  // 장바구니 페이지 처리
  function handleCartPage() {
    try {
      // 장바구니 정보 추출
      const cartInfo = extractCartInfo();
      
      if (cartInfo && cartInfo.items.length > 0) {
        // 장바구니 이벤트 트래킹
        trackCartView(cartInfo);
        
        // Intercom 사용자 데이터 업데이트
        window.Intercom('update', {
          cart_item_count: cartInfo.items.length,
          cart_value: cartInfo.total
        });
      }
    } catch (error) {
      console.error('장바구니 페이지 처리 중 오류:', error);
    }
  }
  
  // 장바구니 정보 추출
  function extractCartInfo() {
    // 기본 선택자들 (실제 LG 브라질 사이트에 맞게 조정 필요)
    const selectors = {
      items: '.cart-item, .item-row',
      itemName: '.item-name, .product-name',
      itemPrice: '.item-price, .price',
      itemQuantity: '.item-quantity input, .quantity input',
      total: '.cart-total, .total-price'
    };
    
    const cartInfo = {
      items: [],
      total: 0
    };
    
    // 장바구니 아이템 추출
    const itemElements = document.querySelectorAll(selectors.items);
    
    itemElements.forEach(itemElement => {
      const nameElement = itemElement.querySelector(selectors.itemName);
      const priceElement = itemElement.querySelector(selectors.itemPrice);
      const quantityElement = itemElement.querySelector(selectors.itemQuantity);
      
      if (nameElement && priceElement) {
        const name = nameElement.textContent.trim();
        const priceText = priceElement.textContent.trim();
        const priceMatch = priceText.match(/[\d,.]+/);
        let price = 0;
        
        if (priceMatch) {
          // 통화 기호 및 쉼표/점 처리
          price = parseFloat(
            priceMatch[0].replace(/\./g, '').replace(',', '.')
          );
        }
        
        let quantity = 1;
        if (quantityElement && quantityElement.value) {
          quantity = parseInt(quantityElement.value, 10) || 1;
        }
        
        cartInfo.items.push({
          name,
          price,
          quantity
        });
      }
    });
    
    // 총액 추출
    const totalElement = document.querySelector(selectors.total);
    if (totalElement) {
      const totalText = totalElement.textContent.trim();
      const totalMatch = totalText.match(/[\d,.]+/);
      
      if (totalMatch) {
        // 통화 기호 및 쉼표/점 처리
        cartInfo.total = parseFloat(
          totalMatch[0].replace(/\./g, '').replace(',', '.')
        );
      } else {
        // 아이템 가격에서 총액 계산
        cartInfo.total = cartInfo.items.reduce((sum, item) => {
          return sum + item.price * item.quantity;
        }, 0);
      }
    }
    
    return cartInfo;
  }
  
  // 장바구니 조회 트래킹
  function trackCartView(cartInfo) {
    fetch(`${API_BASE_URL}/track-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId,
        sessionId,
        eventType: 'viewCart',
        eventData: {
          itemCount: cartInfo.items.length,
          cartTotal: cartInfo.total,
          items: cartInfo.items,
          timestamp: new Date().toISOString(),
          url: window.location.href
        }
      })
    }).catch(error => {
      console.error('장바구니 조회 트래킹 오류:', error);
    });
  }
  
  // 페이지 로드 시 초기화
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
