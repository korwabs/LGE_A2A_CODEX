/**
 * 인메모리 검색 서비스 구현체
 */
import { SearchService, SearchOptions, SearchResult } from './search.interface';
import Fuse from 'fuse.js';

/**
 * 인메모리 검색 서비스 옵션 인터페이스
 */
export interface InMemorySearchOptions {
  /**
   * 검색할 필드
   */
  searchFields?: string[];

  /**
   * 퍼지 검색 임계값 (0.0 ~ 1.0)
   * 값이 낮을수록 더 엄격한 매칭이 요구됨
   */
  threshold?: number;

  /**
   * 검색 정확도 거리
   */
  distance?: number;

  /**
   * 대소문자 구분 여부
   */
  caseSensitive?: boolean;

  /**
   * 로깅 활성화 여부
   */
  enableLogging?: boolean;
}

/**
 * 인메모리 검색 서비스 구현체
 * Fuse.js를 사용한 퍼지 검색 구현
 */
export class InMemorySearchService<T = any> implements SearchService<T> {
  private records: Map<string, T> = new Map();
  private fuse: Fuse<T> | null = null;
  private options: InMemorySearchOptions;
  private settings: any = {};

  /**
   * 인메모리 검색 서비스 생성자
   * @param options 검색 서비스 옵션
   */
  constructor(options: InMemorySearchOptions = {}) {
    this.options = {
      searchFields: options.searchFields || [],
      threshold: options.threshold !== undefined ? options.threshold : 0.3,
      distance: options.distance || 100,
      caseSensitive: options.caseSensitive || false,
      enableLogging: options.enableLogging || false
    };

    // Fuse.js 인스턴스 초기화
    this.initFuse();
  }

  /**
   * Fuse.js 인스턴스 초기화
   */
  private initFuse(): void {
    const fuseOptions: Fuse.IFuseOptions<T> = {
      threshold: this.options.threshold,
      distance: this.options.distance,
      caseSensitive: this.options.caseSensitive,
      includeScore: true,
      includeMatches: true,
      keys: this.options.searchFields as string[]
    };

    this.fuse = new Fuse<T>(Array.from(this.records.values()), fuseOptions);
  }

  /**
   * 인덱스에 문서 추가
   * @param records 추가할 문서 배열
   * @returns 추가된 문서 ID 배열
   */
  async addRecords(records: T[]): Promise<string[]> {
    const objectIds: string[] = [];

    for (const record of records) {
      const processedRecord = this.processRecord(record);
      const objectId = (processedRecord as any).objectID;
      
      this.records.set(objectId, processedRecord);
      objectIds.push(objectId);
    }

    // Fuse.js 인스턴스 재생성
    this.initFuse();

    this.log(`Added ${objectIds.length} records`);
    return objectIds;
  }

  /**
   * 인덱스에 문서 업데이트
   * @param records 업데이트할 문서 배열
   * @returns 업데이트된 문서 ID 배열
   */
  async updateRecords(records: T[]): Promise<string[]> {
    const objectIds: string[] = [];

    for (const record of records) {
      const processedRecord = this.processRecord(record);
      const objectId = (processedRecord as any).objectID;
      
      this.records.set(objectId, processedRecord);
      objectIds.push(objectId);
    }

    // Fuse.js 인스턴스 재생성
    this.initFuse();

    this.log(`Updated ${objectIds.length} records`);
    return objectIds;
  }

  /**
   * 인덱스에서 문서 삭제
   * @param objectIds 삭제할 문서 ID 배열
   * @returns 성공 여부
   */
  async deleteRecords(objectIds: string[]): Promise<boolean> {
    let deletedCount = 0;

    for (const objectId of objectIds) {
      if (this.records.delete(objectId)) {
        deletedCount++;
      }
    }

    // Fuse.js 인스턴스 재생성
    this.initFuse();

    this.log(`Deleted ${deletedCount} records`);
    return deletedCount > 0;
  }

  /**
   * 인덱스에서 문서 가져오기
   * @param objectId 문서 ID
   * @returns 문서 또는 undefined
   */
  async getRecord(objectId: string): Promise<T | undefined> {
    return this.records.get(objectId);
  }

  /**
   * 인덱스 검색
   * @param query 검색어
   * @param options 검색 옵션
   * @returns 검색 결과
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult<T>> {
    if (!this.fuse) {
      this.initFuse();
    }

    if (!this.fuse) {
      return this.createEmptyResult(query);
    }

    const page = options.page || 0;
    const hitsPerPage = options.hitsPerPage || 20;
    const start = page * hitsPerPage;
    const end = start + hitsPerPage;

    // Fuse.js 검색 수행
    const searchResults = this.fuse.search(query);
    
    // 필터 적용
    let filteredResults = searchResults;
    
    if (options.filters) {
      filteredResults = this.applyFilters(searchResults, options.filters);
    }

    // 페이지네이션 적용
    const paginatedResults = filteredResults.slice(start, end);

    // 결과 변환
    const hits = paginatedResults.map(result => {
      const item = result.item as any;
      return {
        ...item,
        _score: result.score,
        _highlightResult: this.generateHighlights(result)
      };
    });

    this.log(`Search for "${query}" returned ${filteredResults.length} results`);

    return {
      hits,
      nbHits: filteredResults.length,
      page,
      nbPages: Math.ceil(filteredResults.length / hitsPerPage),
      hitsPerPage,
      processingTimeMS: 0, // 인메모리 검색은 처리 시간을 추적하지 않음
      query
    };
  }

  /**
   * 검색 결과에 필터 적용
   * @param results 검색 결과
   * @param filterExpression 필터 표현식
   * @returns 필터링된 결과
   */
  private applyFilters(results: Fuse.FuseResult<T>[], filterExpression: string): Fuse.FuseResult<T>[] {
    // 간단한 필터 구현 (기본적인 AND/OR 지원)
    // 실제로는 더 복잡한 파서가 필요할 수 있음
    
    // AND와 OR로 표현식 분리
    const orExpressions = filterExpression.split(' OR ');
    
    return results.filter(result => {
      const item = result.item as any;
      
      // OR 표현식 중 하나라도 참이면 포함
      return orExpressions.some(orExpr => {
        // AND 표현식은 모두 참이어야 함
        const andExpressions = orExpr.split(' AND ');
        return andExpressions.every(andExpr => {
          const [field, operator, value] = this.parseFilterExpression(andExpr);
          
          if (!field || !operator || value === undefined) {
            return true; // 파싱 실패 시 기본적으로 포함
          }
          
          return this.evaluateFilter(item, field, operator, value);
        });
      });
    });
  }

