// pages/api/health.js - 상태 확인 API 엔드포인트
export default function handler(req, res) {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    services: {
      algolia: process.env.ALGOLIA_APP_ID ? 'configured' : 'not_configured',
      apify: process.env.APIFY_API_TOKEN ? 'configured' : 'not_configured',
      firebase: process.env.FIREBASE_SERVICE_ACCOUNT ? 'configured' : 'not_configured',
      vertexAI: process.env.GOOGLE_CLOUD_PROJECT ? 'configured' : 'not_configured'
    }
  });
}
