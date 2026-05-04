// ── Helpers ────────────────────────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function fmt(n) { return '$' + Number(n).toFixed(2); }
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}
function localDateStr(date) {
  const d = date || new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.className = 'toast', 3000);
}

// ── State ────────────────────────────────────────────────────────────────────
let products   = [];
let movements  = [];
let users      = [];
let activeUserId = null;
let currentRole  = 'Admin';
let _productImgData  = null;
let _productImg2Data = null;
let _productImg3Data = null;
let _editId = null;
let _saleCart = {};
let _pendingSettings = {};

// ── Firebase bridge ──────────────────────────────────────────────────────────
function saveItem(col, item) {
  if (typeof fbSaveItem === 'function') {
    fbSaveItem(col, item).catch(e => console.warn('Firebase save error:', e));
  }
  const arr = col === 'products' ? products : col === 'movements' ? movements : users;
  const idx = arr.findIndex(x => x.id === item.id);
  if (idx >= 0) arr[idx] = item; else arr.push(item);
  renderAll();
}
function deleteItem(col, id) {
  if (typeof fbDeleteItem === 'function') {
    fbDeleteItem(col, id).catch(e => console.warn('Firebase delete error:', e));
  }
  if (col === 'products')  products  = products.filter(x => x.id !== id);
  if (col === 'movements') movements = movements.filter(x => x.id !== id);
  if (col === 'users')     users     = users.filter(x => x.id !== id);
  renderAll();
}

// ── Navigation ───────────────────────────────────────────────────────────────
function navigate(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.bnav-item').forEach(n => n.classList.remove('active'));

  const el = document.getElementById('view-' + view);
  if (el) el.classList.add('active');

  document.querySelectorAll('[data-view="' + view + '"]').forEach(n => n.classList.add('active'));
  window.scrollTo(0, 0);

  if (view === 'panel')    renderPanel();
  if (view === 'products') renderInventory();
  if (view === 'sales')    initSaleView();
  if (view === 'history')  renderMovements();
  if (view === 'reports')  initReports();
  if (view === 'users')    renderUsers();
  if (view === 'settings') loadSettingsUI();
}

// ── Render Panel ─────────────────────────────────────────────────────────────
function renderPanel() {
  const totalProducts = products.length;
  const totalInvestment = products.reduce((s, p) => s + (p.buyPrice * p.stock), 0);
  const totalPotentialGain = products.reduce((s, p) => s + ((p.sellPrice - p.buyPrice) * p.stock), 0);
  const totalSold = movements
    .filter(m => m.type === 'out')
    .reduce((s, m) => s + (m.price * m.qty), 0);

  const el = id => document.getElementById(id);
  if (el('stat-products'))   el('stat-products').textContent   = totalProducts;
  if (el('stat-investment'))  el('stat-investment').textContent  = fmt(totalInvestment);
  if (el('stat-gain'))        el('stat-gain').textContent        = fmt(totalPotentialGain);
  if (el('stat-sold'))        el('stat-sold').textContent        = fmt(totalSold);

  // Low stock list
  const lowList = document.getElementById('low-stock-list');
  if (lowList) {
    const low = products.filter(p => p.stock <= 3).sort((a, b) => a.stock - b.stock);
    if (low.length === 0) {
      lowList.innerHTML = '<p class="muted" style="padding:12px">Sin productos con bajo stock</p>';
    } else {
      lowList.innerHTML = low.map(p => `
        <div class="low-item">
          <span>${p.name}</span>
          <span class="badge ${p.stock === 0 ? 'badge-danger' : 'badge-warn'}">${p.stock} uds</span>
        </div>`).join('');
    }
  }
}

// ── Render Inventory ──────────────────────────────────────────────────────────
function renderInventory() {
  const search = (document.getElementById('search-products') || {}).value || '';
  const cat    = (document.getElementById('filter-cat') || {}).value || '';
  const tbody  = document.getElementById('inventory-body');
  if (!tbody) return;

  let list = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchCat    = !cat || p.category === cat;
    return matchSearch && matchCat;
  });

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted)">Sin productos</td></tr>';
    return;
  }

  const isAdmin = currentRole === 'Admin';
  const canEdit = isAdmin;

  tbody.innerHTML = list.map(p => {
    const profit = (p.sellPrice - p.buyPrice).toFixed(2);
    const img = p.img ? `<img src="${p.img}" class="product-thumb" alt="">` : `<span class="cat-icon">${p.category === 'dulces' ? '🍬' : '📿'}</span>`;
    return `
      <tr>
        <td>${img}</td>
        <td>${p.name}</td>
        <td><span class="badge">${p.category}</span></td>
        <td>${p.stock}</td>
        <td>${fmt(p.buyPrice)}</td>
        <td>${fmt(p.sellPrice)}</td>
        <td class="admin-only">${fmt(profit)}</td>
        <td>
          <button class="btn-action btn-in" onclick="openMovModal('${p.id}','in')" title="Entrada">↓</button>
          <button class="btn-action btn-out" onclick="openMovModal('${p.id}','out')" title="Salida">↑</button>
          ${canEdit ? `<button class="btn-action btn-edit" onclick="editProduct('${p.id}')" title="Editar">✎</button>` : ''}
          ${isAdmin ? `<button class="btn-action btn-delete" onclick="deleteProduct('${p.id}')" title="Eliminar">✕</button>` : ''}
        </td>
      </tr>`;
  }).join('');
}

