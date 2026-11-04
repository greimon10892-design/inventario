// ============================================================
//  tenants.js — Módulo central de gestión multi-tenant
//  Exporta las funciones que app.js usa para trabajar
//  con la estructura /tenants/{tenantId}/colección
// ============================================================

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore,
  collection, doc,
  setDoc, getDoc, getDocs, deleteDoc,
  onSnapshot, serverTimestamp, query, where
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ── Configuración Firebase ────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyDLk5Gu-wY7kb9MdR5UIBtbgJTyFUGAtnA',
  authDomain:        'gestor-de-inventario-853d8.firebaseapp.com',
  projectId:         'gestor-de-inventario-853d8',
  storageBucket:     'gestor-de-inventario-853d8.firebasestorage.app',
  messagingSenderId: '980977651129',
  appId:             '1:980977651129:web:791dd31e9b2825c4d57a68'
};

// Reusar la app si ya fue inicializada (app.js la inicializa primero)
const fbApp = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
export const db = getFirestore(fbApp);

// ── Estado activo del tenant ──────────────────────────────
// tenantId se establece al hacer login o al crear el tenant
let _activeTenantId = null;

export function setActiveTenant(tenantId) {
  _activeTenantId = tenantId;
  try { localStorage.setItem('active_tenant_id', tenantId); } catch(e) {}
}

export function getActiveTenant() {
  if (_activeTenantId) return _activeTenantId;
  // Recuperar de localStorage si existe (sesión anterior)
  const saved = localStorage.getItem('active_tenant_id');
  if (saved) { _activeTenantId = saved; return saved; }
  return null;
}

// ── Helpers de rutas ─────────────────────────────────────
// Devuelven la referencia correcta con el prefijo del tenant

export function tenantCol(colName) {
  const tid = getActiveTenant();
  if (!tid) throw new Error('No hay tenant activo. Llama setActiveTenant() primero.');
  return collection(db, 'tenants', tid, colName);
}

export function tenantDoc(colName, docId) {
  const tid = getActiveTenant();
  if (!tid) throw new Error('No hay tenant activo.');
  return doc(db, 'tenants', tid, colName, docId);
}

// Acceso directo al documento raíz del tenant
export function tenantRootDoc(tenantId) {
  return doc(db, 'tenants', tenantId);
}

// ── CRUD genérico ─────────────────────────────────────────

export async function tenantSave(colName, item) {
  if (!db) return;
  const { id, ...data } = item;
  await setDoc(tenantDoc(colName, id), { ...data, updatedAt: serverTimestamp() });
}

export async function tenantDelete(colName, id) {
  if (!db) return;
  await deleteDoc(tenantDoc(colName, id));
}

// ── Listeners en tiempo real ──────────────────────────────

export function tenantOnSnapshot(colName, callback, onError) {
  return onSnapshot(tenantCol(colName), snap => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(items);
  }, onError || (err => console.warn(`[tenant:${colName}]`, err.message)));
}

export function tenantDocOnSnapshot(colName, docId, callback, onError) {
  return onSnapshot(tenantDoc(colName, docId), snap => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, onError || (err => console.warn(`[tenant:${colName}/${docId}]`, err.message)));
}

// ── Gestión de Tenants ────────────────────────────────────

/**
 * Crea un nuevo tenant completo:
 * - Documento raíz en /tenants/{id}
 * - Usuario Admin inicial en /tenants/{id}/users/{adminId}
 * - Settings vacíos en /tenants/{id}/settings/global
 * - Registro en /tenant_registry/{email}
 *
 * @param {object} opts
 *   - name: nombre de la tienda/empresa
 *   - adminName: nombre del administrador
 *   - adminEmail: email del administrador
 *   - adminPassword: contraseña del administrador
 *   - plan: 'free' | 'pro' (default: 'free')
 *   - webUrl: URL del sitio público (opcional)
 */
export async function createTenant({ name, adminName, adminEmail, adminPassword, plan = 'free', webUrl = '' }) {
  const tenantId = generateId();
  const adminId  = generateId();
  const now      = new Date().toISOString();

  // 1. Documento raíz del tenant
  await setDoc(doc(db, 'tenants', tenantId), {
    name,
    plan,
    webUrl,
    adminEmail,
    createdAt: now,
    status: 'active',   // 'active' | 'suspended' | 'cancelled'
    updatedAt: serverTimestamp()
  });

  // 2. Usuario Admin inicial del tenant
  await setDoc(doc(db, 'tenants', tenantId, 'users', adminId), {
    name:      adminName,
    email:     adminEmail,
    password:  adminPassword,
    role:      'Admin',
    date:      now,
    avatar:    '',
    updatedAt: serverTimestamp()
  });

  // 3. Settings globales vacíos
  await setDoc(doc(db, 'tenants', tenantId, 'settings', 'global'), {
    storeName:     name,
    storeSubtitle: 'Mi tienda',
    createdAt:     now
  });

  // 4. Registro global para lookup por email al hacer login
  await setDoc(doc(db, 'tenant_registry', adminEmail.replace(/\./g, '_')), {
    tenantId,
    adminEmail,
    tenantName: name,
    createdAt:  now
  });

  return { tenantId, adminId };
}

/**
 * Dado un email, busca en tenant_registry a qué tenant pertenece.
 * Se usa en la pantalla de login para saber qué tenant cargar.
 */
export async function getTenantByEmail(email) {
  const key  = email.replace(/\./g, '_');
  const snap = await getDoc(doc(db, 'tenant_registry', key));
  if (snap.exists()) return snap.data();
  return null;
}

/**
 * Carga todos los tenants (solo para el SuperAdmin maestro).
 */
export async function getAllTenants() {
  const snap = await getDocs(collection(db, 'tenants'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Suspende o activa un tenant.
 */
export async function setTenantStatus(tenantId, status) {
  await setDoc(doc(db, 'tenants', tenantId), { status, updatedAt: serverTimestamp() }, { merge: true });
}

/**
 * Busca el usuario dentro de un tenant por email.
 * Retorna el primer usuario que coincida o null.
 */
export async function getTenantUserByEmail(tenantId, email) {
  const snap = await getDocs(
    query(collection(db, 'tenants', tenantId, 'users'), where('email', '==', email))
  );
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

// ── Utilidades ────────────────────────────────────────────
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
