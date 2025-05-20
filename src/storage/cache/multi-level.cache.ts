/**
 * 다층 캐시 구현체
 * 메모리 캐시와 영구 저장소를 조합하여 효율적인 다층 캐싱 제공
 */
import { Cache, CacheStats } from './cache.interface';
import { MemoryCache } from './memory.cache';
import { Repository } from '../repositories';
import { BaseEntity } from '../models';

/**
 * 다층 캐시 옵션 인터페이스
 */
export interface MultiLevelCacheOptions {
  /**
   * 메모리 캐시 사용 여부
   */
  useMemoryCache?: boolean;

  /**
   * 메모리 캐시 TTL (밀리초)
   */
  memoryCacheTtl?: number;

  /**
   * 메모리 캐시 최대 항목 수
   */
  memoryCacheMaxItems?: number;

  /**
   * 읽기 시 영구 저장소에서 누락된 항목 자동 로드 여부
   */
  loadMissingItems?: boolean;

  /**
   * 쓰기 시 영구 저장소 자동 업데이트 여부
   */
  writeThrough?: boolean;

  /**
   * 캐시 로깅 활성화 여부
   */
  enableLogging?: boolean;
}

/**
 * 다층 캐시 구현체
 */
export class MultiLevelCache<T extends BaseEntity> implements Cache<T> {
  private memoryCache: MemoryCache<T>;
  private repository: Repository<T>;
  private options: Required<MultiLevelCacheOptions>;
  private hitCount = 0;
  private missCount = 0;

  /**
   * 다층 캐시 생성자
   * @param repository 영구 저장소
   * @param options 캐시 옵션
   */
  constructor(repository: Repository<T>, options: MultiLevelCacheOptions = {}) {
    this.repository = repository;
    
    this.options = {
      useMemoryCache: options.useMemoryCache !== undefined ? options.useMemoryCache : true,
      memoryCacheTtl: options.memoryCacheTtl || 300000, // 기본 5분
      memoryCacheMaxItems: options.memoryCacheMaxItems || 1000,
      loadMissingItems: options.loadMissingItems !== undefined ? options.loadMissingItems : true,
      writeThrough: options.writeThrough !== undefined ? options.writeThrough : true,
      enableLogging: options.enableLogging || false
    };

    // 메모리 캐시 초기화
    this.memoryCache = new MemoryCache<T>({
      ttl: this.options.memoryCacheTtl,
      maxItems: this.options.memoryCacheMaxItems,
      enableLogging: this.options.enableLogging
    });
  }

  /**
   * 항목 가져오기
   * @param key 캐시 키 (엔티티 ID)
   * @returns 캐시된 항목 또는 undefined
   */
  async get(key: string): Promise<T | undefined> {
    // 메모리 캐시 확인
    if (this.options.useMemoryCache) {
      const cachedItem = this.memoryCache.get(key);
      if (cachedItem) {
        this.hitCount++;
        this.log(`Memory cache hit: ${key}`);
        return cachedItem;
      }
    }

    this.log(`Memory cache miss: ${key}`);

    // 영구 저장소에서 로드
    if (this.options.loadMissingItems) {
      try {
        const item = await this.repository.findById(key);
        
        if (item) {
          this.log(`Repository hit: ${key}`);
          
          // 메모리 캐시에 항목 저장
          if (this.options.useMemoryCache) {
            this.memoryCache.set(key, item);
          }
          
          return item;
        }
      } catch (error) {
        this.log(`Error loading from repository: ${error}`);
      }
    }

    this.missCount++;
    this.log(`Complete miss: ${key}`);
    return undefined;
  }

  /**
   * 항목 설정
   * @param key 캐시 키 (엔티티 ID)
   * @param value 캐시할 값
   */
  async set(key: string, value: T): Promise<void> {
    // 메모리 캐시에 저장
    if (this.options.useMemoryCache) {
      this.memoryCache.set(key, value);
    }

    // 영구 저장소에 저장 (Write-Through)
    if (this.options.writeThrough) {
      try {
        const entity = value as T;
        
        if (await this.repository.findById(key)) {
          // 기존 항목 업데이트
          await this.repository.update(key, entity);
          this.log(`Repository updated: ${key}`);
        } else {
          // 새 항목 생성
          await this.repository.create(entity);
          this.log(`Repository created: ${key}`);
        }
      } catch (error) {
        this.log(`Error writing to repository: ${error}`);
        // 영구 저장소 저장 실패 시 메모리 캐시에서 제거 (일관성 유지)
        if (this.options.useMemoryCache) {
          this.memoryCache.del(key);
        }
        throw error;
      }
    }
  }

