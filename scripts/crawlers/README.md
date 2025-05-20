# 크롤링 관리자 모듈 (Crawling Manager)

LG 브라질 A2A 쇼핑 어시스턴트를 위한 강력하고 확장 가능한 크롤링 관리 시스템입니다. 이 모듈은 기존 데이터베이스 직접 접근 없이 웹 크롤링을 통해 제품 정보와 체크아웃 프로세스를 수집하고 관리합니다.

## 주요 기능

- **카테고리 및 제품 크롤링**: 제품 카테고리 및 개별 제품 정보 크롤링
- **검색 결과 크롤링**: 사이트 내 검색 결과 페이지에서 제품 정보 추출
- **체크아웃 프로세스 분석**: 제품 구매 과정을 분석하여 대화형 체크아웃 지원
- **분산 크롤링 시스템**: 병렬 처리 및 작업 큐를 통한 효율적인 크롤링
- **지능형 오류 처리**: 다양한 오류 상황에 대한 자동 대응 및 복구 전략
- **이벤트 기반 아키텍처**: 크롤링 이벤트 모니터링 및 처리

## 아키텍처

![크롤링 아키텍처](../docs/images/crawling_architecture.png)

시스템은 다음과 같은 주요 컴포넌트로 구성됩니다:

1. **크롤링 관리자 (CrawlingManager)**: 전체 크롤링 작업을 조율하는 중앙 모듈
2. **카테고리 크롤러 (CategoryCrawler)**: 제품 카테고리 페이지 크롤링 전문화
3. **제품 크롤러 (ProductCrawler)**: 개별 제품 상세 정보 크롤링 전문화
4. **오류 처리기 (CrawlingErrorHandler)**: 크롤링 중 발생하는 오류 처리 및 복구

## 사용 방법

### 기본 사용법

```javascript
const { CrawlingManager } = require('./crawlers');

// 크롤링 관리자 인스턴스 생성
const crawlingManager = new CrawlingManager({
  dataDir: './data',
  logDir: './logs',
  maxRetries: 3,
  maxConcurrency: 5
});

// 카테고리 크롤링
async function crawlTVCategory() {
  const category = {
    name: 'TV',
    url: 'https://www.lge.com/br/tvs',
    type: 'tv'
  };
  
  const products = await crawlingManager.crawlCategory(category, {
    limit: 10, // 최대 10개 제품만 가져오기
    crawlDetails: true // 제품 상세 정보도 크롤링
  });
  
  console.log(`${products.length}개 제품을 찾았습니다.`);
  return products;
}

crawlTVCategory().catch(console.error);
```

### 이벤트 리스닝

```javascript
// 크롤링 이벤트 리스닝
crawlingManager.on('categoryCrawled', ({ category, products }) => {
  console.log(`카테고리 크롤링 완료: ${category.name}, ${products.length}개 제품`);
});

crawlingManager.on('productCrawled', ({ product }) => {
  console.log(`제품 크롤링 완료: ${product.title}`);
});

crawlingManager.on('error', ({ type, error }) => {
  console.error(`크롤링 오류 발생 (${type}): ${error.message}`);
});

// 작업 큐 이벤트
crawlingManager.on('taskCompleted', ({ task }) => {
  console.log(`작업 완료: ${task.id} (${task.type})`);
});

crawlingManager.on('taskFailed', ({ task, error }) => {
  console.error(`작업 실패: ${task.id} (${task.type}), ${error.message}`);
});
```

### 작업 큐 사용하기

```javascript
// 작업 큐에 크롤링 작업 추가
function scheduleMultipleTasks() {
  // 카테고리 크롤링 작업
  crawlingManager.addTaskToQueue({
    type: 'category',
    data: { name: 'TV', url: 'https://www.lge.com/br/tvs', type: 'tv' },
    options: { limit: 5 },
    priority: 10
  });
  
  // 제품 크롤링 작업
  crawlingManager.addTaskToQueue({
    type: 'product',
    data: 'https://www.lge.com/br/tvs/lg-OLED65C1PSA',
    options: { category: 'tv' },
    priority: 20
  });
  
  // 검색 작업
  crawlingManager.addTaskToQueue({
    type: 'search',
    data: 'smart tv 4k',
    options: { limit: 8 },
    priority: 30
  });
  
  console.log('작업이 큐에 추가되었습니다.');
}

scheduleMultipleTasks();

// 작업 큐 관리
crawlingManager.pauseQueue(); // 작업 큐 일시 중지
crawlingManager.resumeQueue(); // 작업 큐 재개
crawlingManager.clearQueue(); // 작업 큐 비우기

// 통계 확인
const stats = crawlingManager.getStats();
console.log('크롤링 통계:', stats);
```

## 고급 기능

### 체크아웃 프로세스 분석

