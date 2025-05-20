/**
 * 메모리 기반 캐시 구현체
 */
import { Cache, CacheItem, CacheEvictionPolicy, CacheOptions, CacheStats } from './cache.interface';

/**
 * 메모리 기반 캐시 구현체
 */
export class MemoryCache<T = any> implements Cache<T> {
  private items: Map<string, CacheItem<T>> = new Map();
  private options: Required<CacheOptions>;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private hitCount = 0;
  private missCount = 0;
  private evictionCount = 0;
  private expirationCount = 0;

  /**
   * 메모리 캐시 생성자
   * @param options 캐시 옵션
   */
  constructor(options: CacheOptions = {}) {
    this.options = {
      maxItems: options.maxItems || 1000,
      ttl: options.ttl || 3600000, // 기본 1시간
      evictionPolicy: options.evictionPolicy || CacheEvictionPolicy.LRU,
      cleanupInterval: options.cleanupInterval || 300000, // 기본 5분
      enableLogging: options.enableLogging || false
    };

    // 정기적인 정리 설정
    if (this.options.cleanupInterval > 0) {
      this.startCleanupTimer();
    }
  }

  /**
   * 항목 가져오기
   * @param key 캐시 키
   * @returns 캐시된 항목 또는 undefined
   */
  get(key: string): T | undefined {
    const item = this.items.get(key);
    
    if (!item) {
      this.missCount++;
      this.log(`Cache miss: ${key}`);
      return undefined;
    }

    // 만료 확인
    if (this.isExpired(item)) {
      this.items.delete(key);
      this.expirationCount++;
      this.missCount++;
      this.log(`Cache expired: ${key}`);
      return undefined;
    }

    // 캐시 히트 통계 업데이트
    item.lastAccessedAt = Date.now();
    item.hits++;
    this.hitCount++;
    this.log(`Cache hit: ${key}`);

    return item.data;
  }

  /**
   * 항목 설정
   * @param key 캐시 키
   * @param value 캐시할 값
   * @param ttl 개별 TTL (옵션)
   */
  set(key: string, value: T, ttl?: number): void {
    const now = Date.now();
    
    const cacheItem: CacheItem<T> = {
      data: value,
      createdAt: now,
      lastAccessedAt: now,
      hits: 0
    };

    // 최대 항목 수 확인 및 처리
    if (this.items.size >= this.options.maxItems && !this.items.has(key)) {
      this.evictItem();
    }

    this.items.set(key, cacheItem);
    this.log(`Cache set: ${key}`);
  }

  /**
   * 항목 삭제
   * @param key 캐시 키
   * @returns 성공 여부
   */
  del(key: string): boolean {
    const result = this.items.delete(key);
    if (result) {
      this.log(`Cache delete: ${key}`);
    }
    return result;
  }

  /**
   * 키 존재 여부 확인
   * @param key 캐시 키
   * @returns 존재 여부
   */
  has(key: string): boolean {
    if (!this.items.has(key)) {
      return false;
    }

    const item = this.items.get(key)!;
    
    // 만료 확인
    if (this.isExpired(item)) {
      this.items.delete(key);
      this.expirationCount++;
      return false;
    }

    return true;
  }

  /**
   * 모든 캐시 키 가져오기
   * @returns 키 배열
   */
  keys(): string[] {
    this.cleanup(); // 만료된 항목 먼저 정리
    return Array.from(this.items.keys());
  }

  /**
   * 모든 캐시 항목 가져오기
   * @returns 키-값 쌍 배열
   */
  entries(): Array<[string, T]> {
    this.cleanup(); // 만료된 항목 먼저 정리
    return Array.from(this.items.entries()).map(([key, item]) => [key, item.data]);
  }

  /**
   * 캐시 비우기
   */
  clear(): void {
    this.items.clear();
    this.log('Cache cleared');
  }

  /**
   * 캐시 크기
   */
  size(): number {
    return this.items.size;
  }

  /**
   * 캐시 통계 가져오기
   */
  stats(): CacheStats {
    // 인기 항목 계산
    const topHitKeys = Array.from(this.items.entries())
      .map(([key, item]) => ({ key, hits: item.hits }))
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 10);

    return {
      size: this.items.size,
      maxItems: this.options.maxItems,
      hits: this.hitCount,
      misses: this.missCount,
      evictions: this.evictionCount,
      expirations: this.expirationCount,
      topHitKeys
    };
  }

  /**
   * 만료된 항목 정리
   * @returns 정리된 항목 수
   */
  cleanup(): number {
    const now = Date.now();
    let cleanupCount = 0;

    for (const [key, item] of this.items.entries()) {
      if (this.isExpired(item)) {
        this.items.delete(key);
        cleanupCount++;
        this.expirationCount++;
      }
    }

    if (cleanupCount > 0) {
      this.log(`Cache cleanup: removed ${cleanupCount} items`);
    }

    return cleanupCount;
  }

  /**
   * 정리 타이머 시작
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.options.cleanupInterval);
  }

  /**
   * 캐시 항목 만료 여부 확인
   * @param item 캐시 항목
   * @returns 만료 여부
   */
  private isExpired(item: CacheItem<T>): boolean {
    const now = Date.now();
    return now - item.createdAt > this.options.ttl;
  }

  /**
   * 제거 정책에 따라 항목 제거
   */
  private evictItem(): void {
    let keyToEvict: string | null = null;

    switch (this.options.evictionPolicy) {
      case CacheEvictionPolicy.OLDEST:
        keyToEvict = this.findOldestItem();
        break;
      
      case CacheEvictionPolicy.LRU:
        keyToEvict = this.findLeastRecentlyUsedItem();
        break;
      
      case CacheEvictionPolicy.LFU:
        keyToEvict = this.findLeastFrequentlyUsedItem();
        break;
    }

    if (keyToEvict) {
      this.items.delete(keyToEvict);
      this.evictionCount++;
      this.log(`Cache eviction (${this.options.evictionPolicy}): ${keyToEvict}`);
    }
  }

  /**
   * 가장 오래된 항목 찾기
   * @returns 가장 오래된 항목의 키
   */
  private findOldestItem(): string | null {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, item] of this.items.entries()) {
      if (item.createdAt < oldestTime) {
        oldestTime = item.createdAt;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  /**
   * 가장 최근에 사용되지 않은 항목 찾기
   * @returns 가장 최근에 사용되지 않은 항목의 키
   */
  private findLeastRecentlyUsedItem(): string | null {
    let lruKey: string | null = null;
    let lruTime = Infinity;

    for (const [key, item] of this.items.entries()) {
      if (item.lastAccessedAt < lruTime) {
        lruTime = item.lastAccessedAt;
        lruKey = key;
      }
    }

    return lruKey;
  }

  /**
   * 가장 덜 사용된 항목 찾기
   * @returns 가장 덜 사용된 항목의 키
   */
  private findLeastFrequentlyUsedItem(): string | null {
    let lfuKey: string | null = null;
    let lfuHits = Infinity;

    for (const [key, item] of this.items.entries()) {
      if (item.hits < lfuHits) {
        lfuHits = item.hits;
        lfuKey = key;
      }
    }

    return lfuKey;
  }

  /**
   * 로그 출력
   * @param message 로그 메시지
   */
  private log(message: string): void {
    if (this.options.enableLogging) {
      console.log(`[MemoryCache] ${message}`);
    }
  }

  /**
   * 소멸자 (타이머 정리)
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}
