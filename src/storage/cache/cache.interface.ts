/**
 * 캐시 인터페이스 정의
 */

/**
 * 캐시 항목 인터페이스
 */
export interface CacheItem<T> {
  /**
   * 캐시된 데이터
   */
  data: T;

  /**
   * 생성 타임스탬프 (밀리초)
   */
  createdAt: number;

  /**
   * 마지막 액세스 타임스탬프 (밀리초)
   */
  lastAccessedAt: number;

  /**
   * 적중 횟수
   */
  hits: number;
}

/**
 * 캐시 정책 타입
 */
export enum CacheEvictionPolicy {
  /**
   * 가장 오래된 항목 제거 (생성 시간 기준)
   */
  OLDEST = 'oldest',

  /**
   * 가장 최근에 사용되지 않은 항목 제거 (Last Recently Used)
   */
  LRU = 'lru',

  /**
   * 가장 덜 사용된 항목 제거 (Least Frequently Used)
   */
  LFU = 'lfu'
}

/**
 * 캐시 옵션 인터페이스
 */
export interface CacheOptions {
  /**
   * 최대 항목 수
   */
  maxItems?: number;

  /**
   * 캐시 항목 TTL (Time-To-Live, 밀리초)
   */
  ttl?: number;

  /**
   * 제거 정책
   */
  evictionPolicy?: CacheEvictionPolicy;

  /**
   * 자동 정리 간격 (밀리초)
   */
  cleanupInterval?: number;

  /**
   * 캐시 히트/미스 로깅 여부
   */
  enableLogging?: boolean;
}

/**
 * 캐시 통계 인터페이스
 */
export interface CacheStats {
  /**
   * 현재 항목 수
   */
  size: number;

  /**
   * 최대 항목 수
   */
  maxItems: number;

  /**
   * 캐시 적중 횟수
   */
  hits: number;

  /**
   * 캐시 미스 횟수
   */
  misses: number;

  /**
   * 제거된 항목 수
   */
  evictions: number;

  /**
   * 만료된 항목 수
   */
  expirations: number;

  /**
   * 가장 자주 적중된 키 목록
   */
  topHitKeys: Array<{ key: string; hits: number }>;
}

/**
 * 캐시 인터페이스
 */
export interface Cache<T = any> {
  /**
   * 항목 가져오기
   * @param key 캐시 키
   * @returns 캐시된 항목 또는 undefined
   */
  get(key: string): T | undefined;

  /**
   * 항목 설정
   * @param key 캐시 키
   * @param value 캐시할 값
   * @param ttl 개별 TTL (옵션)
   */
  set(key: string, value: T, ttl?: number): void;

  /**
   * 항목 삭제
   * @param key 캐시 키
   * @returns 성공 여부
   */
  del(key: string): boolean;

  /**
   * 키 존재 여부 확인
   * @param key 캐시 키
   * @returns 존재 여부
   */
  has(key: string): boolean;

  /**
   * 모든 캐시 키 가져오기
   * @returns 키 배열
   */
  keys(): string[];

  /**
   * 모든 캐시 항목 가져오기
   * @returns 키-값 쌍 배열
   */
  entries(): Array<[string, T]>;

  /**
   * 캐시 비우기
   */
  clear(): void;

  /**
   * 캐시 크기
   */
  size(): number;

  /**
   * 캐시 통계 가져오기
   */
  stats(): CacheStats;

  /**
   * 만료된 항목 정리
   * @returns 정리된 항목 수
   */
  cleanup(): number;
}
