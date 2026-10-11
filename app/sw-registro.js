// registra o service worker (fica em arquivo próprio para a política de segurança do navegador não precisar liberar script inline)
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
