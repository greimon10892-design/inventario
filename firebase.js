// ── Firebase — Sincronización completa en tiempo real ─────────────────────

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDLk5Gu-wY7kb9MdR5UIBtbgJTyFUGAtnA",
  authDomain:        "gestor-de-inventario-853d8.firebaseapp.com",
  projectId:         "gestor-de-inventario-853d8",
  storageBucket:     "gestor-de-inventario-853d8.firebasestorage.app",
  messagingSenderId: "980977651129",
  appId:             "1:980977651129:web:791dd31e9b2825c4d57a68"
};

let db      = null;
let fbAuth  = null;
let _fb     = null;
let _fa     = null;
let _fs     = null;
let _listeners = [];

// ── Inicializa Firebase ────────────────────────────────────────────────────
async function initFirebase() {
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
    _fb = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    _fa = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');

    const app = initializeApp(FIREBASE_CONFIG);
    db     = _fb.getFirestore(app);
    fbAuth = _fa.getAuth(app);

    showSyncStatus('connecting');

    _fa.onAuthStateChanged(fbAuth, user => {
      // Siempre muestra el body cuando Firebase responde
      document.body.style.visibility = 'visible';
      if (user) { onUserSignedIn(user); }
      else      { stopListeners(); hideSplash(); showLoginScreen(); }
    });

    return true;
  } catch (err) {
    console.error('[Firebase]', err);
    showSyncStatus('error');
    // Reintenta inicializar después de 8 segundos
    setTimeout(() => initFirebase(), 8000);
    return false;
  }
}

// ── Usuario autenticado ────────────────────────────────────────────────────
async function onUserSignedIn(fbUser) {
  showSyncStatus('connecting');
  try {
    // Busca o crea perfil
    const snap = await _fb.getDocs(
      _fb.query(_fb.collection(db, 'users'), _fb.where('email', '==', fbUser.email))
    );
    if (snap.empty) {
      const allUsers = await _fb.getDocs(_fb.collection(db, 'users'));
      const me = {
        id:    fbUser.uid,
        name:  fbUser.displayName || fbUser.email.split('@')[0],
        email: fbUser.email,
        role:  allUsers.empty ? 'Admin' : 'Usuario',
        date:  new Date().toISOString()
      };
      await fbSet('users', me);
    }

    // Seed productos si está vacío
    const pSnap = await _fb.getDocs(_fb.collection(db, 'products'));
    if (pSnap.empty) {
      for (const p of SEED_PRODUCTS) await fbSet('products', p);
    }

    // Inicia escuchas en tiempo real
    startListeners(fbUser);

    hideLoginScreen();
    showSyncStatus('online');
    if (typeof hideSplash === 'function') hideSplash();

  } catch (err) {
    console.error('[onUserSignedIn]', err);
    showSyncStatus('error');
    // Reintenta la conexión después de 5 segundos
    setTimeout(() => {
      if (fbAuth && fbAuth.currentUser) {
        console.log('[Firebase] Reintentando conexión…');
        onUserSignedIn(fbAuth.currentUser);
      }
    }, 5000);
  }
}

// ── Escuchas en tiempo real ────────────────────────────────────────────────
function startListeners(fbUser) {
  stopListeners();

  // Productos
  _listeners.push(
    _fb.onSnapshot(_fb.collection(db, 'products'), snap => {
      products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderAll();
      const vv = document.getElementById('view-ventas');
      if (vv && !vv.classList.contains('hidden')) renderSaleProductList();
    })
  );

  // Movimientos
  _listeners.push(
    _fb.onSnapshot(_fb.collection(db, 'movements'), snap => {
      movements = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderAll();
    })
  );

  // Usuarios
  _listeners.push(
    _fb.onSnapshot(_fb.collection(db, 'users'), snap => {
      users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const me = users.find(u => u.email === fbUser.email);
      if (me) {
        activeUserId = me.id;
        window._currentUserRole = me.role;
        localStorage.setItem('inv_active_user', me.id);
      }
      renderAll();
    })
  );

  // Ajustes del usuario actual (por uid de Firebase)
  const settingsDocRef = _fb.doc(db, 'settings', fbUser.uid);
  _listeners.push(
    _fb.onSnapshot(settingsDocRef, snap => {
      if (snap.exists()) {
        const data = snap.data();
        // Guarda en localStorage para acceso rápido
        localStorage.setItem('inv_settings_' + fbUser.uid, JSON.stringify(data));
        activeUserId = fbUser.uid;
        // Aplica ajustes en tiempo real
        applySettings({ ...DEFAULTS, ...data });
        // Actualiza UI de ajustes si está abierta
        const va = document.getElementById('view-ajustes');
        if (va && !va.classList.contains('hidden')) loadSettingsUI();
      }
    })
  );

  // Navega al panel después de que lleguen los primeros datos
  setTimeout(() => {
    applySettings();
    loadSettingsUI();
    navigate('panel');
  }, 600);
}

