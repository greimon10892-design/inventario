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
  if (!str) return '';
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
// Jerarquía: SuperAdmin > Admin > Usuario > Solo lectura
function isSuperAdmin()   { return activeUser.role === 'SuperAdmin'; }
function isAdmin()        { return ['SuperAdmin','Admin'].includes(activeUser.role); }
function canWrite()       { return ['SuperAdmin','Admin','Usuario'].includes(activeUser.role); }
function canDelete()      { return isAdmin(); }
function canManageUsers() { return isAdmin(); }
function canManageAdmins(){ return isSuperAdmin(); }
function canViewGanancias(){ return isAdmin(); }

function applyRoleRestrictions() {
  const role = activeUser.role;
  // Ocultar "Nuevo Producto" si no puede escribir
  document.querySelectorAll('[data-view="agregar"]').forEach(el => {
    el.style.display = canWrite() ? '' : 'none';
  });
  // "Usuarios" solo visible para Admin/SuperAdmin
  document.querySelectorAll('[data-view="usuarios"]').forEach(el => {
    el.style.display = isAdmin() ? '' : 'none';
  });
  // Botones de editar/eliminar productos — Admin y SuperAdmin
  document.querySelectorAll('.btn-edit-product,.btn-delete-product').forEach(btn => {
    btn.style.display = isAdmin() ? '' : 'none';
  });
  // Botones entrada/salida
  document.querySelectorAll('.btn-entrada-product,.btn-salida-product').forEach(btn => {
    btn.style.display = role === 'Solo lectura' ? 'none' : '';
  });
  // Info usuario en sidebar
  const info = document.getElementById('sidebar-user-info');
  if (info) info.textContent = activeUser.name + ' · ' + (role === 'SuperAdmin' ? '⭐ SuperAdmin' : role);
  // Info usuario en nav móvil
  const bnavInfo = document.getElementById('bnav-user-info');
  if (bnavInfo) bnavInfo.textContent = activeUser.name + ' · ' + (role === 'SuperAdmin' ? '⭐ SuperAdmin' : role);
  // Limitar opciones del selector de rol al crear usuario:
  // solo un SuperAdmin puede otorgar Admin/SuperAdmin
  const roleSelect = document.getElementById('u-role');
  if (roleSelect) {
    Array.from(roleSelect.options).forEach(opt => {
      opt.disabled = ['SuperAdmin', 'Admin'].includes(opt.value) && !isSuperAdmin();
    });
    if (roleSelect.options[roleSelect.selectedIndex]?.disabled) {
      roleSelect.value = 'Usuario';
    }
  }
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


// ========== PROYECTOS ==========
let projects = [];
let activeProjectId = null; // null = SuperAdmin ve todo

function getActiveProjectId() {
  if (isSuperAdmin()) return activeProjectId; // puede ver todos o filtrar
  return activeUser.projectId || null;
}

// Sincronizar proyectos
function iniciarSyncProyectos() {
  if (!db) return;
  onSnapshot(collection(db, 'projects'), snap => {
    projects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderProjects();
  });
}

function renderProjects() {
  const sel = document.getElementById('s-project-filter');
  if (!sel || !isSuperAdmin()) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Todos los proyectos</option>' +
    projects.map(p => '<option value="' + p.id + '"' + (p.id === current ? ' selected' : '') + '>' + p.name + '</option>').join('');
}

// Filtrar productos/movimientos por proyecto
function getProductsForView() {
  const pid = getActiveProjectId();
  if (!pid) return products; // SuperAdmin sin filtro ve todo
  return products.filter(p => (p.projectId || 'default') === pid);
}

function getMovementsForView() {
  const pid = getActiveProjectId();
  if (!pid) return movements;
  return movements.filter(m => (m.projectId || 'default') === pid);
}

// Modal crear Admin con proyecto
window.abrirModalCrearAdmin = function() {
  if (!isSuperAdmin()) { showToast('Solo SuperAdmin puede hacer esto', 'error'); return; }
  let modal = document.getElementById('modal-crear-admin');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-crear-admin';
    modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9998;align-items:center;justify-content:center;padding:16px';
    document.body.appendChild(modal);
  }

  const proyOptions = projects.map(p =>
    '<option value="' + p.id + '">' + p.name + '</option>'
  ).join('');

  modal.innerHTML =
    '<div style="background:var(--surface);border-radius:16px;padding:24px;max-width:440px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,0.4)">' +
      '<h3 style="margin-bottom:16px;color:var(--text)">⭐ Crear Admin</h3>' +
      '<div style="margin-bottom:12px"><label style="color:var(--muted);font-size:0.8rem;display:block;margin-bottom:6px">NOMBRE</label>' +
        '<input id="ca-name" type="text" placeholder="Nombre completo" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:inherit" /></div>' +
      '<div style="margin-bottom:12px"><label style="color:var(--muted);font-size:0.8rem;display:block;margin-bottom:6px">CORREO</label>' +
        '<input id="ca-email" type="email" placeholder="correo@ejemplo.com" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:inherit" /></div>' +
      '<div style="margin-bottom:12px"><label style="color:var(--muted);font-size:0.8rem;display:block;margin-bottom:6px">CONTRASEÑA</label>' +
        '<input id="ca-pass" type="password" placeholder="Mínimo 4 caracteres" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:inherit" /></div>' +
      '<div style="margin-bottom:12px"><label style="color:var(--muted);font-size:0.8rem;display:block;margin-bottom:6px">PROYECTO</label>' +
        '<select id="ca-proyecto-tipo" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:inherit;margin-bottom:8px">' +
          '<option value="nuevo">➕ Crear nuevo proyecto</option>' +
          '<option value="existente">📂 Asignar a proyecto existente</option>' +
        '</select>' +
        '<input id="ca-proyecto-nombre" placeholder="Nombre del nuevo proyecto" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:inherit" />' +
        '<select id="ca-proyecto-existente" style="display:none;width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:inherit">' +
          proyOptions +
        '</select>' +
      '</div>' +
      '<div style="margin-bottom:16px" id="ca-web-wrap"><label style="color:var(--muted);font-size:0.8rem;display:block;margin-bottom:6px">URL DEL SITIO WEB (opcional)</label>' +
        '<input id="ca-web" type="url" placeholder="https://mitienda.github.io" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:inherit" /></div>' +
      '<div style="display:flex;gap:10px">' +
        '<button id="ca-btn-crear" class="btn-primary" style="flex:1">Crear Admin</button>' +
       '<button onclick="document.getElementById(\'modal-crear-admin\').style.display=\'none\'" class="btn-ghost" style="flex:1">Cancelar</button>' +
      '</div>' +
    '</div>';

  modal.style.display = 'flex';

  // Toggle tipo de proyecto
  const tipoSel = modal.querySelector('#ca-proyecto-tipo');
  const nombreInput = modal.querySelector('#ca-proyecto-nombre');
  const existSel = modal.querySelector('#ca-proyecto-existente');
  const webWrap = modal.querySelector('#ca-web-wrap');

  tipoSel.addEventListener('change', () => {
    const esNuevo = tipoSel.value === 'nuevo';
    nombreInput.style.display = esNuevo ? 'block' : 'none';
    existSel.style.display = esNuevo ? 'none' : 'block';
    webWrap.style.display = esNuevo ? 'block' : 'none';
  });

  modal.querySelector('#ca-btn-crear').addEventListener('click', async () => {
    const name  = modal.querySelector('#ca-name').value.trim();
    const email = modal.querySelector('#ca-email').value.trim().toLowerCase();
    const pass  = modal.querySelector('#ca-pass').value.trim();
    const tipo  = tipoSel.value;

    if (!name || !email || !pass) { showToast('Completa todos los campos', 'error'); return; }
    if (pass.length < 4) { showToast('Contraseña muy corta', 'error'); return; }
    if (users.find(u => u.email === email)) { showToast('Ya existe ese correo', 'error'); return; }

    let projectId;
    if (tipo === 'nuevo') {
      const pNombre = nombreInput.value.trim() || name + ' Tienda';
      const pWeb    = modal.querySelector('#ca-web').value.trim();
      projectId = uid();
      await saveToFirebase('projects', { id: projectId, name: pNombre, webUrl: pWeb, createdBy: activeUser.id, date: new Date().toISOString() });
      showToast('✅ Proyecto "' + pNombre + '" creado', 'success');
    } else {
      projectId = existSel.value;
      if (!projectId) { showToast('Selecciona un proyecto', 'error'); return; }
    }

    const newAdmin = { id: uid(), name, email, role: 'Admin', password: pass, projectId, date: new Date().toISOString(), avatar: '' };
    await saveToFirebase('users', newAdmin);
    modal.style.display = 'none';
    showToast('✅ Admin "' + name + '" creado correctamente', 'success');
  });
};

// ========== SYNC FIREBASE ==========
function iniciarSync() {
  if (!db) { hideSplash(); return; }
  iniciarSyncProyectos();

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

  document.querySelectorAll('.bnav-item').forEach(n => n.classList.remove('active'));
  const bnav = document.querySelector('.bnav-item[data-view="' + view + '"]');
  if (bnav) bnav.classList.add('active');

  if      (view === 'ventas')      { renderSaleProductList(); renderCart(); iniciarBotonesCarrito(); }
  else if (view === 'productos')   renderInventory();
  else if (view === 'movimientos') renderMovements();
  else if (view === 'usuarios')    renderUsers();
  else if (view === 'panel')       updateSummary();
  else if (view === 'ajustes')     loadSettingsUI();

  applyRoleRestrictions();
}
window.navigate = navigate;

