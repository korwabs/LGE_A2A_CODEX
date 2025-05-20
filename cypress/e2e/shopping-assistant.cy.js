/// <reference types="cypress" />

describe('LG 브라질 A2A 쇼핑 어시스턴트 E2E 테스트', () => {
  beforeEach(() => {
    // 테스트 전 기본 URL 방문
    cy.visit('/');
    
    // 필요한 경우 테스트용 상태 설정
    cy.window().then((win) => {
      win.localStorage.setItem('testMode', 'true');
    });
  });

  it('어시스턴트 위젯이 로드되어야 함', () => {
    // 어시스턴트 위젯이 페이지에 존재하는지 확인
    cy.get('#shopping-assistant-widget').should('exist');
    cy.get('#shopping-assistant-toggle').should('be.visible');
  });

  it('어시스턴트 위젯 토글이 작동해야 함', () => {
    // 초기에는 닫혀있는 상태 확인
    cy.get('#shopping-assistant-panel').should('not.be.visible');
    
    // 토글 버튼 클릭
    cy.get('#shopping-assistant-toggle').click();
    
    // 패널이 열려있는지 확인
    cy.get('#shopping-assistant-panel').should('be.visible');
    
    // 다시 토글 버튼 클릭
    cy.get('#shopping-assistant-toggle').click();
    
    // 패널이 닫혔는지 확인
    cy.get('#shopping-assistant-panel').should('not.be.visible');
  });

  it('기본 제품 검색이 작동해야 함', () => {
    // 위젯 열기
    cy.get('#shopping-assistant-toggle').click();
    
    // 검색 인풋에 텍스트 입력
    cy.get('#assistant-input')
      .should('be.visible')
      .type('TV 추천해주세요{enter}');
    
    // 로딩 표시기가 나타났다가 사라져야 함
    cy.get('#assistant-loader').should('be.visible');
    cy.get('#assistant-loader', { timeout: 10000 }).should('not.exist');
    
    // 응답이 화면에 표시되어야 함
    cy.get('#assistant-messages')
      .should('contain.text', 'TV');
    
    // 응답에 제품 추천 카드가 포함되어야 함
    cy.get('.product-card').should('have.length.at.least', 1);
  });

  it('구매 프로세스 흐름을 시작할 수 있어야 함', () => {
    // 위젯 열기
    cy.get('#shopping-assistant-toggle').click();
    
    // 제품 검색 및 선택
    cy.get('#assistant-input')
      .should('be.visible')
      .type('냉장고 구매하고 싶어요{enter}');
    
    // 로딩 후 제품 카드가 나타나면 첫 번째 제품의 '구매하기' 버튼 클릭
    cy.get('#assistant-loader', { timeout: 10000 }).should('not.exist');
    cy.get('.product-card').first().within(() => {
      cy.contains('구매하기').click();
    });
    
    // 구매 프로세스가 시작되어야 함
    cy.get('#assistant-messages')
      .should('contain.text', '구매를 도와드리겠습니다')
      .should('contain.text', '배송지');
  });

  it('체크아웃 프로세스에서 사용자 정보를 수집할 수 있어야 함', () => {
    // 위젯 열기
    cy.get('#shopping-assistant-toggle').click();
    
    // 제품 검색 및 구매 시작
    cy.get('#assistant-input')
      .type('에어컨 구매하기{enter}');
    
    // 로딩 후 제품 카드가 나타나면 첫 번째 제품의 '구매하기' 버튼 클릭
    cy.get('#assistant-loader', { timeout: 10000 }).should('not.exist');
    cy.get('.product-card').first().within(() => {
      cy.contains('구매하기').click();
    });
    
    // 배송지 정보 입력
    cy.get('#assistant-input')
      .type('상파울루 아베니다 파울리스타 1000번지{enter}');
    
    // 우편번호 요청 메시지가 나와야 함
    cy.get('#assistant-messages')
      .should('contain.text', '우편번호');
    
    // 우편번호 입력
    cy.get('#assistant-input')
      .type('01310-100{enter}');
    
    // 연락처 요청 메시지가 나와야 함
    cy.get('#assistant-messages')
      .should('contain.text', '연락처');
    
    // 연락처 입력
    cy.get('#assistant-input')
      .type('11-98765-4321{enter}');
    
    // 결제 방법 선택지가 나와야 함
    cy.get('#assistant-messages')
      .should('contain.text', '결제 방법');
  });

  it('장바구니에 제품을 추가할 수 있어야 함', () => {
    // 위젯 열기
    cy.get('#shopping-assistant-toggle').click();
    
    // 장바구니에 제품 추가 요청
    cy.get('#assistant-input')
      .type('OLED TV를 장바구니에 추가해주세요{enter}');
    
    // 로딩 후 제품 카드가 나타나야 함
    cy.get('#assistant-loader', { timeout: 10000 }).should('not.exist');
    cy.get('.product-card').should('exist');
    
    // 장바구니 추가 버튼 클릭
    cy.contains('장바구니에 추가').click();
    
    // 장바구니 추가 확인 메시지가 나와야 함
    cy.get('#assistant-messages')
      .should('contain.text', '장바구니에 추가되었습니다');
    
    // 장바구니 확인 요청
    cy.get('#assistant-input')
      .type('장바구니 확인{enter}');
    
    // 장바구니에 제품이 있어야 함
    cy.get('#assistant-messages')
      .should('contain.text', 'OLED TV');
  });
});
