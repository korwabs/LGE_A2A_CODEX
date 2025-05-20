// src/services/firebase.js - Firebase 서비스
import admin from 'firebase-admin';

let firebaseApp = null;

/**
 * Firebase 앱 초기화
 * @returns {Object} Firebase 앱 인스턴스
 */
export function initializeFirebase() {
  if (!firebaseApp) {
    // 환경 변수에서 Firebase 구성 불러오기
    const serviceAccount = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString()
    );
    
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });
    
    console.log('Firebase initialized successfully');
  }
  
  return firebaseApp;
}

/**
 * Firestore DB 인스턴스 가져오기
 * @returns {Object} Firestore 인스턴스
 */
export function getFirestore() {
  if (!firebaseApp) {
    initializeFirebase();
  }
  return admin.firestore();
}

/**
 * Firebase Authentication 인스턴스 가져오기
 * @returns {Object} Auth 인스턴스
 */
export function getAuth() {
  if (!firebaseApp) {
    initializeFirebase();
  }
  return admin.auth();
}

/**
 * 사용자 세션 관리 함수
 */

/**
 * 사용자 세션 생성 또는 업데이트
 * @param {string} userId 사용자 ID
 * @param {Object} sessionData 세션 데이터
 * @param {number} expirationHours 세션 만료 시간 (시간, 기본값: 24)
 * @returns {Promise<Object>} 세션 문서 참조
 */
export async function createOrUpdateSession(userId, sessionData, expirationHours = 24) {
  const db = getFirestore();
  const sessionRef = db.collection('sessions').doc(userId);
  
  const sessionInfo = {
    ...sessionData,
    userId,
    createdAt: sessionData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + expirationHours * 60 * 60 * 1000)
    )
  };
  
  await sessionRef.set(sessionInfo, { merge: true });
  return sessionRef;
}

/**
 * 사용자 세션 가져오기
 * @param {string} userId 사용자 ID
 * @returns {Promise<Object>} 세션 데이터
 */
export async function getSession(userId) {
  const db = getFirestore();
  const sessionDoc = await db.collection('sessions').doc(userId).get();
  
  if (!sessionDoc.exists) {
    return null;
  }
  
  const sessionData = sessionDoc.data();
  
  // 만료된 세션 확인
  if (sessionData.expiresAt && sessionData.expiresAt.toDate() < new Date()) {
    await db.collection('sessions').doc(userId).delete();
    return null;
  }
  
  return sessionData;
}

/**
 * 사용자 세션 삭제
 * @param {string} userId 사용자 ID
 * @returns {Promise<void>}
 */
export async function deleteSession(userId) {
  const db = getFirestore();
  await db.collection('sessions').doc(userId).delete();
}

/**
 * 만료된 세션 정리
 * @returns {Promise<number>} 삭제된 세션 수
 */
export async function cleanupExpiredSessions() {
  const db = getFirestore();
  const now = admin.firestore.Timestamp.now();
  
  const expiredSessions = await db.collection('sessions')
    .where('expiresAt', '<', now)
    .get();
  
  const batch = db.batch();
  expiredSessions.forEach(doc => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
  return expiredSessions.size;
}

/**
 * 사용자 설정 관리 함수
 */

/**
 * 사용자 설정 저장
 * @param {string} userId 사용자 ID
 * @param {Object} preferences 사용자 설정
 * @returns {Promise<void>}
 */
export async function saveUserPreferences(userId, preferences) {
  const db = getFirestore();
  await db.collection('users').doc(userId).set({
    preferences,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

/**
 * 사용자 설정 가져오기
 * @param {string} userId 사용자 ID
 * @returns {Promise<Object>} 사용자 설정
 */
export async function getUserPreferences(userId) {
  const db = getFirestore();
  const userDoc = await db.collection('users').doc(userId).get();
  
  if (!userDoc.exists) {
    return {};
  }
  
  return userDoc.data().preferences || {};
}

/**
 * 사용자 행동 데이터 추적
 * @param {string} userId 사용자 ID
 * @param {string} actionType 행동 유형
 * @param {Object} actionData 행동 데이터
 * @returns {Promise<void>}
 */
export async function trackUserAction(userId, actionType, actionData) {
  const db = getFirestore();
  
  await db.collection('userActions').add({
    userId,
    actionType,
    actionData,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
  
  // 사용자 문서에 요약 정보 업데이트
  const userRef = db.collection('users').doc(userId);
  
  // 행동 유형에 따른 업데이트
  switch (actionType) {
    case 'viewProduct':
      await userRef.set({
        viewedProducts: admin.firestore.FieldValue.arrayUnion(actionData.productId),
        lastViewedProductAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      break;
      
    case 'addToCart':
      await userRef.set({
        addedToCartProducts: admin.firestore.FieldValue.arrayUnion(actionData.productId),
        lastAddedToCartAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      break;
      
    case 'search':
      await userRef.set({
        searchQueries: admin.firestore.FieldValue.arrayUnion(actionData.query),
        lastSearchAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      break;
      
    case 'categoryView':
      await userRef.set({
        viewedCategories: admin.firestore.FieldValue.arrayUnion(actionData.category),
        lastCategoryViewAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      break;
  }
}