// ========== PANEL ==========
function updateSummary() {
  const viewProds = getProductsForView();
  const viewMovs  = getMovementsForView();
  document.getElementById('total-products').textContent = viewProds.length;
  const sold = viewMovs.filter(m => m.type === 'salida').reduce((s, m) => s + (m.total || 0), 0);
  document.getElementById('total-vendido').textContent = fmt(sold);
  // Ganancias solo para Admin y SuperAdmin
  const cardInv   = document.getElementById('card-inversion');
  const cardGain  = document.getElementById('card-ganancia');
  if (canViewGanancias()) {
    const inv  = viewProds.reduce((s, p) => s + (p.buyPrice  || 0) * (p.stock || 0), 0);
    const gain = viewProds.reduce((s, p) => s + ((p.sellPrice || 0) - (p.buyPrice || 0)) * (p.stock || 0), 0);
    document.getElementById('total-inversion').textContent = fmt(inv);
    document.getElementById('total-ganancia').textContent  = fmt(gain);
    if (cardInv)  cardInv.style.display  = '';
    if (cardGain) cardGain.style.display = '';
  } else {
    if (cardInv)  cardInv.style.display  = 'none';
    if (cardGain) cardGain.style.display = 'none';
  }

  const low = getProductsForView().filter(p => (p.stock || 0) <= 5);
  const el  = document.getElementById('low-stock-list');
  if (el) {
    el.innerHTML = low.length === 0
      ? '<div class="empty-state">Sin productos con bajo stock</div>'
      : low.map(p =>
          '<div class="low-stock-item">' +
          '<span class="low-stock-name">' + escapeHtml(p.name) + '</span>' +
          '<span class="low-stock-qty ' + (p.stock === 0 ? 'stock-low' : '') + '">' + p.stock + ' uds.</span>' +
          '</div>'
        ).join('');
  }
}

// ========== INVENTARIO ==========
function normalizeStr(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function renderInventory() {
  const allProducts = getProductsForView();
  const rawSearch = document.getElementById('search')?.value || '';
  const search = normalizeStr(rawSearch);
  const cat    = document.getElementById('filter-category')?.value || '';
  const list   = allProducts.filter(p => {
    const name = normalizeStr(p.name);
    const desc = normalizeStr(p.desc);
    const matchSearch = !search || name.includes(search) || desc.includes(search);
    const matchCat    = !cat || p.category === cat;
    return matchSearch && matchCat;
  });
  const tbody = document.getElementById('inventory-body');
  if (!tbody) return;
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state">No se encontraron productos.</div></td></tr>';
    return;
  }
  tbody.innerHTML = list.map(p => {
    const gain = (p.sellPrice || 0) - (p.buyPrice || 0);
    const badge = p.category === 'dulce'
      ? '<span class="badge badge-dulce">Dulce</span>'
      : '<span class="badge badge-pulsera">Pulsera</span>';
    const imgCell = p.img
      ? '<img src="' + p.img + '" style="width:36px;height:36px;object-fit:cover;border-radius:6px;flex-shrink:0" />'
      : '<div style="width:36px;height:36px;border-radius:6px;background:var(--surface2);flex-shrink:0"></div>';
    return '<tr>' +
      '<td><div style="display:flex;align-items:center;gap:10px">' + imgCell +
        '<div><div class="td-name">' + escapeHtml(p.name) + '</div>' +
        (p.desc ? '<div class="td-sub">' + escapeHtml(p.desc) + '</div>' : '') +
        '</div></div></td>' +
      '<td>' + badge + '</td>' +
      '<td class="' + ((p.stock || 0) <= 5 ? 'stock-low' : '') + '">' + (p.stock || 0) + '</td>' +
      '<td>' + fmt(p.buyPrice) + '</td>' +
      '<td>' + fmt(p.sellPrice) + '</td>' +
      '<td class="td-gain">' + fmt(gain) + '</td>' +
      '<td class="td-actions">' +
        '<button class="btn-icon btn-entrada-product" onclick="window.openMovModal(\'' + p.id + '\',\'entrada\')" title="Entrada">↓</button>' +
        '<button class="btn-icon btn-salida-product" onclick="window.openMovModal(\'' + p.id + '\',\'salida\')" title="Salida">↑</button>' +
        '<button class="btn-icon btn-edit-product" onclick="window.editProduct(\'' + p.id + '\')" title="Editar">✎</button>' +
        '<button class="btn-icon btn-danger btn-delete-product" onclick="window.deleteProduct(\'' + p.id + '\')" title="Eliminar">✕</button>' +
      '</td></tr>';
  }).join('');
  applyRoleRestrictions();
}

// ========== MOVIMIENTOS ==========
function renderMovements() {
  const typeFilter = document.getElementById('filter-mov-type')?.value || '';
  const baseMovs = getMovementsForView();
  const list = baseMovs.filter(m => !typeFilter || m.type === typeFilter || (typeFilter === 'salida' && m.type === 'gasto'));
  const tbody = document.getElementById('mov-body');
  if (!tbody) return;
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state">Sin movimientos registrados.</div></td></tr>';
    return;
  }
  tbody.innerHTML = list.map(m => {
    const p       = getProduct(m.productId);
    const name    = p ? p.name : (m.productName || '—');
    const seller  = m.userId ? (getUser(m.userId)?.name || m.userName || '—') : '—';
    const badge   = m.type === 'entrada'
      ? '<span class="badge badge-entrada">Entrada</span>'
      : m.type === 'gasto'
      ? '<span class="badge" style="background:rgba(251,191,36,0.15);color:#fbbf24">Gasto</span>'
      : '<span class="badge badge-salida">Salida</span>';
    const gainCell = m.type === 'salida' && p
      ? '<td class="td-gain">' + fmt(((p.sellPrice || 0) - (p.buyPrice || 0)) * m.qty) + '</td>'
      : '<td>—</td>';
    return '<tr>' +
      '<td class="td-date">' + fmtDate(m.date) + '</td>' +
      '<td class="td-name">' + escapeHtml(name) + (m.obs ? '<div class="td-sub">' + escapeHtml(m.obs) + '</div>' : '') + '</td>' +
      '<td>' + badge + '</td>' +
      '<td>' + (m.qty || 1) + '</td>' +
      '<td>' + fmt(m.price) + '</td>' +
      '<td>' + fmt((m.price || 0) * (m.qty || 1)) + '</td>' +
      '<td style="font-size:0.75rem;color:var(--muted)">' + escapeHtml(seller) + '</td>' +
      gainCell +
      '</tr>';
  }).join('');
}

// ========== MODAL MOVIMIENTOS ==========
window.openMovModal = function(productId, type) {
  const p = getProduct(productId);
  if (!p) return;
  document.getElementById('m-product-id').value   = productId;
  document.getElementById('m-product-name').value = p.name;
  document.getElementById('m-type').value         = type;
  document.getElementById('m-qty').value          = 1;
  document.getElementById('m-price').value        = type === 'salida' ? p.sellPrice : p.buyPrice;
  document.getElementById('m-price-label').textContent = type === 'salida' ? 'Precio de Venta ($)' : 'Precio de Compra ($)';
  document.getElementById('modal-title').textContent   = type === 'entrada' ? 'Registrar entrada' : 'Registrar salida';
  document.getElementById('modal-overlay').classList.remove('hidden');
};
window.closeMovModal = function() {
  document.getElementById('modal-overlay').classList.add('hidden');
};

document.getElementById('mov-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const productId = document.getElementById('m-product-id').value;
  const type  = document.getElementById('m-type').value;
  const qty   = parseInt(document.getElementById('m-qty').value);
  const price = parseFloat(document.getElementById('m-price').value);
  const p = getProduct(productId);
  if (!p) return;
  if (type === 'salida' && qty > (p.stock || 0)) {
    alert('Stock insuficiente. Solo hay ' + p.stock + ' unidades.'); return;
  }
  p.stock = (p.stock || 0) + (type === 'entrada' ? qty : -qty);
  await saveToFirebase('products', p);
  const mov = {
    id: uid(), productId: p.id, productName: p.name,
    type, qty, price, total: price * qty,
    date: new Date().toISOString(),
    userId: activeUser.id, userName: activeUser.name
  };
  await saveToFirebase('movements', mov);
  renderInventory(); updateSummary(); renderSaleProductList();
  window.closeMovModal();
  showToast((type === 'entrada' ? '↓ Entrada' : '↑ Salida') + ' registrada: ' + qty + ' × ' + p.name, 'success');
});

// ========== CRUD PRODUCTOS ==========
window.editProduct = function(id) {
  const p = getProduct(id);
  if (!p) return;
  document.getElementById('edit-id').value    = p.id;
  document.getElementById('f-name').value     = p.name;
  document.getElementById('f-category').value = p.category;
  document.getElementById('f-stock').value    = p.stock;
  document.getElementById('f-buy').value      = p.buyPrice;
  document.getElementById('f-sell').value     = p.sellPrice;
  document.getElementById('f-desc').value     = p.desc || '';
  document.getElementById('form-title').textContent = 'Editar Producto';
  document.getElementById('cancel-edit').style.display = 'inline-block';
  // Cargar imágenes
  productImages = ['', '', ''];
  [['img',0],['img2',1],['img3',2]].forEach(([key, slot]) => {
    const src = p[key] || '';
    productImages[slot] = src;
    const preview = document.getElementById('f-img-preview-' + slot);
    const holder  = document.getElementById('f-img-placeholder-' + slot);
    const rem     = document.getElementById('f-img-remove-' + slot);
    if (src) {
      if (preview) { preview.src = src; preview.classList.remove('hidden'); }
      if (holder) holder.classList.add('hidden');
      if (rem) rem.style.display = 'inline-block';
    }
  });
  navigate('agregar');
};

window.deleteProduct = async function(id) {
  if (!canDelete()) { showToast('Sin permiso para eliminar', 'error'); return; }
  const p = getProduct(id);
  if (!p) return;
  if (!confirm('¿Eliminar "' + p.name + '"?')) return;
  await deleteFromFirebase('products', id);
  showToast('Producto eliminado', 'normal');
};

document.getElementById('cancel-edit')?.addEventListener('click', () => {
  document.getElementById('product-form').reset();
  document.getElementById('edit-id').value = '';
  document.getElementById('form-title').textContent = 'Nuevo Producto';
  document.getElementById('cancel-edit').style.display = 'none';
  productImages = ['', '', ''];
  navigate('productos');
});

// Imágenes del formulario
let productImages = ['', '', ''];

