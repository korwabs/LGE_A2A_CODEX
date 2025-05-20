/**
 * Firebase 기반 저장소 구현체
 */
import { BaseEntity } from '../models';
import { Repository, QueryOptions } from './repository.interface';
import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';

/**
 * Firebase 저장소 옵션 인터페이스
 */
export interface FirebaseRepositoryOptions {
  /**
   * Firestore 컬렉션 이름
   */
  collectionName: string;

  /**
   * 캐시 사용 여부
   */
  useCache?: boolean;

  /**
   * 캐시 만료 시간 (밀리초)
   */
  cacheTTL?: number;
}

/**
 * Firebase 기반 저장소 구현체
 */
export class FirebaseRepository<T extends BaseEntity> implements Repository<T> {
  private db: FirebaseFirestore.Firestore;
  private collection: FirebaseFirestore.CollectionReference;
  private cache: Map<string, { data: T; timestamp: number }> = new Map();
  private listCache: Map<string, { data: T[]; timestamp: number }> = new Map();

  /**
   * Firebase 저장소 생성자
   * @param options 저장소 옵션
   */
  constructor(private options: FirebaseRepositoryOptions) {
    this.db = admin.firestore();
    this.collection = this.db.collection(options.collectionName);
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

    await this.collection.doc(id).set(newEntity);
    
    if (this.options.useCache) {
      this.cache.set(id, { data: newEntity, timestamp: Date.now() });
      this.invalidateListCache();
    }

    return newEntity;
  }

  /**
   * ID로 엔티티 조회
   * @param id 조회할 엔티티 ID
   * @returns 조회된 엔티티 또는 undefined
   */
  async findById(id: string): Promise<T | undefined> {
    // 캐시 확인
    if (this.options.useCache) {
      const cached = this.cache.get(id);
      if (cached && Date.now() - cached.timestamp < (this.options.cacheTTL || 300000)) {
        return cached.data;
      }
    }

    const doc = await this.collection.doc(id).get();
    if (!doc.exists) {
      return undefined;
    }

    const entity = doc.data() as T;
    
    // 캐시 업데이트
    if (this.options.useCache) {
      this.cache.set(id, { data: entity, timestamp: Date.now() });
    }

    return entity;
  }

  /**
   * 조건에 맞는 모든 엔티티 조회
   * @param filter 필터 조건
   * @param options 추가 옵션 (정렬, 페이지네이션 등)
   * @returns 조회된 엔티티 배열
   */
  async find(filter?: Partial<T>, options?: QueryOptions): Promise<T[]> {
    // 캐시 키 생성
    const cacheKey = JSON.stringify({ filter, options });
    
    // 캐시 확인
    if (this.options.useCache) {
      const cached = this.listCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < (this.options.cacheTTL || 300000)) {
        return cached.data;
      }
    }

    let query: FirebaseFirestore.Query = this.collection;

    // 필터 적용
    if (filter) {
      Object.entries(filter).forEach(([key, value]) => {
        if (value !== undefined) {
          query = query.where(key, '==', value);
        }
      });
    }

    // 정렬 적용
    if (options?.sort) {
      Object.entries(options.sort).forEach(([key, order]) => {
        query = query.orderBy(key, order === 'desc' ? 'desc' : 'asc');
      });
    }

    // 페이지네이션 적용
    if (options?.skip) {
      // Firestore는 직접적인 skip을 지원하지 않아 cursor를 사용해야 하지만,
      // 간단한 구현을 위해 클라이언트에서 처리
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const snapshot = await query.get();
    const entities = snapshot.docs.map(doc => doc.data() as T);
    
    // 스킵 적용 (클라이언트에서 처리)
    const results = options?.skip ? entities.slice(options.skip) : entities;
    
    // 캐시 업데이트
    if (this.options.useCache) {
      this.listCache.set(cacheKey, { data: results, timestamp: Date.now() });
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
    const now = new Date().toISOString();
    
    const updateData = {
      ...update,
      updatedAt: now
    };

    await this.collection.doc(id).update(updateData);
    
    // 캐시 무효화
    if (this.options.useCache) {
      this.cache.delete(id);
      this.invalidateListCache();
    }

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error(`Entity with id ${id} not found after update`);
    }

    return updated;
  }

  /**
   * 엔티티 삭제
   * @param id 삭제할 엔티티 ID
   * @returns 성공 여부
   */
  async delete(id: string): Promise<boolean> {
    await this.collection.doc(id).delete();
    
    // 캐시 무효화
    if (this.options.useCache) {
      this.cache.delete(id);
      this.invalidateListCache();
    }

    return true;
  }

  /**
   * 여러 엔티티 일괄 생성
   * @param entities 생성할 엔티티 배열
   * @returns 생성된 엔티티 배열
   */
  async bulkCreate(entities: Array<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>): Promise<T[]> {
    const batch = this.db.batch();
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

      const docRef = this.collection.doc(id);
      batch.set(docRef, newEntity);
      results.push(newEntity);
      
      // 캐시 업데이트
      if (this.options.useCache) {
        this.cache.set(id, { data: newEntity, timestamp: Date.now() });
      }
    }

    await batch.commit();
    
    // 리스트 캐시 무효화
    if (this.options.useCache) {
      this.invalidateListCache();
    }

    return results;
  }

  /**
   * 조건에 맞는 엔티티 수 조회
   * @param filter 필터 조건
   * @returns 엔티티 수
   */
  async count(filter?: Partial<T>): Promise<number> {
    // Firestore는 직접적인 count를 지원하지 않아 전체 문서를 가져와서 카운트
    const entities = await this.find(filter);
    return entities.length;
  }

  /**
   * 저장소 초기화
   * @returns 성공 여부
   */
  async initialize(): Promise<boolean> {
    // Firebase는 특별한 초기화가 필요없음
    return true;
  }

  /**
   * 리스트 캐시 무효화
   */
  private invalidateListCache(): void {
    this.listCache.clear();
  }
}
