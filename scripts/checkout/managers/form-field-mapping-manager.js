/**
 * 폼 필드 매핑 관리자 - 체크아웃 프로세스의 폼 필드와 사용자 정보를 매핑합니다.
 */
const logger = require('../../utils/logger');

class FormFieldMappingManager {
  /**
   * @param {object} options - 폼 필드 매핑 옵션
   */
  constructor(options = {}) {
    this.logger = logger;
    this.mappingStrategies = this._setupMappingStrategies();
  }
  
  /**
   * 매핑 전략을 설정합니다.
   * @returns {object} 매핑 전략 객체
   * @private
   */
  _setupMappingStrategies() {
    return {
      // 텍스트 입력 필드
      text: this._mapTextInput.bind(this),
      email: this._mapEmailInput.bind(this),
      tel: this._mapTelInput.bind(this),
      password: this._mapPasswordInput.bind(this),
      number: this._mapNumberInput.bind(this),
      
      // 선택 필드
      select: this._mapSelectInput.bind(this),
      'select-one': this._mapSelectInput.bind(this),
      
      // 옵션 필드
      radio: this._mapRadioInput.bind(this),
      checkbox: this._mapCheckboxInput.bind(this),
      
      // 기타 필드
      hidden: this._mapHiddenInput.bind(this),
      textarea: this._mapTextareaInput.bind(this),
      
      // 기본 매핑
      default: this._mapGenericInput.bind(this)
    };
  }
  
  /**
   * 필드 타입에 따른 매핑 전략을 선택합니다.
   * @param {string} fieldType - 필드 타입
   * @returns {function} 매핑 전략 함수
   */
  getStrategy(fieldType) {
    return this.mappingStrategies[fieldType] || this.mappingStrategies.default;
  }
  
  /**
   * 사용자 정보를 URL 파라미터에 매핑합니다.
   * @param {object} checkoutProcess - 체크아웃 프로세스 정보
   * @param {object} userInfo - 사용자 정보
   * @param {URLSearchParams} params - URL 파라미터
   */
  mapUserInfoToParams(checkoutProcess, userInfo, params) {
    try {
      if (!checkoutProcess || !checkoutProcess.forms) {
        throw new Error('Invalid checkout process data');
      }
      
      // 모든 폼 필드 매핑
      this._processAllForms(checkoutProcess, userInfo, params);
    } catch (error) {
      this.logger.error('Failed to map user info to params:', error);
    }
  }
  
  /**
   * 모든 폼의 필드를 매핑합니다.
   * @param {object} process - 체크아웃 프로세스 정보
   * @param {object} userInfo - 사용자 정보
   * @param {URLSearchParams} params - URL 파라미터
   * @private
   */
  _processAllForms(process, userInfo, params) {
    // 현재 프로세스의 폼을 처리
    if (process.forms) {
      process.forms.forEach(form => {
        if (form.fields) {
          form.fields.forEach(field => {
            this._mapField(field, userInfo, params);
          });
        }
      });
    }
    
    // 다음 단계가 있으면 재귀적으로 처리
    if (process.nextStep) {
      this._processAllForms(process.nextStep, userInfo, params);
    }
  }
  
  /**
   * 단일 필드를 매핑합니다.
   * @param {object} field - 필드 정보
   * @param {object} userInfo - 사용자 정보
   * @param {URLSearchParams} params - URL 파라미터
   * @private
   */
  _mapField(field, userInfo, params) {
    // 필드 이름이 없는 경우 무시
    if (!field.name) return;
    
    // 필드 타입에 따른 매핑 전략 선택
    const strategy = this.getStrategy(field.type);
    strategy(field, userInfo, params);
  }
  
