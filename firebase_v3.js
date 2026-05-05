const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDLk5Gu-wY7kb9MdR5UIBtbgJTyFUGAtnA",
    authDomain: "gestor-de-inventario-853d8.firebaseapp.com",
    projectId: "gestor-de-inventario-853d8",
    storageBucket: "gestor-de-inventario-853d8.firebasestorage.app",
    messagingSenderId: "980977651129",
    appId: "1:980977651129:web:791dd31e9b2825c4d57a68"
};
const scripts = [
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js'
];
async function initFirebase(cb) {
    for (const s of scripts) {
        await new Promise(r => { const t = document.createElement('script'); t.src = s; t.onload = r; document.head.appendChild(t); });
    }
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    firebase.auth().onAuthStateChanged(user => {
        // ESTA LÍNEA ES LA MAGIA: Quita el "Cargando" en cuanto Firebase responde
        document.getElementById('splash').style.display = 'none';
        document.body.style.visibility = 'visible';

        if (!user) { 
            showLogin(); 
        } else {
            document.getElementById('login-screen')?.remove();
            firebase.firestore().collection('products').onSnapshot(s => {
                const data = s.docs.map(d => ({id: d.id, ...d.data()}));
                cb.onData('products', data);
            });
        }
    });
}
function showLogin() {
    if (document.getElementById('login-screen')) return;
    const ui = `<div id="login-screen" style="position:fixed;inset:0;background:#141414;display:flex;justify-content:center;align-items:center;z-index:9999;"><div style="background:#1e1e1e;padding:40px;border-radius:15px;text-align:center;"><h2>Entrar a KIRO</h2><input id="em" placeholder="Email" style="display:block;width:100%;margin-bottom:10px;padding:10px;background:#252525;border:1px solid #2e2e2e;color:white;border-radius:8px;"><input id="pw" type="password" placeholder="Contraseña" style="display:block;width:100%;margin-bottom:20px;padding:10px;background:#252525;border:1px solid #2e2e2e;color:white;border-radius:8px;"><button onclick="L()" style="width:100%;padding:12px;background:#e07b39;border:none;color:white;font-weight:600;border-radius:8px;cursor:pointer;">Entrar</button></div></div>`;
    document.body.insertAdjacentHTML('beforeend', ui);
}
window.L = () => firebase.auth().signInWithEmailAndPassword(document.getElementById('em').value, document.getElementById('pw').value).catch(e => alert("Error: " + e.message));
window.fbLogout = () => firebase.auth().signOut().then(() => location.reload());
