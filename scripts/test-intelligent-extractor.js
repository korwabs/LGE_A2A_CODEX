/**
 * 지능형 컨텐츠 추출기 테스트 스크립트
 */
const IntelligentExtractor = require('./extractors/intelligent-extractor');
const HtmlProcessor = require('./extractors/html-processor');
const logger = require('./utils/logger');
const path = require('path');
const fs = require('fs');

// 테스트 설정
const TEST_URL = process.argv[2] || 'https://www.lge.com/br/refrigeradores/lg-GR-X228NMSM';
const OUTPUT_DIR = path.join(__dirname, '../data/test-extractions');

// 디렉토리 생성
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * HTML 파일을 로드합니다.
 * @param {string} filePath - HTML 파일 경로
 * @returns {Promise<string>} HTML 내용
 */
async function loadHtmlFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * URL에서 HTML을 가져옵니다.
 * @param {string} url - 가져올 URL
 * @returns {Promise<string>} HTML 내용
 */
async function fetchHtml(url) {
  try {
    const { chromium } = require('playwright');
    logger.info(`Fetching HTML from ${url}`);
    
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    
    // HTML 가져오기
    const html = await page.content();
    
    await browser.close();
    
    // 파일로 저장
    const outputFile = path.join(OUTPUT_DIR, 'fetched-page.html');
    fs.writeFileSync(outputFile, html, 'utf8');
    logger.info(`Saved HTML to ${outputFile}`);
    
    return html;
  } catch (error) {
    logger.error(`Failed to fetch HTML: ${error.message}`);
    throw error;
  }
}

/**
 * 추출 테스트를 실행합니다.
 */
async function runExtractionTest() {
  try {
    logger.info('Starting intelligent extraction test');
    
    // HTML 가져오기
    let html;
    if (TEST_URL.startsWith('http')) {
      html = await fetchHtml(TEST_URL);
    } else {
      html = await loadHtmlFile(TEST_URL);
    }
    
    // 인스턴스 생성
    const htmlProcessor = new HtmlProcessor({
      preserveImages: true,
      preserveLinks: true,
      extractMainContent: true
    });
    
    const extractor = new IntelligentExtractor({
      chunkSize: 4000,
      maxParallelChunks: 2,
      llmProvider: 'google',
      llmModel: 'gemini-pro',
      useCache: true
    });
    
    // HTML 전처리
    logger.info('Processing HTML...');
    const processedHtml = htmlProcessor.process(html);
    
    // 마크다운 변환
    logger.info('Converting to markdown...');
    const markdown = htmlProcessor.convertToMarkdown(html);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'converted.md'), markdown, 'utf8');
    
    // 제품 정보 직접 추출 (HTML 파서 기반)
    logger.info('Extracting product info using HTML processor...');
    const basicProductInfo = htmlProcessor.extractProductInfo(html);
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'basic-product-info.json'), 
      JSON.stringify(basicProductInfo, null, 2), 
      'utf8'
    );
    
    // LLM 기반 제품 정보 추출
    logger.info('Extracting product info using intelligent extractor...');
    const productInfo = await extractor.extractProductInfo(html);
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'product-info.json'), 
      JSON.stringify(productInfo, null, 2), 
      'utf8'
    );
    
    // 제품 리뷰 추출
    logger.info('Extracting product reviews...');
    try {
      const reviewInfo = await extractor.extractProductReviews(html);
      fs.writeFileSync(
        path.join(OUTPUT_DIR, 'product-reviews.json'), 
        JSON.stringify(reviewInfo, null, 2), 
        'utf8'
      );
    } catch (error) {
      logger.warn(`Review extraction failed: ${error.message}`);
    }
    
    // 체크아웃 프로세스 추출
    logger.info('Extracting checkout process...');
    try {
      const checkoutProcess = await extractor.extractCheckoutProcess(html);
      fs.writeFileSync(
        path.join(OUTPUT_DIR, 'checkout-process.json'), 
        JSON.stringify(checkoutProcess, null, 2), 
        'utf8'
      );
    } catch (error) {
      logger.warn(`Checkout process extraction failed: ${error.message}`);
    }
    
    // 사용자 정의 추출
    logger.info('Performing custom extraction...');
    try {
      const customExtraction = await extractor.extractContent(
        html,
        "Extract all technical specifications, dimensions, energy efficiency information, and available color options for this refrigerator.",
        {
          schema: {
            "type": "object",
            "properties": {
              "technicalSpecs": {
                "type": "object",
                "additionalProperties": true
              },
              "dimensions": {
                "type": "object",
                "properties": {
                  "height": { "type": ["string", "number", "null"] },
                  "width": { "type": ["string", "number", "null"] },
                  "depth": { "type": ["string", "number", "null"] }
                }
              },
              "energyInfo": {
                "type": "object",
                "additionalProperties": true
              },
              "colorOptions": {
                "type": "array",
                "items": { "type": "string" }
              }
            }
          }
        }
      );
      
      fs.writeFileSync(
        path.join(OUTPUT_DIR, 'custom-extraction.json'), 
        JSON.stringify(customExtraction, null, 2), 
        'utf8'
      );
    } catch (error) {
      logger.warn(`Custom extraction failed: ${error.message}`);
    }
    
    logger.info('Extraction test completed successfully');
    logger.info(`Results saved to ${OUTPUT_DIR}`);
  } catch (error) {
    logger.error(`Extraction test failed: ${error.message}`);
    process.exit(1);
  }
}

// 테스트 실행
runExtractionTest();
