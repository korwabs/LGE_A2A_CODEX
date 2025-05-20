/**
 * 지능형 추출기 - 웹페이지에서 구조화된 정보를 추출합니다.
 * blast_luxia 프로젝트의 extract_content 함수를 참고하여 구현
 */
const logger = require('../utils/logger');
const LlmService = require('../services/llm-service');
const HtmlProcessor = require('./html-processor');
const { retry } = require('../utils/retry-utils');
const { delay } = require('../utils/delay-utils');
const fs = require('fs');
const path = require('path');

/**
 * 지능형 컨텐츠 추출기 클래스
 */
class IntelligentExtractor {
  /**
   * @param {object} options - 추출기 옵션
   * @param {number} options.chunkSize - 청크 크기 (기본값: 4000)
   * @param {string} options.llmProvider - LLM 제공자 (기본값: google)
   * @param {string} options.llmModel - LLM 모델 (기본값: gemini-pro)
   * @param {number} options.maxParallelChunks - 최대 병렬 청크 처리 수 (기본값: 3)
   * @param {string} options.cacheDir - 캐시 디렉토리 (기본값: 자동 생성)
   * @param {boolean} options.useCache - 캐시 사용 여부 (기본값: true)
   * @param {number} options.cacheTTL - 캐시 유효 기간(ms) (기본값: 24시간)
   */
  constructor(options = {}) {
    this.chunkSize = options.chunkSize || 4000;
    this.maxParallelChunks = options.maxParallelChunks || 3;
    this.useCache = options.useCache !== false;
    this.cacheTTL = options.cacheTTL || 24 * 60 * 60 * 1000; // 24시간
    
    // 캐시 디렉토리 설정
    this.cacheDir = options.cacheDir || path.join(process.cwd(), 'data', 'cache', 'extractions');
    if (this.useCache && !fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    
    // HTML 프로세서 초기화
    this.htmlProcessor = new HtmlProcessor({
      preserveLinks: true,
      extractMainContent: true
    });
    
    // LLM 서비스 초기화
    this.llmService = new LlmService({
      provider: options.llmProvider || 'google',
      model: options.llmModel || 'gemini-pro'
    });
    
    this.logger = logger;
  }
  
  /**
   * HTML 컨텐츠를 마크다운으로 변환합니다.
   * @param {string} html - 변환할 HTML
   * @param {object} options - 변환 옵션
   * @returns {string} 변환된 마크다운
   */
  convertToMarkdown(html, options = {}) {
    try {
      return this.htmlProcessor.convertToMarkdown(html);
    } catch (error) {
      this.logger.error('HTML to Markdown conversion failed:', error);
      // 실패 시 원본 텍스트에서 HTML 태그만 제거
      return this.htmlProcessor.convertToPlainText(html);
    }
  }
  
  /**
   * 마크다운 컨텐츠를 청크로 분할합니다.
   * @param {string} content - 분할할 마크다운 컨텐츠
   * @returns {Array<string>} 분할된 청크 배열
   */
  splitIntoChunks(content) {
    const chunks = [];
    
    // 의미 있는 섹션 경계로 나누기
    const sectionSeparators = /\n#{1,6}\s+|(?:\n\n|\r\n\r\n)/g;
    const sections = content.split(sectionSeparators).filter(Boolean);
    
    let currentChunk = [];
    let currentSize = 0;
    
    for (const section of sections) {
      const sectionSize = section.length;
      
      // 단일 섹션이 청크 크기보다 큰 경우 더 작은 단위로 분할
      if (sectionSize > this.chunkSize) {
        // 기존 청크 저장
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.join('\n'));
          currentChunk = [];
          currentSize = 0;
        }
        
        // 큰 섹션을 줄 단위로 분할
        const lines = section.split('\n');
        currentChunk = [];
        currentSize = 0;
        
        for (const line of lines) {
          const lineSize = line.length;
          
          if (currentSize + lineSize > this.chunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk.join('\n'));
            currentChunk = [line];
            currentSize = lineSize;
          } else {
            currentChunk.push(line);
            currentSize += lineSize;
          }
        }
        
        // 남은 줄 처리
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.join('\n'));
          currentChunk = [];
          currentSize = 0;
        }
      }
      // 통째로 청크에 추가 가능한 경우
      else if (currentSize + sectionSize <= this.chunkSize) {
        currentChunk.push(section);
        currentSize += sectionSize;
      }
      // 새 청크 시작 필요
      else {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.join('\n'));
        }
        currentChunk = [section];
        currentSize = sectionSize;
      }
    }
    
    // 남은 청크 추가
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n'));
    }
    
    this.logger.debug(`Split content into ${chunks.length} chunks`);
    
    // 각 청크에 컨텍스트 정보 추가
    return chunks.map((chunk, index) => {
      return `[Chunk ${index + 1}/${chunks.length}]\n\n${chunk}`;
    });
  }
  
  /**
   * 병렬 처리를 위한 청크 배치를 준비합니다.
   * @param {Array<string>} chunks - 청크 배열
   * @param {number} batchSize - 배치 크기
   * @returns {Array<Array<string>>} 배치 배열
   */
  prepareBatches(chunks, batchSize) {
    const batches = [];
    for (let i = 0; i < chunks.length; i += batchSize) {
      batches.push(chunks.slice(i, i + batchSize));
    }
    return batches;
  }
  
  /**
   * 청크를 병렬로 처리합니다.
   * @param {Array<string>} chunks - 처리할 청크 배열
   * @param {string} extractionGoal - 추출 목표
   * @param {object} schema - 출력 데이터 스키마 (선택 사항)
   * @returns {Promise<Array<object>>} 처리 결과 배열
   */
  async processChunksInParallel(chunks, extractionGoal, schema = null) {
    // 배치 준비
    const batches = this.prepareBatches(chunks, this.maxParallelChunks);
    const results = [];
    
    this.logger.debug(`Processing ${chunks.length} chunks in ${batches.length} batches`);
    
    // 각 배치 처리
    for (const [index, batch] of batches.entries()) {
      this.logger.debug(`Processing batch ${index + 1}/${batches.length}`);
      
      const batchPromises = batch.map((chunk, chunkIndex) => 
        this.processChunk(
          chunk, 
          extractionGoal,
          schema,
          // 청크 ID 생성
          `${index * this.maxParallelChunks + chunkIndex + 1}_${chunks.length}`
        )
      );
      
      // 배치 내 청크를 병렬로 처리
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // 배치 간 지연 (서버 부하 방지)
      if (index < batches.length - 1) {
        await delay(2000);
      }
    }
    
    return results;
  }
  
  /**
   * 캐시 파일 경로를 생성합니다.
   * @param {string} chunkId - 청크 ID
   * @param {string} extractionGoal - 추출 목표
   * @returns {string} 캐시 파일 경로
   */
  getCacheFilePath(chunkId, extractionGoal) {
    // 파일명에 사용할 수 없는 문자 제거
    const sanitizedGoal = extractionGoal
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase()
      .substring(0, 50);
    
    return path.join(this.cacheDir, `extract_${sanitizedGoal}_${chunkId}.json`);
  }
  
  /**
   * 캐시에서 결과를 가져옵니다.
   * @param {string} chunkId - 청크 ID
   * @param {string} extractionGoal - 추출 목표
   * @returns {object|null} 캐시된 결과 또는 null
   */
  getCachedResult(chunkId, extractionGoal) {
    if (!this.useCache) return null;
    
    const cacheFilePath = this.getCacheFilePath(chunkId, extractionGoal);
    
    try {
      if (fs.existsSync(cacheFilePath)) {
        const stat = fs.statSync(cacheFilePath);
        const cacheAge = Date.now() - stat.mtimeMs;
        
        // 캐시가 유효 기간 내인 경우
        if (cacheAge < this.cacheTTL) {
          const cacheContent = fs.readFileSync(cacheFilePath, 'utf8');
          return JSON.parse(cacheContent);
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to read cache file: ${error.message}`);
    }
    
    return null;
  }
  
  /**
   * 결과를 캐시에 저장합니다.
   * @param {string} chunkId - 청크 ID
   * @param {string} extractionGoal - 추출 목표
   * @param {object} result - 저장할 결과
   */
  cacheResult(chunkId, extractionGoal, result) {
    if (!this.useCache) return;
    
    const cacheFilePath = this.getCacheFilePath(chunkId, extractionGoal);
    
    try {
      fs.writeFileSync(
        cacheFilePath, 
        JSON.stringify(result, null, 2), 
        'utf8'
      );
    } catch (error) {
      this.logger.warn(`Failed to write cache file: ${error.message}`);
    }
  }
  
  /**
   * 단일 청크를 처리합니다.
   * @param {string} chunk - 처리할 청크
   * @param {string} extractionGoal - 추출 목표
   * @param {object} schema - 출력 데이터 스키마 (선택 사항)
   * @param {string} chunkId - 청크 ID (캐싱용)
   * @returns {Promise<object>} 처리 결과
   */
  async processChunk(chunk, extractionGoal, schema = null, chunkId = null) {
    try {
      // 캐시 확인
      if (chunkId) {
        const cachedResult = this.getCachedResult(chunkId, extractionGoal);
        if (cachedResult) {
          this.logger.debug(`Using cached result for chunk ${chunkId}`);
          return cachedResult;
        }
      }
      
      // 재시도 메커니즘으로 처리
      const result = await retry(
        async () => {
          const prompt = this.createExtractionPrompt(chunk, extractionGoal, schema);
          const response = await this.llmService.generateText(prompt, {
            temperature: 0.1,  // 낮은 온도로 결정적 결과 유도
            maxTokens: 2048
          });
          
          return this.parseResponse(response);
        },
        {
          maxRetries: 3,
          initialDelay: 1000,
          shouldRetry: (error) => {
            // 어떤 오류는 재시도하지 않음
            return !error.message.includes('content policy violation');
          }
        }
      );
      
      // 결과 캐싱
      if (chunkId) {
        this.cacheResult(chunkId, extractionGoal, result);
      }
      
      return result;
    } catch (error) {
      this.logger.error(`Failed to process chunk: ${error.message}`);
      return { error: error.message };
    }
  }
  
  /**
   * 추출 프롬프트를 생성합니다.
   * @param {string} chunk - 청크 내용
   * @param {string} extractionGoal - 추출 목표
   * @param {object} schema - 출력 데이터 스키마 (선택 사항)
   * @returns {string} 생성된 프롬프트
   */
  createExtractionPrompt(chunk, extractionGoal, schema = null) {
    let prompt = `
      You are an expert information extraction system that accurately extracts structured data from text content.

      # TASK
      Extract specific information from the provided content chunk based on the extraction goal.
      
      # EXTRACTION GOAL
      ${extractionGoal}
      
      # CONTENT CHUNK
      ${chunk}
      
      # GUIDELINES
      - Extract ONLY information that is explicitly present in the content.
      - If the requested information is not found, use null or empty values.
      - Be precise and factual - do not add information that's not in the content.
      - Extract data in a structured format.
      - Focus on the most relevant information for the extraction goal.
    `;
    
    // 스키마가 제공된 경우 추가
    if (schema) {
      prompt += `
        # OUTPUT SCHEMA
        Your response must strictly adhere to this JSON schema:
        ${typeof schema === 'string' ? schema : JSON.stringify(schema, null, 2)}
        
        Ensure your output matches this schema exactly!
      `;
    } else {
      prompt += `
        # OUTPUT FORMAT
        Respond with a clean JSON object containing the extracted information.
        Do not include any explanations, notes, or text outside the JSON.
      `;
    }
    
    return prompt;
  }
  
  /**
   * LLM 응답을 파싱합니다.
   * @param {string} response - LLM 응답
   * @returns {object} 파싱된 결과
   */
  parseResponse(response) {
    try {
      // JSON 형식 추출 시도
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || 
                        response.match(/({[\s\S]*?})/);
      
      const jsonString = jsonMatch ? jsonMatch[1] || jsonMatch[0] : response;
      
      // JSON 파싱 시도
      try {
        return JSON.parse(jsonString.trim());
      } catch (firstError) {
        // 첫 번째 파싱 실패, 더 광범위한 패턴 시도
        const widestMatch = response.match(/{[\s\S]*}/);
        if (widestMatch) {
          try {
            return JSON.parse(widestMatch[0]);
          } catch (secondError) {
            // 두 번째 파싱도 실패, 오류 로깅
            throw secondError;
          }
        }
        throw firstError;
      }
    } catch (error) {
      this.logger.warn(`Failed to parse response as JSON: ${error.message}`);
      
      // 특정 키워드 검색하여 수동 파싱 시도
      const improvizedJson = {};
      
      // 키-값 패턴 검색 (예: "key: value" 또는 "key = value")
      const keyValuePatterns = response.match(/(\w+):\s*([^,\n]+)|(\w+)\s*=\s*([^,\n]+)/g);
      
      if (keyValuePatterns) {
        keyValuePatterns.forEach(pattern => {
          const [key, value] = pattern.split(/:\s*|=\s*/);
          if (key && value) {
            improvizedJson[key.trim()] = value.trim().replace(/['"]/g, '');
          }
        });
        
        if (Object.keys(improvizedJson).length > 0) {
          return improvizedJson;
        }
      }
      
      // 마지막 수단: 텍스트로 반환
      return { text: response };
    }
  }
  
  /**
   * 결과를 병합합니다.
   * @param {Array<object>} results - 병합할 결과 배열
   * @returns {object} 병합된 결과
   */
  mergeResults(results) {
    if (results.length === 0) return {};
    if (results.length === 1) return results[0];
    
    // 오류가 있는 결과 필터링
    const validResults = results.filter(result => !result.error);
    if (validResults.length === 0) {
      return { error: 'All chunks failed to process' };
    }
    
    // 첫 번째 결과의 구조를 기준으로 결과 유형 파악
    const firstResult = validResults[0];
    
    // 배열 결과인 경우
    if (Array.isArray(firstResult)) {
      return validResults.flat();
    }
    
    // 객체 결과인 경우 - 스마트 병합
    return this._smartMergeObjects(validResults);
  }
  
  /**
   * 객체 배열을 스마트하게 병합합니다.
   * @param {Array<object>} objects - 병합할 객체 배열
   * @returns {object} 병합된 객체
   */
  _smartMergeObjects(objects) {
    // 모든 키 수집
    const allKeys = new Set();
    for (const obj of objects) {
      Object.keys(obj).forEach(key => allKeys.add(key));
    }
    
    // 객체 구조 분석
    const keyTypes = {};
    for (const key of allKeys) {
      const values = objects
        .filter(obj => obj[key] !== undefined)
        .map(obj => obj[key]);
      
      if (values.length === 0) continue;
      
      // 값 유형 결정
      if (values.every(v => Array.isArray(v))) {
        keyTypes[key] = 'array';
      } else if (values.every(v => typeof v === 'object' && v !== null && !Array.isArray(v))) {
        keyTypes[key] = 'object';
      } else {
        keyTypes[key] = 'primitive';
      }
    }
    
    // 병합 결과 객체
    const result = {};
    
    // 키별 병합
    for (const key of allKeys) {
      const values = objects
        .filter(obj => obj[key] !== undefined && obj[key] !== null)
        .map(obj => obj[key]);
      
      if (values.length === 0) {
        result[key] = null;
        continue;
      }
      
      // 유형별 병합 처리
      switch (keyTypes[key]) {
        case 'array':
          // 배열 병합 (중복 제거)
          result[key] = this._mergeArraysWithDeduplication(values.flat());
          break;
          
        case 'object':
          // 객체 재귀적 병합
          result[key] = this._smartMergeObjects(values);
          break;
          
        case 'primitive':
          // 기본 값 처리
          if (values.length === 1) {
            // 단일 값이면 그대로 사용
            result[key] = values[0];
          } else {
            // 가장 긴 값 또는 가장 많이 나타난 값 선택
            result[key] = this._chooseBestPrimitiveValue(values);
          }
          break;
      }
    }
    
    return result;
  }
  
  /**
   * 배열을 병합하고 중복을 제거합니다.
   * @param {Array} array - 병합할 배열
   * @returns {Array} 병합된 배열
   */
  _mergeArraysWithDeduplication(array) {
    // 객체 배열인 경우 중복 제거에 특별한 처리 필요
    if (array.length > 0 && typeof array[0] === 'object' && array[0] !== null) {
      const uniqueObjects = [];
      const seenObjects = new Set();
      
      for (const item of array) {
        const itemStr = JSON.stringify(item);
        if (!seenObjects.has(itemStr)) {
          seenObjects.add(itemStr);
          uniqueObjects.push(item);
        }
      }
      
      return uniqueObjects;
    }
    
    // 기본 타입 배열은 Set을 이용해 중복 제거
    return [...new Set(array)];
  }
  
  /**
   * 기본 값 배열에서 최적의 값을 선택합니다.
   * @param {Array} values - 선택할 값 배열
   * @returns {*} 선택된 값
   */
  _chooseBestPrimitiveValue(values) {
    // 비어있지 않은 문자열만 필터링
    const nonEmptyValues = values.filter(v => v !== "" && v !== null && v !== undefined);
    if (nonEmptyValues.length === 0) return values[0];
    
    // 문자열인 경우 빈도 계산
    if (typeof nonEmptyValues[0] === 'string') {
      const valueCounts = nonEmptyValues.reduce((counts, value) => {
        counts[value] = (counts[value] || 0) + 1;
        return counts;
      }, {});
      
      // 가장 많이 등장한 값 찾기
      let maxCount = 0;
      let mostCommonValue = nonEmptyValues[0];
      
      for (const [value, count] of Object.entries(valueCounts)) {
        if (count > maxCount) {
          maxCount = count;
          mostCommonValue = value;
        } else if (count === maxCount && value.length > mostCommonValue.length) {
          // 빈도가 동일하면 더 긴 값 선택
          mostCommonValue = value;
        }
      }
      
      return mostCommonValue;
    }
    
    // 숫자인 경우 평균 반환
    if (typeof nonEmptyValues[0] === 'number') {
      const sum = nonEmptyValues.reduce((a, b) => a + b, 0);
      return sum / nonEmptyValues.length;
    }
    
    // 기타 유형은 첫 번째 값 반환
    return nonEmptyValues[0];
  }
  
  /**
   * HTML 컨텐츠에서 지정된 목표에 따라 정보를 추출합니다.
   * @param {string} html - 추출할 HTML 컨텐츠
   * @param {string} extractionGoal - 추출 목표
   * @param {object} options - 추출 옵션
   * @param {object} options.schema - 출력 스키마 (선택 사항)
   * @param {boolean} options.preprocess - HTML 전처리 여부 (기본값: true)
   * @returns {Promise<object>} 추출된 정보
   */
  async extractContent(html, extractionGoal, options = {}) {
    try {
      this.logger.info(`Extracting content with goal: ${extractionGoal}`);
      
      // 시작 시간 기록
      const startTime = Date.now();
      
      // HTML 전처리 옵션
      const preprocess = options.preprocess !== false;
      
      // HTML 전처리 및 마크다운 변환
      let markdown;
      if (preprocess) {
        // HTML을 마크다운으로 변환
        markdown = this.convertToMarkdown(html);
      } else {
        // 전처리 없이 텍스트만 추출
        markdown = this.htmlProcessor.convertToPlainText(html);
      }
      
      // 마크다운을 청크로 분할
      const chunks = this.splitIntoChunks(markdown);
      
      // 청크를 병렬로 처리
      const chunkResults = await this.processChunksInParallel(
        chunks, 
        extractionGoal,
        options.schema
      );
      
      // 결과 병합
      const mergedResult = this.mergeResults(chunkResults);
      
      // 총 처리 시간 계산
      const totalTime = (Date.now() - startTime) / 1000;
      this.logger.info(`Content extraction completed in ${totalTime.toFixed(2)}s`);
      
      return mergedResult;
    } catch (error) {
      this.logger.error('Content extraction failed:', error);
      throw error;
    }
  }
  
  /**
   * 제품 정보를 추출합니다.
   * @param {string} html - 제품 페이지 HTML
   * @returns {Promise<object>} 추출된 제품 정보
   */
  async extractProductInfo(html) {
    try {
      // 1단계: HTML 파서로 기본 정보 추출 시도
      const basicInfo = this.htmlProcessor.extractProductInfo(html);
      
      // 2단계: LLM을 사용하여 더 깊은 정보 추출
      const extractionGoal = "Extract detailed product information including title, brand, price, currency, description, features, specifications, dimensions, weight, color options, availability, ratings, and any other relevant details.";
      
      // 제품 정보 스키마 정의
      const schema = {
        "type": "object",
        "properties": {
          "title": { "type": "string" },
          "brand": { "type": "string" },
          "model": { "type": "string" },
          "price": { "type": ["string", "number", "null"] },
          "currency": { "type": ["string", "null"] },
          "description": { "type": ["string", "null"] },
          "features": { 
            "type": "array",
            "items": { "type": "string" }
          },
          "specifications": { 
            "type": "object",
            "additionalProperties": true
          },
          "dimensions": { "type": ["string", "null"] },
          "weight": { "type": ["string", "null"] },
          "colorOptions": { 
            "type": "array",
            "items": { "type": "string" }
          },
          "availability": { "type": ["string", "boolean", "null"] },
          "rating": { "type": ["number", "string", "null"] },
          "reviewCount": { "type": ["number", "string", "null"] },
          "images": { 
            "type": "array",
            "items": { "type": "string" }
          },
          "categories": { 
            "type": "array",
            "items": { "type": "string" }
          }
        }
      };
      
      // LLM을 사용한 고급 추출
      const advancedInfo = await this.extractContent(html, extractionGoal, { schema });
      
      // 기본 정보와 고급 정보 병합
      return {
        ...basicInfo,
        ...advancedInfo,
        extractionMethod: "hybrid" // 추출 방법 기록
      };
    } catch (error) {
      this.logger.error('Product info extraction failed:', error);
      throw error;
    }
  }
  
  /**
   * 제품 리뷰를 추출합니다.
   * @param {string} html - 리뷰 페이지 HTML
   * @returns {Promise<object>} 추출된 리뷰 정보
   */
  async extractProductReviews(html) {
    try {
      const extractionGoal = "Extract product reviews including review text, ratings, authors, dates, pros, cons, and overall sentiment.";
      
      const schema = {
        "type": "object",
        "properties": {
          "averageRating": { "type": ["number", "string", "null"] },
          "totalReviews": { "type": ["number", "string", "null"] },
          "reviews": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "author": { "type": ["string", "null"] },
                "date": { "type": ["string", "null"] },
                "rating": { "type": ["number", "string", "null"] },
                "title": { "type": ["string", "null"] },
                "text": { "type": ["string", "null"] },
                "pros": {
                  "type": "array",
                  "items": { "type": "string" }
                },
                "cons": {
                  "type": "array",
                  "items": { "type": "string" }
                },
                "sentiment": { "type": ["string", "null"] }
              }
            }
          },
          "ratingSummary": {
            "type": "object",
            "additionalProperties": { "type": "number" }
          }
        }
      };
      
      return await this.extractContent(html, extractionGoal, { schema });
    } catch (error) {
      this.logger.error('Review extraction failed:', error);
      throw error;
    }
  }
  
  /**
   * 체크아웃 프로세스를 추출합니다.
   * @param {string} html - 체크아웃 페이지 HTML
   * @returns {Promise<object>} 추출된 체크아웃 프로세스 정보
   */
  async extractCheckoutProcess(html) {
    try {
      const extractionGoal = "Extract checkout process information including form fields, required fields, field labels, validation patterns, buttons, and navigation steps.";
      
      const schema = {
        "type": "object",
        "properties": {
          "currentStep": { "type": ["string", "number", "null"] },
          "totalSteps": { "type": ["number", "null"] },
          "stepTitle": { "type": ["string", "null"] },
          "formFields": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "name": { "type": "string" },
                "label": { "type": ["string", "null"] },
                "type": { "type": "string" },
                "required": { "type": "boolean" },
                "validationPattern": { "type": ["string", "null"] },
                "options": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "value": { "type": ["string", "number"] },
                      "label": { "type": "string" }
                    }
                  }
                }
              }
            }
          },
          "buttons": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "text": { "type": "string" },
                "type": { "type": "string" },
                "action": { "type": ["string", "null"] }
              }
            }
          },
          "navigation": {
            "type": "object",
            "properties": {
              "previous": { "type": ["string", "null"] },
              "next": { "type": ["string", "null"] },
              "cancel": { "type": ["string", "null"] }
            }
          }
        }
      };
      
      return await this.extractContent(html, extractionGoal, { schema });
    } catch (error) {
      this.logger.error('Checkout process extraction failed:', error);
      throw error;
    }
  }
}

module.exports = IntelligentExtractor;
