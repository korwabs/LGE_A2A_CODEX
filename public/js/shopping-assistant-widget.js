// public/js/shopping-assistant-widget.js - 쇼핑 어시스턴트 위젯
(function() {
  // 설정 및 상태 변수
  const API_BASE_URL = '/api';
  let userId = null;
  let sessionId = null;
  let accessToken = null;
  let productCache = new Map();
  let currentView = 'chat'; // 'chat', 'products', 'cart'
  
  // 위젯 초기화
  function initialize() {
    // 사용자 ID 가져오기
    userId = getUserId();
    sessionId = 'session_' + Date.now();
    
    // 인증 토큰 생성 (실제 구현에서는 서버에서 발급)
    accessToken = generateAccessToken();
    
    // 위젯 DOM 요소 생성
    createWidgetElements();
    
    // 이벤트 리스너 설정
    setupEventListeners();
    
    // Intercom 커스텀 이벤트 리스너
    setupIntercomListeners();
    
    console.log('쇼핑 어시스턴트 위젯이 초기화되었습니다.');
  }
  
  // 사용자 식별자 생성/가져오기
  function getUserId() {
    let id = localStorage.getItem('lge_shopping_assistant_user_id');
    
    if (!id) {
      id = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem('lge_shopping_assistant_user_id', id);
    }
    
    return id;
  }
  
  // 임시 액세스 토큰 생성
  function generateAccessToken() {
    return 'temp_token_' + Math.random().toString(36).substring(2, 15);
  }
  
  // 위젯 DOM 요소 생성
  function createWidgetElements() {
    // 이미 생성된 위젯이 있는지 확인
    if (document.getElementById('lg-shopping-assistant-container')) {
      return;
    }
    
    // 쇼핑 어시스턴트 스타일 로드
    loadStyles();
    
    // 위젯 컨테이너 생성
    const widgetContainer = document.createElement('div');
    widgetContainer.id = 'lg-shopping-assistant-container';
    widgetContainer.className = 'lg-shopping-assistant-container';
    widgetContainer.style.display = 'none'; // 초기에는 숨김
    
    // 위젯 내용은 Intercom을 통해 표시
    
    // 런처 버튼 생성
    const launcherButton = document.createElement('div');
    launcherButton.id = 'lg-shopping-assistant-launcher';
    launcherButton.className = 'lg-shopping-assistant-launcher';
    launcherButton.innerHTML = `
      <div class="lg-launcher-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 5C13.66 5 15 6.34 15 8C15 9.66 13.66 11 12 11C10.34 11 9 9.66 9 8C9 6.34 10.34 5 12 5ZM12 19.2C9.5 19.2 7.29 17.92 6 15.98C6.03 13.99 10 12.9 12 12.9C13.99 12.9 17.97 13.99 18 15.98C16.71 17.92 14.5 19.2 12 19.2Z" fill="white"/>
        </svg>
      </div>
      <div class="lg-launcher-label">쇼핑 도우미</div>
    `;
    
    // 바디에 요소 추가
    document.body.appendChild(widgetContainer);
    document.body.appendChild(launcherButton);
  }
  
  // 스타일 로드
  function loadStyles() {
    // 이미 로드된 스타일 확인
    if (document.getElementById('lg-shopping-assistant-styles')) {
      return;
    }
    
    // 스타일 링크 태그 생성
    const styleLink = document.createElement('link');
    styleLink.id = 'lg-shopping-assistant-styles';
    styleLink.rel = 'stylesheet';
    styleLink.href = '/css/shopping-assistant.css';
    
    // 헤드에 추가
    document.head.appendChild(styleLink);
  }
  
  // 이벤트 리스너 설정
  function setupEventListeners() {
    // 런처 버튼 클릭 이벤트
    const launcherButton = document.getElementById('lg-shopping-assistant-launcher');
    if (launcherButton) {
      launcherButton.addEventListener('click', function() {
        // Intercom 메신저 열기
        window.Intercom('show');
      });
    }
    
    // 현재 페이지 분석
    analyzeCurrentPage();
    
    // 페이지 변경 감지 (SPA 지원)
    let lastUrl = window.location.href;
    new MutationObserver(() => {
      const url = window.location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        analyzeCurrentPage();
      }
    }).observe(document, { subtree: true, childList: true });
  }
  
  // Intercom 이벤트 리스너 설정
  function setupIntercomListeners() {
    // Intercom이 로드된 후에 실행
    const checkIntercom = setInterval(() => {
      if (window.Intercom) {
        clearInterval(checkIntercom);
        
        // Intercom 열림 이벤트
        window.Intercom('onShow', function() {
          console.log('Intercom 메신저가 열렸습니다.');
          // 현재 페이지 컨텍스트 제공
          sendPageContextToIntercom();
        });
        
        // 메시지 전송 이벤트 확장 (제품 추천 기능 등)
        extendIntercomFunctionality();
      }
    }, 500);
  }
  
  // Intercom 기능 확장
  function extendIntercomFunctionality() {
    // 원래 Intercom 함수 백업
    const originalIntercom = window.Intercom;
    
    // 확장된 Intercom 함수로 대체
    window.Intercom = function() {
      const args = Array.from(arguments);
      const command = args[0];
      
      // 사용자 메시지 전송 처리
      if (command === 'boot' || command === 'update') {
        // 쇼핑 어시스턴트 관련 정보 추가
        const bootSettings = args[1] || {};
        bootSettings.lg_shopping_assistant = {
          userId,
          sessionId,
          lastActivity: new Date().toISOString()
        };
        args[1] = bootSettings;
      }
      
      // 원래 Intercom 함수 호출
      return originalIntercom.apply(this, args);
    };
    
    // 원래 함수의 속성 복사
    for (const prop in originalIntercom) {
      if (originalIntercom.hasOwnProperty(prop)) {
        window.Intercom[prop] = originalIntercom[prop];
      }
    }
  }
  
  // 현재 페이지 분석 및 처리
  function analyzeCurrentPage() {
    const url = window.location.href;
    
    // 제품 페이지 확인
    if (url.includes('/produto/') || url.includes('/products/')) {
      handleProductPage();
    }
    // 카테고리 페이지 확인
    else if (url.includes('/categoria/') || url.includes('/category/')) {
      handleCategoryPage();
    }
    // 장바구니 페이지 확인
    else if (url.includes('/carrinho-de-compras') || url.includes('/cart')) {
      handleCartPage();
    }
    // 검색 결과 페이지 확인
    else if (url.includes('/busca') || url.includes('/search')) {
      handleSearchPage();
    }
  }
  
  // 현재 페이지 컨텍스트를 Intercom에 전송
  function sendPageContextToIntercom() {
    const url = window.location.href;
    let pageContext = {
      url,
      type: 'other',
      timestamp: new Date().toISOString()
    };
    
    // 페이지 유형에 따른 컨텍스트 추가
    if (url.includes('/produto/') || url.includes('/products/')) {
      const productInfo = extractProductInfo();
      if (productInfo) {
        pageContext = {
          ...pageContext,
          type: 'product',
          productId: productInfo.id,
          productName: productInfo.name,
          productPrice: productInfo.price,
          productCategory: productInfo.category
        };
      }
    }
    else if (url.includes('/categoria/') || url.includes('/category/')) {
      // 카테고리 정보 추출
      const categoryName = extractCategoryName();
      if (categoryName) {
        pageContext = {
          ...pageContext,
          type: 'category',
          categoryName
        };
      }
    }
    else if (url.includes('/carrinho-de-compras') || url.includes('/cart')) {
      // 장바구니 정보 추출
      const cartInfo = extractCartInfo();
      if (cartInfo) {
        pageContext = {
          ...pageContext,
          type: 'cart',
          itemCount: cartInfo.items.length,
          cartTotal: cartInfo.total
        };
      }
    }
    else if (url.includes('/busca') || url.includes('/search')) {
      // 검색 쿼리 추출
      const searchQuery = extractSearchQuery();
      if (searchQuery) {
        pageContext = {
          ...pageContext,
          type: 'search',
          searchQuery
        };
      }
    }
    
    // 페이지 컨텍스트 전송
    fetch(`${API_BASE_URL}/page-context`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        userId,
        sessionId,
        pageContext
      })
    }).catch(error => {
      console.error('페이지 컨텍스트 전송 오류:', error);
    });
  }
  
  // 제품 페이지 처리
  function handleProductPage() {
    try {
      // 제품 정보 추출
      const productInfo = extractProductInfo();
      
      if (productInfo) {
        // 제품 조회 이벤트 트래킹
        trackProductView(productInfo);
        
        // 제품 정보 캐싱
        productCache.set(productInfo.id, productInfo);
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
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
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
  
  // 카테고리 페이지 처리
  function handleCategoryPage() {
    try {
      // 카테고리 정보 추출
      const categoryName = extractCategoryName();
      
      if (categoryName) {
        // 카테고리 조회 이벤트 트래킹
        trackCategoryView(categoryName);
      }
    } catch (error) {
      console.error('카테고리 페이지 처리 중 오류:', error);
    }
  }
  
  // 카테고리 이름 추출
  function extractCategoryName() {
    // 기본 선택자들 (실제 LG 브라질 사이트에 맞게 조정 필요)
    const selectors = {
      category: '.category-title, h1.title, .breadcrumb-item.active'
    };
    
    // 카테고리 이름 추출
    const categoryElement = document.querySelector(selectors.category);
    if (categoryElement) {
      return categoryElement.textContent.trim();
    }
    
    // URL에서 카테고리 추출 시도
    const urlParts = window.location.pathname.split('/');
    const categoryIndex = urlParts.indexOf('categoria') || urlParts.indexOf('category');
    
    if (categoryIndex !== -1 && categoryIndex + 1 < urlParts.length) {
      return decodeURIComponent(urlParts[categoryIndex + 1]).replace(/-/g, ' ');
    }
    
    return null;
  }
  
  // 카테고리 조회 트래킹
  function trackCategoryView(categoryName) {
    fetch(`${API_BASE_URL}/track-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        userId,
        sessionId,
        eventType: 'viewCategory',
        eventData: {
          categoryName,
          timestamp: new Date().toISOString(),
          url: window.location.href
        }
      })
    }).catch(error => {
      console.error('카테고리 조회 트래킹 오류:', error);
    });
  }
  
  // 장바구니 페이지 처리
  function handleCartPage() {
    try {
      // 장바구니 정보 추출
      const cartInfo = extractCartInfo();
      
      if (cartInfo) {
        // 장바구니 조회 이벤트 트래킹
        trackCartView(cartInfo);
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
    
    return cartInfo.items.length > 0 ? cartInfo : null;
  }
  
  // 장바구니 조회 트래킹
  function trackCartView(cartInfo) {
    fetch(`${API_BASE_URL}/track-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
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
  
  // 검색 페이지 처리
  function handleSearchPage() {
    try {
      // 검색 쿼리 추출
      const searchQuery = extractSearchQuery();
      
      if (searchQuery) {
        // 검색 이벤트 트래킹
        trackSearchQuery(searchQuery);
      }
    } catch (error) {
      console.error('검색 페이지 처리 중 오류:', error);
    }
  }
  
  // 검색 쿼리 추출
  function extractSearchQuery() {
    // URL에서 검색 쿼리 파라미터 추출 시도
    const urlParams = new URLSearchParams(window.location.search);
    const queryParam = urlParams.get('q') || urlParams.get('query') || urlParams.get('search');
    
    if (queryParam) {
      return decodeURIComponent(queryParam);
    }
    
    // DOM에서 검색 입력 필드 값 추출 시도
    const searchInputSelectors = [
      'input[name="q"]',
      'input[name="query"]',
      'input[name="search"]',
      '.search-input',
      '.search-field'
    ];
    
    for (const selector of searchInputSelectors) {
      const inputElement = document.querySelector(selector);
      if (inputElement && inputElement.value) {
        return inputElement.value.trim();
      }
    }
    
    return null;
  }
  
  // 검색 쿼리 트래킹
  function trackSearchQuery(searchQuery) {
    fetch(`${API_BASE_URL}/track-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        userId,
        sessionId,
        eventType: 'search',
        eventData: {
          query: searchQuery,
          timestamp: new Date().toISOString(),
          url: window.location.href
        }
      })
    }).catch(error => {
      console.error('검색 쿼리 트래킹 오류:', error);
    });
  }
  
  // 페이지 로드 시 초기화
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