  /**
   * 텍스트 입력 필드를 매핑합니다.
   * @param {object} field - 필드 정보
   * @param {object} userInfo - 사용자 정보
   * @param {URLSearchParams} params - URL 파라미터
   * @private
   */
  _mapTextInput(field, userInfo, params) {
    const fieldName = field.name.toLowerCase();
    const fieldLabel = (field.label || '').toLowerCase();
    
    // 매핑 규칙
    if (this._matchesPattern(fieldName, fieldLabel, ['name', 'nome'])) {
      params.set(field.name, userInfo.name || '');
    }
    else if (this._matchesPattern(fieldName, fieldLabel, ['firstname', 'first-name', 'nome', 'first'])) {
      const firstName = userInfo.firstName || (userInfo.name ? userInfo.name.split(' ')[0] : '');
      params.set(field.name, firstName);
    }
    else if (this._matchesPattern(fieldName, fieldLabel, ['lastname', 'last-name', 'sobrenome', 'last'])) {
      const fullName = userInfo.name || '';
      const lastName = userInfo.lastName || (fullName.includes(' ') ? fullName.split(' ').slice(1).join(' ') : '');
      params.set(field.name, lastName);
    }
    else if (this._matchesPattern(fieldName, fieldLabel, ['street', 'address', 'endereco'])) {
      params.set(field.name, userInfo.address || userInfo.street || '');
    }
    else if (this._matchesPattern(fieldName, fieldLabel, ['number', 'num', 'numero'])) {
      params.set(field.name, userInfo.number || userInfo.houseNumber || '');
    }
    else if (this._matchesPattern(fieldName, fieldLabel, ['complement', 'complemento', 'additional'])) {
      params.set(field.name, userInfo.complement || userInfo.additionalInfo || '');
    }
    else if (this._matchesPattern(fieldName, fieldLabel, ['neighborhood', 'bairro', 'district'])) {
      params.set(field.name, userInfo.neighborhood || userInfo.district || '');
    }
    else if (this._matchesPattern(fieldName, fieldLabel, ['city', 'cidade'])) {
      params.set(field.name, userInfo.city || '');
    }
    else if (this._matchesPattern(fieldName, fieldLabel, ['state', 'estado', 'province'])) {
      params.set(field.name, userInfo.state || userInfo.province || '');
    }
    else if (this._matchesPattern(fieldName, fieldLabel, ['zip', 'cep', 'postal', 'zipcode'])) {
      params.set(field.name, userInfo.zipCode || userInfo.postalCode || userInfo.cep || '');
    }
    else if (this._matchesPattern(fieldName, fieldLabel, ['country', 'pais'])) {
      params.set(field.name, userInfo.country || 'Brasil');
    }
    else if (field.required && userInfo[fieldName]) {
      // 필수 필드 중 userInfo에 일치하는 키가 있는 경우
      params.set(field.name, userInfo[fieldName]);
    }
  }
  
  /**
   * 이메일 입력 필드를 매핑합니다.
   * @param {object} field - 필드 정보
   * @param {object} userInfo - 사용자 정보
   * @param {URLSearchParams} params - URL 파라미터
   * @private
   */
  _mapEmailInput(field, userInfo, params) {
    params.set(field.name, userInfo.email || '');
  }
  
  /**
   * 전화번호 입력 필드를 매핑합니다.
   * @param {object} field - 필드 정보
   * @param {object} userInfo - 사용자 정보
   * @param {URLSearchParams} params - URL 파라미터
   * @private
   */
  _mapTelInput(field, userInfo, params) {
    const fieldName = field.name.toLowerCase();
    const fieldLabel = (field.label || '').toLowerCase();
    
    if (this._matchesPattern(fieldName, fieldLabel, ['mobile', 'cel', 'celular'])) {
      params.set(field.name, userInfo.mobile || userInfo.cellPhone || userInfo.phone || '');
    } else {
      params.set(field.name, userInfo.phone || userInfo.telephone || '');
    }
  }
  
  /**
   * 비밀번호 입력 필드를 매핑합니다.
   * @param {object} field - 필드 정보
   * @param {object} userInfo - 사용자 정보
   * @param {URLSearchParams} params - URL 파라미터
   * @private
   */
  _mapPasswordInput(field, userInfo, params) {
    // 보안상 비밀번호는 딥링크에 포함하지 않음
    // 필요한 경우 별도의 처리 로직 구현
  }
  
