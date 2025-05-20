/**
 * 체크아웃 프로세스 상세 크롤링 액터
 * LG 브라질 사이트의 체크아웃 프로세스를 크롤링하여 각 단계별 입력 필드와 선택 요소를 자세히 파악합니다.
 */
const Apify = require('apify');
const { Browser, Page } = require('puppeteer');

Apify.main(async () => {
    // 입력 파라미터 가져오기
    const input = await Apify.getInput();
    console.log('Input:', input);

    const {
        productUrl,
        waitForLoading = true,
        maxRetries = 3,
        captureScreenshots = false,
    } = input;

    if (!productUrl) {
        throw new Error('productUrl 파라미터가 필요합니다.');
    }

    // 결과 저장소 초기화
    const dataset = await Apify.openDataset('checkout-process');
    const keyValueStore = await Apify.openKeyValueStore('checkout-screenshots');

    // 브라우저 실행
    const browser = await Apify.launchPuppeteer({
        stealth: true,
        useChrome: true,
        headless: true,
    });

    try {
        console.log(`체크아웃 프로세스 크롤링 시작: ${productUrl}`);
        const checkoutProcess = await crawlCheckoutProcess(browser, productUrl, {
            waitForLoading,
            maxRetries,
            captureScreenshots,
            keyValueStore,
        });

        // 결과 저장
        await dataset.pushData(checkoutProcess);
        console.log('체크아웃 프로세스 크롤링 완료');

    } catch (error) {
        console.error(`체크아웃 프로세스 크롤링 중 오류 발생: ${error.message}`);
        throw error;
    } finally {
        // 브라우저 종료
        await browser.close();
    }
});

/**
 * 체크아웃 프로세스 크롤링 실행
 * @param {Browser} browser - Puppeteer 브라우저 인스턴스
 * @param {string} productUrl - 제품 URL
 * @param {Object} options - 크롤링 옵션
 * @returns {Promise<Object>} 체크아웃 프로세스 정보
 */
