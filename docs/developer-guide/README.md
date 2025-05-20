# LG 브라질 A2A 쇼핑 어시스턴트 개발자 가이드

이 가이드는 LG 브라질 A2A 쇼핑 어시스턴트 프로젝트의 개발자를 위한 문서입니다. 프로젝트의 구조, 주요 컴포넌트, 개발 방법 및 확장 방법에 대한 정보를 제공합니다.

## 목차

1. [프로젝트 개요](#프로젝트-개요)
2. [시스템 아키텍처](#시스템-아키텍처)
3. [주요 컴포넌트](#주요-컴포넌트)
4. [개발 환경 설정](#개발-환경-설정)
5. [핵심 개발 작업](#핵심-개발-작업)
6. [테스트 및 디버깅](#테스트-및-디버깅)
7. [배포 프로세스](#배포-프로세스)
8. [확장 및 커스터마이징](#확장-및-커스터마이징)
9. [문제 해결 가이드](#문제-해결-가이드)
10. [API 참조](#api-참조)

## 프로젝트 개요

LG 브라질 A2A 쇼핑 어시스턴트는 LG 브라질 웹사이트(www.lge.com/br)에서 기존 데이터베이스 접근 없이 웹 크롤링과 캐시 기반으로 운영되는 지능형 쇼핑 어시스턴트입니다. 이 프로젝트는 MCP(Model Context Protocol)와 A2A(Agent to Agent) 프로토콜을 활용하여 다양한 에이전트 간의 효율적인 통신을 구현합니다.

### 주요 기능

- **지능형 웹 크롤링**: 브라우저 자동화를 통한 제품 데이터 수집
- **대화형 제품 탐색**: 자연어 기반 제품 검색 및 추천
- **스마트 체크아웃 지원**: 체크아웃 프로세스 자동화 및 개인화
- **개인화된 추천**: 사용자 행동 기반 제품 추천

### 기술 스택

- **Node.js**: 백엔드 런타임
- **Playwright**: 웹 크롤링 및 브라우저 자동화
- **Gemini AI**: 자연어 처리 및 컨텐츠 추출
- **Firebase**: 세션 관리 및 데이터 저장
- **Algolia**: 제품 검색 및 인덱싱
- **Intercom**: 대화형 인터페이스

## 시스템 아키텍처

LG 브라질 A2A 쇼핑 어시스턴트는 다음과 같은 구조로 구성되어 있습니다:

```
+-------------------+       +-------------------+
| 사용자 인터페이스 위젯 |<----->| LLM 인터페이스 에이전트|
+-------------------+       +-------------------+
           |                          |
           v                          v
+-------------------+       +-------------------+
| 대화 컨텍스트 관리 |<----->| 제품 추천 에이전트 |
+-------------------+       +-------------------+
           |                          |
           v                          v
+-------------------+       +-------------------+
| 장바구니 연동 에이전트|<----->| 데이터 관리 에이전트|
+-------------------+       +-------------------+
                                     |
                                     v
                           +-------------------+
                           | 크롤링 조율 에이전트|
                           +-------------------+
                                     |
                                     v
                           +-------------------+
                           | LG 브라질 웹사이트 |
                           +-------------------+
```

### 데이터 흐름

1. **크롤링 단계**: 크롤링 조율 에이전트가 LG 브라질 웹사이트에서 데이터를 수집하고 데이터 관리 에이전트에 전달합니다.
2. **인덱싱 단계**: 데이터 관리 에이전트가 수집된 데이터를 구조화하고 Algolia에 인덱싱합니다.
3. **질의 단계**: 사용자가 자연어로 질문하면 LLM 인터페이스 에이전트가 이를 해석하고 제품 추천 에이전트에 의도를 전달합니다.
4. **검색 단계**: 제품 추천 에이전트가 인덱싱된 데이터를 검색하고 결과를 반환합니다.
5. **응답 단계**: LLM 인터페이스 에이전트가 검색 결과를 자연어로 변환하여 사용자에게 제공합니다.
6. **체크아웃 단계**: 사용자가 구매하고자 할 때 장바구니 연동 에이전트가 체크아웃 프로세스를 지원합니다.

## 주요 컴포넌트

### 브라우저 컨트롤러 (`scripts/controllers/browser-controller.js`)

브라우저 조작과 액션 관리를 담당하는 핵심 모듈입니다. Playwright를 사용하여 웹페이지와 상호작용하고, 다양한 브라우저 액션을 추상화하여 제공합니다.

```javascript
const controller = new BrowserController({
  browserOptions: {
    headless: true,
    slowMo: 50
  }
});

// 액션 실행 예시
await controller.executeAction('goToUrl', { url: 'https://www.lge.com/br' });
await controller.executeAction('clickElement', { selector: '.product-link' });
```

### 지능형 추출기 (`scripts/extractors/intelligent-extractor.js`)

LLM을 활용하여 웹페이지에서 구조화된 정보를 추출하는 모듈입니다. 웹페이지를 청크로 분할하여 병렬 처리하고, 결과를 병합하여 정확한 데이터를 제공합니다.

```javascript
const extractor = new IntelligentExtractor({
  llmProvider: 'google',
  llmModel: 'gemini-pro',
  maxParallelChunks: 3
});

// HTML에서 제품 정보 추출
const productInfo = await extractor.extractProductInfo(html);
```

### 체크아웃 자동화 (`scripts/checkout/checkout-automation.js`)

체크아웃 프로세스를 분석하고, 사용자 정보를 자동으로 매핑하여 구매 과정을 간소화하는 모듈입니다. 딥링크 생성을 통해 원활한 구매 경험을 제공합니다.

```javascript
const checkoutAutomation = new CheckoutAutomation({
  browserController: controller,
  dataDir: './data/checkout'
});

// 체크아웃 프로세스 분석
const checkoutProcess = await checkoutAutomation.analyzeCheckoutProcess(productUrl);

// 딥링크 생성
const deeplink = checkoutAutomation.generateDeeplink(productId, userInfo);
```

### 크롤링 관리자 (`scripts/crawlers/crawling-manager.js`)

크롤링 작업을 관리하고 조율하는 중앙 모듈입니다. 카테고리, 제품, 검색 결과 등의 크롤링을 관리하고, 데이터를 저장합니다.

```javascript
const crawlingManager = new CrawlingManager({
  browserController: controller,
  extractorOptions: {
    llmProvider: 'google',
    maxParallelChunks: 3
  }
});

// 카테고리 크롤링
const products = await crawlingManager.crawlCategory(categoryUrl);

// 제품 상세 정보 크롤링
const productDetails = await crawlingManager.crawlProductDetails(productUrls);
```

## 개발 환경 설정

### 필수 요구사항

- Node.js 18.x 이상
- NPM 또는 Yarn
- Playwright 지원 브라우저 (Chromium)

### 설치 과정

1. 저장소 클론

```bash
git clone https://github.com/yourusername/LGE_A2A.git
cd LGE_A2A
```

2. 의존성 설치

```bash
npm install
```

3. Playwright 브라우저 설치

```bash
npx playwright install chromium --with-deps
```

4. 환경 변수 설정

프로젝트 루트에 `.env` 파일을 생성하고 다음 변수를 설정합니다:

```
# Algolia 설정
ALGOLIA_APP_ID=your-algolia-app-id
ALGOLIA_ADMIN_API_KEY=your-algolia-admin-api-key
ALGOLIA_SEARCH_API_KEY=your-algolia-search-api-key
ALGOLIA_INDEX_NAME=lg_br_products

# Intercom 설정
INTERCOM_APP_ID=your-intercom-app-id
INTERCOM_ACCESS_TOKEN=your-intercom-access-token

# 브라우저 설정
HEADLESS=true
SLOW_MO=50
BROWSER_TIMEOUT=30000

# 크롤링 설정
MAX_RETRIES=3
MAX_CONCURRENCY=5
DATA_DIR=./data

# LLM 설정
LLM_PROVIDER=google
LLM_MODEL=gemini-pro
LLM_API_KEY=your-api-key

# 로깅 설정
LOG_LEVEL=info
LOG_TO_FILE=true
```

## 핵심 개발 작업

### 1. 크롤링 작업 개발

새로운 크롤링 작업을 개발하려면 다음 단계를 따르세요:

1. 크롤링 대상 페이지 구조 분석
2. 브라우저 컨트롤러 액션 시퀀스 설계
3. 추출 목표 정의
4. 크롤링 스크립트 작성

예시:

```javascript
// 새로운 크롤링 작업 추가
async function crawlPromotions() {
  const browser = await browserController.executeAction('launchBrowser');
  await browserController.executeAction('goToUrl', { url: 'https://www.lge.com/br/promocoes' });
  
  // 데이터 추출
  const html = await browserController.executeAction('extractPageContent');
  const promotions = await intelligentExtractor.extractContent(
    html.result,
    "Extract all current promotions including title, description, discount amount, validity period, and applicable products"
  );
  
  // 데이터 저장
  fs.writeFileSync('./data/promotions.json', JSON.stringify(promotions, null, 2));
  
  await browserController.executeAction('closeBrowser');
  return promotions;
}
```

### 2. 추출기 확장

새로운 추출 패턴을 추가하려면 IntelligentExtractor 클래스에 메서드를 추가하세요:

```javascript
// scripts/extractors/intelligent-extractor.js에 메서드 추가
IntelligentExtractor.prototype.extractPromotions = async function(html) {
  try {
    const extractionGoal = "Extract detailed promotion information including title, description, discount amount, validity period, and applicable products.";
    
    const schema = {
      "type": "object",
      "properties": {
        "promotions": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "title": { "type": "string" },
              "description": { "type": "string" },
              "discountAmount": { "type": ["string", "number"] },
              "startDate": { "type": ["string", "null"] },
              "endDate": { "type": ["string", "null"] },
              "applicableProducts": {
                "type": "array",
                "items": { "type": "string" }
              }
            }
          }
        }
      }
    };
    
    return await this.extractContent(html, extractionGoal, { schema });
  } catch (error) {
    this.logger.error('Promotions extraction failed:', error);
    throw error;
  }
};
```

### 3. 체크아웃 프로세스 개선

체크아웃 자동화 개선을 위해 다음과 같은 작업을 할 수 있습니다:

1. 새로운 필드 매핑 전략 추가
2. 다양한 폼 타입 처리 로직 개선
3. 오류 처리 및 재시도 메커니즘 강화

예시:

```javascript
// 새로운 필드 매핑 전략 추가
FormFieldMappingManager.prototype.mapAddressFields = function(address, params) {
  // 주소 객체를 개별 필드로 분해
  const addressParts = this.parseAddressString(address);
  
  // 각 부분을 폼 필드에 매핑
  if (addressParts.street) params.set('street', addressParts.street);
  if (addressParts.number) params.set('number', addressParts.number);
  if (addressParts.complement) params.set('complement', addressParts.complement);
  if (addressParts.neighborhood) params.set('neighborhood', addressParts.neighborhood);
  if (addressParts.city) params.set('city', addressParts.city);
  if (addressParts.state) params.set('state', addressParts.state);
  if (addressParts.postalCode) params.set('postalCode', addressParts.postalCode);
};
```

## 테스트 및 디버깅

### 단위 테스트 

```bash
# 모든 테스트 실행
npm test

# 특정 컴포넌트 테스트
npm test -- --testPathPattern=browser-controller

# 특정 테스트 파일 실행
npm test -- scripts/test-intelligent-extractor.js
```

### 크롤링 테스트

```bash
# 기본 크롤링 테스트
npm run test:crawl

# 특정 카테고리 크롤링 테스트
node scripts/test-crawl.js --category=tv

# 체크아웃 테스트
npm run test:checkout
```

### 디버깅 팁

1. 헤드리스 모드 비활성화
   - `.env` 파일에서 `HEADLESS=false` 설정
   - 브라우저 동작을 시각적으로 확인 가능

2. 로깅 레벨 상향
   - `.env` 파일에서 `LOG_LEVEL=debug` 설정
   - 더 자세한 로그 확인 가능

3. 스크린샷 활용
   - 문제가 발생하는 지점에서 스크린샷 촬영

```javascript
// 디버깅을 위한 스크린샷 촬영
await browserController.executeAction('takeScreenshot', {
  path: `./debug-${Date.now()}.png`,
  fullPage: true
});
```

## 배포 프로세스

### 개발 환경에서 테스트

1. 모든 테스트 실행
```bash
npm test
```

2. 종합 통합 테스트
```bash
node scripts/test-all.js
```

### 프로덕션 빌드

```bash
# 의존성 설치 (프로덕션 모드)
npm ci --production

# 빌드 스크립트 실행
npm run build
```

### 서버 배포

1. 프로덕션 서버에 파일 업로드

```bash
rsync -avz --exclude 'node_modules' --exclude '.git' ./ user@server:/path/to/deployment/
```

2. 서버에서 의존성 설치

```bash
ssh user@server "cd /path/to/deployment && npm ci --production"
```

3. 서비스 시작

```bash
ssh user@server "cd /path/to/deployment && pm2 start ecosystem.config.js --env production"
```

### 크론 작업 설정

주기적인 데이터 업데이트를 위해 크론 작업을 설정합니다:

```bash
# 크론 작업 편집
crontab -e

# 크론 작업 추가
0 */6 * * * cd /path/to/deployment && node scripts/update-products.js >> logs/update.log 2>&1
```

## 확장 및 커스터마이징

### 새로운 브라우저 액션 추가

브라우저 컨트롤러에 새로운 액션을 추가하려면:

1. `browser-controller.js` 파일의 `registerDefaultActions` 또는 `registerShoppingActions` 메서드에 새로운 액션 추가

```javascript
// 새로운 액션 추가
this.registry.registerAction(
  'executeCustomAction',
  'Execute a custom action on the page',
  async (params, context) => {
    try {
      const page = await this.getCurrentPage();
      // 액션 로직 구현
      return ActionResult.success('Custom action executed successfully');
    } catch (error) {
      return ActionResult.error(`Failed to execute custom action: ${error.message}`);
    }
  }
);
```

### 새로운 에이전트 개발

새로운 A2A 에이전트를 개발하려면:

1. 에이전트 기본 클래스 상속
2. 필요한 메시지 핸들러 등록
3. 에이전트 통합

```javascript
const A2ABaseAgent = require('./a2a-base-agent');

class NewCustomAgent extends A2ABaseAgent {
  constructor(router) {
    super('customAgent', router);
    this.setupMessageHandlers();
  }
  
  setupMessageHandlers() {
    this.registerMessageHandler('customIntent', async (message) => {
      // 커스텀 인텐트 처리 로직
      return { success: true, data: { result: 'Custom intent processed' } };
    });
  }
  
  // 에이전트 특화 메서드 구현
}

module.exports = NewCustomAgent;
```

### LLM 모델 변경

다른 LLM 모델을 사용하려면 LLM 서비스를 업데이트하세요:

1. `.env` 파일에서 LLM 설정 변경

```
LLM_PROVIDER=openai
LLM_MODEL=gpt-4
LLM_API_KEY=your-openai-api-key
```

2. 필요한 경우 `llm-service.js` 파일 수정

## 문제 해결 가이드

### 크롤링 실패

**문제**: 크롤링이 실패하거나 예상 데이터를 추출하지 못합니다.

**해결 방법**:
1. 헤드리스 모드 비활성화로 시각적 확인
2. 로그 레벨을 디버그로 설정하여 자세한 정보 확인
3. 선택자 업데이트 (웹사이트 구조 변경 확인)
4. 대기 시간 증가 (느린 로딩 대응)
5. 재시도 횟수 증가

### LLM 관련 오류

**문제**: LLM API 호출 실패 또는 부정확한 추출 결과

**해결 방법**:
1. API 키 및 접근 권한 확인
2. 요청 토큰 수 제한 확인
3. 프롬프트 템플릿 개선
4. 청크 크기 조정
5. 다른 LLM 모델 시도

### 체크아웃 자동화 문제

**문제**: 체크아웃 프로세스가 제대로 작동하지 않습니다.

**해결 방법**:
1. 체크아웃 프로세스 재분석 (웹사이트 변경 확인)
2. 중간 스크린샷으로 문제 지점 식별
3. 버튼 클릭 및 폼 입력 로직 개선
4. 오류 처리 및 재시도 메커니즘 추가
5. 대체 경로 구현

### 메모리 사용량 문제

**문제**: 크롤링 또는 추출 과정에서 메모리 사용량이 과도하게 증가합니다.

**해결 방법**:
1. 청크 크기 감소
2. 병렬 처리 제한
3. 주기적인 가비지 컬렉션 강제 실행
4. 리소스 누수 확인 (브라우저 인스턴스, 파일 핸들 등)
5. 로깅 양 최적화

## API 참조

자세한 API 문서는 `/docs/api` 디렉토리에서 확인할 수 있습니다. 주요 모듈들의 기본 사용법은 다음과 같습니다:

### BrowserController

```javascript
const { BrowserController } = require('./scripts/controllers');

// 인스턴스 생성
const controller = new BrowserController(options);

// 액션 실행
await controller.executeAction(actionName, params);

// 브라우저 시작 및 종료
await controller.launchBrowser();
await controller.closeBrowser();
```

### IntelligentExtractor

```javascript
const { IntelligentExtractor } = require('./scripts/extractors');

// 인스턴스 생성
const extractor = new IntelligentExtractor(options);

// 컨텐츠 추출
const extractedData = await extractor.extractContent(html, extractionGoal, options);

// 특화된 추출
const productInfo = await extractor.extractProductInfo(html);
const reviews = await extractor.extractProductReviews(html);
```

### CheckoutAutomation

```javascript
const { CheckoutAutomation } = require('./scripts/checkout');

// 인스턴스 생성
const checkoutAutomation = new CheckoutAutomation({
  browserController,
  dataDir
});

// 체크아웃 프로세스 분석
const checkoutProcess = await checkoutAutomation.analyzeCheckoutProcess(productUrl);

// 체크아웃 세션 관리
const sessionId = checkoutAutomation.createCheckoutSession(userId, productId);
checkoutAutomation.updateSessionInfo(sessionId, userInfo);

// 딥링크 생성
const deeplink = checkoutAutomation.generateDeeplink(productId, userInfo);
```

### CrawlingManager

```javascript
const { CrawlingManager } = require('./scripts/crawlers');

// 인스턴스 생성
const crawlingManager = new CrawlingManager(options);

// 카테고리 크롤링
const categoryProducts = await crawlingManager.crawlCategory(categoryUrl);

// 제품 상세 정보 크롤링
const productDetails = await crawlingManager.crawlProductDetails(productUrls);

// 체크아웃 프로세스 크롤링
const checkoutProcess = await crawlingManager.crawlCheckoutProcess(productUrl);
```