  /**
   * 숫자 입력 필드를 매핑합니다.
   * @param {object} field - 필드 정보
   * @param {object} userInfo - 사용자 정보
   * @param {URLSearchParams} params - URL 파라미터
   * @private
   */
  _mapNumberInput(field, userInfo, params) {
    const fieldName = field.name.toLowerCase();
    const fieldLabel = (field.label || '').toLowerCase();
    
    if (this._matchesPattern(fieldName, fieldLabel, ['quantity', 'qty', 'quantidade'])) {
      params.set(field.name, userInfo.quantity || '1');
    }
    else if (this._matchesPattern(fieldName, fieldLabel, ['age', 'idade'])) {
      params.set(field.name, userInfo.age || '');
    }
    else if (field.required && userInfo[fieldName] !== undefined) {
      params.set(field.name, userInfo[fieldName].toString());
    }
  }
  
  /**
   * select 입력 필드를 매핑합니다.
   * @param {object} field - 필드 정보
   * @param {object} userInfo - 사용자 정보
   * @param {URLSearchParams} params - URL 파라미터
   * @private
   */
  _mapSelectInput(field, userInfo, params) {
    const fieldName = field.name.toLowerCase();
    const fieldLabel = (field.label || '').toLowerCase();
    
    if (this._matchesPattern(fieldName, fieldLabel, ['country', 'pais'])) {
      // 국가 선택
      const country = userInfo.country || 'Brasil';
      this._selectOptionByText(field, country, params);
    }
    else if (this._matchesPattern(fieldName, fieldLabel, ['state', 'estado', 'province'])) {
      // 주/지역 선택
      const state = userInfo.state || userInfo.province || '';
      this._selectOptionByText(field, state, params);
    }
    else if (this._matchesPattern(fieldName, fieldLabel, ['shipping', 'entrega', 'delivery'])) {
      // 배송 방법 선택
      const shipping = userInfo.shippingMethod || 'standard';
      this._selectOptionByText(field, shipping, params);
    }
    else if (this._matchesPattern(fieldName, fieldLabel, ['payment', 'pagamento'])) {
      // 결제 방법 선택
      const payment = userInfo.paymentMethod || 'credit';
      this._selectOptionByText(field, payment, params);
    }
    else if (field.required && field.options && field.options.length > 0) {
      // 필수 필드이고 옵션이 있는 경우, 첫 번째 유효한 옵션 선택
      const validOption = field.options.find(opt => opt.value);
      if (validOption) {
        params.set(field.name, validOption.value);
      }
    }
  }
  
  /**
   * 라디오 입력 필드를 매핑합니다.
   * @param {object} field - 필드 정보
   * @param {object} userInfo - 사용자 정보
   * @param {URLSearchParams} params - URL 파라미터
   * @private
   */
  _mapRadioInput(field, userInfo, params) {
    const fieldName = field.name.toLowerCase();
    const fieldLabel = (field.label || '').toLowerCase();
    
    if (this._matchesPattern(fieldName, fieldLabel, ['payment', 'pagamento'])) {
      // 결제 방법
      const paymentMethod = userInfo.paymentMethod || 'credit';
      
      if (field.value && field.value.toLowerCase().includes(paymentMethod.toLowerCase())) {
        params.set(field.name, field.value);
      }
    }
    else if (this._matchesPattern(fieldName, fieldLabel, ['shipping', 'entrega', 'delivery'])) {
      // 배송 방법
      const shippingMethod = userInfo.shippingMethod || 'standard';
      
      if (field.value && field.value.toLowerCase().includes(shippingMethod.toLowerCase())) {
        params.set(field.name, field.value);
      }
    }
    else if (this._matchesPattern(fieldName, fieldLabel, ['gender', 'sexo'])) {
      // 성별
      const gender = userInfo.gender || '';
      
      if (field.value && field.value.toLowerCase().includes(gender.toLowerCase())) {
        params.set(field.name, field.value);
      }
    }
    else if (field.required) {
      // 필수 필드인 경우 값 설정
      params.set(field.name, field.value);
    }
  }
  