async function crawlCheckoutProcess(browser, productUrl, options) {
    const { waitForLoading, maxRetries, captureScreenshots, keyValueStore } = options;

    // 결과 객체 초기화
    const result = {
        productUrl,
        steps: [],
        formElements: {},
        startTime: new Date().toISOString(),
    };

    // 페이지 열기
    const page = await browser.newPage();

    // 기본 타임아웃 설정
    page.setDefaultTimeout(60000); // 60초
    
    // 모바일 디바이스 에뮬레이션 설정
    await page.emulate(Apify.utils.puppeteer.devices['iPhone X']);

    try {
        // 제품 페이지 접근
        await navigateWithRetries(page, productUrl, maxRetries);
        
        if (waitForLoading) {
            // 동적 콘텐츠 로딩 대기
            await page.waitForTimeout(3000);
        }

        // 쿠키 배너 처리
        await handleCookieBanner(page);

        // 스크린샷 캡처 (필요한 경우)
        if (captureScreenshots) {
            await captureScreenshot(page, 'product-page', keyValueStore);
        }

        // 제품 페이지 분석 및 장바구니 추가 버튼 찾기
        console.log('제품 페이지 분석 중...');
        const buyButtonSelector = await findBuyButtonSelector(page);
        
        if (!buyButtonSelector) {
            throw new Error('구매 버튼을 찾을 수 없습니다.');
        }

        // 구매 버튼 클릭
        console.log(`구매 버튼 클릭: ${buyButtonSelector}`);
        await clickWithRetries(page, buyButtonSelector, maxRetries);
        
        // 장바구니 페이지 로딩 대기
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
        await page.waitForTimeout(2000);
        
        // 장바구니 페이지 분석
        const cartPageInfo = await analyzeCartPage(page);
        result.steps.push({
            step: 1,
            name: '장바구니',
            url: page.url(),
            fields: cartPageInfo.fields,
            buttons: cartPageInfo.buttons,
        });

        if (captureScreenshots) {
            await captureScreenshot(page, 'cart-page', keyValueStore);
        }

        // 다음 단계로 진행 (체크아웃 시작)
        const nextButtonSelector = cartPageInfo.nextButtonSelector;
        if (nextButtonSelector) {
            console.log(`체크아웃 진행 버튼 클릭: ${nextButtonSelector}`);
            await clickWithRetries(page, nextButtonSelector, maxRetries);
            await page.waitForNavigation({ waitUntil: 'networkidle2' });
            await page.waitForTimeout(2000);
        } else {
            console.log('체크아웃 진행 버튼을 찾을 수 없습니다.');
        }

        // 체크아웃 과정 단계별 분석
        let currentStep = 2;
        let hasNextStep = true;
        
        while (hasNextStep && currentStep <= 5) { // 최대 5단계까지 분석
            console.log(`체크아웃 단계 ${currentStep} 분석 중...`);
            
            // 현재 체크아웃 단계 분석
            const stepInfo = await analyzeCheckoutStep(page, currentStep);
            
            // 분석 결과 추가
            result.steps.push({
                step: currentStep,
                name: stepInfo.name,
                url: page.url(),
                fields: stepInfo.fields,
                buttons: stepInfo.buttons,
            });

            if (captureScreenshots) {
                await captureScreenshot(page, `checkout-step-${currentStep}`, keyValueStore);
            }

            // 다음 단계로 진행
            if (stepInfo.nextButtonSelector) {
                try {
                    console.log(`다음 단계로 진행: ${stepInfo.nextButtonSelector}`);
                    await clickWithRetries(page, stepInfo.nextButtonSelector, maxRetries);
                    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {
                        console.log('페이지 이동이 감지되지 않았습니다 (SPA일 수 있음)');
                    });
                    await page.waitForTimeout(2000);
                    currentStep++;
                } catch (error) {
                    console.log(`다음 단계로 진행 중 오류: ${error.message}`);
                    hasNextStep = false;
                }
            } else {
                console.log('더 이상 다음 단계 버튼이 없습니다.');
                hasNextStep = false;
            }
        }

        // 결과 완료 정보 추가
        result.endTime = new Date().toISOString();
        result.success = true;
        
        return result;

    } catch (error) {
        console.error(`체크아웃 프로세스 크롤링 중 오류: ${error.message}`);
        
        // 오류 스크린샷 캡처
        if (captureScreenshots) {
            await captureScreenshot(page, 'error', keyValueStore);
        }
        
        // 오류 정보와 함께 결과 반환
        result.endTime = new Date().toISOString();
        result.success = false;
        result.error = error.message;
        
        return result;
    } finally {
        await page.close();
    }
}

/**
 * 페이지 이동 (재시도 로직 포함)
 * @param {Page} page - Puppeteer 페이지 인스턴스
 * @param {string} url - 이동할 URL
 * @param {number} maxRetries - 최대 재시도 횟수
 */