function stopListeners() {
  _listeners.forEach(u => u());
  _listeners = [];
}

// ── Guardar ajustes en Firestore ───────────────────────────────────────────
async function fbSaveSettings(userId, data) {
  if (!db || !_fb) return;
  await _fb.setDoc(_fb.doc(db, 'settings', userId), data, { merge: true });
}

// ── CRUD Firestore ─────────────────────────────────────────────────────────
async function fbSet(colName, item) {
  if (!db || !_fb) return;
  const { id, ...data } = item;
  await _fb.setDoc(_fb.doc(db, colName, id), data);
}

async function fbDelete(colName, id) {
  if (!db || !_fb) return;
  await _fb.deleteDoc(_fb.doc(db, colName, id));
}

// ── Auth ───────────────────────────────────────────────────────────────────
async function fbSignIn(email, password) {
  return _fa.signInWithEmailAndPassword(fbAuth, email, password);
}
async function fbSignUp(email, password) {
  return _fa.createUserWithEmailAndPassword(fbAuth, email, password);
}
async function fbSignOut() {
  stopListeners();
  await _fa.signOut(fbAuth);
}

// ── Pantalla de Login ──────────────────────────────────────────────────────
function showLoginScreen() {
  let el = document.getElementById('login-screen');
  if (!el) {
    el = document.createElement('div');
    el.id = 'login-screen';
    el.innerHTML = `
      <div class="login-box">
        <div class="login-brand">
          <span class="brand-title">Inventario</span>
          <span class="brand-sub">Dulces &amp; Pulseras</span>
        </div>
        <div id="login-error" class="login-error hidden"></div>
        <div class="form-group" style="margin-bottom:12px">
          <label>Tu correo Gmail</label>
          <input type="email" id="login-email" placeholder="tucorreo@gmail.com" autocomplete="email" />
        </div>
        <div class="form-group" style="margin-bottom:12px">
          <label>Contraseña de esta app</label>
          <input type="password" id="login-password" placeholder="Ingresa tu contraseña" autocomplete="current-password" />
        </div>
        <button class="btn-primary" id="login-btn" style="width:100%">Entrar</button>
        <p class="login-hint">¿Primera vez? <a href="#" id="show-register">Crear cuenta</a></p>
        <div id="register-section" style="display:none;margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
          <p style="font-size:0.78rem;color:var(--muted);margin-bottom:12px;line-height:1.5">
            Usa tu correo Gmail y crea una contraseña exclusiva para esta app.<br>
            <strong style="color:var(--orange)">No es tu contraseña de Gmail.</strong>
          </p>
          <div class="form-group" style="margin-bottom:12px">
            <label>Tu nombre completo</label>
            <input type="text" id="reg-name" placeholder="Ej: Roberto Falfán" />
          </div>
          <div class="form-group" style="margin-bottom:12px">
            <label>Nueva contraseña para esta app</label>
            <input type="password" id="reg-password2" placeholder="Mínimo 6 caracteres" autocomplete="new-password" />
          </div>
          <button class="btn-primary" id="register-btn" style="width:100%">Crear cuenta</button>
        </div>
        <p style="font-size:0.7rem;color:var(--muted);text-align:center;margin-top:16px;line-height:1.4">
          Tu contraseña de Gmail <strong>no se comparte</strong> con esta app.
        </p>
      </div>`;
    document.body.appendChild(el);

    // ── Login
    document.getElementById('login-btn').addEventListener('click', async () => {
      const email = document.getElementById('login-email').value.trim();
      const pass  = document.getElementById('login-password').value;
      if (!email || !pass) { loginErr('Completa todos los campos.'); return; }
      const btn = document.getElementById('login-btn');
      btn.textContent = 'Entrando…'; btn.disabled = true;
      try {
        await fbSignIn(email, pass);
      } catch(e) {
        btn.textContent = 'Entrar'; btn.disabled = false;
        loginErr(authMsg(e.code));
      }
    });

    // ── Mostrar/ocultar registro
    document.getElementById('show-register').addEventListener('click', e => {
      e.preventDefault();
      const s = document.getElementById('register-section');
      s.style.display = s.style.display === 'none' ? 'block' : 'none';
      document.getElementById('show-register').textContent =
        s.style.display === 'none' ? 'Crear cuenta' : 'Cancelar';
    });

    // ── Registro
    document.getElementById('register-btn').addEventListener('click', async () => {
      const email = document.getElementById('login-email').value.trim();
      const pass  = document.getElementById('reg-password2').value;
      const name  = document.getElementById('reg-name').value.trim();
      if (!email || !pass || !name) { loginErr('Completa todos los campos.'); return; }
      if (pass.length < 6) { loginErr('La contraseña debe tener mínimo 6 caracteres.'); return; }
      const btn = document.getElementById('register-btn');
      btn.textContent = 'Creando cuenta…'; btn.disabled = true;
      try {
        const cred    = await fbSignUp(email, pass);
        const allSnap = await _fb.getDocs(_fb.collection(db, 'users'));
        const role    = allSnap.empty ? 'Admin' : 'Usuario';
        await fbSet('users', {
          id: cred.user.uid, name, email, role, date: new Date().toISOString()
        });
      } catch(e) {
        btn.textContent = 'Crear cuenta'; btn.disabled = false;
        loginErr(authMsg(e.code));
      }
    });

    // Enter en contraseña
    document.getElementById('login-password').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('login-btn').click();
    });
  }
  el.style.display = 'flex';
}

