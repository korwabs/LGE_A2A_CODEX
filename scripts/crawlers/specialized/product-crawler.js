/**
 * 제품 크롤러 - 특화된 제품 크롤링 로직 제공
 */
const { retry } = require('../../utils/retry-utils');
const { delay, rateLimit } = require('../../utils/delay-utils');
const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

/**
 * 제품 크롤러 클래스
 */
class ProductCrawler {
  /**
   * @param {object} options - 제품 크롤러 옵션
   * @param {object} options.browserController - 브라우저 컨트롤러 인스턴스
   * @param {object} options.extractor - 지능형 추출기 인스턴스
   * @param {string} options.dataDir - 데이터 저장 디렉토리
   * @param {number} options.maxRetries - 최대 재시도 횟수
   * @param {function} options.slugify - 슬러그 생성 함수
   */
  constructor(options = {}) {
    this.browserController = options.browserController;
    this.extractor = options.extractor;
    this.dataDir = options.dataDir || path.join(__dirname, '../../../data');
    this.maxRetries = options.maxRetries || 3;
    this.slugify = options.slugify || this._defaultSlugify;
    this.logger = logger;
    
    // 사이트별 셀렉터 정의
    this.selectors = {
      // LG 브라질 사이트 기본 셀렉터
      default: {
        productTitle: '.product-title, .product-name, h1, h2',
        productPrice: '.product-price, .price, .value',
        productDescription: '.product-description, .description',
        productSpecs: '.product-specs, .specs, .specifications',
        productFeatures: '.product-features, .features',
        productImages: '.product-images img, .gallery img',
        addToCartButton: '.add-to-cart, .buy-now',
        productVariants: '.variants, .options, .product-variants',
        availabilityStatus: '.availability, .stock-status, .inventory',
        relatedProducts: '.related-products, .similar-products',
        reviewSection: '.reviews, .ratings',
      },
      // 특정 제품 카테고리에 대한 커스텀 셀렉터 추가 가능
      tv: {
        productTitle: '.tv-product-name, .product-name',
        productSpecs: '.tv-specifications, .specifications',
        // 다른 커스텀 셀렉터...
      }
    };
    
    // 제품 카테고리별 추출 목표 정의
    this.extractionGoals = {
      default: "Extract detailed product information including title, price, description, specifications, features, model number, warranty, and availability",
      tv: "Extract detailed TV information including title, price, screen size, resolution, smart features, connectivity options, energy efficiency, and availability",
      refrigerator: "Extract detailed refrigerator information including title, price, capacity, dimensions, energy efficiency, features, cooling technology, and availability",
      // 다른 제품 카테고리별 추출 목표...
    };
  }
  
  /**
   * 제품 상세 정보를 크롤링합니다.
   * @param {object|string} product - 제품 정보 또는 제품 URL
   * @param {string} category - 제품 카테고리 (셀렉터 및 추출 목표 선택에 사용)
   * @param {object} options - 크롤링 옵션
   * @returns {Promise<object>} 상세 정보가 추가된 제품 정보
   */
  async crawlProductDetails(product, category = 'default', options = {}) {
    const productUrl = typeof product === 'string' ? product : product.url;
    const productTitle = typeof product === 'string' ? null : product.title;
    
    if (!productUrl) {
      this.logger.error('ProductCrawler: 제품 URL이 없음');
      throw new Error('Product URL is required');
    }
    
    this.logger.info(`ProductCrawler: 제품 크롤링 시작 - ${productTitle || productUrl}`);
    
    let result = typeof product === 'string' ? { url: product } : { ...product };
    
    try {
      await retry(async () => {
        const browser = await this.browserController.launchBrowser();
        
        try {
          // 제품 페이지 방문
          await this.browserController.executeAction('goToUrl', { url: productUrl });
          
          // 제품 상세 정보 추출
          const detailedInfo = await this._extractProductInfo(category);
          
          // 기존 제품 정보와 병합
          result = {
            ...result,
            ...detailedInfo,
            lastUpdated: new Date().toISOString()
          };
          
          // 추가 정보 수집 (옵션에 따라)
          if (options.includeReviews) {
            const reviews = await this._extractProductReviews(category);
            result.reviews = reviews;
          }
          
          if (options.includeRelatedProducts) {
            const relatedProducts = await this._extractRelatedProducts(category);
            result.relatedProducts = relatedProducts;
          }
          
          // 제품 데이터 저장 (옵션에 따라)
          if (options.saveData !== false) {
            await this.saveProductData(result);
          }
        } finally {
          // 브라우저 닫기
          await this.browserController.executeAction('closeBrowser');
        }
      }, { maxRetries: this.maxRetries });
      
      this.logger.info(`ProductCrawler: 제품 크롤링 완료 - ${result.title || productUrl}`);
      return result;
    } catch (error) {
      this.logger.error(`ProductCrawler: 제품 크롤링 실패 - ${productUrl}`, error);
      throw error;
    }
  }
  
