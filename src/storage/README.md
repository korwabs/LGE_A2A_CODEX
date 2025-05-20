# 데이터 저장 및 캐싱 시스템 구현

LG 브라질 A2A 쇼핑 어시스턴트 프로젝트의 데이터 저장 및 캐싱 시스템 구현에 관한 문서입니다.

## 개요

본 모듈은 크롤링한 데이터를 효율적으로 저장, 캐싱, 검색할 수 있는 기능을 제공합니다. 이 시스템은 크롤링된 제품 정보, 카테고리 데이터, 체크아웃 프로세스 정보 등을 관리하고, 빠른 액세스를 위한 캐싱 기능과 효율적인 검색을 위한 인덱싱 기능을 포함합니다.

## 주요 기능

1. **데이터 저장소 설계**: 다양한 저장소(Firebase, 로컬 JSON 파일, 메모리 등)를 추상화하여 일관된 인터페이스 제공
2. **캐싱 메커니즘**: 자주 조회되는 데이터의 액세스 성능 향상을 위한 다층 캐싱 구현
3. **검색 기능**: Algolia 및 인메모리 검색 엔진을 통한 효율적인 데이터 검색 기능 제공

## 구조

### 1. 모델

- 데이터 모델 및 인터페이스 정의
- 제품, 카테고리, 체크아웃 프로세스 등의 스키마 구현

### 2. 저장소

- Repository 인터페이스 및 구현체
  - Firebase 저장소
  - JSON 파일 저장소
  - 메모리 저장소
- 저장소 팩토리로 구현체 생성

### 3. 캐싱

- 다양한 캐싱 정책 지원 (LRU, LFU, TTL 등)
- 메모리 캐시 구현
- 다층 캐시 (메모리 + 영구 저장소) 구현

### 4. 검색

- Algolia 검색 서비스 통합
- 인메모리 퍼지 검색 (Fuse.js 기반) 구현
- 검색 서비스 팩토리

### 5. 통합 관리

- StorageManager를 통해 저장소, 캐시, 검색 기능을 통합 관리

## 사용 예시

```typescript
// 스토리지 관리자 생성
const productStorage = new StorageManager<Product>(
  repositoryFactory,
  searchServiceFactory,
  'products',
  {
    repositoryType: RepositoryType.JSON_FILE,
    repositoryOptions: {
      dataDir: './data'
    },
    cacheOptions: {
      cacheEnabled: true,
      useMemoryCache: true,
      memoryCacheTtl: 300000 // 5분
    },
    searchServiceType: SearchServiceType.ALGOLIA,
    searchServiceOptions: {
      appId: 'YOUR_ALGOLIA_APP_ID',
      apiKey: 'YOUR_ALGOLIA_API_KEY',
      indexName: 'products'
    }
  }
);

// 제품 추가
const product = await productStorage.set({
  name: 'LG OLED TV C2 65인치',
  price: 8999.99,
  // ... 기타 제품 데이터
});

// 제품 검색
const searchResults = await productStorage.search('OLED TV');

// 제품 캐시에서 조회
const cachedProduct = await productStorage.get(product.id);
```

## 구현 상세

### 1. 데이터 저장소 설계

- **Repository 인터페이스**: CRUD 연산과 기본 쿼리 기능 정의
- **Firebase 저장소**: Firestore 기반 구현체
- **JSON 파일 저장소**: 로컬 JSON 파일 기반 구현체, 테스트 및 개발 환경용
- **메모리 저장소**: 인메모리 구현체, 빠른 액세스 지원

### 2. 캐싱 메커니즘 구현

- **Cache 인터페이스**: 캐시 기본 기능 정의
- **MemoryCache**: 메모리 기반 캐시 구현, LRU/LFU/OLDEST 제거 정책 지원
- **MultiLevelCache**: 영구 저장소와 메모리 캐시를 조합한 다층 캐싱 구현
- **CacheManager**: 특정 도메인(제품, 카테고리 등)에 대한 캐시 관리

### 3. 데이터 색인 및 검색 기능 구현

- **SearchService 인터페이스**: 검색 기능 정의
- **AlgoliaSearchService**: Algolia 검색 엔진 통합
- **InMemorySearchService**: Fuse.js 기반 인메모리 퍼지 검색
- **SearchServiceFactory**: 검색 서비스 생성 팩토리

## 이점 및 특징

1. **모듈화 및 확장성**: 인터페이스 기반 설계로 새로운 구현체 쉽게 추가 가능
2. **성능 최적화**: 다층 캐싱으로 반복 접근 성능 개선
3. **유연한 검색**: 다양한 검색 엔진 통합으로 최적의 검색 경험 제공
4. **개발 및 테스트 용이성**: 인메모리 구현체로 빠른 개발 및 테스트 지원

## 설치 및 설정

1. 필요한 패키지 설치:
```bash
npm install
```

2. 환경 변수 설정:
```
# Firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-client-email
FIREBASE_PRIVATE_KEY=your-private-key

# Algolia
ALGOLIA_APP_ID=your-app-id
ALGOLIA_API_KEY=your-api-key
```

3. 예제 실행:
```bash
npm run test:storage
```

## 추가 개선 사항

1. **분산 캐싱**: Redis 등을 활용한 분산 캐싱 구현
2. **마이그레이션 지원**: 스키마 변경 시 데이터 마이그레이션 유틸리티
3. **모니터링 및 지표**: 성능 및 사용량 모니터링 통합
4. **리플리케이션**: 데이터 복제 및 동기화 메커니즘 구현