function comprimirImagen(file, maxW = 600, q = 0.75) {
  return new Promise(res => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        res(canvas.toDataURL('image/jpeg', q));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

document.getElementById('product-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  if (!canWrite()) { showToast('Sin permiso', 'error'); return; }
  const editId = document.getElementById('edit-id').value;
  const data = {
    name:      document.getElementById('f-name').value.trim(),
    category:  document.getElementById('f-category').value,
    stock:     parseInt(document.getElementById('f-stock').value),
    buyPrice:  parseFloat(document.getElementById('f-buy').value),
    sellPrice: parseFloat(document.getElementById('f-sell').value),
    desc:      document.getElementById('f-desc').value.trim(),
    img:  productImages[0] || '',
    img2: productImages[1] || '',
    img3: productImages[2] || ''
  };
  if (data.sellPrice < data.buyPrice) { alert('El precio de venta no puede ser menor al de compra.'); return; }
  if (editId) {
    const ex = getProduct(editId);
    if (!data.img  && ex?.img)  data.img  = ex.img;
    if (!data.img2 && ex?.img2) data.img2 = ex.img2;
    if (!data.img3 && ex?.img3) data.img3 = ex.img3;
    await saveToFirebase('products', { ...ex, ...data, id: editId });
    showToast('Producto actualizado ✓', 'success');
  } else {
    await saveToFirebase('products', { id: uid(), ...data, projectId: getActiveProjectId() || 'default' });
    showToast('Producto agregado ✓', 'success');
  }
  document.getElementById('product-form').reset();
  document.getElementById('edit-id').value = '';
  document.getElementById('cancel-edit').style.display = 'none';
  productImages = ['', '', ''];
  navigate('productos');
});

// ========== VENTAS ==========
function renderSaleProductList() {
  const search = (document.getElementById('sale-search')?.value || '').toLowerCase();
  const cat    = document.querySelector('.scat-btn.active')?.dataset.cat || '';
  const list   = getProductsForView().filter(p =>
    (!cat || p.category === cat) && (!search || (p.name || '').toLowerCase().includes(search))
  );
  const container = document.getElementById('sale-product-list');
  if (!container) return;
  if (list.length === 0) { container.innerHTML = '<div class="empty-state">Sin productos.</div>'; return; }
  container.innerHTML = list.map(p => {
    const qty     = cart[p.id] || 0;
    const noStock = (p.stock || 0) <= 0;
    const imgBlock = p.img
      ? '<img src="' + p.img + '" style="width:44px;height:44px;object-fit:cover;border-radius:8px;flex-shrink:0" />'
      : '<div style="width:44px;height:44px;border-radius:8px;background:var(--surface2);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:1.2rem">' + (p.category === 'dulce' ? '🍬' : '📿') + '</div>';
    return '<div class="sale-product-item ' + (qty > 0 ? 'in-cart' : '') + ' ' + (noStock ? 'out-of-stock' : '') + '" data-id="' + p.id + '">' +
      '<div style="display:flex;align-items:center;gap:10px;flex:1">' + imgBlock +
        '<div class="sale-product-info">' +
          '<div class="sale-product-name">' + escapeHtml(p.name) + '</div>' +
          '<div class="sale-product-meta">Stock: ' + (p.stock || 0) + ' | ' + fmt(p.sellPrice) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="sale-qty-ctrl">' +
        '<button class="sale-qty-btn" onclick="window.cartChange(\'' + p.id + '\',-1)">−</button>' +
        '<input class="sale-qty-val" type="number" min="0" max="' + (p.stock || 0) + '" value="' + qty + '" onchange="window.cartSet(\'' + p.id + '\',this.value)" />' +
        '<button class="sale-qty-btn" onclick="window.cartChange(\'' + p.id + '\',1)">+</button>' +
      '</div></div>';
  }).join('');
}

window.cartChange = function(id, delta) {
  const p = getProduct(id); if (!p) return;
  const nxt = Math.max(0, Math.min(p.stock || 0, (cart[id] || 0) + delta));
  if (nxt === 0) delete cart[id]; else cart[id] = nxt;
  renderSaleProductList(); renderCart();
};
window.cartSet = function(id, val) {
  const p = getProduct(id); if (!p) return;
  const n = Math.max(0, Math.min(p.stock || 0, parseInt(val) || 0));
  if (n === 0) delete cart[id]; else cart[id] = n;
  renderSaleProductList(); renderCart();
};

function renderCart() {
  const container = document.getElementById('cart-items');
  const totalSpan = document.getElementById('cart-total');
  const gainSpan  = document.getElementById('cart-gain');
  const btn       = document.getElementById('btn-confirm-sale');
  if (!container) return;

  iniciarBotonesCarrito();

  const ids = Object.keys(cart);
  if (ids.length === 0) {
    container.innerHTML = '<div class="empty-state">Sin productos agregados</div>';
    if (totalSpan) totalSpan.textContent = '$0.00';
    if (gainSpan)  gainSpan.textContent  = '$0.00';
    if (btn) btn.disabled = true;
    return;
  }
  let total = 0, gain = 0;
  container.innerHTML = ids.map(id => {
    const p = getProduct(id); if (!p) return '';
    const qty = cart[id], sub = (p.sellPrice || 0) * qty;
    total += sub;
    gain  += ((p.sellPrice || 0) - (p.buyPrice || 0)) * qty;
    return '<div class="cart-item">' +
      (p.img ? '<img src="' + p.img + '" style="width:32px;height:32px;object-fit:cover;border-radius:5px;flex-shrink:0" />' : '') +
      '<span class="cart-item-name">' + escapeHtml(p.name) + '</span>' +
      '<span class="cart-item-qty">×' + qty + '</span>' +
      '<span class="cart-item-total">' + fmt(sub) + '</span>' +
      '<button class="btn-icon btn-danger" onclick="window.cartChange(\'' + id + '\',-999)">✕</button>' +
      '</div>';
  }).join('');
  if (totalSpan) totalSpan.textContent = fmt(total);
  if (gainSpan)  gainSpan.textContent  = fmt(gain);
  if (btn) btn.disabled = false;
}

// Botones extra del carrito (se crean una sola vez)
function iniciarBotonesCarrito() {
  const btn = document.getElementById('btn-confirm-sale');
  if (!btn) return;
  if (!document.getElementById('btn-share-sale')) {
    const shareBtn = document.createElement('button');
    shareBtn.id = 'btn-share-sale';
    shareBtn.className = 'btn-ghost-sm';
    shareBtn.style.cssText = 'width:100%;margin-top:8px';
    shareBtn.textContent = '📄 Compartir venta actual / WhatsApp';
    shareBtn.onclick = compartirVentaActual;
    btn.parentNode.insertBefore(shareBtn, btn.nextSibling);
  }
  if (!document.getElementById('btn-historial-ventas')) {
    const histBtn = document.createElement('button');
    histBtn.id = 'btn-historial-ventas';
    histBtn.className = 'btn-ghost-sm';
    histBtn.style.cssText = 'width:100%;margin-top:8px';
    histBtn.textContent = '🧾 Ver historial / Reimprimir ticket';
    histBtn.onclick = window.abrirHistorialVentas;
    btn.parentNode.insertBefore(histBtn, btn.nextSibling);
  }
  if (!document.getElementById('btn-gasto')) {
    const gastoBtn = document.createElement('button');
    gastoBtn.id = 'btn-gasto';
    gastoBtn.className = 'btn-ghost-sm';
    gastoBtn.style.cssText = 'width:100%;margin-top:8px;color:#f87171';
    gastoBtn.textContent = '🗑️ Cancelar / Registrar Gasto';
    gastoBtn.onclick = abrirModalGasto;
    btn.parentNode.appendChild(gastoBtn);
  }
}

// ========== CONFIRMAR VENTA ==========
document.getElementById('btn-confirm-sale')?.addEventListener('click', async () => {
  const ids = Object.keys(cart);
  if (!ids.length) return;
  const btn = document.getElementById('btn-confirm-sale');
  if (btn) btn.disabled = true;

  const saleId   = uid();
  const saleDate = new Date().toISOString();
  const saleItems = [];

  for (const id of ids) {
    const p = getProduct(id); if (!p) continue;
    const qty = cart[id];
    p.stock = (p.stock || 0) - qty;
    await saveToFirebase('products', p);

    const pid = getActiveProjectId() || 'default';
    const mov = {
      id: uid(), saleId, projectId: pid,
      productId: p.id, productName: p.name,
      type: 'salida', qty, price: p.sellPrice || 0,
      total: (p.sellPrice || 0) * qty,
      date: saleDate,
      userId: activeUser.id, userName: activeUser.name
    };
    await saveToFirebase('movements', mov);
    saleItems.push({ name: p.name, qty, price: p.sellPrice || 0, sub: (p.sellPrice || 0) * qty });
  }

  // Guardar resumen de venta
  const total = saleItems.reduce((s, i) => s + i.sub, 0);
  await saveToFirebase('sales', {
    id: saleId, date: saleDate,
    items: saleItems, total,
    userId: activeUser.id, userName: activeUser.name
  });

  // Mostrar recibo
  mostrarRecibo(saleItems, total, saleDate);

  cart = {};
  renderSaleProductList(); renderCart();
});

// ========== RECIBO DE VENTA ==========
function mostrarRecibo(items, total, date) {
  let modal = document.getElementById('modal-recibo');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-recibo';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    document.body.appendChild(modal);
  }

  const gain = items.reduce((s, i) => {
    const p = products.find(pr => pr.name === i.name);
    return s + (i.price - (p?.buyPrice || 0)) * i.qty;
  }, 0);

  const waText = encodeURIComponent(
    '🛍️ *Venta TALARA*\n' +
    '📅 ' + fmtDate(date) + '\n' +
    '───────────────\n' +
    items.map(i => '• ' + i.name + ' ×' + i.qty + ' → ' + fmt(i.sub)).join('\n') + '\n' +
    '───────────────\n' +
    '💰 Total: ' + fmt(total) + '\n' +
    '✅ Vendido por: ' + activeUser.name + '\n' +
    'TALARA — Xalapa, Ver.'
  );

  modal.innerHTML =
    '<div style="background:var(--surface);border-radius:16px;padding:0;max-width:380px;width:100%;max-height:90vh;overflow-y:auto">' +
      '<div style="background:var(--orange);padding:16px 20px;border-radius:16px 16px 0 0;text-align:center">' +
        '<div style="font-size:1.5rem;font-weight:900;color:#fff;letter-spacing:2px">TALARA</div>' +
        '<div style="font-size:0.75rem;color:rgba(255,255,255,0.8)">Xalapa, Veracruz · ' + fmtDateShort(date) + '</div>' +
      '</div>' +
      '<div style="padding:20px">' +
        '<div style="font-size:0.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Detalle de venta</div>' +
        items.map(i =>
          '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-size:0.875rem">' +
            '<div><div style="font-weight:500;color:var(--text)">' + escapeHtml(i.name) + '</div>' +
            '<div style="font-size:0.72rem;color:var(--muted)">×' + i.qty + ' · ' + fmt(i.price) + ' c/u</div></div>' +
            '<div style="font-weight:700;color:var(--text)">' + fmt(i.sub) + '</div>' +
          '</div>'
        ).join('') +
        '<div style="display:flex;justify-content:space-between;padding:14px 0 4px;font-size:1.1rem;font-weight:800;color:var(--text)">' +
          '<span>Total</span><span style="color:var(--orange)">' + fmt(total) + '</span>' +
        '</div>' +
        '<div style="font-size:0.75rem;color:var(--muted);margin-bottom:16px">Ganancia: ' + fmt(gain) + ' · Vendedor: ' + activeUser.name + '</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px">' +
          '<a href="https://wa.me/?text=' + waText + '" target="_blank" rel="noopener" ' +
            'style="display:flex;align-items:center;justify-content:center;gap:8px;background:#1a7a2a;color:#fff;padding:12px;border-radius:10px;font-weight:700;text-decoration:none;font-size:0.9rem">' +
            '💬 Compartir por WhatsApp' +
          '</a>' +
          '<button onclick="window.print()" ' +
            'style="background:var(--surface2);color:var(--text);border:1px solid var(--border);padding:12px;border-radius:10px;font-weight:600;cursor:pointer;font-size:0.875rem">' +
            '🖨️ Imprimir recibo' +
          '</button>' +
          '<button onclick="document.getElementById(\'modal-recibo\').style.display=\'none\'" ' +
            'style="background:none;color:var(--muted);border:none;padding:10px;cursor:pointer;font-size:0.85rem">' +
            'Cerrar' +
          '</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  modal.style.display = 'flex';
  showToast('✅ ¡Venta exitosa! — ' + items.length + ' producto' + (items.length > 1 ? 's' : ''), 'success', 3000);
}

