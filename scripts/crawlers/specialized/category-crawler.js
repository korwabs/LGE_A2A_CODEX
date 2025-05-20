/**
 * 카테고리 크롤러 - 특화된 카테고리 크롤링 로직 제공
 */
const { retry } = require('../../utils/retry-utils');
const { delay } = require('../../utils/delay-utils');
const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

/**
 * 카테고리 크롤러 클래스
 */
class CategoryCrawler {
  /**
   * @param {object} options - 카테고리 크롤러 옵션
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
        productItem: '.product-item, .product-card, .product',
        productTitle: '.product-title, .product-name, h3, h4',
        productPrice: '.product-price, .price, .value',
        productLink: 'a',
        productImage: 'img',
        pagination: '.pagination',
        nextPage: '.pagination .next, .pagination [aria-label="Next"]',
        categoryFilter: '.category-filter, .filters',
        sortDropdown: '.sort-dropdown, .sort-options',
      },
      // 특정 카테고리나 페이지 타입에 대한 커스텀 셀렉터 추가 가능
      tv: {
        productItem: '.tv-product-item, .product-item',
        productTitle: '.tv-product-name, .product-name',
        // 다른 커스텀 셀렉터...
      }
    };
  }
  
  /**
   * 카테고리를 크롤링합니다.
   * @param {object} category - 카테고리 정보
   * @param {string} category.url - 카테고리 URL
   * @param {string} category.name - 카테고리 이름
   * @param {string} category.type - 카테고리 타입 (셀렉터 선택에 사용)
   * @param {object} options - 크롤링 옵션
   * @returns {Promise<Array>} 카테고리 내 제품 목록
   */
  async crawlCategory(category, options = {}) {
    this.logger.info(`CategoryCrawler: 크롤링 시작 - ${category.name || category.url}`);
    
    try {
      const products = [];
      const limit = options.limit || 30; // 최대 제품 수
      const browser = await this.browserController.launchBrowser();
      
      try {
        // 카테고리 페이지 방문
        await retry(async () => {
          await this.browserController.executeAction('goToUrl', { url: category.url });
        }, { maxRetries: this.maxRetries });
        
        // 필터 및 정렬 옵션 적용 (옵션이 제공된 경우)
        if (options.filters) {
          await this._applyFilters(options.filters, category.type);
        }
        
        if (options.sort) {
          await this._applySort(options.sort, category.type);
        }
        
        // 페이지네이션 처리 (필요한 경우)
        let currentPage = 1;
        let maxPages = options.maxPages || 3;
        let hasNextPage = true;
        
        while (hasNextPage && currentPage <= maxPages && products.length < limit) {
          this.logger.info(`CategoryCrawler: 크롤링 중 - 페이지 ${currentPage}/${maxPages}`);
          
          // 페이지 제품 추출
          const pageProducts = await this._extractProductsFromCurrentPage(category.type);
          products.push(...pageProducts);
          
          // 다음 페이지 이동 (있는 경우)
          if (currentPage < maxPages && products.length < limit) {
            hasNextPage = await this._goToNextPage(category.type);
            if (hasNextPage) {
              currentPage++;
              // 페이지 로드 대기
              await delay(2000);
            }
          } else {
            hasNextPage = false;
          }
        }
        
        // 제품 수 제한
        const limitedProducts = products.slice(0, limit);
        
        // 데이터 저장 (옵션에 따라)
        if (options.saveData !== false) {
          await this.saveCategoryData(category, limitedProducts);
        }
        
        this.logger.info(`CategoryCrawler: 크롤링 완료 - ${limitedProducts.length} 제품 발견`);
        return limitedProducts;
      } finally {
        // 브라우저 닫기
        await this.browserController.executeAction('closeBrowser');
      }
    } catch (error) {
      this.logger.error(`CategoryCrawler: 크롤링 실패 - ${category.url}`, error);
      throw error;
    }
  }
  
