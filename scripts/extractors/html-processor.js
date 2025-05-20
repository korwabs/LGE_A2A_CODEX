/**
 * HTML 프로세서 - HTML 전처리 및 정제 기능 제공
 */
const logger = require('../utils/logger');
const cheerio = require('cheerio');

/**
 * HTML 프로세서 클래스
 */
class HtmlProcessor {
  /**
   * @param {object} options - 프로세서 옵션
   */
  constructor(options = {}) {
    this.logger = logger;
    this.options = {
      removeScripts: options.removeScripts !== false,
      removeStyles: options.removeStyles !== false,
      removeComments: options.removeComments !== false,
      removeIframes: options.removeIframes !== false,
      removeHiddenElements: options.removeHiddenElements !== false,
      normalizeWhitespace: options.normalizeWhitespace !== false,
      preserveImages: options.preserveImages || false,
      preserveLinks: options.preserveLinks || false,
      extractMainContent: options.extractMainContent !== false,
      ...options
    };
  }

  /**
   * HTML 문자열을 전처리합니다.
   * @param {string} html - 전처리할 HTML 문자열
   * @returns {string} 전처리된 HTML 문자열
   */
  process(html) {
    try {
      // Cheerio로 HTML 파싱
      const $ = cheerio.load(html, { decodeEntities: true });
      
      // 스크립트 제거
      if (this.options.removeScripts) {
        $('script').remove();
      }
      
      // 스타일 제거
      if (this.options.removeStyles) {
        $('style').remove();
        $('link[rel="stylesheet"]').remove();
      }
      
      // 주석 제거
      if (this.options.removeComments) {
        $.root().contents().filter(function() {
          return this.type === 'comment';
        }).remove();
      }
      
      // iframe 제거
      if (this.options.removeIframes) {
        $('iframe').remove();
      }
      
      // 숨겨진 요소 제거
      if (this.options.removeHiddenElements) {
        $('[style*="display: none"], [style*="display:none"], [hidden], [style*="visibility: hidden"], [style*="visibility:hidden"]').remove();
      }
      
      // 메인 콘텐츠 추출
      if (this.options.extractMainContent) {
        const mainContent = this._extractMainContent($);
        if (mainContent) {
          return mainContent;
        }
      }
      
      // 전처리된 HTML 반환
      let processedHtml = $.html();
      
      // 공백 정규화
      if (this.options.normalizeWhitespace) {
        processedHtml = this.normalizeWhitespace(processedHtml);
      }
      
      return processedHtml;
    } catch (error) {
      this.logger.error('HTML 전처리 실패:', error);
      return html; // 오류 발생 시 원본 HTML 반환
    }
  }

  /**
   * 메인 콘텐츠를 추출합니다.
   * @param {CheerioStatic} $ - Cheerio 인스턴스
   * @returns {string|null} 메인 콘텐츠 HTML 또는 null
   */
  _extractMainContent($) {
    // 메인 콘텐츠 후보 선택자들
    const contentSelectors = [
      'main',
      'article',
      '#content',
      '#main',
      '.content',
      '.main',
      '.post',
      '.article',
      '.product-detail',
      '.product-info',
      '.product-description'
    ];
    
    // 헤더, 푸터, 사이드바 등 제거
    $('header, footer, nav, aside').remove();
    
    // 메인 콘텐츠 선택자로 시도
    for (const selector of contentSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        return element.html();
      }
    }
    
    // 텍스트 밀도 기반 메인 콘텐츠 추출
    const mainElement = this._findMainContentByTextDensity($);
    if (mainElement && mainElement.length > 0) {
      return mainElement.html();
    }
    