// ========== COMPARTIR VENTA ACTUAL ==========
function compartirVentaActual() {
  const ids = Object.keys(cart);
  if (!ids.length) { showToast('El carrito está vacío', 'error'); return; }
  const total = ids.reduce((s, id) => s + (getProduct(id)?.sellPrice || 0) * cart[id], 0);
  let txt = '🛍️ *Venta TALARA*\n';
  txt += '📅 ' + new Date().toLocaleDateString('es-MX', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' }) + '\n';
  txt += '───────────────\n';
  ids.forEach(id => {
    const p = getProduct(id); if (!p) return;
    txt += '• ' + p.name + ' ×' + cart[id] + ' → ' + fmt((p.sellPrice || 0) * cart[id]) + '\n';
  });
  txt += '───────────────\n';
  txt += '💰 Total: ' + fmt(total) + '\n';
  txt += 'TALARA — Xalapa, Veracruz';
  if (navigator.share) {
    navigator.share({ title: 'Venta TALARA', text: txt }).catch(() => {});
  } else {
    window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank');
  }
}

// ========== MODAL GASTO / CANCELACIÓN ==========
function abrirModalGasto() {
  document.getElementById('modal-gasto').style.display = 'flex';
}
function cerrarModalGasto() {
  document.getElementById('modal-gasto').style.display = 'none';
  document.getElementById('gasto-obs').value  = '';
  document.getElementById('gasto-monto').value = '';
}

function crearModalGasto() {
  if (document.getElementById('modal-gasto')) return;
  const modal = document.createElement('div');
  modal.id = 'modal-gasto';
  modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9998;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML =
    '<div style="background:var(--surface);border-radius:16px;padding:24px;max-width:420px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,0.4)">' +
      '<h3 style="margin-bottom:16px;color:var(--text)">🗑️ Cancelar Venta / Registrar Gasto</h3>' +
      '<div style="margin-bottom:12px"><label style="color:var(--muted);font-size:0.82rem;display:block;margin-bottom:6px">TIPO</label>' +
        '<select id="gasto-tipo" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:inherit">' +
          '<option value="cancelacion">❌ Cancelación de venta</option>' +
          '<option value="gasto">💸 Retiro / Gasto</option>' +
          '<option value="devolucion">↩️ Devolución</option>' +
          '<option value="otro">📝 Otro</option>' +
        '</select></div>' +
      '<div style="margin-bottom:12px"><label style="color:var(--muted);font-size:0.82rem;display:block;margin-bottom:6px">MONTO ($) — OPCIONAL</label>' +
        '<input type="number" id="gasto-monto" min="0" step="0.01" placeholder="0.00" ' +
          'style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:inherit" /></div>' +
      '<div style="margin-bottom:16px"><label style="color:var(--muted);font-size:0.82rem;display:block;margin-bottom:6px">OBSERVACIONES *</label>' +
        '<textarea id="gasto-obs" rows="3" placeholder="Ej: Cliente canceló, gasto en materiales..." ' +
          'style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:inherit;resize:vertical"></textarea></div>' +
      '<div style="display:flex;gap:10px">' +
        '<button id="btn-gasto-confirmar" class="btn-primary" style="flex:1">Registrar</button>' +
        '<button id="btn-gasto-cancelar" class="btn-ghost" style="flex:1">Cancelar</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);

  document.getElementById('btn-gasto-cancelar').addEventListener('click', cerrarModalGasto);
  document.getElementById('btn-gasto-confirmar').addEventListener('click', async () => {
    const tipo  = document.getElementById('gasto-tipo').value;
    const monto = parseFloat(document.getElementById('gasto-monto').value) || 0;
    const obs   = document.getElementById('gasto-obs').value.trim();
    if (!obs) { showToast('Escribe una observación', 'error'); return; }
    const labels = { cancelacion:'Cancelación', gasto:'Gasto/Retiro', devolucion:'Devolución', otro:'Otro' };
    const mov = {
      id: uid(), productId: 'gasto_' + tipo,
      productName: labels[tipo] + ': ' + obs,
      type: 'gasto', qty: 1, price: monto, total: monto,
      date: new Date().toISOString(), obs, tipoGasto: tipo,
      userId: activeUser.id, userName: activeUser.name
    };
    await saveToFirebase('movements', mov);
    if (tipo === 'cancelacion' || tipo === 'devolucion') { cart = {}; renderSaleProductList(); renderCart(); }
    cerrarModalGasto();
    showToast('✅ ' + labels[tipo] + ' registrada', 'success');
  });
}


// ========== HISTORIAL DE VENTAS - REIMPRESIÓN ==========
window.abrirHistorialVentas = function() {
  var modal = document.getElementById('modal-historial');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-historial';
    modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9998;align-items:flex-end;justify-content:center;padding:16px';
    document.body.appendChild(modal);
  }

  // Agrupar movimientos por saleId
  var salesMap = {};
  movements.filter(function(m){ return m.type === 'salida' && m.saleId; }).forEach(function(m) {
    if (!salesMap[m.saleId]) salesMap[m.saleId] = { saleId: m.saleId, date: m.date, items: [], total: 0, userName: m.userName || '—' };
    salesMap[m.saleId].items.push(m);
    salesMap[m.saleId].total += m.total || 0;
  });

  var sales = Object.values(salesMap).sort(function(a,b){ return new Date(b.date) - new Date(a.date); }).slice(0, 30);

  var listHTML = sales.length === 0
    ? '<div style="color:var(--muted);text-align:center;padding:32px">Sin ventas registradas</div>'
    : sales.map(function(s) {
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border);gap:12px">' +
          '<div>' +
            '<div style="font-weight:600;font-size:0.875rem;color:var(--text)">' + fmt(s.total) + ' — ' + s.items.length + ' producto' + (s.items.length > 1 ? 's' : '') + '</div>' +
            '<div style="font-size:0.72rem;color:var(--muted)">' + fmtDate(s.date) + ' · ' + s.userName + '</div>' +
          '</div>' +
          '<div style="display:flex;gap:6px">' +
            '<button data-saleid="' + s.saleId + '" class="hist-share-btn" style="background:var(--green);color:#c0f0b0;border:none;border-radius:8px;padding:7px 12px;font-size:0.75rem;font-weight:700;cursor:pointer">📱 Compartir</button>' +
            '<button data-saleid="' + s.saleId + '" class="hist-cancel-btn" style="background:rgba(248,113,113,0.12);color:#f87171;border:1px solid rgba(248,113,113,0.3);border-radius:8px;padding:7px 12px;font-size:0.75rem;font-weight:700;cursor:pointer">↩ Cancelar</button>' +
          '</div>' +
        '</div>';
      }).join('');

  modal.innerHTML =
    '<div style="background:var(--surface);border-radius:16px 16px 0 0;width:100%;max-width:560px;max-height:80vh;overflow-y:auto">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border)">' +
        '<h3 style="color:var(--text);font-size:1rem">🧾 Historial de Ventas</h3>' +
        '<button id="hist-close-btn" style="background:none;border:none;color:var(--muted);font-size:1.2rem;cursor:pointer">✕</button>' +
      '</div>' +
      listHTML +
    '</div>';

  modal.style.display = 'flex';

  modal.querySelector('#hist-close-btn').addEventListener('click', function() {
    modal.style.display = 'none';
  });

  modal.querySelectorAll('.hist-share-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var saleId = btn.getAttribute('data-saleid');
      var sale   = salesMap[saleId];
      if (!sale) return;
      var txt = '🛍️ *Ticket TALARA*\n📅 ' + fmtDate(sale.date) + '\n───────────────\n';
      sale.items.forEach(function(m){ txt += '• ' + m.productName + ' ×' + m.qty + ' → ' + fmt(m.total) + '\n'; });
      txt += '───────────────\n💰 Total: ' + fmt(sale.total) + '\nTALARA — Xalapa, Ver.';
      if (navigator.share) { navigator.share({ title: 'Ticket TALARA', text: txt }).catch(function(){}); }
      else { window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank'); }
    });
  });

  modal.querySelectorAll('.hist-cancel-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var saleId = btn.getAttribute('data-saleid');
      var sale   = salesMap[saleId];
      if (!sale) return;
      modal.style.display = 'none';
      abrirCancelacionVenta(sale);
    });
  });
};

