// api/webhook.js - 웹훅 API 엔드포인트 (크롤링 결과 처리)
import { getAlgoliaClient } from '../src/services/algolia';
import { getFirestore } from '../src/services/firebase';

export default async function handler(req, res) {
  // POST 요청만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 웹훅 인증 키 확인
  const webhookKey = req.headers['x-webhook-key'];
  if (webhookKey !== process.env.WEBHOOK_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { eventType, runId, dataType, data } = req.body;

    if (!eventType || !dataType || !data) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // 이벤트 유형에 따른 처리
    switch (eventType) {
      case 'RUN.SUCCEEDED':
        // 크롤링 데이터 처리
        await processCrawledData(dataType, data);
        break;
        
      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    return res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({
      error: 'Failed to process webhook',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// 크롤링한 데이터 처리 함수
async function processCrawledData(dataType, data) {
  const algoliaClient = getAlgoliaClient();
  const db = getFirestore();
  
  switch (dataType) {
    case 'productList':
      // 제품 목록 데이터 Algolia에 색인화
      const productsIndex = algoliaClient.initIndex(process.env.ALGOLIA_PRODUCTS_INDEX);
      
      // 배치 처리를 위한 객체 배열 준비
      const objects = data.map(product => ({
        objectID: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        category: product.category,
        imageUrl: product.imageUrl,
        url: product.url,
        stockStatus: product.stockStatus || 'unknown',
        features: product.features || [],
        specifications: product.specifications || {},
        updatedAt: new Date().toISOString(),
        // 추가 필드...
      }));
      
      await productsIndex.saveObjects(objects);
      
      // 크롤링 로그 저장
      await db.collection('crawlLogs').add({
        dataType,
        itemCount: objects.length,
        timestamp: new Date(),
        status: 'indexed'
      });
      break;
      
    case 'checkoutProcess':
      // 체크아웃 프로세스 정보 Firestore에 저장
      const checkoutFlowsRef = db.collection('checkoutFlows');
      
      // 기존 데이터 삭제 후 새 데이터 저장
      const batch = db.batch();
      
      // 기존 문서 조회
      const existingDocs = await checkoutFlowsRef.get();
      existingDocs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      // 새 데이터 추가
      data.forEach((flow, index) => {
        const flowRef = checkoutFlowsRef.doc(flow.category || `default_${index}`);
        batch.set(flowRef, {
          ...flow,
          updatedAt: new Date()
        });
      });
      
      await batch.commit();
      
      // 크롤링 로그 저장
      await db.collection('crawlLogs').add({
        dataType,
        itemCount: data.length,
        timestamp: new Date(),
        status: 'stored'
      });
      break;
      
    default:
      console.log(`Unhandled data type: ${dataType}`);
  }
}
