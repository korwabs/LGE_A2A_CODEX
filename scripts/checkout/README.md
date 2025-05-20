# LG 브라질 A2A 쇼핑 어시스턴트 - 체크아웃 자동화 모듈

이 문서는 LG 브라질 A2A 쇼핑 어시스턴트 프로젝트의 체크아웃 자동화 모듈에 대해 설명합니다.

## 개요

체크아웃 자동화 모듈은 LG 브라질 쇼핑몰 웹사이트에서 사용자가 대화형 인터페이스를 통해 쉽게 구매를 완료할 수 있도록 지원합니다. 기존 데이터베이스 접근 없이 크롤링을 통해 체크아웃 프로세스를 분석하고, 사용자가 대화를 통해 필요한 정보를 입력하면 딥링크를 생성하여 구매를 완료할 수 있게 합니다.

## 주요 기능

### 1. 체크아웃 프로세스 분석
- 제품 페이지에 접속하여 체크아웃 과정을 자동으로 분석
- 각 단계의 폼 필드, 버튼, 라벨 등을 세부적으로 파악
- 필수 입력 필드 및 유효성 검사 규칙 추출

### 2. 폼 필드 매핑 시스템
- 사용자가 제공한 정보를 체크아웃 폼 필드에 정확히 매핑
- 다양한 필드 유형(텍스트, 이메일, 전화번호, 선택 등)에 대한 전략 제공
- 언어 및 지역에 맞는 정보 포맷 지원(포르투갈어, 브라질 주소 형식 등)

### 3. 세션 관리 및 딥링크 생성
- 사용자별 체크아웃 세션 관리
- 수집된 정보를 기반으로 체크아웃 딥링크 생성
- 진행 상황 추적 및 단계별 안내

### 4. 대화형 인터페이스
- LLM과 연동하여 자연스러운 대화 방식으로 정보 수집
- 사용자 메시지에서 필요한 정보 추출
- 입력 오류 감지 및 안내

## 모듈 구조

```
/scripts/checkout/
  ├── checkout-automation.js       # 체크아웃 자동화 메인 클래스
  ├── managers/
  │   ├── checkout-process-manager.js  # 체크아웃 프로세스 데이터 관리
  │   ├── form-field-mapping-manager.js # 폼 필드 매핑 전략
  │   └── checkout-session-manager.js  # 세션 및 딥링크 관리
  └── handlers/
      └── conversational-checkout-handler.js # LLM 연동 대화형 핸들러
```

## 핵심 클래스 설명

### CheckoutAutomation
체크아웃 자동화의 메인 클래스로, 브라우저 제어 및 체크아웃 프로세스 분석을 담당합니다.

```javascript
const checkoutAutomation = new CheckoutAutomation({
  dataDir: './data',
  browserController: browserController
});

// 체크아웃 프로세스 분석
const checkoutProcess = await checkoutAutomation.analyzeCheckoutProcess(productUrl);

// 세션 생성 및 관리
const sessionId = checkoutAutomation.createCheckoutSession(userId, productId);
checkoutAutomation.updateSessionInfo(sessionId, userInfo);

// 딥링크 생성
const deeplink = checkoutAutomation.generateDeeplinkFromSession(sessionId);
```

### CheckoutProcessManager
체크아웃 프로세스 데이터를 저장하고 관리하는 클래스입니다.

```javascript
const processManager = new CheckoutProcessManager({ 
  dataDir: './data/checkout' 
});

// 체크아웃 프로세스 저장
processManager.saveCheckoutProcess(productId, checkoutData);

// 체크아웃 프로세스 로드
const checkoutProcess = processManager.loadCheckoutProcess(productId);

// 단계 정보 추출
const steps = processManager.extractCheckoutSteps(checkoutProcess);

// 필드 매핑 분석
const fieldMappings = processManager.analyzeFieldMappings(checkoutProcess);
```

### FormFieldMappingManager
다양한 폼 필드 유형에 따른 매핑 전략을 제공하는 클래스입니다.

```javascript
const fieldMappingManager = new FormFieldMappingManager();

// 사용자 정보를 URL 파라미터에 매핑
fieldMappingManager.mapUserInfoToParams(checkoutProcess, userInfo, params);
```

### CheckoutSessionManager
사용자 체크아웃 세션을 관리하고 딥링크를 생성하는 클래스입니다.

```javascript
const sessionManager = new CheckoutSessionManager({
  formFieldMappingManager: fieldMappingManager,
  checkoutProcessManager: processManager
});

// 새 세션 생성
const sessionId = sessionManager.createSession(userId, productId);

// 세션 정보 업데이트
sessionManager.updateSessionInfo(sessionId, userInfo);

// 필요한 필드 정보 가져오기
const requiredFields = sessionManager.getRequiredFieldsForCurrentStep(sessionId);
const missingFields = sessionManager.getMissingRequiredFields(sessionId);

// 딥링크 생성
const deeplinkResult = sessionManager.generateDeeplink(sessionId);
```

