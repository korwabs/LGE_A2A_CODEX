const { expect } = require('@jest/globals');
const IntelligentExtractor = require('../../scripts/extractors/intelligent-extractor');
const fs = require('fs');
const path = require('path');
const Logger = require('../../scripts/utils/logger');
const config = require('../../config/default-config');

// 테스트 HTML 파일 경로
const TEST_HTML_FILE = path.join(__dirname, '../fixtures/product-page-sample.html');

describe('지능형 컨텐츠 추출기 통합 테스트', () => {
  let extractor;
  let htmlContent;

  beforeAll(() => {
    const testConfig = config.test || {};
    // 로깅 레벨 설정
    Logger.setLevel(testConfig.logLevel || 'error');
    
    // HTML 샘플 파일이 존재하지 않는 경우 테스트 스킵
    if (!fs.existsSync(TEST_HTML_FILE)) {
      console.warn(`테스트 HTML 파일을 찾을 수 없습니다: ${TEST_HTML_FILE}`);
      return;
    }
    
    // HTML 파일 로드
    htmlContent = fs.readFileSync(TEST_HTML_FILE, 'utf8');
    
    // 추출기 인스턴스 생성
    extractor = new IntelligentExtractor({
      chunkSize: 3000,
      llmProvider: 'gemini-mock', // 테스트용 모의 LLM
      maxParallelChunks: 4,
      ...(testConfig.extractorOptions || {})
    });
  });

  test('HTML을 마크다운으로 변환할 수 있어야 함', async () => {
    // HTML 콘텐츠가 없으면 테스트 스킵
    if (!htmlContent) {
      return;
    }
    
    // HTML을 마크다운으로 변환
    const markdown = await extractor.convertToMarkdown(htmlContent);
    
    // 마크다운이 적절히 생성되었는지 확인
    expect(markdown).toBeTruthy();
    expect(typeof markdown).toBe('string');
    expect(markdown.length).toBeGreaterThan(100);
    
    // HTML 태그가 마크다운에 남아있지 않아야 함
    expect(markdown).not.toMatch(/<\/?[a-z][\s\S]*>/i);
  });

  test('컨텐츠를 청크로 분할할 수 있어야 함', async () => {
    // HTML 콘텐츠가 없으면 테스트 스킵
    if (!htmlContent) {
      return;
    }
    
    // HTML을 마크다운으로 변환
    const markdown = await extractor.convertToMarkdown(htmlContent);
    
    // 마크다운을 청크로 분할
    const chunks = extractor.splitIntoChunks(markdown);
    
    // 청크가 적절히 생성되었는지 확인
    expect(chunks).toBeInstanceOf(Array);
    expect(chunks.length).toBeGreaterThan(0);
    
    // 각 청크의 크기가 chunkSize를 초과하지 않아야 함
    chunks.forEach(chunk => {
      expect(chunk.length).toBeLessThanOrEqual(extractor.chunkSize);
    });
    
    // 청크의 합이 원본 마크다운의 크기와 비슷해야 함
    const totalChunkSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    expect(totalChunkSize).toBeGreaterThanOrEqual(markdown.length * 0.95);
    expect(totalChunkSize).toBeLessThanOrEqual(markdown.length * 1.1); // 약간의 중복 허용
  });

  test('청크를 병렬로 처리할 수 있어야 함', async () => {
    // HTML 콘텐츠가 없으면 테스트 스킵
    if (!htmlContent) {
      return;
    }
    
    // HTML을 마크다운으로 변환하고 청크로 분할
    const markdown = await extractor.convertToMarkdown(htmlContent);
    const chunks = extractor.splitIntoChunks(markdown);
    
    // 청크를 병렬로 처리
    const extractionGoal = "제품 이름, 가격, 주요 특징을 추출";
    const results = await extractor.processChunksInParallel(chunks, extractionGoal);
    
    // 결과가 적절히 생성되었는지 확인
    expect(results).toBeInstanceOf(Array);
    expect(results.length).toBe(chunks.length);
    
    // 각 결과가 유효한 구조를 가져야 함
    results.forEach(result => {
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });
  });

  test('제품 정보를 추출할 수 있어야 함', async () => {
    // HTML 콘텐츠가 없으면 테스트 스킵
    if (!htmlContent) {
      return;
    }
    
    // 제품 정보 추출
    const extractionGoal = "제품 이름, 가격, 설명, 사양, 가용성 정보를 추출";
    const productInfo = await extractor.extractContent(htmlContent, extractionGoal);
    
    // 추출된 정보가 적절한지 확인
    expect(productInfo).toBeDefined();
    expect(typeof productInfo).toBe('object');
    
    // 필수 필드가 존재해야 함
    expect(productInfo.name).toBeDefined();
    expect(productInfo.price).toBeDefined();
    
    // 제품 이름은 문자열이어야 함
    expect(typeof productInfo.name).toBe('string');
    expect(productInfo.name.length).toBeGreaterThan(0);
    
    // 가격은 숫자 또는 통화 형식 문자열이어야 함
    expect(typeof productInfo.price === 'number' || 
          /^R\$\s*[\d.,]+$/.test(productInfo.price)).toBeTruthy();
  });

  test('결과를 병합할 수 있어야 함', async () => {
    // 임의의 추출 결과
    const results = [
      { name: 'LG 냉장고', price: 'R$ 3.999,00', features: ['특징1', '특징2'] },
      { description: '이 제품은 최신 기술이 적용된 고급 냉장고입니다.', specs: { size: '185cm' } },
      { available: true, rating: 4.5, features: ['특징3'] }
    ];
    
    // 결과 병합
    const merged = extractor.mergeResults(results);
    
    // 병합된 결과가 적절한지 확인
    expect(merged).toBeDefined();
    expect(typeof merged).toBe('object');
    
    // 모든 필드가 병합되어야 함
    expect(merged.name).toBe('LG 냉장고');
    expect(merged.price).toBe('R$ 3.999,00');
    expect(merged.description).toBe('이 제품은 최신 기술이 적용된 고급 냉장고입니다.');
    expect(merged.specs).toEqual({ size: '185cm' });
    expect(merged.available).toBe(true);
    expect(merged.rating).toBe(4.5);
    
    // 배열 필드는 적절히 병합되어야 함
    expect(merged.features).toBeInstanceOf(Array);
    expect(merged.features.length).toBe(3);
    expect(merged.features).toContain('특징1');
    expect(merged.features).toContain('특징2');
    expect(merged.features).toContain('특징3');
  });
});