```javascript
// 제품 체크아웃 프로세스 분석
async function analyzeCheckoutProcess() {
  const productUrl = 'https://www.lge.com/br/tvs/lg-OLED65C1PSA';
  
  const checkoutProcess = await crawlingManager.crawlCheckoutProcess(productUrl);
  console.log('체크아웃 프로세스 분석 결과:', checkoutProcess);
  
  // 사용자 정보를 기반으로 체크아웃 딥링크 생성
  const userInfo = {
    name: 'João Silva',
    email: 'joao.silva@example.com',
    address: 'Av. Paulista, 1000',
    city: 'São Paulo',
    postalCode: '01310-100',
    phone: '11-98765-4321'
  };
  
  const deeplink = crawlingManager.generateCheckoutDeeplink(userInfo);
  console.log('체크아웃 딥링크:', deeplink);
  
  return { checkoutProcess, deeplink };
}
```

### 병렬 크롤링

```javascript
// 여러 카테고리 병렬 크롤링
async function crawlMultipleCategories() {
  const categories = [
    { name: 'TV', url: 'https://www.lge.com/br/tvs', type: 'tv' },
    { name: 'Refrigerators', url: 'https://www.lge.com/br/refrigerators', type: 'refrigerator' },
    { name: 'Air Conditioners', url: 'https://www.lge.com/br/air-conditioners', type: 'ac' }
  ];
  
  const result = await crawlingManager.crawlAllCategories(categories, {
    parallel: true, // 병렬 처리 활성화
    concurrency: 2, // 동시에 최대 2개 카테고리 처리
    limit: 5 // 카테고리당 최대 5개 제품
  });
  
  console.log('병렬 크롤링 결과:', {
    총카테고리: result.totalCategories,
    성공: result.successfulCategories,
    실패: result.failedCategories
  });
  
  return result;
}
```

### 제품 정보 업데이트

```javascript
// 제품 정보 주기적 업데이트
async function updateProductInfo(products) {
  const updateResult = await crawlingManager.updateProductsInfo(products, 'tv', {
    concurrency: 3 // 동시에 3개 제품 업데이트
  });
  
  console.log('제품 업데이트 결과:', {
    업데이트됨: updateResult.updated,
    변경없음: updateResult.unchanged,
    오류: updateResult.errors
  });
  
  return updateResult.updatedProducts;
}
```

## 에러 처리 전략

크롤링 관리자는 다음과 같은 상황에 대한 오류 처리 전략을 구현합니다:

1. **네트워크 관련 오류**: 연결 실패, 타임아웃 등 - 지수 백오프 방식으로 재시도
2. **접근 제한/차단**: IP 차단, 캡차 등 - 우회 전략 적용 또는 건너뛰기
3. **페이지 구조 변경**: 셀렉터 불일치 - 대체 셀렉터 시도
4. **브라우저 오류**: 브라우저 충돌 - 브라우저 재시작 후 재시도

## 데이터 저장 구조

크롤링된 데이터는 기본적으로 다음과 같은 파일 구조로 저장됩니다:

- `data/category_[카테고리ID].json`: 카테고리 및 해당 제품 목록
- `data/product_[제품ID].json`: 개별 제품 상세 정보
- `data/search_[검색어].json`: 검색 결과
- `data/all_categories.json`: 모든 카테고리의 통합 정보

## 테스트

테스트 스크립트를 실행하여 시스템의 다양한 기능을 테스트할 수 있습니다:

```bash
# 작업 큐 테스트
node scripts/test-crawling-manager.js queue

# 카테고리 크롤링 테스트
node scripts/test-crawling-manager.js category https://www.lge.com/br/tvs

# 제품 크롤링 테스트
node scripts/test-crawling-manager.js product https://www.lge.com/br/tvs/lg-OLED65C1PSA

# 검색 테스트
node scripts/test-crawling-manager.js search "smart tv 4k"
```

## 주의사항

- 과도한 크롤링은 대상 웹사이트에 부하를 줄 수 있으므로, 적절한 지연(delay)과 동시성(concurrency) 설정이 중요합니다.
- 크롤링 윤리와 robots.txt 규칙을 준수하세요.
- 크롤링된 데이터는 정기적으로 업데이트해야 최신 정보를 유지할 수 있습니다.

## 기여 방법

1. 이 저장소를 포크합니다.
2. 새 기능 브랜치를 만듭니다 (`git checkout -b feature/amazing-feature`).
3. 변경 사항을 커밋합니다 (`git commit -m 'Add some amazing feature'`).
4. 브랜치에 푸시합니다 (`git push origin feature/amazing-feature`).
5. Pull Request를 만듭니다.

## 라이선스

LG전자 내부용으로 개발되었으며, 모든 권리는 LG전자에 있습니다.