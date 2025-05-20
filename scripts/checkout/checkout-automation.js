/**
 * 체크아웃 자동화 - 체크아웃 프로세스 분석 및 자동화
 * 
 * 주요 개선 사항:
 * 1. 세부적인 체크아웃 단계 및 필드 분석
 * 2. 관계형 폼 요소 매핑
 * 3. 자동화 지원 속성 수집
 * 4. 세션 기반 컨텍스트 관리
 */
const fs = require('fs');
const path = require('path');
const { retry } = require('../utils/retry-utils');
const logger = require('../utils/logger');
const CheckoutProcessManager = require('./managers/checkout-process-manager');
const FormFieldMappingManager = require('./managers/form-field-mapping-manager');
const CheckoutSessionManager = require('./managers/checkout-session-manager');

/**
 * 체크아웃 자동화 클래스
 */
class CheckoutAutomation {
  /**
   * @param {object} options - 체크아웃 자동화 옵션
   * @param {string} options.dataDir - 데이터 저장 디렉토리
   * @param {object} options.browserController - 브라우저 컨트롤러 인스턴스
   * @param {object} options.logger - 로거 인스턴스
   */
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(__dirname, '../../data');
    this.checkoutDataDir = path.join(this.dataDir, 'checkout');
    this.browserController = options.browserController;
    
    // 데이터 디렉토리 확인
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    
    if (!fs.existsSync(this.checkoutDataDir)) {
      fs.mkdirSync(this.checkoutDataDir, { recursive: true });
    }
    
    this.logger = options.logger || logger;
    
    // 매니저 인스턴스 생성
    this.processManager = new CheckoutProcessManager({ 
      dataDir: this.checkoutDataDir 
    });
    
    this.fieldMappingManager = new FormFieldMappingManager();
    
    this.sessionManager = new CheckoutSessionManager({
      formFieldMappingManager: this.fieldMappingManager,
      checkoutProcessManager: this.processManager
    });
    
