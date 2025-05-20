/**
 * 스토리지 모듈 내보내기
 */
export * from './models';
export * from './repositories';
export * from './cache';
export * from './search';

/**
 * 스토리지 관리자 통합 인터페이스
 */
import { BaseEntity } from './models';
import { Repository, RepositoryFactory, RepositoryType } from './repositories';
import { CacheManager, CacheManagerOptions } from './cache';
import { SearchService, SearchServiceFactory, SearchServiceType } from './search';

/**
 * 스토리지 관리자 옵션 인터페이스
 */
export interface StorageManagerOptions {
  /**
   * 저장소 타입
   */
  repositoryType: RepositoryType;

  /**
   * 저장소 옵션
   */
  repositoryOptions?: any;

  /**
   * 캐시 관리자 옵션
   */
  cacheOptions?: CacheManagerOptions;

  /**
   * 검색 서비스 타입
   */
  searchServiceType?: SearchServiceType;

  /**
   * 검색 서비스 옵션
   */
  searchServiceOptions?: any;
}

/**
 * 스토리지 관리자 인터페이스
 * 저장소, 캐시, 검색 기능을 통합 관리
 */
export class StorageManager<T extends BaseEntity> {
  private cacheManager: CacheManager<T>;
  private searchService: SearchService<T> | null = null;

  /**
   * 스토리지 관리자 생성자
   * @param repositoryFactory 저장소 팩토리
   * @param searchServiceFactory 검색 서비스 팩토리
   * @param entityType 엔티티 타입
   * @param options 스토리지 관리자 옵션
   */
  constructor(
    repositoryFactory: RepositoryFactory,
    searchServiceFactory: SearchServiceFactory,
    private entityType: string,
    private options: StorageManagerOptions
  ) {
    // 캐시 관리자 생성
    this.cacheManager = new CacheManager<T>(
      repositoryFactory,
      entityType,
      options.repositoryType,
      options.repositoryOptions,
      options.cacheOptions
    );

    // 검색 서비스 생성 (옵션이 제공된 경우)
    if (options.searchServiceType && options.searchServiceOptions) {
      this.searchService = searchServiceFactory.createSearchService<T>(
        options.searchServiceType,
        options.searchServiceOptions
      );
    }
  }

  /**
   * 항목 가져오기
   * @param id 엔티티 ID
   * @returns 엔티티 또는 undefined
   */
  async get(id: string): Promise<T | undefined> {
    return this.cacheManager.get(id);
  }

  /**
   * 항목 설정 (생성 또는 업데이트)
   * @param entity 저장할 엔티티
   * @returns 저장된 엔티티
   */
  async set(entity: T): Promise<T> {
    const result = await this.cacheManager.set(entity);

    // 검색 서비스가 있으면 인덱스 업데이트
    if (this.searchService) {
      if (entity.id) {
        await this.searchService.updateRecords([result]);
      } else {
        await this.searchService.addRecords([result]);
      }
    }

    return result;
  }

  /**
   * 항목 삭제
   * @param id 삭제할 엔티티 ID
   * @returns 성공 여부
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.cacheManager.delete(id);

    // 검색 서비스가 있으면 인덱스에서도 삭제
    if (this.searchService && result) {
      await this.searchService.deleteRecords([id]);
    }

    return result;
  }

  /**
   * 조건에 맞는 항목 찾기
   * @param filter 필터 조건
   * @param options 쿼리 옵션
   * @returns 엔티티 배열
   */
  async find(filter?: Partial<T>, options?: any): Promise<T[]> {
    return this.cacheManager.find(filter, options);
  }

  /**
   * 조건에 맞는 단일 항목 찾기
   * @param filter 필터 조건
   * @returns 엔티티 또는 undefined
   */
  async findOne(filter: Partial<T>): Promise<T | undefined> {
    return this.cacheManager.findOne(filter);
  }

  /**
   * 여러 항목 일괄 생성
   * @param entities 생성할 엔티티 배열
   * @returns 생성된 엔티티 배열
   */
  async bulkCreate(entities: Array<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>): Promise<T[]> {
    const results = await this.cacheManager.bulkCreate(entities);

    // 검색 서비스가 있으면 인덱스에 추가
    if (this.searchService && results.length > 0) {
      await this.searchService.addRecords(results);
    }

    return results;
  }

  /**
   * 검색 수행
   * @param query 검색어
   * @param options 검색 옵션
   * @returns 검색 결과
   */
  async search(query: string, options?: any): Promise<any> {
    if (!this.searchService) {
      throw new Error('Search service not initialized');
    }

    return this.searchService.search(query, options);
  }

  /**
   * 캐시 통계 가져오기
   */
  getCacheStats(): any {
    return this.cacheManager.getStats();
  }

  /**
   * 검색 설정 가져오기
   */
  async getSearchSettings(): Promise<any> {
    if (!this.searchService) {
      throw new Error('Search service not initialized');
    }

    return this.searchService.getSettings();
  }

  /**
   * 검색 설정 업데이트
   * @param settings 업데이트할 설정
   */
  async updateSearchSettings(settings: any): Promise<boolean> {
    if (!this.searchService) {
      throw new Error('Search service not initialized');
    }

    return this.searchService.updateSettings(settings);
  }

  /**
   * 저장소 인스턴스 가져오기
   */
  getRepository(): Repository<T> {
    return this.cacheManager.getRepository();
  }

  /**
   * 검색 서비스 인스턴스 가져오기
   */
  getSearchService(): SearchService<T> | null {
    return this.searchService;
  }

  /**
   * 캐시 비우기
   */
  clearCache(): void {
    this.cacheManager.clearCache();
  }

  /**
   * 검색 인덱스 비우기
   */
  async clearSearchIndex(): Promise<boolean> {
    if (!this.searchService) {
      return false;
    }

    return this.searchService.clearIndex();
  }

  /**
   * 소멸자
   */
  destroy(): void {
    (this.cacheManager as any).destroy();
  }
}
