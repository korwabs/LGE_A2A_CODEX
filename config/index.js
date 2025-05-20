/**
 * 설정 로더
 * 환경에 따라 적절한 설정 파일을 로드
 */
const defaultConfig = require('./default');
const developmentConfig = require('./development');
const productionConfig = require('./production');

// 환경 변수에 따라 설정 로드
let config;
switch(process.env.NODE_ENV) {
  case 'production':
    config = productionConfig;
    break;
  case 'development':
    config = developmentConfig;
    break;
  default:
    config = developmentConfig;
}

module.exports = config;