  /**
   * 항목 삭제
   * @param key 캐시 키 (엔티티 ID)
   * @returns 성공 여부
   */
  async del(key: string): Promise<boolean> {
    let success = true;
    
    // 메모리 캐시에서 삭제
    if (this.options.useMemoryCache) {
      this.memoryCache.del(key);
    }

    // 영구 저장소에서 삭제 (Write-Through)
    if (this.options.writeThrough) {
      try {
        success = await this.repository.delete(key);
        this.log(`Repository deleted: ${key}`);
      } catch (error) {
        this.log(`Error deleting from repository: ${error}`);
        success = false;
      }
    }

    return success;
  }

  /**
   * 키 존재 여부 확인
   * @param key 캐시 키 (엔티티 ID)
   * @returns 존재 여부
   */
  async has(key: string): Promise<boolean> {
    // 메모리 캐시 확인
    if (this.options.useMemoryCache && this.memoryCache.has(key)) {
      return true;
    }

    // 영구 저장소 확인
    if (this.options.loadMissingItems) {
      try {
        const exists = await this.repository.findById(key) !== undefined;
        return exists;
      } catch (error) {
        this.log(`Error checking repository: ${error}`);
      }
    }

    return false;
  }

  /**
   * 모든 캐시 키 가져오기
   * 참고: 이 메서드는 영구 저장소의 모든 키를 반환하지 않고,
   * 메모리 캐시에 있는 키만 반환합니다.
   * @returns 키 배열
   */
  keys(): string[] {
    if (this.options.useMemoryCache) {
      return this.memoryCache.keys();
    }
    return [];
  }

  /**
   * 모든 캐시 항목 가져오기
   * 참고: 이 메서드는 영구 저장소의 모든 항목을 반환하지 않고,
   * 메모리 캐시에 있는 항목만 반환합니다.
   * @returns 키-값 쌍 배열
   */
  entries(): Array<[string, T]> {
    if (this.options.useMemoryCache) {
      return this.memoryCache.entries();
    }
    return [];
  }

  /**
   * 캐시 비우기 (메모리 캐시만)
   */
  clear(): void {
    if (this.options.useMemoryCache) {
      this.memoryCache.clear();
    }
    this.log('Memory cache cleared');
  }

  /**
   * 캐시 크기 (메모리 캐시만)
   */
  size(): number {
    if (this.options.useMemoryCache) {
      return this.memoryCache.size();
    }
    return 0;
  }

  /**
   * 캐시 통계 가져오기
   */
  stats(): CacheStats {
    if (this.options.useMemoryCache) {
      const memoryCacheStats = this.memoryCache.stats();
      
      return {
        ...memoryCacheStats,
        hits: this.hitCount,
        misses: this.missCount
      };
    }

    return {
      size: 0,
      maxItems: 0,
      hits: this.hitCount,
      misses: this.missCount,
      evictions: 0,
      expirations: 0,
      topHitKeys: []
    };
  }

  /**
   * 만료된 항목 정리 (메모리 캐시만)
   * @returns 정리된 항목 수
   */
  cleanup(): number {
    if (this.options.useMemoryCache) {
      return this.memoryCache.cleanup();
    }
    return 0;
  }

  /**
   * 영구 저장소에서 메모리 캐시 프리로드
   * @param filter 필터 조건
   * @param limit 최대 항목 수
   */
  async preload(filter?: Partial<T>, limit?: number): Promise<number> {
    if (!this.options.useMemoryCache) {
      return 0;
    }

    try {
      const items = await this.repository.find(filter, { limit });
      
      let count = 0;
      for (const item of items) {
        this.memoryCache.set(item.id, item);
        count++;
      }
      
      this.log(`Preloaded ${count} items into memory cache`);
      return count;
    } catch (error) {
      this.log(`Error preloading from repository: ${error}`);
      return 0;
    }
  }

  /**
   * 로그 출력
   * @param message 로그 메시지
   */
  private log(message: string): void {
    if (this.options.enableLogging) {
      console.log(`[MultiLevelCache] ${message}`);
    }
  }

  /**
   * 소멸자
   */
  destroy(): void {
    if (this.options.useMemoryCache) {
      (this.memoryCache as any).destroy();
    }
  }
}
