/**
 * 체크아웃 딥링크 생성기 액터
 * 수집된 체크아웃 정보를 기반으로 자동화된 체크아웃 딥링크를 생성합니다.
 */
const Apify = require('apify');
const { Browser, Page } = require('puppeteer');
const querystring = require('querystring');

Apify.main(async () => {
    // 입력 파라미터 가져오기
    const input = await Apify.getInput();
    console.log('Input:', input);

    const {
        productId,
        productUrl,
        checkoutData,
        options = {}
    } = input;

    if (!productId && !productUrl) {
        throw new Error('productId 또는 productUrl 파라미터가 필요합니다.');
    }

    // 결과 저장소 초기화
    const dataset = await Apify.openDataset('checkout-deeplink');
    const keyValueStore = await Apify.openKeyValueStore('checkout-screenshots');

    // 브라우저 실행
    const browser = await Apify.launchPuppeteer({
        stealth: true,
        useChrome: true,
        headless: true,
    });

    try {
        console.log(`체크아웃 딥링크 생성 시작: ${productId || productUrl}`);
        
        // 딥링크 생성
        const result = await generateDeepLink(browser, {
            productId,
            productUrl: productUrl || `https://www.lge.com/br/product/${productId}`,
            checkoutData,
            options,
            keyValueStore
        });

        // 결과 저장
        await dataset.pushData(result);
        console.log('체크아웃 딥링크 생성 완료:', result.deepLink);

    } catch (error) {
        console.error(`체크아웃 딥링크 생성 중 오류 발생: ${error.message}`);
        
        // 오류 결과 저장
        await dataset.pushData({
            productId,
            productUrl,
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
        
        throw error;
    } finally {
        // 브라우저 종료
        await browser.close();
    }
});

/**
 * 딥링크 생성
 * @param {Browser} browser - Puppeteer 브라우저 인스턴스
 * @param {Object} params - 파라미터
 * @returns {Promise<Object>} 딥링크 결과
 */
async function generateDeepLink(browser, params) {
    const { productId, productUrl, checkoutData, options, keyValueStore } = params;
    const { generateDeepLink = true, autoFill = true, sessionId } = options;
    
    // 결과 객체 초기화
    const result = {
        productId,
        productUrl,
        checkoutData: { ...checkoutData },
        success: false,
        timestamp: new Date().toISOString(),
        sessionId
    };
    
    // 페이지 열기
    const page = await browser.newPage();
    
    // 기본 타임아웃 설정
    page.setDefaultTimeout(60000); // 60초
    
    try {
        // 제품 페이지 접근
        await page.goto(productUrl, { waitUntil: 'networkidle2' });
        await page.waitForTimeout(3000);
        
        // 쿠키 배너 처리
        await handleCookieBanner(page);
        
        if (options.captureScreenshots) {
            await captureScreenshot(page, 'product-page', keyValueStore);
        }
        
        // 제품 페이지에서 필요한 파라미터 추출
        const pageParams = await extractPageParameters(page);
        result.pageParams = pageParams;
        
        // 구매 버튼 클릭
        const buyButtonSelector = await findBuyButtonSelector(page);
        if (!buyButtonSelector) {
            throw new Error('구매 버튼을 찾을 수 없습니다.');
        }
        
        if (generateDeepLink) {
            // 구매 버튼 이벤트 리스너 추가하여 리디렉션 URL 캡처
            const redirectUrl = await captureRedirectUrl(page, buyButtonSelector);
            
            if (redirectUrl) {
                // URL에 체크아웃 데이터 추가
                const deepLink = await enhanceCheckoutUrl(redirectUrl, checkoutData);
                result.deepLink = deepLink;
                result.redirectUrl = redirectUrl;
                result.success = true;
            } else {
                // 구매 버튼 클릭 후 URL 추출
                await page.click(buyButtonSelector);
                await page.waitForNavigation({ waitUntil: 'networkidle2' });
                
                // 장바구니/체크아웃 페이지 URL 가져오기
                const checkoutUrl = page.url();
                const deepLink = await enhanceCheckoutUrl(checkoutUrl, checkoutData);
                
                result.deepLink = deepLink;
                result.redirectUrl = checkoutUrl;
                result.success = true;
                
                if (options.captureScreenshots) {
                    await captureScreenshot(page, 'checkout-page', keyValueStore);
                }
            }
        } else {
            // 간단한 링크 구성
            const simpleDeepLink = constructSimpleDeepLink(productId, checkoutData);
            result.deepLink = simpleDeepLink;
            result.success = true;
        }
        
        return result;
    } catch (error) {
        console.error(`딥링크 생성 중 오류: ${error.message}`);
        
        if (options.captureScreenshots) {
            await captureScreenshot(page, 'error', keyValueStore);
        }
        
        // 오류 시 간단한 링크라도 생성
        const fallbackDeepLink = constructSimpleDeepLink(productId, checkoutData);
        
        return {
            ...result,
            error: error.message,
            deepLink: fallbackDeepLink,
            success: false
        };
    } finally {
        await page.close();
    }
}

/**
 * 쿠키 배너 처리
 * @param {Page} page - Puppeteer 페이지 인스턴스
 */
async function handleCookieBanner(page) {
    try {
        // 다양한 쿠키 배너 수락 버튼 선택자
        const cookieBannerSelectors = [
            '.cookie-accept-button',
            '.cookie-consent-accept',
            '.privacy-alert-accept',
            '#cookie-notice .accept',
            '.cookies-popup .accept',
            'button[data-cookie-accept]',
            'button[data-test="cookie-accept"]',
            'button:has-text("Aceitar Cookies")',
            'button:has-text("Aceitar")',
            'button:has-text("Accept Cookies")',
            'button:has-text("Accept All")',
        ];
        
        // 쿠키 배너가 나타날 때까지 짧게 대기
        await page.waitForTimeout(1000);
        
        // 각 선택자 시도
        for (const selector of cookieBannerSelectors) {
            try {
                // 선택자가 존재하는지 확인
                const elementExists = await page.evaluate((sel) => {
                    return !!document.querySelector(sel);
                }, selector);
                
                if (elementExists) {
                    // 쿠키 배너 클릭
                    await page.click(selector).catch(() => {});
                    console.log(`쿠키 배너 처리 성공: ${selector}`);
                    await page.waitForTimeout(500);
                    return;
                }
            } catch (e) {
                // 특정 선택자에 대한 오류는 무시하고 계속 진행
            }
        }
    } catch (error) {
        console.error('쿠키 배너 처리 중 오류:', error);
    }
}

/**
 * 페이지 파라미터 추출
 * @param {Page} page - Puppeteer 페이지 인스턴스
 * @returns {Promise<Object>} 페이지 파라미터
 */
async function extractPageParameters(page) {
    return await page.evaluate(() => {
        const params = {};
        
        // 제품 ID
        const productIdMatch = location.pathname.match(/\/product\/([^\/]+)/i);
        if (productIdMatch) {
            params.productId = productIdMatch[1];
        }
        
        // 제품명
        const productNameElement = document.querySelector('.product-name, .product-title, h1');
        if (productNameElement) {
            params.productName = productNameElement.innerText.trim();
        }
        
        // 가격
        const priceElement = document.querySelector('.price, .product-price, [data-price]');
        if (priceElement) {
            const priceText = priceElement.innerText.trim();
            const priceMatch = priceText.match(/[\d\.,]+/);
            if (priceMatch) {
                params.price = priceMatch[0];
            }
        }
        
        // 제품 SKU
        const skuElement = document.querySelector('[data-sku], .sku, .product-sku');
        if (skuElement) {
            params.sku = skuElement.getAttribute('data-sku') || skuElement.innerText.trim();
        }
        
        // 기타 데이터 추출...
        try {
            // 스크립트 태그에서 제품 데이터 추출 시도
            const scripts = Array.from(document.querySelectorAll('script:not([src])'));
            for (const script of scripts) {
                const content = script.innerText;
                if (content.includes('product') && (content.includes('sku') || content.includes('id'))) {
                    const jsonMatch = content.match(/\{[\s\S]*?\}/);
                    if (jsonMatch) {
                        try {
                            const data = JSON.parse(jsonMatch[0]);
                            if (data.product || data.sku || data.id) {
                                params.scriptData = data;
                                break;
                            }
                        } catch (e) {
                            // 파싱 오류 무시
                        }
                    }
                }
            }
        } catch (e) {
            // 스크립트 데이터 추출 오류 무시
        }
        
        return params;
    });
}

/**
 * 구매 버튼 선택자 찾기
 * @param {Page} page - Puppeteer 페이지 인스턴스
 * @returns {Promise<string|null>} 구매 버튼 선택자
 */
async function findBuyButtonSelector(page) {
    // 구매 버튼 후보 선택자들
    const buyButtonSelectors = [
        'button.add-to-cart',
        'button.buy-now',
        'button.buy-button',
        'button.cart-button',
        'button.checkout-button',
        'a.add-to-cart',
        'a.buy-now',
        'a.cart-button',
        'a.checkout-button',
        'button:has-text("Comprar")',
        'button:has-text("Adicionar ao carrinho")',
        'button:has-text("Carrinho")',
        'button:has-text("Comprar agora")',
        'button[data-action="add-to-cart"]',
        'button[data-action="buy-now"]'
    ];

    // 각 선택자 확인
    for (const selector of buyButtonSelectors) {
        try {
            const exists = await page.evaluate((sel) => {
                const element = document.querySelector(sel);
                return element && element.offsetParent !== null; // 화면에 보이는지 확인
            }, selector);

            if (exists) {
                return selector;
            }
        } catch (e) {
            // 오류 무시하고 계속 진행
        }
    }

    // 마지막 대안: 페이지에서 직접 텍스트로 검색
    return await page.evaluate(() => {
        const buyKeywords = ['comprar', 'adicionar', 'carrinho', 'compre', 'buy', 'add to cart', 'purchase'];
        
        // 모든 버튼 요소 가져오기
        const buttons = Array.from(document.querySelectorAll('button, a.button, a[role="button"]'));
        
        // 텍스트에 키워드가 있는 버튼 찾기
        for (const button of buttons) {
            const text = button.innerText.toLowerCase();
            if (buyKeywords.some(keyword => text.includes(keyword)) && button.offsetParent !== null) {
                // 선택자 생성
                if (button.id) {
                    return `#${button.id}`;
                } else if (button.className) {
                    const classes = button.className.split(' ').filter(c => c).join('.');
                    return button.tagName.toLowerCase() + (classes ? '.' + classes : '');
                } else {
                    return button.tagName.toLowerCase();
                }
            }
        }
        
        return null;
    });
}

/**
 * 리디렉션 URL 캡처
 * @param {Page} page - Puppeteer 페이지 인스턴스
 * @param {string} buttonSelector - 클릭할 버튼 선택자
 * @returns {Promise<string|null>} 리디렉션 URL
 */
async function captureRedirectUrl(page, buttonSelector) {
    try {
        // 리디렉션 감시 설정
        let redirectUrl = null;
        await page.setRequestInterception(true);
        
        const listener = request => {
            const url = request.url();
            // 장바구니나 체크아웃 URL 패턴 확인
            if (url.includes('/cart') || url.includes('/checkout') || url.includes('/carrinho') || url.includes('/finalizar-compra')) {
                redirectUrl = url;
            }
            request.continue();
        };
        
        page.on('request', listener);
        
        // 버튼 클릭
        await page.click(buttonSelector);
        
        // 짧게 대기하여 리디렉션 감지
        await page.waitForTimeout(2000);
        
        // 리스너 제거
        page.removeListener('request', listener);
        await page.setRequestInterception(false);
        
        return redirectUrl;
    } catch (error) {
        console.error('리디렉션 URL 캡처 중 오류:', error);
        return null;
    }
}

/**
 * 체크아웃 URL 향상
 * @param {string} url - 원래 URL
 * @param {Object} checkoutData - 체크아웃 데이터
 * @returns {Promise<string>} 향상된 URL
 */
async function enhanceCheckoutUrl(url, checkoutData) {
    try {
        // URL 파싱
        const parsedUrl = new URL(url);
        
        // URL 파라미터를 객체로 변환
        const params = {};
        for (const [key, value] of parsedUrl.searchParams) {
            params[key] = value;
        }
        
        // 체크아웃 데이터 추가
        if (checkoutData) {
            // 민감한 데이터 필터링
            const sanitizedData = { ...checkoutData };
            const sensitiveFields = [
                'creditCardNumber', 'cardNumber', 'cvv', 'securityCode', 
                'cardVerificationCode', 'password', 'senha'
            ];
            
            for (const field of sensitiveFields) {
                if (sanitizedData[field]) {
                    delete sanitizedData[field];
                }
            }
            
            // prefill 파라미터 추가
            params.prefill = encodeURIComponent(JSON.stringify(sanitizedData));
            
            // autoFill 파라미터 추가
            params.autoFill = 'true';
        }
        
        // URL 쿼리 문자열 재구성
        const queryString = Object.entries(params)
            .map(([key, value]) => `${encodeURIComponent(key)}=${value}`)
            .join('&');
        
        // 향상된 URL 반환
        return `${parsedUrl.origin}${parsedUrl.pathname}${queryString ? '?' + queryString : ''}`;
    } catch (error) {
        console.error('체크아웃 URL 향상 중 오류:', error);
        return url; // 오류 시 원래 URL 반환
    }
}

/**
 * 간단한 딥링크 구성
 * @param {string} productId - 제품 ID
 * @param {Object} checkoutData - 체크아웃 데이터
 * @returns {string} 간단한 딥링크
 */
function constructSimpleDeepLink(productId, checkoutData) {
    try {
        // 기본 URL
        let url = `https://www.lge.com/br/checkout?productId=${encodeURIComponent(productId)}`;
        
        // 체크아웃 데이터가 있으면 추가
        if (checkoutData && Object.keys(checkoutData).length > 0) {
            // 민감한 데이터 필터링
            const sanitizedData = { ...checkoutData };
            const sensitiveFields = [
                'creditCardNumber', 'cardNumber', 'cvv', 'securityCode', 
                'cardVerificationCode', 'password', 'senha'
            ];
            
            for (const field of sensitiveFields) {
                if (sanitizedData[field]) {
                    delete sanitizedData[field];
                }
            }
            
            // 데이터 인코딩 및 URL 파라미터 추가
            const prefillData = encodeURIComponent(JSON.stringify(sanitizedData));
            url += `&prefill=${prefillData}&autoFill=true`;
        }
        
        return url;
    } catch (error) {
        console.error('간단한 딥링크 구성 중 오류:', error);
        return `https://www.lge.com/br/checkout?productId=${encodeURIComponent(productId)}`;
    }
}

/**
 * 스크린샷 캡처 및 저장
 * @param {Page} page - Puppeteer 페이지 인스턴스
 * @param {string} name - 스크린샷 이름
 * @param {Object} keyValueStore - Apify 키-값 저장소
 */
async function captureScreenshot(page, name, keyValueStore) {
    try {
        const screenshot = await page.screenshot({
            fullPage: true,
            type: 'jpeg',
            quality: 80
        });
        
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const key = `${name}-${timestamp}.jpg`;
        
        await keyValueStore.setValue(key, screenshot, { contentType: 'image/jpeg' });
        console.log(`스크린샷 저장: ${key}`);
    } catch (error) {
        console.error(`스크린샷 캡처 오류: ${error.message}`);
    }
}
