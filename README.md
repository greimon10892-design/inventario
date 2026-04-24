
/index.html
  Cache-Control: no-cache, no-store, must-revalidate

/sw.js
  Cache-Control: no-cache, no-store, must-revalidate

// ── Helpers ────────────────────────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function fmt(n) { return '$' + Number(n).toFixed(2); }
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}
function getProduct(id) { return products.find(p => p.id === id); }

// ── State ──────────────────────────────────────────────────────────────────
let products  = JSON.parse(localStorage.getItem('inv_products')  || '[]');
let movements = JSON.parse(localStorage.getItem('inv_movements') || '[]');
let users     = JSON.parse(localStorage.getItem('inv_users')     || '[]');

// Guarda localmente Y en Firebase si está disponible
function save() {
  localStorage.setItem('inv_products',  JSON.stringify(products));
  localStorage.setItem('inv_movements', JSON.stringify(movements));
  localStorage.setItem('inv_users',     JSON.stringify(users));
}

function localSave() { save(); }

// ── Seed ───────────────────────────────────────────────────────────────────
const SEED_USERS = [
  { id: 'admin', name: 'Administrador', email: 'admin@inventario.com', role: 'Admin', date: new Date().toISOString() }
];
const SEED_PRODUCTS = [
  { id: uid(), name: 'Mazapán de Rosa',     category: 'dulce',   stock: 30, buyPrice: 5,  sellPrice: 12, desc: 'Dulce tradicional mexicano' },
  { id: uid(), name: 'Cocada de Coco',       category: 'dulce',   stock: 20, buyPrice: 8,  sellPrice: 18, desc: 'Cocada artesanal' },
  { id: uid(), name: 'Tamarindo Enchilado',  category: 'dulce',   stock: 4,  buyPrice: 3,  sellPrice: 7,  desc: 'Dulce picante de tamarindo' },
  { id: uid(), name: 'Pulsera Chaquira',     category: 'pulsera', stock: 15, buyPrice: 20, sellPrice: 55, desc: 'Pulsera de chaquiras de colores' },
  { id: uid(), name: 'Pulsera Macramé',      category: 'pulsera', stock: 3,  buyPrice: 15, sellPrice: 45, desc: 'Tejido artesanal macramé' },
  { id: uid(), name: 'Pulsera Hilo Bordado', category: 'pulsera', stock: 25, buyPrice: 10, sellPrice: 30, desc: 'Hilo de colores bordado a mano' },
];

async function seedLocalIfEmpty() {
  if (users.length === 0) {
    users = SEED_USERS;
    localStorage.setItem('inv_users', JSON.stringify(users));
  }
  if (products.length === 0) {
    products = SEED_PRODUCTS;
    localStorage.setItem('inv_products', JSON.stringify(products));
  }
}

// ── Navigation ─────────────────────────────────────────────────────────────
function navigate(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.bnav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('view-' + view).classList.remove('hidden');
  const sideItem = document.querySelector(`.nav-item[data-view="${view}"]`);
  if (sideItem) sideItem.classList.add('active');
  const bnavItem = document.querySelector(`.bnav-item[data-view="${view}"]`);
  if (bnavItem) bnavItem.classList.add('active');
  window.scrollTo(0, 0);
  if (view === 'ajustes') loadSettingsUI();
  else if (view === 'ventas') { initSaleView(); }
  else renderAll();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => { e.preventDefault(); navigate(item.dataset.view); });
});
document.querySelectorAll('.bnav-item').forEach(item => {
  item.addEventListener('click', () => navigate(item.dataset.view));
});

// Menú "Más" del bottom nav
const moreBtn  = document.getElementById('bnav-more-btn');
const moreMenu = document.getElementById('bnav-more-menu');

moreBtn.addEventListener('click', e => {
  e.stopPropagation();
  moreMenu.classList.toggle('hidden');
});

document.querySelectorAll('.bnav-more-item').forEach(item => {
  item.addEventListener('click', () => {
    moreMenu.classList.add('hidden');
    navigate(item.dataset.view);
  });
});

document.addEventListener('click', () => moreMenu.classList.add('hidden'));

// ── Summary ────────────────────────────────────────────────────────────────
function updateSummary() {
  document.getElementById('total-products').textContent  = products.length;
  document.getElementById('total-inversion').textContent =
    fmt(products.reduce((s, p) => s + p.buyPrice * p.stock, 0));
  document.getElementById('total-ganancia').textContent  =
    fmt(products.reduce((s, p) => s + (p.sellPrice - p.buyPrice) * p.stock, 0));
  document.getElementById('total-vendido').textContent   =
    fmt(movements.filter(m => m.type === 'salida').reduce((s, m) => s + m.price * m.qty, 0));

  const low = products.filter(p => p.stock <= 5);
  const el  = document.getElementById('low-stock-list');
  el.innerHTML = low.length === 0
    ? '<div class="empty-state">Sin productos con bajo stock.</div>'
    : low.map(p => `
        <div class="low-stock-item">
          <span class="low-stock-name">${p.name}</span>
          <span class="low-stock-qty">${p.stock} uds.</span>
        </div>`).join('');
}

// ── Inventory ──────────────────────────────────────────────────────────────
function renderInventory() {
  const search = (document.getElementById('search').value || '').toLowerCase();
  const cat    = document.getElementById('filter-category').value;
  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search) && (cat ? p.category === cat : true)
  );

  const tbody = document.getElementById('inventory-body');
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">No se encontraron productos.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const gain = p.sellPrice - p.buyPrice;
    const catBadge = p.category === 'dulce'
      ? '<span class="badge badge-dulce">Dulce</span>'
      : '<span class="badge badge-pulsera">Pulsera</span>';
    return `<tr>
      <td>
        <span class="td-name">${p.name}</span>
        ${p.desc ? `<span class="td-sub">${p.desc}</span>` : ''}
      </td>
      <td>${catBadge}</td>
      <td class="${p.stock <= 5 ? 'stock-low' : ''}">${p.stock}</td>
      <td>${fmt(p.buyPrice)}</td>
      <td>${fmt(p.sellPrice)}</td>
      <td class="td-gain">${fmt(gain)}</td>
      <td class="td-actions">
        <button class="btn-icon btn-entrada-product" title="Entrada"  onclick="openModal('${p.id}','entrada')">↓</button>
        <button class="btn-icon btn-salida-product"  title="Salida"   onclick="openModal('${p.id}','salida')">↑</button>
        <button class="btn-icon btn-edit-product"    title="Editar"   onclick="editProduct('${p.id}')">✎</button>
        <button class="btn-icon btn-danger btn-delete-product" title="Eliminar" onclick="deleteProduct('${p.id}')">✕</button>
      </td>
    </tr>`;
  }).join('');
}

// ── Movements ──────────────────────────────────────────────────────────────
function renderMovements() {
  const typeFilter = document.getElementById('filter-mov-type').value;
  const filtered   = movements
    .filter(m => typeFilter ? m.type === typeFilter : true)
    .slice().reverse();

  const tbody = document.getElementById('mov-body');
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">Sin movimientos registrados.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(m => {
    const p    = getProduct(m.productId);
    const name = p ? p.name : m.productName;
    const typeBadge = m.type === 'entrada'
      ? '<span class="badge badge-entrada">Entrada</span>'
      : '<span class="badge badge-salida">Salida</span>';
    const gainCell = m.type === 'salida' && p
      ? `<span class="td-gain">${fmt((p.sellPrice - p.buyPrice) * m.qty)}</span>`
      : '<span style="color:var(--muted)">—</span>';
    return `<tr>
      <td class="td-date">${fmtDate(m.date)}</td>
      <td class="td-name">${name}</td>
      <td>${typeBadge}</td>
      <td>${m.qty}</td>
      <td>${fmt(m.price)}</td>
      <td>${fmt(m.price * m.qty)}</td>
      <td>${gainCell}</td>
    </tr>`;
  }).join('');
}

// ── Render all ─────────────────────────────────────────────────────────────
function renderAll() {
  updateSummary();
  renderInventory();
  renderMovements();
  renderUsers();
  applyPrivileges();
}

// ── Filters ────────────────────────────────────────────────────────────────
document.getElementById('search').addEventListener('input', renderInventory);
document.getElementById('filter-category').addEventListener('change', renderInventory);
document.getElementById('filter-mov-type').addEventListener('change', renderMovements);

// ── Product form ───────────────────────────────────────────────────────────
document.getElementById('product-form').addEventListener('submit', e => {
  e.preventDefault();
  const editId = document.getElementById('edit-id').value;
  const data = {
    name:      document.getElementById('f-name').value.trim(),
    category:  document.getElementById('f-category').value,
    stock:     parseInt(document.getElementById('f-stock').value),
    buyPrice:  parseFloat(document.getElementById('f-buy').value),
    sellPrice: parseFloat(document.getElementById('f-sell').value),
    desc:      document.getElementById('f-desc').value.trim(),
  };
  if (data.sellPrice < data.buyPrice) {
    alert('El precio de venta no puede ser menor al precio de compra.');
    return;
  }
  if (editId) {
    const idx = products.findIndex(p => p.id === editId);
    products[idx] = { ...products[idx], ...data };
    saveItem('products', products[idx]);
  } else {
    const newP = { id: uid(), ...data };
    saveItem('products', newP);
  }
  resetForm();
  navigate('productos');
});

function resetForm() {
  document.getElementById('edit-id').value = '';
  document.getElementById('form-title').textContent = 'Nuevo Producto';
  document.getElementById('product-form').reset();
  document.getElementById('cancel-edit').style.display = 'none';
}

document.getElementById('cancel-edit').addEventListener('click', () => {
  resetForm();
  navigate('productos');
});

function editProduct(id) {
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
  navigate('agregar');
}

function deleteProduct(id) {
  const p = getProduct(id);
  if (!p) return;
  if (!confirm(`¿Eliminar "${p.name}"?`)) return;
  deleteItem('products', id);
  renderAll();
}

// ── Modal ──────────────────────────────────────────────────────────────────
function openModal(productId, type) {
  const p = getProduct(productId);
  if (!p) return;
  document.getElementById('m-product-id').value   = productId;
  document.getElementById('m-product-name').value = p.name;
  document.getElementById('m-type').value         = type;
  document.getElementById('m-qty').value          = 1;
  document.getElementById('m-price').value        = type === 'salida' ? p.sellPrice : p.buyPrice;
  document.getElementById('m-price-label').textContent =
    type === 'salida' ? 'Precio de Venta ($)' : 'Precio de Compra ($)';
  document.getElementById('modal-title').textContent =
    type === 'entrada' ? 'Registrar entrada' : 'Registrar salida';
  document.getElementById('modal-overlay').classList.remove('hidden');
}

document.getElementById('m-type').addEventListener('change', function () {
  const p = getProduct(document.getElementById('m-product-id').value);
  if (!p) return;
  const isSalida = this.value === 'salida';
  document.getElementById('m-price').value = isSalida ? p.sellPrice : p.buyPrice;
  document.getElementById('m-price-label').textContent =
    isSalida ? 'Precio de Venta ($)' : 'Precio de Compra ($)';
});

document.getElementById('close-modal').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});
function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

document.getElementById('mov-form').addEventListener('submit', e => {
  e.preventDefault();
  const productId = document.getElementById('m-product-id').value;
  const type      = document.getElementById('m-type').value;
  const qty       = parseInt(document.getElementById('m-qty').value);
  const price     = parseFloat(document.getElementById('m-price').value);
  const p         = getProduct(productId);
  if (!p) return;
  if (type === 'salida' && qty > p.stock) {
    alert(`Stock insuficiente. Solo hay ${p.stock} unidades.`);
    return;
  }
  p.stock += type === 'entrada' ? qty : -qty;
  const mov = { id: uid(), productId, productName: p.name, type, qty, price, date: new Date().toISOString() };
  saveItem('products',  p);
  saveItem('movements', mov);
  closeModal();
  renderAll();
});