// ── Product Form ──────────────────────────────────────────────────────────────
function showProductForm() {
  if (currentRole === 'Solo lectura') { alert('Sin permisos'); return; }
  navigate('new-product');
  resetForm();
}

function resetForm() {
  _editId = null;
  _productImgData = null;
  _productImg2Data = null;
  _productImg3Data = null;
  const form = document.getElementById('product-form');
  if (form) form.reset();
  const previews = ['img-preview', 'img2-preview', 'img3-preview'];
  previews.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.src = '';
  });
  const title = document.getElementById('form-title');
  if (title) title.textContent = 'Nuevo Producto';
  const btn = document.getElementById('form-btn');
  if (btn) btn.textContent = 'Guardar Producto';
}

function editProduct(pid) {
  const p = products.find(x => x.id === pid);
  if (!p) return;
  navigate('new-product');
  _editId = pid;
  _productImgData  = p.img  || null;
  _productImg2Data = p.img2 || null;
  _productImg3Data = p.img3 || null;
  const s = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  s('f-name', p.name);
  s('f-category', p.category);
  s('f-stock', p.stock);
  s('f-buy', p.buyPrice);
  s('f-sell', p.sellPrice);
  s('f-desc', p.description || '');

  const setPreview = (id, src) => {
    const el = document.getElementById(id);
    if (el && src) { el.src = src; el.style.display = 'block'; }
  };
  setPreview('img-preview', p.img);
  setPreview('img2-preview', p.img2);
  setPreview('img3-preview', p.img3);

  const title = document.getElementById('form-title');
  if (title) title.textContent = 'Editar Producto';
  const btn = document.getElementById('form-btn');
  if (btn) btn.textContent = 'Actualizar Producto';
}

async function compressImage(file, maxPx = 500, quality = 0.65) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxPx || h > maxPx) {
          if (w > h) { h = Math.round(h * maxPx / w); w = maxPx; }
          else       { w = Math.round(w * maxPx / h); h = maxPx; }
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── Product Save ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Image inputs
  const imgInputs = [
    { input: 'f-img',  preview: 'img-preview',  slot: 1 },
    { input: 'f-img2', preview: 'img2-preview', slot: 2 },
    { input: 'f-img3', preview: 'img3-preview', slot: 3 },
  ];
  imgInputs.forEach(({ input, preview, slot }) => {
    const el = document.getElementById(input);
    if (!el) return;
    el.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      const compressed = await compressImage(file, 450, 0.65);
      if (slot === 1) _productImgData = compressed;
      if (slot === 2) _productImg2Data = compressed;
      if (slot === 3) _productImg3Data = compressed;
      const prev = document.getElementById(preview);
      if (prev) { prev.src = compressed; prev.style.display = 'block'; }
    });
  });

  // Product form submit
  const form = document.getElementById('product-form');
  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const name     = document.getElementById('f-name').value.trim();
      const category = document.getElementById('f-category').value;
      const stock    = parseInt(document.getElementById('f-stock').value) || 0;
      const buyPrice = parseFloat(document.getElementById('f-buy').value) || 0;
      const sellPrice= parseFloat(document.getElementById('f-sell').value) || 0;
      const desc     = (document.getElementById('f-desc') || {}).value || '';

      if (!name || !category) { showToast('Nombre y categoría son requeridos', 'error'); return; }
      if (sellPrice < buyPrice) { showToast('Precio de venta debe ser mayor al de compra', 'error'); return; }

      const product = {
        id: _editId || uid(),
        name, category, stock, buyPrice, sellPrice,
        description: desc,
        img:  _productImgData  || null,
        img2: _productImg2Data || null,
        img3: _productImg3Data || null,
        createdAt: _editId ? (products.find(p => p.id === _editId) || {}).createdAt || new Date().toISOString() : new Date().toISOString()
      };

      saveItem('products', product);
      showToast(_editId ? 'Producto actualizado' : 'Producto guardado');
      resetForm();
      navigate('products');
    });
  }

  // Search / filter
  const sp = document.getElementById('search-products');
  if (sp) sp.addEventListener('input', renderInventory);
  const fc = document.getElementById('filter-cat');
  if (fc) fc.addEventListener('change', renderInventory);

  // Nav items
  document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.view));
  });

  // More menu (bottom nav)
  const moreBtn = document.getElementById('bnav-more');
  const moreMenu = document.getElementById('more-menu');
  if (moreBtn && moreMenu) {
    moreBtn.addEventListener('click', e => {
      e.stopPropagation();
      moreMenu.classList.toggle('show');
    });
    document.addEventListener('click', () => moreMenu.classList.remove('show'));
  }

  // Logout
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (typeof fbLogout === 'function') fbLogout();
    });
  }
  const logoutBtnMobile = document.getElementById('logout-btn-mobile');
  if (logoutBtnMobile) {
    logoutBtnMobile.addEventListener('click', () => {
      if (typeof fbLogout === 'function') fbLogout();
    });
  }

  // Bulk import
  const bulkBtn = document.getElementById('bulk-import-btn');
  if (bulkBtn) bulkBtn.addEventListener('click', openBulkModal);
  const bulkFile = document.getElementById('bulk-file');
  if (bulkFile) bulkFile.addEventListener('change', handleBulkFile);
  const bulkConfirm = document.getElementById('bulk-confirm');
  if (bulkConfirm) bulkConfirm.addEventListener('click', confirmBulkImport);
  const bulkClose = document.getElementById('bulk-close');
  if (bulkClose) bulkClose.addEventListener('click', closeBulkModal);
  const templateBtn = document.getElementById('download-template');
  if (templateBtn) templateBtn.addEventListener('click', downloadTemplate);

  // Movement modal
  const movForm = document.getElementById('mov-form');
  if (movForm) movForm.addEventListener('submit', submitMovement);
  const movClose = document.getElementById('mov-close');
  if (movClose) movClose.addEventListener('click', closeMovModal);

  // Reports
  const rptDate = document.getElementById('r-date');
  if (rptDate) {
    rptDate.value = localDateStr();
    rptDate.addEventListener('change', () => generateDailyReport());
  }
  const rptMonth = document.getElementById('r-month');
  const rptYear  = document.getElementById('r-year');
  if (rptMonth && rptYear) {
    const now = new Date();
    rptMonth.value = now.getMonth() + 1;
    rptYear.value  = now.getFullYear();
    rptMonth.addEventListener('change', generateMonthlyReport);
    rptYear.addEventListener('change', generateMonthlyReport);
  }

  // Settings save
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettings);

  // Settings fields
  setupSettingsListeners();

});