// ========== CANCELAR VENTA DESDE HISTORIAL ==========
function abrirCancelacionVenta(sale) {
  var obs = prompt('Motivo de cancelación/reembolso de la venta del ' + fmtDateShort(sale.date) + ' (' + fmt(sale.total) + '):');
  if (!obs || !obs.trim()) return;
  var confirmacion = confirm('¿Reembolsar ' + fmt(sale.total) + ' y restaurar stock de ' + sale.items.length + ' producto(s)?');
  if (!confirmacion) return;

  var promises = sale.items.map(async function(m) {
    var p = getProduct(m.productId);
    if (p) {
      p.stock = (p.stock || 0) + m.qty;
      await saveToFirebase('products', p);
    }
  });

  Promise.all(promises).then(async function() {
    var mov = {
      id: uid(), productId: 'cancelacion', productName: 'Cancelación: venta ' + fmtDateShort(sale.date),
      type: 'gasto', qty: 1, price: sale.total, total: sale.total,
      date: new Date().toISOString(), obs: obs.trim(), tipoGasto: 'cancelacion',
      userId: activeUser.id, userName: activeUser.name, saleIdRef: sale.saleId
    };
    await saveToFirebase('movements', mov);
    showToast('↩ Venta cancelada y stock restaurado', 'success');
  });
}

document.getElementById('cart-clear')?.addEventListener('click', () => {
  cart = {}; renderSaleProductList(); renderCart();
});
document.getElementById('sale-search')?.addEventListener('input', renderSaleProductList);
document.querySelectorAll('.scat-btn').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.scat-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); renderSaleProductList();
  });
});

// ========== USUARIOS ==========
function renderUsers() {
  const container = document.getElementById('user-list');
  const label     = document.getElementById('user-count-label');
  if (!container) return;
  if (label) label.textContent = users.length + ' usuario' + (users.length !== 1 ? 's' : '') + ' con acceso';
  // Botón crear admin para SuperAdmin
  const btnCrearAdmin = document.getElementById('btn-crear-admin-super');
  if (isSuperAdmin() && !btnCrearAdmin) {
    const btn = document.createElement('button');
    btn.id = 'btn-crear-admin-super';
    btn.className = 'btn-primary';
    btn.style.cssText = 'margin-bottom:16px';
    btn.textContent = '⭐ Crear Admin con Proyecto';
    btn.onclick = window.abrirModalCrearAdmin;
    container.parentElement.insertBefore(btn, container);
  }
  if (users.length === 0) { container.innerHTML = '<div class="empty-state">Sin usuarios registrados.</div>'; return; }

  // Estadísticas de ventas por usuario
  const salesByUser = {};
  movements.filter(m => m.type === 'salida' && m.userId).forEach(m => {
    salesByUser[m.userId] = (salesByUser[m.userId] || 0) + (m.total || 0);
  });

  container.innerHTML = users.map(u => {
    const roleKey     = u.role === 'SuperAdmin' ? 'superadmin' : u.role === 'Admin' ? 'admin' : u.role === 'Usuario' ? 'usuario' : 'readonly';
    const roleLabel   = u.role === 'SuperAdmin' ? '⭐ SuperAdmin' : u.role;
    const initials    = u.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    const totalSales  = salesByUser[u.id] || 0;
    const isActive    = u.id === activeUser.id;
    // Solo SuperAdmin puede borrar Admins/SuperAdmins. Admin puede borrar Usuario/Solo lectura.
    const puedeBorrar = u.id !== activeUser.id && (
      isSuperAdmin() ? u.role !== 'SuperAdmin' || users.filter(x => x.role === 'SuperAdmin').length > 1 :
      canManageUsers() && !['Admin','SuperAdmin'].includes(u.role)
    );
    var avatarHTML = u.avatar
      ? '<img src="' + u.avatar + '" style="width:38px;height:38px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid var(--orange)" />'
      : '<div class="user-avatar" style="' + (isActive ? 'background:var(--orange)' : '') + '">' + initials + '</div>';
    return '<div class="user-item" style="' + (isActive ? 'background:rgba(224,123,57,0.06);' : '') + '">' +
      avatarHTML +
      '<div class="user-info">' +
        '<div class="user-name">' + escapeHtml(u.name) + (isActive ? ' <span style="font-size:0.68rem;color:var(--orange);font-weight:700">● activo</span>' : '') + '</div>' +
        '<div class="user-email">' + escapeHtml(u.email || '') + '</div>' +
        (totalSales > 0 ? '<div style="font-size:0.68rem;color:var(--success);margin-top:2px">Ventas: ' + fmt(totalSales) + '</div>' : '') +
      '</div>' +
      '<span class="badge badge-' + roleKey + '">' + roleLabel + '</span>' +
      (isSuperAdmin() ? '<button class="btn-icon" title="Cambiar rol" onclick="window.cambiarRol(\'' + u.id + '\')" style="font-size:0.8rem">⭐</button>' : '') +
      (puedeBorrar ?
        '<button class="btn-icon btn-danger" onclick="window.deleteUser(\'' + u.id + '\')">✕</button>' :
        '<span style="width:32px;display:inline-block"></span>') +
    '</div>';
  }).join('');

  // Actualizar selector de usuario activo
  const sel = document.getElementById('s-active-user');
  if (sel) {
    const currentVal = sel.value || activeUser.id;
    sel.innerHTML = users.map(u =>
      '<option value="' + u.id + '"' + (u.id === currentVal ? ' selected' : '') + '>' + u.name + ' (' + u.role + ')</option>'
    ).join('');
  }
}

window.cambiarPassword = async function(id) {
  var u = users.find(function(x){ return x.id === id; });
  if (!u) return;
  if (id !== activeUser.id && !canManageUsers()) {
    showToast('Solo puedes cambiar tu propia contraseña', 'error'); return;
  }
  var nueva = prompt('Nueva contraseña para ' + u.name + ':');
  if (!nueva || nueva.trim().length < 3) { showToast('Contraseña muy corta (mín. 3 caracteres)', 'error'); return; }
  await saveToFirebase('users', Object.assign({}, u, { password: nueva.trim() }));
  showToast('🔑 Contraseña actualizada para ' + u.name, 'success');
};

window.cambiarRol = async function(id) {
  if (!isSuperAdmin()) { showToast('Solo el SuperAdmin puede cambiar roles', 'error'); return; }
  var u = users.find(function(x){ return x.id === id; });
  if (!u) return;
  if (u.role === 'SuperAdmin' && users.filter(function(x){ return x.role === 'SuperAdmin'; }).length <= 1) {
    showToast('Debe existir al menos un SuperAdmin', 'error'); return;
  }
  var opciones = ['SuperAdmin', 'Admin', 'Usuario', 'Solo lectura'];
  var nuevo = prompt('Nuevo rol para ' + u.name + '\\nOpciones: ' + opciones.join(' / '), u.role);
  if (!nuevo || !opciones.includes(nuevo.trim())) { showToast('Rol inválido', 'error'); return; }
  await saveToFirebase('users', Object.assign({}, u, { role: nuevo.trim() }));
  showToast('Rol de ' + u.name + ' cambiado a ' + nuevo.trim(), 'success');
};

window.deleteUser = function(id) {
  if (!canManageUsers()) { showToast('Sin permiso', 'error'); return; }
  const u = users.find(x => x.id === id); if (!u) return;
  if (!confirm('¿Eliminar a "' + u.name + '"?')) return;
  deleteFromFirebase('users', id);
  showToast('Usuario "' + u.name + '" eliminado');
};

document.getElementById('user-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  if (!canManageUsers()) { showToast('Sin permiso', 'error'); return; }
  const name   = document.getElementById('u-name').value.trim();
  const email  = document.getElementById('u-email').value.trim().toLowerCase();
  const role   = document.getElementById('u-role').value;
  const pass   = document.getElementById('u-password')?.value.trim() || '1234';
  const avatar = window._newUserAvatar || '';
  if (!name || !email) { alert('Completa todos los campos'); return; }
  if (['SuperAdmin','Admin'].includes(role) && !isSuperAdmin()) {
    showToast('Solo un SuperAdmin puede crear cuentas Admin o SuperAdmin', 'error'); return;
  }
  if (users.find(u => u.email === email)) { alert('Ya existe un usuario con ese correo.'); return; }
  const u = { id: uid(), name, email, role, password: pass, avatar, date: new Date().toISOString() };
  window._newUserAvatar = '';
  const avPrev = document.getElementById('u-avatar-preview');
  const avRem  = document.getElementById('u-avatar-remove');
  if (avPrev) { avPrev.src = ''; avPrev.style.display = 'none'; }
  if (avRem)  avRem.style.display = 'none';
  await saveToFirebase('users', u);
  document.getElementById('user-form').reset();
  showToast('Usuario "' + name + '" agregado ✓', 'success');
});