### ConversationalCheckoutHandler
LLM과 체크아웃 자동화 시스템을 연결하여 대화형 인터페이스를 제공하는 클래스입니다.

```javascript
const checkoutHandler = new ConversationalCheckoutHandler({
  checkoutAutomation: checkoutAutomation,
  llmClient: llmClient
});

// 체크아웃 세션 시작
const startResult = await checkoutHandler.startCheckout(userId, productId);

// 사용자 메시지 처리
const messageResult = await checkoutHandler.processMessage(userId, userMessage);

// 체크아웃 완료
const completeResult = await checkoutHandler.completeCheckout(userId);
```

## 사용 시나리오 예시

다음은 실제 사용자 대화 시나리오 예시입니다:

1. **사용자**: 이 TV 구매하고 싶어요.
2. **어시스턴트**: 네, LG OLED C2 55인치 TV 구매를 도와드리겠습니다. 구매를 위해 몇 가지 정보가 필요합니다. 먼저, 배송받으실 주소를 알려주세요. (Olá! Estamos coletando informações para a compra da sua TV LG OLED. Poderia me informar seu endereço de entrega?)
3. **사용자**: 상파울루 아베니다 파울리스타 1000번지 아파트 502호요.
4. **어시스턴트**: 감사합니다. 우편번호도 알려주시겠어요?
5. **사용자**: 01310-100이에요.
6. **어시스턴트**: 정보 확인되었습니다. 이름과 이메일 주소를 알려주시겠어요?
7. **사용자**: 이름은 João Silva이고, 이메일은 joao.silva@example.com입니다.
8. **어시스턴트**: 감사합니다. 마지막으로, 연락 가능한 전화번호를 알려주시겠어요?
9. **사용자**: 11-98765-4321입니다.
10. **어시스턴트**: 모든 정보가 수집되었습니다! 다음 정보로 주문을 진행합니다:

    - 이름: João Silva
    - 이메일: joao.silva@example.com
    - 주소: Avenida Paulista 1000, Apto 502
    - 도시: São Paulo
    - 우편번호: 01310-100

    [안전한 결제 페이지로 이동] 링크를 클릭하시면 카드 정보만 입력하면 바로 구매가 완료됩니다. Obrigado pela preferência! (LG를 선택해 주셔서 감사합니다!)

## 테스트 및 실행

두 가지 테스트 스크립트를 제공합니다:

1. **체크아웃 자동화 테스트**
   ```bash
   node scripts/test-checkout-automation.js
   # 디버그 모드로 실행 (헤드리스 모드 비활성화)
   node scripts/test-checkout-automation.js --debug
   # 상세 분석 모드로 실행
   node scripts/test-checkout-automation.js --detailed
   ```

2. **대화형 체크아웃 테스트**
   ```bash
   node scripts/test-conversational-checkout.js
   # 디버그 모드로 실행
   node scripts/test-conversational-checkout.js --debug
   ```

## 주요 개선사항

기존 체크아웃 자동화 모듈에서 다음과 같은 개선사항이 적용되었습니다:

1. **체크아웃 프로세스 분석 향상**
   - 세부적인 체크아웃 단계 파악 및 다단계 분석
   - 폼 요소 관계 및 컨테이너 구조 분석
   - 유효성 검사 패턴 및 오류 메시지 추출

2. **폼 필드 매핑 시스템 개선**
   - 필드 유형별 전문화된 매핑 전략
   - 브라질 특화 데이터 포맷 지원
   - 다단계 매핑 검증

3. **세션 관리 강화**
   - 사용자별 세션 상태 관리
   - 진행 상황 추적 및 리포팅
   - 자동 세션 만료 관리

4. **대화형 인터페이스 추가**
   - LLM 기반 자연어 처리
   - 컨텍스트 기반 정보 요청
   - 사용자 친화적 오류 처리

## 향후 계획

1. **다국어 지원 강화**
   - 포르투갈어 외 다른 언어 지원
   - 지역별 주소 포맷 확장

2. **지능형 필드 추출 개선**
   - 고급 엔티티 인식으로 정보 추출 정확도 향상
   - 모호한 입력 해결을 위한 대화 전략

3. **보안 및 개인정보 보호 강화**
   - 민감 정보 처리 개선
   - 보안 토큰 기반 세션 관리

4. **UI 통합 개선**
   - 웹 위젯과의 원활한 통합
   - 단계별 시각적 피드백

## 결론

체크아웃 자동화 모듈은 LG 브라질 A2A 쇼핑 어시스턴트의 핵심 기능으로, 사용자가 복잡한 구매 프로세스를 자연스러운 대화를 통해 쉽게 완료할 수 있도록 지원합니다. 데이터베이스 직접 접근 없이도 크롤링과 캐시 기반으로 효율적인 쇼핑 경험을 제공합니다.
