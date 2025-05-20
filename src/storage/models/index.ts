/**
 * 데이터 모델 정의
 * LG 브라질 A2A 쇼핑 어시스턴트의 크롤링 데이터 저장 스키마
 */

/**
 * 기본 엔티티 인터페이스
 * 모든 모델의 공통 속성 정의
 */
export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 제품 모델 인터페이스
 */
export interface Product extends BaseEntity {
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  discountPercentage?: number;
  currency: string;
  imageUrls: string[];
  detailUrl: string;
  categoryIds: string[];
  sku: string;
  brand: string;
  model: string;
  availability: ProductAvailability;
  rating?: ProductRating;
  specifications: Record<string, string | number | boolean>;
  features: string[];
  options?: ProductOption[];
  relatedProductIds?: string[];
  variantIds?: string[];
  metaData?: Record<string, any>;
  lastCrawledAt: string;
}

/**
 * 제품 재고 상태 타입
 */
export enum ProductAvailability {
  IN_STOCK = 'IN_STOCK',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
  PRE_ORDER = 'PRE_ORDER',
  DISCONTINUED = 'DISCONTINUED',
  UNKNOWN = 'UNKNOWN'
}

/**
 * 제품 평점 인터페이스
 */
export interface ProductRating {
  average: number;
  count: number;
  distribution?: Record<string, number>;
}

/**
 * 제품 옵션 인터페이스
 */
export interface ProductOption {
  name: string;
  values: string[];
  priceModifiers?: Record<string, number>;
}

/**
 * 카테고리 모델 인터페이스
 */
export interface Category extends BaseEntity {
  name: string;
  description?: string;
  parentId?: string;
  level: number;
  path: string[];
  imageUrl?: string;
  productCount?: number;
  isActive: boolean;
  slug: string;
  metaData?: Record<string, any>;
}

/**
 * 리뷰 모델 인터페이스
 */
export interface Review extends BaseEntity {
  productId: string;
  title?: string;
  content: string;
  rating: number;
  authorName: string;
  authorId?: string;
  isVerifiedPurchase: boolean;
  helpfulCount?: number;
  replyCount?: number;
  images?: string[];
  date: string;
  tags?: string[];
}

/**
 * 체크아웃 프로세스 단계 인터페이스
 */
export interface CheckoutStep {
  stepId: string;
  name: string;
  order: number;
  url?: string;
  formFields: FormField[];
  buttons: CheckoutButton[];
  nextStepId?: string;
  previousStepId?: string;
  isRequired: boolean;
}

/**
 * 체크아웃 프로세스 인터페이스
 */
export interface CheckoutProcess extends BaseEntity {
  productId: string;
  baseUrl: string;
  steps: CheckoutStep[];
  requiredFields: string[];
  optionalFields: string[];
  supportedPaymentMethods: string[];
  shipping: ShippingOption[];
  redirectUrls: Record<string, string>;
  metaData?: Record<string, any>;
}

/**
 * 폼 필드 인터페이스
 */
export interface FormField {
  id: string;
  name: string;
  label?: string;
  type: FormFieldType;
  isRequired: boolean;
  placeholder?: string;
  defaultValue?: string;
  options?: SelectOption[];
  validationRules?: ValidationRule[];
  dependsOn?: FieldDependency[];
  errorMessage?: string;
  cssSelector: string;
  xpathSelector?: string;
}

/**
 * 폼 필드 타입 열거형
 */
export enum FormFieldType {
  TEXT = 'text',
  EMAIL = 'email',
  PASSWORD = 'password',
  NUMBER = 'number',
  TEL = 'tel',
  SELECT = 'select',
  CHECKBOX = 'checkbox',
  RADIO = 'radio',
  TEXTAREA = 'textarea',
  DATE = 'date',
  FILE = 'file',
  HIDDEN = 'hidden'
}

/**
 * 셀렉트 옵션 인터페이스
 */
export interface SelectOption {
  value: string;
  label: string;
  isDefault?: boolean;
}

/**
 * 유효성 검증 규칙 인터페이스
 */
export interface ValidationRule {
  type: ValidationRuleType;
  value?: string | number;
  message?: string;
}

/**
 * 유효성 검증 규칙 타입 열거형
 */
export enum ValidationRuleType {
  REQUIRED = 'required',
  MIN_LENGTH = 'minLength',
  MAX_LENGTH = 'maxLength',
  MIN = 'min',
  MAX = 'max',
  PATTERN = 'pattern',
  EMAIL = 'email',
  URL = 'url',
  MATCH = 'match',
  CUSTOM = 'custom'
}

/**
 * 필드 의존성 인터페이스
 */
export interface FieldDependency {
  fieldId: string;
  value: string | boolean | number;
  condition: 'equals' | 'notEquals' | 'contains' | 'greaterThan' | 'lessThan';
}

/**
 * 체크아웃 버튼 인터페이스
 */
export interface CheckoutButton {
  id: string;
  label: string;
  type: 'submit' | 'button' | 'link';
  cssSelector: string;
  xpathSelector?: string;
  action: 'next' | 'previous' | 'cancel' | 'complete';
}

/**
 * 배송 옵션 인터페이스
 */
export interface ShippingOption {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  estimatedDeliveryTime: string;
  isDefault?: boolean;
}

/**
 * 사용자 정보 인터페이스 (체크아웃 정보 매핑용)
 */
export interface UserInfo {
  name?: string;
  email?: string;
  phone?: string;
  shippingAddress?: Address;
  billingAddress?: Address;
  paymentMethod?: string;
  paymentDetails?: Record<string, any>;
  preferences?: Record<string, any>;
  lastOrderId?: string;
}

/**
 * 주소 인터페이스
 */
export interface Address {
  street: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

/**
 * 크롤링 상태 인터페이스
 */
export interface CrawlingStatus extends BaseEntity {
  targetUrl: string;
  targetType: 'product' | 'category' | 'checkout' | 'other';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startTime?: string;
  endTime?: string;
  attempts: number;
  lastError?: string;
  lastSuccessfulCrawl?: string;
  metadata?: Record<string, any>;
}
