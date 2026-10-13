// URL do Web App (Apps Script > Implantar > App da Web). Única configuração do frontend.
const API_URL = 'https://script.google.com/macros/s/AKfycbyPtW1Wk2G6CthUUTCle5kHMpo7QNXkgjggVHieCHNv9dFo6q7Ymy5jC6iRj8ENC9wM/exec';

// Avisos com o app fechado (Firebase Cloud Messaging). Não são segredos: ficam no navegador de qualquer app Firebase.
// Preencha apiKey, messagingSenderId, appId e a chave pública VAPID (Firebase > Configurações do projeto).
const FIREBASE_CFG = {
  projectId: 'app-size-6857f',
  apiKey: 'AIzaSyA-NhdXufRvBfAcnbWMh1pZXjhjimBArac',
  messagingSenderId: '188854873140',
  appId: '1:188854873140:web:551c3b3e5c9e985b1b6e61',
  vapid: 'BCZiC1VJsxGAkzqCqOJdvLRvV38RIhZhi8iHAYeau513ZosnZ0X_rln8X1dXsEdRUCHpmSmxYszcjxkhb-WRH64'
};
