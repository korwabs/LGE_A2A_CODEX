# LG 브라질 A2A 쇼핑 어시스턴트 기여 가이드

LG 브라질 A2A 쇼핑 어시스턴트 프로젝트에 기여해 주셔서 감사합니다! 이 문서는 프로젝트에 기여하기 위한 지침을 제공합니다.

## 목차

1. [시작하기](#시작하기)
2. [개발 환경 설정](#개발-환경-설정)
3. [코드 스타일 및 규칙](#코드-스타일-및-규칙)
4. [브랜치 전략](#브랜치-전략)
5. [커밋 메시지 가이드라인](#커밋-메시지-가이드라인)
6. [풀 리퀘스트 프로세스](#풀-리퀘스트-프로세스)
7. [테스트 지침](#테스트-지침)
8. [문서화 지침](#문서화-지침)
9. [코드 리뷰 프로세스](#코드-리뷰-프로세스)
10. [문제 보고](#문제-보고)

## 시작하기

### 프로젝트 개요

LG 브라질 A2A 쇼핑 어시스턴트는 LG 브라질 웹사이트(www.lge.com/br)에서 데이터베이스 직접 접근 없이 크롤링과 캐시 기반으로 운영되는 지능형 쇼핑 어시스턴트입니다. 이 프로젝트는 MCP(Model Context Protocol)와 A2A(Agent to Agent) 프로토콜을 활용하여 다양한 에이전트 간의 효율적인 통신을 구현합니다.

### 기여 영역

다음과 같은 영역에서 기여가 가능합니다:

1. **크롤링 향상**: 더 효율적이고 견고한 웹 크롤링 로직
2. **컨텐츠 추출 개선**: LLM 기반 추출 로직 및 프롬프트 최적화
3. **대화 경험 향상**: 자연어 처리 및 응답 생성 개선
4. **UI/UX 개선**: 대화형 인터페이스 컴포넌트 개선
5. **성능 최적화**: 리소스 사용 효율성 향상
6. **테스트 및 CI/CD**: 테스트 케이스 추가 및 CI/CD 파이프라인 개선
7. **문서화**: 코드 문서, 사용자 가이드, API 문서 개선

## 개발 환경 설정

### 저장소 클론 및 초기 설정

```bash
# 저장소 클론
git clone https://github.com/LGE-Brasil/A2A-shopping-assistant.git
cd A2A-shopping-assistant

# 의존성 설치
npm install

# 개발 환경 설정
cp .env.example .env.development
```

`.env.development` 파일을 열고 필요한 변수를 설정합니다:

```
# Algolia 설정
ALGOLIA_APP_ID=your-dev-algolia-app-id
ALGOLIA_ADMIN_API_KEY=your-dev-algolia-admin-api-key
ALGOLIA_SEARCH_API_KEY=your-dev-algolia-search-api-key
ALGOLIA_INDEX_NAME=lg_br_products_dev

# 브라우저 설정
HEADLESS=false  # 개발 시 브라우저 확인을 위해 false로 설정
SLOW_MO=50
BROWSER_TIMEOUT=30000

# LLM 설정
LLM_PROVIDER=google
LLM_MODEL=gemini-pro
LLM_API_KEY=your-dev-api-key

# 로깅 설정
LOG_LEVEL=debug  # 개발 시 상세 로깅을 위해 debug로 설정
LOG_TO_FILE=true
```

### 필수 도구 설치

1. **Playwright 브라우저 설치**

```bash
npx playwright install chromium --with-deps
```

2. **개발 종속성 확인**

```bash
npm run check-deps
```

### 개발 서버 실행

```bash
# 개발 모드로 서버 실행
npm run dev

# 크롤링 테스트 실행
npm run test:crawl

# 체크아웃 테스트 실행
npm run test:checkout
```

## 코드 스타일 및 규칙

### 코드 스타일

이 프로젝트는 ESLint와 Prettier를 사용하여 일관된 코드 스타일을 유지합니다:

```bash
# 린트 검사 실행
npm run lint

# 자동 포맷팅
npm run format
```

주요 코드 스타일 규칙:

- **들여쓰기**: 2 공백
- **세미콜론**: 필수
- **따옴표**: 작은 따옴표 (`'`) 사용
- **최대 줄 길이**: 100자
- **추적 콤마**: 객체와 배열에서 사용
- **네이밍 규칙**:
  - 클래스: PascalCase
  - 메서드/함수: camelCase
  - 변수/매개변수: camelCase
  - 상수: UPPER_SNAKE_CASE
  - 파일 이름: kebab-case
  - 디렉토리 이름: kebab-case

### JSDoc 문서화

모든 클래스, 메서드, 함수는 JSDoc 주석을 포함해야 합니다:

```javascript
/**
 * 제품 정보를 추출합니다.
 * @param {string} html - 제품 페이지 HTML
 * @param {object} options - 추출 옵션
 * @param {boolean} options.includeReviews - 리뷰 포함 여부
 * @returns {Promise<object>} 추출된 제품 정보
 */
async function extractProductInfo(html, options = {}) {
  // 구현...
}
```

## 브랜치 전략

이 프로젝트는 GitHub Flow 브랜치 전략을 따릅니다:

- **main**: 프로덕션 코드가 있는 기본 브랜치, 항상 배포 가능한 상태 유지
- **feature/\***: 새로운 기능 개발을 위한 브랜치 (예: `feature/improved-crawler`)
- **bugfix/\***: 버그 수정을 위한 브랜치 (예: `bugfix/login-error`)
- **hotfix/\***: 프로덕션 긴급 수정을 위한 브랜치 (예: `hotfix/critical-auth-issue`)
- **docs/\***: 문서화 작업을 위한 브랜치 (예: `docs/api-reference`)

기능 개발 워크플로우:

1. `main`에서 새 브랜치 생성 (예: `feature/new-feature`)
2. 변경 사항 구현 및 커밋
3. PR 생성
4. 코드 리뷰 및 필요시 수정
5. `main`으로 병합

## 커밋 메시지 가이드라인

이 프로젝트는 Conventional Commits 형식을 따릅니다:

```
<타입>[옵션 범위]: <설명>

[옵션 본문]

[옵션 꼬리말]
```

**타입**:
- **feat**: 새로운 기능 추가
- **fix**: 버그 수정
- **docs**: 문서 변경
- **style**: 코드 형식 변경 (linting 등)
- **refactor**: 기능 변경 없는 코드 리팩토링
- **test**: 테스트 코드 추가 또는 수정
- **chore**: 빌드 프로세스, 도구 변경 등 (코드 변경 없음)
- **perf**: 성능 개선

**예시**:
```
feat(crawler): 크롤링 재시도 메커니즘 구현

- 크롤링 실패 시 5번까지 재시도 로직 추가
- 실패 간 지수적 지연 구현
- 연결 오류 및 타임아웃 처리 개선

해결: #123
```

## 풀 리퀘스트 프로세스

### PR 생성 전 체크리스트

1. 코드 스타일 규칙을 준수하는지 확인 (`npm run lint`)
2. 모든 테스트가 통과하는지 확인 (`npm test`)
3. 새로운 기능에 대한 테스트 케이스 추가
4. 필요한 문서 업데이트 (JSDoc, README 등)
5. 브랜치가 최신 `main`과 동기화되었는지 확인

### PR 템플릿

PR을 생성할 때 다음 정보를 포함하세요:

```markdown
## 변경 내용
<!-- 이 PR에서 변경한 내용을 간결하게 설명하세요 -->

## 관련 이슈
<!-- 이 PR이 해결하는 이슈를 링크하세요 (예: "해결: #123") -->

## 테스트 방법
<!-- 변경 사항을 테스트하는 방법을 설명하세요 -->

## 스크린샷 (UI 변경 시)
<!-- UI 변경이 있는 경우 전/후 스크린샷 첨부 -->

## 체크리스트
- [ ] 코드 스타일 규칙을 준수했습니다
- [ ] 테스트를 추가/수정했습니다
- [ ] 모든 테스트가 통과합니다
- [ ] 필요한 문서를 업데이트했습니다
- [ ] 보안 취약점이 없습니다
```

### 코드 리뷰 후 변경 사항

코드 리뷰에서 받은 피드백을 수정할 때는:

1. 리뷰어 피드백을 기반으로 변경 사항 구현
2. 기존 커밋에 변경 사항 추가 (필요한 경우 `git commit --amend` 또는 `git rebase -i`)
3. 브랜치 강제 푸시 (`git push --force-with-lease`)

## 테스트 지침

### 테스트 구조

테스트는 다음 디렉토리에 있습니다:

- `test/unit/`: 단위 테스트
- `test/integration/`: 통합 테스트
- `test/e2e/`: 엔드-투-엔드 테스트

### 테스트 실행

```bash
# 모든 테스트 실행
npm test

# 특정 파일 테스트
npm test -- --testPathPattern=browser-controller

# 단위 테스트만 실행
npm run test:unit

# 통합 테스트만 실행
npm run test:integration

# E2E 테스트만 실행
npm run test:e2e
```

### 테스트 작성 지침

- **단위 테스트**: 각 클래스, 함수, 컴포넌트의 개별 기능 테스트
- **통합 테스트**: 여러 컴포넌트 간의 상호 작용 테스트
- **E2E 테스트**: 전체 사용자 시나리오 테스트

**테스트 구조**:

```javascript
describe('BrowserController', () => {
  let controller;
  
  beforeEach(() => {
    controller = new BrowserController();
  });
  
  afterEach(async () => {
    await controller.closeBrowser();
  });
  
  test('should execute browser actions correctly', async () => {
    // 테스트 로직
    const result = await controller.executeAction('goToUrl', { url: 'https://example.com' });
    expect(result.success).toBe(true);
  });
  
  // 추가 테스트...
});
```

## 문서화 지침

### 코드 문서화

- **클래스, 함수, 메서드**: JSDoc 주석 추가
- **복잡한 로직**: 인라인 주석으로 설명
- **예제**: 복잡한 기능에 대한 사용 예제 포함

### 프로젝트 문서화

- **README.md**: 프로젝트 개요, 설치, 기본 사용법
- **docs/developer-guide/**: 개발자를 위한 상세 가이드
- **docs/user-guide/**: 사용자를 위한 가이드
- **docs/api/**: 자동 생성된 API 문서

새로운 기능을 추가할 때:
1. 기능에 대한 JSDoc 주석 추가
2. 해당하는 문서 업데이트 또는 새 문서 작성
3. 사용 예제 제공

## 코드 리뷰 프로세스

### 리뷰어 할당

PR을 생성하면 자동으로 최소 1명의 리뷰어가 할당됩니다. 특정 영역의 코드 변경은 해당 영역 전문가가 추가로 할당됩니다.

### 리뷰 기준

리뷰어는 다음 기준으로 코드를 평가합니다:

1. **기능성**: 코드가 의도한 기능을 올바르게 구현하는가?
2. **품질**: 코드가 프로젝트 표준과 모범 사례를 따르는가?
3. **테스트**: 적절한 테스트 케이스가 포함되어 있는가?
4. **문서화**: 코드와 기능이 충분히 문서화되어 있는가?
5. **보안**: 보안 취약점이 없는가?
6. **성능**: 성능 저하 없이 효율적으로 구현되었는가?

### 리뷰 응답

리뷰 피드백을 받은 후:

1. 모든 피드백에 응답 (수정, 설명 또는 토론)
2. 피드백 기반 코드 수정
3. 수정 완료 후 리뷰어에게 재검토 요청

## 문제 보고

버그나 개선 사항을 발견한 경우:

### 버그 리포트 제출

버그 리포트에는 다음 정보를 포함하세요:

1. **문제 설명**: 발생한 문제 간결하게 설명
2. **재현 단계**: 문제 재현 방법 상세히 설명
3. **예상 동작**: 예상했던 동작
4. **실제 동작**: 실제로 발생한 동작
5. **환경**: 
   - OS 및 버전
   - Node.js 버전
   - 브라우저 버전 (해당 시)
   - 프로젝트 버전
6. **스크린샷 또는 로그**: 가능한 경우 첨부

### 기능 제안

새로운 기능을 제안할 때는 다음 정보를 포함하세요:

1. **기능 설명**: 제안하는 기능 간결하게 설명
2. **문제 해결**: 이 기능이 해결하는 문제
3. **사용 사례**: 구체적인 사용 시나리오
4. **구현 아이디어**: 구현 방법에 대한 생각 (선택 사항)
5. **대안**: 고려한 대안 및 선택하지 않은 이유 (선택 사항)

## 기여자 행동 강령

이 프로젝트는 [기여자 행동 강령](CODE_OF_CONDUCT.md)을 준수합니다. 모든 기여자는 이 행동 강령을 읽고 준수해야 합니다.

## 라이선스

이 프로젝트에 기여함으로써, 귀하는 귀하의 기여가 프로젝트 라이선스에 따라 배포됨에 동의합니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.

---

기여해 주셔서 감사합니다! 질문이나 의견이 있으시면 [이슈](https://github.com/LGE-Brasil/A2A-shopping-assistant/issues)를 통해 문의해 주세요.