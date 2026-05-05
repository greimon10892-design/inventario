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
        await new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) return resolve();
            const s = document.createElement('script');
            s.src = src; s.onload = resolve; s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    const auth = firebase.auth();
    const db = firebase.firestore();

    auth.onAuthStateChanged(user => {
        if (!user) {
            showLoginUI();
        } else {
            removeLoginUI();
            ['products', 'movements', 'users'].forEach(col => {
                db.collection(col).onSnapshot(snap => {
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
    const ui = `
    <div id="login-screen" style="position:fixed;inset:0;background:#141414;display:flex;align-items:center;justify-content:center;z-index:9999;">
        <div style="background:#1e1e1e;border:1px solid #2e2e2e;border-radius:12px;padding:32px;width:100%;max-width:360px;">
            <h2 style="color:#e07b39;margin:0 0 4px;">KIRO</h2>
            <p style="color:#7a7570;margin:0 0 24px;font-size:13px;">Gestor de Inventario</p>
            <div id="login-error" style="display:none;color:#ef4444;margin-bottom:15px;font-size:13px;"></div>
            <input id="l-email" type="email" placeholder="Correo" style="width:100%;margin-bottom:12px;box-sizing:border-box;padding:10px;background:#252525;border:1px solid #2e2e2e;color:white;border-radius:8px;">
            <input id="l-pass" type="password" placeholder="Contraseña" style="width:100%;margin-bottom:20px;box-sizing:border-box;padding:10px;background:#252525;border:1px solid #2e2e2e;color:white;border-radius:8px;">
            <button onclick="handleLogin()" style="width:100%;padding:12px;background:#e07b39;border:none;border-radius:8px;color:white;font-weight:600;cursor:pointer;">Entrar</button>
            <p style="text-align:center;color:#7a7570;font-size:12px;margin-top:15px;cursor:pointer;" onclick="handleRegister()">Crear una cuenta nueva</p>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', ui);
}

function removeLoginUI() {
    const el = document.getElementById('login-screen');
    if (el) el.remove();
}

window.handleLogin = () => {
    const email = document.getElementById('l-email').value;
    const pass = document.getElementById('l-pass').value;
    firebase.auth().signInWithEmailAndPassword(email, pass).catch(e => {
        const err = document.getElementById('login-error');
        err.textContent = "Error: " + e.message;
        err.style.display = 'block';
    });
};

window.handleRegister = () => {
    const email = document.getElementById('l-email').value;
    const pass = document.getElementById('l-pass').value;
    if (pass.length < 6) return alert("Contraseña muy corta");
    firebase.auth().createUserWithEmailAndPassword(email, pass).then(cred => {
        return firebase.firestore().collection('users').doc(cred.user.uid).set({
            id: cred.user.uid, email, role: 'Admin', createdAt: new Date().toISOString()
        });
    }).catch(e => alert(e.message));
};

window.fbLogout = () => firebase.auth().signOut();
window.fbSaveItem = (col, item) => firebase.firestore().collection(col).doc(item.id).set(item);
window.fbDeleteItem = (col, id) => firebase.firestore().collection(col).doc(id).delete();
