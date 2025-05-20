# LG 브라질 A2A 쇼핑 어시스턴트

크롤링과 캐시 기반으로 LG 브라질 웹사이트(www.lge.com/br)에서 데이터를 수집하고, 고객에게 차별화된 쇼핑 경험을 제공하는 A2A 쇼핑 어시스턴트 프로젝트입니다.

## 프로젝트 개요

이 프로젝트는 기존 데이터베이스 직접 접근 없이 웹 크롤링과 캐시 기반으로 운영되는 지능형 쇼핑 어시스턴트를 구현합니다. MCP(Model Context Protocol)와 A2A(Agent to Agent) 프로토콜을 활용하여 개발 기간을 단축하고, 고객에게 혁신적인 대화형 쇼핑 경험을 제공합니다.

## 폴더 구조

```
/
├── data/                 # 크롤링된 데이터 저장
├── logs/                 # 로그 파일 저장
├── scripts/              # 스크립트 파일들
│   ├── config/           # 설정 파일
│   ├── controllers/      # 브라우저 컨트롤러
│   ├── extractors/       # 컨텐츠 추출 모듈
│   ├── checkout/         # 체크아웃 자동화 모듈
│   ├── crawlers/         # 크롤링 관리 모듈
│   ├── models/           # 데이터 모델
│   ├── services/         # API 서비스
│   ├── utils/            # 유틸리티 함수
│   ├── crawl.js          # 크롤링 실행 스크립트
│   ├── test-crawl.js     # 크롤링 테스트 스크립트
│   └── ...
└── ...
```

## 주요 기능

### 1. 지능형 웹 크롤링
- 브라우저 자동화를 통한 데이터 수집
- LLM을 활용한 컨텐츠 추출 및 구조화
- 병렬 처리를 통한 성능 최적화

### 2. 대화형 제품 탐색
- 자연어 기반 제품 검색 및 필터링
- 맥락 이해 기반 대화 흐름 유지
- 개인화된 제품 추천

### 3. 스마트 체크아웃 지원
- 체크아웃 프로세스 자동 분석
- 사용자 정보 자동 매핑
- 원활한 구매 경험 제공

## 설치 및 실행

### 필수 요구사항
- Node.js 18.x 이상
- Playwright 사용을 위한 시스템 종속성

### 설치
```bash
# 저장소 클론
git clone https://github.com/yourusername/LGE_A2A.git
cd LGE_A2A

# 의존성 설치
npm install

# Playwright 브라우저 설치
npx playwright install chromium --with-deps
```

### 환경 설정
`.env.example` 파일을 `.env`로 복사하고 필요한 설정을 추가합니다:

#### 주요 환경 변수
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

> **참고**: 환경 변수 호환성 유지를 위해 `ALGOLIA_API_KEY`가 설정된 경우 `ALGOLIA_ADMIN_API_KEY`로 사용하며, `INTERCOM_API_KEY`가 설정된 경우 `INTERCOM_ACCESS_TOKEN`으로 사용합니다.

### 실행
```bash
# 크롤링 테스트 실행
npm run test:crawl

# 체크아웃 테스트 실행
npm run test:checkout

# 디버그 모드로 실행
npm run test:crawl -- --debug
```

## 핵심 컴포넌트

### 브라우저 컨트롤러
브라우저 조작과 액션 관리를 담당하는 모듈입니다. Playwright를 사용하여 웹페이지와 상호작용하고, 다양한 브라우저 액션을 추상화하여 제공합니다.

### 지능형 추출기
LLM을 활용하여 웹페이지에서 구조화된 정보를 추출합니다. 페이지를 청크로 분할하여 병렬 처리하고, 결과를 병합하여 정확한 데이터를 제공합니다.

### 체크아웃 자동화
체크아웃 프로세스를 분석하고, 사용자 정보를 자동으로 매핑하여 구매 과정을 간소화합니다. 딥링크 생성을 통해 원활한 구매 경험을 제공합니다.

### 크롤링 관리자
크롤링 작업을 관리하고 조율하는 중앙 모듈입니다. 카테고리, 제품, 검색 결과 등의 크롤링을 관리하고, 데이터를 저장합니다.

### 환경 변수 설정 주의사항

환경 변수 이름 변경에 대응하기 위해 `/src/utils/config.js` 파일을 통해 환경 변수에 접근하는 것을 권장합니다. 이 래퍼 유틸리티는 다음과 같은 변수들의 이전/현재 명칭을 모두 지원합니다:

1. **Algolia API 키**:
   - `ALGOLIA_ADMIN_API_KEY`: 관리 작업용 API 키
   - `ALGOLIA_SEARCH_API_KEY`: 검색 작업용 API 키
   - `ALGOLIA_API_KEY`: 호환성을 위한 통합 API 키 (관리 작업에는 주의해서 사용)

2. **Intercom 인증**:
   - `INTERCOM_ACCESS_TOKEN`: Intercom API 접근 토큰
   - `INTERCOM_API_KEY`: 호환성을 위한 대체 인증 키

이러한 래퍼 함수 사용 예시:
```javascript
const { getAlgoliaConfig, getIntercomConfig } = require('../utils/config');

// Algolia 설정 가져오기
const algoliaConfig = getAlgoliaConfig();
console.log(algoliaConfig.appId, algoliaConfig.adminApiKey);

// Intercom 설정 가져오기
const intercomConfig = getIntercomConfig();
console.log(intercomConfig.appId, intercomConfig.apiKey);
```

## License
This project is licensed under the MIT License - see the LICENSE file for details.