// ── Delete product ────────────────────────────────────────────────────────────
function deleteProduct(pid) {
  if (currentRole !== 'Admin') { alert('Solo el Admin puede eliminar productos'); return; }
  if (!confirm('¿Eliminar este producto?')) return;
  deleteItem('products', pid);
  showToast('Producto eliminado');
}

// ── Movement Modal ────────────────────────────────────────────────────────────
let _movProductId = null;
let _movType = null;

function openMovModal(pid, type) {
  if (currentRole === 'Solo lectura') { alert('Sin permisos'); return; }
  _movProductId = pid;
  _movType = type;
  const p = products.find(x => x.id === pid);
  if (!p) return;
  const overlay = document.getElementById('modal-overlay');
  const title   = document.getElementById('mov-title');
  const info    = document.getElementById('mov-product-info');
  const stockEl = document.getElementById('mov-stock');
  if (!overlay) return;
  if (title)   title.textContent = type === 'in' ? 'Registrar Entrada' : 'Registrar Salida';
  if (info)    info.textContent  = p.name;
  if (stockEl) stockEl.textContent = p.stock;
  const priceEl = document.getElementById('mov-price');
  if (priceEl) priceEl.value = type === 'out' ? p.sellPrice : p.buyPrice;
  const qtyEl = document.getElementById('mov-qty');
  if (qtyEl) { qtyEl.value = 1; qtyEl.max = type === 'out' ? p.stock : 9999; }
  overlay.classList.remove('hidden');
}

function closeMovModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function submitMovement(e) {
  e.preventDefault();
  const qty   = parseInt(document.getElementById('mov-qty').value) || 0;
  const price = parseFloat(document.getElementById('mov-price').value) || 0;
  const note  = (document.getElementById('mov-note') || {}).value || '';
  const p     = products.find(x => x.id === _movProductId);
  if (!p) return;

  if (_movType === 'out' && qty > p.stock) {
    showToast('Stock insuficiente', 'error'); return;
  }

  const newStock = _movType === 'in' ? p.stock + qty : p.stock - qty;
  const updated  = { ...p, stock: newStock };
  saveItem('products', updated);

  const mov = {
    id: uid(),
    productId: p.id,
    productName: p.name,
    type: _movType,
    qty,
    price,
    profit: _movType === 'out' ? (price - p.buyPrice) * qty : 0,
    note,
    date: new Date().toISOString()
  };
  saveItem('movements', mov);
  closeMovModal();
  showToast(_movType === 'in' ? 'Entrada registrada' : 'Venta registrada');
}

// ── Render Movements ──────────────────────────────────────────────────────────
function renderMovements() {
  const tbody = document.getElementById('movements-body');
  if (!tbody) return;
  const list = [...movements].sort((a, b) => new Date(b.date) - new Date(a.date));
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">Sin movimientos</td></tr>';
    return;
  }
  const isAdmin = currentRole === 'Admin';
  tbody.innerHTML = list.slice(0, 100).map(m => `
    <tr>
      <td>${fmtDate(m.date)}</td>
      <td>${m.productName}</td>
      <td><span class="badge ${m.type === 'in' ? 'badge-in' : 'badge-out'}">${m.type === 'in' ? 'Entrada' : 'Salida'}</span></td>
      <td>${m.qty}</td>
      <td>${fmt(m.price)}</td>
      <td class="admin-only">${m.type === 'out' ? fmt(m.profit) : '-'}</td>
      <td>${m.note || '-'}</td>
    </tr>`).join('');
}

