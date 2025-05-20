/**
 * 메모리 기반 저장소 구현체
 */
import { BaseEntity } from '../models';
import { Repository, QueryOptions } from './repository.interface';
import { v4 as uuidv4 } from 'uuid';

/**
 * 메모리 저장소 옵션 인터페이스
 */
export interface MemoryRepositoryOptions {
  /**
   * 초기 데이터
   */
  initialData?: BaseEntity[];
}

/**
 * 메모리 기반 저장소 구현체
 */
export class MemoryRepository<T extends BaseEntity> implements Repository<T> {
  private entities: Map<string, T> = new Map();

  /**
   * 메모리 저장소 생성자
   * @param options 저장소 옵션
   */
  constructor(private options: MemoryRepositoryOptions = {}) {
    if (options.initialData) {
      for (const entity of options.initialData) {
        this.entities.set(entity.id, entity as T);
      }
    }
  }

  /**
   * 엔티티 생성
   * @param entity 생성할 엔티티
   * @returns 생성된 엔티티
   */
  async create(entity: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T> {
    const now = new Date().toISOString();
    const id = uuidv4();
    
    const newEntity = {
      ...entity,
      id,
      createdAt: now,
      updatedAt: now
    } as T;

    this.entities.set(id, newEntity);
    return newEntity;
  }

  /**
   * ID로 엔티티 조회
   * @param id 조회할 엔티티 ID
   * @returns 조회된 엔티티 또는 undefined
   */
  async findById(id: string): Promise<T | undefined> {
    return this.entities.get(id);
  }

  /**
   * 조건에 맞는 모든 엔티티 조회
   * @param filter 필터 조건
   * @param options 추가 옵션 (정렬, 페이지네이션 등)
   * @returns 조회된 엔티티 배열
   */
  async find(filter?: Partial<T>, options?: QueryOptions): Promise<T[]> {
    let results = Array.from(this.entities.values());

    // 필터 적용
    if (filter) {
      results = results.filter(entity => {
        return Object.entries(filter).every(([key, value]) => {
          if (value === undefined) return true;
          return entity[key as keyof T] === value;
        });
      });
    }

    // 정렬 적용
    if (options?.sort) {
      const sortEntries = Object.entries(options.sort);
      if (sortEntries.length > 0) {
        results.sort((a, b) => {
          for (const [key, order] of sortEntries) {
            const aValue = a[key as keyof T];
            const bValue = b[key as keyof T];
            
            if (aValue === bValue) continue;
            
            const direction = order === 'desc' ? -1 : 1;
            
            if (aValue === undefined) return direction;
            if (bValue === undefined) return -direction;
            
            if (typeof aValue === 'string' && typeof bValue === 'string') {
              return aValue.localeCompare(bValue) * direction;
            }
            
            if (aValue < bValue) return -1 * direction;
            if (aValue > bValue) return 1 * direction;
          }
          return 0;
        });
      }
    }

    // 선택 필드 적용 (임시 객체 복사)
    if (options?.select && options.select.length > 0) {
      results = results.map(entity => {
        const selected = {} as T;
        options.select!.forEach(field => {
          if (field in entity) {
            (selected as any)[field] = entity[field as keyof T];
          }
        });
        return selected;
      });
    }

    // 페이지네이션 적용
    if (options?.skip || options?.limit) {
      const skip = options.skip || 0;
      const limit = options.limit || results.length;
      results = results.slice(skip, skip + limit);
    }

    return results;
  }

  /**
   * 조건에 맞는 하나의 엔티티 조회
   * @param filter 필터 조건
   * @returns 조회된 엔티티 또는 undefined
   */
  async findOne(filter: Partial<T>): Promise<T | undefined> {
    const entities = await this.find(filter, { limit: 1 });
    return entities.length > 0 ? entities[0] : undefined;
  }

  /**
   * 엔티티 업데이트
   * @param id 업데이트할 엔티티 ID
   * @param update 업데이트 데이터
   * @returns 업데이트된 엔티티
   */
  async update(id: string, update: Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>): Promise<T> {
    const entity = this.entities.get(id);
    if (!entity) {
      throw new Error(`Entity with id ${id} not found`);
    }

    const now = new Date().toISOString();
    
    const updatedEntity = {
      ...entity,
      ...update,
      id, // 보호를 위해 ID 재설정
      createdAt: entity.createdAt, // 보호를 위해 생성 시간 유지
      updatedAt: now
    } as T;

    this.entities.set(id, updatedEntity);
    return updatedEntity;
  }

  /**
   * 엔티티 삭제
   * @param id 삭제할 엔티티 ID
   * @returns 성공 여부
   */
  async delete(id: string): Promise<boolean> {
    return this.entities.delete(id);
  }

  /**
   * 여러 엔티티 일괄 생성
   * @param entities 생성할 엔티티 배열
   * @returns 생성된 엔티티 배열
   */
  async bulkCreate(entities: Array<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>): Promise<T[]> {
    const results: T[] = [];
    const now = new Date().toISOString();

    for (const entity of entities) {
      const id = uuidv4();
      const newEntity = {
        ...entity,
        id,
        createdAt: now,
        updatedAt: now
      } as T;

      this.entities.set(id, newEntity);
      results.push(newEntity);
    }

    return results;
  }

  /**
   * 조건에 맞는 엔티티 수 조회
   * @param filter 필터 조건
   * @returns 엔티티 수
   */
  async count(filter?: Partial<T>): Promise<number> {
    const entities = await this.find(filter);
    return entities.length;
  }

  /**
   * 저장소 초기화
   * @returns 성공 여부
   */
  async initialize(): Promise<boolean> {
    // 메모리 저장소는 특별한 초기화가 필요없음
    return true;
  }

  /**
   * 저장소 클리어
   */
  clear(): void {
    this.entities.clear();
  }
}
