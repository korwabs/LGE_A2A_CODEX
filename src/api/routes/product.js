/**
 * 제품 정보 라우터
 */
const express = require('express');
const router = express.Router();

// 서비스 및 에이전트 의존성
let searchService;
let crawlingCoordinatorAgent;

/**
 * 의존성 주입
 * @param {Object} services - 서비스 객체
 * @param {Object} agents - 에이전트 객체
 */
const init = (services, agents) => {
  searchService = services.searchService;
  crawlingCoordinatorAgent = agents.crawlingCoordinatorAgent;
};

/**
 * 제품 검색 API
 */
router.get('/search', async (req, res, next) => {
  try {
    const { query, category, minPrice, maxPrice, limit = 20, page = 1 } = req.query;
    
    if (!query && !category) {
      return res.status(400).json({
        status: 'error',
        message: '검색어 또는 카테고리가 필요합니다.'
      });
    }
    
    // 검색 필터 구성
    const filters = [];
    
    if (category) {
      filters.push(`category:${category}`);
    }
    
    if (minPrice || maxPrice) {
      const priceFilter = [];
      if (minPrice) priceFilter.push(`price >= ${minPrice}`);
      if (maxPrice) priceFilter.push(`price <= ${maxPrice}`);
      filters.push(`(${priceFilter.join(' AND ')})`);
    }
    
    // 제품 검색
    const searchResults = await searchService.searchProducts(query, {
      filters: filters.length > 0 ? filters.join(' AND ') : undefined,
      page,
      limit
    });
    
    res.json({
      status: 'success',
      data: searchResults
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 제품 상세 정보 API
 */
router.get('/:productId', async (req, res, next) => {
  try {
    const { productId } = req.params;
    const force = req.query.force === 'true';
    
    if (!productId) {
      return res.status(400).json({
        status: 'error',
        message: '제품 ID가 필요합니다.'
      });
    }
    
    // 크롤링 에이전트에 제품 정보 요청
    const result = await crawlingCoordinatorAgent.processMessage({
      intent: 'crawlProductInfo',
      payload: {
        productId,
        force
      }
    });
    
    if (!result.success) {
      return res.status(404).json({
        status: 'error',
        message: '제품을 찾을 수 없습니다.'
      });
    }
    
    res.json({
      status: 'success',
      data: result.productInfo
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 카테고리별 제품 목록 API
 */
router.get('/category/:categoryId', async (req, res, next) => {
  try {
    const { categoryId } = req.params;
    const { limit = 20, force = false } = req.query;
    
    if (!categoryId) {
      return res.status(400).json({
        status: 'error',
        message: '카테고리 ID가 필요합니다.'
      });
    }
    
    // 크롤링 에이전트에 카테고리 제품 요청
    const result = await crawlingCoordinatorAgent.processMessage({
      intent: 'crawlCategoryProducts',
      payload: {
        categoryId,
        limit: parseInt(limit),
        force: force === 'true'
      }
    });
    
    if (!result.success) {
      return res.status(404).json({
        status: 'error',
        message: '카테고리를 찾을 수 없습니다.'
      });
    }
    
    res.json({
      status: 'success',
      data: {
        categoryId,
        products: result.products,
        total: result.products.length,
        source: result.source
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 제품 재고 확인 API
 */
router.get('/:productId/stock', async (req, res, next) => {
  try {
    const { productId } = req.params;
    const force = req.query.force === 'true';
    
    if (!productId) {
      return res.status(400).json({
        status: 'error',
        message: '제품 ID가 필요합니다.'
      });
    }
    
    // 크롤링 에이전트에 재고 정보 요청
    const result = await crawlingCoordinatorAgent.processMessage({
      intent: 'checkProductStock',
      payload: {
        productId,
        force
      }
    });
    
    if (!result.success) {
      return res.status(404).json({
        status: 'error',
        message: '제품 재고 정보를 찾을 수 없습니다.'
      });
    }
    
    res.json({
      status: 'success',
      data: {
        productId,
        stockInfo: result.stockInfo,
        source: result.source
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 추천 제품 API
 */
router.get('/recommended/:type', async (req, res, next) => {
  try {
    const { type } = req.params;
    const { categoryId, limit = 5 } = req.query;
    
    // 추천 타입에 따른 제품 조회
    let recommendedProducts = [];
    
    switch (type) {
      case 'popular':
        recommendedProducts = await searchService.getPopularProducts(categoryId, parseInt(limit));
        break;
      case 'featured':
        recommendedProducts = await searchService.getFeaturedProducts(categoryId, parseInt(limit));
        break;
      case 'new':
        recommendedProducts = await searchService.getNewArrivals(categoryId, parseInt(limit));
        break;
      default:
        return res.status(400).json({
          status: 'error',
          message: '유효하지 않은 추천 타입입니다.'
        });
    }
    
    res.json({
      status: 'success',
      data: {
        type,
        categoryId: categoryId || 'all',
        products: recommendedProducts
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.init = init;
