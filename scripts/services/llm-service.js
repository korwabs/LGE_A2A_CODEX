/**
 * LLM 서비스 - LLM API 연동을 위한 유틸리티
 */
const { VertexAI } = require('@google-cloud/vertexai');
const { retry } = require('../utils/retry-utils');
const { delay } = require('../utils/delay-utils');
const logger = require('../utils/logger');
const config = require('../config/default-config');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * LLM 서비스 클래스
 */
class LlmService {
  /**
   * @param {object} options - LLM 서비스 옵션
   * @param {string} options.provider - LLM 제공자 (google, openai, anthropic)
   * @param {string} options.model - 사용할 모델 이름
   * @param {object} options.credentials - 인증 정보
   * @param {boolean} options.useCache - 캐시 사용 여부 (기본값: true)
   * @param {string} options.cacheDir - 캐시 디렉토리 (기본값: 자동 생성)
   * @param {number} options.cacheTTL - 캐시 유효 기간(ms) (기본값: 24시간)
   */
  constructor(options = {}) {
    this.provider = options.provider || config.llm.provider;
    if (this.provider === 'gemini') {
      // Gemini는 Vertex AI 기반이므로 google 제공자로 취급
      this.provider = 'google';
    }
    this.model = options.model || config.llm.model;
    this.credentials = options.credentials || config.llm.credentials;
    this.useCache = options.useCache !== false;
    this.cacheTTL = options.cacheTTL || 24 * 60 * 60 * 1000; // 24시간
    this.client = null;
    
    // 캐시 디렉토리 설정
    this.cacheDir = options.cacheDir || path.join(process.cwd(), 'data', 'cache', 'llm');
    if (this.useCache && !fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    
    // 요청 레이트 제한 관리
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.rateLimit = {
      google: { maxRequests: 10, perSeconds: 60 }, // 분당 10개 요청
      openai: { maxRequests: 20, perSeconds: 60 },  // 분당 20개 요청
      anthropic: { maxRequests: 10, perSeconds: 60 } // 분당 10개 요청
    };
    
    this.initClient();
  }
  
  /**
   * LLM 클라이언트를 초기화합니다.
   */
  initClient() {
    try {
      if (this.provider === 'google') {
        const { project, location } = this.credentials;
        this.client = new VertexAI({
          project,
          location
        });
      } else if (this.provider === 'openai') {
        // OpenAI 클라이언트 구현
        try {
          const { OpenAI } = require('openai');
          this.client = new OpenAI({
            apiKey: this.credentials.apiKey
          });
        } catch (error) {
          logger.error('Failed to initialize OpenAI client. Make sure the OpenAI package is installed:', error);
          throw new Error('OpenAI package not available. Install with: npm install openai');
        }
      } else if (this.provider === 'anthropic') {
        // Anthropic 클라이언트 구현
        try {
          const { Anthropic } = require('@anthropic-ai/sdk');
          this.client = new Anthropic({
            apiKey: this.credentials.apiKey
          });
        } catch (error) {
          logger.error('Failed to initialize Anthropic client. Make sure the Anthropic package is installed:', error);
          throw new Error('Anthropic package not available. Install with: npm install @anthropic-ai/sdk');
        }
      } else {
        throw new Error(`Unsupported LLM provider: ${this.provider}`);
      }
    } catch (error) {
      logger.error('Failed to initialize LLM client:', error);
      throw error;
    }
  }
  
  /**
   * 텍스트를 생성합니다.
   * @param {string} prompt - 입력 프롬프트
   * @param {object} options - 생성 옵션
   * @returns {Promise<string>} 생성된 텍스트
   */
  async generateText(prompt, options = {}) {
    try {
      // 캐시 확인
      if (this.useCache) {
        const cachedResponse = this.getCachedResponse(prompt, options);
        if (cachedResponse) {
          logger.debug('Using cached LLM response');
          return cachedResponse;
        }
      }
      
      // 텍스트 생성 요청을 큐에 추가
      return await this.addToQueue(async () => {
        logger.debug(`Generating text with ${this.provider}/${this.model}`);
        
        // 제공자별 구현
        let response;
        
        if (this.provider === 'google') {
          response = await this._generateWithGoogle(prompt, options);
        } else if (this.provider === 'openai') {
          response = await this._generateWithOpenAI(prompt, options);
        } else if (this.provider === 'anthropic') {
          response = await this._generateWithAnthropic(prompt, options);
        } else {
          throw new Error(`Unsupported LLM provider: ${this.provider}`);
        }
        
        // 응답 캐싱
        if (this.useCache) {
          this.cacheResponse(prompt, options, response);
        }
        
        return response;
      });
    } catch (error) {
      logger.error('Failed to generate text:', error);
      throw error;
    }
  }
  
  /**
   * Google Vertex AI를 사용하여 텍스트를 생성합니다.
   * @param {string} prompt - 입력 프롬프트
   * @param {object} options - 생성 옵션
   * @returns {Promise<string>} 생성된 텍스트
   */
  async _generateWithGoogle(prompt, options) {
    const generativeModel = this.client.getGenerativeModel({
      model: this.model,
      generation_config: {
        max_output_tokens: options.maxTokens || 1024,
        temperature: options.temperature || 0.2,
        top_p: options.topP || 0.8,
        top_k: options.topK || 40
      }
    });
    
    const result = await retry(
      async () => {
        return await generativeModel.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });
      },
      {
        maxRetries: 3,
        initialDelay: 1000,
        shouldRetry: (error) => {
          // 재시도 가능한 오류인지 확인
          return error.message.includes('rate limit') || 
                 error.message.includes('timeout') ||
                 error.message.includes('internal error');
        }
      }
    );
    