// ========== AJUSTES ==========
function loadSettingsUI() {
  const name     = localStorage.getItem('store_name')     || 'Inventario';
  const subtitle = localStorage.getItem('store_subtitle') || 'Dulces & Pulseras';
  const el1 = document.getElementById('s-storename');
  const el2 = document.getElementById('s-subtitle');
  if (el1) el1.value = name;
  if (el2) el2.value = subtitle;

  // Selector de usuario activo
  const sel = document.getElementById('s-active-user');
  if (sel && users.length > 0) {
    sel.innerHTML = users.map(u =>
      '<option value="' + u.id + '"' + (u.id === activeUser.id ? ' selected' : '') + '>' + u.name + ' (' + u.role + ')</option>'
    ).join('');
    sel.onchange = () => {
      const u = users.find(x => x.id === sel.value);
      if (u) {
        activeUser = u;
        localStorage.setItem('active_user_id', u.id);
        showToast('👤 Usuario activo: ' + u.name, 'info');
        applyRoleRestrictions();
      }
    };
  }

  // Logos guardados
  const logoSidebar = localStorage.getItem('logo_sidebar');
  if (logoSidebar) applyLogoSidebar(logoSidebar);
  const logoMobile = localStorage.getItem('logo_mobile');
  if (logoMobile) applyLogoMobile(logoMobile);
}

document.getElementById('btn-save-settings')?.addEventListener('click', () => {
  const name     = document.getElementById('s-storename')?.value || 'Inventario';
  const subtitle = document.getElementById('s-subtitle')?.value  || 'Dulces & Pulseras';
  try {
    localStorage.setItem('store_name',     name);
    localStorage.setItem('store_subtitle', subtitle);
  } catch(e) {}
  document.querySelectorAll('.brand-title, .mobile-brand-title').forEach(el => el.textContent = name);
  document.querySelectorAll('.brand-sub, .mobile-brand-sub').forEach(el => el.textContent = subtitle);
  document.title = name + ' — Inventario';
  applyTheme();
  showToast('✅ Configuración guardada', 'success');
});

function applyTheme() {
  const theme  = localStorage.getItem('theme')  || 'dark';
  const accent = localStorage.getItem('accent') || '#e07b39';
  document.documentElement.style.setProperty('--orange', accent);
  document.documentElement.style.setProperty('--orange-dk', accent);
  const vars = theme === 'light'
    ? { '--bg':'#f5f5f5','--surface':'#ffffff','--surface2':'#f0f0f0','--border':'#e0e0e0','--text':'#1a1a1a','--muted':'#888888' }
    : { '--bg':'#141414','--surface':'#1e1e1e','--surface2':'#252525','--border':'#2e2e2e','--text':'#f0ece6','--muted':'#7a7570' };
  Object.entries(vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
}

function applyLogoSidebar(src) {
  const el = document.getElementById('sidebar-logo');
  if (!el) return;
  if (src) { el.src = src; el.classList.remove('hidden'); el.style.display = 'block'; }
  else     { el.classList.add('hidden'); el.style.display = 'none'; }
}
function applyLogoMobile(src) {
  const el = document.getElementById('mobile-logo');
  if (!el) return;
  if (src) { el.src = src; el.classList.remove('hidden'); el.style.cssText = 'display:block!important;width:42px;height:42px;object-fit:contain;border-radius:8px;flex-shrink:0'; }
  else     { el.classList.add('hidden'); el.style.display = 'none'; }
}

function setupLogoUpload(inputId, previewId, removeId, storageKey, applyFn) {
  const input   = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  const remBtn  = document.getElementById(removeId);
  if (!input) return;
  const saved = localStorage.getItem(storageKey);
  if (saved && preview) {
    preview.src = saved; preview.classList.remove('hidden');
    if (remBtn) remBtn.style.display = 'inline-block';
    if (applyFn) applyFn(saved);
  }
  input.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    showToast('⏳ Cargando...');
    const b64 = await comprimirImagen(file, 300, 0.85);
    try { localStorage.setItem(storageKey, b64); } catch(err) {}
    if (preview) { preview.src = b64; preview.classList.remove('hidden'); }
    if (remBtn) remBtn.style.display = 'inline-block';
    if (applyFn) applyFn(b64);
    showToast('✅ Logo guardado', 'success');
  });
  if (remBtn) {
    remBtn.addEventListener('click', () => {
      try { localStorage.removeItem(storageKey); } catch(err) {}
      if (preview) { preview.src = ''; preview.classList.add('hidden'); }
      remBtn.style.display = 'none'; input.value = '';
      if (applyFn) applyFn(null);
    });
  }
}

document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    try { localStorage.setItem('theme', btn.dataset.theme); } catch(e) {}
    applyTheme();
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (activeUser.id) {
      activeUser.theme = btn.dataset.theme;
      await saveToFirebase('users', activeUser);
    }
  });
});
document.querySelectorAll('.swatch').forEach(sw => {
  sw.addEventListener('click', async () => {
    const color = sw.dataset.color; if (!color) return;
    try { localStorage.setItem('accent', color); } catch(e) {}
    applyTheme();
    document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
    sw.classList.add('active');
    if (activeUser.id) {
      activeUser.accent = color;
      await saveToFirebase('users', activeUser);
    }
  });
});
document.getElementById('s-custom-color')?.addEventListener('input', async e => {
  try { localStorage.setItem('accent', e.target.value); } catch(e) {}
  applyTheme();
  if (activeUser.id) {
    activeUser.accent = e.target.value;
    await saveToFirebase('users', activeUser);
  }
});

// ========== REPORTES ==========
function initReportSelectors() {
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const now   = new Date();
  const mSel  = document.getElementById('r-month');
  const ySel  = document.getElementById('r-year');
  const dInp  = document.getElementById('r-date');
  if (mSel) mSel.innerHTML = meses.map((m, i) => '<option value="' + i + '"' + (i === now.getMonth() ? ' selected' : '') + '>' + m + '</option>').join('');
  if (ySel) ySel.innerHTML = [now.getFullYear(), now.getFullYear()-1].map(y => '<option value="' + y + '"' + (y === now.getFullYear() ? ' selected' : '') + '>' + y + '</option>').join('');
  if (dInp) {
    const y = now.getFullYear(), mo = String(now.getMonth()+1).padStart(2,'0'), d = String(now.getDate()).padStart(2,'0');
    dInp.value = y + '-' + mo + '-' + d;
  }
}

function getSalesByRange(from, to) {
  const base = getMovementsForView();
  return base.filter(m => { const d = new Date(m.date); return m.type === 'salida' && d >= from && d <= to; });
}

function groupByProduct(sales) {
  const map = {};
  sales.forEach(m => {
    const p = getProduct(m.productId);
    if (!map[m.productId]) map[m.productId] = {
      name: p ? p.name : (m.productName || '—'),
      category: p ? p.category : '—',
      qty: 0, revenue: 0, gain: 0
    };
    map[m.productId].qty     += m.qty;
    map[m.productId].revenue += (m.price || 0) * m.qty;
    if (p) map[m.productId].gain += ((m.price || 0) - (p.buyPrice || 0)) * m.qty;
  });
  return Object.values(map).sort((a, b) => b.revenue - a.revenue);
}

function groupBySeller(sales) {
  const map = {};
  sales.forEach(m => {
    const key = m.userId || 'desconocido';
    const name = m.userName || (getUser(m.userId)?.name) || 'Sin asignar';
    if (!map[key]) map[key] = { name, total: 0, qty: 0, txns: 0 };
    map[key].total += (m.price || 0) * m.qty;
    map[key].qty   += m.qty;
    map[key].txns  += 1;
  });
  return Object.values(map).sort((a, b) => b.total - a.total);
}

