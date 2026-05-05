// ── Firebase Config ───────────────────────────────────────────────────────────
var FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDLk5Gu-wY7kb9MdR5UIBtbgJTyFUGAtnA",
  authDomain:        "gestor-de-inventario-853d8.firebaseapp.com",
  projectId:         "gestor-de-inventario-853d8",
  storageBucket:     "gestor-de-inventario-853d8.firebasestorage.app",
  messagingSenderId: "980977651129",
  appId:             "1:980977651129:web:791dd31e9b2825c4d57a68"
};

var _fbAuth = null;
var _fbDb   = null;
var _fbCbs  = {};
var _unsubs = [];

var FB_SCRIPTS = [
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js'
];

function loadScript(src) {
  return new Promise(function(resolve, reject) {
    if (document.querySelector('script[src="' + src + '"]')) { resolve(); return; }
    var s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

function showLoginUI() {
  document.body.insertAdjacentHTML('beforeend',
    '<div id="login-screen" style="position:fixed;inset:0;background:#141414;display:flex;align-items:center;justify-content:center;z-index:9999;font-family:Inter,sans-serif">' +
    '<div style="background:#1e1e1e;border:1px solid #2e2e2e;border-radius:12px;padding:32px;width:100%;max-width:360px;margin:16px">' +
    '<h2 style="color:#f0ece6;margin:0 0 4px;font-size:22px">TALARA</h2>' +
    '<p style="color:#7a7570;margin:0 0 24px;font-size:13px">Gestor de Inventario</p>' +
    '<div id="login-error" style="display:none;background:#c0392b22;color:#e74c3c;border:1px solid #c0392b44;border-radius:6px;padding:10px 12px;margin-bottom:16px;font-size:13px"></div>' +
    '<input id="login-email" type="email" placeholder="Correo electrónico (Gmail)" autocomplete="email" style="width:100%;box-sizing:border-box;padding:11px 14px;background:#252525;border:1px solid #2e2e2e;border-radius:8px;color:#f0ece6;font-size:15px;margin-bottom:12px;outline:none">' +
    '<input id="login-pass" type="password" placeholder="Contraseña (solo para esta app)" autocomplete="current-password" style="width:100%;box-sizing:border-box;padding:11px 14px;background:#252525;border:1px solid #2e2e2e;border-radius:8px;color:#f0ece6;font-size:15px;margin-bottom:8px;outline:none">' +
    '<p style="color:#7a7570;font-size:11px;margin:0 0 16px">⚠️ Esta contraseña es exclusiva para esta app, no uses tu contraseña de Gmail.</p>' +
    '<button id="login-btn" style="width:100%;padding:12px;background:#e07b39;border:none;border-radius:8px;color:#fff;font-size:15px;font-weight:600;cursor:pointer;margin-bottom:10px">Iniciar sesión</button>' +
    '<button id="register-btn" style="width:100%;padding:12px;background:transparent;border:1px solid #2e2e2e;border-radius:8px;color:#f0ece6;font-size:14px;cursor:pointer">Crear cuenta nueva</button>' +
    '<p style="color:#7a7570;font-size:11px;text-align:center;margin:12px 0 0">El primer usuario registrado será Admin automáticamente.</p>' +
    '</div></div>');

  var errEl   = document.getElementById('login-error');
  var emailEl = document.getElementById('login-email');
  var passEl  = document.getElementById('login-pass');
  var loginBtn= document.getElementById('login-btn');
  var regBtn  = document.getElementById('register-btn');

  function showError(msg) { errEl.textContent = msg; errEl.style.display = 'block'; }

  loginBtn.addEventListener('click', function() {
    var email = emailEl.value.trim(), pass = passEl.value;
    if (!email || !pass) { showError('Completa todos los campos'); return; }
    loginBtn.textContent = 'Entrando...'; loginBtn.disabled = true;
    _fbAuth.signInWithEmailAndPassword(email, pass).catch(function(e) {
      loginBtn.textContent = 'Iniciar sesión'; loginBtn.disabled = false;
      var msgs = {
        'auth/user-not-found':'Correo no registrado',
        'auth/wrong-password':'Contraseña incorrecta',
        'auth/invalid-credential':'Credenciales inválidas',
        'auth/too-many-requests':'Demasiados intentos. Espera un momento.',
        'auth/invalid-email':'Correo inválido'
      };
      showError(msgs[e.code] || e.message);
    });
  });

  regBtn.addEventListener('click', function() {
    var email = emailEl.value.trim(), pass = passEl.value;
    if (!email || !pass) { showError('Completa todos los campos'); return; }
    if (pass.length < 6) { showError('La contraseña debe tener al menos 6 caracteres'); return; }
    regBtn.textContent = 'Creando cuenta...'; regBtn.disabled = true;
    _fbAuth.createUserWithEmailAndPassword(email, pass).then(function(cred) {
      var uid = cred.user.uid;
      return _fbDb.collection('users').get().then(function(snap) {
        var role = snap.empty ? 'Admin' : 'Usuario';
        return _fbDb.collection('users').doc(uid).set({
          id:uid, name:email.split('@')[0], email:email,
          role:role, createdAt:new Date().toISOString()
        });
      });
    }).catch(function(e) {
      regBtn.textContent = 'Crear cuenta nueva'; regBtn.disabled = false;
      var msgs = {
        'auth/email-already-in-use':'Ese correo ya está registrado',
        'auth/weak-password':'Contraseña muy débil (mínimo 6 caracteres)',
        'auth/invalid-email':'Correo inválido',
        'auth/permission-denied':'Error de permisos. Verifica las reglas de Firestore.'
      };
      showError(msgs[e.code] || e.message);
    });
  });

  [emailEl, passEl].forEach(function(el) {
    el.addEventListener('keydown', function(e) { if (e.key === 'Enter') loginBtn.click(); });
  });

  if (typeof hideSplash === 'function') hideSplash();
  document.body.style.visibility = 'visible';
}

function removeLoginUI() {
  var el = document.getElementById('login-screen');
  if (el) el.remove();
}

function initFirebase(callbacks) {
  _fbCbs = callbacks || {};
  var p = Promise.resolve();
  FB_SCRIPTS.forEach(function(src) { p = p.then(function() { return loadScript(src); }); });
  p.then(function() {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    _fbAuth = firebase.auth();
    _fbDb   = firebase.firestore();

    _fbAuth.onAuthStateChanged(function(user) {
      if (!user) {
        _unsubs.forEach(function(fn){ fn(); }); _unsubs = [];
        removeLoginUI();
        showLoginUI();
        return;
      }
      removeLoginUI();
      ['products','movements','users'].forEach(function(col) {
        var unsub = _fbDb.collection(col).onSnapshot(function(snap) {
          var data = snap.docs.map(function(d){ return d.data(); });
          if (_fbCbs.onData) _fbCbs.onData(col, data);
        }, function(err) { console.warn('Firestore '+col+':', err.message); });
        _unsubs.push(unsub);
      });
      _fbDb.collection('settings').doc(user.uid).get().then(function(doc) {
        if (doc.exists && _fbCbs.onSettings) _fbCbs.onSettings(user.uid, doc.data());
      }).catch(function(){});
      if (_fbCbs.onUser) _fbCbs.onUser(user);
    });
  }).catch(function(err) {
    console.error('Firebase load error:', err);
    if (typeof hideSplash === 'function') hideSplash();
  });
}

function fbSaveItem(col, item) {
  if (!_fbDb) return Promise.resolve();
  return _fbDb.collection(col).doc(item.id).set(item);
}
function fbDeleteItem(col, id) {
  if (!_fbDb) return Promise.resolve();
  return _fbDb.collection(col).doc(id).delete();
}
function fbSaveSettings(uid, settings) {
  if (!_fbDb) return Promise.resolve();
  var safe = Object.assign({}, settings);
  if (safe.logoData        && safe.logoData.length        > 133000) delete safe.logoData;
  if (safe.logoMobileData  && safe.logoMobileData.length  > 133000) delete safe.logoMobileData;
  delete safe.bgData;
  return _fbDb.collection('settings').doc(uid).set(safe);
}
function fbLogout() {
  if (!_fbAuth) return;
  _fbAuth.signOut();
}
