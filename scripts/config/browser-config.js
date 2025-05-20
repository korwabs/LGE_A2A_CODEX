/**
 * 브라우저 설정 - 브라우저 인스턴스 관련 설정
 */
const defaultConfig = require('./default-config');

module.exports = {
  // 기본 브라우저 옵션
  defaultOptions: {
    headless: defaultConfig.browser.headless,
    slowMo: defaultConfig.browser.slowMo,
    timeout: defaultConfig.browser.timeout,
    defaultViewport: defaultConfig.browser.defaultViewport,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1280,800'
    ]
  },
  
  // 브라우저 컨텍스트 옵션
  contextOptions: {
    viewport: defaultConfig.browser.defaultViewport,
    userAgent: defaultConfig.browser.userAgent,
    locale: defaultConfig.browser.locale,
    geolocation: defaultConfig.browser.geolocation,
    permissions: ['geolocation'],
    acceptDownloads: true
  },
  
  // 페이지 옵션
  pageOptions: {
    timeout: defaultConfig.browser.timeout,
    waitUntil: 'networkidle',
    bypassCSP: true
  },
  
  // 자원 제한
  resources: {
    maxConcurrentBrowsers: defaultConfig.browser.maxConcurrentBrowsers,
    maxConcurrentPages: defaultConfig.browser.maxConcurrentPages
  },
  
  // 자원 필터 (불필요한 리소스 차단)
  resourceFilter: {
    blockAds: true,
    blockTrackers: true,
    blockMedia: false,
    allowedDomains: [
      'lge.com',
      'lg.com'
    ],
    blockedResourceTypes: [
      'image',
      'media',
      'font',
      'texttrack',
      'object',
      'beacon',
      'csp_report',
      'imageset'
    ]
  },
  
  // 보안 우회 설정
  security: {
    ignoreCertificateErrors: true,
    disableWebSecurity: true
  },
  
  // 디바이스 에뮬레이션
  devices: {
    desktop: {
      name: 'Desktop',
      viewport: {
        width: 1280,
        height: 800
      },
      userAgent: defaultConfig.browser.userAgent
    },
    mobile: {
      name: 'Mobile',
      viewport: {
        width: 375,
        height: 667,
        isMobile: true,
        hasTouch: true
      },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
    },
    tablet: {
      name: 'Tablet',
      viewport: {
        width: 768,
        height: 1024,
        isMobile: true,
        hasTouch: true
      },
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
    }
  }
};
