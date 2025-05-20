/**
 * Logger - 로깅 유틸리티
 */
const winston = require('winston');

// 로그 포맷 정의
const logFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  
  // 메타데이터가 있으면 추가
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  
  return msg;
});

// 로거 설정
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize(),
    logFormat
  ),
  transports: [
    // 콘솔 출력
    new winston.transports.Console(),
    // 파일 출력
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      // 파일이 존재하지 않으면 생성
      dirname: 'logs',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      // 파일이 존재하지 않으면 생성
      dirname: 'logs',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  ]
});

// development 환경에서는 상세 로깅
if (process.env.NODE_ENV !== 'production') {
  logger.level = 'debug';
}

module.exports = logger;