  /**
   * 필터 표현식 파싱
   * @param expression 필터 표현식
   * @returns [필드, 연산자, 값] 배열
   */
  private parseFilterExpression(expression: string): [string | null, string | null, any] {
    // 기본적인 구문 파싱 (필드:연산자:값)
    // 예: price:>:100, category:=:electronics
    const parts = expression.trim().split(':');
    
    if (parts.length !== 3) {
      return [null, null, undefined];
    }
    
    const [field, operator, valueStr] = parts;
    
    // 값 타입 변환
    let value: any = valueStr;
    
    if (valueStr === 'true') {
      value = true;
    } else if (valueStr === 'false') {
      value = false;
    } else if (!isNaN(Number(valueStr))) {
      value = Number(valueStr);
    }
    
    return [field, operator, value];
  }

  /**
   * 필터 평가
   * @param item 항목
   * @param field 필드
   * @param operator 연산자
   * @param value 값
   * @returns 평가 결과
   */
  private evaluateFilter(item: any, field: string, operator: string, value: any): boolean {
    const fieldValue = item[field];
    
    if (fieldValue === undefined) {
      return false;
    }
    
    switch (operator) {
      case '=':
      case '==':
        return fieldValue === value;
      
      case '!=':
        return fieldValue !== value;
      
      case '>':
        return fieldValue > value;
      
      case '>=':
        return fieldValue >= value;
      
      case '<':
        return fieldValue < value;
      
      case '<=':
        return fieldValue <= value;
      
      case 'contains':
        if (typeof fieldValue === 'string') {
          return fieldValue.includes(value);
        } else if (Array.isArray(fieldValue)) {
          return fieldValue.includes(value);
        }
        return false;
      
      case 'startsWith':
        return typeof fieldValue === 'string' && fieldValue.startsWith(value);
      
      case 'endsWith':
        return typeof fieldValue === 'string' && fieldValue.endsWith(value);
      
      default:
        return false;
    }
  }

  /**
   * 하이라이트 결과 생성
   * @param result Fuse.js 검색 결과
   * @returns 하이라이트 결과
   */
  private generateHighlights(result: Fuse.FuseResult<T>): any {
    const highlights: any = {};
    
    if (!result.matches) {
      return highlights;
    }
    
    for (const match of result.matches) {
      const key = match.key as string;
      const indices = match.indices;
      
      if (!key || !indices || indices.length === 0) {
        continue;
      }
      
      const value = (result.item as any)[key];
      
      if (typeof value !== 'string') {
        continue;
      }
      
      // 하이라이트 마크업 생성
      highlights[key] = {
        value,
        matchLevel: 'full',
        matchedWords: [result.matches?.map(m => m.value).filter(Boolean)],
        fullyHighlighted: false
      };
    }
    
    return highlights;
  }

  /**
   * 빈 검색 결과 생성
   * @param query 검색어
   * @returns 빈 검색 결과
   */
  private createEmptyResult(query: string): SearchResult<T> {
    return {
      hits: [],
      nbHits: 0,
      page: 0,
      nbPages: 0,
      hitsPerPage: 20,
      processingTimeMS: 0,
      query
    };
  }

  /**
   * 인덱스 설정 가져오기
   * @returns 인덱스 설정
   */
  async getSettings(): Promise<any> {
    return this.settings;
  }

  /**
   * 인덱스 설정 업데이트
   * @param settings 업데이트할 설정
   * @returns 성공 여부
   */
  async updateSettings(settings: any): Promise<boolean> {
    this.settings = {
      ...this.settings,
      ...settings
    };
    
    // 설정이 변경되면 Fuse.js 인스턴스 재생성
    if (settings.searchFields) {
      this.options.searchFields = settings.searchFields;
      this.initFuse();
    }
    
    if (settings.threshold !== undefined) {
      this.options.threshold = settings.threshold;
      this.initFuse();
    }
    
    if (settings.distance !== undefined) {
      this.options.distance = settings.distance;
      this.initFuse();
    }
    
    if (settings.caseSensitive !== undefined) {
      this.options.caseSensitive = settings.caseSensitive;
      this.initFuse();
    }
    
    this.log(`Updated settings`);
    return true;
  }

  /**
   * 인덱스 초기화 (모든 문서 삭제)
   * @returns 성공 여부
   */
  async clearIndex(): Promise<boolean> {
    this.records.clear();
    this.initFuse();
    
    this.log(`Cleared all records`);
    return true;
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
      console.log(`[InMemorySearch] ${message}`);
    }
  }
}