    const response = result.response;
    return response.candidates[0].content.parts[0].text;
  }
  
  /**
   * OpenAI를 사용하여 텍스트를 생성합니다.
   * @param {string} prompt - 입력 프롬프트
   * @param {object} options - 생성 옵션
   * @returns {Promise<string>} 생성된 텍스트
   */
  async _generateWithOpenAI(prompt, options) {
    const completion = await retry(
      async () => {
        return await this.client.chat.completions.create({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: options.temperature || 0.2,
          max_tokens: options.maxTokens || 1024,
          top_p: options.topP || 0.8,
          frequency_penalty: options.frequencyPenalty || 0,
          presence_penalty: options.presencePenalty || 0
        });
      },
      {
        maxRetries: 3,
        initialDelay: 1000,
        shouldRetry: (error) => {
          // 재시도 가능한 오류인지 확인
          return error.message.includes('rate limit') || 
                 error.message.includes('timeout') ||
                 error.message.includes('internal server error');
        }
      }
    );
    
    return completion.choices[0].message.content;
  }
  
  /**
   * Anthropic을 사용하여 텍스트를 생성합니다.
   * @param {string} prompt - 입력 프롬프트
   * @param {object} options - 생성 옵션
   * @returns {Promise<string>} 생성된 텍스트
   */
  async _generateWithAnthropic(prompt, options) {
    const message = await retry(
      async () => {
        return await this.client.messages.create({
          model: this.model,
          max_tokens: options.maxTokens || 1024,
          temperature: options.temperature || 0.2,
          system: options.systemPrompt || '',
          messages: [{ role: 'user', content: prompt }]
        });
      },
      {
        maxRetries: 3,
        initialDelay: 1000,
        shouldRetry: (error) => {
          // 재시도 가능한 오류인지 확인
          return error.message.includes('rate limit') || 
                 error.message.includes('timeout') ||
                 error.message.includes('internal server error');
        }
      }
    );
    
    return message.content[0].text;
  }
  
  /**
   * 요청을 큐에 추가하고 레이트 리밋을 관리합니다.
   * @param {Function} requestFn - 요청 함수
   * @returns {Promise<any>} 요청 결과
   */
  async addToQueue(requestFn) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ 
        fn: requestFn, 
        resolve, 
        reject,
        timestamp: Date.now() 
      });
      
      if (!this.isProcessingQueue) {
        this.processQueue();
      }
    });
  }
  
  /**
   * 요청 큐를 처리합니다.
   */
  async processQueue() {
    if (this.requestQueue.length === 0) {
      this.isProcessingQueue = false;
      return;
    }
    
    this.isProcessingQueue = true;
    
    // 레이트 제한 체크
    const rateLimit = this.rateLimit[this.provider];
    const now = Date.now();
    const recentRequests = this.requestQueue.filter(
      request => now - request.timestamp < rateLimit.perSeconds * 1000
    );
    
    if (recentRequests.length >= rateLimit.maxRequests) {
      // 레이트 제한 초과, 대기
      const waitTime = (rateLimit.perSeconds * 1000) - (now - recentRequests[0].timestamp);
      await delay(waitTime);
    }
    
    // 다음 요청 처리
    const { fn, resolve, reject } = this.requestQueue.shift();
    
    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    }
    
    // 연속 처리 지연 (API 부하 방지)
    await delay(100);
    
    // 다음 요청 처리
    this.processQueue();
  }
  
  /**
   * 캐시 파일 경로를 생성합니다.
   * @param {string} prompt - 프롬프트
   * @param {object} options - 옵션
   * @returns {string} 캐시 파일 경로
   */
  getCacheFilePath(prompt, options) {
    // 프롬프트와 옵션으로 고유 해시 생성
    const hash = crypto.createHash('md5').update(
      prompt + JSON.stringify(options) + this.provider + this.model
    ).digest('hex');
    
    return path.join(this.cacheDir, `${hash}.json`);
  }
  
  /**
   * 캐시에서 응답을 가져옵니다.
   * @param {string} prompt - 프롬프트
   * @param {object} options - 옵션
   * @returns {string|null} 캐시된 응답 또는 null
   */
  getCachedResponse(prompt, options) {
    if (!this.useCache) return null;
    
    const cacheFilePath = this.getCacheFilePath(prompt, options);
    
    try {
      if (fs.existsSync(cacheFilePath)) {
        const stat = fs.statSync(cacheFilePath);
        const cacheAge = Date.now() - stat.mtimeMs;
        
        // 캐시가 유효 기간 내인 경우
        if (cacheAge < this.cacheTTL) {
          const cacheContent = fs.readFileSync(cacheFilePath, 'utf8');
          const cacheData = JSON.parse(cacheContent);
          return cacheData.response;
        }
      }
    } catch (error) {
      logger.warn(`Failed to read cache file: ${error.message}`);
    }
    
    return null;
  }
  
  /**
   * 응답을 캐시에 저장합니다.
   * @param {string} prompt - 프롬프트
   * @param {object} options - 옵션
   * @param {string} response - 응답
   */
  cacheResponse(prompt, options, response) {
    if (!this.useCache) return;
    
    const cacheFilePath = this.getCacheFilePath(prompt, options);
    
    try {
      fs.writeFileSync(
        cacheFilePath, 
        JSON.stringify({
          prompt,
          options,
          response,
          provider: this.provider,
          model: this.model,
          timestamp: Date.now()
        }, null, 2), 
        'utf8'
      );
    } catch (error) {
      logger.warn(`Failed to write cache file: ${error.message}`);
    }
  }
  
  /**
   * 컨텐츠 추출을 수행합니다.
   * @param {string} content - 처리할 컨텐츠
   * @param {string} extractionGoal - 추출 목표
   * @param {object} options - 추출 옵션
   * @returns {Promise<object>} 추출된 구조화된 데이터
   */
  async extractContent(content, extractionGoal, options = {}) {
    try {
      logger.debug(`Extracting content with ${this.provider}/${this.model}`);
      
      const prompt = `
        Your task is to extract specific information from the provided content.
        
        Extraction goal: ${extractionGoal}
        
        Content:
        ${content}
        
        ${options.schema ? `Output should match this schema:\n${JSON.stringify(options.schema, null, 2)}` : ''}
        
        Respond with only the extracted information in JSON format.
        Be precise, factual, and ensure all extracted data is directly from the content.
      `;
      
      const response = await this.generateText(prompt, {
        temperature: options.temperature || 0.1,
        maxTokens: options.maxTokens || 2048
      });
      
      try {
        // JSON 응답 파싱
        return JSON.parse(response);
      } catch (parseError) {
        logger.warn('Failed to parse LLM response as JSON:', parseError);
        
        // JSON 파싱 실패 시 정규식으로 JSON 추출 시도
        const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || 
                          response.match(/({[\s\S]*?})/);
        
        if (jsonMatch) {
          try {
            return JSON.parse(jsonMatch[1] || jsonMatch[0]);
          } catch (secondError) {
            logger.warn('Failed to parse extracted JSON:', secondError);
          }
        }
        
        // 파싱 실패 시 원본 텍스트 반환
        return { text: response };
      }
    } catch (error) {
      logger.error('Failed to extract content:', error);
      throw error;
    }
  }
  
  /**
   * 병렬로 여러 청크에서 컨텐츠를 추출합니다.
   * @param {Array<string>} chunks - 처리할 컨텐츠 청크들
   * @param {string} extractionGoal - 추출 목표
   * @param {object} options - 추출 옵션
   * @returns {Promise<Array<object>>} 각 청크에서 추출된 결과
   */
  async extractContentFromChunks(chunks, extractionGoal, options = {}) {
    try {
      logger.debug(`Extracting content from ${chunks.length} chunks`);
      
      const maxConcurrency = options.maxConcurrency || 3;
      
      // 청크를 배치로 분할
      const batches = [];
      for (let i = 0; i < chunks.length; i += maxConcurrency) {
        batches.push(chunks.slice(i, i + maxConcurrency));
      }
      
      const results = [];
      
      // 각 배치를 병렬로 처리
      for (const [index, batch] of batches.entries()) {
        logger.debug(`Processing batch ${index + 1}/${batches.length}`);
        
        const batchPromises = batch.map((chunk, chunkIndex) => 
          this.extractContent(
            chunk, 
            `${extractionGoal} (Chunk ${index * maxConcurrency + chunkIndex + 1}/${chunks.length})`,
            options
          )
        );
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // 배치 간 지연 (API 부하 방지)
        if (index < batches.length - 1) {
          await delay(2000);
        }
      }
      
      return results;
    } catch (error) {
      logger.error('Failed to extract content from chunks:', error);
      throw error;
    }
  }
  
  /**
   * 텍스트를 요약합니다.
   * @param {string} text - 요약할 텍스트
   * @param {object} options - 요약 옵션
   * @param {number} options.maxLength - 최대 요약 길이 (단어 수)
   * @param {string} options.format - 요약 형식 (bullet, paragraph)
   * @returns {Promise<string>} 요약된 텍스트
   */
  async summarizeText(text, options = {}) {
    try {
      const maxLength = options.maxLength || 200;
      const format = options.format || 'paragraph';
      
      const prompt = `
        Summarize the following text concisely:
        
        ${text}
        
        ${format === 'bullet' ? 'Format the summary as bullet points.' : 'Format the summary as a paragraph.'}
        The summary should be approximately ${maxLength} words or less.
        Focus on the most important information and maintain the original meaning.
      `;
      
      return await this.generateText(prompt, {
        temperature: 0.3,
        maxTokens: 1024
      });
    } catch (error) {
      logger.error('Failed to summarize text:', error);
      throw error;
    }
  }
  
  /**
   * 텍스트에서 질문에 대한 답변을 찾습니다.
   * @param {string} text - 텍스트
   * @param {string} question - 질문
   * @returns {Promise<string>} 답변
   */
  async answerQuestion(text, question) {
    try {
      const prompt = `
        Read the following text and answer the question.
        
        Text:
        ${text}
        
        Question: ${question}
        
        Answer the question based only on the information provided in the text.
        If the answer is not in the text, respond with "The information is not available in the provided text."
      `;
      
      return await this.generateText(prompt, {
        temperature: 0.2,
        maxTokens: 1024
      });
    } catch (error) {
      logger.error('Failed to answer question:', error);
      throw error;
    }
  }
  
  /**
   * 텍스트에서 엔티티(사람, 장소, 조직 등)를 추출합니다.
   * @param {string} text - 텍스트
   * @returns {Promise<object>} 추출된 엔티티
   */
  async extractEntities(text) {
    try {
      const prompt = `
        Extract all named entities from the following text:
        
        ${text}
        
        For each entity, provide:
        1. The entity name
        2. The entity type (Person, Organization, Location, Product, Date, etc.)
        3. Any relevant attributes or details mentioned in the text
        
        Format the output as a JSON object, grouped by entity type.
      `;
      
      const response = await this.generateText(prompt, {
        temperature: 0.1,
        maxTokens: 2048
      });
      
      try {
        return JSON.parse(response);
      } catch (error) {
        logger.warn('Failed to parse entities as JSON:', error);
        return { text: response };
      }
    } catch (error) {
      logger.error('Failed to extract entities:', error);
      throw error;
    }
  }
}

module.exports = LlmService;