  /**
   * 현재 페이지에서 제품 정보를 추출합니다.
   * @param {string} categoryType - 카테고리 타입
   * @returns {Promise<Array>} 제품 목록
   * @private
   */
  async _extractProductsFromCurrentPage(categoryType = 'default') {
    // 셀렉터 선택 
    const selectors = this.selectors[categoryType] || this.selectors.default;
    
    // 현재 페이지 컨텐츠 가져오기
    const page = await this.browserController.getCurrentPage();
    const html = await page.content();
    
    // LLM 추출 시도
    try {
      const extractionGoal = "Extract all product information including names, prices, URLs, images, specs and availability";
      const extractedData = await this.extractor.extractContent(html, extractionGoal);
      
      if (extractedData.products && Array.isArray(extractedData.products) && extractedData.products.length > 0) {
        this.logger.debug(`CategoryCrawler: LLM을 통해 ${extractedData.products.length} 제품 추출 성공`);
        return extractedData.products.map(product => ({
          ...product,
          extractionMethod: 'llm'
        }));
      }
    } catch (error) {
      this.logger.warn('CategoryCrawler: LLM 추출 실패, DOM 추출로 대체', error);
    }
    
    // LLM 추출 실패 시 DOM 추출
    try {
      const products = await page.evaluate((sel) => {
        const productElements = document.querySelectorAll(sel.productItem);
        
        return Array.from(productElements).map(element => {
          const titleElement = element.querySelector(sel.productTitle);
          const priceElement = element.querySelector(sel.productPrice);
          const linkElement = element.querySelector(sel.productLink);
          const imageElement = element.querySelector(sel.productImage);
          
          // 제품 스펙 정보 추출 시도
          const specsElements = element.querySelectorAll('.product-spec, .specs, .features, .details');
          const specs = Array.from(specsElements).map(spec => spec.textContent.trim()).filter(Boolean);
          
          // 제품 가용성 정보 추출 시도
          const availabilityElement = element.querySelector('.availability, .stock-status, .inventory');
          
          return {
            title: titleElement ? titleElement.textContent.trim() : 'Unknown product',
            price: priceElement ? priceElement.textContent.trim() : null,
            url: linkElement ? linkElement.href : null,
            imageUrl: imageElement ? imageElement.src : null,
            specs: specs.length > 0 ? specs : null,
            availability: availabilityElement ? availabilityElement.textContent.trim() : null,
            extractionMethod: 'dom'
          };
        }).filter(product => product.url);
      }, selectors);
      
      this.logger.debug(`CategoryCrawler: DOM에서 ${products.length} 제품 추출 성공`);
      return products;
    } catch (error) {
      this.logger.error('CategoryCrawler: DOM 추출 실패', error);
      return []; // 빈 배열 반환
    }
  }
  
  /**
   * 다음 페이지로 이동합니다.
   * @param {string} categoryType - 카테고리 타입
   * @returns {Promise<boolean>} 다음 페이지로 이동 성공 여부
   * @private
   */
  async _goToNextPage(categoryType = 'default') {
    const selectors = this.selectors[categoryType] || this.selectors.default;
    const page = await this.browserController.getCurrentPage();
    
    try {
      // 다음 페이지 버튼 확인
      const nextPageExists = await page.evaluate((nextPageSelector) => {
        const nextPageButton = document.querySelector(nextPageSelector);
        return nextPageButton && !nextPageButton.disabled;
      }, selectors.nextPage);
      
      if (!nextPageExists) {
        return false;
      }
      
      // 현재 URL 저장
      const currentUrl = await page.url();
      
      // 다음 페이지 버튼 클릭
      await page.click(selectors.nextPage);
      
      // 페이지 변경 확인 (URL 또는 내용 변경)
      await Promise.race([
        page.waitForNavigation({ timeout: 5000 }).catch(() => null),
        new Promise(resolve => setTimeout(resolve, 5000))
      ]);
      
      const newUrl = await page.url();
      
      // URL이 변경되었는지 확인
      if (newUrl !== currentUrl) {
        return true;
      }
      
      // URL 변경이 없으면 페이지 내용이 변경되었는지 확인
      const contentChanged = await page.evaluate(() => {
        // 페이지 변경을 나타내는 요소 변경 확인
        // (예: 활성 페이지 번호, 결과 카운터 등)
        return true; // 실제 구현에서는 페이지 특성에 맞게 변경 필요
      });
      
      return contentChanged;
    } catch (error) {
      this.logger.warn('CategoryCrawler: 다음 페이지 이동 실패', error);
      return false;
    }
  }
  
