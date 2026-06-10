// ========== FIREBASE ==========
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDLk5Gu-wY7kb9MdR5UIBtbgJTyFUGAtnA",
  authDomain: "gestor-de-inventario-853d8.firebaseapp.com",
  projectId: "gestor-de-inventario-853d8",
  storageBucket: "gestor-de-inventario-853d8.firebasestorage.app",
  messagingSenderId: "980977651129",
  appId: "1:980977651129:web:791dd31e9b2825c4d57a68"
};

let db = null;
try {
  const fbApp = initializeApp(FIREBASE_CONFIG);
  db = getFirestore(fbApp);
  console.log('✅ Firebase conectado');
} catch (e) {
  console.warn('⚠️ Firebase no disponible:', e.message);
}

// ========== ESTADO ==========
let products  = [];
let movements = [];
let users     = [];
let cart      = {};

// Usuario activo en sesión
let activeUser = { id: 'admin', name: 'Administrador', role: 'Admin' };

// ========== HELPERS ==========
function uid()    { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function fmt(n)   { return '$' + Number(n || 0).toFixed(2); }
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}
function fmtDateShort(iso) {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}
function getProduct(id) { return products.find(p => p.id === id); }
function getUser(id) { return users.find(u => u.id === id); }
function escapeHtml(str) {
  (!str) return '';
  return str.replace(/[&<>"']/g, m =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}
function showToast(msg, type = 'normal', duration = 2800) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:10px;font-weight:600;z-index:9999;font-size:0.88rem;transition:opacity 0.3s;white-space:nowrap;max-width:90vw;text-align:center';
    document.body.appendChild(t);
  }
  const colors = { normal:'#1e1e1e', success:'#14532d', error:'#450a0a', info:'#1e3a5f' };
  const textColors = { normal:'#f0ece6', success:'#4ade80', error:'#f87171', info:'#60a5fa' };
  t.textContent = msg;
  t.style.background = colors[type] || colors.normal;
  t.style.color = textColors[type] || textColors.normal;
  t.style.display = 'block';
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.style.display = 'none', 300); }, duration);
}
function hideSplash() {
  const s = document.getElementById('splash');
  if (s) { s.classList.add('hide'); setTimeout(() => s.style.display = 'none', 500); }
}

// ========== PERMISOS POR ROL ==========
function canWrite()       { return ['Admin','Usuario'].includes(activeUser.role); }
function canDelete()      { return activeUser.role === 'Admin'; }
function canManageUsers() { return activeUser.role === 'Admin'; }
function canViewSales()   { return true; }

function applyRoleRestrictions() {
  const role = activeUser.role;
  // Ocultar Nav items según rol
  document.querySelectorAll('[data-view="agregar"],[data-view="usuarios"]').forEach(el => {
    el.style.display = role === 'Solo lectura' ? 'none' : '';
  });
  // Botones de editar/eliminar productos
  document.querySelectorAll('.btn-edit-product,.btn-delete-product').forEach(btn => {
    btn.style.display = role === 'Admin' ? '' : 'none';
  });
  // Botones entrada/salida
  document.querySelectorAll('.btn-entrada-product,.btn-salida-product').forEach(btn => {
    btn.style.display = role === 'Solo lectura' ? 'none' : '';
  });
  // Info usuario en sidebar
  const info = document.getElementById('sidebar-user-info');
  if (info) info.textContent = activeUser.name + ' · ' + activeUser.role;
  // Info usuario en nav móvil
  const bnavInfo = document.getElementById('bnav-user-info');
  if (bnavInfo) bnavInfo.textContent = activeUser.name + ' · ' + activeUser.role;
}

// ========== FIREBASE: GUARDAR / ELIMINAR ==========
async function saveToFirebase(colName, item) {
  if (!db) return;
  try {
    const { id, ...data } = item;
    await setDoc(doc(db, colName, id), { ...data, updatedAt: serverTimestamp() });
  } catch (e) { console.warn('Error Firebase:', e.message); }
}

async function deleteFromFirebase(colName, id) {
  if (!db) return;
  try { await deleteDoc(doc(db, colName, id)); }
  catch (e) { console.warn('Error Firebase:', e.message); }
}

// ========== SYNC FIREBASE ==========
function iniciarSync() {
  if (!db) { hideSplash(); return; }

  onSnapshot(collection(db, 'products'), snap => {
    products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderInventory(); updateSummary(); renderSaleProductList();
  });

  onSnapshot(collection(db, 'movements'), snap => {
    movements = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    renderMovements(); updateSummary();
  });

  onSnapshot(collection(db, 'users'), snap => {
    users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderUsers();
    // Actualizar info del usuario activo
    const me = users.find(u => u.id === activeUser.id);
    if (me) {
      activeUser = me;
      applyRoleRestrictions();
    } else if (!activeUser.id && users.length > 0) {
      // No hay sesión activa — mostrar pantalla de selección
      mostrarPantallaLogin();
    }
    loadSettingsUI();
  });
}

// ========== NAVEGACIÓN ==========
function navigate(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const target = document.getElementById('view-' + view);
  if (target) target.classList.remove('hidden');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const nav = document.querySelector('.nav-item[data-view="' + view + '"]');
  if (nav) nav.classList.add('active');

  document.querySelectorAll('.b
