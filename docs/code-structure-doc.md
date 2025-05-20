# LG 브라질 A2A 쇼핑 어시스턴트 코드 구조 및 관계 분석

## 1. 프로젝트 개요

이 문서는 LG 브라질 쇼핑몰(www.lge.com/br)에서 기존 데이터베이스 직접 접근 없이 크롤링 및 캐시 기반으로 고객에게 차별화된 쇼핑 경험을 제공하는 A2A 쇼핑 어시스턴트 프로젝트의 코드 구조와 각 파일의 역할, 그리고 파일 간의 관계를 설명합니다.

프로젝트는 MCP(Model Context Protocol) 및 A2A(Agent to Agent) 프로토콜을 활용하여 개발 시간을 단축하고, 상용 에이전트와 경량 커스텀 에이전트를 결합하여 구현되었습니다.

## 2. 디렉토리 구조 개요

프로젝트는 다음과 같은 주요 디렉토리로 구성되어 있습니다:

```
/
├── api/                  # API 엔드포인트 및 서버 코드
├── config/               # 환경별 설정 파일
├── data/                 # 크롤링된 데이터 및 정적 데이터
├── docs/                 # 프로젝트 문서
├── scripts/              # 크롤링, 테스트, 최적화 스크립트
├── src/                  # 소스 코드
│   ├── agents/           # A2A 에이전트 구현
│   ├── api/              # API 내부 구현
│   ├── protocols/        # A2A 및 MCP 프로토콜 구현
│   ├── services/         # 외부 서비스 연동 코드
│   ├── storage/          # 데이터 저장 및 검색 관련 코드
│   ├── ui/               # UI 위젯 코드
│   └── utils/            # 유틸리티 함수
└── test/                 # 테스트 코드
    ├── e2e/              # 엔드-투-엔드 테스트
    ├── integration/      # 통합 테스트
    └── unit/             # 단위 테스트
```

## 3. 핵심 컴포넌트 및 파일 분석

### 3.1 프로토콜 구현 (src/protocols/)

#### `a2a-router.js`
- **역할**: A2A 프로토콜의 메시지 라우팅을 담당하는 핵심 컴포넌트
- **관계**: 모든 에이전트들은 이 라우터를 통해 서로 통신함
- **주요 기능**:
  - 에이전트 등록 및 관리
  - 메시지 라우팅 및 전달
  - 이벤트 기반 통신 지원

#### `a2a-base-agent.js`
- **역할**: 모든 A2A 에이전트의 기본 클래스
- **관계**: 모든 에이전트 클래스의 부모 클래스
- **주요 기능**:
  - 메시지 처리 인터페이스 제공
  - 라우터와의 통신 표준화
  - 메시지 핸들러 등록 메커니즘

#### `mcp-context-manager.js`
- **역할**: LLM과의 통신에서 컨텍스트를 관리하는 프로토콜 구현
- **관계**: 대화 에이전트 및 LLM 서비스와 연동
- **주요 기능**:
  - 프롬프트 템플릿 관리
  - 사용자별 컨텍스트 저장 및 업데이트
  - 컨텍스트 기반 프롬프트 생성

### 3.2 에이전트 구현 (src/agents/)

#### `dialog/dialog-agent.js`
- **역할**: 사용자와의 자연어 대화를 처리하는 에이전트
- **관계**: LLM 서비스, 컨텍스트 관리자, 제품 추천 에이전트와 연동
- **주요 기능**:
  - 사용자 의도 분석
  - 자연어 응답 생성
  - 다른 에이전트 조율

#### `product-recommendation/product-recommendation-agent.js`
- **역할**: 제품 추천 로직을 담당하는 에이전트
- **관계**: Algolia 검색 서비스, 대화 에이전트와 연동
- **주요 기능**:
  - 사용자 선호도 기반 제품 추천
  - 검색 쿼리 구성 및 결과 처리
  - 추천 결과 최적화

#### `crawling-coordinator/crawling-coordinator-agent.js`
- **역할**: 크롤링 작업을 조율하는 에이전트
- **관계**: Apify 크롤링 서비스, 데이터 관리 에이전트와 연동
- **주요 기능**:
  - 크롤링 작업 스케줄링
  - 데이터 변경 감지
  - 크롤링 결과 처리

