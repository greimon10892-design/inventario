const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDLk5Gu-wY7kb9MdR5UIBtbgJTyFUGAtnA",
    authDomain: "gestor-de-inventario-853d8.firebaseapp.com",
    projectId: "gestor-de-inventario-853d8",
    storageBucket: "gestor-de-inventario-853d8.firebasestorage.app",
    messagingSenderId: "980977651129",
    appId: "1:980977651129:web:791dd31e9b2825c4d57a68"
};
const FB_SCRIPTS = [
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js'
];
async function initFirebase(callbacks) {
    for (const src of FB_SCRIPTS) {
        await new Promise(r => { const s = document.createElement('script'); s.src = src; s.onload = r; document.head.appendChild(s); });
    }
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    firebase.auth().onAuthStateChanged(user => {
        if (!user) { showLoginUI(); }
        else {
            if (window.removeLoginUI) removeLoginUI();
            ['products', 'movements'].forEach(col => {
                firebase.firestore().collection(col).onSnapshot(snap => {
                    const data = snap.docs.map(d => ({id: d.id, ...d.data()}));
                    if (callbacks.onData) callbacks.onData(col, data);
                });
            });
            if (callbacks.onUser) callbacks.onUser(user);
        }
    });
}
function showLoginUI() {
    if (document.getElementById('login-screen')) return;
    document.body.style.visibility = 'visible';
    const ui = `<div id="login-screen" style="position:fixed;inset:0;background:#141414;display:flex;align-items:center;justify-content:center;z-index:9999;"><div style="background:#1e1e1e;padding:30px;border-radius:12px;width:300px;text-align:center;"><h2 style="color:white">TALARA</h2><input id="l-email" placeholder="Email" style="width:100%;margin-bottom:10px;padding:10px;"><input id="l-pass" type="password" placeholder="Contraseña" style="width:100%;margin-bottom:20px;padding:10px;"><button onclick="handleLogin()" style="width:100%;padding:10px;background:#e07b39;border:none;color:white;cursor:pointer;">Entrar</button></div></div>`;
    document.body.insertAdjacentHTML('beforeend', ui);
}
window.handleLogin = () => {
    const email = document.getElementById('l-email').value;
    const pass = document.getElementById('l-pass').value;
    firebase.auth().signInWithEmailAndPassword(email, pass).catch(e => alert(e.message));
};
window.removeLoginUI = () => { const el = document.getElementById('login-screen'); if (el) el.remove(); document.body.style.visibility = 'visible'; };
window.fbLogout = () => firebase.auth().signOut();