function buildReportHTML(title, subtitle, sales) {
  if (sales.length === 0) return '<div class="report-card"><div class="report-header"><div><div class="report-title">' + title + '</div><div class="report-subtitle">' + subtitle + '</div></div></div><div class="empty-state">Sin ventas en este período.</div></div>';

  const rows     = groupByProduct(sales);
  const sellers  = groupBySeller(sales);
  const totQty   = rows.reduce((s, r) => s + r.qty,     0);
  const totRev   = rows.reduce((s, r) => s + r.revenue, 0);
  const totGain  = rows.reduce((s, r) => s + r.gain,    0);
  const showGain = canViewGanancias();

  const tableRows = rows.map(r =>
    '<tr><td><span class="td-name">' + escapeHtml(r.name) + '</span></td>' +
    '<td><span class="badge ' + (r.category === 'dulce' ? 'badge-dulce' : 'badge-pulsera') + '">' + (r.category === 'dulce' ? 'Dulce' : 'Pulsera') + '</span></td>' +
    '<td>' + r.qty + '</td><td>' + fmt(r.revenue) + '</td>' +
    (showGain ? '<td class="td-gain">' + fmt(r.gain) + '</td>' : '') +
    '</tr>'
  ).join('');

  // Gráfica de barras simple (top 5 productos)
  var maxRev = rows.length > 0 ? rows[0].revenue : 1;
  var graficaHTML = '<div style="padding:16px 20px;border-bottom:1px solid var(--border)">' +
    '<div style="font-size:0.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Top productos</div>' +
    rows.slice(0, 5).map(function(r) {
      var pct = Math.max(4, Math.round((r.revenue / maxRev) * 100));
      return '<div style="margin-bottom:10px">' +
        '<div style="display:flex;justify-content:space-between;font-size:0.78rem;margin-bottom:3px">' +
          '<span style="color:var(--text);font-weight:500;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(r.name) + '</span>' +
          '<span style="color:var(--orange);font-weight:700">' + fmt(r.revenue) + '</span>' +
        '</div>' +
        '<div style="background:var(--surface2);border-radius:4px;height:8px">' +
          '<div style="width:' + pct + '%;height:100%;background:var(--orange);border-radius:4px;transition:width 0.4s"></div>' +
        '</div>' +
      '</div>';
    }).join('') +
  '</div>';

  const sellersHTML = sellers.length > 1
    ? '<div style="padding:16px 20px;border-bottom:1px solid var(--border)">' +
        '<div style="font-size:0.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Vendedores</div>' +
        sellers.map(s =>
          '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:0.82rem">' +
          '<span style="color:var(--text);font-weight:500">' + escapeHtml(s.name) + '</span>' +
          '<span style="color:var(--orange);font-weight:700">' + fmt(s.total) + '</span>' +
          '</div>'
        ).join('') +
      '</div>'
    : '';

  // Botones exportar
  const btnsHTML =
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn-ghost-sm" onclick="window._exportReportCSV()">⬇ CSV</button>' +
      '<button class="btn-ghost-sm" onclick="window._shareReportWA()">📱 WhatsApp</button>' +
      '<button class="btn-ghost-sm" onclick="window.print()">🖨️ Imprimir</button>' +
    '</div>';

  // Guardar datos para export
  window._lastReportData = { title, subtitle, rows, totQty, totRev, totGain };
  window._exportReportCSV = () => {
    const lines = [['Producto','Categoría','Unidades','Total','Ganancia']];
    rows.forEach(r => lines.push([r.name, r.category, r.qty, r.revenue.toFixed(2), r.gain.toFixed(2)]));
    lines.push(['', '', totQty, totRev.toFixed(2), totGain.toFixed(2)]);
    const csv = lines.map(l => l.map(v => '"' + String(v).replace(/"/g,'""') + '"').join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], {type:'text/csv'}));
    a.download = title.replace(/\s+/g,'-') + '.csv';
    a.click();
    showToast('✅ CSV descargado', 'success');
  };
  window._shareReportWA = () => {
    let txt = '📊 *' + title + '*\n📅 ' + subtitle + '\n───────────────\n';
    rows.forEach(r => { txt += '• ' + r.name + ' ×' + r.qty + ' → ' + fmt(r.revenue) + '\n'; });
    txt += '───────────────\n💰 Total: ' + fmt(totRev) + '\n✅ Ganancia: ' + fmt(totGain) + '\nTALARA Inventario';
    window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank');
  };

  return '<div class="report-card">' +
    '<div class="report-header"><div><div class="report-title">' + title + '</div><div class="report-subtitle">' + subtitle + '</div></div>' + btnsHTML + '</div>' +
    graficaHTML +
    '<div class="report-stats">' +
      '<div class="report-stat"><span class="report-stat-label">Productos</span><span class="report-stat-value">' + rows.length + '</span></div>' +
      '<div class="report-stat"><span class="report-stat-label">Unidades</span><span class="report-stat-value">' + totQty + '</span></div>' +
      '<div class="report-stat"><span class="report-stat-label orange">Total</span><span class="report-stat-value orange">' + fmt(totRev) + '</span></div>' +
      (showGain ? '<div class="report-stat"><span class="report-stat-label green">Ganancia</span><span class="report-stat-value green">' + fmt(totGain) + '</span></div>' : '') +
    '</div>' + sellersHTML +
    '<div class="table-scroll"><table><thead><tr><th>Producto</th><th>Categoría</th><th>Uds.</th><th>Total</th>' + (showGain ? '<th>Ganancia</th>' : '') + '</tr></thead><tbody>' + tableRows + '</tbody></table></div>' +
  '</div>';
}

document.getElementById('btn-gen-daily')?.addEventListener('click', () => {
  const dateStr = document.getElementById('r-date')?.value; if (!dateStr) return;
  const from  = new Date(dateStr + 'T00:00:00');
  const to    = new Date(dateStr + 'T23:59:59');
  const sales = getSalesByRange(from, to);
  const label = new Date(dateStr).toLocaleDateString('es-MX', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  const out   = document.getElementById('report-daily-out');
  if (out) out.innerHTML = buildReportHTML('Reporte Diario', label, sales);
});

document.getElementById('btn-gen-monthly')?.addEventListener('click', () => {
  const month = parseInt(document.getElementById('r-month')?.value);
  const year  = parseInt(document.getElementById('r-year')?.value);
  const from  = new Date(year, month, 1);
  const to    = new Date(year, month + 1, 0, 23, 59, 59);
  const sales = getSalesByRange(from, to);
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const out   = document.getElementById('report-monthly-out');
  if (out) out.innerHTML = buildReportHTML('Reporte Mensual', meses[month] + ' ' + year, sales);
});

// ========== EXPORTAR / RESET ==========
document.getElementById('btn-export')?.addEventListener('click', () => {
  const data = { products, movements, users, exportDate: new Date().toISOString() };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = 'talara-backup-' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  showToast('✅ Datos exportados', 'success');
});

document.getElementById('btn-reset')?.addEventListener('click', () => {
  if (!confirm('¿Restablecer ajustes visuales? Los datos en Firebase NO se borran.')) return;
  localStorage.clear(); location.reload();
});
document.getElementById('btn-logout')?.addEventListener('click', () => {
  if (!confirm('¿Cerrar sesión?')) return;
  // Limpiar usuario activo
  localStorage.removeItem('active_user_id');
  activeUser = { id: '', name: '', role: '' };
  mostrarPantallaLogin();
});

// ========== CARGA MASIVA CSV ==========
let bulkParsed = [];

document.getElementById('bulk-download-template')?.addEventListener('click', () => {
  const csv = ['nombre,categoria,stock,precio_compra,precio_venta,descripcion','Mazapán de Rosa,dulce,20,5,12,Dulce tradicional','Pulsera Chaquira,pulsera,10,20,55,Pulsera de chaquiras'].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv' }));
  a.download = 'plantilla_productos.csv'; a.click();
});

document.getElementById('bulk-file')?.addEventListener('change', function(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    parseBulkCSV(ev.target.result);
    document.getElementById('bulk-overlay')?.classList.remove('hidden');
  };
  reader.readAsText(file, 'UTF-8');
});

function parseBulkCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim());
  const start = /nombre|name/i.test(lines[0]) ? 1 : 0;
  bulkParsed = [];
  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
    const cat  = cols[1]?.toLowerCase().includes('dulce') ? 'dulce' : cols[1]?.toLowerCase().includes('pulsera') ? 'pulsera' : '';
    const row  = { name: cols[0]||'', category: cat, stock: parseInt(cols[2])||0, buyPrice: parseFloat(cols[3])||0, sellPrice: parseFloat(cols[4])||0, desc: cols[5]||'', _line: i+1, _errors: [] };
    if (!row.name)     row._errors.push('Nombre vacío');
    if (!row.category) row._errors.push('Categoría inválida');
    if (row.sellPrice < row.buyPrice) row._errors.push('Precio venta < compra');
    bulkParsed.push(row);
  }
  renderBulkPreview();
}

function renderBulkPreview() {
  const valid = bulkParsed.filter(r => !r._errors.length);
  const cs = document.getElementById('bulk-count');
  if (cs) cs.textContent = bulkParsed.length + ' filas — ' + valid.length + ' válidas';
  const tbody = document.getElementById('bulk-preview-body');
  if (tbody) tbody.innerHTML = bulkParsed.map(r =>
    '<tr class="' + (r._errors.length ? 'bulk-row-error' : 'bulk-row-ok') + '">' +
    '<td>' + r._line + '</td><td>' + escapeHtml(r.name) + '</td><td>' + r.category + '</td>' +
    '<td>' + r.stock + '</td><td>' + r.buyPrice + '</td><td>' + r.sellPrice + '</td>' +
    '<td>' + escapeHtml(r.desc).substring(0,30) + '</td>' +
    '<td>' + (r._errors.length ? '<span class="bulk-status-error">✕ ' + r._errors[0] + '</span>' : '<span class="bulk-status-ok">✓ OK</span>') + '</td>' +
    '</tr>'
  ).join('');
  document.getElementById('bulk-preview-wrap')?.classList.remove('hidden');
  const confirmBtn = document.getElementById('bulk-confirm');
  if (confirmBtn) confirmBtn.disabled = valid.length === 0;
}

document.getElementById('bulk-confirm')?.addEventListener('click', async () => {
  const valid = bulkParsed.filter(r => !r._errors.length);
  showToast('⏳ Importando ' + valid.length + ' productos...');
  for (const r of valid) {
    await saveToFirebase('products', { id: uid(), name: r.name, category: r.category, stock: r.stock, buyPrice: r.buyPrice, sellPrice: r.sellPrice, desc: r.desc });
  }
  closeBulkModal();
  showToast('✅ ' + valid.length + ' productos importados', 'success');
});

function closeBulkModal() {
  document.getElementById('bulk-overlay')?.classList.add('hidden');
  document.getElementById('bulk-preview-wrap')?.classList.add('hidden');
  bulkParsed = [];
}
document.getElementById('bulk-close')?.addEventListener('click', closeBulkModal);
document.getElementById('bulk-cancel')?.addEventListener('click', closeBulkModal);

// ========== NAVEGACIÓN GENERAL ==========
document.querySelectorAll('.nav-item, .bnav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    const view = item.dataset.view; if (view) navigate(view);
  });
});
document.getElementById('search')?.addEventListener('input', renderInventory);
document.getElementById('filter-category')?.addEventListener('change', renderInventory);
document.getElementById('filter-mov-type')?.addEventListener('change', renderMovements);
document.getElementById('close-modal')?.addEventListener('click', window.closeMovModal);
document.getElementById('modal-overlay')?.addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) window.closeMovModal();
});

// Menú móvil "Más"
const moreBtn  = document.getElementById('bnav-more-btn');
const moreMenu = document.getElementById('bnav-more-menu');
if (moreBtn && moreMenu) {
  moreBtn.addEventListener('click', e => { e.stopPropagation(); moreMenu.classList.toggle('hidden'); });
  document.addEventListener('click', () => moreMenu.classList.add('hidden'));
  document.querySelectorAll('.bnav-more-item').forEach(item => {
    item.addEventListener('click', () => { moreMenu.classList.add('hidden'); const v = item.dataset.view; if (v) navigate(v); });
  });
  document.getElementById('bnav-logout-btn')?.addEventListener('click', () => {
    if (!confirm('¿Cerrar sesión?')) return;
    localStorage.removeItem('active_user_id');
    activeUser = { id: '', name: '', role: '' };
    mostrarPantallaLogin();
  });
}

// Tabs reportes
document.querySelectorAll('.rtab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.rtab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.rtab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    const target = document.getElementById('rtab-' + tab.dataset.rtab);
    if (target) target.classList.add('active');
  });
});