#### `cart/cart-agent.js`
- **역할**: 장바구니 기능을 담당하는 에이전트
- **관계**: 대화 에이전트, 세션 관리 서비스와 연동
- **주요 기능**:
  - 장바구니 항목 추가/수정/삭제
  - 장바구니 상태 추적
  - 장바구니 딥링크 생성

#### `checkout-automation/checkout-automation-agent.js`
- **역할**: 체크아웃 프로세스 자동화를 담당하는 에이전트
- **관계**: 크롤링 조율 에이전트, 대화 에이전트, 구매 프로세스 에이전트와 연동
- **주요 기능**:
  - 체크아웃 프로세스 크롤링
  - 체크아웃 단계 매핑
  - 자동화된 체크아웃 지원

#### `purchase-process/purchase-process-agent.js`
- **역할**: 구매 과정을 안내하는 에이전트
- **관계**: 대화 에이전트, 체크아웃 자동화 에이전트와 연동
- **주요 기능**:
  - 구매 단계별 정보 수집
  - 결제 프로세스 안내
  - 구매 완료 지원

#### `context-manager/context-manager-agent.js`
- **역할**: 대화 컨텍스트를 관리하는 에이전트
- **관계**: 대화 에이전트, MCP 컨텍스트 매니저와 연동
- **주요 기능**:
  - 사용자 대화 세션 관리
  - 대화 컨텍스트 유지
  - 맥락 기반 응답 최적화

### 3.3 서비스 (src/services/)

#### `vertex-ai.js`
- **역할**: Google의 Vertex AI API와 연동하여 Gemini 모델 접근을 제공
- **관계**: 대화 에이전트, MCP 프롬프트 매니저와 연동
- **주요 기능**:
  - Gemini 모델 API 호출
  - 응답 처리 및 변환
  - 오류 처리 및 재시도

#### `algolia.js`
- **역할**: Algolia 검색 서비스와의 연동을 담당
- **관계**: 제품 추천 에이전트, 검색 서비스와 연동
- **주요 기능**:
  - 제품 데이터 인덱싱
  - 검색 쿼리 처리
  - 검색 결과 반환

#### `apify.js`
- **역할**: Apify 웹 크롤링 서비스와의 연동을 담당
- **관계**: 크롤링 조율 에이전트와 연동
- **주요 기능**:
  - 크롤링 작업 시작 및 관리
  - 크롤링 결과 수집
  - 크롤링 작업 상태 추적

#### `firebase.js`
- **역할**: Firebase 서비스와의 연동을 담당
- **관계**: 세션 관리 서비스, 스토리지 레포지토리와 연동
- **주요 기능**:
  - 사용자 세션 관리
  - 데이터 저장 및 검색
  - 실시간 업데이트 처리

#### `llm/mcp-gemini-prompt-manager.js`
- **역할**: Gemini 모델용 MCP 프롬프트 관리
- **관계**: Vertex AI 서비스, 대화 에이전트와 연동
- **주요 기능**:
  - 프롬프트 템플릿 등록 및 관리
  - 컨텍스트 기반 프롬프트 생성
  - 응답 후처리

#### `search/algolia-search-service.js`
- **역할**: Algolia 기반 제품 검색 서비스
- **관계**: 제품 추천 에이전트, Algolia 서비스와 연동
- **주요 기능**:
  - 고급 제품 검색 기능
  - 필터링 및 정렬
  - 검색 결과 변환

#### `crawling/apify-crawling-service.js`
- **역할**: Apify 기반 크롤링 서비스
- **관계**: 크롤링 조율 에이전트, Apify 서비스와 연동
- **주요 기능**:
  - 크롤링 작업 설정 및 실행
  - 크롤링 결과 처리
  - 오류 처리 및 재시도

#### `crawling/checkout/checkout-process-service.js`
- **역할**: 체크아웃 프로세스 관련 서비스
- **관계**: 체크아웃 자동화 에이전트, 구매 프로세스 에이전트와 연동
- **주요 기능**:
  - 체크아웃 프로세스 데이터 관리
  - 체크아웃 단계 매핑
  - 필드 매핑 처리

