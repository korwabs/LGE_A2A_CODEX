/**
 * 캐시 관리자 구현체
 * 특정 도메인(제품, 카테고리 등)에 대한 캐시 관리
 */
import { BaseEntity } from '../models';
import { Repository, RepositoryFactory, RepositoryType } from '../repositories';
import { MultiLevelCache, MultiLevelCacheOptions } from './multi-level.cache';

/**
 * 캐시 관리자 옵션 인터페이스
 */
export interface CacheManagerOptions extends MultiLevelCacheOptions {
  /**
   * 캐시 활성화 여부
   */
  cacheEnabled?: boolean;

  /**
   * 캐시 초기화 시 프리로드 활성화 여부
   */
  preloadEnabled?: boolean;

  /**
   * 프리로드할 최대 항목 수
   */
  preloadLimit?: number;
}

/**
 * 캐시 관리자 구현체
 */
export class CacheManager<T extends BaseEntity> {
  private repository: Repository<T>;
  private cache: MultiLevelCache<T> | null = null;
  private options: Required<CacheManagerOptions>;

  /**
   * 캐시 관리자 생성자
   * @param repositoryFactory 저장소 팩토리
   * @param entityType 엔티티 타입
   * @param repositoryType 저장소 타입
   * @param repositoryOptions 저장소 옵션
   * @param options 캐시 관리자 옵션
   */
  constructor(
    repositoryFactory: RepositoryFactory,
    private entityType: string,
    repositoryType: RepositoryType,
    repositoryOptions: any = {},
    options: CacheManagerOptions = {}
  ) {
    this.repository = repositoryFactory.createRepository<T>(
      entityType,
      repositoryType,
      repositoryOptions
    );

    this.options = {
      cacheEnabled: options.cacheEnabled !== undefined ? options.cacheEnabled : true,
      useMemoryCache: options.useMemoryCache !== undefined ? options.useMemoryCache : true,
      memoryCacheTtl: options.memoryCacheTtl || 300000, // 기본 5분
      memoryCacheMaxItems: options.memoryCacheMaxItems || 1000,
      loadMissingItems: options.loadMissingItems !== undefined ? options.loadMissingItems : true,
      writeThrough: options.writeThrough !== undefined ? options.writeThrough : true,
      enableLogging: options.enableLogging || false,
      preloadEnabled: options.preloadEnabled !== undefined ? options.preloadEnabled : false,
      preloadLimit: options.preloadLimit || 100
    };

    // 캐시 초기화
    this.initializeCache();
  }

  /**
   * 캐시 초기화
   */
  private async initializeCache(): Promise<void> {
    if (!this.options.cacheEnabled) {
      return;
    }

    this.cache = new MultiLevelCache<T>(this.repository, {
      useMemoryCache: this.options.useMemoryCache,
      memoryCacheTtl: this.options.memoryCacheTtl,
      memoryCacheMaxItems: this.options.memoryCacheMaxItems,
      loadMissingItems: this.options.loadMissingItems,
      writeThrough: this.options.writeThrough,
      enableLogging: this.options.enableLogging
    });

    // 캐시 프리로드
    if (this.options.preloadEnabled) {
      await this.preloadCache();
    }
  }

  /**
   * 캐시 프리로드
   * @param filter 필터 조건
   */
  async preloadCache(filter?: Partial<T>): Promise<number> {
    if (!this.cache) {
      return 0;
    }

    return await this.cache.preload(filter, this.options.preloadLimit);
  }

  /**
   * 항목 가져오기
   * @param id 엔티티 ID
   * @returns 엔티티 또는 undefined
   */
  async get(id: string): Promise<T | undefined> {
    if (this.cache) {
      return await this.cache.get(id);
    }
    return await this.repository.findById(id);
  }

  /**
   * 항목 설정 (생성 또는 업데이트)
   * @param entity 저장할 엔티티
   * @returns 저장된 엔티티
   */
  async set(entity: T): Promise<T> {
    // ID가 있으면 업데이트, 없으면 생성
    if (entity.id) {
      if (this.cache) {
        await this.cache.set(entity.id, entity);
      } else {
        await this.repository.update(entity.id, entity);
      }
      return entity;
    } else {
      // ID가 없는 경우 새 엔티티 생성
      const created = await this.repository.create(entity as any);
      
      // 캐시 업데이트
      if (this.cache) {
        await this.cache.set(created.id, created);
      }
      
      return created;
    }
  }

  /**
   * 항목 삭제
   * @param id 삭제할 엔티티 ID
   * @returns 성공 여부
   */
  async delete(id: string): Promise<boolean> {
    if (this.cache) {
      return await this.cache.del(id);
    }
    return await this.repository.delete(id);
  }

  /**
   * 조건에 맞는 항목 찾기
   * @param filter 필터 조건
   * @param options 쿼리 옵션
   * @returns 엔티티 배열
   */
  async find(filter?: Partial<T>, options?: any): Promise<T[]> {
    // 캐시를 거치지 않고 직접 저장소에서 찾음
    return await this.repository.find(filter, options);
  }

  /**
   * 조건에 맞는 단일 항목 찾기
   * @param filter 필터 조건
   * @returns 엔티티 또는 undefined
   */
  async findOne(filter: Partial<T>): Promise<T | undefined> {
    return await this.repository.findOne(filter);
  }

  /**
   * 여러 항목 일괄 생성
   * @param entities 생성할 엔티티 배열
   * @returns 생성된 엔티티 배열
   */
  async bulkCreate(entities: Array<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>): Promise<T[]> {
    const created = await this.repository.bulkCreate(entities);
    
    // 캐시 업데이트
    if (this.cache) {
      for (const entity of created) {
        await this.cache.set(entity.id, entity);
      }
    }
    
    return created;
  }

  /**
   * 캐시 통계 가져오기
   */
  getStats(): any {
    if (this.cache) {
      return {
        entityType: this.entityType,
        cacheEnabled: this.options.cacheEnabled,
        ...this.cache.stats()
      };
    }
    
    return {
      entityType: this.entityType,
      cacheEnabled: false
    };
  }

  /**
   * 캐시 비우기
   */
  clearCache(): void {
    if (this.cache) {
      this.cache.clear();
    }
  }

  /**
   * 저장소 인스턴스 가져오기
   * @returns 저장소 인스턴스
   */
  getRepository(): Repository<T> {
    return this.repository;
  }

  /**
   * 소멸자
   */
  destroy(): void {
    if (this.cache) {
      (this.cache as any).destroy();
      this.cache = null;
    }
  }
}
