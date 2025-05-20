/**
 * 검색 서비스 팩토리 구현체
 */
import { SearchService } from './search.interface';
import { AlgoliaSearchService, AlgoliaSearchOptions } from './algolia.search';
import { InMemorySearchService, InMemorySearchOptions } from './memory.search';

/**
 * 검색 서비스 타입 열거형
 */
export enum SearchServiceType {
  ALGOLIA = 'algolia',
  IN_MEMORY = 'in_memory'
}

/**
 * 검색 서비스 팩토리 인터페이스
 */
export interface SearchServiceFactory {
  /**
   * 검색 서비스 생성
   * @param type 검색 서비스 타입
   * @param options 검색 서비스 옵션
   * @returns 검색 서비스 인스턴스
   */
  createSearchService<T = any>(type: SearchServiceType, options: any): SearchService<T>;
}

/**
 * 검색 서비스 팩토리 구현체
 */
export class SearchServiceFactoryImpl implements SearchServiceFactory {
  /**
   * 검색 서비스 생성
   * @param type 검색 서비스 타입
   * @param options 검색 서비스 옵션
   * @returns 검색 서비스 인스턴스
   */
  createSearchService<T = any>(type: SearchServiceType, options: any): SearchService<T> {
    switch (type) {
      case SearchServiceType.ALGOLIA:
        return this.createAlgoliaSearchService<T>(options);
      
      case SearchServiceType.IN_MEMORY:
        return this.createInMemorySearchService<T>(options);
      
      default:
        throw new Error(`Unknown search service type: ${type}`);
    }
  }

  /**
   * Algolia 검색 서비스 생성
   * @param options Algolia 검색 서비스 옵션
   * @returns Algolia 검색 서비스 인스턴스
   */
  private createAlgoliaSearchService<T = any>(options: AlgoliaSearchOptions): SearchService<T> {
    if (!options.appId) {
      throw new Error('appId is required for AlgoliaSearchService');
    }

    if (!options.apiKey) {
      throw new Error('apiKey is required for AlgoliaSearchService');
    }

    if (!options.indexName) {
      throw new Error('indexName is required for AlgoliaSearchService');
    }

    return new AlgoliaSearchService<T>(options);
  }

  /**
   * 인메모리 검색 서비스 생성
   * @param options 인메모리 검색 서비스 옵션
   * @returns 인메모리 검색 서비스 인스턴스
   */
  private createInMemorySearchService<T = any>(options: InMemorySearchOptions): SearchService<T> {
    return new InMemorySearchService<T>(options);
  }
}

// 싱글톤 인스턴스
export const searchServiceFactory = new SearchServiceFactoryImpl();