#### `crawling/checkout/checkout-deeplink-generator.js`
- **역할**: 체크아웃 딥링크 생성 서비스
- **관계**: 체크아웃 프로세스 서비스, 구매 프로세스 에이전트와 연동
- **주요 기능**:
  - 사용자 정보 기반 딥링크 생성
  - 체크아웃 URL 파라미터 매핑
  - 보안 처리

#### `session/firebase-session-service.js`
- **역할**: Firebase 기반 세션 관리 서비스
- **관계**: 컨텍스트 관리 에이전트, Firebase 서비스와 연동
- **주요 기능**:
  - 사용자 세션 생성 및 관리
  - 세션 데이터 저장 및 검색
  - 세션 만료 처리

### 3.4 스토리지 (src/storage/)

#### `cache/cache-manager.ts`
- **역할**: 캐시 관리를 담당하는 매니저
- **관계**: 다양한 캐시 구현체와 연동
- **주요 기능**:
  - 캐시 설정 및 관리
  - 다단계 캐싱 전략
  - 캐시 무효화 처리

#### `repositories/firebase.repository.ts`
- **역할**: Firebase 기반 데이터 저장소
- **관계**: 스토리지 팩토리, Firebase 서비스와 연동
- **주요 기능**:
  - Firebase에 데이터 저장 및 검색
  - 트랜잭션 처리
  - 실시간 업데이트 지원

#### `repositories/json-file.repository.ts`
- **역할**: JSON 파일 기반 데이터 저장소
- **관계**: 스토리지 팩토리와 연동
- **주요 기능**:
  - JSON 파일로 데이터 저장 및 검색
  - 파일 잠금 및 동시성 처리
  - 백업 및 복구 지원

#### `search/algolia.search.ts`
- **역할**: Algolia 기반 검색 구현체
- **관계**: 검색 팩토리, Algolia 서비스와 연동
- **주요 기능**:
  - Algolia 인덱스 관리
  - 검색 쿼리 처리
  - 검색 결과 변환

### 3.5 API (src/api/)

#### `server.js`
- **역할**: API 서버 초기화 및 설정
- **관계**: 라우트 핸들러, 미들웨어와 연동
- **주요 기능**:
  - Express 서버 설정
  - 미들웨어 등록
  - 에러 처리

#### `routes/dialog.js`
- **역할**: 대화 관련 API 엔드포인트
- **관계**: 대화 에이전트, 컨텍스트 관리 에이전트와 연동
- **주요 기능**:
  - 사용자 메시지 처리
  - 응답 생성 및 반환
  - 대화 세션 관리

#### `routes/product.js`
- **역할**: 제품 관련 API 엔드포인트
- **관계**: 제품 추천 에이전트, 검색 서비스와 연동
- **주요 기능**:
  - 제품 검색 및 필터링
  - 제품 상세 정보 반환
  - 추천 제품 조회

#### `routes/cart.js`
- **역할**: 장바구니 관련 API 엔드포인트
- **관계**: 장바구니 에이전트, 세션 서비스와 연동
- **주요 기능**:
  - 장바구니 항목 추가/수정/삭제
  - 장바구니 조회
  - 체크아웃 시작

#### `routes/session.js`
- **역할**: 세션 관련 API 엔드포인트
- **관계**: 세션 서비스, 컨텍스트 관리 에이전트와 연동
- **주요 기능**:
  - 세션 생성 및 관리
  - 인증 처리
  - 세션 데이터 관리

### 3.6 스크립트 (scripts/)

#### `crawl.js`
- **역할**: 메인 크롤링 스크립트
- **관계**: 크롤링 매니저, Apify 서비스와 연동
- **주요 기능**:
  - LG 브라질 사이트 크롤링 실행
  - 제품 데이터 수집
  - Algolia 인덱싱

#### `update-products.js`
- **역할**: 제품 정보 업데이트 스크립트
- **관계**: 크롤링 매니저, Algolia 서비스와 연동
- **주요 기능**:
  - 제품 정보 변경 감지
  - 가격 및 재고 업데이트
  - 인덱스 갱신

#### `controllers/browser-controller.js`
- **역할**: 브라우저 제어 컨트롤러
- **관계**: 액션 레지스트리, 크롤링 스크립트와 연동
- **주요 기능**:
  - 브라우저 세션 관리
  - 액션 실행 및 조율
  - 오류 처리 및 재시도

