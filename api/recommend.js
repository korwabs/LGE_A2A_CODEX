// api/recommend.js - 제품 추천 API 엔드포인트
import { getAlgoliaClient } from '../src/services/algolia';
import { getFirestore } from '../src/services/firebase';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { userId, productId, category, limit = 5 } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing required field: userId' });
    }

    // Algolia 클라이언트 초기화
    const algoliaClient = getAlgoliaClient();
    const index = algoliaClient.initIndex(process.env.ALGOLIA_INDEX_NAME);

    let recommendations = [];

    // 상품 ID가 있는 경우 관련 제품 추천
    if (productId) {
      const similarProducts = await index.findObject(
        hit => hit.objectID === productId
      ).then(result => {
        if (result.object) {
          return index.search('', {
            filters: `category:${result.object.category} AND NOT objectID:${productId}`,
            hitsPerPage: limit
          });
        }
        return { hits: [] };
      });
      
      recommendations = similarProducts.hits;
    } 
    // 카테고리가 있는 경우 카테고리 내 인기 제품 추천
    else if (category) {
      const categoryProducts = await index.search('', {
        filters: `category:${category}`,
        hitsPerPage: limit
      });
      
      recommendations = categoryProducts.hits;
    } 
    // 사용자 기반 추천
    else {
      // Firestore에서 사용자 행동 데이터 가져오기
      const db = getFirestore();
      const userDoc = await db.collection('users').doc(userId).get();
      
      if (userDoc.exists) {
        const userData = userDoc.data();
        const viewedProducts = userData.viewedProducts || [];
        const categories = userData.preferredCategories || [];
        
        // 사용자가 본 제품 카테고리 기반 추천
        if (viewedProducts.length > 0 || categories.length > 0) {
          let filterString = '';
          
          if (categories.length > 0) {
            const categoryFilters = categories.map(cat => `category:${cat}`).join(' OR ');
            filterString = `(${categoryFilters})`;
          }
          
          if (viewedProducts.length > 0) {
            const excludeViewed = viewedProducts.map(id => `NOT objectID:${id}`).join(' AND ');
            filterString = filterString ? `${filterString} AND ${excludeViewed}` : excludeViewed;
          }
          
          const personalRecommendations = await index.search('', {
            filters: filterString,
            hitsPerPage: limit
          });
          
          recommendations = personalRecommendations.hits;
        } else {
          // 기본 인기 제품 추천
          const popularProducts = await index.search('', {
            hitsPerPage: limit
          });
          
          recommendations = popularProducts.hits;
        }
      } else {
        // 사용자 데이터가 없는 경우 기본 인기 제품 추천
        const popularProducts = await index.search('', {
          hitsPerPage: limit
        });
        
        recommendations = popularProducts.hits;
      }
    }

    return res.status(200).json({
      userId,
      recommendations,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error processing recommendation request:', error);
    return res.status(500).json({
      error: 'Failed to process your recommendation request',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
