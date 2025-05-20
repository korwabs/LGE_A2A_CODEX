// firebase.config.js - Firebase 설정
// 이 파일은 실제 배포에서는 사용되지 않습니다.
// 실제 배포에서는 환경 변수에서 Firebase 구성을 불러옵니다.
// 이 파일은 로컬 개발 환경에서 테스트 목적으로만 사용됩니다.

module.exports = {
  type: "service_account",
  project_id: "lg-brazil-shopping-assistant",
  private_key_id: "YOUR_PRIVATE_KEY_ID", // 실제 키로 대체
  private_key: "YOUR_PRIVATE_KEY", // 실제 키로 대체
  client_email: "firebase-adminsdk@lg-brazil-shopping-assistant.iam.gserviceaccount.com", // 실제 이메일로 대체
  client_id: "YOUR_CLIENT_ID", // 실제 ID로 대체
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk%40lg-brazil-shopping-assistant.iam.gserviceaccount.com", // 실제 URL로 대체
  universe_domain: "googleapis.com"
};