#### `controllers/action-registry.js`
- **역할**: 브라우저 액션 등록 및 관리
- **관계**: 브라우저 컨트롤러와 연동
- **주요 기능**:
  - 브라우저 액션 등록
  - 액션 조회 및 실행
  - 커스텀 액션 지원

#### `crawlers/crawling-manager.js`
- **역할**: 크롤링 작업 전반을 관리
- **관계**: 브라우저 컨트롤러, 지능형 추출기, 체크아웃 자동화와 연동
- **주요 기능**:
  - 크롤링 전략 조율
  - 병렬 처리 관리
  - 결과 저장 및 처리

#### `extractors/intelligent-extractor.js`
- **역할**: LLM 기반 지능형 컨텐츠 추출
- **관계**: LLM 서비스, 크롤링 매니저와 연동
- **주요 기능**:
  - 웹페이지 컨텐츠 분석
  - 구조화된 정보 추출
  - 데이터 정제 및 가공

#### `checkout/checkout-automation.js`
- **역할**: 체크아웃 프로세스 자동화
- **관계**: 브라우저 컨트롤러, 체크아웃 프로세스 서비스와 연동
- **주요 기능**:
  - 체크아웃 프로세스 분석
  - 체크아웃 자동화 실행
  - 딥링크 생성

### 3.7 UI (src/ui/)

#### `widget.js`
- **역할**: 쇼핑 어시스턴트 UI 위젯
- **관계**: 대화 API, 제품 API와 연동
- **주요 기능**:
  - 대화형 인터페이스 제공
  - 제품 검색 및 표시
  - 세션 관리

### 3.8 테스트 코드 (test/)

#### `unit/a2a-router.test.js`
- **역할**: A2A 라우터 단위 테스트
- **관계**: A2A 라우터, 가짜 에이전트와 연동
- **주요 기능**:
  - 라우터 기능 검증
  - 에이전트 등록 및 통신 테스트
  - 오류 처리 테스트

#### `unit/dialog-agent.test.js`
- **역할**: 대화 에이전트 단위 테스트
- **관계**: 대화 에이전트, 가짜 LLM 서비스와 연동
- **주요 기능**:
  - 의도 분석 테스트
  - 응답 생성 테스트
  - 에이전트 통신 테스트

#### `integration/checkout-automation.test.js`
- **역할**: 체크아웃 자동화 통합 테스트
- **관계**: 체크아웃 자동화, 브라우저 컨트롤러와 연동
- **주요 기능**:
  - 체크아웃 프로세스 분석 테스트
  - 폼 필드 매핑 테스트
  - 딥링크 생성 테스트

#### `integration/intelligent-extractor.test.js`
- **역할**: 지능형 추출기 통합 테스트
- **관계**: 지능형 추출기, LLM 서비스와 연동
- **주요 기능**:
  - 컨텐츠 분할 테스트
  - 정보 추출 테스트
  - 결과 병합 테스트

## 4. 주요 워크플로우 및 모듈 간 관계

### 4.1 대화형 제품 검색 워크플로우

1. 사용자가 UI 위젯을 통해 제품 검색 쿼리를 입력
2. `dialog-agent`가 사용자 의도를 분석하고 `product-recommendation-agent`에 요청 전달
3. `product-recommendation-agent`가 Algolia 검색 서비스를 통해 제품 검색
4. 결과를 `dialog-agent`에 반환하고, 이를 기반으로 응답 생성
5. 생성된 응답이 UI 위젯을 통해 사용자에게 표시

### 4.2 체크아웃 자동화 워크플로우

1. 사용자가 제품 구매 의사를 표현
2. `dialog-agent`가 `purchase-process-agent`에 구매 프로세스 시작 요청
3. `purchase-process-agent`가 대화를 통해 필요한 정보 수집
4. 수집된 정보를 `checkout-automation-agent`에 전달
5. `checkout-automation-agent`가 `checkout-deeplink-generator`를 통해 딥링크 생성
6. 생성된 딥링크를 사용자에게 제공하여 체크아웃 진행

### 4.3 크롤링 및 데이터 업데이트 워크플로우

1. 정기적으로 `crawl.js` 또는 `update-products.js` 스크립트 실행
2. `crawling-manager`가 `browser-controller`를 통해 웹사이트 접근
3. `intelligent-extractor`가 페이지 컨텐츠에서 제품 정보 추출
4. 추출된 정보가 Algolia에 인덱싱되고 저장소에 저장
5. 변경된 정보는 실시간으로 쇼핑 어시스턴트에 반영