// ── Sale View ─────────────────────────────────────────────────────────────────
function initSaleView() {
  _saleCart = {};
  renderSaleProductList();
  renderCart();
}

function renderSaleProductList() {
  const search = (document.getElementById('sale-search') || {}).value || '';
  const catFilter = (document.getElementById('sale-cat-filter') || {}).value || '';
  const list = document.getElementById('sale-product-list');
  if (!list) return;

  let prods = products.filter(p => p.stock > 0);
  if (search) prods = prods.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  if (catFilter) prods = prods.filter(p => p.category === catFilter);

  if (prods.length === 0) {
    list.innerHTML = '<p style="color:var(--muted);padding:16px">Sin productos disponibles</p>';
    return;
  }

  list.innerHTML = prods.map(p => {
    const qty = _saleCart[p.id] || 0;
    const img = p.img ? `<img src="${p.img}" class="sale-product-img" alt="">` : `<span class="sale-cat-icon">${p.category === 'dulces' ? '🍬' : '📿'}</span>`;
    return `
      <div class="sale-product-item">
        ${img}
        <div class="sale-product-info">
          <div class="sale-product-name">${p.name}</div>
          <div class="sale-product-meta">${fmt(p.sellPrice)} · Stock: ${p.stock}</div>
        </div>
        <div class="sale-qty-controls">
          <button class="qty-btn" onclick="changeSaleQty('${p.id}', -1)">−</button>
          <input class="qty-input" type="number" min="0" max="${p.stock}" value="${qty}"
            onchange="setSaleQty('${p.id}', this.value)" />
          <button class="qty-btn" onclick="changeSaleQty('${p.id}', 1)">+</button>
        </div>
      </div>`;
  }).join('');
}

function changeSaleQty(pid, delta) {
  const p = products.find(x => x.id === pid);
  if (!p) return;
  const current = _saleCart[pid] || 0;
  const next = Math.max(0, Math.min(p.stock, current + delta));
  if (next === 0) delete _saleCart[pid]; else _saleCart[pid] = next;
  renderSaleProductList();
  renderCart();
}

function setSaleQty(pid, val) {
  const p = products.find(x => x.id === pid);
  if (!p) return;
  const qty = Math.max(0, Math.min(p.stock, parseInt(val) || 0));
  if (qty === 0) delete _saleCart[pid]; else _saleCart[pid] = qty;
  renderCart();
}

function renderCart() {
  const cartEl = document.getElementById('cart-items');
  const totalEl = document.getElementById('cart-total');
  const gainEl  = document.getElementById('cart-gain');
  const confirmBtn = document.getElementById('confirm-sale-btn');
  if (!cartEl) return;

  const entries = Object.entries(_saleCart).filter(([, q]) => q > 0);
  if (entries.length === 0) {
    cartEl.innerHTML = '<p style="color:var(--muted);padding:8px">Sin productos seleccionados</p>';
    if (totalEl) totalEl.textContent = fmt(0);
    if (gainEl)  gainEl.textContent  = fmt(0);
    if (confirmBtn) confirmBtn.disabled = true;
    return;
  }

  let total = 0, gain = 0;
  cartEl.innerHTML = entries.map(([pid, qty]) => {
    const p = products.find(x => x.id === pid);
    if (!p) return '';
    const subtotal = p.sellPrice * qty;
    const subgain  = (p.sellPrice - p.buyPrice) * qty;
    total += subtotal; gain += subgain;
    return `<div class="cart-item">
      <span>${p.name} x${qty}</span>
      <span>${fmt(subtotal)}</span>
    </div>`;
  }).join('');

  if (totalEl) totalEl.textContent = fmt(total);
  if (gainEl)  gainEl.textContent  = fmt(gain);
  if (confirmBtn) confirmBtn.disabled = false;
}

function confirmSale() {
  if (currentRole === 'Solo lectura') { alert('Sin permisos'); return; }
  const entries = Object.entries(_saleCart).filter(([, q]) => q > 0);
  if (entries.length === 0) { showToast('Agrega productos al carrito', 'error'); return; }

  entries.forEach(([pid, qty]) => {
    const p = products.find(x => x.id === pid);
    if (!p || qty <= 0) return;
    saveItem('products', { ...p, stock: p.stock - qty });
    saveItem('movements', {
      id: uid(),
      productId: p.id,
      productName: p.name,
      type: 'out',
      qty,
      price: p.sellPrice,
      profit: (p.sellPrice - p.buyPrice) * qty,
      note: 'Venta rápida',
      date: new Date().toISOString()
    });
  });

  showToast('Venta registrada ✓');
  initSaleView();
}

