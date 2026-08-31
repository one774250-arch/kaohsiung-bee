// 自動偵測後端網址
// 本機開發時用 localhost:5000
// 部署後自動使用當前網址（因為前後端由同一個 Flask 服務提供）
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://127.0.0.1:5000'
  : window.location.origin;
