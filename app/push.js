/* Avisos no aparelho com o app fechado (Firebase Cloud Messaging).
 * O app só pede permissão e registra o "endereço" do aparelho no servidor; quem recebe e mostra o aviso é o sw.js.
 * A biblioteca do Firebase só é baixada (do gstatic) quando a pessoa ativa os avisos ou já os tinha ativado. */
const PUSH = { versao: '10.12.2', lib: null };
const pushPossivel = () => !!(FIREBASE_CFG.apiKey && FIREBASE_CFG.vapid && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
const pushLigado = () => !!LS.get('cs_fcm_on') && 'Notification' in window && Notification.permission === 'granted';

function pushCarregar() {
  if (PUSH.lib) return PUSH.lib;
  const js = n => new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = `https://www.gstatic.com/firebasejs/${PUSH.versao}/${n}.js`;
    s.onload = ok; s.onerror = () => no(new Error('Não foi possível carregar o serviço de avisos. Verifique a internet.'));
    document.head.appendChild(s);
  });
  return (PUSH.lib = js('firebase-app-compat').then(() => js('firebase-messaging-compat')).then(() => {
    if (!firebase.apps.length) firebase.initializeApp({ apiKey: FIREBASE_CFG.apiKey, projectId: FIREBASE_CFG.projectId, messagingSenderId: FIREBASE_CFG.messagingSenderId, appId: FIREBASE_CFG.appId });
    return firebase.messaging();
  }).catch(e => { PUSH.lib = null; throw e; }));
}
async function pushToken() {
  const m = await pushCarregar(), reg = await navigator.serviceWorker.ready;
  const t = await m.getToken({ vapidKey: FIREBASE_CFG.vapid, serviceWorkerRegistration: reg });
  if (!t) throw new Error('Este aparelho não conseguiu ativar os avisos.');
  return t;
}
async function pushRegistrar(tok) {
  await api('push_registrar', { fcm: tok, ids: (NOTIF.itens || []).map(i => i.id), ua: navigator.userAgent });
  LS.set('cs_fcm', tok);
}
async function pushAtivar() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Os avisos do aparelho não foram permitidos.');
  const tok = await pushToken();
  await pushRegistrar(tok);
  LS.set('cs_fcm_on', '1');
}
async function pushDesativar() {
  const tok = LS.get('cs_fcm');
  LS.del('cs_fcm_on'); LS.del('cs_fcm');
  if (tok) { try { await api('push_remover', { fcm: tok }); } catch (e) { /* o servidor limpa sozinho aparelhos que não respondem */ } }
  try { const m = await pushCarregar(); await m.deleteToken(); } catch (e) { /* ignora */ }
}
/* a cada abertura (e a cada pessoa que entra no aparelho) confirma que o endereço do aparelho está registrado em nome de quem está logado */
async function pushSincronizar() {
  if (!pushPossivel() || !pushLigado() || !S.token) return;
  try {
    const tok = await pushToken();
    if (tok !== LS.get('cs_fcm_reg') + '' || LS.get('cs_fcm_u') !== String(S.sess.usuario.id)) {
      await pushRegistrar(tok);
      LS.set('cs_fcm_reg', tok); LS.set('cs_fcm_u', String(S.sess.usuario.id));
    }
  } catch (e) { /* tenta de novo na próxima abertura */ }
}