// ── Reports ───────────────────────────────────────────────────────────────────
function initReports() {
  generateDailyReport();
  generateMonthlyReport();
}

function generateDailyReport() {
  const dateEl = document.getElementById('r-date');
  const date = dateEl ? dateEl.value : localDateStr();
  const dayMovs = movements.filter(m => m.type === 'out' && m.date.startsWith(date));

  const container = document.getElementById('daily-report');
  if (!container) return;

  const totalSold = dayMovs.reduce((s, m) => s + m.price * m.qty, 0);
  const totalGain = dayMovs.reduce((s, m) => s + (m.profit || 0), 0);
  const totalUnits = dayMovs.reduce((s, m) => s + m.qty, 0);
  const distinctProds = new Set(dayMovs.map(m => m.productId)).size;

  if (dayMovs.length === 0) {
    container.innerHTML = '<p style="color:var(--muted);padding:16px">Sin ventas para esta fecha</p>';
    return;
  }

  container.innerHTML = buildReportHTML({
    title: `Reporte del ${date}`,
    movs: dayMovs,
    stats: { totalSold, totalGain, totalUnits, distinctProds },
    type: 'daily',
    date
  });
}

function generateMonthlyReport() {
  const monthEl = document.getElementById('r-month');
  const yearEl  = document.getElementById('r-year');
  if (!monthEl || !yearEl) return;
  const month = parseInt(monthEl.value);
  const year  = parseInt(yearEl.value);

  const monthMovs = movements.filter(m => {
    if (m.type !== 'out') return false;
    const d = new Date(m.date);
    return d.getMonth() + 1 === month && d.getFullYear() === year;
  });

  const container = document.getElementById('monthly-report');
  if (!container) return;

  const totalSold = monthMovs.reduce((s, m) => s + m.price * m.qty, 0);
  const totalGain = monthMovs.reduce((s, m) => s + (m.profit || 0), 0);
  const totalUnits = monthMovs.reduce((s, m) => s + m.qty, 0);
  const distinctProds = new Set(monthMovs.map(m => m.productId)).size;

  if (monthMovs.length === 0) {
    container.innerHTML = '<p style="color:var(--muted);padding:16px">Sin ventas para este mes</p>';
    return;
  }

  container.innerHTML = buildReportHTML({
    title: `Reporte ${monthEl.options[monthEl.selectedIndex].text} ${year}`,
    movs: monthMovs,
    stats: { totalSold, totalGain, totalUnits, distinctProds },
    type: 'monthly',
    date: `${year}-${String(month).padStart(2,'0')}`
  });
}

function buildReportHTML({ title, movs, stats, type, date }) {
  const rows = movs.map(m => `
    <tr>
      <td>${fmtDate(m.date)}</td>
      <td>${m.productName}</td>
      <td>${m.qty}</td>
      <td>${fmt(m.price)}</td>
      <td>${fmt(m.price * m.qty)}</td>
      <td class="admin-only">${fmt(m.profit || 0)}</td>
    </tr>`).join('');

  return `
    <div class="report-stats">
      <div class="rstat"><div class="rstat-val">${stats.distinctProds}</div><div class="rstat-label">Productos</div></div>
      <div class="rstat"><div class="rstat-val">${stats.totalUnits}</div><div class="rstat-label">Unidades</div></div>
      <div class="rstat"><div class="rstat-val">${fmt(stats.totalSold)}</div><div class="rstat-label">Total vendido</div></div>
      <div class="rstat admin-only"><div class="rstat-val">${fmt(stats.totalGain)}</div><div class="rstat-label">Ganancia</div></div>
    </div>
    <div class="report-actions">
      <button onclick="downloadCSV('${type}','${date}')" class="btn-secondary">⬇ CSV</button>
      <button onclick="printReport('${type}','${date}')" class="btn-secondary">🖨 Imprimir</button>
      <button onclick="downloadPDF('${type}','${date}')" class="btn-secondary">📄 PDF</button>
      <button onclick="shareReport('${type}','${date}')" class="btn-secondary">📤 Compartir</button>
    </div>
    <div class="table-scroll">
      <table class="report-table">
        <thead><tr><th>Fecha</th><th>Producto</th><th>Cant</th><th>Precio</th><th>Total</th><th class="admin-only">Ganancia</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function downloadCSV(type, date) {
  const movs = type === 'daily'
    ? movements.filter(m => m.type === 'out' && m.date.startsWith(date))
    : movements.filter(m => {
        if (m.type !== 'out') return false;
        const d = new Date(m.date);
        return m.date.startsWith(date);
      });
  const bom = '\uFEFF';
  const header = 'Fecha,Producto,Cantidad,Precio,Total,Ganancia\n';
  const rows = movs.map(m =>
    `${fmtDate(m.date)},${m.productName},${m.qty},${m.price},${m.price * m.qty},${m.profit || 0}`
  ).join('\n');
  const blob = new Blob([bom + header + rows], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `reporte_${date}.csv`;
  a.click();
}

function printReport(type, date) {
  downloadPDF(type, date);
}

function downloadPDF(type, date) {
  const movs = movements.filter(m => {
    if (m.type !== 'out') return false;
    return m.date.startsWith(date);
  });
  const settings = getUserSettings(activeUserId);
  const storeName = settings.storeName || 'Inventario TALARA';
  const rows = movs.map(m => `
    <tr>
      <td>${fmtDate(m.date)}</td>
      <td>${m.productName}</td>
      <td>${m.qty}</td>
      <td>${fmt(m.price)}</td>
      <td>${fmt(m.price * m.qty)}</td>
    </tr>`).join('');
  const total = movs.reduce((s, m) => s + m.price * m.qty, 0);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Reporte ${date}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
      h1 { color: #e07b39; } h2 { color: #555; font-size: 14px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th { background: #f5f5f5; padding: 8px; text-align: left; border-bottom: 2px solid #ddd; }
      td { padding: 7px 8px; border-bottom: 1px solid #eee; }
      .total { font-weight: bold; text-align: right; margin-top: 12px; font-size: 16px; }
    </style></head><body>
    <h1>${storeName}</h1>
    <h2>Reporte de ventas — ${date}</h2>
    <table>
      <thead><tr><th>Fecha</th><th>Producto</th><th>Cant</th><th>Precio</th><th>Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="total">Total: ${fmt(total)}</p>
    <script>window.onload=()=>{window.print();}<\/script>
    </body></html>`;
  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); }
  else showToast('Activa ventanas emergentes para descargar el PDF', 'error');
}