  /**
   * 체크박스 입력 필드를 매핑합니다.
   * @param {object} field - 필드 정보
   * @param {object} userInfo - 사용자 정보
   * @param {URLSearchParams} params - URL 파라미터
   * @private
   */
  _mapCheckboxInput(field, userInfo, params) {
    const fieldName = field.name.toLowerCase();
    const fieldLabel = (field.label || '').toLowerCase();
    
    if (field.required) {
      // 필수 체크박스는 항상 체크
      params.set(field.name, field.value || 'on');
    }
    else if (this._matchesPattern(fieldName, fieldLabel, ['newsletter', 'boletim'])) {
      // 뉴스레터 구독 여부
      if (userInfo.subscribeNewsletter) {
        params.set(field.name, field.value || 'on');
      }
    }
    else if (this._matchesPattern(fieldName, fieldLabel, ['terms', 'termos', 'agree', 'aceito', 'policy', 'politica'])) {
      // 이용 약관 동의
      params.set(field.name, field.value || 'on');
    }
    else if (this._matchesPattern(fieldName, fieldLabel, ['save', 'salvar', 'remember', 'lembrar'])) {
      // 정보 저장 여부
      if (userInfo.saveInformation !== false) {
        params.set(field.name, field.value || 'on');
      }
    }
  }
  
  /**
   * 숨겨진 입력 필드를 매핑합니다.
   * @param {object} field - 필드 정보
   * @param {object} userInfo - 사용자 정보
   * @param {URLSearchParams} params - URL 파라미터
   * @private
   */
  _mapHiddenInput(field, userInfo, params) {
    // 원래 값이 있으면 유지
    if (field.value) {
      params.set(field.name, field.value);
    }
  }
  
  /**
   * 텍스트 영역 입력 필드를 매핑합니다.
   * @param {object} field - 필드 정보
   * @param {object} userInfo - 사용자 정보
   * @param {URLSearchParams} params - URL 파라미터
   * @private
   */
  _mapTextareaInput(field, userInfo, params) {
    const fieldName = field.name.toLowerCase();
    const fieldLabel = (field.label || '').toLowerCase();
    
    if (this._matchesPattern(fieldName, fieldLabel, ['comment', 'comentario', 'notes', 'notas', 'message', 'mensagem'])) {
      params.set(field.name, userInfo.comment || userInfo.notes || userInfo.message || '');
    }
    else if (this._matchesPattern(fieldName, fieldLabel, ['address', 'endereco'])) {
      params.set(field.name, userInfo.address || '');
    }
    else if (field.required && userInfo[fieldName]) {
      params.set(field.name, userInfo[fieldName]);
    }
  }
  
  /**
   * 일반 입력 필드를 매핑합니다.
   * @param {object} field - 필드 정보
   * @param {object} userInfo - 사용자 정보
   * @param {URLSearchParams} params - URL 파라미터
   * @private
   */
  _mapGenericInput(field, userInfo, params) {
    const fieldName = field.name.toLowerCase();
    
    // userInfo에 일치하는 키가 있는 경우
    if (userInfo[fieldName] !== undefined) {
      params.set(field.name, userInfo[fieldName].toString());
    }
    else if (field.required && field.value) {
      // 필수 필드이고 기본값이 있는 경우
      params.set(field.name, field.value);
    }
  }
  
  /**
   * 필드 이름 또는 라벨이 지정된 패턴 중 하나와 일치하는지 확인합니다.
   * @param {string} fieldName - 필드 이름
   * @param {string} fieldLabel - 필드 라벨
   * @param {Array<string>} patterns - 확인할 패턴 목록
   * @returns {boolean} 일치 여부
   * @private
   */
  _matchesPattern(fieldName, fieldLabel, patterns) {
    return patterns.some(pattern => 
      fieldName.includes(pattern) || fieldLabel.includes(pattern)
    );
  }
  
  /**
   * 텍스트로 옵션을 선택합니다.
   * @param {object} field - 필드 정보
   * @param {string} text - 검색할 텍스트
   * @param {URLSearchParams} params - URL 파라미터
   * @private
   */
  _selectOptionByText(field, text, params) {
    if (!field.options || !field.options.length) return;
    
    // 텍스트가 포함된 옵션 찾기
    const lowerText = text.toLowerCase();
    const option = field.options.find(opt => 
      (opt.text || '').toLowerCase().includes(lowerText) || 
      (opt.value || '').toLowerCase().includes(lowerText)
    );
    
    if (option) {
      params.set(field.name, option.value);
    } else if (field.required && field.options.length > 0) {
      // 일치하는 옵션을 찾지 못하고 필수 필드인 경우 첫 번째 유효한 옵션 선택
      const validOption = field.options.find(opt => opt.value);
      if (validOption) {
        params.set(field.name, validOption.value);
      }
    }
  }
}

module.exports = FormFieldMappingManager;
