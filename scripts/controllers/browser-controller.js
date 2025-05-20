/**
 * 브라우저 컨트롤러 - 브라우저 조작과 액션 관리를 담당하는 클래스
 * blast_luxia 프로젝트의 Controller 클래스를 참고하여 구현
 */
const { chromium } = require('playwright');
const ActionRegistry = require('./action-registry');
const ActionResult = require('../models/action-result');
const logger = require('../utils/logger');

/**
 * 브라우저 조작과 관련된 액션을 관리하고 실행하는 클래스
 */
class BrowserController {
  /**
   * @param {object} options - 컨트롤러 설정
   * @param {array} options.excludeActions - 제외할 액션 목록
   * @param {object} options.browserOptions - 브라우저 시작 옵션
   * @param {object} options.logger - 로거 인스턴스
   */
  constructor(options = {}) {
    this.registry = new ActionRegistry({
      excludeActions: options.excludeActions || [],
      logger: options.logger || logger
    });
    
    this.browserOptions = options.browserOptions || {
      headless: true,
      slowMo: 50,
      timeout: 30000
    };
    
    this.logger = options.logger || logger;
    this.browser = null;
    this.context = null;
    this.page = null;
    
    this.registerDefaultActions();
    this.registerShoppingActions();
  }

  /**
   * 기본 브라우저 액션들을 등록합니다.
   */
  registerDefaultActions() {
    // 브라우저 시작
    this.registry.registerAction(
      'launchBrowser',
      'Launch a new browser instance',
      async (params, context) => {
        try {
          if (this.browser) {
            await this.closeBrowser();
          }
          
          this.browser = await chromium.launch(this.browserOptions);
          this.context = await this.browser.newContext({
            viewport: { width: 1280, height: 800 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            geolocation: { longitude: -46.6333, latitude: -23.5505 }, // 브라질 상파울루 좌표
            locale: 'pt-BR',
            permissions: ['geolocation']
          });
          
          this.page = await this.context.newPage();
          this.logger.info('Browser launched successfully');
          
          return ActionResult.success('Browser launched successfully');
        } catch (error) {
          this.logger.error('Failed to launch browser:', error);
          return ActionResult.error(`Failed to launch browser: ${error.message}`);
        }
      }
    );

    // URL로 이동
    this.registry.registerAction(
      'goToUrl',
      'Navigate to a specific URL',
      async (params, context) => {
        try {
          const url = params.url;
          if (!url) {
            return ActionResult.error('URL is required');
          }
          
          const page = await this.getCurrentPage();
          await page.goto(url, { waitUntil: 'networkidle' });
          
          this.logger.info(`Navigated to URL: ${url}`);
          return ActionResult.success(`Navigated to: ${url}`);
        } catch (error) {
          this.logger.error('Failed to navigate:', error);
          return ActionResult.error(`Failed to navigate: ${error.message}`);
        }
      }
    );

    // 요소 클릭
    this.registry.registerAction(
      'clickElement',
      'Click an element using a selector',
      async (params, context) => {
        try {
          const { selector } = params;
          if (!selector) {
            return ActionResult.error('Selector is required');
          }
          
          const page = await this.getCurrentPage();
          await page.waitForSelector(selector, { state: 'visible', timeout: 5000 });
          await page.click(selector);
          
          this.logger.info(`Clicked element: ${selector}`);
          return ActionResult.success(`Clicked element: ${selector}`);
        } catch (error) {
          this.logger.error('Failed to click element:', error);
          return ActionResult.error(`Failed to click element: ${error.message}`);
        }
      }
    );

    // 텍스트 입력
    this.registry.registerAction(
      'inputText',
      'Input text into an element',
      async (params, context) => {
        try {
          const { selector, text } = params;
          if (!selector || !text) {
            return ActionResult.error('Selector and text are required');
          }
          
          const page = await this.getCurrentPage();
          await page.waitForSelector(selector, { state: 'visible', timeout: 5000 });
          await page.fill(selector, text);
          
          this.logger.info(`Input text into element: ${selector}`);
          return ActionResult.success(`Input text into element: ${selector}`);
        } catch (error) {
          this.logger.error('Failed to input text:', error);
          return ActionResult.error(`Failed to input text: ${error.message}`);
        }
      }
    );

    // 페이지 스크롤
    this.registry.registerAction(
      'scrollPage',
      'Scroll the page by a specified amount or to an element',
      async (params, context) => {
        try {
          const page = await this.getCurrentPage();
          
          if (params.selector) {
            await page.waitForSelector(params.selector, { state: 'visible', timeout: 5000 });
            await page.evaluate(selector => {
              const element = document.querySelector(selector);
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, params.selector);
            
            this.logger.info(`Scrolled to element: ${params.selector}`);
            return ActionResult.success(`Scrolled to element: ${params.selector}`);
          } else {
            const amount = params.amount || 500;
            await page.evaluate((amount) => {
              window.scrollBy(0, amount);
            }, amount);
            
            this.logger.info(`Scrolled page by ${amount}px`);
            return ActionResult.success(`Scrolled page by ${amount}px`);
          }
        } catch (error) {
          this.logger.error('Failed to scroll page:', error);
          return ActionResult.error(`Failed to scroll page: ${error.message}`);
        }
      }
    );

    // 페이지 스크린샷
    this.registry.registerAction(
      'takeScreenshot',
      'Take a screenshot of the current page',
      async (params, context) => {
        try {
          const filePath = params.path || `screenshot-${Date.now()}.png`;
          const page = await this.getCurrentPage();
          await page.screenshot({ path: filePath, fullPage: params.fullPage === true });
          
          this.logger.info(`Screenshot saved to: ${filePath}`);
          return ActionResult.success(`Screenshot saved to: ${filePath}`);
        } catch (error) {
          this.logger.error('Failed to take screenshot:', error);
          return ActionResult.error(`Failed to take screenshot: ${error.message}`);
        }
      }
    );

    // 페이지 콘텐츠 추출
    this.registry.registerAction(
      'extractPageContent',
      'Extract the content of the current page',
      async (params, context) => {
        try {
          const page = await this.getCurrentPage();
          const content = await page.content();
          
          this.logger.info('Page content extracted');
          return ActionResult.success(content);
        } catch (error) {
          this.logger.error('Failed to extract page content:', error);
          return ActionResult.error(`Failed to extract page content: ${error.message}`);
        }
      }
    );

    // 브라우저 닫기
    this.registry.registerAction(
      'closeBrowser',
      'Close the browser instance',
      async (params, context) => {
        try {
          await this.closeBrowser();
          this.logger.info('Browser closed successfully');
          return ActionResult.success('Browser closed successfully');
        } catch (error) {
          this.logger.error('Failed to close browser:', error);
          return ActionResult.error(`Failed to close browser: ${error.message}`);
        }
      }
    );
  }

  /**
   * 쇼핑몰 관련 특화 액션들을 등록합니다.
   */
  registerShoppingActions() {
    // 상품 카테고리 탐색
    this.registry.registerAction(
      'browseCategory',
      'Browse a product category',
      async (params, context) => {
        try {
          const { categoryUrl } = params;
          if (!categoryUrl) {
            return ActionResult.error('Category URL is required');
          }
          
          const page = await this.getCurrentPage();
          await page.goto(categoryUrl, { waitUntil: 'networkidle' });
          
          // 카테고리 페이지에서 상품 요소들을 수집
          const products = await page.evaluate(() => {
            const productElements = document.querySelectorAll('.product-item');
            return Array.from(productElements).map(element => {
              const titleElement = element.querySelector('.product-title');
              const priceElement = element.querySelector('.product-price');
              const linkElement = element.querySelector('a');
              
              return {
                title: titleElement ? titleElement.textContent.trim() : 'Unknown product',
                price: priceElement ? priceElement.textContent.trim() : 'Price not available',
                url: linkElement ? linkElement.href : null
              };
            }).filter(product => product.url !== null);
          });
          
          this.logger.info(`Browsed category: ${categoryUrl}, found ${products.length} products`);
          return ActionResult.success(JSON.stringify(products));
        } catch (error) {
          this.logger.error('Failed to browse category:', error);
          return ActionResult.error(`Failed to browse category: ${error.message}`);
        }
      }
    );

    // 상품 상세 정보 수집
    this.registry.registerAction(
      'getProductDetails',
      'Get detailed information about a product',
      async (params, context) => {
        try {
          const { productUrl } = params;
          if (!productUrl) {
            return ActionResult.error('Product URL is required');
          }
          
          const page = await this.getCurrentPage();
          await page.goto(productUrl, { waitUntil: 'networkidle' });
          
          // 상품 상세 정보 추출
          const productDetails = await page.evaluate(() => {
            function getTextContent(selector) {
              const element = document.querySelector(selector);
              return element ? element.textContent.trim() : null;
            }
            
            return {
              title: getTextContent('.product-title'),
              price: getTextContent('.product-price'),
              description: getTextContent('.product-description'),
              specifications: Array.from(document.querySelectorAll('.product-specification'))
                .map(spec => {
                  const label = spec.querySelector('.spec-label');
                  const value = spec.querySelector('.spec-value');
                  return {
                    label: label ? label.textContent.trim() : '',
                    value: value ? value.textContent.trim() : ''
                  };
                }),
              availability: getTextContent('.product-availability'),
              imageUrls: Array.from(document.querySelectorAll('.product-image')).map(img => img.src)
            };
          });
          
          this.logger.info(`Got product details for: ${productUrl}`);
          return ActionResult.success(JSON.stringify(productDetails));
        } catch (error) {
          this.logger.error('Failed to get product details:', error);
          return ActionResult.error(`Failed to get product details: ${error.message}`);
        }
      }
    );

    // 장바구니에 추가
    this.registry.registerAction(
      'addToCart',
      'Add a product to the cart',
      async (params, context) => {
        try {
          const { productUrl, quantity } = params;
          if (!productUrl) {
            return ActionResult.error('Product URL is required');
          }
          
          const page = await this.getCurrentPage();
          await page.goto(productUrl, { waitUntil: 'networkidle' });
          
          // 수량 선택 (있는 경우)
          if (quantity && quantity > 1) {
            try {
              await page.waitForSelector('.quantity-input', { timeout: 5000 });
              await page.fill('.quantity-input', quantity.toString());
            } catch (error) {
              this.logger.warn('Quantity selector not found, using default quantity');
            }
          }
          
          // 장바구니 버튼 클릭
          await page.waitForSelector('.add-to-cart-button', { state: 'visible', timeout: 10000 });
          await page.click('.add-to-cart-button');
          
          // 장바구니 추가 확인 대기
          try {
            await page.waitForSelector('.cart-confirmation', { state: 'visible', timeout: 10000 });
          } catch (error) {
            this.logger.warn('Cart confirmation not found, but the action might have succeeded');
          }
          
          this.logger.info(`Added product to cart: ${productUrl}`);
          return ActionResult.success(`Product added to cart successfully: ${productUrl}`);
        } catch (error) {
          this.logger.error('Failed to add product to cart:', error);
          return ActionResult.error(`Failed to add product to cart: ${error.message}`);
        }
      }
    );

    // 장바구니 확인
    this.registry.registerAction(
      'viewCart',
      'View the shopping cart',
      async (params, context) => {
        try {
          const page = await this.getCurrentPage();
          await page.goto('https://www.lge.com/br/carrinho', { waitUntil: 'networkidle' });
          
          // 장바구니 아이템 수집
          const cartItems = await page.evaluate(() => {
            const items = document.querySelectorAll('.cart-item');
            return Array.from(items).map(item => {
              const titleElement = item.querySelector('.cart-item-title');
              const priceElement = item.querySelector('.cart-item-price');
              const quantityElement = item.querySelector('.cart-item-quantity input');
              
              return {
                title: titleElement ? titleElement.textContent.trim() : 'Unknown product',
                price: priceElement ? priceElement.textContent.trim() : 'Price not available',
                quantity: quantityElement ? quantityElement.value : '1'
              };
            });
          });
          
          // 장바구니 총액 가져오기
          const cartTotal = await page.evaluate(() => {
            const totalElement = document.querySelector('.cart-total-price');
            return totalElement ? totalElement.textContent.trim() : 'Total not available';
          });
          
          const cartInfo = {
            items: cartItems,
            total: cartTotal
          };
          
          this.logger.info(`Viewed cart, found ${cartItems.length} items`);
          return ActionResult.success(JSON.stringify(cartInfo));
        } catch (error) {
          this.logger.error('Failed to view cart:', error);
          return ActionResult.error(`Failed to view cart: ${error.message}`);
        }
      }
    );

    // 체크아웃 시작
    this.registry.registerAction(
      'proceedToCheckout',
      'Proceed to the checkout process',
      async (params, context) => {
        try {
          const page = await this.getCurrentPage();
          
          // 장바구니 페이지에 접속
          await page.goto('https://www.lge.com/br/carrinho', { waitUntil: 'networkidle' });
          
          // 체크아웃 버튼 클릭
          await page.waitForSelector('.checkout-button', { state: 'visible', timeout: 10000 });
          await page.click('.checkout-button');
          
          // 체크아웃 페이지로 이동 확인
          await page.waitForURL(/checkout/, { timeout: 15000 });
          
          this.logger.info('Proceeded to checkout successfully');
          return ActionResult.success('Proceeded to checkout successfully');
        } catch (error) {
          this.logger.error('Failed to proceed to checkout:', error);
          return ActionResult.error(`Failed to proceed to checkout: ${error.message}`);
        }
      }
    );

    // 체크아웃 프로세스 매핑
    this.registry.registerAction(
      'mapCheckoutProcess',
      'Map the checkout process steps and required fields',
      async (params, context) => {
        try {
          const page = await this.getCurrentPage();
          
          // 장바구니 페이지에 접속
          await page.goto('https://www.lge.com/br/carrinho', { waitUntil: 'networkidle' });
          
          // 체크아웃 버튼 클릭
          await page.waitForSelector('.checkout-button', { state: 'visible', timeout: 10000 });
          await page.click('.checkout-button');
          
          // 체크아웃 페이지로 이동 확인
          await page.waitForURL(/checkout/, { timeout: 15000 });
          
          // 체크아웃 단계 매핑
          const checkoutSteps = [];
          
          // 주문 정보 단계
          const orderInfoFields = await this.mapFormFields(page, '.order-info-form');
          if (orderInfoFields.length > 0) {
            checkoutSteps.push({
              name: 'order-info',
              title: 'Order Information',
              fields: orderInfoFields
            });
          }
          
          // 배송 정보 단계로 이동
          try {
            await page.waitForSelector('.continue-button', { state: 'visible', timeout: 5000 });
            await page.click('.continue-button');
            await page.waitForTimeout(2000);
            
            // 배송 정보 단계
            const shippingFields = await this.mapFormFields(page, '.shipping-form');
            if (shippingFields.length > 0) {
              checkoutSteps.push({
                name: 'shipping-info',
                title: 'Shipping Information',
                fields: shippingFields
              });
            }
            
            // 결제 정보 단계로 이동
            await page.waitForSelector('.continue-button', { state: 'visible', timeout: 5000 });
            await page.click('.continue-button');
            await page.waitForTimeout(2000);
            
            // 결제 정보 단계
            const paymentFields = await this.mapFormFields(page, '.payment-form');
            if (paymentFields.length > 0) {
              checkoutSteps.push({
                name: 'payment-info',
                title: 'Payment Information',
                fields: paymentFields
              });
            }
          } catch (error) {
            this.logger.warn('Error navigating checkout steps:', error);
          }
          
          this.logger.info(`Mapped checkout process with ${checkoutSteps.length} steps`);
          return ActionResult.success(JSON.stringify(checkoutSteps));
        } catch (error) {
          this.logger.error('Failed to map checkout process:', error);
          return ActionResult.error(`Failed to map checkout process: ${error.message}`);
        }
      }
    );

    // 상품 검색
    this.registry.registerAction(
      'searchProducts',
      'Search for products using keywords',
      async (params, context) => {
        try {
          const { query } = params;
          if (!query) {
            return ActionResult.error('Search query is required');
          }
          
          const page = await this.getCurrentPage();
          await page.goto('https://www.lge.com/br', { waitUntil: 'networkidle' });
          
          // 검색창 찾기 및 입력
          await page.waitForSelector('.search-input', { state: 'visible', timeout: 5000 });
          await page.fill('.search-input', query);
          
          // 검색 버튼 클릭
          await page.waitForSelector('.search-button', { state: 'visible', timeout: 5000 });
          await page.click('.search-button');
          
          // 검색 결과 대기
          await page.waitForSelector('.product-list', { state: 'visible', timeout: 10000 });
          
          // 검색 결과 수집
          const searchResults = await page.evaluate(() => {
            const results = document.querySelectorAll('.product-item');
            return Array.from(results).map(item => {
              const titleElement = item.querySelector('.product-title');
              const priceElement = item.querySelector('.product-price');
              const linkElement = item.querySelector('a');
              
              return {
                title: titleElement ? titleElement.textContent.trim() : 'Unknown product',
                price: priceElement ? priceElement.textContent.trim() : 'Price not available',
                url: linkElement ? linkElement.href : null
              };
            }).filter(result => result.url !== null);
          });
          
          this.logger.info(`Searched for "${query}", found ${searchResults.length} results`);
          return ActionResult.success(JSON.stringify(searchResults));
        } catch (error) {
          this.logger.error('Failed to search products:', error);
          return ActionResult.error(`Failed to search products: ${error.message}`);
        }
      }
    );
  }

  /**
   * 사용자 정의 액션을 등록합니다.
   * @param {string} name - 액션 이름
   * @param {string} description - 액션 설명
   * @param {function} handler - 액션 핸들러 함수
   * @param {object} options - 추가 옵션
   * @returns {function} 등록된 핸들러 함수
   */
  registerAction(name, description, handler, options = {}) {
    return this.registry.registerAction(name, description, handler, options);
  }

  /**
   * 액션 데코레이터 함수
   * @param {string} description - 액션 설명
   * @param {object} options - 추가 옵션
   * @returns {function} 데코레이터 함수
   */
  action(description, options = {}) {
    return this.registry.action(description, options);
  }

  /**
   * 액션을 실행합니다.
   * @param {string} actionName - 실행할 액션 이름
   * @param {object} params - 액션에 전달할 파라미터
   * @param {object} context - 실행 컨텍스트
   * @returns {Promise<ActionResult>} 실행 결과
   */
  async executeAction(actionName, params = {}, context = {}) {
    try {
      const result = await this.registry.executeAction(actionName, params, {
        ...context,
        controller: this
      });
      return result;
    } catch (error) {
      this.logger.error(`Error executing action "${actionName}":`, error);
      return new ActionResult({
        success: false,
        error: error.message || 'Unknown error occurred'
      });
    }
  }

  /**
   * 브라우저를 시작합니다.
   * @returns {Promise<object>} 브라우저 인스턴스
   */
  async launchBrowser() {
    if (this.browser) {
      await this.closeBrowser();
    }
    
    return this.executeAction('launchBrowser');
  }

  /**
   * 브라우저를 닫습니다.
   */
  async closeBrowser() {
    if (this.browser) {
      try {
        await this.browser.close();
        this.browser = null;
        this.context = null;
        this.page = null;
      } catch (error) {
        this.logger.error('Error closing browser:', error);
      }
    }
  }

  /**
   * 현재 페이지를 가져옵니다.
   * @returns {Promise<object>} 현재 페이지 인스턴스
   */
  async getCurrentPage() {
    if (!this.page) {
      if (!this.browser || !this.context) {
        await this.launchBrowser();
      } else {
        this.page = await this.context.newPage();
      }
    }
    return this.page;
  }

  /**
   * 폼 필드를 매핑합니다. (체크아웃 프로세스에서 사용)
   * @param {object} page - 페이지 인스턴스
   * @param {string} formSelector - 폼 요소 선택자
   * @returns {Promise<Array>} 매핑된 폼 필드 목록
   */
  async mapFormFields(page, formSelector) {
    return page.evaluate((selector) => {
      const form = document.querySelector(selector);
      if (!form) return [];
      
      const inputs = form.querySelectorAll('input, select, textarea');
      return Array.from(inputs).map(input => {
        // 기본 필드 정보
        const field = {
          name: input.name || input.id,
          type: input.type || input.tagName.toLowerCase(),
          required: input.required || input.hasAttribute('required'),
          placeholder: input.placeholder || '',
          label: '',
          options: []
        };
        
        // 라벨 찾기
        const labelElement = document.querySelector(`label[for="${input.id}"]`);
        if (labelElement) {
          field.label = labelElement.textContent.trim();
        }
        
        // select 옵션 처리
        if (input.tagName.toLowerCase() === 'select') {
          field.options = Array.from(input.options).map(option => ({
            value: option.value,
            text: option.textContent.trim()
          }));
        }
        
        return field;
      });
    }, formSelector);
  }
}

module.exports = BrowserController;