// ── Users ──────────────────────────────────────────────────────────────────
function renderUsers() {
  const list  = document.getElementById('user-list');
  const label = document.getElementById('user-count-label');
  label.textContent = `${users.length} usuario${users.length !== 1 ? 's' : ''} con acceso`;

  if (users.length === 0) {
    list.innerHTML = '<div class="empty-state">Sin usuarios registrados.</div>';
    return;
  }

  list.innerHTML = users.map(u => {
    const initials = u.name.split(' ').map(w => w[0]).slice(0, 2).join('');
    const roleKey  = u.role === 'Admin' ? 'admin' : u.role === 'Usuario' ? 'usuario' : 'readonly';
    return `<div class="user-item">
      <div class="user-avatar">${initials}</div>
      <div class="user-info">
        <div class="user-name">${u.name}</div>
        <div class="user-email">${u.email}</div>
      </div>
      <span class="badge badge-${roleKey}">${u.role}</span>
      ${u.role !== 'Admin'
        ? `<button class="btn-icon btn-danger btn-delete-user" title="Eliminar" onclick="deleteUser('${u.id}')">✕</button>`
        : '<span style="width:32px;display:inline-block"></span>'}
    </div>`;
  }).join('');
}

document.getElementById('user-form').addEventListener('submit', e => {
  e.preventDefault();
  const name  = document.getElementById('u-name').value.trim();
  const email = document.getElementById('u-email').value.trim().toLowerCase();
  const role  = document.getElementById('u-role').value;
  if (users.find(u => u.email === email)) {
    alert('Ya existe un usuario con ese correo.');
    return;
  }
  const newUser = { id: uid(), name, email, role, date: new Date().toISOString() };
  saveItem('users', newUser);
  document.getElementById('user-form').reset();
  renderUsers();
});

function deleteUser(id) {
  const u = users.find(x => x.id === id);
  if (!u) return;
  if (!confirm(`¿Eliminar a "${u.name}"?`)) return;
  deleteItem('users', id);
  renderUsers();
}

// ── Sales — Product List + Cart ────────────────────────────────────────────
let cart = {}; // { productId: qty }
let saleSearchFilter = '';
let saleCatFilter    = '';

function initSaleView() {
  initReportSelectors();
  saleSearchFilter = '';
  saleCatFilter    = '';
  document.getElementById('sale-search').value = '';
  document.querySelectorAll('.scat-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === ''));
  renderSaleProductList();
  renderCart();
}

function renderSaleProductList() {
  const el = document.getElementById('sale-product-list');
  const q  = saleSearchFilter.toLowerCase();
  const filtered = products.filter(p =>
    (!saleCatFilter || p.category === saleCatFilter) &&
    (!q || p.name.toLowerCase().includes(q))
  );

  if (filtered.length === 0) {
    el.innerHTML = '<div class="empty-state">Sin productos.</div>';
    return;
  }

  el.innerHTML = filtered.map(p => {
    const qty    = cart[p.id] || 0;
    const inCart = qty > 0;
    const noStock = p.stock <= 0;
    const catBadge = p.category === 'dulce'
      ? '<span class="badge badge-dulce" style="font-size:0.65rem">Dulce</span>'
      : '<span class="badge badge-pulsera" style="font-size:0.65rem">Pulsera</span>';
    return `<div class="sale-product-item ${inCart?'in-cart':''} ${noStock?'out-of-stock':''}" data-id="${p.id}">
      <div class="sale-product-info">
        <div class="sale-product-name">${p.name}</div>
        <div class="sale-product-meta">${catBadge} &nbsp;Stock: ${p.stock}</div>
      </div>
      <span class="sale-product-price">${fmt(p.sellPrice)}</span>
      <div class="sale-qty-ctrl">
        <button class="sale-qty-btn" onclick="cartChange('${p.id}',-1)">−</button>
        <input class="sale-qty-val" type="number" min="0" max="${p.stock}"
          value="${qty}" onchange="cartSet('${p.id}',this.value)" />
        <button class="sale-qty-btn" onclick="cartChange('${p.id}',1)">+</button>
      </div>
    </div>`;
  }).join('');
}

function cartChange(id, delta) {
  const p = getProduct(id); if (!p) return;
  const nxt = Math.max(0, Math.min(p.stock, (cart[id]||0) + delta));
  if (nxt === 0) delete cart[id]; else cart[id] = nxt;
  renderSaleProductList(); renderCart();
}

function cartSet(id, val) {
  const p = getProduct(id); if (!p) return;
  const n = Math.max(0, Math.min(p.stock, parseInt(val)||0));
  if (n === 0) delete cart[id]; else cart[id] = n;
  renderSaleProductList(); renderCart();
}

function renderCart() {
  const el  = document.getElementById('cart-items');
  const btn = document.getElementById('btn-confirm-sale');
  const ids = Object.keys(cart);
  if (ids.length === 0) {
    el.innerHTML = '<div class="empty-state" style="padding:32px">Sin productos agregados</div>';
    document.getElementById('cart-total').textContent = '$0.00';
    document.getElementById('cart-gain').textContent  = '$0.00';
    btn.disabled = true; return;
  }
  let total = 0, gain = 0;
  el.innerHTML = ids.map(id => {
    const p = getProduct(id); if (!p) return '';
    const qty = cart[id], sub = p.sellPrice * qty;
    total += sub; gain += (p.sellPrice - p.buyPrice) * qty;
    return `<div class="cart-item">
      <span class="cart-item-name">${p.name}</span>
      <span class="cart-item-qty">×${qty}</span>
      <span class="cart-item-total">${fmt(sub)}</span>
      <button class="btn-icon btn-danger" style="min-width:28px;min-height:28px;font-size:0.8rem"
        onclick="cartChange('${id}',-999)">✕</button>
    </div>`;
  }).join('');
  document.getElementById('cart-total').textContent = fmt(total);
  document.getElementById('cart-gain').textContent  = fmt(gain);
  btn.disabled = false;
}

document.getElementById('btn-confirm-sale').addEventListener('click', () => {
  const ids = Object.keys(cart); if (!ids.length) return;
  const date = new Date().toISOString();
  ids.forEach(id => {
    const p = getProduct(id); if (!p) return;
    const qty = cart[id];
    p.stock -= qty;
    saveItem('products',  p);
    saveItem('movements', { id: uid(), productId: id, productName: p.name,
      type: 'salida', qty, price: p.sellPrice, date });
  });
  cart = {};
  renderSaleProductList(); renderCart(); renderAll();
  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:var(--success);color:#000;padding:10px 20px;border-radius:8px;font-weight:600;z-index:400;font-size:0.875rem';
  t.textContent = `✓ Venta registrada — ${ids.length} producto${ids.length>1?'s':''}`;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2200);
});

document.getElementById('cart-clear').addEventListener('click', () => {
  cart = {}; renderSaleProductList(); renderCart();
});

document.getElementById('sale-search').addEventListener('input', function() {
  saleSearchFilter = this.value; renderSaleProductList();
});

document.querySelectorAll('.scat-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    saleCatFilter = btn.dataset.cat;
    document.querySelectorAll('.scat-btn').forEach(b => b.classList.toggle('active', b === btn));
    renderSaleProductList();
  });
});

// Inicializa selectores de mes/año
function initReportSelectors() {
  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const mSel = document.getElementById('r-month');
  const ySel = document.getElementById('r-year');
  const now  = new Date();

  mSel.innerHTML = months.map((m, i) =>
    `<option value="${i}" ${i === now.getMonth() ? 'selected' : ''}>${m}</option>`
  ).join('');

  const years = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--) years.push(y);
  ySel.innerHTML = years.map(y =>
    `<option value="${y}" ${y === now.getFullYear() ? 'selected' : ''}>${y}</option>`
  ).join('');

  // Fecha de hoy por defecto
  document.getElementById('r-date').value = now.toISOString().slice(0, 10);
}

// Filtra ventas (salidas) por rango de fechas
function getSalesByRange(from, to) {
  return movements.filter(m => {
    if (m.type !== 'salida') return false;
    const d = new Date(m.date);
    return d >= from && d <= to;
  });
}

// Agrupa ventas por producto
function groupByProduct(sales) {
  const map = {};
  sales.forEach(m => {
    const p = getProduct(m.productId);
    const key = m.productId;
    if (!map[key]) {
      map[key] = {
        name:     p ? p.name : m.productName,
        category: p ? p.category : '—',
        qty:      0,
        revenue:  0,
        cost:     0,
        gain:     0,
      };
    }
    const cost = p ? p.buyPrice * m.qty : 0;
    map[key].qty     += m.qty;
    map[key].revenue += m.price * m.qty;
    map[key].cost    += cost;
    map[key].gain    += (m.price * m.qty) - cost;
  });
  return Object.values(map).sort((a, b) => b.revenue - a.revenue);
}

// Genera HTML del reporte
function buildReportHTML(title, subtitle, sales, showBars) {
  if (sales.length === 0) {
    return `<div class="report-card">
      <div class="report-header"><div><div class="report-title">${title}</div><div class="report-subtitle">${subtitle}</div></div></div>
      <div class="empty-state">Sin ventas en este período.</div>
    </div>`;
  }

  const rows    = groupByProduct(sales);
  const totQty  = rows.reduce((s, r) => s + r.qty, 0);
  const totRev  = rows.reduce((s, r) => s + r.revenue, 0);
  const totGain = rows.reduce((s, r) => s + r.gain, 0);
  const maxRev  = rows[0].revenue;

  const tableRows = rows.map(r => `
    <tr>
      <td><span class="td-name">${r.name}</span></td>
      <td><span class="badge ${r.category === 'dulce' ? 'badge-dulce' : 'badge-pulsera'}">${r.category === 'dulce' ? 'Dulce' : 'Pulsera'}</span></td>
      <td>${r.qty}</td>
      <td>${fmt(r.revenue)}</td>
      <td class="td-gain">${fmt(r.gain)}</td>
    </tr>`).join('');

  const bars = showBars ? `
    <div class="month-bars">
      ${rows.slice(0, 10).map(r => `
        <div class="bar-row">
          <span class="bar-label" title="${r.name}">${r.name}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.round(r.revenue / maxRev * 100)}%"></div></div>
          <span class="bar-val">${fmt(r.revenue)}</span>
        </div>`).join('')}
    </div>` : '';

  return `
    <div class="report-card">
      <div class="report-header">
        <div>
          <div class="report-title">${title}</div>
          <div class="report-subtitle">${subtitle}</div>
        </div>
        <div class="report-actions">
          <button class="btn-ghost-sm" onclick="downloadCSV('${encodeURIComponent(title)}')">Descargar CSV</button>
          <button class="btn-ghost-sm" onclick="printReport()">Imprimir</button>
          <button class="btn-ghost-sm" onclick="shareReport('${encodeURIComponent(title)}')">Compartir</button>
        </div>
      </div>
      <div class="report-stats">
        <div class="report-stat">
          <span class="report-stat-label">Productos vendidos</span>
          <span class="report-stat-value">${rows.length}</span>
        </div>
        <div class="report-stat">
          <span class="report-stat-label">Unidades</span>
          <span class="report-stat-value">${totQty}</span>
        </div>
        <div class="report-stat">
          <span class="report-stat-label">Total vendido</span>
          <span class="report-stat-value orange">${fmt(totRev)}</span>
        </div>
        <div class="report-stat">
          <span class="report-stat-label">Ganancia</span>
          <span class="report-stat-value green">${fmt(totGain)}</span>
        </div>
      </div>
      ${bars}
      <div class="table-scroll">
        <table style="min-width:400px">
          <thead><tr><th>Producto</th><th>Categoría</th><th>Uds.</th><th>Total</th><th>Ganancia</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>`;
}

