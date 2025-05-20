// Jest 셋업 파일
import '@testing-library/jest-dom';

// Node.js 환경에서 TextEncoder/TextDecoder가 존재하지 않는 경우를 위한 폴리필
if (typeof global.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// 전역 설정
global.beforeEach(() => {
  // 테스트 전 환경 변수 초기화 등의 작업
  process.env.NODE_ENV = 'test';
});

// 외부 API 모킹을 위한 설정
jest.mock('@google-cloud/vertexai', () => {
  return {
    VertexAI: jest.fn().mockImplementation(() => {
      return {
        getGenerativeModel: jest.fn().mockImplementation(() => {
          return {
            generateContent: jest.fn().mockResolvedValue({
              response: {
                text: jest.fn().mockReturnValue('Mocked Gemini response')
              }
            })
          };
        })
      };
    })
  };
});

jest.mock('apify-client', () => {
  return jest.fn().mockImplementation(() => {
    return {
      actor: jest.fn().mockImplementation(() => {
        return {
          call: jest.fn().mockResolvedValue({
            items: [
              { productId: 'prod1', name: 'Test Product', price: 100 }
            ]
          })
        };
      })
    };
  });
});

jest.mock('algoliasearch', () => {
  return jest.fn().mockImplementation(() => {
    return {
      initIndex: jest.fn().mockImplementation(() => {
        return {
          search: jest.fn().mockResolvedValue({
            hits: [
              { objectID: 'prod1', name: 'Test Product', price: 100 }
            ]
          }),
          saveObjects: jest.fn().mockResolvedValue({ objectIDs: ['prod1'] }),
          partialUpdateObjects: jest.fn().mockResolvedValue({ objectIDs: ['prod1'] })
        };
      })
    };
  });
});

jest.mock('firebase-admin', () => {
  const firestoreMock = {
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({
      exists: true,
      data: jest.fn().mockReturnValue({
        userId: 'test-user',
        preferences: {},
        cart: []
      })
    }),
    set: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({})
  };

  return {
    initializeApp: jest.fn(),
    credential: {
      cert: jest.fn()
    },
    firestore: jest.fn().mockReturnValue(firestoreMock)
  };
});

// 타이머 모킹 (API 요청 타임아웃 등을 테스트할 때 사용)
jest.useFakeTimers();
