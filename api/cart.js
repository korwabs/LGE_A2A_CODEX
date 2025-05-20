// api/cart.js - 장바구니 관리 API 엔드포인트
import { getFirestore } from '../src/services/firebase';

export default async function handler(req, res) {
  const { userId } = req.query;
  
  if (!userId) {
    return res.status(400).json({ error: 'Missing required query parameter: userId' });
  }

  const db = getFirestore();
  const cartRef = db.collection('carts').doc(userId);

  // GET 요청: 장바구니 조회
  if (req.method === 'GET') {
    try {
      const cartDoc = await cartRef.get();
      
      if (!cartDoc.exists) {
        return res.status(200).json({ items: [], total: 0 });
      }
      
      return res.status(200).json(cartDoc.data());
    } catch (error) {
      console.error('Error getting cart:', error);
      return res.status(500).json({ error: 'Failed to retrieve cart' });
    }
  }
  
  // POST 요청: 장바구니에 상품 추가
  else if (req.method === 'POST') {
    try {
      const { productId, quantity = 1, productInfo } = req.body;
      
      if (!productId || !productInfo) {
        return res.status(400).json({ error: 'Missing required fields: productId and productInfo' });
      }
      
      // 현재 장바구니 가져오기
      const cartDoc = await cartRef.get();
      let currentCart = cartDoc.exists ? cartDoc.data() : { items: [], total: 0 };
      
      // 이미 장바구니에 있는 상품인지 확인
      const existingItemIndex = currentCart.items.findIndex(item => item.productId === productId);
      
      if (existingItemIndex >= 0) {
        // 이미 있는 상품이면 수량 업데이트
        currentCart.items[existingItemIndex].quantity += quantity;
      } else {
        // 새 상품 추가
        currentCart.items.push({
          productId,
          quantity,
          productInfo,
          addedAt: new Date().toISOString()
        });
      }
      
      // 총액 계산
      currentCart.total = currentCart.items.reduce((sum, item) => {
        return sum + (item.productInfo.price * item.quantity);
      }, 0);
      
      // 업데이트된 장바구니 저장
      await cartRef.set(currentCart, { merge: true });
      
      return res.status(200).json({
        message: 'Product added to cart',
        cart: currentCart
      });
    } catch (error) {
      console.error('Error adding to cart:', error);
      return res.status(500).json({ error: 'Failed to add product to cart' });
    }
  }
  
  // PUT 요청: 장바구니 아이템 수량 업데이트
  else if (req.method === 'PUT') {
    try {
      const { productId, quantity } = req.body;
      
      if (!productId || quantity === undefined) {
        return res.status(400).json({ error: 'Missing required fields: productId and quantity' });
      }
      
      // 현재 장바구니 가져오기
      const cartDoc = await cartRef.get();
      
      if (!cartDoc.exists) {
        return res.status(404).json({ error: 'Cart not found' });
      }
      
      let currentCart = cartDoc.data();
      
      // 상품 찾기
      const existingItemIndex = currentCart.items.findIndex(item => item.productId === productId);
      
      if (existingItemIndex < 0) {
        return res.status(404).json({ error: 'Product not found in cart' });
      }
      
      if (quantity <= 0) {
        // 수량이 0 이하면 상품 제거
        currentCart.items.splice(existingItemIndex, 1);
      } else {
        // 수량 업데이트
        currentCart.items[existingItemIndex].quantity = quantity;
      }
      
      // 총액 재계산
      currentCart.total = currentCart.items.reduce((sum, item) => {
        return sum + (item.productInfo.price * item.quantity);
      }, 0);
      
      // 업데이트된 장바구니 저장
      await cartRef.set(currentCart);
      
      return res.status(200).json({
        message: 'Cart updated',
        cart: currentCart
      });
    } catch (error) {
      console.error('Error updating cart:', error);
      return res.status(500).json({ error: 'Failed to update cart' });
    }
  }
  
  // DELETE 요청: 장바구니에서 상품 제거
  else if (req.method === 'DELETE') {
    try {
      const { productId } = req.body;
      
      if (!productId) {
        return res.status(400).json({ error: 'Missing required field: productId' });
      }
      
      const cartDoc = await cartRef.get();
      
      if (!cartDoc.exists) {
        return res.status(404).json({ error: 'Cart not found' });
      }
      
      let currentCart = cartDoc.data();
      
      // 상품 제거
      currentCart.items = currentCart.items.filter(item => item.productId !== productId);
      
      // 총액 재계산
      currentCart.total = currentCart.items.reduce((sum, item) => {
        return sum + (item.productInfo.price * item.quantity);
      }, 0);
      
      // 업데이트된 장바구니 저장
      await cartRef.set(currentCart);
      
      return res.status(200).json({
        message: 'Product removed from cart',
        cart: currentCart
      });
    } catch (error) {
      console.error('Error removing from cart:', error);
      return res.status(500).json({ error: 'Failed to remove product from cart' });
    }
  }
  
  // 지원하지 않는 HTTP 메서드
  else {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
}
