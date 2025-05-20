// src/services/vertex-ai.js - Vertex AI(Gemini) 서비스
import { VertexAI } from '@google-cloud/vertexai';

let vertexAIInstance = null;

/**
 * Vertex AI 인스턴스 초기화 및 반환
 * @returns {Object} Vertex AI 인스턴스
 */
export function getVertexAI() {
  if (!vertexAIInstance) {
    vertexAIInstance = new VertexAI({
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION,
    });
  }
  return vertexAIInstance;
}

/**
 * Gemini Pro 모델 가져오기
 * @returns {Object} 모델 인스턴스
 */
export function getGeminiProModel() {
  const vertexAI = getVertexAI();
  return vertexAI.getGenerativeModel({
    model: 'gemini-pro',
    generationConfig: {
      temperature: 0.4,
      topP: 0.8,
      topK: 40,
      maxOutputTokens: 2048,
    },
  });
}

/**
 * 텍스트 생성
 * @param {string} prompt 프롬프트
 * @param {Object} options 생성 옵션
 * @returns {Promise<Object>} 생성 결과
 */
export async function generateText(prompt, options = {}) {
  const model = getGeminiProModel();
  
  const generationConfig = {
    temperature: options.temperature || 0.4,
    topP: options.topP || 0.8,
    topK: options.topK || 40,
    maxOutputTokens: options.maxOutputTokens || 2048,
  };
  
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig,
  });
  
  return result.response;
}

/**
 * 대화 형식 텍스트 생성
 * @param {Array} messages 메시지 배열 [{role: 'user|model', content: 'text'}, ...]
 * @param {Object} options 생성 옵션
 * @returns {Promise<Object>} 생성 결과
 */
export async function generateChatResponse(messages, options = {}) {
  const model = getGeminiProModel();
  
  const generationConfig = {
    temperature: options.temperature || 0.4,
    topP: options.topP || 0.8,
    topK: options.topK || 40,
    maxOutputTokens: options.maxOutputTokens || 2048,
  };
  
  // 메시지 형식 변환 (Vertex AI 형식으로)
  const formattedMessages = messages.map(msg => ({
    role: msg.role === 'model' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));
  
  const result = await model.generateContent({
    contents: formattedMessages,
    generationConfig,
  });
  
  return result.response;
}

/**
 * 자연어 쿼리를 Algolia 검색 파라미터로 변환
 * @param {string} query 자연어 쿼리
 * @returns {Promise<Object>} Algolia 검색 파라미터
 */
export async function extractSearchParams(query) {
  const prompt = `
  아래 사용자의 자연어 쇼핑 쿼리를 Algolia 검색 파라미터로 변환해주세요.
  결과는 JSON 형식으로 반환하되, 다음 속성만 포함해야 합니다:
  - query: 핵심 검색어
  - filters: Algolia 필터 문자열 (예: "category:TV AND price >= 1000")
  - sort: 정렬 방식 (예: "price:asc" 또는 "rating:desc")

  사용자 쿼리: "${query}"
  
  JSON 응답 형식만 제공하세요:
  `;
  
  try {
    const response = await generateText(prompt, { temperature: 0.2 });
    const text = response.text().trim();
    
    // JSON 문자열 추출 및 파싱
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // 기본값 반환
    return { query, filters: '', sort: '' };
  } catch (error) {
    console.error('Error extracting search params:', error);
    return { query, filters: '', sort: '' };
  }
}

/**
 * 제품 추천 사유 생성
 * @param {Object} product 제품 정보
 * @param {string} userQuery 사용자 쿼리
 * @param {string} language 언어 (기본값: pt-br)
 * @returns {Promise<string>} 추천 사유
 */
export async function generateRecommendationReason(product, userQuery, language = 'pt-br') {
  const prompt = `
  당신은 LG 브라질의 쇼핑 어시스턴트입니다. 사용자의 쿼리에 따라 추천된 제품에 대해
  자연스럽고 설득력 있는 추천 이유를 생성해주세요.
  
  사용자 쿼리: "${userQuery}"
  
  제품 정보:
  - 이름: ${product.name}
  - 가격: ${product.price}
  - 카테고리: ${product.category}
  - 특징: ${product.features.join(', ')}
  - 설명: ${product.description}
  
  언어: ${language === 'pt-br' ? '포르투갈어(브라질)' : '영어'}
  
  짧고 자연스러운 추천 이유를 ${language === 'pt-br' ? '포르투갈어로' : '영어로'} 작성해주세요.
  브랜드 가치를 강조하되 과장되지 않게 작성해주세요.
  `;
  
  try {
    const response = await generateText(prompt, { temperature: 0.7 });
    return response.text().trim();
  } catch (error) {
    console.error('Error generating recommendation reason:', error);
    
    // 오류 시 기본 추천 사유 반환
    return language === 'pt-br'
      ? `Este produto atende perfeitamente às suas necessidades.`
      : `This product perfectly meets your needs.`;
  }
}

/**
 * 제품 리뷰 요약 생성
 * @param {Array} reviews 리뷰 배열
 * @param {string} language 언어 (기본값: pt-br)
 * @returns {Promise<Object>} 리뷰 요약 (장점, 단점, 종합 평가)
 */
export async function summarizeProductReviews(reviews, language = 'pt-br') {
  if (!reviews || reviews.length === 0) {
    return {
      pros: [],
      cons: [],
      summary: language === 'pt-br'
        ? 'Sem avaliações disponíveis para este produto.'
        : 'No reviews available for this product.'
    };
  }
  
  const reviewTexts = reviews.map(r => 
    `- Classificação: ${r.rating}/5, Comentário: ${r.text}`
  ).join('\n');
  
  const prompt = `
  당신은 LG 브라질의 쇼핑 어시스턴트입니다. 다음 제품 리뷰들을 분석하여
  주요 장점, 단점, 그리고 전체적인 요약을 제공해주세요.
  
  리뷰:
  ${reviewTexts}
  
  언어: ${language === 'pt-br' ? '포르투갈어(브라질)' : '영어'}
  
  다음 JSON 형식으로 ${language === 'pt-br' ? '포르투갈어로' : '영어로'} 응답해주세요:
  {
    "pros": ["장점1", "장점2", ...],
    "cons": ["단점1", "단점2", ...],
    "summary": "종합적인 요약"
  }
  
  장점과 단점은 각각 최대 5개까지만 나열해주세요.
  요약은 2-3문장으로 간결하게 작성해주세요.
  `;
  
  try {
    const response = await generateText(prompt, { temperature: 0.3 });
    const text = response.text().trim();
    
    // JSON 문자열 추출 및 파싱
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // 기본값 반환
    return {
      pros: [],
      cons: [],
      summary: language === 'pt-br'
        ? 'Não foi possível analisar as avaliações.'
        : 'Could not analyze the reviews.'
    };
  } catch (error) {
    console.error('Error summarizing reviews:', error);
    
    // 오류 시 기본값 반환
    return {
      pros: [],
      cons: [],
      summary: language === 'pt-br'
        ? 'Erro ao processar as avaliações.'
        : 'Error processing reviews.'
    };
  }
}
