// api/search.js - 제품 검색 API 엔드포인트
import { getAlgoliaClient } from '../src/services/algolia';

export default async function handler(req, res) {
  // POST 요청과 GET 요청 처리
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 쿼리 파라미터 추출
    const query = req.method === 'POST' ? req.body.query : req.query.q;
    const filters = req.method === 'POST' ? req.body.filters : req.query.filters;
    const page = parseInt(req.method === 'POST' ? req.body.page : req.query.page) || 0;
    const hitsPerPage = parseInt(req.method === 'POST' ? req.body.hitsPerPage : req.query.hitsPerPage) || 10;

    if (!query) {
      return res.status(400).json({ error: 'Missing required field: query' });
    }

    // Algolia 클라이언트 초기화
    const algoliaClient = getAlgoliaClient();
    const index = algoliaClient.initIndex(process.env.ALGOLIA_INDEX_NAME);

    // 검색 실행
    const searchResults = await index.search(query, {
      filters: filters,
      page,
      hitsPerPage,
    });

    // 응답 반환
    return res.status(200).json({
      hits: searchResults.hits,
      page: searchResults.page,
      nbHits: searchResults.nbHits,
      nbPages: searchResults.nbPages,
      hitsPerPage: searchResults.hitsPerPage,
      processingTimeMS: searchResults.processingTimeMS,
    });
  } catch (error) {
    console.error('Error processing search request:', error);
    return res.status(500).json({
      error: 'Failed to process your search request',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
