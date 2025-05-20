/**
 * 저장소 팩토리 구현체
 */
import { BaseEntity } from '../models';
import { Repository, RepositoryType } from './repository.interface';
import { FirebaseRepository, FirebaseRepositoryOptions } from './firebase.repository';
import { JsonFileRepository, JsonFileRepositoryOptions } from './json-file.repository';
import { MemoryRepository, MemoryRepositoryOptions } from './memory.repository';

/**
 * 저장소 팩토리 구현체
 */
export class RepositoryFactoryImpl {
  /**
   * 저장소 인스턴스를 생성합니다.
   * @param entityType 엔티티 타입
   * @param type 저장소 타입
   * @param options 저장소 옵션
   * @returns 저장소 인스턴스
   */
  createRepository<T extends BaseEntity>(
    entityType: string,
    type: RepositoryType,
    options?: any
  ): Repository<T> {
    switch (type) {
      case RepositoryType.FIREBASE:
        return this.createFirebaseRepository<T>(entityType, options);
      
      case RepositoryType.JSON_FILE:
        return this.createJsonFileRepository<T>(entityType, options);
      
      case RepositoryType.MEMORY:
        return this.createMemoryRepository<T>(options);
      
      case RepositoryType.INDEXED_DB:
        throw new Error('IndexedDB repository not implemented yet');
      
      default:
        throw new Error(`Unknown repository type: ${type}`);
    }
  }

  /**
   * Firebase 저장소 인스턴스를 생성합니다.
   * @param entityType 엔티티 타입
   * @param options 저장소 옵션
   * @returns Firebase 저장소 인스턴스
   */
  private createFirebaseRepository<T extends BaseEntity>(
    entityType: string,
    options?: FirebaseRepositoryOptions
  ): Repository<T> {
    const repositoryOptions: FirebaseRepositoryOptions = {
      collectionName: options?.collectionName || entityType,
      useCache: options?.useCache !== undefined ? options.useCache : true,
      cacheTTL: options?.cacheTTL || 300000 // 기본값 5분
    };

    return new FirebaseRepository<T>(repositoryOptions);
  }

  /**
   * JSON 파일 저장소 인스턴스를 생성합니다.
   * @param entityType 엔티티 타입
   * @param options 저장소 옵션
   * @returns JSON 파일 저장소 인스턴스
   */
  private createJsonFileRepository<T extends BaseEntity>(
    entityType: string,
    options?: JsonFileRepositoryOptions
  ): Repository<T> {
    if (!options?.dataDir) {
      throw new Error('dataDir is required for JsonFileRepository');
    }

    const repositoryOptions: JsonFileRepositoryOptions = {
      dataDir: options.dataDir,
      entityType,
      saveInterval: options.saveInterval || 5000 // 기본값 5초
    };

    const repository = new JsonFileRepository<T>(repositoryOptions);
    repository.initialize(); // 비동기지만 생성자에서는 동기적으로 처리

    return repository;
  }

  /**
   * 메모리 저장소 인스턴스를 생성합니다.
   * @param options 저장소 옵션
   * @returns 메모리 저장소 인스턴스
   */
  private createMemoryRepository<T extends BaseEntity>(
    options?: MemoryRepositoryOptions
  ): Repository<T> {
    return new MemoryRepository<T>(options);
  }
}

// 싱글톤 인스턴스
export const repositoryFactory = new RepositoryFactoryImpl();
