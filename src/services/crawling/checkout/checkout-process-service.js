/**
 * 체크아웃 프로세스 서비스
 * 크롤링된 체크아웃 프로세스 데이터를 처리하고 관리합니다.
 */
const fs = require('fs');
const path = require('path');

class CheckoutProcessService {
  /**
   * 생성자
   * @param {Object} options - 설정 옵션
   * @param {Object} cacheService - 캐시 서비스
   * @param {Object} logger - 로거 인스턴스
   */
  constructor(options = {}, cacheService, logger = console) {
    this.options = {
      dataDir: options.dataDir || path.join(process.cwd(), 'data', 'checkout'),
      cacheExpiry: options.cacheExpiry || 7 * 24 * 60 * 60, // 7일 (초 단위)
      ...options
    };
    
    this.cacheService = cacheService;
    this.logger = logger;
    
    // 데이터 디렉토리 생성
    if (!fs.existsSync(this.options.dataDir)) {
      fs.mkdirSync(this.options.dataDir, { recursive: true });
    }
  }
  
  /**
   * 체크아웃 프로세스 데이터 저장
   * @param {string} productId - 제품 ID 또는 카테고리 ID
   * @param {Object} checkoutData - 체크아웃 프로세스 데이터
   * @returns {Promise<boolean>} 저장 성공 여부
   */
  async saveCheckoutProcess(productId, checkoutData) {
    try {
      if (!productId || !checkoutData) {
        throw new Error('제품 ID와 체크아웃 데이터가 필요합니다.');
      }
      
      // 체크아웃 데이터에 메타데이터 추가
      const dataToSave = {
        ...checkoutData,
        productId,
        timestamp: new Date().toISOString(),
        version: '1.0'
      };
      
      // 파일 경로 생성
      const filePath = path.join(this.options.dataDir, `${productId}.json`);
      
      // 데이터 JSON 파일로 저장
      fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2));
      
      // 캐시에도 저장
      if (this.cacheService) {
        await this.cacheService.set(
          `checkout:${productId}`, 
          dataToSave, 
          this.options.cacheExpiry
        );
      }
      
