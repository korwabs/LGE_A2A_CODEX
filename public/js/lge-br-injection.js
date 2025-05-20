// public/js/lge-br-injection.js - LG 브라질 사이트에 위젯 통합
(function() {
  // 설정 변수
  const CONFIG = {
    widgetScriptUrl: 'https://your-vercel-deployment.vercel.app/js/shopping-assistant-widget.js',
    intercomScriptUrl: 'https://your-vercel-deployment.vercel.app/js/intercom-integration.js',
    cssUrl: 'https://your-vercel-deployment.vercel.app/css/shopping-assistant.css',
    intercomAppId: 'YOUR_INTERCOM_APP_ID', // 실제 Intercom APP ID로 대체
    apiBaseUrl: 'https://your-vercel-deployment.vercel.app/api'
  };
  
  // 스크립트 및 스타일 로드
  function loadResources() {
    // 위젯 스타일 로드
    const styleLink = document.createElement('link');
    styleLink.rel = 'stylesheet';
    styleLink.href = CONFIG.cssUrl;
    document.head.appendChild(styleLink);
    
    // Intercom 설정 스크립트
    const intercomSettings = document.createElement('script');
    intercomSettings.type = 'text/javascript';
    intercomSettings.innerHTML = `
      window.intercomSettings = {
        app_id: "${CONFIG.intercomAppId}"
      };
    `;
    document.head.appendChild(intercomSettings);
    
    // 위젯 스크립트 로드
    loadScript(CONFIG.widgetScriptUrl, function() {
      console.log('쇼핑 어시스턴트 위젯 스크립트 로드 완료');
    });
    
    // Intercom 통합 스크립트 로드
    loadScript(CONFIG.intercomScriptUrl, function() {
      console.log('Intercom 통합 스크립트 로드 완료');
    });
  }
  
  // 스크립트 로드 헬퍼 함수
  function loadScript(url, callback) {
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = url;
    script.async = true;
    
    // 로드 완료 이벤트
    if (callback) {
      script.onload = callback;
    }
    
    // 문서에 스크립트 추가
    document.body.appendChild(script);
  }
  
  // 초기화 함수
  function initialize() {
    // 사용자 정의 데이터 설정
    window.lgShoppingAssistant = {
      config: {
        apiBaseUrl: CONFIG.apiBaseUrl
      }
    };
    
    // 리소스 로드
    loadResources();
    
    console.log('LG 쇼핑 어시스턴트 인젝션 스크립트 초기화 완료');
  }
  
  // 페이지 로드 시 초기화
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
