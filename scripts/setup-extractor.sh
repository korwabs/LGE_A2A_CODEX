#!/bin/bash

# LG 브라질 A2A 쇼핑 어시스턴트 패키지 설치 스크립트
echo "LG 브라질 A2A 쇼핑 어시스턴트 패키지 설치 스크립트"
echo "====================================================="

# 필요한 패키지 설치
echo "필요한 패키지 설치 중..."
npm install cheerio@^1.0.0-rc.12 crypto@^1.0.1 openai@^4.25.0 @anthropic-ai/sdk@^0.11.0

# 디렉토리 구조 확인
echo "디렉토리 구조 확인 중..."
mkdir -p data/cache/extractions
mkdir -p data/cache/llm
mkdir -p logs

# 환경변수 설정 확인
echo "환경변수 설정 확인 중..."
if [ ! -f .env ]; then
  echo "환경변수 설정 파일(.env)이 없습니다. .env.example을 복사하여 생성합니다."
  cp .env.example .env
  echo ".env 파일이 생성되었습니다. 파일을 열어 실제 API 키와 설정 값으로 업데이트해주세요."
else
  echo ".env 파일이 이미 존재합니다."
  echo "필요한 경우 .env.example 파일을 참고하여 새로 추가된 환경변수를 업데이트해주세요."
fi

echo "설치 완료!"
echo "⚠️  중요: .env 파일에 필요한 API 키를 설정했는지 확인하세요."
echo "다음 명령어로 지능형 추출기 테스트를 실행하세요:"
echo "npm run test:extract"
