/**
 * 저장소 인터페이스 정의
 * 다양한 데이터 저장 구현체를 위한 공통 인터페이스
 */
import { BaseEntity } from '../models';

/**
 * 기본 저장소 인터페이스
 * CRUD 연산과 기본 쿼리 기능 정의
 */
export interface Repository<T extends BaseEntity> {
  /**
   * 엔티티 생성
   * @param entity 생성할 엔티티
   * @returns 생성된 엔티티
   */
  create(entity: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>;

  /**
   * ID로 엔티티 조회
   * @param id 조회할 엔티티 ID
   * @returns 조회된 엔티티 또는 undefined
   */
  findById(id: string): Promise<T | undefined>;

  /**
   * 조건에 맞는 모든 엔티티 조회
   * @param filter 필터 조건
   * @param options 추가 옵션 (정렬, 페이지네이션 등)
   * @returns 조회된 엔티티 배열
   */
  find(filter?: Partial<T>, options?: QueryOptions): Promise<T[]>;

  /**
   * 조건에 맞는 하나의 엔티티 조회
   * @param filter 필터 조건
   * @returns 조회된 엔티티 또는 undefined
   */
  findOne(filter: Partial<T>): Promise<T | undefined>;

  /**
   * 엔티티 업데이트
   * @param id 업데이트할 엔티티 ID
   * @param update 업데이트 데이터
   * @returns 업데이트된 엔티티
   */
  update(id: string, update: Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>): Promise<T>;

  /**
   * 엔티티 삭제
   * @param id 삭제할 엔티티 ID
   * @returns 성공 여부
   */
  delete(id: string): Promise<boolean>;

  /**
   * 여러 엔티티 일괄 생성
   * @param entities 생성할 엔티티 배열
   * @returns 생성된 엔티티 배열
   */
  bulkCreate(entities: Array<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>): Promise<T[]>;

  /**
   * 조건에 맞는 엔티티 수 조회
   * @param filter 필터 조건
   * @returns 엔티티 수
   */
  count(filter?: Partial<T>): Promise<number>;

  /**
   * 저장소 초기화
   * @returns 성공 여부
   */
  initialize(): Promise<boolean>;
}

/**
 * 쿼리 옵션 인터페이스
 */
export interface QueryOptions {
  /**
   * 정렬 옵션
   */
  sort?: Record<string, 'asc' | 'desc'>;

  /**
   * 페이지네이션 - 스킵할 엔티티 수
   */
  skip?: number;

  /**
   * 페이지네이션 - 가져올 최대 엔티티 수
   */
  limit?: number;

  /**
   * 가져올 필드 목록
   */
  select?: string[];

  /**
   * 추가 옵션 (구현체별 특수 기능)
   */
  [key: string]: any;
}

/**
 * 저장소 타입 열거형
 */
export enum RepositoryType {
  FIREBASE = 'firebase',
  JSON_FILE = 'json_file',
  INDEXED_DB = 'indexed_db',
  MEMORY = 'memory'
}

/**
 * 저장소 팩토리 인터페이스
 * 다양한 저장소 구현체를 생성하는 팩토리 패턴
 */
export interface RepositoryFactory {
  /**
   * 저장소 생성
   * @param entityType 엔티티 타입
   * @param type 저장소 타입
   * @param options 저장소 옵션
   * @returns 저장소 인스턴스
   */
  createRepository<T extends BaseEntity>(
    entityType: string,
    type: RepositoryType,
    options?: any
  ): Repository<T>;
}
