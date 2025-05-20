/**
 * 스토리지 모듈 사용 예제
 */
import path from 'path';
import {
  Product,
  ProductAvailability,
  repositoryFactory,
  RepositoryType,
  searchServiceFactory,
  SearchServiceType,
  StorageManager
} from '../storage';

/**
 * 샘플 제품 데이터 생성
 * @returns 샘플 제품 데이터 배열
 */
function createSampleProducts(): Omit<Product, 'id' | 'createdAt' | 'updatedAt'>[] {
  return [
    {
      name: 'LG OLED TV C2 65인치',
      description: '선명한 화질과 완벽한 블랙을 제공하는 OLED TV',
      price: 8999.99,
      currency: 'BRL',
      imageUrls: ['https://example.com/images/oled-c2-65.jpg'],
      detailUrl: 'https://www.lge.com/br/tv/lg-OLEDC265',
      categoryIds: ['tv', 'oled'],
      sku: 'OLED65C2PSA',
      brand: 'LG',
      model: 'OLED65C2PSA',
      availability: ProductAvailability.IN_STOCK,
      specifications: {
        screenSize: 65,
        resolution: '4K',
        hdmiPorts: 4,
        smartTv: true,
        refreshRate: 120
      },
      features: [
        'Perfect Black',
        'Dolby Vision IQ',
        'Dolby Atmos',
        'webOS 22',
        'ThinQ AI'
      ],
      lastCrawledAt: new Date().toISOString()
    },
    {
      name: 'LG 냉장고 GC-X257CQES',
      description: '스마트 인버터 컴프레서가 탑재된 대용량 냉장고',
      price: 5499.99,
      currency: 'BRL',
      imageUrls: ['https://example.com/images/gc-x257cqes.jpg'],
      detailUrl: 'https://www.lge.com/br/refrigerators/lg-GCX257CQES',
      categoryIds: ['appliances', 'refrigerators'],
      sku: 'GCX257CQES',
      brand: 'LG',
      model: 'GC-X257CQES',
      availability: ProductAvailability.IN_STOCK,
      specifications: {
        capacity: 525,
        doors: 2,
        energyClass: 'A++',
        width: 91.2,
        height: 179,
        depth: 73.8
      },
      features: [
        'Door Cooling+',
        'Linear Cooling',
        'Smart Diagnosis',
        'Fresh Balancer',
        'Multi Air Flow'
      ],
      lastCrawledAt: new Date().toISOString()
    },
    {
      name: 'LG 에어컨 DUAL Inverter S4-Q18KL31A',
      description: '듀얼 인버터 컴프레서로 빠른 냉방과 에너지 효율을 제공하는 벽걸이형 에어컨',
      price: 2999.99,
      currency: 'BRL',
      imageUrls: ['https://example.com/images/s4-q18kl31a.jpg'],
      detailUrl: 'https://www.lge.com/br/air-conditioners/lg-S4Q18KL31A',
      categoryIds: ['appliances', 'air-conditioners'],
      sku: 'S4Q18KL31A',
      brand: 'LG',
      model: 'S4-Q18KL31A',
      availability: ProductAvailability.IN_STOCK,
      specifications: {
        btuCapacity: 18000,
        energyClass: 'A+++',
        noiseLevel: 19,
        coverage: 30
      },
      features: [
        'Dual Inverter Compressor',
        'Low Noise Operation',
        'Smart ThinQ',
        '4-Way Swing',
        '10 Year Warranty'
      ],
      lastCrawledAt: new Date().toISOString()
    },
    {
      name: 'LG 노트북 gram 17Z90P',
      description: '초경량 고성능 노트북',
      price: 7999.99,
      originalPrice: 8999.99,
      discountPercentage: 11.11,
      currency: 'BRL',
      imageUrls: ['https://example.com/images/gram-17z90p.jpg'],
      detailUrl: 'https://www.lge.com/br/laptops/lg-17Z90P',
      categoryIds: ['computers', 'laptops'],
      sku: 'GRAM17Z90P',
      brand: 'LG',
      model: 'gram 17Z90P',
      availability: ProductAvailability.IN_STOCK,
      specifications: {
        screenSize: 17,
        processor: 'Intel Core i7 11세대',
        memory: 16,
        storage: 512,
        weight: 1.35,
        batteryLife: 19.5
      },
      features: [
        'Ultra-Lightweight (1.35kg)',
        'All-day Battery (up to 19.5 hours)',
        'Intel Evo Platform',
        'Thunderbolt 4',
        'Military Grade Durability'
      ],
      lastCrawledAt: new Date().toISOString()
    },
    {
      name: 'LG 스타일러 S3WF',
      description: '옷장 속 의류 관리 솔루션',
      price: 4499.99,
      currency: 'BRL',
      imageUrls: ['https://example.com/images/styler-s3wf.jpg'],
      detailUrl: 'https://www.lge.com/br/styler/lg-S3WF',
      categoryIds: ['appliances', 'clothing-care'],
      sku: 'STYLERS3WF',
      brand: 'LG',
      model: 'S3WF',
      availability: ProductAvailability.OUT_OF_STOCK,
      specifications: {
        capacity: 3,
        width: 44.5,
        height: 185,
        depth: 58.5,
        weight: 83
      },
      features: [
        'TrueSteam Technology',
        'Gentle Drying',
        'Wrinkle Reducer',
        'Odor Removal',
        'Sanitization'
      ],
      lastCrawledAt: new Date().toISOString()
    }
  ];
}