// ========== PANTALLA DE INICIO DE SESIÓN ==========
function mostrarPantallaLogin(errorMsg) {
  var screen = document.getElementById('login-screen');
  if (!screen) {
    screen = document.createElement('div');
    screen.id = 'login-screen';
    screen.style.cssText = 'position:fixed;inset:0;background:var(--bg);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px';
    document.body.appendChild(screen);
  }

  var storeName = localStorage.getItem('store_name') || 'Inventario';
  var storeSub  = localStorage.getItem('store_subtitle') || 'Dulces & Pulseras';

  var usersHTML = '';
  if (users.length > 0) {
    for (var i = 0; i < users.length; i++) {
      var u = users[i];
      var initials = u.name.split(' ').map(function(w){return w[0];}).slice(0,2).join('').toUpperCase();
      usersHTML += '<option value="' + u.id + '">' + u.name + ' (' + u.role + ')</option>';
    }
  }

  var errorHTML = errorMsg
    ? '<div style="background:rgba(248,113,113,0.12);border:1px solid rgba(248,113,113,0.3);color:#f87171;border-radius:8px;padding:10px 14px;font-size:0.82rem;margin-bottom:14px">' + errorMsg + '</div>'
    : '';

  screen.innerHTML =
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:32px 28px;width:100%;max-width:360px;box-shadow:0 8px 40px rgba(0,0,0,0.4)">' +
      '<div style="text-align:center;margin-bottom:28px">' +
        '<div style="width:56px;height:56px;border-radius:14px;background:var(--orange);color:#fff;font-size:1.6rem;font-weight:900;display:flex;align-items:center;justify-content:center;margin:0 auto 12px">I</div>' +
        '<div style="font-size:1.3rem;font-weight:800;color:var(--text)">' + storeName + '</div>' +
        '<div style="font-size:0.78rem;color:var(--muted);margin-top:3px">' + storeSub + '</div>' +
      '</div>' +
      errorHTML +
      '<div style="margin-bottom:14px">' +
        '<label style="font-size:0.72rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:6px">Usuario</label>' +
        '<select id="login-user-select" style="width:100%;padding:11px 13px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:inherit;font-size:0.95rem">' +
          usersHTML +
        '</select>' +
      '</div>' +
      '<div style="margin-bottom:20px">' +
        '<label style="font-size:0.72rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:6px">Contraseña</label>' +
        '<input type="password" id="login-password" placeholder="Ingresa tu contraseña" ' +
          'style="width:100%;padding:11px 13px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:inherit;font-size:1rem" />' +
        '<div style="font-size:0.7rem;color:var(--muted);margin-top:6px">Primera vez: usa <strong style="color:var(--orange)">1234</strong> como contraseña</div>' +
      '</div>' +
      '<button id="login-btn-entrar" style="width:100%;padding:13px;background:var(--orange);color:#fff;border:none;border-radius:10px;font-size:0.95rem;font-weight:700;cursor:pointer;font-family:inherit">Entrar →</button>' +
    '</div>';

  screen.style.display = 'flex';

  var passInput = screen.querySelector('#login-password');
  var btnEntrar = screen.querySelector('#login-btn-entrar');

  function intentarLogin() {
    var userId = screen.querySelector('#login-user-select').value;
    var pass   = passInput.value;
    var u = users.find(function(x){ return x.id === userId; });
    if (!u) { mostrarPantallaLogin('Usuario no encontrado'); return; }
    var savedPass = u.password || '1234';
    if (pass !== savedPass) { mostrarPantallaLogin('Contraseña incorrecta'); return; }
    activeUser = u;
    localStorage.setItem('active_user_id', u.id);
    screen.style.display = 'none';
    applyRoleRestrictions();
    navigate('panel');
    showToast('Bienvenido, ' + u.name, 'success');
  }

  btnEntrar.addEventListener('click', intentarLogin);
  passInput.addEventListener('keydown', function(e){ if (e.key === 'Enter') intentarLogin(); });
}

window.seleccionarUsuario = function(userId) {
  const u = users.find(x => x.id === userId);
  if (!u) return;
  activeUser = u;
  localStorage.setItem('active_user_id', userId);
  // Aplicar tema y color propios de este usuario, si los tiene guardados
  if (u.theme)  { try { localStorage.setItem('theme', u.theme); } catch(e) {} }
  if (u.accent) { try { localStorage.setItem('accent', u.accent); } catch(e) {} }
  applyTheme();
  const screen = document.getElementById('login-screen');
  if (screen) screen.style.display = 'none';
  applyRoleRestrictions();
  navigate('panel');
  showToast('👤 Bienvenido, ' + u.name, 'success');
};

// ========== INICIALIZAR ==========
document.addEventListener('DOMContentLoaded', () => {
  // Limpiar localStorage datos grandes (todo va a Firebase)
  try { localStorage.removeItem('products'); localStorage.removeItem('movements'); } catch(e) {}

  // Cargar usuario activo
  const savedUserId = localStorage.getItem('active_user_id');
  if (savedUserId) activeUser.id = savedUserId;
  // Si no hay usuario guardado, mostrar pantalla de login después de cargar Firebase


  applyTheme();
  initReportSelectors();

  // Aplicar nombre guardado
  const savedName = localStorage.getItem('store_name');
  const savedSub  = localStorage.getItem('store_subtitle');
  if (savedName) {
    document.querySelectorAll('.brand-title, .mobile-brand-title').forEach(el => el.textContent = savedName);
    document.title = savedName + ' — Inventario';
  }
  if (savedSub) {
    document.querySelectorAll('.brand-sub, .mobile-brand-sub').forEach(el => el.textContent = savedSub);
  }

  // Logos
  const logoSidebar = localStorage.getItem('logo_sidebar');
  if (logoSidebar) applyLogoSidebar(logoSidebar);
  const logoMobile = localStorage.getItem('logo_mobile');
  if (logoMobile) applyLogoMobile(logoMobile);

  // Crear modales
  crearModalGasto();
  iniciarBotonesCarrito();

  // Setup logo uploads
  setupLogoUpload('s-logo',        'logo-preview',        'remove-logo',        'logo_sidebar', applyLogoSidebar);
  setupLogoUpload('s-logo-mobile', 'logo-mobile-preview', 'remove-logo-mobile', 'logo_mobile',  applyLogoMobile);

  // Imagen de fondo
  const bgSaved = localStorage.getItem('bg_image');
  if (bgSaved) {
    const content = document.querySelector('.content');
    if (content) { content.style.backgroundImage = 'url(' + bgSaved + ')'; content.style.backgroundSize = 'cover'; }
  }
  document.getElementById('s-bg')?.addEventListener('change', async function(e) {
    const file = e.target.files[0]; if (!file) return;
    const b64 = await comprimirImagen(file, 1200, 0.7);
    try { localStorage.setItem('bg_image', b64); } catch(err) { showToast('Imagen muy grande', 'error'); return; }
    const content = document.querySelector('.content');
    if (content) { content.style.backgroundImage = 'url(' + b64 + ')'; content.style.backgroundSize = 'cover'; }
    const preview = document.getElementById('bg-preview');
    if (preview) { preview.src = b64; preview.classList.remove('hidden'); }
    document.getElementById('remove-bg') && (document.getElementById('remove-bg').style.display = 'inline-block');
    showToast('✅ Fondo guardado', 'success');
  });
  document.getElementById('remove-bg')?.addEventListener('click', () => {
    try { localStorage.removeItem('bg_image'); } catch(e) {}
    const content = document.querySelector('.content');
    if (content) content.style.backgroundImage = 'none';
    const preview = document.getElementById('bg-preview');
    if (preview) { preview.src = ''; preview.classList.add('hidden'); }
    document.getElementById('remove-bg').style.display = 'none';
  });

  // Setup avatar de usuario nuevo
  (function() {
    const input   = document.getElementById('u-avatar');
    const preview = document.getElementById('u-avatar-preview');
    const remBtn  = document.getElementById('u-avatar-remove');
    if (!input) return;
    input.addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      const b64 = await comprimirImagen(file, 200, 0.85);
      window._newUserAvatar = b64;
      if (preview) { preview.src = b64; preview.style.display = 'inline-block'; }
      if (remBtn) remBtn.style.display = 'inline-block';
    });
    if (remBtn) {
      remBtn.addEventListener('click', () => {
        window._newUserAvatar = '';
        if (preview) { preview.src = ''; preview.style.display = 'none'; }
        remBtn.style.display = 'none'; input.value = '';
      });
    }
  })();

  // Setup imágenes del formulario de productos
  [0, 1, 2].forEach(slot => {
    const input   = document.getElementById('f-img-' + slot);
    const preview = document.getElementById('f-img-preview-' + slot);
    const holder  = document.getElementById('f-img-placeholder-' + slot);
    const remBtn  = document.getElementById('f-img-remove-' + slot);
    if (!input) return;
    input.addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      showToast('⏳ Comprimiendo...');
      const b64 = await comprimirImagen(file);
      productImages[slot] = b64;
      if (preview) { preview.src = b64; preview.classList.remove('hidden'); }
      if (holder)  holder.classList.add('hidden');
      if (remBtn)  remBtn.style.display = 'inline-block';
      showToast('✅ Imagen lista', 'success');
    });
    if (remBtn) {
      remBtn.addEventListener('click', () => {
        productImages[slot] = '';
        if (preview) { preview.src = ''; preview.classList.add('hidden'); }
        if (holder)  holder.classList.remove('hidden');
        remBtn.style.display = 'none'; input.value = '';
      });
    }
  });

  // Color activo en swatches
  const savedAccent = localStorage.getItem('accent');
  if (savedAccent) {
    document.querySelectorAll('.swatch').forEach(s => {
      if (s.dataset.color === savedAccent) {
        document.querySelectorAll('.swatch').forEach(sw => sw.classList.remove('active'));
        s.classList.add('active');
      }
    });
  }

  loadSettingsUI();
  navigate('panel');
  setTimeout(hideSplash, 600);

  // Firebase
  iniciarSync();
});