    return null;
  }

  /**
   * 텍스트 밀도 기반으로 메인 콘텐츠를 찾습니다.
   * @param {CheerioStatic} $ - Cheerio 인스턴스
   * @returns {Cheerio|null} 메인 콘텐츠 요소 또는 null
   */
  _findMainContentByTextDensity($) {
    const blocks = [];
    
    // 텍스트 블록 후보 탐색
    $('div, section, article').each((i, el) => {
      const $el = $(el);
      const text = $el.text().trim();
      const textLength = text.length;
      const html = $el.html();
      const htmlLength = html.length;
      
      // 최소 텍스트 길이 필터링
      if (textLength < 100) {
        return;
      }
      
      // 텍스트 대 HTML 비율 계산
      const textDensity = htmlLength > 0 ? textLength / htmlLength : 0;
      
      blocks.push({
        element: $el,
        textLength,
        htmlLength,
        textDensity,
        // 링크 텍스트 비율 계산 (낮을수록 좋음)
        linkTextRatio: $el.find('a').text().length / (textLength || 1)
      });
    });
    
    // 텍스트 길이 기준 정렬
    blocks.sort((a, b) => {
      // 링크 비율이 높은 경우 패널티
      const aScore = a.textLength * (1 - a.linkTextRatio * 0.5);
      const bScore = b.textLength * (1 - b.linkTextRatio * 0.5);
      return bScore - aScore;
    });
    
    // 가장 텍스트가 풍부한 블록 반환
    return blocks.length > 0 ? blocks[0].element : null;
  }

  /**
   * HTML에서 공백을 정규화합니다.
   * @param {string} html - HTML 문자열
   * @returns {string} 공백이 정규화된 HTML
   */
  normalizeWhitespace(html) {
    // 연속된 공백을 단일 공백으로 변환
    html = html.replace(/\s{2,}/g, ' ');
    
    // 태그 내부의 공백 처리
    html = html.replace(/>\s+</g, '><');
    
    return html.trim();
  }

  /**
   * HTML을 마크다운으로 변환합니다.
   * @param {string} html - 변환할 HTML 문자열
   * @returns {string} 변환된 마크다운
   */
  convertToMarkdown(html) {
    try {
      // 전처리된 HTML 얻기
      const processedHtml = this.process(html);
      const $ = cheerio.load(processedHtml, { decodeEntities: true });
      
      let markdown = '';
      
      // 제목 변환
      $('h1, h2, h3, h4, h5, h6').each((i, elem) => {
        const level = elem.name.substring(1);
        const text = $(elem).text().trim();
        markdown += '#'.repeat(parseInt(level)) + ' ' + text + '\n\n';
      });
      
      // 단락 변환
      $('p').each((i, elem) => {
        markdown += $(elem).text().trim() + '\n\n';
      });
      
      // 목록 변환
      $('ul, ol').each((i, listElem) => {
        const isOrdered = listElem.name === 'ol';
        
        $(listElem).find('li').each((j, itemElem) => {
          const prefix = isOrdered ? `${j + 1}. ` : '- ';
          markdown += prefix + $(itemElem).text().trim() + '\n';
        });
        
        markdown += '\n';
      });
      
      // 링크 변환
      if (this.options.preserveLinks) {
        $('a').each((i, elem) => {
          const $elem = $(elem);
          const href = $elem.attr('href');
          const text = $elem.text().trim();
          
          if (href && text) {
            // Cheerio에서 찾은 링크를 마크다운 형식으로 대체
            $elem.replaceWith(`[${text}](${href})`);
          }
        });
      }
      
      // 이미지 변환
      if (this.options.preserveImages) {
        $('img').each((i, elem) => {
          const $elem = $(elem);
          const src = $elem.attr('src');
          const alt = $elem.attr('alt') || '';
          
          if (src) {
            // Cheerio에서 찾은 이미지를 마크다운 형식으로 대체
            $elem.replaceWith(`![${alt}](${src})`);
          }
        });
      }
      
      // 테이블 변환
      $('table').each((i, tableElem) => {
        let tableMarkdown = '\n';
        
        // 헤더 행
        const $headerRow = $(tableElem).find('thead tr').first();
        if ($headerRow.length > 0) {
          tableMarkdown += '| ';
          $headerRow.find('th').each((j, cell) => {
            tableMarkdown += $(cell).text().trim() + ' | ';
          });
          tableMarkdown += '\n| ';
          $headerRow.find('th').each(() => {
            tableMarkdown += '--- | ';
          });
          tableMarkdown += '\n';
        }
        
        // 데이터 행
        $(tableElem).find('tbody tr').each((j, rowElem) => {
          tableMarkdown += '| ';
          $(rowElem).find('td').each((k, cell) => {
            tableMarkdown += $(cell).text().trim() + ' | ';
          });
          tableMarkdown += '\n';
        });
        
        markdown += tableMarkdown + '\n';
      });
      
      // 강조 텍스트
      $('strong, b').each((i, elem) => {
        const $elem = $(elem);
        const text = $elem.text().trim();
        $elem.replaceWith(`**${text}**`);
      });
      
      // 기울임 텍스트
      $('em, i').each((i, elem) => {
        const $elem = $(elem);
        const text = $elem.text().trim();
        $elem.replaceWith(`*${text}*`);
      });
      
      // 코드 블록
      $('pre, code').each((i, elem) => {
        const $elem = $(elem);
        const text = $elem.text().trim();
        
        if (elem.name === 'pre') {
          $elem.replaceWith(`\`\`\`\n${text}\n\`\`\``);
        } else {
          $elem.replaceWith(`\`${text}\``);
        }
      });
      
      // 나머지 HTML을 텍스트로 변환
      const finalResult = markdown || $('body').text().trim();
      
      // 마크다운 정리
      return this._cleanMarkdown(finalResult);
    } catch (error) {
      this.logger.error('마크다운 변환 실패:', error);
      // 오류 발생 시 단순히 텍스트만 추출
      return this.convertToPlainText(html);
    }
  }

  /**
   * 마크다운을 정리합니다.
   * @param {string} markdown - 정리할 마크다운
   * @returns {string} 정리된 마크다운
   */
  _cleanMarkdown(markdown) {
    // 중복 줄바꿈 제거
    markdown = markdown.replace(/\n{3,}/g, '\n\n');
    
    // 빈 줄바꿈 제거
    markdown = markdown.replace(/\n[ \t]+\n/g, '\n\n');
    
    // 마크다운 토큰이 잘못 구성된 경우 수정
    markdown = markdown.replace(/\*\*\s+\*\*/g, ''); // 빈 강조 텍스트
    markdown = markdown.replace(/\*\s+\*/g, '');     // 빈 기울임 텍스트
    
    return markdown.trim();
  }

  /**
   * HTML을 일반 텍스트로 변환합니다.
   * @param {string} html - HTML 문자열
   * @returns {string} 변환된 텍스트
   */
  convertToPlainText(html) {
    try {
      // Cheerio로 HTML 파싱
      const $ = cheerio.load(html, { decodeEntities: true });
      
      // 불필요한 요소 제거
      $('script, style, meta, link, iframe, noscript').remove();
      
      // 텍스트 추출
      let text = $('body').text();
      
      // 공백 정규화
      text = text.replace(/\s{2,}/g, ' ').trim();
      
      return text;
    } catch (error) {
      this.logger.error('텍스트 변환 실패:', error);
      
      // 오류 시 단순 정규식 방식 사용
      return html
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }
  }

  /**
   * HTML에서 특정 요소만 추출합니다.
   * @param {string} html - HTML 문자열
   * @param {string} selector - CSS 선택자
   * @returns {string} 해당 요소만 추출된 HTML 문자열
   */
  extractElement(html, selector) {
    try {
      const $ = cheerio.load(html, { decodeEntities: true });
      const elements = $(selector);
      
      if (elements.length > 0) {
        return elements.map((i, el) => $.html(el)).get().join('\n');
      }
      
      this.logger.warn(`선택자 '${selector}'에 해당하는 요소를 찾을 수 없습니다.`);
      return '';
    } catch (error) {
      this.logger.error(`요소 추출 실패 (${selector}):`, error);
      return '';
    }
  }

  /**
   * 제품 정보를 추출합니다.
   * @param {string} html - HTML 문자열
   * @returns {object} 추출된 제품 정보
   */
  extractProductInfo(html) {
    try {
      const $ = cheerio.load(html, { decodeEntities: true });
      const productInfo = {};
      
      // 제품명 추출
      const titleSelectors = [
        'h1.product-title',
        '.product-name h1',
        '.product-title',
        '.product-name',
        '[itemprop="name"]',
        'h1'
      ];
      
      for (const selector of titleSelectors) {
        const title = $(selector).first().text().trim();
        if (title) {
          productInfo.title = title;
          break;
        }
      }
      
      // 가격 추출
      const priceSelectors = [
        '.product-price',
        '.price',
        '[itemprop="price"]',
        '.current-price',
        '.sale-price'
      ];
      
      for (const selector of priceSelectors) {
        const priceElem = $(selector).first();
        if (priceElem.length) {
          let price = priceElem.text().trim();
          
          // 가격에서 통화 기호와 포맷 처리
          price = price.replace(/[^\d,.]/g, '');
          productInfo.price = price;
          break;
        }
      }
      
      // 제품 이미지 추출
      const imageSelectors = [
        '.product-image img',
        '.product-img img',
        '[itemprop="image"]',
        '.product-detail-image',
        '.product-image'
      ];
      
      for (const selector of imageSelectors) {
        const img = $(selector).first();
        if (img.length) {
          productInfo.imageUrl = img.attr('src') || img.attr('data-src');
          if (productInfo.imageUrl) break;
        }
      }
      
      // 제품 설명 추출
      const descriptionSelectors = [
        '.product-description',
        '.description',
        '[itemprop="description"]',
        '.product-detail-description',
        '.product-info-description'
      ];
      
      for (const selector of descriptionSelectors) {
        const description = $(selector).first().text().trim();
        if (description) {
          productInfo.description = description;
          break;
        }
      }
      
      // 제품 SKU 또는 모델 번호 추출
      const skuSelectors = [
        '[itemprop="sku"]',
        '.product-sku',
        '.sku',
        '.model-number'
      ];
      
      for (const selector of skuSelectors) {
        const sku = $(selector).first().text().trim();
        if (sku) {
          productInfo.sku = sku;
          break;
        }
      }
      
      // 재고 상태 추출
      const stockStatusSelectors = [
        '.stock-status',
        '.inventory-status',
        '.availability',
        '[itemprop="availability"]'
      ];
      
      for (const selector of stockStatusSelectors) {
        const status = $(selector).first().text().trim();
        if (status) {
          productInfo.stockStatus = status;
          break;
        }
      }
      
      return productInfo;
    } catch (error) {
      this.logger.error('제품 정보 추출 실패:', error);
      return {};
    }
  }
}

module.exports = HtmlProcessor;
