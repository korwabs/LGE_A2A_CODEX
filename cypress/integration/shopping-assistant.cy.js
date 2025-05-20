describe('Shopping Assistant Widget E2E Tests', () => {
  beforeEach(() => {
    // 테스트 전에 모든 네트워크 요청을 인터셉트할 준비
    cy.intercept('POST', '/api/dialog/message', {
      statusCode: 200,
      body: {
        response: 'How can I help you with your shopping today?'
      }
    }).as('dialogMessage');
    
    cy.intercept('GET', '/api/products/search*', {
      statusCode: 200,
      body: {
        products: [
          { 
            id: 'prod1', 
            name: 'LG OLED TV', 
            price: 1200,
            description: 'Amazing 4K TV',
            imageUrl: 'http://example.com/tv.jpg'
          },
          {
            id: 'prod2',
            name: 'LG UHD TV',
            price: 800,
            description: 'Great value TV',
            imageUrl: 'http://example.com/uhd.jpg'
          }
        ]
      }
    }).as('searchProducts');
    
    cy.intercept('GET', '/api/cart/*', {
      statusCode: 200,
      body: {
        cart: []
      }
    }).as('getCart');
    
    cy.intercept('POST', '/api/cart/*/add', {
      statusCode: 200,
      body: {
        success: true,
        cart: [
          { 
            id: 'prod1', 
            name: 'LG OLED TV', 
            price: 1200,
            quantity: 1
          }
        ]
      }
    }).as('addToCart');
    
    // 테스트 페이지 방문
    cy.visit('/');
  });

  it('should open the shopping assistant when clicked', () => {
    // 위젯 버튼이 페이지에 렌더링되어야 함
    cy.get('#shopping-assistant-button').should('be.visible');
    
    // 버튼 클릭
    cy.get('#shopping-assistant-button').click();
    
    // 어시스턴트 대화창이 열려야 함
    cy.get('#shopping-assistant-chat').should('be.visible');
    
    // 초기 메시지가 표시되어야 함
    cy.get('#shopping-assistant-chat .message.assistant')
      .should('be.visible')
      .and('contain', 'Welcome to LG Brazil Shopping Assistant');
  });

  it('should send a message and receive a response', () => {
    // 위젯 열기
    cy.get('#shopping-assistant-button').click();
    
    // 메시지 입력
    cy.get('#shopping-assistant-input')
      .type('I want to buy a new TV');
    
    // 전송 버튼 클릭
    cy.get('#shopping-assistant-send').click();
    
    // 사용자 메시지가 표시되어야 함
    cy.get('#shopping-assistant-chat .message.user')
      .should('be.visible')
      .and('contain', 'I want to buy a new TV');
    
    // API 호출 대기
    cy.wait('@dialogMessage');
    
    // 어시스턴트 응답이 표시되어야 함
    cy.get('#shopping-assistant-chat .message.assistant')
      .should('be.visible')
      .and('contain', 'How can I help you with your shopping today?');
  });

  it('should display product recommendations', () => {
    // 위젯 열기
    cy.get('#shopping-assistant-button').click();
    
    // 메시지 입력 및 전송
    cy.get('#shopping-assistant-input')
      .type('Show me TVs');
    cy.get('#shopping-assistant-send').click();
    
    // API 호출 대기
    cy.wait('@dialogMessage');
    cy.wait('@searchProducts');
    
    // 제품 추천이 표시되어야 함
    cy.get('#shopping-assistant-chat .product-card')
      .should('have.length.at.least', 2);
    
    // 첫 번째 제품 카드의 내용 확인
    cy.get('#shopping-assistant-chat .product-card')
      .first()
      .should('contain', 'LG OLED TV')
      .and('contain', '1200');
  });

  it('should add a product to cart', () => {
    // 위젯 열기
    cy.get('#shopping-assistant-button').click();
    
    // 제품 검색
    cy.get('#shopping-assistant-input')
      .type('Show me TVs');
    cy.get('#shopping-assistant-send').click();
    
    // API 호출 대기
    cy.wait('@dialogMessage');
    cy.wait('@searchProducts');
    
    // 제품 카드의 장바구니 추가 버튼 클릭
    cy.get('#shopping-assistant-chat .product-card')
      .first()
      .find('.add-to-cart-button')
      .click();
    
    // API 호출 대기
    cy.wait('@addToCart');
    
    // 장바구니 추가 성공 메시지가 표시되어야 함
    cy.get('#shopping-assistant-chat .message.assistant')
      .should('contain', 'added to your cart');
    
    // 장바구니 아이콘에 수량 표시 확인
    cy.get('#shopping-cart-icon .badge')
      .should('be.visible')
      .and('contain', '1');
  });

  it('should show cart contents', () => {
    // 장바구니에 아이템이 추가된 상태로 인터셉트 수정
    cy.intercept('GET', '/api/cart/*', {
      statusCode: 200,
      body: {
        cart: [
          { 
            id: 'prod1', 
            name: 'LG OLED TV', 
            price: 1200,
            quantity: 1
          }
        ]
      }
    }).as('getCart');
    
    // 위젯 열기
    cy.get('#shopping-assistant-button').click();
    
    // 장바구니 내용 요청
    cy.get('#shopping-assistant-input')
      .type('Show my cart');
    cy.get('#shopping-assistant-send').click();
    
    // API 호출 대기
    cy.wait('@dialogMessage');
    cy.wait('@getCart');
    
    // 장바구니 내용이 표시되어야 함
    cy.get('#shopping-assistant-chat .cart-summary')
      .should('be.visible');
    
    cy.get('#shopping-assistant-chat .cart-item')
      .should('have.length', 1)
      .and('contain', 'LG OLED TV')
      .and('contain', '1200');
    
    // 총 금액 표시 확인
    cy.get('#shopping-assistant-chat .cart-total')
      .should('contain', '1200');
  });

  it('should guide through checkout process', () => {
    // 장바구니에 아이템이 추가된 상태로 인터셉트 수정
    cy.intercept('GET', '/api/cart/*', {
      statusCode: 200,
      body: {
        cart: [
          { 
            id: 'prod1', 
            name: 'LG OLED TV', 
            price: 1200,
            quantity: 1
          }
        ]
      }
    }).as('getCart');
    
    // 체크아웃 프로세스 시작 인터셉트
    cy.intercept('POST', '/api/cart/*/checkout', {
      statusCode: 200,
      body: {
        success: true,
        checkoutUrl: 'https://www.lge.com/br/checkout?session=test123'
      }
    }).as('checkout');
    
    // 위젯 열기
    cy.get('#shopping-assistant-button').click();
    
    // 체크아웃 요청
    cy.get('#shopping-assistant-input')
      .type('Checkout my cart');
    cy.get('#shopping-assistant-send').click();
    
    // API 호출 대기
    cy.wait('@dialogMessage');
    cy.wait('@getCart');
    cy.wait('@checkout');
    
    // 체크아웃 링크가 표시되어야 함
    cy.get('#shopping-assistant-chat .checkout-link')
      .should('be.visible')
      .and('have.attr', 'href', 'https://www.lge.com/br/checkout?session=test123');
    
    // 체크아웃 안내 메시지 확인
    cy.get('#shopping-assistant-chat .message.assistant')
      .should('contain', 'checkout');
  });
});