  /**
   * 여러 제품의 상세 정보를 크롤링합니다. (병렬 처리)
   * @param {Array<object|string>} products - 제품 정보 배열 또는 URL 배열
   * @param {string} category - 제품 카테고리
   * @param {object} options - 크롤링 옵션
   * @returns {Promise<Array>} 상세 정보가 추가된 제품 배열
   */
  async crawlMultipleProducts(products, category = 'default', options = {}) {
    if (!products || products.length === 0) {
      return [];
    }
    
    const concurrency = options.concurrency || 3;
    this.logger.info(`ProductCrawler: ${products.length}개 제품 크롤링 시작 (동시성: ${concurrency})`);
    
    // 병렬 처리를 위한 제품 배치 준비
    const batches = this._prepareBatches(products, concurrency);
    const result = [];
    
    // 각 배치 처리
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      this.logger.info(`ProductCrawler: 배치 처리 중 ${i + 1}/${batches.length} (${batch.length} 제품)`);
      
      const batchPromises = batch.map(product => 
        this.crawlProductDetails(product, category, { ...options, saveData: false })
      );
      
      // 병렬로 배치 처리
      try {
        const batchResults = await Promise.allSettled(batchPromises);
        
        // 결과 처리
        for (let j = 0; j < batchResults.length; j++) {
          const batchResult = batchResults[j];
          if (batchResult.status === 'fulfilled') {
            result.push(batchResult.value);
            
            // 성공한 결과 저장 (옵션에 따라)
            if (options.saveData !== false) {
              await this.saveProductData(batchResult.value);
            }
          } else {
            this.logger.warn(`ProductCrawler: 제품 크롤링 실패 - ${typeof batch[j] === 'string' ? batch[j] : batch[j].url}`);
            
            // 실패한 경우 기본 정보만 포함
            if (typeof batch[j] === 'object' && batch[j] !== null) {
              result.push({
                ...batch[j],
                crawlingError: batchResult.reason.message,
                lastUpdated: new Date().toISOString()
              });
            }
          }
        }
      } catch (error) {
        this.logger.error(`ProductCrawler: 배치 처리 실패 - 배치 ${i + 1}`, error);
      }
      
      // 배치 간 지연 (서버 부하 방지)
      if (i < batches.length - 1) {
        await delay(3000);
      }
    }
    