function shareReport(type, date) {
  if (navigator.share) {
    navigator.share({ title: 'Reporte TALARA', text: `Reporte de ventas ${date}`, url: window.location.href });
  } else {
    navigator.clipboard.writeText(window.location.href).then(() => showToast('URL copiada'));
  }
}

// ── Users ─────────────────────────────────────────────────────────────────────
function renderUsers() {
  const list = document.getElementById('users-list');
  if (!list) return;
  if (users.length === 0) {
    list.innerHTML = '<p style="color:var(--muted);padding:16px">Sin usuarios registrados</p>';
    return;
  }
  list.innerHTML = users.map(u => {
    const initials = u.name ? u.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '?';
    const roleColors = { 'Admin': '#e07b39', 'Usuario': '#4a9e6f', 'Solo lectura': '#7a7570' };
    const roleColor = roleColors[u.role] || '#7a7570';
    return `
      <div class="user-card">
        <div class="user-avatar" style="background:${roleColor}">${initials}</div>
        <div class="user-info">
          <div class="user-name">${u.name || 'Sin nombre'}</div>
          <div class="user-email">${u.email || ''}</div>
        </div>
        <span class="badge" style="background:${roleColor}20;color:${roleColor}">${u.role}</span>
        ${currentRole === 'Admin' ? `
          <select onchange="changeUserRole('${u.id}', this.value)" style="margin-left:8px">
            <option ${u.role==='Admin'?'selected':''}>Admin</option>
            <option ${u.role==='Usuario'?'selected':''}>Usuario</option>
            <option ${u.role==='Solo lectura'?'selected':''}>Solo lectura</option>
          </select>` : ''}
      </div>`;
  }).join('');
}

function changeUserRole(uid, role) {
  if (currentRole !== 'Admin') { alert('Solo Admin puede cambiar roles'); return; }
  const u = users.find(x => x.id === uid);
  if (!u) return;
  saveItem('users', { ...u, role });
  showToast('Rol actualizado');
}

// ── Settings ──────────────────────────────────────────────────────────────────
const DEFAULTS = {
  storeName: 'TALARA',
  storeSubtitle: 'Dulces & Pulseras',
  theme: 'dark',
  accent: '#e07b39',
  bgOpacity: 0,
  logoData: null,
  logoMobileData: null,
  bgData: null
};