  /**
   * 제공된 필터를 적용합니다.
   * @param {object} filters - 적용할 필터
   * @param {string} categoryType - 카테고리 타입
   * @returns {Promise<void>}
   * @private
   */
  async _applyFilters(filters, categoryType = 'default') {
    if (!filters || Object.keys(filters).length === 0) {
      return;
    }
    
    this.logger.debug(`CategoryCrawler: 필터 적용 시도`, filters);
    
    const page = await this.browserController.getCurrentPage();
    const selectors = this.selectors[categoryType] || this.selectors.default;
    
    // 필터 컨테이너 확인
    const filterExists = await page.evaluate((filterSelector) => {
      return !!document.querySelector(filterSelector);
    }, selectors.categoryFilter);
    
    if (!filterExists) {
      this.logger.warn('CategoryCrawler: 필터 요소를 찾을 수 없음');
      return;
    }
    
    // 필터 적용
    for (const [filterName, filterValue] of Object.entries(filters)) {
      try {
        await page.evaluate((name, value) => {
          // 필터 이름으로 요소 찾기
          const filterElements = Array.from(document.querySelectorAll('label, input, select, button'))
            .filter(el => el.textContent.toLowerCase().includes(name.toLowerCase()) || 
                           el.id.toLowerCase().includes(name.toLowerCase()) ||
                           el.name.toLowerCase().includes(name.toLowerCase()));
          
          if (filterElements.length > 0) {
            const filterElement = filterElements[0];
            
            // 요소 유형에 따라 다른 처리
            if (filterElement.tagName === 'SELECT') {
              // 셀렉트 박스
              const option = Array.from(filterElement.options)
                .find(opt => opt.textContent.toLowerCase().includes(value.toLowerCase()));
              
              if (option) {
                filterElement.value = option.value;
                filterElement.dispatchEvent(new Event('change'));
              }
            } else if (filterElement.tagName === 'INPUT' && 
                      (filterElement.type === 'checkbox' || filterElement.type === 'radio')) {
              // 체크박스/라디오
              filterElement.checked = true;
              filterElement.dispatchEvent(new Event('change'));
            } else if (filterElement.tagName === 'LABEL') {
              // 라벨 (체크박스/라디오의 라벨일 가능성 있음)
              filterElement.click();
            } else {
              // 기타 클릭 가능한 요소
              filterElement.click();
            }
          }
        }, filterName, filterValue);
        
        // 필터 적용 후 잠시 대기
        await delay(1000);
      } catch (error) {
        this.logger.warn(`CategoryCrawler: '${filterName}' 필터 적용 실패`, error);
      }
    }
    
    // 필터 적용 후 페이지 로딩 대기
    await delay(2000);
    this.logger.debug('CategoryCrawler: 필터 적용 완료');
  }
  
  /**
   * 정렬 옵션을 적용합니다.
   * @param {string} sortOption - 적용할 정렬 옵션
   * @param {string} categoryType - 카테고리 타입
   * @returns {Promise<void>}
   * @private
   */
  async _applySort(sortOption, categoryType = 'default') {
    if (!sortOption) {
      return;
    }
    
    this.logger.debug(`CategoryCrawler: 정렬 적용 시도 - ${sortOption}`);
    
    const page = await this.browserController.getCurrentPage();
    const selectors = this.selectors[categoryType] || this.selectors.default;
    
    // 정렬 드롭다운 확인
    const sortExists = await page.evaluate((sortSelector) => {
      return !!document.querySelector(sortSelector);
    }, selectors.sortDropdown);
    
    if (!sortExists) {
      this.logger.warn('CategoryCrawler: 정렬 요소를 찾을 수 없음');
      return;
    }
    
    // 정렬 적용
    try {
      await page.evaluate((sortDropdownSelector, option) => {
        const sortDropdown = document.querySelector(sortDropdownSelector);
        
        if (sortDropdown.tagName === 'SELECT') {
          // 셀렉트 박스인 경우
          const sortOption = Array.from(sortDropdown.options)
            .find(opt => opt.textContent.toLowerCase().includes(option.toLowerCase()));
          
          if (sortOption) {
            sortDropdown.value = sortOption.value;
            sortDropdown.dispatchEvent(new Event('change'));
          }
        } else {
          // 드롭다운 버튼인 경우
          sortDropdown.click();
          
          // 드롭다운 메뉴 항목 찾기
          setTimeout(() => {
            const menuItems = document.querySelectorAll('.dropdown-menu li, .sort-options li, .sort-dropdown-options li');
            const targetOption = Array.from(menuItems)
              .find(item => item.textContent.toLowerCase().includes(option.toLowerCase()));
            
            if (targetOption) {
              targetOption.click();
            }
          }, 500);
        }
      }, selectors.sortDropdown, sortOption);
      
      // 정렬 적용 후 페이지 로딩 대기
      await delay(2000);
      this.logger.debug('CategoryCrawler: 정렬 적용 완료');
    } catch (error) {
      this.logger.warn(`CategoryCrawler: 정렬 적용 실패 - ${sortOption}`, error);
    }
  }
  
  /**
   * 카테고리 데이터를 저장합니다.
   * @param {object} category - 카테고리 정보
   * @param {Array} products - 제품 목록
   * @returns {Promise<void>}
   */
  async saveCategoryData(category, products) {
    try {
      const categoryId = category.id || this.slugify(category.name || 'category');
      const filePath = path.join(this.dataDir, `category_${categoryId}.json`);
      
      const data = {
        category,
        products,
        timestamp: new Date().toISOString()
      };
      
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      this.logger.debug(`CategoryCrawler: 카테고리 데이터 저장 완료 - ${filePath}`);
    } catch (error) {
      this.logger.error('CategoryCrawler: 카테고리 데이터 저장 실패', error);
    }
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

module.exports = CategoryCrawler;