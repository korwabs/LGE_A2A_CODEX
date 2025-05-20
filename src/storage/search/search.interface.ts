/**
 * 검색 인터페이스 정의
 */

/**
 * 검색 옵션 인터페이스
 */
export interface SearchOptions {
  /**
   * 검색 범위 필드
   */
  searchFields?: string[];

  /**
   * 결과에 포함할 필드
   */
  attributesToRetrieve?: string[];

  /**
   * 강조 표시할 필드
   */
  attributesToHighlight?: string[];

  /**
   * 패싯(필터링 가능한 속성) 필드
   */
  facets?: string[];

  /**
   * 필터 표현식
   */
  filters?: string;

  /**
   * 페이지 번호
   */
  page?: number;

  /**
   * 페이지당 결과 수
   */
  hitsPerPage?: number;

  /**
   * 정렬 필드 및 방향
   */
  sortBy?: string;

  /**
   * 정렬 방향
   */
  sortDirection?: 'asc' | 'desc';

  /**
   * 검색어 최소 길이
   */
  minWordSizefor1Typo?: number;

  /**
   * 검색어 최소 길이 (2개 이상 오타)
   */
  minWordSizefor2Typos?: number;

  /**
   * 타이포그래피 허용 여부
   */
  typoTolerance?: boolean | 'min' | 'strict';

  /**
   * 추가 옵션
   */
  [key: string]: any;
}

/**
 * 검색 결과 인터페이스
 */
export interface SearchResult<T> {
  /**
   * 검색 결과 항목
   */
  hits: Array<T & { objectID: string; _highlightResult?: any }>;

  /**
   * 총 결과 수
   */
  nbHits: number;

  /**
   * 페이지 번호
   */
  page: number;

  /**
   * 총 페이지 수
   */
  nbPages: number;

  /**
   * 페이지당 결과 수
   */
  hitsPerPage: number;

  /**
   * 검색에 걸린 시간 (밀리초)
   */
  processingTimeMS: number;

  /**
   * 검색어
   */
  query: string;

  /**
   * 패싯 결과
   */
  facets?: Record<string, Record<string, number>>;

  /**
   * 패싯 통계
   */
  facets_stats?: Record<string, { min: number; max: number; avg: number; sum: number }>;
}

/**
 * 검색 서비스 인터페이스
 */
export interface SearchService<T = any> {
  /**
   * 인덱스에 문서 추가
   * @param records 추가할 문서 배열
   * @returns 추가된 문서 ID 배열
   */
  addRecords(records: T[]): Promise<string[]>;

  /**
   * 인덱스에 문서 업데이트
   * @param records 업데이트할 문서 배열
   * @returns 업데이트된 문서 ID 배열
   */
  updateRecords(records: T[]): Promise<string[]>;

  /**
   * 인덱스에서 문서 삭제
   * @param objectIds 삭제할 문서 ID 배열
   * @returns 성공 여부
   */
  deleteRecords(objectIds: string[]): Promise<boolean>;

  /**
   * 인덱스에서 문서 가져오기
   * @param objectId 문서 ID
   * @returns 문서 또는 undefined
   */
  getRecord(objectId: string): Promise<T | undefined>;

  /**
   * 인덱스 검색
   * @param query 검색어
   * @param options 검색 옵션
   * @returns 검색 결과
   */
  search(query: string, options?: SearchOptions): Promise<SearchResult<T>>;

  /**
   * 인덱스 설정 가져오기
   * @returns 인덱스 설정
   */
  getSettings(): Promise<any>;

  /**
   * 인덱스 설정 업데이트
   * @param settings 업데이트할 설정
   * @returns 성공 여부
   */
  updateSettings(settings: any): Promise<boolean>;

  /**
   * 인덱스 초기화 (모든 문서 삭제)
   * @returns 성공 여부
   */
  clearIndex(): Promise<boolean>;
}
