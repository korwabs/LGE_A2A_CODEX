/**
 * API 서버 설정
 */
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');

// 환경 변수 로드
dotenv.config();

// 라우터 가져오기
const dialogRouter = require('./routes/dialog');
const productRouter = require('./routes/product');
const cartRouter = require('./routes/cart');
const sessionRouter = require('./routes/session');

// Express 앱 생성
const app = express();

// 미들웨어 설정
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "*.lge.com"],
      connectSrc: ["'self'", "*.lge.com", "*.algolia.net", "*.intercom.io"],
      imgSrc: ["'self'", "data:", "*.lge.com", "*.cloudfront.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "*.lge.com"],
      fontSrc: ["'self'", "data:", "*.lge.com", "*.cloudfront.net"],
      frameSrc: ["'self'", "*.lge.com", "*.youtube.com"]
    }
  }
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(morgan('combined'));

// 기본 경로
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'LG 브라질 A2A 쇼핑 어시스턴트 API'
  });
});

// 라우터 설정
app.use('/api/dialog', dialogRouter);
app.use('/api/products', productRouter);
app.use('/api/cart', cartRouter);
app.use('/api/session', sessionRouter);

// 에러 핸들러
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: process.env.NODE_ENV === 'production' ? '서버 오류가 발생했습니다.' : err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
  });
});

// 서버 시작
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});

module.exports = app;
