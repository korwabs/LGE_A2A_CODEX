// api/crawl.js - 크롤링 트리거 API 엔드포인트
import { ApifyClient } from 'apify-client';

// Apify 클라이언트 초기화
const apifyClient = new ApifyClient({
  token: process.env.APIFY_API_TOKEN,
});

export default async function handler(req, res) {
  // POST 요청만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // API 키 인증 확인
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.CRAWL_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { crawlType, url, category } = req.body;

    if (!crawlType) {
      return res.status(400).json({ error: 'Missing required field: crawlType' });
    }
    
    let actorName, runInput;
    
    // 크롤링 유형에 따른 Apify 액터 설정
    switch (crawlType) {
      case 'productList':
        actorName = 'LG-product-list-crawler';
        runInput = {
          startUrls: url ? [{ url }] : [{ url: 'https://www.lge.com/br/produtos' }],
          maxRequestsPerCrawl: 100,
          includeDescription: true
        };
        break;
        
      case 'productDetail':
        if (!url) {
          return res.status(400).json({ error: 'Missing required field for productDetail: url' });
        }
        actorName = 'LG-product-detail-crawler';
        runInput = {
          urls: [url],
          includeReviews: true,
          includeSpecifications: true
        };
        break;
        
      case 'category':
        if (!category) {
          return res.status(400).json({ error: 'Missing required field for category: category' });
        }
        actorName = 'LG-category-crawler';
        runInput = {
          category,
          maxDepth: 3,
          extractProductLinks: true
        };
        break;
        
      case 'checkoutProcess':
        actorName = 'LG-checkout-process-crawler';
        runInput = {
          startUrls: [{ url: 'https://www.lge.com/br/carrinho-de-compras' }],
          includeFieldMapping: true
        };
        break;
        
      default:
        return res.status(400).json({ error: `Unknown crawl type: ${crawlType}` });
    }
    
    // Apify 액터 실행
    const run = await apifyClient.actor(actorName).call(runInput);
    
    return res.status(200).json({
      success: true,
      runId: run.id,
      actorName,
      status: 'SUCCEEDED',
      message: 'Crawl job has been triggered successfully'
    });
  } catch (error) {
    console.error('Error triggering crawl job:', error);
    return res.status(500).json({
      error: 'Failed to trigger crawl job',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
