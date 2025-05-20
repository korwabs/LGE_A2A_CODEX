/**
 * 체크아웃 프로세스 매니저 - 체크아웃 프로세스의 각 단계와 상태를 관리합니다.
 */
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

class CheckoutProcessManager {
  /**
   * @param {object} options - 체크아웃 프로세스 매니저 옵션
   * @param {string} options.dataDir - 데이터 저장 디렉토리
   */
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(__dirname, '../../../data/checkout');
    this.checkoutProcessCache = new Map();
    this.logger = logger;
    
    // 데이터 디렉토리 확인
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }
  
  /**
   * 체크아웃 프로세스 정보를 저장합니다.
   * @param {string} productId - 제품 ID 또는 카테고리 ID
   * @param {object} checkoutProcess - 체크아웃 프로세스 정보
   */
  saveCheckoutProcess(productId, checkoutProcess) {
    try {
      const filename = this._getCheckoutProcessFilename(productId);
      
      // 메타데이터 추가
      const processWithMeta = {
        ...checkoutProcess,
        _meta: {
          productId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };
      
      // 파일에 저장
      fs.writeFileSync(
        filename, 
        JSON.stringify(processWithMeta, null, 2)
      );
      
      // 캐시에 저장
      this.checkoutProcessCache.set(productId, processWithMeta);
      
      this.logger.info(`Checkout process for '${productId}' saved to ${filename}`);
    } catch (error) {
      this.logger.error(`Failed to save checkout process for '${productId}':`, error);
    }
  }
  
  /**
   * 체크아웃 프로세스 정보를 로드합니다.
   * @param {string} productId - 제품 ID 또는 카테고리 ID
   * @returns {object|null} 체크아웃 프로세스 정보
   */
  loadCheckoutProcess(productId) {
    try {
      // 캐시에서 먼저 확인
      if (this.checkoutProcessCache.has(productId)) {
        return this.checkoutProcessCache.get(productId);
      }
      
      const filename = this._getCheckoutProcessFilename(productId);
      
      if (fs.existsSync(filename)) {
        const data = fs.readFileSync(filename, 'utf8');
        const process = JSON.parse(data);
        
        // 캐시에 저장
        this.checkoutProcessCache.set(productId, process);
        
        return process;
      } else {
        // 제품별 프로세스가 없으면 기본(default) 체크아웃 프로세스 시도
        return this.loadDefaultCheckoutProcess();
      }
    } catch (error) {
      this.logger.error(`Failed to load checkout process for '${productId}':`, error);
      return null;
    }
  }
  
  /**
   * 기본 체크아웃 프로세스 정보를 로드합니다.
   * @returns {object|null} 기본 체크아웃 프로세스 정보
   */
  loadDefaultCheckoutProcess() {
    try {
      // 캐시에서 먼저 확인
      if (this.checkoutProcessCache.has('default')) {
        return this.checkoutProcessCache.get('default');
      }
      
      const filename = this._getCheckoutProcessFilename('default');
      
      if (fs.existsSync(filename)) {
        const data = fs.readFileSync(filename, 'utf8');
        const process = JSON.parse(data);
        
        // 캐시에 저장
        this.checkoutProcessCache.set('default', process);
        
        return process;
      }
      
      return null;
    } catch (error) {
      this.logger.error('Failed to load default checkout process:', error);
      return null;
    }
  }
  
  /**
   * 모든 체크아웃 프로세스 파일 목록을 가져옵니다.
   * @returns {Array<string>} 체크아웃 프로세스 파일 목록
   */
  getCheckoutProcessFiles() {
    try {
      const files = fs.readdirSync(this.dataDir)
        .filter(file => file.endsWith('.json'))
        .map(file => path.join(this.dataDir, file));
      
      return files;
    } catch (error) {
      this.logger.error('Failed to get checkout process files:', error);
      return [];
    }
  }
  
  /**
   * 체크아웃 프로세스 파일을 최신 순으로 가져옵니다.
   * @param {number} limit - 가져올 파일 수 제한
   * @returns {Array<object>} 체크아웃 프로세스 정보 목록
   */
  getRecentCheckoutProcesses(limit = 5) {
    try {
      const files = this.getCheckoutProcessFiles();
      
      // 파일 통계 정보 가져오기
      const fileStats = files.map(file => {
        const stat = fs.statSync(file);
        return {
          file,
          mtime: stat.mtime
        };
      });
      
      // 최신 수정일 순으로 정렬
      fileStats.sort((a, b) => b.mtime - a.mtime);
      
      // 제한된 수의 최신 파일만 처리
      const recentFiles = fileStats.slice(0, limit).map(stat => stat.file);
      
      // 파일에서 체크아웃 프로세스 정보 로드
      const processes = recentFiles.map(file => {
        try {
          const data = fs.readFileSync(file, 'utf8');
          return JSON.parse(data);
        } catch (error) {
          this.logger.error(`Failed to read checkout process file ${file}:`, error);
          return null;
        }
      }).filter(process => process !== null);
      
      return processes;
    } catch (error) {
      this.logger.error('Failed to get recent checkout processes:', error);
      return [];
    }
  }
  
  /**
   * 체크아웃 프로세스에서 단계 정보를 추출합니다.
   * @param {object} checkoutProcess - 체크아웃 프로세스 정보
   * @returns {Array} 체크아웃 단계 정보 목록
   */
  extractCheckoutSteps(checkoutProcess) {
    if (!checkoutProcess) return [];
    
    const steps = [];
    
    // 기본 단계 정보 추가
    steps.push({
      name: 'initial',
      title: '기본 정보',
      url: checkoutProcess.url,
      forms: checkoutProcess.forms || []
    });
    
    // 다음 단계가 있으면 추가
    let nextStep = checkoutProcess.nextStep;
    while (nextStep) {
      steps.push({
        name: `step-${steps.length}`,
        title: `단계 ${steps.length}`,
        url: nextStep.url,
        forms: nextStep.forms || []
      });
      
      nextStep = nextStep.nextStep;
    }
    
    return steps;
  }
  
  /**
   * 체크아웃 프로세스에서 필수 필드 목록을 추출합니다.
   * @param {object} checkoutProcess - 체크아웃 프로세스 정보
   * @returns {Array} 필수 필드 목록
   */
  extractRequiredFields(checkoutProcess) {
    if (!checkoutProcess) return [];
    
    const requiredFields = [];
    
    // 모든 폼에서 필수 필드 추출
    const processAllForms = (process) => {
      if (!process || !process.forms) return;
      
      process.forms.forEach(form => {
        if (!form.fields) return;
        
        form.fields.forEach(field => {
          if (field.required) {
            requiredFields.push({
              name: field.name,
              type: field.type,
              label: field.label,
              placeholder: field.placeholder,
              options: field.options || []
            });
          }
        });
      });
      
      // 다음 단계가 있으면 재귀적으로 처리
      if (process.nextStep) {
        processAllForms(process.nextStep);
      }
    };
    
    processAllForms(checkoutProcess);
    
    return requiredFields;
  }
  
  /**
   * 체크아웃 프로세스의 필드를 분석하여 사용자 정보 매핑을 위한 데이터를 추출합니다.
   * @param {object} checkoutProcess - 체크아웃 프로세스 정보
   * @returns {object} 필드 매핑 정보
   */
  analyzeFieldMappings(checkoutProcess) {
    if (!checkoutProcess) return {};
    
    const fieldMappings = {
      personalInfo: [],   // 개인 정보 필드 (이름, 이메일 등)
      addressInfo: [],    // 주소 관련 필드
      shippingInfo: [],   // 배송 관련 필드
      paymentInfo: [],    // 결제 관련 필드
      termsInfo: [],      // 이용약관 관련 필드
      otherInfo: []       // 기타 필드
    };
    
    // 모든 폼 필드를 분석하여 분류
    const processAllFields = (process) => {
      if (!process || !process.forms) return;
      
      process.forms.forEach(form => {
        if (!form.fields) return;
        
        form.fields.forEach(field => {
          const fieldName = field.name?.toLowerCase() || '';
          const fieldLabel = field.label?.toLowerCase() || '';
          
          // 필드 분류
          if (fieldName.includes('name') || fieldName.includes('email') || 
              fieldName.includes('phone') || fieldName.includes('tel') ||
              fieldLabel.includes('nome') || fieldLabel.includes('email') || 
              fieldLabel.includes('telefone')) {
            fieldMappings.personalInfo.push({...field});
          }
          else if (fieldName.includes('address') || fieldName.includes('city') || 
                  fieldName.includes('state') || fieldName.includes('zip') || 
                  fieldName.includes('cep') || fieldName.includes('postal') ||
                  fieldLabel.includes('endereco') || fieldLabel.includes('cidade') || 
                  fieldLabel.includes('estado') || fieldLabel.includes('cep')) {
            fieldMappings.addressInfo.push({...field});
          }
          else if (fieldName.includes('shipping') || fieldName.includes('delivery') ||
                  fieldLabel.includes('entrega') || fieldLabel.includes('envio')) {
            fieldMappings.shippingInfo.push({...field});
          }
          else if (fieldName.includes('payment') || fieldName.includes('card') || 
                  fieldName.includes('credit') || fieldName.includes('cvv') ||
                  fieldLabel.includes('pagamento') || fieldLabel.includes('cartao')) {
            fieldMappings.paymentInfo.push({...field});
          }
          else if (fieldName.includes('terms') || fieldName.includes('privacy') || 
                  fieldName.includes('agree') || fieldName.includes('policy') ||
                  fieldLabel.includes('termos') || fieldLabel.includes('concordo')) {
            fieldMappings.termsInfo.push({...field});
          }
          else {
            fieldMappings.otherInfo.push({...field});
          }
        });
      });
      
      // 다음 단계가 있으면 재귀적으로 처리
      if (process.nextStep) {
        processAllFields(process.nextStep);
      }
    };
    
    processAllFields(checkoutProcess);
    
    return fieldMappings;
  }
  
  /**
   * 제품 ID에 대한 체크아웃 프로세스 파일 경로를 생성합니다.
   * @param {string} productId - 제품 ID 또는 카테고리 ID
   * @returns {string} 파일 경로
   * @private
   */
  _getCheckoutProcessFilename(productId) {
    // 파일명에서 특수문자 제거
    const safeId = productId.replace(/[^a-zA-Z0-9-_]/g, '_');
    return path.join(this.dataDir, `checkout-process-${safeId}.json`);
  }
  
  /**
   * 캐시를 정리합니다.
   */
  clearCache() {
    this.checkoutProcessCache.clear();
    this.logger.info('Checkout process cache cleared');
  }
}

module.exports = CheckoutProcessManager;