    this.logger.info(`ProductCrawler: ${result.length}개 제품 크롤링 완료`);
    return result;
  }
  
  /**
   * 제품 정보를 추출합니다.
   * @param {string} category - 제품 카테고리
   * @returns {Promise<object>} 추출된 제품 정보
   * @private
   */
  async _extractProductInfo(category = 'default') {
    const page = await this.browserController.getCurrentPage();
    const html = await page.content();
    const selectors = this.selectors[category] || this.selectors.default;
    
    // LLM 추출 시도
    try {
      const extractionGoal = this.extractionGoals[category] || this.extractionGoals.default;
      const extractedData = await this.extractor.extractContent(html, extractionGoal);
      
      if (extractedData && typeof extractedData === 'object' && Object.keys(extractedData).length > 0) {
        this.logger.debug(`ProductCrawler: LLM 추출 성공`);
        return {
          ...extractedData,
          extractionMethod: 'llm'
        };
      }
    } catch (error) {
      this.logger.warn('ProductCrawler: LLM 추출 실패, DOM 추출로 대체', error);
    }
    
    // LLM 추출 실패 시 DOM 추출
    try {
      const productInfo = await page.evaluate((sel) => {
        // 제품 기본 정보 추출
        const titleElement = document.querySelector(sel.productTitle);
        const priceElement = document.querySelector(sel.productPrice);
        const descriptionElement = document.querySelector(sel.productDescription);
        const availabilityElement = document.querySelector(sel.availabilityStatus);
        
        // 제품 이미지 URL 추출
        const imageElements = document.querySelectorAll(sel.productImages);
        const images = Array.from(imageElements).map(img => img.src).filter(Boolean);
        
        // 제품 스펙 추출
        const specsElements = document.querySelectorAll(sel.productSpecs);
        const specs = {};
        
        specsElements.forEach(element => {
          // 테이블 형식 스펙 처리
          const specRows = element.querySelectorAll('tr');
          if (specRows.length > 0) {
            specRows.forEach(row => {
              const label = row.querySelector('th, td:first-child');
              const value = row.querySelector('td:last-child, td:nth-child(2)');
              
              if (label && value) {
                specs[label.textContent.trim()] = value.textContent.trim();
              }
            });
          } else {
            // 리스트 형식 스펙 처리
            const specItems = element.querySelectorAll('li, .spec-item');
            
            specItems.forEach(item => {
              const text = item.textContent.trim();
              const labelValueMatch = text.match(/^([^:]+):\s*(.+)$/);
              
              if (labelValueMatch) {
                specs[labelValueMatch[1].trim()] = labelValueMatch[2].trim();
              } else {
                // 키-값 구조가 아닌 경우 단순 항목으로 추가
                specs[`item_${Object.keys(specs).length + 1}`] = text;
              }
            });
          }
        });
        
        // 제품 특징 추출
        const featuresElement = document.querySelector(sel.productFeatures);
        const features = [];
        
        if (featuresElement) {
          const featureItems = featuresElement.querySelectorAll('li, .feature-item, p');
          featureItems.forEach(item => {
            const text = item.textContent.trim();
            if (text) {
              features.push(text);
            }
          });
        }
        
        // 제품 변형 옵션 추출
        const variantsElement = document.querySelector(sel.productVariants);
        const variants = [];
        
        if (variantsElement) {
          // 색상, 크기 등의 옵션 추출
          const optionGroups = variantsElement.querySelectorAll('.option-group, fieldset');
          
          optionGroups.forEach(group => {
            const groupTitle = group.querySelector('legend, .option-title');
            const optionItems = group.querySelectorAll('option, .option-item');
            
            const options = Array.from(optionItems).map(opt => opt.textContent.trim()).filter(Boolean);
            
            if (groupTitle && options.length > 0) {
              variants.push({
                name: groupTitle.textContent.trim(),
                options
              });
            }
          });
        }
        
        // 제품 정보 병합 및 반환
        return {
          title: titleElement ? titleElement.textContent.trim() : null,
          price: priceElement ? priceElement.textContent.trim() : null,
          description: descriptionElement ? descriptionElement.textContent.trim() : null,
          availability: availabilityElement ? availabilityElement.textContent.trim() : null,
          images,
          specs,
          features: features.length > 0 ? features : null,
          variants: variants.length > 0 ? variants : null,
          extractionMethod: 'dom'
        };
      }, selectors);
      
      return productInfo;
    } catch (error) {
      this.logger.error('ProductCrawler: DOM 추출 실패', error);
      return {}; // 빈 객체 반환
    }
  }
  
  /**
   * 제품 리뷰를 추출합니다.
   * @param {string} category - 제품 카테고리
   * @returns {Promise<Array>} 추출된 리뷰
   * @private
   */
  async _extractProductReviews(category = 'default') {
    const page = await this.browserController.getCurrentPage();
    const selectors = this.selectors[category] || this.selectors.default;
    
    try {
      // 리뷰 섹션 확인
      const reviewSectionExists = await page.evaluate((reviewSelector) => {
        return !!document.querySelector(reviewSelector);
      }, selectors.reviewSection);
      
      if (!reviewSectionExists) {
        return null;
      }
      
      // 리뷰 추출
      return await page.evaluate((reviewSelector) => {
        const reviewSection = document.querySelector(reviewSelector);
        const reviewItems = reviewSection.querySelectorAll('.review-item, .review, .comment');
        
        return Array.from(reviewItems).map(reviewItem => {
          const authorElement = reviewItem.querySelector('.author, .reviewer, .user');
          const dateElement = reviewItem.querySelector('.date, .review-date, .time');
          const ratingElement = reviewItem.querySelector('.rating, .stars, .score');
          const textElement = reviewItem.querySelector('.text, .content, .description');
          
          return {
            author: authorElement ? authorElement.textContent.trim() : 'Anonymous',
            date: dateElement ? dateElement.textContent.trim() : null,
            rating: ratingElement ? this._parseRating(ratingElement) : null,
            text: textElement ? textElement.textContent.trim() : null
          };
        });
      }, selectors.reviewSection);
    } catch (error) {
      this.logger.warn('ProductCrawler: 리뷰 추출 실패', error);
      return null;
    }
  }
  
  /**
   * 관련 제품을 추출합니다.
   * @param {string} category - 제품 카테고리
   * @returns {Promise<Array>} 추출된 관련 제품
   * @private
   */
  async _extractRelatedProducts(category = 'default') {
    const page = await this.browserController.getCurrentPage();
    const selectors = this.selectors[category] || this.selectors.default;
    
    try {
      // 관련 제품 섹션 확인
      const relatedProductsExist = await page.evaluate((relatedProductsSelector) => {
        return !!document.querySelector(relatedProductsSelector);
      }, selectors.relatedProducts);
      
      if (!relatedProductsExist) {
        return null;
      }
      
      // 관련 제품 추출
      return await page.evaluate((relatedProductsSelector) => {
        const relatedProductsSection = document.querySelector(relatedProductsSelector);
        const productItems = relatedProductsSection.querySelectorAll('.product-item, .product-card, .product');
        
        return Array.from(productItems).map(productItem => {
          const titleElement = productItem.querySelector('.product-title, .product-name, h3, h4');
          const priceElement = productItem.querySelector('.product-price, .price, .value');
          const linkElement = productItem.querySelector('a');
          const imageElement = productItem.querySelector('img');
          
          return {
            title: titleElement ? titleElement.textContent.trim() : null,
            price: priceElement ? priceElement.textContent.trim() : null,
            url: linkElement ? linkElement.href : null,
            imageUrl: imageElement ? imageElement.src : null
          };
        }).filter(product => product.url && product.title);
      }, selectors.relatedProducts);
    } catch (error) {
      this.logger.warn('ProductCrawler: 관련 제품 추출 실패', error);
      return null;
    }
  }
  
  /**
   * 제품 가격 및 재고 정보를 업데이트합니다.
   * @param {object} product - 제품 정보
   * @param {string} category - 제품 카테고리
   * @returns {Promise<object>} 업데이트 결과
   */
  async updateProductInfo(product, category = 'default') {
    if (!product || !product.url) {
      return { updated: false, error: 'No URL provided' };
    }
    
    try {
      // 속도 제한 적용
      const updateFn = rateLimit(async () => {
        const browser = await this.browserController.launchBrowser();
        
        try {
          // 제품 페이지 방문
          await this.browserController.executeAction('goToUrl', { url: product.url });
          
          // 가격 및 재고 정보 추출
          const page = await this.browserController.getCurrentPage();
          const selectors = this.selectors[category] || this.selectors.default;
          
          const newInfo = await page.evaluate((sel) => {
            const priceElement = document.querySelector(sel.productPrice);
            const availabilityElement = document.querySelector(sel.availabilityStatus);
            
            return {
              price: priceElement ? priceElement.textContent.trim() : null,
              availability: availabilityElement ? availabilityElement.textContent.trim() : null
            };
          }, selectors);
          
          // 변경 사항 확인
          const priceChanged = newInfo.price !== null && newInfo.price !== product.price;
          const availabilityChanged = newInfo.availability !== null && newInfo.availability !== product.availability;
          
          if (priceChanged || availabilityChanged) {
            // 업데이트된 제품 정보
            const updatedProduct = {
              ...product,
              price: newInfo.price || product.price,
              availability: newInfo.availability || product.availability,
              lastUpdated: new Date().toISOString()
            };
            
            // 변경 사항 저장
            await this.saveProductData(updatedProduct);
            
            if (priceChanged) {
              this.logger.info(`ProductCrawler: 가격 업데이트 - ${product.title}: ${product.price} → ${newInfo.price}`);
            }
            
            if (availabilityChanged) {
              this.logger.info(`ProductCrawler: 재고 상태 업데이트 - ${product.title}: ${product.availability} → ${newInfo.availability}`);
            }
            
            return { updated: true, product: updatedProduct };
          }
          
          return { updated: false };
        } finally {
          // 브라우저 닫기
          await this.browserController.executeAction('closeBrowser');
        }
      }, 5000); // 5초당 최대 1개 요청
      
      return await updateFn();
    } catch (error) {
      this.logger.error(`ProductCrawler: 제품 정보 업데이트 실패 - ${product.title}`, error);
      return { updated: false, error: error.message };
    }
  }
  
  /**
   * 제품 데이터를 저장합니다.
   * @param {object} product - 제품 정보
   */
  async saveProductData(product) {
    try {
      if (!product || !product.url) return;
      
      const productId = product.id || this.slugify(product.title || 'product');
      const filePath = path.join(this.dataDir, `product_${productId}.json`);
      
      const data = {
        ...product,
        lastUpdated: new Date().toISOString()
      };
      
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      this.logger.debug(`ProductCrawler: 제품 데이터 저장 완료 - ${filePath}`);
    } catch (error) {
      this.logger.error('ProductCrawler: 제품 데이터 저장 실패', error);
    }
  }
  
  /**
   * 별점 요소에서 평점을 추출합니다.
   * @param {Element} ratingElement - 별점 요소
   * @returns {number|null} 추출된 평점
   * @private
   */
  _parseRating(ratingElement) {
    // 여러 평점 형식 처리
    
    // 텍스트에서 숫자 추출 (예: "4.5 out of 5")
    const textRating = ratingElement.textContent.trim();
    const ratingMatch = textRating.match(/(\d+(\.\d+)?)/);
    
    if (ratingMatch) {
      return parseFloat(ratingMatch[1]);
    }
    
    // 스타일 속성에서 너비 추출 (예: style="width: 90%")
    if (ratingElement.style && ratingElement.style.width) {
      const widthMatch = ratingElement.style.width.match(/(\d+)%/);
      if (widthMatch) {
        return parseFloat(widthMatch[1]) / 20; // 100% = 5점으로 변환
      }
    }
    
    // 클래스 이름에서 추출 (예: "stars-4", "rating-3-5")
    const classes = Array.from(ratingElement.classList);
    
    for (const className of classes) {
      const classRatingMatch = className.match(/stars?-(\d+)(?:-(\d+))?|rating-(\d+)(?:-(\d+))?/);
      if (classRatingMatch) {
        if (classRatingMatch[2]) {
          // "stars-3-5", "rating-3-5" 형식
          return parseFloat(`${classRatingMatch[1]}.${classRatingMatch[2]}`);
        } else if (classRatingMatch[1]) {
          // "stars-4", "rating-4" 형식
          return parseFloat(classRatingMatch[1]);
        }
      }
    }
    
    return null;
  }
  
  /**
   * 배치 처리를 위해 아이템을 분할합니다.
   * @param {Array} items - 분할할 아이템 배열
   * @param {number} batchSize - 배치 크기
   * @returns {Array<Array>} 배치 배열
   * @private
   */
  _prepareBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }
  
  /**
   * 기본 슬러그 생성 함수
   * @param {string} str - 변환할 문자열
   * @returns {string} 슬러그
   * @private
   */
  _defaultSlugify(str) {
    return str
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50); // 최대 50자로 제한
  }
}

module.exports = ProductCrawler;