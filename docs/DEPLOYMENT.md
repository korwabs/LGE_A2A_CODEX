# LG 브라질 A2A 쇼핑 어시스턴트 배포 가이드

이 가이드는 LG 브라질 A2A 쇼핑 어시스턴트 프로젝트의 배포 프로세스를 설명합니다. 개발 환경부터 테스트, 스테이징, 프로덕션 환경까지의 전체 배포 워크플로우를 다룹니다.

## 목차

1. [배포 환경](#배포-환경)
2. [전제 조건](#전제-조건)
3. [배포 전 준비 사항](#배포-전-준비-사항)
4. [배포 프로세스](#배포-프로세스)
5. [롤백 절차](#롤백-절차)
6. [모니터링 및 유지 관리](#모니터링-및-유지-관리)
7. [보안 고려 사항](#보안-고려-사항)
8. [문제 해결](#문제-해결)

## 배포 환경

프로젝트는 다음 세 가지 환경으로 배포됩니다:

1. **개발 환경** (Development)
   - 목적: 개발자 테스트 및 새 기능 구현
   - URL: https://dev-shopping-assistant.lge.com/br
   - 인프라: AWS EC2 (t3.medium)

2. **스테이징 환경** (Staging)
   - 목적: QA 테스트 및 사용자 수용 테스트
   - URL: https://stage-shopping-assistant.lge.com/br
   - 인프라: AWS EC2 (t3.large)
  
3. **프로덕션 환경** (Production)
   - 목적: 라이브 사용자 서비스
   - URL: https://shopping-assistant.lge.com/br
   - 인프라: AWS EC2 (m5.xlarge) Auto Scaling Group (2-5 인스턴스)

## 전제 조건

다음 도구 및 서비스 접근 권한이 필요합니다:

1. **AWS CLI**: 올바른 권한으로 구성됨
2. **Node.js**: v18.x 이상
3. **PM2**: 프로세스 관리
4. **Docker**: 컨테이너화 배포 시
5. **Terraform**: 인프라 구성 (선택 사항)
6. **LG 브라질 배포 키**: SSH 액세스용
7. **Third-party 서비스 API 키**:
   - Algolia 액세스 키
   - Gemini AI API 키
   - Intercom 액세스 토큰

## 배포 전 준비 사항

### 1. 환경 구성

각 환경에 맞는 `.env` 파일을 준비합니다:

- `.env.development`
- `.env.staging`
- `.env.production`

환경 변수 예시:

```
# Algolia 설정
ALGOLIA_APP_ID=your-algolia-app-id
ALGOLIA_ADMIN_API_KEY=your-algolia-admin-api-key
ALGOLIA_SEARCH_API_KEY=your-algolia-search-api-key
ALGOLIA_INDEX_NAME=lg_br_products_prod

# Intercom 설정
INTERCOM_APP_ID=your-intercom-app-id
INTERCOM_ACCESS_TOKEN=your-intercom-access-token

# 브라우저 설정
HEADLESS=true
SLOW_MO=10
BROWSER_TIMEOUT=30000

# 크롤링 설정
MAX_RETRIES=5
MAX_CONCURRENCY=10
DATA_DIR=/data/lge-a2a

# LLM 설정
LLM_PROVIDER=google
LLM_MODEL=gemini-pro
LLM_API_KEY=your-production-api-key

# 로깅 설정
LOG_LEVEL=info
LOG_TO_FILE=true
LOG_DIR=/var/log/lge-a2a

# 서버 설정
PORT=3000
NODE_ENV=production
```

### 2. 데이터베이스 구성

**Redis Cache**:
- 개발: Redis 단일 인스턴스
- 스테이징: Redis 단일 인스턴스
- 프로덕션: Redis 클러스터 (ElastiCache)

**데이터 스토리지**:
- 개발/스테이징: 로컬 파일 시스템
- 프로덕션: AWS S3 버킷과 동기화된 EFS

### 3. PM2 생태계 구성

`ecosystem.config.js` 파일 구성:

```javascript
module.exports = {
  apps: [
    {
      name: "lge-a2a-main",
      script: "./server.js",
      instances: "max",
      exec_mode: "cluster",
      watch: false,
      env_development: {
        NODE_ENV: "development",
        PORT: 3000
      },
      env_staging: {
        NODE_ENV: "staging",
        PORT: 3000
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3000
      }
    },
    {
      name: "lge-a2a-crawler",
      script: "./scripts/crawl.js",
      cron_restart: "0 */4 * * *", // 4시간마다 실행
      watch: false,
      autorestart: false,
      env_production: {
        NODE_ENV: "production"
      }
    },
    {
      name: "lge-a2a-updater",
      script: "./scripts/update-products.js",
      cron_restart: "0 */1 * * *", // 1시간마다 실행
      watch: false,
      autorestart: false,
      env_production: {
        NODE_ENV: "production"
      }
    }
  ]
};
```

### 4. 인증서 설정

- 개발/스테이징: Let's Encrypt SSL 인증서
- 프로덕션: LG 엔터프라이즈 SSL 인증서

### 5. 크롤링 초기화

첫 배포 시 최초 크롤링 작업 실행:

```bash
# 크롤링 작업 즉시 실행
node scripts/crawl.js --full --env=production
```

## 배포 프로세스

### Docker 기반 배포 (권장)

1. **Docker 이미지 빌드**

```bash
# 배포 환경 지정하여 빌드
docker build -t lge-a2a-assistant:$(git rev-parse --short HEAD) \
  --build-arg NODE_ENV=production .
```

2. **이미지 태그 및 레지스트리 푸시**

```bash
# 이미지 태그 지정
docker tag lge-a2a-assistant:$(git rev-parse --short HEAD) \
  ${ECR_REGISTRY}/lge-a2a-assistant:$(git rev-parse --short HEAD)

# 최신 태그 추가
docker tag lge-a2a-assistant:$(git rev-parse --short HEAD) \
  ${ECR_REGISTRY}/lge-a2a-assistant:latest

# 레지스트리 푸시
docker push ${ECR_REGISTRY}/lge-a2a-assistant:$(git rev-parse --short HEAD)
docker push ${ECR_REGISTRY}/lge-a2a-assistant:latest
```

3. **배포 구성 업데이트**

```bash
# Kubernetes 또는 ECS 배포 구성 업데이트
kubectl apply -f k8s/production
```

### 기존 서버 배포

1. **소스 코드 배포**

```bash
# 배포 스크립트 실행
./scripts/deploy.sh production
```

또는 수동 배포:

```bash
# 배포할 서버에 연결
ssh deployer@shopping-assistant.lge.com.br

# 애플리케이션 디렉토리로 이동
cd /opt/lge-a2a

# 최신 소스 가져오기
git pull origin main

# 의존성 설치
npm ci --production

# 환경 변수 파일 복사
cp /etc/lge-a2a/.env.production .env

# 서비스 재시작
pm2 reload ecosystem.config.js --env production
```

2. **데이터 디렉토리 준비**

```bash
# 데이터 디렉토리 생성
mkdir -p /data/lge-a2a/cache
mkdir -p /data/lge-a2a/checkout
mkdir -p /data/lge-a2a/products

# 권한 설정
chown -R node:node /data/lge-a2a
```

3. **로그 디렉토리 생성**

```bash
# 로그 디렉토리 생성
mkdir -p /var/log/lge-a2a

# 권한 설정
chown -R node:node /var/log/lge-a2a
```

4. **초기 크롤링 실행**

```bash
# 첫 배포 시 크롤링 실행
cd /opt/lge-a2a
NODE_ENV=production node scripts/crawl.js --full
```

5. **서비스 상태 확인**

```bash
# 서비스 상태 확인
pm2 ls
pm2 logs lge-a2a-main
```

### 블루-그린 배포 (프로덕션)

프로덕션 환경에서는 다운타임 없는 배포를 위해 블루-그린 배포 방식을 사용합니다:

1. **새 환경 프로비저닝**
   - 새로운 인스턴스 그룹 생성 (그린 환경)
   - 새 버전 배포

2. **테스트 및 준비**
   - 그린 환경에서 건강 검사 실행
   - 필요한 데이터 동기화

3. **트래픽 전환**
   - 로드 밸런서 트래픽을 그린 환경으로 점진적 전환
   - 블루 환경의 트래픽 제거

4. **이전 환경 삭제**
   - 안정적인 운영 확인 후 블루 환경 종료

## 롤백 절차

배포 중 문제 발생 시 롤백 절차:

### Docker 기반 배포 롤백

```bash
# 이전 이미지 태그로 배포 구성 업데이트
kubectl rollout undo deployment/lge-a2a-assistant
```

또는 특정 버전으로 롤백:

```bash
# 특정 버전으로 롤백
kubectl set image deployment/lge-a2a-assistant \
  lge-a2a-assistant=${ECR_REGISTRY}/lge-a2a-assistant:${PREVIOUS_VERSION}
```

### 기존 서버 롤백

```bash
# 애플리케이션 디렉토리로 이동
cd /opt/lge-a2a

# 이전 버전 체크아웃
git checkout ${PREVIOUS_VERSION}

# 의존성 설치
npm ci --production

# 서비스 재시작
pm2 reload ecosystem.config.js --env production
```

### 데이터 롤백

중요 데이터는 자동으로 백업되며 롤백이 필요한 경우:

```bash
# S3에서 이전 데이터 복원
aws s3 sync s3://lge-a2a-backup/data-${TIMESTAMP}/ /data/lge-a2a/

# 인덱스 롤백 (Algolia)
node scripts/rollback-index.js --timestamp=${TIMESTAMP}
```

## 모니터링 및 유지 관리

### 1. 모니터링 도구

- **서버 모니터링**: Datadog 또는 CloudWatch
- **애플리케이션 모니터링**: Sentry
- **로그 관리**: ELK Stack (Elasticsearch, Logstash, Kibana)
- **알림**: PagerDuty 연동

### 2. 주요 모니터링 지표

- 서버 리소스 (CPU, 메모리, 디스크)
- API 응답 시간 및 오류율
- 크롤링 성공률 및 성능
- LLM API 호출 볼륨 및 지연 시간
- 사용자 상호작용 메트릭

### 3. 주기적 유지 관리 작업

- **일일**: 
  - 로그 검토
  - 오류 알림 확인
  - 크롤링 작업 성공 확인

- **주간**:
  - 데이터 일관성 확인
  - API 키 밸런스 확인
  - 성능 메트릭 검토

- **월간**:
  - 완전한 데이터 백업
  - 보안 업데이트 적용
  - 용량 계획 검토

### 4. 백업 전략

- **데이터**: 일일 S3 백업
- **구성**: 버전 관리 (git)
- **인덱스**: Algolia 일일 스냅샷

## 보안 고려 사항

### 1. API 키 관리

- 모든 API 키는 AWS Secrets Manager 또는 환경 변수로 관리
- 프로덕션 키는 주기적으로 교체 (분기별)
- 최소 권한 원칙 준수

### 2. 데이터 보안

- 저장 데이터 암호화 (S3 SSE)
- 전송 중 데이터 암호화 (TLS 1.3)
- 개인 식별 정보(PII) 절대 로깅 금지

### 3. 접근 제어

- SSH 접근은 키 기반 인증만 허용
- IP 제한 방화벽 설정
- 역할 기반 접근 제어 구현
- 최소 권한 원칙에 따른 IAM 정책

### 4. 보안 검사

- 주기적 취약점 스캔 실행
- 의존성 보안 감사 (npm audit)
- 침투 테스트 (분기별)

## 문제 해결

### 일반적인 문제 및 해결책

#### 1. 크롤링 실패
- **증상**: 크롤링 작업이 중단되거나 불완전한 데이터 수집
- **해결 방법**:
  - 로그에서 오류 메시지 확인
  - IP 차단 여부 확인
  - 브라우저 헤드리스 모드 비활성화하여 디버깅
  - 재시도 로직 및 지연 시간 증가

```bash
# 디버그 모드로 크롤링 실행
NODE_ENV=production DEBUG=true HEADLESS=false node scripts/crawl.js --category=TV
```

#### 2. 서버 성능 저하
- **증상**: 높은 지연 시간 또는 메모리 사용량
- **해결 방법**:
  - PM2 모니터링으로 병목 식별
  - 메모리 누수 확인
  - 불필요한 캐시 정리
  - Redis 캐시 최적화

```bash
# 메모리 사용량 확인
pm2 monit
```

#### 3. API 할당량 초과
- **증상**: LLM API 오류 또는 검색 서비스 실패
- **해결 방법**:
  - 요청 속도 제한 확인
  - 사용량 모니터링 설정
  - LLM 호출 최적화를 위한 캐싱 검토
  - 백업 API 키로 전환

#### 4. 데이터 불일치
- **증상**: Algolia 인덱스와 크롤링 데이터 간 차이
- **해결 방법**:
  - 데이터 검증 스크립트 실행
  - 인덱스 재구축
  - 캐시 무효화

```bash
# 데이터 검증 실행
node scripts/validate-data.js

# 인덱스 재구축
node scripts/rebuild-index.js
```

### 진단 도구

#### 로그 분석
로그는 `/var/log/lge-a2a` 디렉토리에 저장됩니다:
- `app.log`: 일반 애플리케이션 로그
- `error.log`: 오류 로그
- `crawl.log`: 크롤링 작업 로그
- `access.log`: API 액세스 로그

```bash
# 오류 로그 확인
tail -f /var/log/lge-a2a/error.log

# 패턴 검색
grep "Error: Connection refused" /var/log/lge-a2a/crawl.log

# 최근 크롤링 상태 확인
cat /var/log/lge-a2a/crawl.log | grep "Crawling completed" | tail -n 10
```

#### 시스템 모니터링

```bash
# 시스템 리소스 확인
htop

# 디스크 사용량 확인
df -h

# 네트워크 연결 확인
netstat -tulpn
```

#### 애플리케이션 진단

```bash
# API 상태 확인
curl -I https://shopping-assistant.lge.com/br/api/health

# Redis 연결 테스트
node scripts/test-redis-connection.js

# Algolia 인덱스 상태 확인
node scripts/check-algolia-index.js
```

### 긴급 연락처

문제 해결이 어려운 경우 다음 연락처로 문의하세요:

- **기술 지원팀**: support@lge-a2a-team.com
- **긴급 핫라인**: +55 11 XXXX-XXXX
- **Slack 채널**: #lge-a2a-alerts

## 부록

### A. 배포 체크리스트

배포 전 다음 항목을 확인하세요:

- [ ] 모든 테스트 통과
- [ ] 환경별 구성 확인
- [ ] API 키 유효성 검사
- [ ] 보안 감사 완료
- [ ] 백업 생성
- [ ] 롤백 계획 준비
- [ ] 리소스 요구사항 확인
- [ ] 알림 시스템 테스트

### B. 유용한 스크립트

#### 건강 검사 스크립트

```bash
#!/bin/bash
# health-check.sh

echo "Checking system health..."

# 서버 상태 확인
status_code=$(curl -s -o /dev/null -w "%{http_code}" https://shopping-assistant.lge.com/br/api/health)
if [ $status_code -ne 200 ]; then
  echo "ERROR: API health check failed with status $status_code"
  exit 1
fi

# 크롤링 상태 확인
last_crawl=$(grep "Crawling completed" /var/log/lge-a2a/crawl.log | tail -n 1)
crawl_time=$(echo $last_crawl | awk '{print $1, $2}')
current_time=$(date +"%Y-%m-%d %H:%M:%S")

# 마지막 크롤링이 24시간 이상 지났는지 확인
crawl_seconds=$(date -d "$crawl_time" +%s)
current_seconds=$(date -d "$current_time" +%s)
diff_hours=$(( ($current_seconds - $crawl_seconds) / 3600 ))

if [ $diff_hours -gt 24 ]; then
  echo "WARNING: Last successful crawl was $diff_hours hours ago"
fi

echo "Health check completed."
```

#### 데이터 백업 스크립트

```bash
#!/bin/bash
# backup-data.sh

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/tmp/lge-a2a-backup-$TIMESTAMP"
S3_BUCKET="lge-a2a-backup"

echo "Starting backup process..."

# 로컬 백업 생성
mkdir -p $BACKUP_DIR
cp -r /data/lge-a2a $BACKUP_DIR/
tar -czf "$BACKUP_DIR.tar.gz" $BACKUP_DIR

# S3에 업로드
aws s3 cp "$BACKUP_DIR.tar.gz" "s3://$S3_BUCKET/backups/data-$TIMESTAMP.tar.gz"

# 로컬 백업 정리
rm -rf $BACKUP_DIR
rm "$BACKUP_DIR.tar.gz"

echo "Backup completed and uploaded to S3: s3://$S3_BUCKET/backups/data-$TIMESTAMP.tar.gz"
```

### C. 환경별 구성 참조

#### Nginx 구성 (프로덕션)

```nginx
server {
    listen 80;
    server_name shopping-assistant.lge.com.br;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name shopping-assistant.lge.com.br;

    ssl_certificate /etc/letsencrypt/live/shopping-assistant.lge.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/shopping-assistant.lge.com.br/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers "EECDH+AESGCM:EDH+AESGCM:AES256+EECDH:AES256+EDH";
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    access_log /var/log/nginx/lge-a2a-access.log;
    error_log /var/log/nginx/lge-a2a-error.log;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90;
    }

    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /static/ {
        alias /opt/lge-a2a/public/;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000";
    }
}
```

#### 로드 밸런서 구성 (AWS)

```hcl
# Terraform 구성 예시
resource "aws_lb" "lge_a2a_lb" {
  name               = "lge-a2a-lb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.lb_sg.id]
  subnets            = [aws_subnet.public_a.id, aws_subnet.public_b.id]

  enable_deletion_protection = true

  tags = {
    Environment = "production"
    Project     = "lge-a2a-assistant"
  }
}

resource "aws_lb_target_group" "lge_a2a_target" {
  name     = "lge-a2a-target"
  port     = 3000
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id

  health_check {
    enabled             = true
    interval            = 30
    path                = "/api/health"
    port                = "traffic-port"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    protocol            = "HTTP"
    matcher             = "200"
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.lge_a2a_lb.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS-1-2-2017-01"
  certificate_arn   = aws_acm_certificate.lge_a2a_cert.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.lge_a2a_target.arn
  }
}
```

## 추가 정보

- 이 배포 가이드는 LG 브라질 A2A 쇼핑 어시스턴트 v1.0.0 이상에 적용됩니다.
- 문서 최종 업데이트: 2025년 5월 20일
- 작성자: LG A2A 개발팀