/**
 * 메인 함수
 */
async function main() {
  console.log('스토리지 모듈 사용 예제 시작');

  // 데이터 디렉토리 경로
  const dataDir = path.join(__dirname, '../../data');
  
  // 스토리지 관리자 생성
  const productStorage = new StorageManager<Product>(
    repositoryFactory,
    searchServiceFactory,
    'products',
    {
      repositoryType: RepositoryType.JSON_FILE,
      repositoryOptions: {
        dataDir
      },
      cacheOptions: {
        cacheEnabled: true,
        useMemoryCache: true,
        memoryCacheTtl: 300000, // 5분
        enableLogging: true
      },
      searchServiceType: SearchServiceType.IN_MEMORY,
      searchServiceOptions: {
        searchFields: ['name', 'description', 'features', 'brand', 'model'],
        enableLogging: true
      }
    }
  );

  try {
    // 샘플 제품 데이터 생성
    const sampleProducts = createSampleProducts();
    
    // 제품 데이터 일괄 추가
    console.log(`${sampleProducts.length}개의 샘플 제품 저장 중...`);
    const createdProducts = await productStorage.bulkCreate(sampleProducts);
    console.log(`${createdProducts.length}개의 제품이 저장되었습니다.`);

    // 제품 ID 확인
    const productIds = createdProducts.map(product => product.id);
    console.log('제품 ID 목록:', productIds);

    // 첫 번째 제품 가져오기
    const firstProductId = productIds[0];
    console.log(`제품 ID ${firstProductId} 조회 중...`);
    const product = await productStorage.get(firstProductId);
    console.log('조회된 제품:', product ? product.name : '없음');

    // 두 번째 호출은 캐시에서 가져옴
    console.log(`제품 ID ${firstProductId} 다시 조회 중... (캐시에서))`);
    const cachedProduct = await productStorage.get(firstProductId);
    console.log('캐시에서 조회된 제품:', cachedProduct ? cachedProduct.name : '없음');

    // 가격 변경
    if (product) {
      const updatedProduct = { ...product, price: product.price * 0.9 }; // 10% 할인
      console.log(`제품 ${product.name}의 가격 변경 중...`);
      await productStorage.set(updatedProduct);
      console.log('제품 가격이 변경되었습니다.');
    }

    // 검색 수행
    console.log('검색 수행 중: "OLED TV"');
    const searchResult = await productStorage.search('OLED TV');
    console.log(`검색 결과: ${searchResult.nbHits}개 항목 발견`);
    
    if (searchResult.hits.length > 0) {
      console.log('첫 번째 검색 결과:', searchResult.hits[0].name);
    }

    // 필터링 검색
    console.log('필터링 검색 수행 중: "에어컨"');
    const filteredSearchResult = await productStorage.search('에어컨', {
      filters: 'price:<:3000' // 3000 미만 가격
    });
    
    console.log(`필터링 검색 결과: ${filteredSearchResult.nbHits}개 항목 발견`);
    
    if (filteredSearchResult.hits.length > 0) {
      console.log('필터링 검색 결과:', filteredSearchResult.hits.map(hit => hit.name));
    }

    // 카테고리별 검색
    console.log('카테고리별 검색 수행 중: 노트북');
    const laptopProducts = await productStorage.find({
      categoryIds: ['laptops']
    } as Partial<Product>);
    
    console.log(`카테고리별 검색 결과: ${laptopProducts.length}개 항목 발견`);
    if (laptopProducts.length > 0) {
      console.log('카테고리별 검색 결과:', laptopProducts.map(product => product.name));
    }

    // 캐시 통계 확인
    const cacheStats = productStorage.getCacheStats();
    console.log('캐시 통계:', cacheStats);

    // 제품 삭제
    if (productIds.length > 0) {
      const lastProductId = productIds[productIds.length - 1];
      console.log(`제품 ID ${lastProductId} 삭제 중...`);
      const deleteResult = await productStorage.delete(lastProductId);
      console.log('제품 삭제 결과:', deleteResult ? '성공' : '실패');
    }
  } catch (error) {
    console.error('오류 발생:', error);
  } finally {
    // 리소스 정리
    productStorage.destroy();
    console.log('스토리지 모듈 사용 예제 종료');
  }
}

// 예제 실행
main().catch(console.error);