function getUserSettings(uid) {
  try {
    const raw = localStorage.getItem('inv_settings_' + uid);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch { return { ...DEFAULTS }; }
}

function saveUserSettings(uid, settings) {
  localStorage.setItem('inv_settings_' + uid, JSON.stringify(settings));
  if (typeof fbSaveSettings === 'function') {
    fbSaveSettings(uid, settings).catch(e => console.warn('Settings save error:', e));
  }
}

function applySettings(settings) {
  const root = document.documentElement;
  if (settings.theme === 'light') {
    root.style.setProperty('--bg', '#f5f5f5');
    root.style.setProperty('--surface', '#ffffff');
    root.style.setProperty('--surface2', '#eeeeee');
    root.style.setProperty('--border', '#dddddd');
    root.style.setProperty('--text', '#111111');
    root.style.setProperty('--muted', '#666666');
  } else {
    root.style.setProperty('--bg', '#141414');
    root.style.setProperty('--surface', '#1e1e1e');
    root.style.setProperty('--surface2', '#252525');
    root.style.setProperty('--border', '#2e2e2e');
    root.style.setProperty('--text', '#f0ece6');
    root.style.setProperty('--muted', '#7a7570');
  }
  root.style.setProperty('--orange', settings.accent || '#e07b39');

  const logo = document.getElementById('sidebar-logo');
  const name = document.getElementById('sidebar-store-name');
  const sub  = document.getElementById('sidebar-store-subtitle');
  if (logo && settings.logoData) { logo.src = settings.logoData; logo.style.display = 'block'; }
  if (name) name.textContent = settings.storeName || 'TALARA';
  if (sub)  sub.textContent  = settings.storeSubtitle || '';

  const mobileLogo = document.getElementById('mobile-logo');
  const mobileName = document.getElementById('mobile-store-name');
  if (mobileLogo && (settings.logoMobileData || settings.logoData)) {
    mobileLogo.src = settings.logoMobileData || settings.logoData;
    mobileLogo.style.display = 'block';
  }
  if (mobileName) mobileName.textContent = settings.storeName || 'TALARA';

  const splash = document.getElementById('splash-logo-text');
  if (splash) splash.textContent = (settings.storeName || 'TALARA')[0];
  const splashName = document.getElementById('splash-store-name');
  if (splashName) splashName.textContent = settings.storeName || 'TALARA';

  document.title = settings.storeName || 'TALARA';
}

function loadSettingsUI() {
  const settings = getUserSettings(activeUserId);
  _pendingSettings = { ...settings };

  const s = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  s('set-store-name', settings.storeName);
  s('set-store-subtitle', settings.storeSubtitle);
  s('set-accent', settings.accent || '#e07b39');
  s('set-bg-opacity', settings.bgOpacity || 0);

  const themeBtn = document.querySelector(`.theme-btn[data-theme="${settings.theme}"]`);
  if (themeBtn) {
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    themeBtn.classList.add('active');
  }

  const logoPreview = document.getElementById('logo-preview');
  if (logoPreview && settings.logoData) { logoPreview.src = settings.logoData; logoPreview.style.display = 'block'; }
  const logoMobilePreview = document.getElementById('logo-mobile-preview');
  if (logoMobilePreview && settings.logoMobileData) { logoMobilePreview.src = settings.logoMobileData; logoMobilePreview.style.display = 'block'; }
}

function setupSettingsListeners() {
  const bind = (id, key, transform) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      _pendingSettings[key] = transform ? transform(el.value) : el.value;
    });
  };
  bind('set-store-name', 'storeName');
  bind('set-store-subtitle', 'storeSubtitle');
  bind('set-accent', 'accent');
  bind('set-bg-opacity', 'bgOpacity', v => parseFloat(v));

  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _pendingSettings.theme = btn.dataset.theme;
      applySettings(_pendingSettings);
    });
  });

  document.querySelectorAll('.accent-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _pendingSettings.accent = btn.dataset.color;
      const el = document.getElementById('set-accent');
      if (el) el.value = btn.dataset.color;
      applySettings(_pendingSettings);
    });
  });

  const logoInput = document.getElementById('logo-upload');
  if (logoInput) {
    logoInput.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      const compressed = await compressImage(file, 300, 0.8);
      _pendingSettings.logoData = compressed;
      const prev = document.getElementById('logo-preview');
      if (prev) { prev.src = compressed; prev.style.display = 'block'; }
    });
  }

  const logoMobileInput = document.getElementById('logo-mobile-upload');
  if (logoMobileInput) {
    logoMobileInput.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      const compressed = await compressImage(file, 300, 0.8);
      _pendingSettings.logoMobileData = compressed;
      const prev = document.getElementById('logo-mobile-preview');
      if (prev) { prev.src = compressed; prev.style.display = 'block'; }
    });
  }

  const bgInput = document.getElementById('bg-upload');
  if (bgInput) {
    bgInput.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      const compressed = await compressImage(file, 1200, 0.7);
      _pendingSettings.bgData = compressed;
    });
  }

  const exportBtn = document.getElementById('export-data-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const data = { products, movements, users, exported: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'inventario_backup.json';
      a.click();
    });
  }

  const resetBtn = document.getElementById('reset-data-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (!confirm('¿Restablecer todos los datos? Esta acción no se puede deshacer.')) return;
      products = []; movements = []; users = [];
      renderAll();
      showToast('Datos restablecidos');
    });
  }
}

function saveSettings() {
  saveUserSettings(activeUserId, _pendingSettings);
  applySettings(_pendingSettings);
  showToast('✓ Cambios guardados');
}

// ── Privileges ────────────────────────────────────────────────────────────────
function applyPrivileges(role) {
  currentRole = role;
  const isAdmin  = role === 'Admin';
  const canWrite = role === 'Admin' || role === 'Usuario';

  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = isAdmin ? '' : 'none';
  });
  document.querySelectorAll('.write-only').forEach(el => {
    el.style.display = canWrite ? '' : 'none';
  });

  const newProdNav = document.querySelector('[data-view="new-product"]');
  if (newProdNav) newProdNav.style.display = canWrite ? '' : 'none';

  const usersNav = document.querySelector('[data-view="users"]');
  if (usersNav) usersNav.style.display = isAdmin ? '' : 'none';

  const userInfoEl = document.getElementById('sidebar-user-info');
  if (userInfoEl) {
    const u = users.find(x => x.id === activeUserId);
    userInfoEl.textContent = u ? `${u.name} · ${u.role}` : role;
  }
  const mobileUserEl = document.getElementById('mobile-user-info');
  if (mobileUserEl) {
    const u = users.find(x => x.id === activeUserId);
    mobileUserEl.textContent = u ? `${u.name} (${u.role})` : role;
  }
}

