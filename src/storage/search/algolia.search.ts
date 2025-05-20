/**
 * Algolia 검색 서비스 구현체
 */
import { SearchService, SearchOptions, SearchResult } from './search.interface';
import algoliasearch, { SearchIndex } from 'algoliasearch';

/**
 * Algolia 검색 서비스 옵션 인터페이스
 */
export interface AlgoliaSearchOptions {
  /**
   * Algolia 앱 ID
   */
  appId: string;

  /**
   * Algolia API 키
   */
  apiKey: string;

  /**
   * 인덱스 이름
   */
  indexName: string;

  /**
   * 초기 인덱스 설정
   */
  initialSettings?: any;

  /**
   * 로깅 활성화 여부
   */
  enableLogging?: boolean;
}

/**
 * Algolia 검색 서비스 구현체
 */
export class AlgoliaSearchService<T = any> implements SearchService<T> {
  private client: algoliasearch.SearchClient;
  private index: SearchIndex;
  private options: AlgoliaSearchOptions;

  /**
   * Algolia 검색 서비스 생성자
   * @param options 검색 서비스 옵션
   */
  constructor(options: AlgoliaSearchOptions) {
    this.options = {
      ...options,
      enableLogging: options.enableLogging || false
    };

    this.client = algoliasearch(options.appId, options.apiKey);
    this.index = this.client.initIndex(options.indexName);

    // 초기 설정이 있으면 적용
    if (options.initialSettings) {
      this.updateSettings(options.initialSettings).catch(error => {
        this.log(`Error applying initial settings: ${error}`);
      });
    }
  }

  /**
   * 인덱스에 문서 추가
   * @param records 추가할 문서 배열
   * @returns 추가된 문서 ID 배열
   */
  async addRecords(records: T[]): Promise<string[]> {
    try {
      // ID 변환 (objectID로)
      const processedRecords = records.map(record => this.processRecord(record));
      
      const { objectIDs } = await this.index.saveObjects(processedRecords);
      this.log(`Added ${objectIDs.length} records to index ${this.options.indexName}`);
      
      return objectIDs;
    } catch (error) {
      this.log(`Error adding records: ${error}`);
      throw error;
    }
  }

  /**
   * 인덱스에 문서 업데이트
   * @param records 업데이트할 문서 배열
   * @returns 업데이트된 문서 ID 배열
   */
  async updateRecords(records: T[]): Promise<string[]> {
    try {
      // ID 변환 (objectID로)
      const processedRecords = records.map(record => this.processRecord(record));
      
      const { objectIDs } = await this.index.partialUpdateObjects(processedRecords, {
        createIfNotExists: true
      });
      
      this.log(`Updated ${objectIDs.length} records in index ${this.options.indexName}`);
      return objectIDs;
    } catch (error) {
      this.log(`Error updating records: ${error}`);
      throw error;
    }
  }

  /**
   * 인덱스에서 문서 삭제
   * @param objectIds 삭제할 문서 ID 배열
   * @returns 성공 여부
   */
  async deleteRecords(objectIds: string[]): Promise<boolean> {
    try {
      await this.index.deleteObjects(objectIds);
      this.log(`Deleted ${objectIds.length} records from index ${this.options.indexName}`);
      return true;
    } catch (error) {
      this.log(`Error deleting records: ${error}`);
      return false;
    }
  }

  /**
   * 인덱스에서 문서 가져오기
   * @param objectId 문서 ID
   * @returns 문서 또는 undefined
   */
  async getRecord(objectId: string): Promise<T | undefined> {
    try {
      const record = await this.index.getObject(objectId);
      return record as T;
    } catch (error) {
      this.log(`Error getting record: ${error}`);
      return undefined;
    }
  }

  /**
   * 인덱스 검색
   * @param query 검색어
   * @param options 검색 옵션
   * @returns 검색 결과
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult<T>> {
    try {
      // Algolia 검색 파라미터로 변환
      const searchParams: any = {
        query,
        attributesToRetrieve: options.attributesToRetrieve,
        attributesToHighlight: options.attributesToHighlight,
        facets: options.facets,
        filters: options.filters,
        page: options.page || 0,
        hitsPerPage: options.hitsPerPage || 20
      };

      // 정렬 옵션 추가
      if (options.sortBy) {
        searchParams.sortBy = options.sortBy;
      }

      // 타이포그래피 관련 옵션
      if (options.minWordSizefor1Typo !== undefined) {
        searchParams.minWordSizefor1Typo = options.minWordSizefor1Typo;
      }
      
      if (options.minWordSizefor2Typos !== undefined) {
        searchParams.minWordSizefor2Typos = options.minWordSizefor2Typos;
      }
      
      if (options.typoTolerance !== undefined) {
        searchParams.typoTolerance = options.typoTolerance;
      }

      // 기타 옵션 추가
      for (const [key, value] of Object.entries(options)) {
        if (!searchParams.hasOwnProperty(key) && value !== undefined) {
          searchParams[key] = value;
        }
      }

      const result = await this.index.search<T>(query, searchParams);
      
      this.log(`Search for "${query}" returned ${result.nbHits} results`);
      
      return result;
    } catch (error) {
      this.log(`Error searching: ${error}`);
      throw error;
    }
  }

  /**
   * 인덱스 설정 가져오기
   * @returns 인덱스 설정
   */
  async getSettings(): Promise<any> {
    try {
      return await this.index.getSettings();
    } catch (error) {
      this.log(`Error getting settings: ${error}`);
      throw error;
    }
  }

  /**
   * 인덱스 설정 업데이트
   * @param settings 업데이트할 설정
   * @returns 성공 여부
   */
  async updateSettings(settings: any): Promise<boolean> {
    try {
      await this.index.setSettings(settings);
      this.log(`Updated settings for index ${this.options.indexName}`);
      return true;
    } catch (error) {
      this.log(`Error updating settings: ${error}`);
      return false;
    }
  }

  /**
   * 인덱스 초기화 (모든 문서 삭제)
   * @returns 성공 여부
   */
  async clearIndex(): Promise<boolean> {
    try {
      await this.index.clearObjects();
      this.log(`Cleared all records from index ${this.options.indexName}`);
      return true;
    } catch (error) {
      this.log(`Error clearing index: ${error}`);
      return false;
    }
  }

  /**
   * 문서 레코드 처리 (id를 objectID로 변환)
   * @param record 원본 레코드
   * @returns 처리된 레코드
   */
  private processRecord(record: any): any {
    const result = { ...record };
    
    // id가 있고 objectID가 없으면 변환
    if (record.id && !record.objectID) {
      result.objectID = record.id;
    }
    
    return result;
  }

  /**
   * 로그 출력
   * @param message 로그 메시지
   */
  private log(message: string): void {
    if (this.options.enableLogging) {
      console.log(`[AlgoliaSearch] ${message}`);
    }
  }
}