## 5. 핵심 인터페이스 및 데이터 흐름

### 5.1 A2A 메시지 형식

```json
{
  "messageId": "msg_123456",
  "fromAgent": "dialogAgent",
  "toAgent": "productRecommendationAgent",
  "messageType": "request",
  "intent": "getRecommendation",
  "payload": {
    "userQuery": "여름용 에어컨 추천해줘",
    "userPreferences": {
      "priceRange": "중간",
      "features": ["에너지 효율", "저소음"]
    },
    "conversationContext": {
      "previousProducts": ["LG-AC-2024-Model"]
    }
  },
  "timestamp": "2025-05-19T15:30:00Z"
}
```

### 5.2 MCP 프롬프트 템플릿 예시

```
당신은 LG 브라질 쇼핑 어시스턴트입니다.

# 사용자 정보
사용자 ID: {{userId}}
선호 카테고리: {{preferredCategories}}
최근 검색어: {{recentSearches}}

# 제품 데이터 컨텍스트
{{productContext}}

# 현재 대화 컨텍스트
{{conversationHistory}}

# 지시사항
사용자의 질문에서 제품 검색 의도를 파악하여 관련된 제품을 추천해주세요.
제품 추천 시 사용자의 선호도와 이전 검색 기록을 고려하세요.
제품의 주요 특징, 가격, 재고 상태를 명확하게 설명해주세요.

사용자 질문: {{userQuery}}
```

### 5.3 프로젝트 의존성 그래프

```
UI Widget
  ↓↑
Dialog API
  ↓↑
Dialog Agent ⟷ MCP Context Manager ⟷ Gemini LLM
  ↓↑                ↑ 
Product Recommendation Agent ⟷ Algolia Search Service
  ↑                            ↑
Crawling Coordinator Agent ⟷ Apify Crawling Service
  ↓                            ↓
Data Management Agent ⟷ Firebase Storage
  ↓↑                            ↑
Purchase Process Agent ⟷ Checkout Automation Agent
  ↓↑
Cart Agent
```

## 6. 설정 및 환경

### 6.1 환경 설정 (config/)

- `default.js`: 기본 설정
- `development.js`: 개발 환경 설정
- `production.js`: 프로덕션 환경 설정
- `index.js`: 환경에 따른 설정 로드

### 6.2 API 키 및 보안 설정

- `.env`: 환경 변수 및 API 키 설정
- `credentials/`: 서비스 계정 인증 정보

## 7. 테스트 및 문서화

### 7.1 테스트 전략

- 단위 테스트: 개별 에이전트 및 서비스 테스트
- 통합 테스트: 여러 모듈이 함께 작동하는 시나리오 테스트
- E2E 테스트: 전체 시스템 워크플로우 테스트

### 7.2 문서화

- `README.md`: 프로젝트 개요 및 시작 가이드
- `DEPLOYMENT.md`: 배포 가이드
- `CONTRIBUTING.md`: 기여 가이드
- `docs/`: API 문서 및 개발 가이드

## 8. 핵심 기술 스택

- **프레임워크**: Next.js, Express
- **데이터베이스**: Firebase Firestore
- **검색 엔진**: Algolia
- **크롤링**: Playwright, Apify
- **LLM**: Google Vertex AI (Gemini)
- **테스트**: Jest, Cypress
- **캐싱**: Redis, LRU Cache
- **UI**: React
- **배포**: Vercel Functions

## 9. 결론

LG 브라질 A2A 쇼핑 어시스턴트 프로젝트는 A2A 프로토콜과 MCP를 기반으로 다양한 에이전트들이 협력하여 동작하는 분산 시스템입니다. 이 시스템은 데이터베이스 직접 접근 없이도 크롤링 및 캐시 기반으로 고객에게 차별화된 쇼핑 경험을 제공합니다.

각 코드 파일과 모듈은 명확한 책임과 역할을 가지고 있으며, 표준화된 인터페이스를 통해 서로 통신합니다. 이러한 모듈화된 구조는 확장성과 유지보수성을 높이며, 빠른 개발 주기를 지원합니다.