// Reporte diario
document.getElementById('btn-gen-daily').addEventListener('click', () => {
  const dateStr = document.getElementById('r-date').value;
  if (!dateStr) return;
  const from = new Date(dateStr + 'T00:00:00');
  const to   = new Date(dateStr + 'T23:59:59');
  const sales = getSalesByRange(from, to);
  const label = new Date(dateStr).toLocaleDateString('es-MX', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  document.getElementById('report-daily-out').innerHTML =
    buildReportHTML('Reporte Diario', label, sales, false);
});

// Reporte mensual
document.getElementById('btn-gen-monthly').addEventListener('click', () => {
  const month = parseInt(document.getElementById('r-month').value);
  const year  = parseInt(document.getElementById('r-year').value);
  const from  = new Date(year, month, 1, 0, 0, 0);
  const to    = new Date(year, month + 1, 0, 23, 59, 59);
  const sales = getSalesByRange(from, to);
  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  document.getElementById('report-monthly-out').innerHTML =
    buildReportHTML(`Reporte Mensual — ${months[month]} ${year}`, `${from.toLocaleDateString('es-MX')} al ${to.toLocaleDateString('es-MX')}`, sales, true);
});

// Tabs de reporte
document.querySelectorAll('.rtab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.rtab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.rtab-content').forEach(c => { c.classList.remove('active'); c.classList.add('hidden'); });
    btn.classList.add('active');
    const tab = document.getElementById('rtab-' + btn.dataset.rtab);
    tab.classList.remove('hidden');
    tab.classList.add('active');
  });
});

// Descarga CSV
function downloadCSV(encodedTitle) {
  const title = decodeURIComponent(encodedTitle);
  // Determina si es diario o mensual por el contenido activo
  const isDiario = document.getElementById('rtab-diario').classList.contains('active');
  const dateStr  = document.getElementById('r-date').value;
  const month    = parseInt(document.getElementById('r-month').value);
  const year     = parseInt(document.getElementById('r-year').value);

  let sales;
  if (isDiario && dateStr) {
    sales = getSalesByRange(new Date(dateStr + 'T00:00:00'), new Date(dateStr + 'T23:59:59'));
  } else {
    sales = getSalesByRange(new Date(year, month, 1), new Date(year, month + 1, 0, 23, 59, 59));
  }

  const rows = groupByProduct(sales);
  const lines = [
    ['Producto','Categoría','Unidades','Total Vendido','Ganancia'],
    ...rows.map(r => [r.name, r.category, r.qty, r.revenue.toFixed(2), r.gain.toFixed(2)])
  ];
  const csv  = lines.map(l => l.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = title.replace(/\s+/g, '_') + '.csv';
  a.click();
}

// Imprimir
function printReport() {
  window.print();
}

// Compartir (Web Share API o fallback)
function shareReport(encodedTitle) {
  const title = decodeURIComponent(encodedTitle);
  if (navigator.share) {
    navigator.share({ title, text: `Reporte de ventas: ${title}`, url: window.location.href })
      .catch(() => {});
  } else {
    navigator.clipboard.writeText(window.location.href)
      .then(() => alert('URL copiada al portapapeles'))
      .catch(() => alert('Comparte esta URL: ' + window.location.href));
  }
}

// ── Settings ───────────────────────────────────────────────────────────────
// Ajustes se guardan por usuario: clave = inv_settings_<userId>
// "pending" acumula cambios sin aplicar hasta que el usuario presiona Guardar

const DEFAULTS = {
  storeName: 'Inventario',
  subtitle:  'Dulces & Pulseras',
  accent:    '#e07b39',
  theme:     'dark',
  logo:      '',
  bg:        '',
  bgOpacity: 15,
};

let activeUserId = localStorage.getItem('inv_active_user') || (users[0] && users[0].id) || 'global';
let pending      = {};   // cambios sin guardar del formulario actual

function settingsKey(uid) { return 'inv_settings_' + uid; }

function getUserSettings(uid) {
  // Usa el uid de Firebase si está disponible
  const key = fbAuth && fbAuth.currentUser ? fbAuth.currentUser.uid : uid;
  return JSON.parse(localStorage.getItem(settingsKey(key)) || '{}');
}

function saveUserSettings(uid, data) {
  // Guarda local
  localStorage.setItem(settingsKey(uid), JSON.stringify(data));
  // Guarda en Firestore si Firebase está activo
  if (typeof fbSaveSettings === 'function' && db) {
    fbSaveSettings(uid, data).catch(console.error);
  }
}

// Ajustes activos = los del usuario activo
function activeSettings() {
  return { ...DEFAULTS, ...getUserSettings(activeUserId), ...pending };
}

function applySettings(s) {
  s = s || activeSettings();

  // Accent
  document.documentElement.style.setProperty('--orange',    s.accent);
  document.documentElement.style.setProperty('--orange-dk', shadeColor(s.accent, -20));

  // Theme
  if (s.theme === 'light') {
    document.documentElement.style.setProperty('--bg',       '#f5f5f5');
    document.documentElement.style.setProperty('--surface',  '#ffffff');
    document.documentElement.style.setProperty('--surface2', '#f0f0f0');
    document.documentElement.style.setProperty('--border',   '#e0e0e0');
    document.documentElement.style.setProperty('--text',     '#1a1a1a');
    document.documentElement.style.setProperty('--muted',    '#888888');
  } else {
    document.documentElement.style.setProperty('--bg',       '#141414');
    document.documentElement.style.setProperty('--surface',  '#1e1e1e');
    document.documentElement.style.setProperty('--surface2', '#252525');
    document.documentElement.style.setProperty('--border',   '#2e2e2e');
    document.documentElement.style.setProperty('--text',     '#f0ece6');
    document.documentElement.style.setProperty('--muted',    '#7a7570');
  }

  // Brand
  const brandEl = document.querySelector('.brand-title');
  const subEl   = document.querySelector('.brand-sub');
  if (brandEl) brandEl.textContent = s.storeName;
  if (subEl)   subEl.textContent   = s.subtitle;
  document.title = s.storeName + ' — Inventario';

  // Logo
  let logoImg = document.getElementById('sidebar-logo');
  if (s.logo) {
    if (!logoImg) {
      logoImg = document.createElement('img');
      logoImg.id = 'sidebar-logo';
      logoImg.style.cssText = 'width:40px;height:40px;object-fit:contain;border-radius:6px;margin-bottom:8px;display:block';
      document.querySelector('.sidebar-brand').prepend(logoImg);
    }
    logoImg.src = s.logo;
  } else if (logoImg) {
    logoImg.remove();
  }

  // Background
  const content = document.querySelector('.content');
  if (s.bg) {
    content.style.backgroundImage     = `url(${s.bg})`;
    content.style.backgroundSize      = 'cover';
    content.style.backgroundPosition  = 'center';
    content.style.backgroundAttachment = 'fixed';
    content.style.backgroundBlendMode = 'overlay';
    content.style.backgroundColor     = `rgba(20,20,20,${1 - s.bgOpacity / 100})`;
  } else {
    content.style.backgroundImage = '';
    content.style.backgroundColor = '';
  }
}

function shadeColor(hex, pct) {
  const num = parseInt(hex.replace('#',''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + pct));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + pct));
  const b = Math.min(255, Math.max(0, (num & 0xff) + pct));
  return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
}

// Rellena el formulario con los ajustes del usuario activo
function loadSettingsUI() {
  pending = {};
  const s = activeSettings();

  document.getElementById('s-storename').value  = s.storeName;
  document.getElementById('s-subtitle').value   = s.subtitle;
  document.getElementById('s-bg-opacity').value = s.bgOpacity;
  document.getElementById('s-bg-opacity-val').textContent = s.bgOpacity + '%';
  document.getElementById('s-custom-color').value = s.accent;

  document.querySelectorAll('.theme-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.theme === s.theme));

  document.querySelectorAll('.swatch:not(.swatch-custom)').forEach(sw =>
    sw.classList.toggle('active', sw.dataset.color === s.accent));

  // Logo preview
  const lp = document.getElementById('logo-preview');
  const rl = document.getElementById('remove-logo');
  if (s.logo) { lp.src = s.logo; lp.classList.remove('hidden'); rl.style.display = 'inline-block'; }
  else        { lp.classList.add('hidden'); rl.style.display = 'none'; }

  // BG preview
  const bp = document.getElementById('bg-preview');
  const rb = document.getElementById('remove-bg');
  if (s.bg) { bp.src = s.bg; bp.classList.remove('hidden'); rb.style.display = 'inline-block'; }
  else      { bp.classList.add('hidden'); rb.style.display = 'none'; }

  // Selector de usuario activo
  const sel = document.getElementById('s-active-user');
  sel.innerHTML = users.map(u =>
    `<option value="${u.id}" ${u.id === activeUserId ? 'selected' : ''}>${u.name} (${u.role})</option>`
  ).join('');

  // Limpia mensaje de guardado
  document.getElementById('settings-save-info').textContent = '';
}

// Marca cambio pendiente y aplica preview en tiempo real
function setPending(key, value) {
  pending[key] = value;
  applySettings(); // preview inmediato
}

// ── Cambio de usuario activo ───────────────────────────────────────────────
document.getElementById('s-active-user').addEventListener('change', function() {
  activeUserId = this.value;
  localStorage.setItem('inv_active_user', activeUserId);
  loadSettingsUI();
  applySettings();
});

// ── Controles del formulario (solo marcan pending, no guardan) ─────────────
document.getElementById('s-storename').addEventListener('input', function() {
  setPending('storeName', this.value || DEFAULTS.storeName);
});
document.getElementById('s-subtitle').addEventListener('input', function() {
  setPending('subtitle', this.value || DEFAULTS.subtitle);
});

document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    setPending('theme', btn.dataset.theme);
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b === btn));
  });
});

document.querySelectorAll('.swatch:not(.swatch-custom)').forEach(sw => {
  sw.addEventListener('click', () => {
    setPending('accent', sw.dataset.color);
    document.querySelectorAll('.swatch:not(.swatch-custom)').forEach(s => s.classList.remove('active'));
    sw.classList.add('active');
    document.getElementById('s-custom-color').value = sw.dataset.color;
  });
});

document.getElementById('s-custom-color').addEventListener('input', function() {
  setPending('accent', this.value);
  document.querySelectorAll('.swatch:not(.swatch-custom)').forEach(s => s.classList.remove('active'));
});

document.getElementById('s-logo').addEventListener('change', function() {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    setPending('logo', e.target.result);
    document.getElementById('logo-preview').src = e.target.result;
    document.getElementById('logo-preview').classList.remove('hidden');
    document.getElementById('remove-logo').style.display = 'inline-block';
  };
  reader.readAsDataURL(file);
});

document.getElementById('remove-logo').addEventListener('click', () => {
  setPending('logo', '');
  document.getElementById('logo-preview').classList.add('hidden');
  document.getElementById('remove-logo').style.display = 'none';
  document.getElementById('s-logo').value = '';
});

document.getElementById('s-bg').addEventListener('change', function() {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    setPending('bg', e.target.result);
    document.getElementById('bg-preview').src = e.target.result;
    document.getElementById('bg-preview').classList.remove('hidden');
    document.getElementById('remove-bg').style.display = 'inline-block';
  };
  reader.readAsDataURL(file);
});

document.getElementById('remove-bg').addEventListener('click', () => {
  setPending('bg', '');
  document.getElementById('bg-preview').classList.add('hidden');
  document.getElementById('remove-bg').style.display = 'none';
  document.getElementById('s-bg').value = '';
});

document.getElementById('s-bg-opacity').addEventListener('input', function() {
  setPending('bgOpacity', parseInt(this.value));
  document.getElementById('s-bg-opacity-val').textContent = this.value + '%';
});

// ── Botón Guardar cambios ──────────────────────────────────────────────────
document.getElementById('btn-save-settings').addEventListener('click', () => {
  if (Object.keys(pending).length === 0) {
    showSaveInfo('Sin cambios nuevos.');
    return;
  }
  // Fusiona pending con los ajustes guardados del usuario activo
  const current = getUserSettings(activeUserId);
  const merged  = { ...current, ...pending };
  saveUserSettings(activeUserId, merged);
  pending = {};
  applySettings();
  const u = users.find(x => x.id === activeUserId);
  showSaveInfo(`✓ Cambios guardados para ${u ? u.name : 'usuario'}`);
});