async function navigateWithRetries(page, url, maxRetries) {
    let retries = 0;
    
    while (retries < maxRetries) {
        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
            return;
        } catch (error) {
            retries++;
            console.log(`페이지 이동 실패 (${retries}/${maxRetries}): ${error.message}`);
            
            if (retries >= maxRetries) {
                throw new Error(`최대 재시도 횟수 초과: ${url}`);
            }
            
            // 재시도 전 대기
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

/**
 * 요소 클릭 (재시도 로직 포함)
 * @param {Page} page - Puppeteer 페이지 인스턴스
 * @param {string} selector - 클릭할 요소의 선택자
 * @param {number} maxRetries - 최대 재시도 횟수
 */
async function clickWithRetries(page, selector, maxRetries) {
    let retries = 0;
    
    while (retries < maxRetries) {
        try {
            // 요소가 표시될 때까지 대기
            await page.waitForSelector(selector, { visible: true, timeout: 10000 });
            
            // 요소가 클릭 가능한지 확인
            const elementHandle = await page.$(selector);
            if (!elementHandle) {
                throw new Error(`요소를 찾을 수 없음: ${selector}`);
            }
            
            // 요소가 화면에 보이는지 확인
            const box = await elementHandle.boundingBox();
            if (!box) {
                throw new Error(`요소가 화면에 보이지 않음: ${selector}`);
            }
            
            // 요소 클릭
            await elementHandle.click();
            return;
        } catch (error) {
            retries++;
            console.log(`요소 클릭 실패 (${retries}/${maxRetries}): ${error.message}`);
            
            if (retries >= maxRetries) {
                throw new Error(`최대 재시도 횟수 초과: ${selector}`);
            }
            
            // 재시도 전 대기
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
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
                    return true;
                }
            } catch (e) {
                // 특정 선택자에 대한 오류는 무시하고 계속 진행
            }
        }
        
        console.log('쿠키 배너가 감지되지 않았거나 처리되지 않았습니다.');
        return false;
    } catch (error) {
        console.error('쿠키 배너 처리 중 오류:', error);
        return false;
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
 * 장바구니 페이지 분석
 * @param {Page} page - Puppeteer 페이지 인스턴스
 * @returns {Promise<Object>} 장바구니 페이지 정보
 */
async function analyzeCartPage(page) {
    console.log('장바구니 페이지 분석 중...');
    
    return await page.evaluate(() => {
        // 결과 객체 초기화
        const result = {
            fields: [],
            buttons: [],
            nextButtonSelector: null
        };

        // 입력 필드 및 선택 요소 분석
        const inputElements = Array.from(document.querySelectorAll('input, select, textarea'));
        
        result.fields = inputElements.map(input => {
            // 입력 필드 정보 추출
            const field = {
                name: input.name || input.id || '',
                id: input.id || '',
                type: input.type || input.tagName.toLowerCase(),
                required: input.required,
                disabled: input.disabled,
                readOnly: input.readOnly,
                placeholder: input.placeholder || '',
                value: input.value || '',
                label: ''
            };
            
            // 라벨 텍스트 추출
            if (input.id) {
                const labelElement = document.querySelector(`label[for="${input.id}"]`);
                if (labelElement) {
                    field.label = labelElement.innerText.trim();
                }
            }
            
            // select 요소인 경우 옵션 추출
            if (input.tagName.toLowerCase() === 'select') {
                field.options = Array.from(input.options).map(option => ({
                    value: option.value,
                    text: option.text,
                    selected: option.selected
                }));
            }
            
            return field;
        });
        
        // 버튼 요소 분석
        const buttonElements = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a.button, a[role="button"]'));
        
        result.buttons = buttonElements.map(button => {
            return {
                text: button.innerText || button.value || '',
                id: button.id || '',
                type: button.type || button.tagName.toLowerCase(),
                disabled: button.disabled,
                classes: button.className,
                selector: button.id ? `#${button.id}` : 
                          button.className ? `${button.tagName.toLowerCase()}.${button.className.split(' ').join('.')}` :
                          button.tagName.toLowerCase()
            };
        });
        
        // 다음 단계 버튼 찾기
        const nextButtonKeywords = [
            'continuar', 'prosseguir', 'finalizar', 'checkout', 
            'proceed', 'continue', 'next', 'comprar', 'buy'
        ];
        
        for (const button of buttonElements) {
            const buttonText = (button.innerText || button.value || '').toLowerCase();
            if (nextButtonKeywords.some(keyword => buttonText.includes(keyword)) && 
                !buttonText.includes('comprar mais') && 
                !buttonText.includes('continue shopping') &&
                !button.disabled) {
                
                result.nextButtonSelector = button.id ? `#${button.id}` : 
                                            button.className ? `${button.tagName.toLowerCase()}.${button.className.split(' ').join('.')}` :
                                            button.tagName.toLowerCase();
                break;
            }
        }
        
        // 대안적인 다음 단계 버튼 선택자
        if (!result.nextButtonSelector) {
            const possibleSelectors = [
                '.checkout-button', 
                '.proceed-to-checkout', 
                '.continue-button', 
                'button[name="checkout"]',
                'input[name="checkout"]',
                'button.checkout',
                'a.checkout'
            ];
            
            for (const selector of possibleSelectors) {
                if (document.querySelector(selector)) {
                    result.nextButtonSelector = selector;
                    break;
                }
            }
        }
        
        return result;
    });
}

/**
 * 체크아웃 단계 분석
 * @param {Page} page - Puppeteer 페이지 인스턴스
 * @param {number} stepNumber - 현재 단계 번호
 * @returns {Promise<Object>} 체크아웃 단계 정보
 */
async function analyzeCheckoutStep(page, stepNumber) {
    console.log(`체크아웃 단계 ${stepNumber} 분석 중...`);
    
    return await page.evaluate((stepNumber) => {
        // 결과 객체 초기화
        const result = {
            name: `단계 ${stepNumber}`,
            fields: [],
            buttons: [],
            nextButtonSelector: null
        };

        // 단계 이름/제목 추출 시도
        const possibleTitleSelectors = [
            '.checkout-step-title',
            '.step-title',
            '.checkout-title',
            'h1.checkout',
            'h2.checkout',
            'h3.checkout',
            '.checkout h1',
            '.checkout h2',
            '.checkout h3',
            '.checkout-step.active .title',
            '.active-step .title'
        ];
        
        for (const selector of possibleTitleSelectors) {
            const titleElement = document.querySelector(selector);
            if (titleElement && titleElement.innerText.trim()) {
                result.name = titleElement.innerText.trim();
                break;
            }
        }
        
        // 브레드크럼에서 단계 이름 추출 시도
        if (result.name === `단계 ${stepNumber}`) {
            const breadcrumbSteps = Array.from(document.querySelectorAll('.breadcrumb li, .checkout-steps li, .steps li'));
            if (breadcrumbSteps.length >= stepNumber) {
                const stepText = breadcrumbSteps[stepNumber - 1]?.innerText.trim();
                if (stepText) {
                    result.name = stepText;
                }
            }
        }

        // 체크아웃 단계 확인
        let stepType = '';
        const currentUrl = window.location.href.toLowerCase();
        const bodyText = document.body.innerText.toLowerCase();
        
        if (currentUrl.includes('shipping') || 
            currentUrl.includes('address') || 
            currentUrl.includes('endereco') || 
            bodyText.includes('endereco de entrega') || 
            bodyText.includes('shipping address')) {
            stepType = 'shipping';
            if (result.name === `단계 ${stepNumber}`) {
                result.name = 'Endereço de Entrega';
            }
        } else if (currentUrl.includes('payment') || 
                  currentUrl.includes('pagamento') || 
                  bodyText.includes('forma de pagamento') || 
                  bodyText.includes('payment method')) {
            stepType = 'payment';
            if (result.name === `단계 ${stepNumber}`) {
                result.name = 'Forma de Pagamento';
            }
        } else if (currentUrl.includes('review') || 
                  currentUrl.includes('confirmation') || 
                  currentUrl.includes('confirmacao') || 
                  bodyText.includes('confirmacao de pedido') || 
                  bodyText.includes('order confirmation')) {
            stepType = 'review';
            if (result.name === `단계 ${stepNumber}`) {
                result.name = 'Confirmação do Pedido';
            }
        } else if (currentUrl.includes('login') || 
                  bodyText.includes('login') || 
                  bodyText.includes('entrar')) {
            stepType = 'login';
            if (result.name === `단계 ${stepNumber}`) {
                result.name = 'Login';
            }
        } else if (currentUrl.includes('personal') || 
                  currentUrl.includes('customer') || 
                  currentUrl.includes('information') || 
                  bodyText.includes('informacoes pessoais') || 
                  bodyText.includes('personal information')) {
            stepType = 'personal';
            if (result.name === `단계 ${stepNumber}`) {
                result.name = 'Informações Pessoais';
            }
        }

        // 입력 필드 및 선택 요소 분석
        const inputElements = Array.from(document.querySelectorAll('input, select, textarea'));
        
        result.fields = inputElements.map(input => {
            // 입력 필드 정보 추출
            const field = {
                name: input.name || input.id || '',
                id: input.id || '',
                type: input.type || input.tagName.toLowerCase(),
                required: input.required,
                disabled: input.disabled,
                readOnly: input.readOnly,
                placeholder: input.placeholder || '',
                value: input.value || '',
                label: '',
                validationPattern: input.pattern || null
            };
            
            // 라벨 텍스트 추출
            if (input.id) {
                const labelElement = document.querySelector(`label[for="${input.id}"]`);
                if (labelElement) {
                    field.label = labelElement.innerText.trim();
                }
            }
            
            // 친숙한 이름 추정
            if (!field.label && field.placeholder) {
                field.label = field.placeholder;
            } else if (!field.label && field.name) {
                // 필드 이름에서 친숙한 라벨 추정
                field.label = field.name
                    .replace(/([A-Z])/g, ' $1')
                    .replace(/_/g, ' ')
                    .replace(/-/g, ' ')
                    .trim()
                    .replace(/^\w/, c => c.toUpperCase());
            }
            
            // select 요소인 경우 옵션 추출
            if (input.tagName.toLowerCase() === 'select') {
                field.options = Array.from(input.options).map(option => ({
                    value: option.value,
                    text: option.text,
                    selected: option.selected
                }));
            }
            
            // 라디오 버튼 및 체크박스 분석
            if (input.type === 'radio' || input.type === 'checkbox') {
                field.checked = input.checked;
                
                // 같은 name의 다른 옵션들 찾기
                if (input.name) {
                    const sameNameElements = Array.from(
                        document.querySelectorAll(`input[name="${input.name}"]`)
                    );
                    
                    if (sameNameElements.length > 1) {
                        field.options = sameNameElements.map(el => {
                            let optionLabel = '';
                            
                            // 옵션 라벨 찾기
                            if (el.id) {
                                const labelEl = document.querySelector(`label[for="${el.id}"]`);
                                if (labelEl) {
                                    optionLabel = labelEl.innerText.trim();
                                }
                            }
                            
                            // 라벨이 없으면 부모 요소에서 텍스트 찾기
                            if (!optionLabel) {
                                const parentLabel = el.closest('label');
                                if (parentLabel) {
                                    optionLabel = parentLabel.innerText.trim()
                                        .replace(el.value, '')
                                        .trim();
                                }
                            }
                            
                            return {
                                value: el.value,
                                text: optionLabel || el.value,
                                checked: el.checked
                            };
                        });
                    }
                }
            }
            
            return field;
        }).filter(field => {
            // 숨겨진 필드나 의미 없는 필드 제외
            return field.name && 
                   !field.name.includes('csrf') && 
                   !field.name.includes('token') && 
                   !field.name.includes('hidden') && 
                   field.type !== 'hidden';
        });
        
        // 버튼 요소 분석
        const buttonElements = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a.button, a[role="button"]'));
        
        result.buttons = buttonElements.map(button => {
            return {
                text: button.innerText || button.value || '',
                id: button.id || '',
                type: button.type || button.tagName.toLowerCase(),
                disabled: button.disabled,
                classes: button.className,
                selector: button.id ? `#${button.id}` : 
                          button.className ? `${button.tagName.toLowerCase()}.${button.className.split(' ').join('.')}` :
                          button.tagName.toLowerCase()
            };
        });
        
        // 다음 단계 버튼 찾기
        const nextButtonKeywords = [
            'continuar', 'prosseguir', 'finalizar', 'checkout', 
            'proceed', 'continue', 'next', 'comprar', 'buy',
            'confirm', 'confirmar', 'place order', 'submit'
        ];
        
        for (const button of buttonElements) {
            const buttonText = (button.innerText || button.value || '').toLowerCase();
            if (nextButtonKeywords.some(keyword => buttonText.includes(keyword)) && 
                !buttonText.includes('voltar') && 
                !buttonText.includes('back') &&
                !button.disabled) {
                
                result.nextButtonSelector = button.id ? `#${button.id}` : 
                                            button.className ? `${button.tagName.toLowerCase()}.${button.className.split(' ').join('.')}` :
                                            button.tagName.toLowerCase();
                break;
            }
        }
        
        // 대안적인 다음 단계 버튼 선택자
        if (!result.nextButtonSelector) {
            const possibleSelectors = [
                '.continue-button', 
                '.next-step-button', 
                'button[type="submit"]',
                'input[type="submit"]',
                'button.checkout-button',
                'button.next-button',
                'button.submit-button'
            ];
            
            for (const selector of possibleSelectors) {
                if (document.querySelector(selector)) {
                    result.nextButtonSelector = selector;
                    break;
                }
            }
        }
        
        // 필드 분석 추가 정보
        result.stepType = stepType;
        result.formAction = '';
        
        // 폼 액션 URL 추출
        const formElement = document.querySelector('form');
        if (formElement && formElement.action) {
            result.formAction = formElement.action;
        }
        
        return result;
    }, stepNumber);
}