      this.logger.info(`체크아웃 프로세스 데이터 저장 완료: ${productId}`);
      return true;
    } catch (error) {
      this.logger.error(`체크아웃 프로세스 데이터 저장 오류:`, error);
      return false;
    }
  }
  
  /**
   * 체크아웃 프로세스 데이터 조회
   * @param {string} productId - 제품 ID 또는 카테고리 ID
   * @returns {Promise<Object|null>} 체크아웃 프로세스 데이터
   */
  async getCheckoutProcess(productId) {
    try {
      if (!productId) {
        throw new Error('제품 ID가 필요합니다.');
      }
      
      // 캐시에서 먼저 조회
      if (this.cacheService) {
        const cachedData = await this.cacheService.get(`checkout:${productId}`);
        if (cachedData) {
          this.logger.debug(`캐시에서 체크아웃 프로세스 데이터 조회: ${productId}`);
          return cachedData;
        }
      }
      
      // 파일에서 조회
      const filePath = path.join(this.options.dataDir, `${productId}.json`);
      
      if (!fs.existsSync(filePath)) {
        // 제품별 데이터가 없으면 카테고리 데이터 확인
        const categoryId = this._extractCategoryId(productId);
        if (categoryId && categoryId !== productId) {
          return this.getCheckoutProcess(categoryId);
        }
        
        // 기본 데이터 반환
        return this.getDefaultCheckoutProcess();
      }
      
      const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      // 캐시에 저장
      if (this.cacheService) {
        await this.cacheService.set(
          `checkout:${productId}`, 
          fileData, 
          this.options.cacheExpiry
        );
      }
      
      return fileData;
    } catch (error) {
      this.logger.error(`체크아웃 프로세스 데이터 조회 오류:`, error);
      return this.getDefaultCheckoutProcess();
    }
  }
  
  /**
   * 체크아웃 프로세스 단계 조회
   * @param {string} productId - 제품 ID 또는 카테고리 ID
   * @param {number} stepNumber - 단계 번호
   * @returns {Promise<Object|null>} 체크아웃 단계 데이터
   */
  async getCheckoutStep(productId, stepNumber) {
    try {
      const checkoutProcess = await this.getCheckoutProcess(productId);
      
      if (!checkoutProcess || !checkoutProcess.steps || checkoutProcess.steps.length === 0) {
        return null;
      }
      
      // 단계 번호로 단계 찾기
      const step = checkoutProcess.steps.find(s => s.step === stepNumber);
      
      return step || null;
    } catch (error) {
      this.logger.error(`체크아웃 단계 조회 오류:`, error);
      return null;
    }
  }
  
  /**
   * 체크아웃 프로세스의 모든 필드 조회
   * @param {string} productId - 제품 ID 또는 카테고리 ID
   * @returns {Promise<Array>} 모든 필드 정보 배열
   */
  async getAllFields(productId) {
    try {
      const checkoutProcess = await this.getCheckoutProcess(productId);
      
      if (!checkoutProcess || !checkoutProcess.steps || checkoutProcess.steps.length === 0) {
        return [];
      }
      
      // 모든 단계의 필드 수집
      const allFields = [];
      
      for (const step of checkoutProcess.steps) {
        if (step.fields && Array.isArray(step.fields)) {
          for (const field of step.fields) {
            // 필드에 단계 정보 추가
            allFields.push({
              ...field,
              step: step.step,
              stepName: step.name
            });
          }
        }
      }
      
      return allFields;
    } catch (error) {
      this.logger.error(`모든 필드 조회 오류:`, error);
      return [];
    }
  }
  
  /**
   * 지정된 이름 또는 유형과 일치하는 필드 찾기
   * @param {string} productId - 제품 ID 또는 카테고리 ID
   * @param {Object} criteria - 검색 기준 (이름, 유형 등)
   * @returns {Promise<Array>} 일치하는 필드 정보 배열
   */
  async findFields(productId, criteria = {}) {
    try {
      const allFields = await this.getAllFields(productId);
      
      if (!allFields || allFields.length === 0) {
        return [];
      }
      
      // 기준에 따라 필드 필터링
      return allFields.filter(field => {
        let match = true;
        
        if (criteria.name) {
          const namePattern = new RegExp(criteria.name, 'i');
          match = match && (
            namePattern.test(field.name) || 
            namePattern.test(field.id) || 
            namePattern.test(field.label)
          );
        }
        
        if (criteria.type) {
          const typePattern = new RegExp(criteria.type, 'i');
          match = match && typePattern.test(field.type);
        }
        
        if (criteria.required !== undefined) {
          match = match && field.required === criteria.required;
        }
        
        if (criteria.step) {
          match = match && field.step === criteria.step;
        }
        
        return match;
      });
    } catch (error) {
      this.logger.error(`필드 검색 오류:`, error);
      return [];
    }
  }
  
  /**
   * 대화에서 추출한 정보와 체크아웃 필드 매핑
   * @param {string} productId - 제품 ID 또는 카테고리 ID
   * @param {Object} extractedInfo - 대화에서 추출한 정보
   * @returns {Promise<Object>} 매핑된 필드 데이터
   */
  async mapExtractedInfoToFields(productId, extractedInfo) {
    try {
      const allFields = await this.getAllFields(productId);
      const mappedData = {};
      
      if (!allFields || allFields.length === 0 || !extractedInfo) {
        return mappedData;
      }
      
      // 추출된 정보의 각 키에 대해 적절한 필드 매핑
      for (const [key, value] of Object.entries(extractedInfo)) {
        if (!value) continue;
        
        // 1. 직접 매칭: 필드 이름이 키와 일치
        let matchedField = allFields.find(f => 
          f.name.toLowerCase() === key.toLowerCase() ||
          f.id.toLowerCase() === key.toLowerCase()
        );
        
        // 2. 라벨 매칭: 필드 라벨이 키와 일치
        if (!matchedField) {
          matchedField = allFields.find(f => 
            f.label && f.label.toLowerCase() === key.toLowerCase()
          );
        }
        
        // 3. 부분 매칭: 필드 이름이 키를 포함
        if (!matchedField) {
          matchedField = allFields.find(f => 
            f.name.toLowerCase().includes(key.toLowerCase()) ||
            f.id.toLowerCase().includes(key.toLowerCase()) ||
            (f.label && f.label.toLowerCase().includes(key.toLowerCase()))
          );
        }
        
        // 4. 의미적 매칭: 일반적인 필드 유형
        if (!matchedField) {
          // 주소 관련 필드
          if (['address', 'endereco', 'shipping'].some(term => key.toLowerCase().includes(term))) {
            matchedField = allFields.find(f => 
              ['address', 'endereco', 'shipping_address'].some(term => 
                f.name.toLowerCase().includes(term)
              )
            );
          }
          // 우편번호 관련 필드
          else if (['zipcode', 'zip', 'postal', 'cep'].some(term => key.toLowerCase().includes(term))) {
            matchedField = allFields.find(f => 
              ['zipcode', 'zip', 'postal_code', 'cep'].some(term => 
                f.name.toLowerCase().includes(term)
              )
            );
          }
          // 이름 관련 필드
          else if (['name', 'nome'].some(term => key.toLowerCase().includes(term))) {
            matchedField = allFields.find(f => 
              ['name', 'firstname', 'nome'].some(term => 
                f.name.toLowerCase().includes(term)
              )
            );
          }
          // 이메일 관련 필드
          else if (['email', 'e-mail'].some(term => key.toLowerCase().includes(term))) {
            matchedField = allFields.find(f => 
              f.name.toLowerCase().includes('email') ||
              f.type === 'email'
            );
          }
          // 전화번호 관련 필드
          else if (['phone', 'telefone', 'tel'].some(term => key.toLowerCase().includes(term))) {
            matchedField = allFields.find(f => 
              ['phone', 'telefone', 'tel'].some(term => 
                f.name.toLowerCase().includes(term)
              ) ||
              f.type === 'tel'
            );
          }
          // 도시 관련 필드
          else if (['city', 'cidade'].some(term => key.toLowerCase().includes(term))) {
            matchedField = allFields.find(f => 
              ['city', 'cidade'].some(term => 
                f.name.toLowerCase().includes(term)
              )
            );
          }
          // 주/도 관련 필드
          else if (['state', 'estado', 'province'].some(term => key.toLowerCase().includes(term))) {
            matchedField = allFields.find(f => 
              ['state', 'estado', 'province'].some(term => 
                f.name.toLowerCase().includes(term)
              )
            );
          }
          // 결제 방법 관련 필드
          else if (['payment', 'pagamento', 'card'].some(term => key.toLowerCase().includes(term))) {
            matchedField = allFields.find(f => 
              ['payment_method', 'pagamento', 'card_type'].some(term => 
                f.name.toLowerCase().includes(term)
              )
            );
          }
        }
        
        if (matchedField) {
          mappedData[matchedField.name || matchedField.id] = value;
        }
      }
      
      return mappedData;
    } catch (error) {
      this.logger.error(`정보 매핑 오류:`, error);
      return {};
    }
  }
  
  /**
   * 기본 체크아웃 프로세스 데이터 반환
   * @returns {Object} 기본 체크아웃 프로세스 데이터
   */
  getDefaultCheckoutProcess() {
    return {
      steps: [
        {
          step: 1,
          name: 'Carrinho de Compras',
          description: 'Revise os produtos no seu carrinho de compras',
          fields: [],
          buttons: [
            {
              text: 'Finalizar Compra',
              selector: '.checkout-button'
            }
          ],
          nextButtonSelector: '.checkout-button, .proceed-to-checkout'
        },
        {
          step: 2,
          name: 'Informações Pessoais',
          description: 'Preencha suas informações pessoais',
          fields: [
            {
              name: 'name',
              id: 'name',
              type: 'text',
              required: true,
              label: 'Nome completo'
            },
            {
              name: 'email',
              id: 'email',
              type: 'email',
              required: true,
              label: 'Endereço de e-mail'
            },
            {
              name: 'phone',
              id: 'phone',
              type: 'tel',
              required: true,
              label: 'Número de telefone'
            }
          ],
          buttons: [
            {
              text: 'Continuar',
              selector: '.next-step-button'
            }
          ],
          nextButtonSelector: '.next-step-button'
        },
        {
          step: 3,
          name: 'Endereço de Entrega',
          description: 'Informe seu endereço de entrega',
          fields: [
            {
              name: 'zipCode',
              id: 'zipCode',
              type: 'text',
              required: true,
              label: 'CEP'
            },
            {
              name: 'address',
              id: 'address',
              type: 'text',
              required: true,
              label: 'Endereço completo'
            },
            {
              name: 'city',
              id: 'city',
              type: 'text',
              required: true,
              label: 'Cidade'
            },
            {
              name: 'state',
              id: 'state',
              type: 'text',
              required: true,
              label: 'Estado'
            }
          ],
          buttons: [
            {
              text: 'Continuar',
              selector: '.next-step-button'
            }
          ],
          nextButtonSelector: '.next-step-button'
        },
        {
          step: 4,
          name: 'Método de Pagamento',
          description: 'Escolha o método de pagamento',
          fields: [
            {
              name: 'paymentMethod',
              id: 'paymentMethod',
              type: 'select',
              required: true,
              label: 'Método de pagamento',
              options: [
                {
                  value: 'credit_card',
                  text: 'Cartão de Crédito'
                },
                {
                  value: 'boleto',
                  text: 'Boleto Bancário'
                },
                {
                  value: 'pix',
                  text: 'PIX'
                }
              ]
            }
          ],
          buttons: [
            {
              text: 'Finalizar Pedido',
              selector: '.next-step-button'
            }
          ],
          nextButtonSelector: '.next-step-button'
        }
      ],
      version: '1.0',
      timestamp: new Date().toISOString(),
      isDefault: true
    };
  }
  
  /**
   * 제품 ID에서 카테고리 ID 추출
   * @param {string} productId - 제품 ID
   * @returns {string|null} 카테고리 ID
   * @private
   */
  _extractCategoryId(productId) {
    // 제품 ID 형식이 'category-product' 형태인 경우
    const parts = productId.split('-');
    if (parts.length > 1) {
      return parts[0];
    }
    
    return null;
  }
}

module.exports = CheckoutProcessService;