function showSaveInfo(msg) {
  const el = document.getElementById('settings-save-info');
  el.textContent = msg;
  setTimeout(() => { el.textContent = ''; }, 3000);
}

// ── Export / Reset ─────────────────────────────────────────────────────────
document.getElementById('btn-export').addEventListener('click', () => {
  const data = { products, movements, users, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'inventario-backup.json';
  a.click();
});

document.getElementById('btn-reset').addEventListener('click', () => {
  if (!confirm('¿Restablecer todos los datos? Esta acción no se puede deshacer.')) return;
  localStorage.clear();
  location.reload();
});

// ── Bulk Upload ────────────────────────────────────────────────────────────
let bulkParsed = [];

// Plantilla CSV
document.getElementById('bulk-download-template').addEventListener('click', () => {
  const csv = [
    'nombre,categoria,stock,precio_compra,precio_venta,descripcion',
    'Mazapán de Rosa,dulce,20,5,12,Dulce tradicional mexicano',
    'Pulsera Chaquira,pulsera,10,20,55,Pulsera de chaquiras de colores',
  ].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'plantilla_productos.csv';
  a.click();
});

// Leer archivo CSV
document.getElementById('bulk-file').addEventListener('change', function () {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    parseBulkCSV(e.target.result);
    document.getElementById('bulk-overlay').classList.remove('hidden');
    this.value = '';
  };
  reader.readAsText(file, 'UTF-8');
});

function parseBulkCSV(text) {
  // Normaliza saltos de línea y separa filas
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  // Detecta si la primera fila es encabezado
  const start = /nombre|name|producto/i.test(lines[0]) ? 1 : 0;
  bulkParsed = [];

  for (let i = start; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    const row  = {
      name:      (cols[0] || '').trim(),
      category:  normalizeCat(cols[1] || ''),
      stock:     parseInt(cols[2]) || 0,
      buyPrice:  parseFloat(cols[3]) || 0,
      sellPrice: parseFloat(cols[4]) || 0,
      desc:      (cols[5] || '').trim(),
      _line:     i + 1,
      _errors:   [],
    };
    if (!row.name)                          row._errors.push('Nombre vacío');
    if (!row.category)                      row._errors.push('Categoría inválida (usa dulce o pulsera)');
    if (row.stock < 0)                      row._errors.push('Stock negativo');
    if (row.buyPrice < 0)                   row._errors.push('Precio compra negativo');
    if (row.sellPrice < row.buyPrice)       row._errors.push('Precio venta < compra');
    bulkParsed.push(row);
  }

  renderBulkPreview();
}

function splitCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
    else cur += ch;
  }
  result.push(cur);
  return result;
}

function normalizeCat(val) {
  const v = val.toLowerCase().trim();
  if (v.includes('dulce') || v.includes('candy') || v.includes('sweet')) return 'dulce';
  if (v.includes('pulsera') || v.includes('bracelet') || v.includes('pulser')) return 'pulsera';
  return '';
}

function renderBulkPreview() {
  const valid  = bulkParsed.filter(r => r._errors.length === 0);
  const errors = bulkParsed.filter(r => r._errors.length > 0);

  document.getElementById('bulk-count').textContent =
    `${bulkParsed.length} filas leídas — ${valid.length} válidas`;
  const errEl = document.getElementById('bulk-errors');
  errEl.textContent = errors.length ? `${errors.length} con errores` : '';

  const tbody = document.getElementById('bulk-preview-body');
  tbody.innerHTML = bulkParsed.map((r, i) => {
    const ok = r._errors.length === 0;
    const catBadge = r.category
      ? `<span class="badge badge-${r.category}">${r.category === 'dulce' ? 'Dulce' : 'Pulsera'}</span>`
      : '<span class="badge" style="background:rgba(248,113,113,0.12);color:var(--danger)">?</span>';
    return `<tr class="${ok ? 'bulk-row-ok' : 'bulk-row-error'}">
      <td style="color:var(--muted)">${r._line}</td>
      <td>${r.name || '—'}</td>
      <td>${catBadge}</td>
      <td>${r.stock}</td>
      <td>${fmt(r.buyPrice)}</td>
      <td>${fmt(r.sellPrice)}</td>
      <td style="color:var(--muted);font-size:0.78rem">${r.desc || ''}</td>
      <td>${ok
        ? '<span class="bulk-status-ok">✓ OK</span>'
        : `<span class="bulk-status-error" title="${r._errors.join(', ')}">✕ ${r._errors[0]}</span>`
      }</td>
    </tr>`;
  }).join('');

  document.getElementById('bulk-preview-wrap').classList.remove('hidden');
  document.getElementById('bulk-confirm').disabled = valid.length === 0;
}

// Confirmar importación
document.getElementById('bulk-confirm').addEventListener('click', () => {
  const valid = bulkParsed.filter(r => r._errors.length === 0);
  valid.forEach(r => {
    const item = { id: uid(), name: r.name, category: r.category,
      stock: r.stock, buyPrice: r.buyPrice, sellPrice: r.sellPrice, desc: r.desc };
    saveItem('products', item);
  });
  closeBulkModal();
  navigate('productos');
  setTimeout(() => {
    const info = document.createElement('div');
    info.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:var(--success);color:#000;padding:10px 20px;border-radius:8px;font-weight:600;z-index:400;font-size:0.875rem';
    info.textContent = `✓ ${valid.length} productos importados`;
    document.body.appendChild(info);
    setTimeout(() => info.remove(), 2500);
  }, 100);
});

function closeBulkModal() {
  document.getElementById('bulk-overlay').classList.add('hidden');
  document.getElementById('bulk-preview-wrap').classList.add('hidden');
  bulkParsed = [];
}

document.getElementById('bulk-close').addEventListener('click', closeBulkModal);
document.getElementById('bulk-cancel').addEventListener('click', closeBulkModal);
document.getElementById('bulk-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('bulk-overlay')) closeBulkModal();
});

// ── Logout ─────────────────────────────────────────────────────────────────
document.getElementById('btn-logout').addEventListener('click', async () => {
  if (!confirm('¿Cerrar sesión?')) return;
  if (typeof fbSignOut === 'function' && db) {
    await fbSignOut();
  } else {
    location.reload();
  }
});

// ── Privilege helpers ──────────────────────────────────────────────────────
function canWrite() {
  const role = window._currentUserRole || 'Admin';
  return role === 'Admin' || role === 'Usuario';
}
function canDelete() {
  return (window._currentUserRole || 'Admin') === 'Admin';
}
function canManageUsers() {
  return (window._currentUserRole || 'Admin') === 'Admin';
}

// Guarda protegido por rol
function saveItem(colName, item) {
  if (!canWrite()) { alert('No tienes permiso para realizar esta acción.'); return; }
  if (db) {
    showSyncStatus('saving');
    fbSet(colName, item)
      .then(() => showSyncStatus('online'))
      .catch(e => { console.error(e); showSyncStatus('error'); });
  } else {
    if (colName === 'products')  { const i = products.findIndex(x=>x.id===item.id);  if(i>=0) products[i]=item;  else products.push(item);  }
    if (colName === 'movements') { const i = movements.findIndex(x=>x.id===item.id); if(i>=0) movements[i]=item; else movements.push(item); }
    if (colName === 'users')     { const i = users.findIndex(x=>x.id===item.id);     if(i>=0) users[i]=item;     else users.push(item);     }
    save(); renderAll();
  }
}

function deleteItem(colName, id) {
  if (!canDelete()) { alert('Solo el administrador puede eliminar.'); return; }
  if (db) {
    showSyncStatus('saving');
    fbDelete(colName, id)
      .then(() => showSyncStatus('online'))
      .catch(e => { console.error(e); showSyncStatus('error'); });
  } else {
    if (colName === 'products')  products  = products.filter(x=>x.id!==id);
    if (colName === 'movements') movements = movements.filter(x=>x.id!==id);
    if (colName === 'users')     users     = users.filter(x=>x.id!==id);
    save(); renderAll();
  }
}

// Aplica restricciones visuales según rol
function applyPrivileges() {
  const role = window._currentUserRole || 'Admin';

  // ── Navegación ─────────────────────────────────────────────────────────
  // Solo lectura: sin acceso a Nuevo Producto ni Usuarios
  document.querySelectorAll('[data-view="agregar"],[data-view="usuarios"]').forEach(el => {
    el.style.display = (role === 'Solo lectura') ? 'none' : '';
  });

  // ── Botones de acción en tablas ────────────────────────────────────────
  // Usuario y Solo lectura: sin editar ni eliminar productos
  document.querySelectorAll('.btn-edit-product, .btn-delete-product').forEach(btn => {
    btn.style.display = (role === 'Admin') ? '' : 'none';
  });

  // Solo lectura: sin botones de entrada/salida
  document.querySelectorAll('.btn-entrada-product, .btn-salida-product').forEach(btn => {
    btn.style.display = (role === 'Solo lectura') ? 'none' : '';
  });

  // ── Formularios ────────────────────────────────────────────────────────
  // Solo lectura: oculta formulario de nuevo producto y ventas
  const formAgregar = document.getElementById('view-agregar');
  if (formAgregar && role === 'Solo lectura') {
    formAgregar.innerHTML = '<div class="empty-state" style="padding:60px">No tienes permiso para agregar productos.</div>';
  }

  // ── Sección Usuarios: solo Admin puede eliminar ────────────────────────
  document.querySelectorAll('.btn-delete-user').forEach(btn => {
    btn.style.display = (role === 'Admin') ? '' : 'none';
  });

  // ── Info del usuario en sidebar ────────────────────────────────────────
  const me   = users.find(u => u.id === activeUserId);
  const info = document.getElementById('sidebar-user-info');
  if (info && me) info.textContent = me.name + ' · ' + me.role;
}

// ── Cross-tab / Cross-device sync ─────────────────────────────────────────
// BroadcastChannel sincroniza entre pestañas del mismo navegador al instante.
// Para sincronizar entre dispositivos distintos necesitas Firebase (ver firebase.js).
try {
  const bc = new BroadcastChannel('inv_sync');
  // Cuando otro tab guarda, recargamos los datos locales
  bc.onmessage = () => {
    products  = JSON.parse(localStorage.getItem('inv_products')  || '[]');
    movements = JSON.parse(localStorage.getItem('inv_movements') || '[]');
    users     = JSON.parse(localStorage.getItem('inv_users')     || '[]');
    renderAll();
  };
  // Notifica a otros tabs cuando guardamos
  const _origSave = save;
  window.save = function() {
    _origSave();
    bc.postMessage('update');
  };
} catch(e) { /* BroadcastChannel no disponible */ }

// ── Init ───────────────────────────────────────────────────────────────────
applySettings();

async function initApp() {
  await seedLocalIfEmpty();
  renderAll();
  if (typeof initFirebase === 'function') {
    const ok = await initFirebase();
    if (ok) return; // Firebase maneja navigate() después del login
  }
  // Sin Firebase → modo local, entra directo
  loadSettingsUI();
  navigate('panel');
}

initApp();

/**
 * build.js — ejecuta con: node build.js
 * Genera la carpeta /dist lista para subir a Netlify.
 * Inyecta un timestamp único en cada build para invalidar caché móvil.
 */
const fs   = require('fs');
const path = require('path');

const DIST  = path.join(__dirname, 'dist');
const BUILD = Date.now().toString(36); // ej: "lzx4k2a"

// Limpia y crea dist/
if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true });
fs.mkdirSync(DIST);

// Copia y procesa cada archivo
const files = ['index.html', 'styles.css', 'app.js', 'sw.js'];

files.forEach(file => {
  let content = fs.readFileSync(path.join(__dirname, file), 'utf8');

  if (file === 'index.html') {
    // Inyecta versión en CSS y JS
    content = content
      .replace(/styles\.css(\?v=\w+)?/, `styles.css?v=${BUILD}`)
      .replace(/app\.js(\?v=\w+)?/,     `app.js?v=${BUILD}`);
  }

  if (file === 'sw.js') {
    // Inyecta el timestamp real
    content = content.replace('__BUILD_TIME__', BUILD);
  }

  fs.writeFileSync(path.join(DIST, file), content);
});