// ── Bulk Import ───────────────────────────────────────────────────────────────
let _bulkValid = [];

function openBulkModal() {
  const overlay = document.getElementById('bulk-overlay');
  if (overlay) overlay.classList.remove('hidden');
}
function closeBulkModal() {
  const overlay = document.getElementById('bulk-overlay');
  if (overlay) overlay.classList.add('hidden');
  _bulkValid = [];
}
function downloadTemplate() {
  const csv = 'nombre,categoria,stock,precio_compra,precio_venta,descripcion\nChocolate artesanal,dulces,20,15,25,Chocolate hecho a mano\nPulsera chaquiras,pulseras,10,30,60,Pulsera de chaquiras multicolor\n';
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'plantilla_productos.csv';
  a.click();
}
function handleBulkFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    let text = ev.target.result.replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    const header = lines[0].toLowerCase();
    const start = header.includes('nombre') ? 1 : 0;
    const preview = document.getElementById('bulk-preview');
    const tbody = document.getElementById('bulk-tbody');
    if (!tbody) return;
    _bulkValid = [];
    tbody.innerHTML = lines.slice(start).map(line => {
      const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
      const [name, cat, stock, buy, sell, desc] = cols;
      const errors = [];
      if (!name) errors.push('Nombre vacío');
      if (!['dulces', 'pulseras'].includes((cat || '').toLowerCase())) errors.push('Categoría inválida');
      if (isNaN(parseInt(stock)) || parseInt(stock) < 0) errors.push('Stock inválido');
      if (isNaN(parseFloat(buy))) errors.push('Precio compra inválido');
      if (isNaN(parseFloat(sell))) errors.push('Precio venta inválido');
      if (!errors.length && parseFloat(sell) < parseFloat(buy)) errors.push('Venta < compra');
      const valid = errors.length === 0;
      if (valid) _bulkValid.push({ id: uid(), name, category: cat.toLowerCase(), stock: parseInt(stock), buyPrice: parseFloat(buy), sellPrice: parseFloat(sell), description: desc || '', createdAt: new Date().toISOString() });
      return `<tr class="${valid ? 'bulk-valid' : 'bulk-error'}"><td>${name||'-'}</td><td>${cat||'-'}</td><td>${stock||'-'}</td><td>${buy||'-'}</td><td>${sell||'-'}</td><td>${errors.join(', ') || '✓'}</td></tr>`;
    }).join('');
    if (preview) preview.classList.remove('hidden');
  };
  reader.readAsText(file, 'UTF-8');
}
function confirmBulkImport() {
  if (_bulkValid.length === 0) { showToast('Sin filas válidas', 'error'); return; }
  _bulkValid.forEach(p => saveItem('products', p));
  showToast(`${_bulkValid.length} productos importados`);
  closeBulkModal();
}

// ── Render All ────────────────────────────────────────────────────────────────
function renderAll() {
  renderPanel();
  renderInventory();
  renderMovements();
  renderSaleProductList();
  renderCart();
  renderUsers();
}

// ── Splash ────────────────────────────────────────────────────────────────────
function hideSplash() {
  const splash = document.getElementById('splash');
  if (splash) {
    splash.style.opacity = '0';
    splash.style.transition = 'opacity 0.4s';
    setTimeout(() => { splash.style.display = 'none'; }, 400);
  }
  document.body.style.visibility = 'visible';
}

// ── Init ──────────────────────────────────────────────────────────────────────
navigate('panel');

if (typeof initFirebase === 'function') {
  initFirebase({
    onData: (col, data) => {
      if (col === 'products')  { products  = data; renderAll(); }
      if (col === 'movements') { movements = data; renderAll(); }
      if (col === 'users')     { users     = data; renderAll(); }
    },
    onUser: (user) => {
      if (!user) return;
      activeUserId = user.uid;
      const u = users.find(x => x.id === user.uid);
      const role = u ? u.role : 'Admin';
      applyPrivileges(role);
      const settings = getUserSettings(user.uid);
      applySettings(settings);
      hideSplash();
    },
    onSettings: (uid, settings) => {
      if (uid === activeUserId) applySettings(settings);
    }
  });
} else {
  hideSplash();
}

// Sale search/filter listeners (delegated)
document.addEventListener('input', e => {
  if (e.target.id === 'sale-search') renderSaleProductList();
});
document.addEventListener('change', e => {
  if (e.target.id === 'sale-cat-filter') renderSaleProductList();
});

// Confirm sale button
document.addEventListener('click', e => {
  if (e.target.id === 'confirm-sale-btn') confirmSale();
});

// cache-bust-20260504
