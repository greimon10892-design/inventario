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
