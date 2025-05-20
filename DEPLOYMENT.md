# LG 브라질 A2A 쇼핑 어시스턴트 배포 가이드

이 문서는 LG 브라질 A2A 쇼핑 어시스턴트를 프로덕션 환경에 배포하기 위한 상세 가이드입니다.

## 목차
1. [사전 준비](#사전-준비)
2. [환경 설정](#환경-설정)
3. [Vercel 배포](#vercel-배포)
4. [외부 서비스 연동](#외부-서비스-연동)
5. [정기 크롤링 설정](#정기-크롤링-설정)
6. [모니터링 및 유지보수](#모니터링-및-유지보수)
7. [문제 해결](#문제-해결)

## 사전 준비

### 필수 계정 및 서비스
- [Vercel](https://vercel.com) 계정
- [Google Cloud Platform](https://cloud.google.com) 계정
  - Vertex AI 활성화
  - 서비스 계정 및 API 키 생성
- [Firebase](https://firebase.google.com) 프로젝트
  - Firestore 활성화
  - 서비스 계정 키 생성
- [Algolia](https://www.algolia.com) 계정
  - 인덱스 생성
  - API 키 생성
- [Apify](https://apify.com) 계정
  - API 토큰 생성
- [Intercom](https://www.intercom.com) 계정
  - Messenger 설정
  - API 키 생성

### 개발 환경
- Node.js v18 이상
- npm 또는 yarn
- Git

## 환경 설정

### API 키 수집
모든 필요한 API 키와 설정 정보를 수집합니다:

1. **Google Cloud (Vertex AI)**
   - 프로젝트 ID
   - 서비스 계정 키 (JSON 파일)

2. **Firebase**
   - 프로젝트 ID
   - 서비스 계정 키 (JSON 파일)
   - 웹 API 키

3. **Algolia**
   - 애플리케이션 ID
   - 검색용 API 키 (클라이언트 측)
   - 관리용 API 키 (서버 측)
   - 인덱스 이름

4. **Apify**
   - API 토큰

5. **Intercom**
   - App ID
   - API 키
   - 웹사이트 ID

### 환경 변수 파일 생성
`.env` 파일을 생성하고 수집한 모든 API 키와 설정 정보를 입력합니다:

```
# 기본 설정
NODE_ENV=production
HOST=https://your-deployment-url.vercel.app

# Google Cloud (Vertex AI)
GOOGLE_CLOUD_PROJECT=your-google-cloud-project-id
GOOGLE_APPLICATION_CREDENTIALS=./google-credentials.json
VERTEX_AI_LOCATION=us-central1
VERTEX_AI_MODEL=gemini-pro

# Firebase
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_PRIVATE_KEY="your-private-key"
FIREBASE_CLIENT_EMAIL=your-client-email
FIREBASE_DATABASE_URL=https://your-project.firebaseio.com
FIREBASE_CLIENT_API_KEY=your-client-api-key

# Algolia
ALGOLIA_APP_ID=your-algolia-app-id
ALGOLIA_API_KEY=your-algolia-admin-api-key
ALGOLIA_SEARCH_KEY=your-algolia-search-key
ALGOLIA_INDEX_NAME=lge_br_products

# Apify
APIFY_API_TOKEN=your-apify-api-token

# Intercom
INTERCOM_APP_ID=your-intercom-app-id
INTERCOM_API_KEY=your-intercom-api-key
INTERCOM_WEBSITE_ID=your-intercom-website-id

# 크롤링 설정
CRAWL_SCHEDULE="0 0 * * *"  # 매일 자정에 실행 (Cron 형식)
UPDATE_LIMIT=300  # 한 번에 업데이트할 최대 제품 수
```

## Vercel 배포

### 배포 준비
1. 프로젝트 루트에 `vercel.json` 파일이 있는지 확인하고, 없으면 다음 내용으로 생성합니다:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/next"
    },
    {
      "src": "api/**/*.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/api/$1"
    },
    {
      "src": "/(.*)",
      "dest": "/$1"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  },
  "crons": [
    {
      "path": "/api/cron/update-products",
      "schedule": "0 0 * * *"
    }
  ]
}
```

2. Firebase 및 Google Cloud 서비스 계정 키를 안전하게 처리합니다:
   - Vercel 대시보드에서 환경 변수로 설정하거나
   - 프로젝트에 포함시키지 않고 배포 시 주입

### 배포 명령어
```bash
# Vercel CLI 설치 (아직 설치하지 않은 경우)
npm install -g vercel

# 로그인
vercel login

# 초기 설정 (처음 배포하는 경우)
vercel

# 프로덕션 배포
vercel --prod
```

### 환경 변수 설정
Vercel 대시보드에서:
1. 프로젝트 설정으로 이동
2. "Environment Variables" 섹션 선택
3. `.env` 파일의 모든 변수 추가
4. "Save" 클릭
5. 변경사항을 적용하기 위해 재배포

## 외부 서비스 연동

### LG 브라질 웹사이트 연동
LG 브라질 웹사이트에 쇼핑 어시스턴트 위젯을 통합하는 방법:

1. `/public/js/lge-br-injection.js` 스크립트 복사
2. LG 브라질 웹사이트 관리자에게 제공하여 사이트에 추가 요청
3. 스크립트는 다음을 수행합니다:
   - Intercom 초기화
   - 쇼핑 어시스턴트 위젯 삽입
   - 필요한 스타일시트 로드

```html
<!-- LG 브라질 웹사이트에 추가할 코드 -->
<script src="https://your-deployment-url.vercel.app/js/lge-br-injection.js"></script>
```

### Intercom 설정
1. Intercom 대시보드에서 새 앱 생성
2. Messenger 설정에서:
   - 사용자 지정 CSS 추가 (쇼핑 어시스턴트 스타일)
   - 초기 메시지 설정
   - 앱 ID 및 API 키 확인
3. ID 및 키를 환경 변수에 추가

## 정기 크롤링 설정

### Vercel Cron Jobs (권장)
Vercel의 Cron Jobs 기능을 사용하여 정기적인 데이터 업데이트를 자동화:

1. `vercel.json`에 cron 설정 추가 (이미 위 섹션에서 추가됨)
2. `/api/cron/update-products.js` 엔드포인트가 있는지 확인
3. Vercel 대시보드에서 Cron Jobs 활성화

### 대체 방법: 외부 스케줄러
Vercel Cron Jobs 대신 외부 스케줄러를 사용할 수도 있습니다:

1. **GitHub Actions**
   ```yaml
   # .github/workflows/update-products.yml
   name: Update Products

   on:
     schedule:
       - cron: '0 0 * * *'  # 매일 자정에 실행

   jobs:
     update:
       runs-on: ubuntu-latest
       steps:
         - name: Trigger Update API
           run: |
             curl -X POST https://your-deployment-url.vercel.app/api/cron/update-products \
             -H "Authorization: Bearer ${{ secrets.UPDATE_TOKEN }}"
   ```

2. **GCP Cloud Scheduler**
   - Google Cloud Console에서 Cloud Scheduler 작업 생성
   - API 엔드포인트 호출 설정

## 모니터링 및 유지보수

### 로깅 설정
1. 모든 주요 이벤트와 오류에 대한 로깅 구현
2. Vercel 로그 확인 방법:
   ```bash
   vercel logs your-deployment.vercel.app
   ```

### 성능 모니터링
1. Vercel Analytics 활성화
2. Firebase Performance Monitoring 설정

### 정기 유지보수 작업
1. 매월 1회 크롤러 패턴 검증
   - LG 브라질 웹사이트 구조 변경 감지
   - 필요시 Apify 액터 업데이트
2. 분기별 1회 API 키 순환
3. 정기적인 백업 구성

## 문제 해결

### 일반적인 문제 및 해결 방법

#### 크롤링 실패
- **증상**: 제품 데이터가 업데이트되지 않음
- **해결책**:
  1. Apify 대시보드에서 작업 로그 확인
  2. LG 브라질 웹사이트 구조 변경 여부 확인
  3. IP 차단 여부 확인 및 프록시 설정 조정
  4. 크롤링 간격 조정하여 부하 감소

#### LLM 응답 지연
- **증상**: 대화 응답이 느림
- **해결책**:
  1. Vertex AI 할당량 확인
  2. 더 성능이 좋은 Gemini 모델로 업그레이드
  3. 프롬프트 최적화하여 토큰 사용량 감소
  4. 캐싱 전략 검토

#### 인덱싱 오류
- **증상**: 검색 결과가 정확하지 않거나 누락됨
- **해결책**:
  1. Algolia 대시보드에서 인덱스 상태 확인
  2. 인덱싱 작업 로그 검토
  3. 인덱스 설정 및 검색 구성 조정
  4. 데이터 구조 검토

### 연락처
추가 지원이 필요한 경우:
- 기술 지원 이메일: support@example.com
- 긴급 연락처: +1-234-567-8900

## 배포 체크리스트

- [ ] 모든 API 키 및 서비스 계정 생성
- [ ] 환경 변수 설정 완료
- [ ] 초기 데이터 크롤링 실행
- [ ] Vercel에 배포
- [ ] Cron Jobs 설정
- [ ] LG 브라질 웹사이트에 스크립트 통합
- [ ] 모니터링 설정
- [ ] 백업 전략 구현
- [ ] 테스트 시나리오 검증

이 가이드를 따라 LG 브라질 A2A 쇼핑 어시스턴트를 성공적으로 배포하고 유지보수할 수 있습니다. 질문이나 문제가 있으면 기술 지원팀에 문의하세요.
