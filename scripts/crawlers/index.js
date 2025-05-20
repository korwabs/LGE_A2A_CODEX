/**
 * 크롤러 모듈 인덱스
 * 
 * 모든 크롤링 관련 모듈에 대한 통합 가져오기 지원
 */

// 메인 크롤링 관리자
const CrawlingManager = require('./crawling-manager');

// 특화된 크롤러
const CategoryCrawler = require('./specialized/category-crawler');
const ProductCrawler = require('./specialized/product-crawler');
const CrawlingErrorHandler = require('./specialized/crawling-error-handler');

// 모듈 내보내기
module.exports = {
  CrawlingManager,
  CategoryCrawler,
  ProductCrawler,
  CrawlingErrorHandler
};