function hideLoginScreen() {
  const el = document.getElementById('login-screen');
  if (el) el.style.display = 'none';
}

function loginErr(msg) {
  const el = document.getElementById('login-error');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function authMsg(code) {
  return ({
    'auth/user-not-found':       'No existe cuenta con ese correo.',
    'auth/wrong-password':       'Contraseña incorrecta.',
    'auth/invalid-credential':   'Correo o contraseña incorrectos.',
    'auth/email-already-in-use': 'Ese correo ya está registrado.',
    'auth/weak-password':        'Contraseña muy débil (mínimo 6 caracteres).',
    'auth/invalid-email':        'Correo inválido.',
    'auth/too-many-requests':    'Demasiados intentos. Espera un momento.',
  })[code] || ('Error: ' + code);
}

// ── Indicador de estado ────────────────────────────────────────────────────
function showSyncStatus(state) {
  let el = document.getElementById('sync-status');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sync-status';
    el.style.cssText = `position:fixed;bottom:calc(var(--bnav-h,0px) + 8px);left:50%;
      transform:translateX(-50%);padding:5px 14px;border-radius:20px;font-size:0.72rem;
      font-weight:600;z-index:300;pointer-events:none;transition:opacity 0.5s`;
    document.body.appendChild(el);
  }
  const [t, bg, c] = ({
    connecting: ['⟳ Conectando…', '#1e3a5f', '#60a5fa'],
    online:     ['● Sincronizado', '#14532d', '#4ade80'],
    error:      ['⚠ Sin conexión', '#450a0a', '#f87171'],
    saving:     ['↑ Guardando…',   '#1e3a5f', '#60a5fa'],
    local:      ['💾 Modo local',  '#374151', '#9ca3af'],
  })[state] || ['', '#000', '#fff'];
  el.textContent = t;
  el.style.background = bg;
  el.style.color = c;
  el.style.opacity = '1';
  if (state === 'online' || state === 'saving') {
    setTimeout(() => { el.style.opacity = '0'; }, 2500);
  }
}

function showSyncBadge(s) { showSyncStatus(s); }
