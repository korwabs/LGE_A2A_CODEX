// api/checkout.js - 구매 프로세스 지원 API 엔드포인트
import { getFirestore } from '../src/services/firebase';
import { getPurchaseProcessAgent } from '../src/agents';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { userId } = req.query;
  
  if (!userId) {
    return res.status(400).json({ error: 'Missing required query parameter: userId' });
  }

  const db = getFirestore();
  const checkoutRef = db.collection('checkouts').doc(userId);
  
  // GET 요청: 구매 프로세스 상태 조회
  if (req.method === 'GET') {
    try {
      const checkoutDoc = await checkoutRef.get();
      
      if (!checkoutDoc.exists) {
        return res.status(404).json({ error: 'Checkout process not found' });
      }
      
      return res.status(200).json(checkoutDoc.data());
    } catch (error) {
      console.error('Error getting checkout process:', error);
      return res.status(500).json({ error: 'Failed to retrieve checkout process' });
    }
  }
  
  // POST 요청: 구매 프로세스 시작 또는 진행
  else if (req.method === 'POST') {
    try {
      const { action, productId, data } = req.body;
      
      if (!action) {
        return res.status(400).json({ error: 'Missing required field: action' });
      }
      
      // 구매 프로세스 에이전트 가져오기
      const purchaseProcessAgent = await getPurchaseProcessAgent();
      
      let result;
      
      switch (action) {
        case 'start':
          // 구매 프로세스 시작
          if (!productId) {
            return res.status(400).json({ error: 'Missing required field for start action: productId' });
          }
          
          result = await purchaseProcessAgent.startCheckoutProcess({
            userId,
            productId
          });
          break;
          
        case 'update':
          // 구매 프로세스 정보 업데이트
          if (!data) {
            return res.status(400).json({ error: 'Missing required field for update action: data' });
          }
          
          result = await purchaseProcessAgent.updateCheckoutInfo({
            userId,
            data
          });
          break;
          
        case 'confirm':
          // 구매 정보 확인 및 다음 단계로 이동
          result = await purchaseProcessAgent.confirmCheckoutStep({
            userId
          });
          break;
          
        case 'complete':
          // 구매 프로세스 완료
          result = await purchaseProcessAgent.completeCheckout({
            userId
          });
          break;
          
        default:
          return res.status(400).json({ error: `Unknown action: ${action}` });
      }
      
      return res.status(200).json(result);
    } catch (error) {
      console.error('Error processing checkout action:', error);
      return res.status(500).json({
        error: 'Failed to process checkout action',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}