    // 주기적으로 만료된 세션 정리
    setInterval(() => {
      this.sessionManager.cleanupExpiredSessions();
    }, 5 * 60 * 1000); // 5분마다
  }
  
  /**
   * 체크아웃 프로세스를 분석합니다.
   * @param {string} productUrl - 제품 URL
   * @param {object} options - 분석 옵션
   * @param {boolean} options.detailed - 상세 분석 여부
   * @param {number} options.maxDepth - 최대 분석 깊이
   * @returns {Promise<object>} 체크아웃 프로세스 정보
   */
  async analyzeCheckoutProcess(productUrl, options = {}) {
    this.logger.info(`Analyzing checkout process for product: ${productUrl}`);
    
    const detailed = options.detailed !== false;
    const maxDepth = options.maxDepth || 3;
    
    try {
      // 브라우저 컨트롤러가 없는 경우 예외 발생
      if (!this.browserController) {
        throw new Error('Browser controller is required');
      }
      
      // 제품 ID 추출
      const productId = this._extractProductId(productUrl);
      
      // 브라우저 시작
      const result = await this.browserController.executeAction('launchBrowser');
      if (!result.success) {
        throw new Error(`Failed to launch browser: ${result.error}`);
      }
      
      try {
        // 제품 페이지 접속
        await this.browserController.executeAction('goToUrl', { url: productUrl });
        
        // 제품 정보 수집
        const productInfo = await this._collectProductInfo();
        
        // 구매 버튼 찾기 및 클릭
        await this._findAndClickBuyButton();
        
        // 체크아웃 단계 분석
        const checkoutData = await this._analyzeCheckoutSteps(maxDepth, detailed);
        
        // 제품 정보 추가
        checkoutData.productInfo = productInfo;
        
        // 체크아웃 프로세스 저장
        this.processManager.saveCheckoutProcess(productId, checkoutData);
        
        this.logger.info('Checkout process analysis completed');
        return checkoutData;
      } finally {
        // 브라우저 종료
        await this.browserController.executeAction('closeBrowser');
      }
    } catch (error) {
      this.logger.error('Checkout process analysis failed:', error);
      throw error;
    }
  }
  
  /**
   * 제품 정보를 수집합니다.
   * @returns {Promise<object>} 제품 정보
   * @private
   */
  async _collectProductInfo() {
    try {
      const page = await this.browserController.getCurrentPage();
      
      return await page.evaluate(() => {
        // 제품 정보 추출 함수
        const getElementText = (selector) => {
          const element = document.querySelector(selector);
          return element ? element.textContent.trim() : null;
        };
        
        // 다양한 선택자 패턴 시도
        const productSelectors = {
          title: [
            '.product-title', 'h1.product-name', '.product-detail h1', 
            '.pdp-title', '[data-product-title]', '.product-heading'
          ],
          price: [
            '.product-price', '.price', '.current-price', '.pdp-price', 
            '[data-product-price]', '.product-pricing'
          ],
          sku: [
            '.product-sku', '.sku', '.product-code', '[data-product-sku]', 
            '.product-id', '.model-number'
          ],
          category: [
            '.product-category', '.category', '.breadcrumbs', '.breadcrumb',
            '[data-product-category]', '.product-family'
          ]
        };
        
        // 각 정보 유형에 대해 선택자 시도
        const productInfo = {};
        
        for (const [infoType, selectors] of Object.entries(productSelectors)) {
          for (const selector of selectors) {
            const value = getElementText(selector);
            if (value) {
              productInfo[infoType] = value;
              break;
            }
          }
        }
        
        // 제품 이미지 URL 추출
        try {
          const imageElement = document.querySelector('.product-image, .pdp-image, .gallery-image, [data-product-image]');
          if (imageElement) {
            productInfo.imageUrl = imageElement.src || imageElement.dataset.src;
          }
        } catch (e) {
          console.error('Failed to extract product image URL:', e);
        }
        
        // 제품 설명 추출
        try {
          const descriptionElement = document.querySelector('.product-description, .description, .pdp-description, [data-product-description]');
          if (descriptionElement) {
            productInfo.description = descriptionElement.textContent.trim();
          }
        } catch (e) {
          console.error('Failed to extract product description:', e);
        }
        
        // 메타 태그에서 추가 정보 추출
        try {
          const metaProduct = document.querySelector('meta[property="og:product"]');
          if (metaProduct) {
            productInfo.metaProduct = metaProduct.content;
          }
          
          const metaProductId = document.querySelector('meta[property="product:id"]');
          if (metaProductId) {
            productInfo.metaProductId = metaProductId.content;
          }
        } catch (e) {
          console.error('Failed to extract product meta tags:', e);
        }
        
        return productInfo;
      });
    } catch (error) {
      this.logger.error('Failed to collect product info:', error);
      return {}; // 실패해도 빈 객체 반환하여 계속 진행
    }
  }
  
  /**
   * 구매 버튼을 찾아 클릭합니다.
   * @returns {Promise<void>}
   * @private
   */
  async _findAndClickBuyButton() {
    // 구매 버튼 후보 선택자들
    const buyButtonSelectors = [
      '.buy-now-button',
      '.add-to-cart-button',
      '.btn-buy',
      '.btn-comprar',
      'button:has-text("Comprar")',
      'a:has-text("Comprar")',
      'button:has-text("Buy")',
      'a:has-text("Buy")',
      '.btnComprar',
      '.btn-primary:has-text("Add to Cart")',
      '.AddToCart',
      'button[name="add"]',
      '.pdp-buy-button'
    ];
    
    try {
      const page = await this.browserController.getCurrentPage();
      
      // 각 선택자를 시도하여 구매 버튼 찾기
      let buttonFound = false;
      
      for (const selector of buyButtonSelectors) {
        try {
          // 버튼이 있는지 확인
          const isVisible = await page.isVisible(selector, { timeout: 1000 });
          
          if (isVisible) {
            this.logger.info(`Found buy button using selector: ${selector}`);
            
            // 버튼 클릭
            await page.click(selector);
            await page.waitForTimeout(3000); // 페이지 전환 대기
            
            // 현재 URL 확인 (장바구니나 체크아웃 페이지로 이동했는지)
            const currentUrl = page.url();
            
            if (currentUrl.includes('cart') || currentUrl.includes('checkout') || 
                currentUrl.includes('carrinho') || currentUrl.includes('compra')) {
              this.logger.info(`Redirected to: ${currentUrl}`);
              buttonFound = true;
              break;
            } else {
              // "계속 진행" 버튼이 있는지 확인 (팝업 등)
              for (const continueSelector of [
                '.continue-button', '.btn-continue', 'button:has-text("Continue")', 
                'button:has-text("Continuar")', '.modal-confirm'
              ]) {
                try {
                  const isContinueVisible = await page.isVisible(continueSelector, { timeout: 1000 });
                  if (isContinueVisible) {
                    this.logger.info(`Found continue button: ${continueSelector}`);
                    await page.click(continueSelector);
                    await page.waitForTimeout(3000);
                    
                    // 다시 URL 확인
                    const newUrl = page.url();
                    if (newUrl.includes('cart') || newUrl.includes('checkout') || 
                        newUrl.includes('carrinho') || newUrl.includes('compra')) {
                      this.logger.info(`Redirected to: ${newUrl}`);
                      buttonFound = true;
                      break;
                    }
                  }
                } catch (e) {
                  // 계속 진행
                }
              }
            }
          }
        } catch (error) {
          // 이 선택자로 버튼을 찾지 못함, 다음 선택자 시도
          this.logger.debug(`Button not found with selector: ${selector}`);
        }
      }
      
      // 버튼을 찾지 못한 경우 텍스트 기반 검색
      if (!buttonFound) {
        this.logger.info('Trying text-based button search');
        
        const productTitle = await this._getProductTitle();
        
        // 텍스트 기반 버튼 찾기
        const buttonElements = await page.$$('button, a.btn, .button, input[type="button"]');
        
        for (const buttonElement of buttonElements) {
          const buttonText = await buttonElement.textContent();
          const buttonTextLower = buttonText.toLowerCase();
          
          if (buttonTextLower.includes('comprar') || buttonTextLower.includes('buy') || 
              buttonTextLower.includes('add to cart') || buttonTextLower.includes('adicionar') ||
              buttonTextLower.includes('basket') || buttonTextLower.includes('carrinho')) {
            
            this.logger.info(`Found buy button with text: ${buttonText}`);
            await buttonElement.click();
            await page.waitForTimeout(3000); // 페이지 전환 대기
            
            // 현재 URL 확인
            const currentUrl = page.url();
            if (currentUrl.includes('cart') || currentUrl.includes('checkout') || 
                currentUrl.includes('carrinho') || currentUrl.includes('compra')) {
              buttonFound = true;
              break;
            } else {
              // "계속 진행" 버튼이 있는지 확인 (팝업 등)
              for (const continueSelector of [
                '.continue-button', '.btn-continue', 'button:has-text("Continue")', 
                'button:has-text("Continuar")', '.modal-confirm'
              ]) {
                try {
                  const isContinueVisible = await page.isVisible(continueSelector, { timeout: 1000 });
                  if (isContinueVisible) {
                    await page.click(continueSelector);
                    await page.waitForTimeout(3000);
                    
                    // 다시 URL 확인
                    const newUrl = page.url();
                    if (newUrl.includes('cart') || newUrl.includes('checkout') || 
                        newUrl.includes('carrinho') || newUrl.includes('compra')) {
                      buttonFound = true;
                      break;
                    }
                  }
                } catch (e) {
                  // 계속 진행
                }
              }
            }
          }
        }
      }
      
      if (!buttonFound) {
        throw new Error('Buy button not found');
      }
    } catch (error) {
      this.logger.error('Failed to find and click buy button:', error);
      throw error;
    }
  }
  
  /**
   * 제품 제목을 가져옵니다.
   * @returns {Promise<string>} 제품 제목
   * @private
   */
  async _getProductTitle() {
    try {
      const page = await this.browserController.getCurrentPage();
      
      for (const selector of ['.product-title', 'h1', '.title', '.product-name', '.pdp-title']) {
        try {
          const isVisible = await page.isVisible(selector, { timeout: 500 });
          if (isVisible) {
            return await page.$eval(selector, el => el.textContent.trim());
          }
        } catch (e) {
          // 다음 선택자 시도
        }
      }
      
      return 'Unknown Product';
    } catch (error) {
      this.logger.error('Failed to get product title:', error);
      return 'Unknown Product';
    }
  }
  
  /**
   * 체크아웃 단계를 여러 깊이로 분석합니다.
   * @param {number} maxDepth - 최대 분석 깊이
   * @param {boolean} detailed - 상세 분석 여부
   * @returns {Promise<object>} 체크아웃 단계 정보
   * @private
   */
  async _analyzeCheckoutSteps(maxDepth = 3, detailed = true) {
    const page = await this.browserController.getCurrentPage();
    
    // 결과 객체 초기화
    let checkoutData = {
      url: page.url(),
      title: await page.title(),
      steps: [],
      forms: [],
      buttons: []
    };
    
    try {
      // 체크아웃 페이지로 리다이렉트 여부 확인
      const currentUrl = page.url();
      
      if (!currentUrl.includes('checkout') && !currentUrl.includes('cart') && 
          !currentUrl.includes('carrinho') && !currentUrl.includes('compra')) {
        throw new Error('Not redirected to checkout or cart page');
      }
      
      // 현재 페이지 분석
      checkoutData = await this._analyzeCurrentPage(detailed);
      
      // 최대 깊이까지 다음 단계 분석
      if (maxDepth > 1) {
        let currentDepth = 1;
        let currentPageData = checkoutData;
        
        while (currentDepth < maxDepth) {
          // 다음 단계 버튼 찾기
          const nextButtonResult = await this._findAndClickNextButton();
          
          if (!nextButtonResult.success) {
            this.logger.info(`No more steps found at depth ${currentDepth}`);
            break;
          }
          
          // 페이지 전환 대기
          await page.waitForTimeout(3000);
          
          // 다음 페이지 분석
          const nextPageData = await this._analyzeCurrentPage(detailed);
          
          // 다음 단계 정보 추가
          currentPageData.nextStep = nextPageData;
          
          // 현재 페이지 업데이트
          currentPageData = nextPageData;
          currentDepth++;
        }
      }
      
      return checkoutData;
    } catch (error) {
      this.logger.error('Failed to analyze checkout steps:', error);
      return checkoutData; // 부분적으로 수집된 데이터라도 반환
    }
  }
  
  /**
   * 현재 페이지의 체크아웃 정보를 분석합니다.
   * @param {boolean} detailed - 상세 분석 여부
   * @returns {Promise<object>} 현재 페이지 정보
   * @private
   */
  async _analyzeCurrentPage(detailed = true) {
    const page = await this.browserController.getCurrentPage();
    
    try {
      // 페이지 URL 및 제목 가져오기
      const url = page.url();
      const title = await page.title();
      
      // 체크아웃 단계 구조 가져오기
      const pageStructure = await page.evaluate((detailed) => {
        // 체크아웃 단계를 나타내는 요소 찾기
        const getCheckoutSteps = () => {
          const stepsElements = document.querySelectorAll(
            '.checkout-steps, .steps, .stepper, nav.checkout-nav, .checkout-progress, .step-indicator'
          );
          let steps = [];
          
          if (stepsElements.length > 0) {
            const stepItems = stepsElements[0].querySelectorAll('li, .step, .step-item, .progress-step');
            steps = Array.from(stepItems).map(el => ({
              name: el.textContent.trim(),
              active: el.classList.contains('active') || 
                     el.getAttribute('aria-current') === 'step' ||
                     el.classList.contains('current') ||
                     el.getAttribute('data-status') === 'current'
            }));
          }
          
          return steps;
        };
        
        // 현재 폼 분석
        const analyzeForms = () => {
          const forms = document.querySelectorAll('form');
          return Array.from(forms).map(form => {
            const formFields = form.querySelectorAll('input, select, textarea');
            
            // 폼 메타데이터
            const formMeta = {
              id: form.id || null,
              name: form.getAttribute('name') || null,
              action: form.action || null,
              method: form.method || null,
              enctype: form.enctype || null,
              classes: Array.from(form.classList) || []
            };
            
            return {
              ...formMeta,
              fields: Array.from(formFields).map(field => {
                // 기본 필드 정보
                const fieldInfo = {
                  name: field.name || null,
                  id: field.id || null,
                  type: field.type || field.tagName.toLowerCase(),
                  required: field.required || field.hasAttribute('required'),
                  placeholder: field.placeholder || '',
                  value: field.value || null,
                  classes: Array.from(field.classList) || []
                };
                
                // 연관된 라벨 찾기
                let label = '';
                if (field.id) {
                  const labelElement = document.querySelector(`label[for="${field.id}"]`);
                  if (labelElement) {
                    label = labelElement.textContent.trim();
                    
                    // 자세한 분석 모드인 경우 라벨 HTML 구조도 저장
                    if (detailed) {
                      fieldInfo.labelHtml = labelElement.outerHTML;
                    }
                  }
                }
                
                fieldInfo.label = label;
                
                // 필드 유효성 검사 속성 추가
                fieldInfo.validationAttributes = {
                  pattern: field.pattern || null,
                  minLength: field.minLength || null,
                  maxLength: field.maxLength || null,
                  min: field.min || null,
                  max: field.max || null,
                  step: field.step || null
                };
                
                // select 옵션 분석
                if (field.tagName.toLowerCase() === 'select') {
                  fieldInfo.options = Array.from(field.options).map(option => ({
                    value: option.value || '',
                    text: option.textContent.trim() || '',
                    selected: option.selected || false,
                    disabled: option.disabled || false
                  }));
                }
                
                // 자세한 분석 모드인 경우 추가 정보 수집
                if (detailed) {
                  // 데이터 속성 수집
                  fieldInfo.dataAttributes = {};
                  Array.from(field.attributes)
                    .filter(attr => attr.name.startsWith('data-'))
                    .forEach(attr => {
                      fieldInfo.dataAttributes[attr.name] = attr.value;
                    });
                  
                  // ARIA 접근성 속성 수집
                  fieldInfo.ariaAttributes = {};
                  Array.from(field.attributes)
                    .filter(attr => attr.name.startsWith('aria-'))
                    .forEach(attr => {
                      fieldInfo.ariaAttributes[attr.name] = attr.value;
                    });
                  
                  // 부모 요소 관계 파악
                  try {
                    const fieldContainer = field.closest('.form-group, .input-group, .form-field, .field-container');
                    if (fieldContainer) {
                      fieldInfo.containerClasses = Array.from(fieldContainer.classList);
                      
                      // 에러 메시지 요소 찾기
                      const errorElement = fieldContainer.querySelector('.error, .form-error, .field-error');
                      if (errorElement) {
                        fieldInfo.errorElementSelector = `.${Array.from(errorElement.classList).join('.')}`;
                      }
                      
                      // 도움말 텍스트 요소 찾기
                      const helpElement = fieldContainer.querySelector('.help-text, .form-help, .field-description');
                      if (helpElement) {
                        fieldInfo.helpText = helpElement.textContent.trim();
                      }
                    }
                  } catch (e) {
                    console.error('Error analyzing field container:', e);
                  }
                }
                
                return fieldInfo;
              })
            };
          });
        };
        
        // 버튼 요소 분석
        const analyzeButtons = () => {
          const buttonElements = document.querySelectorAll(
            'button, input[type="button"], input[type="submit"], a.btn, .button, [role="button"]'
          );
          
          return Array.from(buttonElements).map(btn => {
            const buttonInfo = {
              text: btn.textContent?.trim() || btn.value || '',
              id: btn.id || null,
              name: btn.name || null,
              type: btn.type || btn.tagName.toLowerCase(),
              classes: Array.from(btn.classList) || []
            };
            
            // 자세한 분석 모드인 경우 추가 정보 수집
            if (detailed) {
              // 데이터 속성 수집
              buttonInfo.dataAttributes = {};
              Array.from(btn.attributes)
                .filter(attr => attr.name.startsWith('data-'))
                .forEach(attr => {
                  buttonInfo.dataAttributes[attr.name] = attr.value;
                });
              
              // 이벤트 리스너 감지 시도
              buttonInfo.hasClickHandler = btn.onclick !== null || btn.getAttribute('onclick') !== null;
              
              // 버튼의 위치 정보
              const rect = btn.getBoundingClientRect();
              buttonInfo.position = {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
              };
            }
            
            return buttonInfo;
          });
        };
        
        // 페이지 구조 메타데이터
        const pageMetadata = {};
        
        // 자세한 분석 모드인 경우 추가 페이지 메타데이터 수집
        if (detailed) {
          // 페이지 메타 태그 수집
          const metaTags = document.querySelectorAll('meta');
          pageMetadata.meta = Array.from(metaTags).map(meta => ({
            name: meta.name || null,
            property: meta.getAttribute('property') || null,
            content: meta.content || null
          }));
          
          // 페이지 스크립트 식별
          pageMetadata.scripts = Array.from(document.querySelectorAll('script[src]')).map(script => script.src);
          
          // 주요 컨테이너 클래스 식별
          const mainContainer = document.querySelector('#content, #main, main, .main-content');
          if (mainContainer) {
            pageMetadata.mainContainerClasses = Array.from(mainContainer.classList);
          }
        }
        
        // 현재 페이지 구조 반환
        return {
          steps: getCheckoutSteps(),
          forms: analyzeForms(),
          buttons: analyzeButtons(),
          metadata: pageMetadata
        };
      }, detailed);
      
      // 관련 스크린샷 촬영 (상세 모드인 경우)
      let screenshot = null;
      if (detailed) {
        try {
          const screenshotPath = path.join(
            this.checkoutDataDir,
            `checkout-step-${Date.now()}.png`
          );
          await page.screenshot({ path: screenshotPath });
          screenshot = screenshotPath;
        } catch (e) {
          this.logger.error('Failed to take screenshot:', e);
        }
      }
      
      // 최종 페이지 데이터 구성
      return {
        url,
        title,
        steps: pageStructure.steps || [],
        forms: pageStructure.forms || [],
        buttons: pageStructure.buttons || [],
        metadata: pageStructure.metadata || {},
        screenshot,
        capturedAt: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Failed to analyze current page:', error);
      
      // 최소한의 정보라도 반환
      return {
        url: page.url(),
        title: await page.title(),
        error: error.message,
        capturedAt: new Date().toISOString()
      };
    }
  }
  
  /**
   * 다음 단계 버튼을 찾아 클릭합니다.
   * @returns {Promise<{success: boolean, error?: string}>} 클릭 성공 여부
   * @private
   */
  async _findAndClickNextButton() {
    const page = await this.browserController.getCurrentPage();
    
    // 다음 버튼 후보 선택자들
    const nextButtonSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      '.next-step',
      '.continue',
      '.btn-next',
      '.btn-continue',
      '.proceed-button',
      'button:has-text("Continue")',
      'button:has-text("Next")',
      'button:has-text("Continuar")',
      'button:has-text("Próximo")',
      'button:has-text("Proceed")',
      '.checkout-button',
      '.place-order',
      '#checkout-button'
    ];
    
    try {
      // 각 선택자를 시도하여 다음 버튼 찾기
      for (const selector of nextButtonSelectors) {
        try {
          const isVisible = await page.isVisible(selector, { timeout: 1000 });
          
          if (isVisible) {
            this.logger.info(`Found next button using selector: ${selector}`);
            
            // 현재 URL 저장
            const beforeUrl = page.url();
            
            // 버튼 클릭
            await page.click(selector);
            await page.waitForTimeout(3000); // 페이지 전환 대기
            
            // URL 변경 확인
            const afterUrl = page.url();
            if (beforeUrl !== afterUrl) {
              this.logger.info(`Page changed after clicking next button. From ${beforeUrl} to ${afterUrl}`);
              return { success: true };
            } else {
              // URL이 변경되지 않았지만 DOM이 변경되었을 수 있음
              // 새로운 폼 필드 확인 (예: 다음 단계 패널이 표시됨)
              const formsBeforeClick = await page.$$('form');
              const fieldsBeforeClick = await page.$$('input, select, textarea');
              
              // 약간의 시간을 두고 다시 확인
              await page.waitForTimeout(1000);
              
              const formsAfterClick = await page.$$('form');
              const fieldsAfterClick = await page.$$('input, select, textarea');
              
              if (formsAfterClick.length !== formsBeforeClick.length || 
                  fieldsAfterClick.length !== fieldsBeforeClick.length) {
                this.logger.info(`DOM changed after clicking next button (same URL: ${beforeUrl})`);
                return { success: true };
              }
              
              // URL도 변경되지 않고 DOM도 변경되지 않은 경우, 다른 선택자 시도
              this.logger.debug(`No change after clicking ${selector}, trying next button selector`);
            }
          }
        } catch (error) {
          // 이 선택자로 버튼을 찾지 못함, 다음 선택자 시도
          this.logger.debug(`Next button not found or error with selector ${selector}:`, error);
        }
      }
      
      // 텍스트 기반 버튼 찾기
      this.logger.info('Trying text-based next button search');
      
      const buttonElements = await page.$$('button, a.btn, .button, input[type="button"], input[type="submit"]');
      
      for (const buttonElement of buttonElements) {
        try {
          const buttonText = await buttonElement.textContent();
          const buttonTextLower = buttonText?.toLowerCase() || '';
          
          if (buttonTextLower.includes('continue') || buttonTextLower.includes('next') || 
              buttonTextLower.includes('continuar') || buttonTextLower.includes('próximo') ||
              buttonTextLower.includes('proceed') || buttonTextLower.includes('checkout') ||
              buttonTextLower.includes('finalizar')) {
            
            this.logger.info(`Found next button with text: ${buttonText}`);
            
            // 현재 URL 저장
            const beforeUrl = page.url();
            
            // 버튼 클릭
            await buttonElement.click();
            await page.waitForTimeout(3000); // 페이지 전환 대기
            
            // URL 변경 확인
            const afterUrl = page.url();
            if (beforeUrl !== afterUrl) {
              return { success: true };
            } else {
              // DOM 변경 확인
              const formsBeforeClick = await page.$$('form');
              const fieldsBeforeClick = await page.$$('input, select, textarea');
              
              await page.waitForTimeout(1000);
              
              const formsAfterClick = await page.$$('form');
              const fieldsAfterClick = await page.$$('input, select, textarea');
              
              if (formsAfterClick.length !== formsBeforeClick.length || 
                  fieldsAfterClick.length !== fieldsBeforeClick.length) {
                return { success: true };
              }
            }
          }
        } catch (error) {
          // 다음 버튼 요소 시도
          this.logger.debug('Error processing button element:', error);
        }
      }
      
      return { success: false, error: 'No next button found or all buttons failed' };
    } catch (error) {
      this.logger.error('Failed to find and click next button:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * 제품 URL에서 제품 ID를 추출합니다.
   * @param {string} productUrl - 제품 URL
   * @returns {string} 제품 ID
   * @private
   */
  _extractProductId(productUrl) {
    try {
      // URL 객체 생성
      const url = new URL(productUrl);
      
      // 경로에서 제품 ID 추출 시도
      const pathParts = url.pathname.split('/').filter(part => part);
      
      // 마지막 경로 부분을 ID로 사용
      if (pathParts.length > 0) {
        const lastPathPart = pathParts[pathParts.length - 1];
        
        // 확장자 제거
        const idWithoutExt = lastPathPart.split('.')[0];
        
        // 쿼리 파라미터에 ID가 있는지 확인
        const params = url.searchParams;
        const idParam = params.get('id') || params.get('productId') || params.get('product_id');
        
        return idParam || idWithoutExt || 'default';
      }
      
      // 경로에서 추출할 수 없는 경우 도메인과 경로 해시 사용
      return `${url.hostname}-${Buffer.from(url.pathname).toString('base64').substring(0, 10)}`;
    } catch (error) {
      this.logger.error('Failed to extract product ID:', error);
      
      // URL 파싱에 실패한 경우 원본 URL의 해시 사용
      return `product-${Buffer.from(productUrl).toString('base64').substring(0, 16)}`;
    }
  }
  
  /**
   * 체크아웃 세션을 생성합니다.
   * @param {string} userId - 사용자 ID
   * @param {string} productId - 제품 ID
   * @returns {string} 세션 ID
   */
  createCheckoutSession(userId, productId) {
    return this.sessionManager.createSession(userId, productId);
  }
  
  /**
   * 체크아웃 세션 정보를 업데이트합니다.
   * @param {string} sessionId - 세션 ID
   * @param {object} info - 사용자 정보
   * @returns {boolean} 성공 여부
   */
  updateSessionInfo(sessionId, info) {
    return this.sessionManager.updateSessionInfo(sessionId, info);
  }
  
  /**
   * 세션의 다음 단계에 필요한 필드를 가져옵니다.
   * @param {string} sessionId - 세션 ID
   * @returns {Array} 필요한 필드 목록
   */
  getRequiredFieldsForSession(sessionId) {
    return this.sessionManager.getRequiredFieldsForCurrentStep(sessionId);
  }
  
  /**
   * 세션에서 아직 입력되지 않은 필드를 가져옵니다.
   * @param {string} sessionId - 세션 ID
   * @returns {Array} 누락된 필드 목록
   */
  getMissingFields(sessionId) {
    return this.sessionManager.getMissingRequiredFields(sessionId);
  }
  
  /**
   * 체크아웃 딥링크를 생성합니다.
   * @param {string} sessionId - 세션 ID
   * @returns {object} 딥링크 정보
   */
  generateDeeplinkFromSession(sessionId) {
    return this.sessionManager.generateDeeplink(sessionId);
  }
  
  /**
   * 사용자 정보로 체크아웃 딥링크를 직접 생성합니다.
   * @param {string} productId - 제품 ID
   * @param {object} userInfo - 사용자 정보
   * @returns {string} 체크아웃 딥링크 URL
   */
  generateDeeplink(productId, userInfo) {
    try {
      // 체크아웃 프로세스 데이터 로드
      const checkoutProcess = this.processManager.loadCheckoutProcess(productId);
      if (!checkoutProcess) {
        throw new Error('Checkout process data not available');
      }
      
      // 기본 URL 설정
      const baseUrl = checkoutProcess.url || 'https://www.lge.com/br/checkout';
      const url = new URL(baseUrl);
      const params = url.searchParams;
      
      // 사용자 정보를 URL 파라미터에 매핑
      this.fieldMappingManager.mapUserInfoToParams(checkoutProcess, userInfo, params);
      
      // 타임스탬프 추가 (캐시 방지)
      params.set('_t', Date.now().toString());
      
      // 최종 URL 반환
      return url.toString();
    } catch (error) {
      this.logger.error('Failed to generate checkout deeplink:', error);
      
      // 오류 발생 시 기본 체크아웃 URL 반환
      return 'https://www.lge.com/br/checkout';
    }
  }
  
  /**
   * 모든 저장된 체크아웃 프로세스를 가져옵니다.
   * @param {number} limit - 가져올 프로세스 수 제한
   * @returns {Array<object>} 체크아웃 프로세스 목록
   */
  getRecentCheckoutProcesses(limit = 5) {
    return this.processManager.getRecentCheckoutProcesses(limit);
  }
  
  /**
   * 체크아웃 프로세스 정보를 로드합니다.
   * @param {string} productId - 제품 ID
   * @returns {object|null} 체크아웃 프로세스 정보
   */
  loadCheckoutProcess(productId) {
    return this.processManager.loadCheckoutProcess(productId);
  }
  
  /**
   * 기본 체크아웃 프로세스 정보를 로드합니다.
   * @returns {object|null} 기본 체크아웃 프로세스 정보
   */
  loadDefaultCheckoutProcess() {
    return this.processManager.loadDefaultCheckoutProcess();
  }
}

module.exports = CheckoutAutomation;