// Crea _headers para Netlify (deshabilita caché en HTML)
fs.writeFileSync(path.join(DIST, '_headers'), `
/index.html
  Cache-Control: no-cache, no-store, must-revalidate

/sw.js
  Cache-Control: no-cache, no-store, must-revalidate

/*.css
  Cache-Control: public, max-age=31536000, immutable

/*.js
  Cache-Control: public, max-age=31536000, immutable
`.trim());

console.log(`✓ Build ${BUILD} generado en /dist — listo para subir a Netlify`);

// ── Firebase — Sincronización completa en tiempo real ─────────────────────

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDLk5Gu-wY7kb9MdR5UIBtbgJTyFUGAtnA",
  authDomain:        "gestor-de-inventario-853d8.firebaseapp.com",
  projectId:         "gestor-de-inventario-853d8",
  storageBucket:     "gestor-de-inventario-853d8.firebasestorage.app",
  messagingSenderId: "980977651129",
  appId:             "1:980977651129:web:791dd31e9b2825c4d57a68"
};

let db     = null;
let fbAuth = null;
let _fb    = null;
let _fa    = null;
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
      if (user) { onUserSignedIn(user); }
      else      { stopListeners(); showLoginScreen(); }
    });

    return true;
  } catch (err) {
    console.error('[Firebase]', err);
    showSyncStatus('error');
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

  } catch (err) {
    console.error('[onUserSignedIn]', err);
    showSyncStatus('error');
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

<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Generar Iconos PWA</title></head>
<body style="font-family:sans-serif;padding:24px;background:#141414;color:#f0ece6">
  <h2>Generador de Iconos PWA</h2>
  <p>Haz clic en cada botón para descargar el icono correspondiente.</p>
  <br>
  <button onclick="gen(192)" style="padding:10px 20px;margin-right:12px;background:#e07b39;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:1rem">Descargar icon-192.png</button>
  <button onclick="gen(512)" style="padding:10px 20px;background:#e07b39;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:1rem">Descargar icon-512.png</button>

  <canvas id="c" style="display:none"></canvas>

  <script>
    function gen(size) {
      const canvas = document.getElementById('c');
      canvas.width  = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      // Fondo naranja redondeado
      const r = size * 0.22;
      ctx.fillStyle = '#e07b39';
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(size - r, 0);
      ctx.quadraticCurveTo(size, 0, size, r);
      ctx.lineTo(size, size - r);
      ctx.quadraticCurveTo(size, size, size - r, size);
      ctx.lineTo(r, size);
      ctx.quadraticCurveTo(0, size, 0, size - r);
      ctx.lineTo(0, r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.closePath();
      ctx.fill();

      // Letra "I" centrada
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${size * 0.52}px Inter, Arial, sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('I', size / 2, size / 2 + size * 0.03);

      // Descarga
      const a = document.createElement('a');
      a.download = `icon-${size}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    }
  </script>
</body>
</html>

<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"/>
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <meta http-equiv="Pragma" content="no-cache" />
  <meta http-equiv="Expires" content="0" />

  <!-- PWA -->
  <link rel="manifest" href="manifest.json" />
  <meta name="theme-color" content="#e07b39" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Inventario" />
  <meta name="application-name" content="Inventario" />

  <title>Inventario — Dulces & Pulseras</title>
  <link rel="stylesheet" href="styles.css?v=10" />
</head>
<body>

  <!-- ── Sidebar ─────────────────────────────────────────────────────── -->
  <aside class="sidebar">
    <div class="sidebar-brand">
      <span class="brand-title">Inventario</span>
      <span class="brand-sub">Dulces &amp; Pulseras</span>
    </div>

    <nav class="sidebar-nav">
      <a href="#" class="nav-item" data-view="panel">
        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
        Panel
      </a>
      <a href="#" class="nav-item" data-view="productos">
        <svg viewBox="0 0 24 24"><path d="M20 7H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1z"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
        Productos
      </a>
      <a href="#" class="nav-item active" data-view="movimientos">
        <svg viewBox="0 0 24 24"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
        Movimientos
      </a>
      <a href="#" class="nav-item" data-view="agregar">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        Nuevo Producto
      </a>
      <a href="#" class="nav-item" data-view="usuarios">
        <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        Usuarios
      </a>
      <a href="#" class="nav-item" data-view="ventas">
        <svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        Ventas
      </a>
    </nav>

    <div class="sidebar-footer">
      <a href="#" class="nav-item" data-view="ajustes" style="width:100%;margin:0">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
        Ajustes
      </a>
      <button class="sidebar-logout" id="btn-logout">
        <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Cerrar sesión
      </button>
      <div class="sidebar-copy" id="sidebar-user-info">© 2026 Gestor de Inventario</div>
    </div>
  </aside>

  <!-- ── Content ─────────────────────────────────────────────────────── -->
  <main class="content">

    <!-- Panel -->
    <section class="view" id="view-panel">
      <div class="page-header">
        <h1>Panel</h1>
        <p>Resumen general del inventario</p>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-label">Productos</span>
          <span class="stat-value" id="total-products">0</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Inversión Total</span>
          <span class="stat-value" id="total-inversion">$0.00</span>
        </div>
        <div class="stat-card accent">
          <span class="stat-label">Ganancia Potencial</span>
          <span class="stat-value" id="total-ganancia">$0.00</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Total Vendido</span>
          <span class="stat-value" id="total-vendido">$0.00</span>
        </div>
      </div>

      <!-- Quick inventory preview -->
      <div class="section-box">
        <div class="section-box-header">
          <span>Productos con bajo stock</span>
        </div>
        <div id="low-stock-list"></div>
      </div>
    </section>

    <!-- Productos -->
    <section class="view hidden" id="view-productos">
      <div class="page-header">
        <h1>Productos</h1>
        <p>Gestiona tu catálogo de dulces y pulseras</p>
      </div>

      <div class="toolbar">
        <input type="text" id="search" placeholder="Buscar producto…" />
        <select id="filter-category">
          <option value="">Todas las categorías</option>
          <option value="dulce">Dulces Típicos</option>
          <option value="pulsera">Pulseras Artesanales</option>
        </select>
        <label class="btn-upload" for="bulk-file" title="Carga masiva CSV">⬆ Carga masiva</label>
        <input type="file" id="bulk-file" accept=".csv,.txt" style="display:none" />
      </div>

      <div class="section-box">
        <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Categoría</th>
              <th>Stock</th>
              <th>P. Compra</th>
              <th>P. Venta</th>
              <th>Ganancia/u</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="inventory-body"></tbody>
        </table>
        </div>
      </div>
    </section>

    <!-- Movimientos -->
    <section class="view hidden" id="view-movimientos">
      <div class="page-header">
        <h1>Movimientos</h1>
        <p>Historial de entradas y salidas</p>
      </div>

      <div class="toolbar">
        <select id="filter-mov-type">
          <option value="">Todos los movimientos</option>
          <option value="entrada">Entradas</option>
          <option value="salida">Salidas</option>
        </select>
      </div>

      <div class="section-box">
        <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Producto</th>
              <th>Tipo</th>
              <th>Cantidad</th>
              <th>Precio Unit.</th>
              <th>Total</th>
              <th>Ganancia</th>
            </tr>
          </thead>
          <tbody id="mov-body"></tbody>
        </table>
        </div>
      </div>
    </section>

    <!-- Nuevo Producto -->
    <section class="view hidden" id="view-agregar">
      <div class="page-header">
        <h1 id="form-title">Nuevo Producto</h1>
        <p>Agrega o edita un producto del inventario</p>
      </div>

      <div class="section-box" style="max-width:620px">
        <form id="product-form">
          <input type="hidden" id="edit-id" />
          <div class="form-grid">
            <div class="form-group">
              <label>Nombre</label>
              <input type="text" id="f-name" placeholder="Ej: Mazapán de rosa" required />
            </div>
            <div class="form-group">
              <label>Categoría</label>
              <select id="f-category" required>
                <option value="dulce">Dulce Típico</option>
                <option value="pulsera">Pulsera Artesanal</option>
              </select>
            </div>
            <div class="form-group">
              <label>Stock inicial</label>
              <input type="number" id="f-stock" min="0" value="0" required />
            </div>
            <div class="form-group">
              <label>Precio de Compra ($)</label>
              <input type="number" id="f-buy" min="0" step="0.01" value="0" required />
            </div>
            <div class="form-group">
              <label>Precio de Venta ($)</label>
              <input type="number" id="f-sell" min="0" step="0.01" value="0" required />
            </div>
            <div class="form-group">
              <label>Descripción</label>
              <input type="text" id="f-desc" placeholder="Notas opcionales" />
            </div>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn-primary">Guardar Producto</button>
            <button type="button" class="btn-ghost" id="cancel-edit" style="display:none">Cancelar</button>
          </div>
        </form>
      </div>
    </section>

    <!-- Usuarios -->
    <section class="view hidden" id="view-usuarios">
      <div class="page-header">
        <h1>Usuarios</h1>
        <p>Gestiona quién tiene acceso a la aplicación</p>
      </div>

      <!-- Agregar usuario -->
      <div class="section-box" style="max-width:620px;margin-bottom:20px">
        <div class="section-box-header">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;vertical-align:middle;margin-right:6px"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
          Agregar Usuario
        </div>
        <form id="user-form" style="padding:20px">
          <div class="form-grid">
            <div class="form-group">
              <label>Nombre</label>
              <input type="text" id="u-name" placeholder="Nombre completo" required />
            </div>
            <div class="form-group">
              <label>Correo electrónico</label>
              <input type="email" id="u-email" placeholder="ejemplo@correo.com" required />
            </div>
            <div class="form-group">
              <label>Rol</label>
              <select id="u-role">
                <option value="Admin">Admin</option>
                <option value="Usuario">Usuario</option>
                <option value="Solo lectura">Solo lectura</option>
              </select>
            </div>
          </div>
          <div class="form-actions" style="margin-top:16px">
            <button type="submit" class="btn-primary">Agregar Usuario</button>
          </div>
        </form>
      </div>

      <!-- Lista de usuarios -->
      <div class="section-box" style="max-width:620px">
        <div class="section-box-header">
          <span id="user-count-label">0 usuarios con acceso</span>
        </div>
        <div id="user-list"></div>
      </div>
    </section>

    <!-- Ajustes -->
    <section class="view hidden" id="view-ajustes">
      <div class="page-header">
        <h1>Ajustes</h1>
        <p>Personaliza la apariencia y configuración de la aplicación</p>
      </div>

      <!-- Sesión activa -->
      <div class="settings-group" style="max-width:720px">
        <div class="settings-group-title">Sesión activa</div>
        <div class="settings-row">
          <div class="settings-info">
            <span class="settings-label">Usuario</span>
            <span class="settings-desc">Los ajustes se guardan por separado para cada usuario</span>
          </div>
          <div class="settings-control">
            <select id="s-active-user" style="padding:9px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:inherit;font-size:0.875rem;min-width:180px"></select>
          </div>
        </div>
      </div>

      <!-- Identidad -->
      <div class="settings-group">
        <div class="settings-group-title">Identidad</div>

        <div class="settings-row">
          <div class="settings-info">
            <span class="settings-label">Nombre de la tienda</span>
            <span class="settings-desc">Aparece en el sidebar y título de la página</span>
          </div>
          <div class="settings-control">
            <input type="text" id="s-storename" placeholder="Mi Tienda" />
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-info">
            <span class="settings-label">Subtítulo</span>
            <span class="settings-desc">Texto debajo del nombre</span>
          </div>
          <div class="settings-control">
            <input type="text" id="s-subtitle" placeholder="Dulces & Pulseras" />
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-info">
            <span class="settings-label">Logotipo</span>
            <span class="settings-desc">Imagen que aparece en el sidebar (PNG, JPG, SVG)</span>
          </div>
          <div class="settings-control">
            <div class="logo-preview-wrap">
              <img id="logo-preview" src="" alt="" class="logo-preview hidden" />
              <label class="btn-upload" for="s-logo">Subir imagen</label>
              <input type="file" id="s-logo" accept="image/*" style="display:none" />
              <button class="btn-ghost-sm" id="remove-logo" style="display:none">Quitar</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Apariencia -->
      <div class="settings-group">
        <div class="settings-group-title">Apariencia</div>

        <div class="settings-row">
          <div class="settings-info">
            <span class="settings-label">Tema</span>
            <span class="settings-desc">Modo oscuro o claro</span>
          </div>
          <div class="settings-control">
            <div class="theme-toggle">
              <button class="theme-btn active" data-theme="dark">Oscuro</button>
              <button class="theme-btn" data-theme="light">Claro</button>
            </div>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-info">
            <span class="settings-label">Color de acento</span>
            <span class="settings-desc">Color principal de botones y elementos activos</span>
          </div>
          <div class="settings-control">
            <div class="color-swatches" id="color-swatches">
              <button class="swatch active" data-color="#e07b39" style="background:#e07b39" title="Naranja"></button>
              <button class="swatch" data-color="#6366f1" style="background:#6366f1" title="Índigo"></button>
              <button class="swatch" data-color="#10b981" style="background:#10b981" title="Verde"></button>
              <button class="swatch" data-color="#ef4444" style="background:#ef4444" title="Rojo"></button>
              <button class="swatch" data-color="#f59e0b" style="background:#f59e0b" title="Ámbar"></button>
              <button class="swatch" data-color="#ec4899" style="background:#ec4899" title="Rosa"></button>
              <button class="swatch" data-color="#06b6d4" style="background:#06b6d4" title="Cian"></button>
              <label class="swatch swatch-custom" title="Color personalizado">
                <input type="color" id="s-custom-color" value="#e07b39" />
                <span>+</span>
              </label>
            </div>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-info">
            <span class="settings-label">Imagen de fondo</span>
            <span class="settings-desc">Fondo del área de contenido (PNG, JPG)</span>
          </div>
          <div class="settings-control">
            <div class="logo-preview-wrap">
              <img id="bg-preview" src="" alt="" class="logo-preview hidden" style="width:80px;height:50px;object-fit:cover;border-radius:6px" />
              <label class="btn-upload" for="s-bg">Subir imagen</label>
              <input type="file" id="s-bg" accept="image/*" style="display:none" />
              <button class="btn-ghost-sm" id="remove-bg" style="display:none">Quitar</button>
            </div>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-info">
            <span class="settings-label">Opacidad del fondo</span>
            <span class="settings-desc">Transparencia de la imagen de fondo</span>
          </div>
          <div class="settings-control" style="gap:10px;display:flex;align-items:center">
            <input type="range" id="s-bg-opacity" min="5" max="40" value="15" style="flex:1;accent-color:var(--orange)" />
            <span id="s-bg-opacity-val" style="color:var(--muted);font-size:0.82rem;min-width:32px">15%</span>
          </div>
        </div>
      </div>

      <!-- Privilegios -->
      <div class="settings-group">
        <div class="settings-group-title">Privilegios por Rol</div>
        <div class="priv-table">
          <div class="priv-header">
            <span>Permiso</span><span>Admin</span><span>Usuario</span><span>Solo lectura</span>
          </div>
          <div class="priv-row">
            <span>Ver inventario</span>
            <span class="priv-check yes">✓</span>
            <span class="priv-check yes">✓</span>
            <span class="priv-check yes">✓</span>
          </div>
          <div class="priv-row">
            <span>Agregar productos</span>
            <span class="priv-check yes">✓</span>
            <span class="priv-check yes">✓</span>
            <span class="priv-check no">✕</span>
          </div>
          <div class="priv-row">
            <span>Registrar movimientos</span>
            <span class="priv-check yes">✓</span>
            <span class="priv-check yes">✓</span>
            <span class="priv-check no">✕</span>
          </div>
          <div class="priv-row">
            <span>Eliminar productos</span>
            <span class="priv-check yes">✓</span>
            <span class="priv-check no">✕</span>
            <span class="priv-check no">✕</span>
          </div>
          <div class="priv-row">
            <span>Gestionar usuarios</span>
            <span class="priv-check yes">✓</span>
            <span class="priv-check no">✕</span>
            <span class="priv-check no">✕</span>
          </div>
          <div class="priv-row">
            <span>Cambiar ajustes</span>
            <span class="priv-check yes">✓</span>
            <span class="priv-check no">✕</span>
            <span class="priv-check no">✕</span>
          </div>
        </div>
      </div>

      <!-- Datos -->
      <div class="settings-group">
        <div class="settings-group-title">Datos</div>
        <div class="settings-row">
          <div class="settings-info">
            <span class="settings-label">Exportar datos</span>
            <span class="settings-desc">Descarga todos los datos en formato JSON</span>
          </div>
          <div class="settings-control">
            <button class="btn-ghost-sm" id="btn-export">Exportar JSON</button>
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-info">
            <span class="settings-label">Restablecer</span>
            <span class="settings-desc">Borra todos los datos y restaura los valores iniciales</span>
          </div>
          <div class="settings-control">
            <button class="btn-ghost-sm danger" id="btn-reset">Restablecer todo</button>
          </div>
        </div>
      </div>

      <!-- Guardar -->
      <div class="settings-save-bar">
        <div class="settings-save-info" id="settings-save-info"></div>
        <button class="btn-primary" id="btn-save-settings">Guardar cambios</button>
      </div>

    </section>

    <!-- Ventas -->
    <section class="view hidden" id="view-ventas">
      <div class="page-header">
        <h1>Ventas</h1>
        <p>Registra ventas y consulta reportes</p>
      </div>

      <!-- Tabs -->
      <div class="report-tabs">
        <button class="rtab active" data-rtab="vender">Vender</button>
        <button class="rtab" data-rtab="diario">Reporte Diario</button>
        <button class="rtab" data-rtab="mensual">Reporte Mensual</button>
      </div>

      <!-- ── Vender ── -->
      <div class="rtab-content active" id="rtab-vender">
        <div class="sale-layout">

          <!-- Lista de productos -->
          <div class="sale-product-panel">
            <div class="sale-search-bar">
              <input type="text" id="sale-search" placeholder="Buscar producto…" />
              <div class="sale-cat-filter">
                <button class="scat-btn active" data-cat="">Todos</button>
                <button class="scat-btn" data-cat="dulce">🍬 Dulces</button>
                <button class="scat-btn" data-cat="pulsera">📿 Pulseras</button>
              </div>
            </div>
            <div id="sale-product-list"></div>
          </div>

          <!-- Carrito / resumen -->
          <div class="sale-cart-panel">
            <div class="sale-cart-header">
              <span>Venta actual</span>
              <button class="btn-ghost-sm" id="cart-clear">Limpiar</button>
            </div>
            <div id="cart-items">
              <div class="empty-state" style="padding:32px">Sin productos agregados</div>
            </div>
            <div class="cart-footer">
              <div class="cart-total-row">
                <span>Total</span>
                <span id="cart-total">$0.00</span>
              </div>
              <div class="cart-total-row" style="color:var(--success)">
                <span>Ganancia</span>
                <span id="cart-gain">$0.00</span>
              </div>
              <button class="btn-primary" id="btn-confirm-sale" style="width:100%;margin-top:12px" disabled>
                Confirmar venta
              </button>
            </div>
          </div>

        </div>
      </div>

      <!-- ── Diario ── -->
      <div class="rtab-content hidden" id="rtab-diario">
        <div class="toolbar">
          <input type="date" id="r-date" />
          <button class="btn-primary" id="btn-gen-daily">Generar reporte</button>
        </div>
        <div id="report-daily-out"></div>
      </div>

      <!-- ── Mensual ── -->
      <div class="rtab-content hidden" id="rtab-mensual">
        <div class="toolbar">
          <select id="r-month"></select>
          <select id="r-year"></select>
          <button class="btn-primary" id="btn-gen-monthly">Generar reporte</button>
        </div>
        <div id="report-monthly-out"></div>
      </div>
    </section>

  </main>

  <!-- ── Modal ───────────────────────────────────────────────────────── -->
  <div id="modal-overlay" class="hidden">
    <div class="modal">
      <h3 id="modal-title">Registrar movimiento</h3>
      <form id="mov-form">
        <input type="hidden" id="m-product-id" />
        <div class="form-group">
          <label>Producto</label>
          <input type="text" id="m-product-name" readonly />
        </div>
        <div class="form-group">
          <label>Tipo</label>
          <select id="m-type">
            <option value="entrada">Entrada (compra / restock)</option>
            <option value="salida">Salida (venta)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Cantidad</label>
          <input type="number" id="m-qty" min="1" value="1" required />
        </div>
        <div class="form-group">
          <label id="m-price-label">Precio Unitario ($)</label>
          <input type="number" id="m-price" min="0" step="0.01" required />
        </div>
        <div class="form-actions">
          <button type="submit" class="btn-primary">Registrar</button>
          <button type="button" class="btn-ghost" id="close-modal">Cancelar</button>
        </div>
      </form>
    </div>
  </div>

  <!-- ── Bottom nav (mobile) ────────────────────────────────────────── -->
  <nav class="bottom-nav">
    <div class="bottom-nav-inner">
      <button class="bnav-item" data-view="panel">
        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
        Panel
      </button>
      <button class="bnav-item" data-view="productos">
        <svg viewBox="0 0 24 24"><path d="M20 7H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1z"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
        Productos
      </button>
      <button class="bnav-item" data-view="ventas">
        <svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        Ventas
      </button>
      <button class="bnav-item" data-view="movimientos">
        <svg viewBox="0 0 24 24"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
        Historial
      </button>
      <button class="bnav-item bnav-more" id="bnav-more-btn">
        <svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>
        Más
      </button>
    </div>
    <!-- Menú "Más" desplegable -->
    <div class="bnav-more-menu hidden" id="bnav-more-menu">
      <button class="bnav-more-item" data-view="agregar">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        Nuevo Producto
      </button>
      <button class="bnav-more-item" data-view="usuarios">
        <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        Usuarios
      </button>
      <button class="bnav-more-item" data-view="ajustes">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
        Ajustes
      </button>
    </div>
  </nav>

  <!-- ── Modal Carga Masiva ──────────────────────────────────────────── -->
  <div id="bulk-overlay" class="hidden">
    <div class="modal bulk-modal">
      <div class="bulk-header">
        <h3>Carga masiva de productos</h3>
        <button class="btn-icon" id="bulk-close">✕</button>
      </div>

      <div class="bulk-instructions">
        <p>El archivo CSV debe tener estas columnas en orden:</p>
        <code>nombre, categoría (dulce/pulsera), stock, precio_compra, precio_venta, descripción</code>
        <button class="btn-ghost-sm" id="bulk-download-template">⬇ Descargar plantilla</button>
      </div>

      <div id="bulk-preview-wrap" class="hidden">
        <div class="bulk-preview-info">
          <span id="bulk-count"></span>
          <span id="bulk-errors" class="bulk-error-count"></span>
        </div>
        <div class="table-scroll" style="max-height:280px;overflow-y:auto">
          <table id="bulk-preview-table">
            <thead>
              <tr>
                <th>#</th><th>Nombre</th><th>Categoría</th>
                <th>Stock</th><th>P.Compra</th><th>P.Venta</th>
                <th>Descripción</th><th>Estado</th>
              </tr>
            </thead>
            <tbody id="bulk-preview-body"></tbody>
          </table>
        </div>
        <div class="form-actions" style="margin-top:16px">
          <button class="btn-primary" id="bulk-confirm">Importar válidos</button>
          <button class="btn-ghost" id="bulk-cancel">Cancelar</button>
        </div>
      </div>
    </div>
  </div>

  <script src="firebase.js?v=10"></script>
  <script src="app.js?v=10"></script>
  <script>
    if ('serviceWorker' in navigator) {
      // Registra el SW
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
        .then(reg => {
          // Verifica actualizaciones cada vez que se abre la app
          reg.update();

          reg.addEventListener('updatefound', () => {
            const sw = reg.installing;
            sw.addEventListener('statechange', () => {
              if (sw.state === 'installed' && navigator.serviceWorker.controller) {
                sw.postMessage({ type: 'SKIP_WAITING' });
              }
            });
          });
        });

      // Cuando el SW nuevo toma control → recarga para mostrar cambios
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) { refreshing = true; window.location.reload(); }
      });
    }
  </script>
</body>
</html>

{
  "name": "Gestor de Inventario",
  "short_name": "Inventario",
  "description": "Dulces Típicos & Pulseras Artesanales",
  "start_url": "/index.html",
  "display": "standalone",
  "background_color": "#141414",
  "theme_color": "#e07b39",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:        #141414;
  --surface:   #1e1e1e;
  --surface2:  #252525;
  --border:    #2e2e2e;
  --orange:    #e07b39;
  --orange-dk: #c96a28;
  --text:      #f0ece6;
  --muted:     #7a7570;
  --success:   #4ade80;
  --danger:    #f87171;
  --radius:    10px;
  --sidebar-w: 210px;
  --bnav-h:    62px;
}

html { -webkit-text-size-adjust: 100%; }

body {
  font-family: 'Inter', system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
  display: flex;
  min-height: 100vh;
  font-size: 14px;
  overflow-x: hidden;
}

/* ── Sidebar ──────────────────────────────────────────────────────────── */
.sidebar {
  width: var(--sidebar-w);
  min-height: 100vh;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0; left: 0; bottom: 0;
  z-index: 20;
}

.sidebar-brand {
  padding: 24px 20px 20px;
  border-bottom: 1px solid var(--border);
}

.brand-title {
  display: block;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.02em;
}

.brand-sub {
  display: block;
  font-size: 0.72rem;
  color: var(--muted);
  margin-top: 2px;
}

.sidebar-nav {
  flex: 1;
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  color: var(--muted);
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background 0.15s, color 0.15s;
  cursor: pointer;
  user-select: none;
}

.nav-item svg {
  width: 16px; height: 16px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}

.nav-item:hover  { background: var(--surface2); color: var(--text); }
.nav-item.active { background: var(--orange); color: #fff; }
.nav-item.active svg { stroke: #fff; }

.sidebar-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 0.8rem;
  flex-wrap: wrap;
}

.sidebar-footer svg {
  width: 15px; height: 15px;
  stroke: var(--muted);
  fill: none;
  stroke-width: 1.8;
  stroke-linecap: round;
  flex-shrink: 0;
}

.sidebar-copy {
  width: 100%;
  font-size: 0.68rem;
  color: var(--muted);
  margin-top: 4px;
  opacity: 0.6;
}

/* ── Content ──────────────────────────────────────────────────────────── */
.content {
  margin-left: var(--sidebar-w);
  flex: 1;
  padding: 36px 36px 48px;
  min-height: 100vh;
  min-width: 0;
  overflow-x: hidden;
}

/* ── Views ────────────────────────────────────────────────────────────── */
.view { display: block; }
.view.hidden { display: none; }

/* ── Page header ──────────────────────────────────────────────────────── */
.page-header { margin-bottom: 24px; }

.page-header h1 {
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--text);
}

.page-header p {
  font-size: 0.82rem;
  color: var(--muted);
  margin-top: 4px;
}

/* ── Stats grid ───────────────────────────────────────────────────────── */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 24px;
}

.stat-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-card.accent {
  border-color: var(--orange);
  background: rgba(224,123,57,0.07);
}

.stat-label {
  font-size: 0.7rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-weight: 500;
}

.stat-value {
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--text);
  word-break: break-all;
}

.stat-card.accent .stat-value { color: var(--orange); }

/* ── Section box ──────────────────────────────────────────────────────── */
.section-box {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.section-box-header {
  padding: 13px 18px;
  border-bottom: 1px solid var(--border);
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ── Toolbar ──────────────────────────────────────────────────────────── */
.toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.toolbar input,
.toolbar select {
  padding: 10px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-family: inherit;
  font-size: 0.875rem;
  flex: 1;
  min-width: 140px;
  transition: border-color 0.15s;
  -webkit-appearance: none;
  appearance: none;
}

.toolbar input:focus,
.toolbar select:focus {
  outline: none;
  border-color: var(--orange);
}

/* ── Table wrapper — horizontal scroll on mobile ──────────────────────── */
.table-scroll {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 520px;
}

thead { border-bottom: 1px solid var(--border); }

th {
  padding: 11px 16px;
  text-align: left;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--muted);
  white-space: nowrap;
}

td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 0.85rem;
  color: var(--text);
  vertical-align: middle;
}

tbody tr:last-child td { border-bottom: none; }
tbody tr:hover { background: var(--surface2); }

.td-name  { font-weight: 500; display: block; }
.td-sub   { display: block; color: var(--muted); font-size: 0.72rem; margin-top: 2px; }
.td-gain  { color: var(--success); font-weight: 500; }
.td-date  { color: var(--muted); font-size: 0.78rem; white-space: nowrap; }
.td-actions { white-space: nowrap; }

/* ── Badges ───────────────────────────────────────────────────────────── */
.badge {
  display: inline-block;
  padding: 3px 9px;
  border-radius: 5px;
  font-size: 0.7rem;
  font-weight: 500;
  white-space: nowrap;
}

.badge-dulce    { background: rgba(224,123,57,0.15); color: var(--orange); }
.badge-pulsera  { background: rgba(139,92,246,0.15); color: #a78bfa; }
.badge-entrada  { background: rgba(74,222,128,0.12); color: var(--success); }
.badge-salida   { background: rgba(248,113,113,0.12); color: var(--danger); }
.badge-admin    { background: rgba(224,123,57,0.15); color: var(--orange); }
.badge-usuario  { background: rgba(139,92,246,0.15); color: #a78bfa; }
.badge-readonly { background: rgba(156,163,175,0.12); color: var(--muted); }

.stock-low { color: var(--danger); font-weight: 600; }

/* ── Action buttons ───────────────────────────────────────────────────── */
.btn-icon {
  border: none;
  background: none;
  cursor: pointer;
  padding: 7px 9px;
  border-radius: 6px;
  font-size: 1rem;
  color: var(--muted);
  transition: background 0.12s, color 0.12s;
  font-family: inherit;
  line-height: 1;
  min-width: 34px;
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  -webkit-tap-highlight-color: transparent;
}

.btn-icon:hover    { background: var(--surface2); color: var(--text); }
.btn-icon.btn-danger:hover { background: rgba(248,113,113,0.12); color: var(--danger); }

/* ── Form ─────────────────────────────────────────────────────────────── */
.section-box form { padding: 20px; }

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.form-group input,
.form-group select {
  padding: 11px 13px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-family: inherit;
  font-size: 1rem;          /* 16px prevents iOS zoom */
  transition: border-color 0.15s;
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: var(--orange);
}

.form-group input[readonly] { opacity: 0.5; cursor: default; }
.form-group select option   { background: var(--surface2); }

.form-actions {
  margin-top: 18px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

/* ── Buttons ──────────────────────────────────────────────────────────── */
.btn-primary {
  padding: 11px 24px;
  background: var(--orange);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s;
  -webkit-tap-highlight-color: transparent;
  min-height: 44px;
}

.btn-primary:hover { background: var(--orange-dk); }

.btn-ghost {
  padding: 11px 24px;
  background: none;
  color: var(--muted);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
  -webkit-tap-highlight-color: transparent;
  min-height: 44px;
}

.btn-ghost:hover { border-color: var(--text); color: var(--text); }

/* ── Modal ────────────────────────────────────────────────────────────── */
#modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.65);
  display: flex;
  align-items: flex-end;       /* sheet from bottom on mobile */
  justify-content: center;
  z-index: 200;
  padding: 0;
}

#modal-overlay.hidden { display: none; }

.modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius) var(--radius) 0 0;
  padding: 24px 20px 32px;
  width: 100%;
  max-width: 480px;
  box-shadow: 0 -4px 32px rgba(0,0,0,0.5);
  max-height: 92vh;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.modal h3 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 18px;
  color: var(--text);
}

.modal .form-group { margin-bottom: 14px; }

/* ── Low stock ────────────────────────────────────────────────────────── */
.low-stock-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 18px;
  border-bottom: 1px solid var(--border);
  font-size: 0.875rem;
  gap: 12px;
}

.low-stock-item:last-child { border-bottom: none; }
.low-stock-name { color: var(--text); font-weight: 500; flex: 1; min-width: 0; }
.low-stock-qty  { color: var(--danger); font-weight: 600; font-size: 0.82rem; white-space: nowrap; }

/* ── Users ────────────────────────────────────────────────────────────── */
.user-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 18px;
  border-bottom: 1px solid var(--border);
}

.user-item:last-child { border-bottom: none; }

.user-avatar {
  width: 36px; height: 36px;
  border-radius: 50%;
  background: var(--orange);
  color: #fff;
  font-size: 0.82rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  text-transform: uppercase;
}

.user-info { flex: 1; min-width: 0; }

.user-name {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-email {
  font-size: 0.72rem;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Empty state ──────────────────────────────────────────────────────── */
.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--muted);
  font-size: 0.85rem;
}

/* ── Scrollbar ────────────────────────────────────────────────────────── */
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

/* ── Settings ─────────────────────────────────────────────────────────── */
.settings-group {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  margin-bottom: 20px;
  max-width: 720px;
}

.settings-group-title {
  padding: 13px 20px;
  border-bottom: 1px solid var(--border);
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.07em;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

.settings-row:last-child { border-bottom: none; }

.settings-info { flex: 1; min-width: 160px; }

.settings-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text);
}

.settings-desc {
  display: block;
  font-size: 0.75rem;
  color: var(--muted);
  margin-top: 2px;
}

.settings-control {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.settings-control input[type="text"] {
  padding: 9px 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-family: inherit;
  font-size: 0.875rem;
  width: 220px;
  transition: border-color 0.15s;
}

.settings-control input[type="text"]:focus {
  outline: none;
  border-color: var(--orange);
}

/* Theme toggle */
.theme-toggle {
  display: flex;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.theme-btn {
  padding: 8px 18px;
  border: none;
  background: none;
  color: var(--muted);
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  -webkit-tap-highlight-color: transparent;
}

.theme-btn.active {
  background: var(--orange);
  color: #fff;
}

/* Color swatches */
.color-swatches {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.swatch {
  width: 28px; height: 28px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform 0.15s, border-color 0.15s;
  -webkit-tap-highlight-color: transparent;
  flex-shrink: 0;
}

.swatch:hover   { transform: scale(1.15); }
.swatch.active  { border-color: var(--text); transform: scale(1.1); }

.swatch-custom {
  background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
}

.swatch-custom input { position: absolute; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
.swatch-custom span  { font-size: 0.9rem; color: #fff; font-weight: 700; pointer-events: none; }

/* Logo / bg upload */
.logo-preview-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.logo-preview {
  width: 48px; height: 48px;
  object-fit: contain;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg);
}

.logo-preview.hidden { display: none; }

.btn-upload {
  padding: 8px 16px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.15s;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
}

.btn-upload:hover { border-color: var(--orange); }

.btn-ghost-sm {
  padding: 8px 14px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--muted);
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
}

.btn-ghost-sm:hover { border-color: var(--text); color: var(--text); }
.btn-ghost-sm.danger:hover { border-color: var(--danger); color: var(--danger); }

/* Privileges table */
.priv-table { padding: 0; }

.priv-header,
.priv-row {
  display: grid;
  grid-template-columns: 1fr 80px 80px 100px;
  padding: 11px 20px;
  font-size: 0.82rem;
  border-bottom: 1px solid var(--border);
  align-items: center;
}

.priv-row:last-child { border-bottom: none; }

.priv-header {
  color: var(--muted);
  font-weight: 600;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.priv-row { color: var(--text); }

.priv-check { text-align: center; font-weight: 600; }
.priv-check.yes { color: var(--success); }
.priv-check.no  { color: var(--muted); }

/* ── Reports ──────────────────────────────────────────────────────────── */
.report-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border);
  margin-bottom: 20px;
}

.rtab {
  padding: 10px 20px;
  border: none;
  background: none;
  color: var(--muted);
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
  -webkit-tap-highlight-color: transparent;
}

.rtab:hover  { color: var(--text); }
.rtab.active { color: var(--text); border-bottom-color: var(--orange); }

.rtab-content        { display: none; }
.rtab-content.active { display: block; }

/* Report card */
.report-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  margin-bottom: 16px;
}

.report-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.report-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text);
}

.report-subtitle {
  font-size: 0.78rem;
  color: var(--muted);
  margin-top: 2px;
}

.report-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.report-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: var(--border);
  border-bottom: 1px solid var(--border);
}

.report-stat {
  background: var(--surface);
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.report-stat-label {
  font-size: 0.68rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 500;
}

.report-stat-value {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.02em;
}

.report-stat-value.green { color: var(--success); }
.report-stat-value.orange { color: var(--orange); }

/* Monthly chart bars */
.month-bars {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bar-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.82rem;
}

.bar-label { width: 130px; color: var(--text); font-weight: 500; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-track { flex: 1; background: var(--surface2); border-radius: 4px; height: 10px; overflow: hidden; }
.bar-fill  { height: 100%; background: var(--orange); border-radius: 4px; transition: width 0.4s ease; }
.bar-val   { width: 70px; text-align: right; color: var(--muted); flex-shrink: 0; }

/* Print styles */
@media print {
  .sidebar, .bottom-nav, .report-tabs, .toolbar,
  .report-actions, .btn-primary, .btn-ghost,
  .page-header p, nav { display: none !important; }
  body { background: #fff; color: #000; font-size: 12px; }
  .content { margin: 0; padding: 0; }
  .report-card { border: 1px solid #ccc; break-inside: avoid; }
  .report-stat-value { color: #000 !important; }
  .bar-fill { background: #555 !important; }
  .view.hidden { display: none !important; }
  #view-ventas { display: block !important; }
  .rtab-content { display: block !important; }
}

/* ── Settings save bar ────────────────────────────────────────────────── */
.settings-save-bar {
  max-width: 720px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.settings-save-info {
  font-size: 0.82rem;
  color: var(--success);
  font-weight: 500;
  min-height: 20px;
}

/* ── Login screen ─────────────────────────────────────────────────────── */
#login-screen {
  position: fixed;
  inset: 0;
  background: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 500;
  padding: 20px;
}

.login-box {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 32px 28px;
  width: 100%;
  max-width: 380px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.4);
}

.login-brand {
  text-align: center;
  margin-bottom: 28px;
}

.login-brand .brand-title {
  display: block;
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text);
}

.login-brand .brand-sub {
  display: block;
  font-size: 0.8rem;
  color: var(--muted);
  margin-top: 4px;
}

.login-box .form-group {
  margin-bottom: 14px;
}

.login-error {
  background: rgba(248,113,113,0.12);
  border: 1px solid rgba(248,113,113,0.3);
  color: var(--danger);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 0.82rem;
  margin-bottom: 14px;
}

.login-error.hidden { display: none; }

.login-hint {
  text-align: center;
  font-size: 0.78rem;
  color: var(--muted);
  margin-top: 14px;
}

.login-hint a {
  color: var(--orange);
  text-decoration: none;
  font-weight: 500;
}

/* Logout button in sidebar */
.sidebar-logout {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
  background: none;
  font-family: inherit;
  width: 100%;
  transition: background 0.15s, color 0.15s;
  -webkit-tap-highlight-color: transparent;
  margin-top: 4px;
}

.sidebar-logout:hover { background: rgba(248,113,113,0.1); color: var(--danger); }

.sidebar-logout svg {
  width: 15px; height: 15px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.8;
  stroke-linecap: round;
  flex-shrink: 0;
}

/* ── Bulk upload modal ────────────────────────────────────────────────── */
#bulk-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 16px;
  backdrop-filter: blur(3px);
}

#bulk-overlay.hidden { display: none; }

.bulk-modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0;
  width: 100%;
  max-width: 680px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 8px 40px rgba(0,0,0,0.5);
}

.bulk-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border);
}

.bulk-header h3 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
}

.bulk-instructions {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bulk-instructions p {
  font-size: 0.82rem;
  color: var(--muted);
}

.bulk-instructions code {
  font-size: 0.78rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 12px;
  display: block;
  color: var(--orange);
  font-family: monospace;
  word-break: break-all;
}

.bulk-preview-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  font-size: 0.82rem;
  border-bottom: 1px solid var(--border);
}

.bulk-error-count { color: var(--danger); font-weight: 600; }

.bulk-row-ok    { background: rgba(74,222,128,0.05); }
.bulk-row-error { background: rgba(248,113,113,0.07); }
.bulk-row-error td { color: var(--danger) !important; }

.bulk-status-ok    { color: var(--success); font-weight: 600; font-size: 0.78rem; }
.bulk-status-error { color: var(--danger);  font-weight: 600; font-size: 0.78rem; }

#bulk-preview-wrap { padding-bottom: 4px; }
#bulk-preview-wrap .form-actions { padding: 0 20px 20px; }

/* ── Sale layout (new) ────────────────────────────────────────────────── */
.sale-layout {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 16px;
  align-items: start;
}

.sale-product-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.sale-search-bar {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sale-search-bar input {
  padding: 9px 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-family: inherit;
  font-size: 1rem;
  width: 100%;
}

.sale-search-bar input:focus { outline: none; border-color: var(--orange); }

.sale-cat-filter {
  display: flex;
  gap: 6px;
}

.scat-btn {
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: none;
  color: var(--muted);
  font-family: inherit;
  font-size: 0.78rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  -webkit-tap-highlight-color: transparent;
}

.scat-btn.active { background: var(--orange); border-color: var(--orange); color: #fff; }

/* Product list items */
.sale-product-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  transition: background 0.12s;
}

.sale-product-item:last-child { border-bottom: none; }
.sale-product-item:hover { background: var(--surface2); }

.sale-product-info { flex: 1; min-width: 0; }

.sale-product-name {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sale-product-meta {
  font-size: 0.72rem;
  color: var(--muted);
  margin-top: 2px;
}

.sale-product-price {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--orange);
  flex-shrink: 0;
  margin-right: 8px;
}

.sale-qty-ctrl {
  display: flex;
  align-items: center;
  gap: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}

.sale-qty-btn {
  width: 32px; height: 32px;
  border: none;
  background: var(--surface2);
  color: var(--text);
  font-size: 1.1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.12s;
  flex-shrink: 0;
}

.sale-qty-btn:hover { background: var(--border); }

.sale-qty-val {
  width: 36px;
  text-align: center;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text);
  background: var(--bg);
  border: none;
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
  padding: 0;
  height: 32px;
  font-family: inherit;
}

.sale-qty-val:focus { outline: none; }

.sale-product-item.in-cart { background: rgba(224,123,57,0.06); }
.sale-product-item.out-of-stock { opacity: 0.45; pointer-events: none; }

/* Cart panel */
.sale-cart-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  position: sticky;
  top: 20px;
}

.sale-cart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

#cart-items { max-height: 340px; overflow-y: auto; }

.cart-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  font-size: 0.82rem;
}

.cart-item:last-child { border-bottom: none; }
.cart-item-name { flex: 1; font-weight: 500; color: var(--text); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cart-item-qty  { color: var(--muted); flex-shrink: 0; }
.cart-item-total { font-weight: 600; color: var(--orange); flex-shrink: 0; min-width: 52px; text-align: right; }

.cart-footer {
  padding: 14px 16px;
  border-top: 1px solid var(--border);
}

.cart-total-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 6px;
}

/* ── Sale categories (legacy, keep for compat) ────────────────────────── */
.sale-categories {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 20px;
}

.sale-cat-box { max-width: 100%; }
.sale-cat-header { font-size: 0.82rem !important; font-weight: 600 !important; }
.dulce-header   { color: var(--orange) !important; }
.pulsera-header { color: #a78bfa !important; }

/* ── Bottom nav more menu ─────────────────────────────────────────────── */
.bnav-more-menu {
  position: absolute;
  bottom: var(--bnav-h);
  right: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius) var(--radius) 0 0;
  min-width: 200px;
  box-shadow: 0 -4px 20px rgba(0,0,0,0.4);
  z-index: 60;
}

.bnav-more-menu.hidden { display: none; }

.bnav-more-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 20px;
  border: none;
  background: none;
  color: var(--text);
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
  -webkit-tap-highlight-color: transparent;
  text-align: left;
}

.bnav-more-item:last-child { border-bottom: none; }
.bnav-more-item:hover { background: var(--surface2); }

.bnav-more-item svg {
  width: 18px; height: 18px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}

/* ── Bottom nav ───────────────────────────────────────────────────────── */
.bottom-nav {
  display: none;
  position: fixed;
  bottom: 0; left: 0; right: 0;
  height: var(--bnav-h);
  background: var(--surface);
  border-top: 1px solid var(--border);
  z-index: 50;
}

.bottom-nav-inner {
  display: flex;
  height: 100%;
}

.bnav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  color: var(--muted);
  font-size: 0.6rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
  background: none;
  font-family: inherit;
  transition: color 0.15s;
  -webkit-tap-highlight-color: transparent;
  padding: 8px 2px;
}

.bnav-item svg {
  width: 22px; height: 22px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.bnav-item.active { color: var(--orange); }

/* ── Responsive ───────────────────────────────────────────────────────── */
@media (max-width: 960px) {
  .stats-grid { grid-template-columns: 1fr 1fr; }
}

@media (max-width: 640px) {
  :root { --sidebar-w: 0px; }

  .sidebar    { display: none; }
  .bottom-nav { display: block; }

  .content {
    padding: 20px 14px calc(var(--bnav-h) + 16px);
    margin-left: 0;
  }

  .stats-grid { grid-template-columns: 1fr 1fr; gap: 10px; }

  .stat-value { font-size: 1.15rem; }

  .form-grid { grid-template-columns: 1fr; }

  /* Modal full-width sheet */
  .modal {
    border-radius: 16px 16px 0 0;
    padding: 20px 16px 28px;
  }

  /* Tables scroll horizontally, never wrap */
  .table-scroll { border-radius: 0; }
  table { min-width: 480px; }
  th, td { padding: 10px 12px; }

  .page-header h1 { font-size: 1.25rem; }

  .btn-primary,
  .btn-ghost { width: 100%; text-align: center; }

  .form-actions { flex-direction: column; }

  .sale-layout { grid-template-columns: 1fr; }
  .sale-cart-panel { position: static; }
  #cart-items { max-height: 200px; }
  .sale-categories { grid-template-columns: 1fr; }
  .report-stats { grid-template-columns: 1fr 1fr; }
  .settings-control input[type="text"] { width: 100%; }
  .settings-row { flex-direction: column; align-items: flex-start; gap: 10px; }
  .priv-header, .priv-row { grid-template-columns: 1fr 50px 60px 80px; padding: 10px 14px; font-size: 0.75rem; }

  /* section-box no max-width on mobile */
  .section-box[style*="max-width"] { max-width: 100% !important; }
  .settings-group { max-width: 100% !important; }
}

@media (max-width: 380px) {
  .stats-grid { grid-template-columns: 1fr; }
}

// SW — Network First con versión automática por timestamp de build
const BUILD = '__BUILD_TIME__'; // reemplazado en build, o usa Date si no hay build
const CACHE = 'inv-' + BUILD;
const ASSETS = ['/index.html', '/styles.css', '/app.js'];

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
