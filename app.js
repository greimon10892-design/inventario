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

// ========== ESTADO (solo en memoria, sin localStorage para datos) ==========
let products  = [];
let movements = [];
let users     = [];
let cart      = {};
let productImages = ['', '', '']; // hasta 3 fotos por producto

// ========== HELPERS ==========
function uid()    { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function fmt(n)   { return '$' + Number(n || 0).toFixed(2); }
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}
function getProduct(id) { return products.find(p => p.id === id); }
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[m] || m));
}
function showToast(msg, duration = 2500) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast'; t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg; t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', duration);
}

// ========== COMPRESOR DE IMÁGENES ==========
function comprimirImagen(file, maxWidth = 600, quality = 0.75) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function hideSplash() {
  const s = document.getElementById('splash');
  if (s) { s.classList.add('hide'); setTimeout(() => s.style.display = 'none', 500); }
}

// ========== FIREBASE: PRODUCTOS ==========
async function saveProductToFirebase(p) {
  if (!db) return;
  try {
    await setDoc(doc(db, 'products', p.id), {
      name:      p.name      || '',
      category:  p.category  || '',
      stock:     p.stock     || 0,
      buyPrice:  p.buyPrice  || 0,
      sellPrice: p.sellPrice || 0,
      desc:      p.desc      || '',
      img:       p.img       || '',
      updatedAt: serverTimestamp()
    });
  } catch (e) { console.warn('Error guardando producto:', e.message); }
}

async function deleteProductFromFirebase(id) {
  if (!db) return;
  try { await deleteDoc(doc(db, 'products', id)); }
  catch (e) { console.warn('Error eliminando producto:', e.message); }
}

// ========== FIREBASE: MOVIMIENTOS ==========
async function saveMovimientoToFirebase(mov) {
  if (!db) return;
  try {
    await setDoc(doc(db, 'movements', mov.id), {
      productId:   mov.productId,
      productName: mov.productName,
      type:        mov.type,
      qty:         mov.qty,
      price:       mov.price,
      total:       mov.total,
      date:        mov.date
    });
  } catch (e) { console.warn('Error guardando movimiento:', e.message); }
}

// ========== REGISTRAR MOVIMIENTO ==========
async function registrarMovimiento(productId, productName, type, qty, price) {
  const mov = {
    id: uid(), productId, productName, type, qty, price,
    total: price * qty, date: new Date().toISOString()
  };
  movements.unshift(mov);
  renderMovements();
  await saveMovimientoToFirebase(mov);
  return mov;
}

// ========== SYNC FIREBASE EN TIEMPO REAL ==========
function iniciarSyncFirebase() {
  if (!db) { hideSplash(); return; }

  // Escuchar productos
  onSnapshot(collection(db, 'products'), snap => {
    products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderInventory();
    updateSummary();
    renderSaleProductList();
  }, err => console.warn('Error sync productos:', err.message));

  // Escuchar movimientos — todos, sin límite
  onSnapshot(collection(db, 'movements'), snap => {
    movements = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    renderMovements();
    updateSummary();
  }, err => console.warn('Error sync movimientos:', err.message));
}

// ========== NAVEGACIÓN ==========
function navigate(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const target = document.getElementById(`view-${view}`);
  if (target) target.classList.remove('hidden');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const nav = document.querySelector(`.nav-item[data-view="${view}"]`);
  if (nav) nav.classList.add('active');

  document.querySelectorAll('.bnav-item').forEach(n => n.classList.remove('active'));
  const bnav = document.querySelector(`.bnav-item[data-view="${view}"]`);
  if (bnav) bnav.classList.add('active');

  if      (view === 'ventas')      {
    renderSaleProductList(); renderCart();
    // Asegurar que el tab activo se muestre correctamente
    const activeTab = document.querySelector('.rtab.active');
    if (!activeTab) {
      document.querySelector('.rtab[data-rtab="vender"]')?.classList.add('active');
      document.getElementById('rtab-vender')?.classList.add('active');
    }
  }
  else if (view === 'productos')   renderInventory();
  else if (view === 'movimientos') renderMovements();
  else if (view === 'usuarios')    renderUsers();
  else if (view === 'panel')       updateSummary();
  else if (view === 'ajustes')     loadSettingsUI();
}
window.navigate = navigate;

// ========== PANEL ==========
function updateSummary() {
  document.getElementById('total-products').textContent = products.length;
  const inv  = products.reduce((s, p) => s + (p.buyPrice  || 0) * (p.stock || 0), 0);
  const gain = products.reduce((s, p) => s + ((p.sellPrice || 0) - (p.buyPrice || 0)) * (p.stock || 0), 0);
  const sold = movements.filter(m => m.type === 'salida').reduce((s, m) => s + (m.total || 0), 0);
  document.getElementById('total-inversion').textContent  = fmt(inv);
  document.getElementById('total-ganancia').textContent   = fmt(gain);
  document.getElementById('total-vendido').textContent    = fmt(sold);

  const low = products.filter(p => (p.stock || 0) <= 5);
  const el  = document.getElementById('low-stock-list');
  if (el) {
    el.innerHTML = low.length === 0
      ? '<div class="empty-state">Sin productos con bajo stock</div>'
      : low.map(p => `<div class="low-stock-item">
          <span class="low-stock-name">${escapeHtml(p.name)}</span>
          <span class="low-stock-qty ${p.stock === 0 ? 'stock-low' : ''}">${p.stock} uds.</span>
        </div>`).join('');
  }
}

// ========== INVENTARIO ==========
function renderInventory() {
  const search = (document.getElementById('search')?.value || '').toLowerCase();
  const cat    = document.getElementById('filter-category')?.value || '';
  const list   = products.filter(p =>
    (p.name || '').toLowerCase().includes(search) && (!cat || p.category === cat)
  );
  const tbody = document.getElementById('inventory-body');
  if (!tbody) return;
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state">No se encontraron productos.</div></td></tr>';
    return;
  }
  tbody.innerHTML = list.map(p => {
    const gain    = (p.sellPrice || 0) - (p.buyPrice || 0);
    const catBadge = p.category === 'dulce'
      ? '<span class="badge badge-dulce">Dulce</span>'
      : '<span class="badge badge-pulsera">Pulsera</span>';
    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          ${p.img ? `<img src="${p.img}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:6px;flex-shrink:0" />` : '<div style="width:40px;height:40px;border-radius:6px;background:var(--surface2);flex-shrink:0"></div>'}
          <div>
            <div class="td-name">${escapeHtml(p.name)}</div>
            ${p.desc ? `<div class="td-sub">${escapeHtml(p.desc)}</div>` : ''}
          </div>
        </div>
      </td>
      <td>${catBadge}</td>
      <td class="${(p.stock || 0) <= 5 ? 'stock-low' : ''}">${p.stock || 0}</td>
      <td>${fmt(p.buyPrice)}</td>
      <td>${fmt(p.sellPrice)}</td>
      <td class="td-gain">${fmt(gain)}</td>
      <td class="td-actions">
        <button class="btn-icon" onclick="window.openMovModal('${p.id}','entrada')" title="Entrada">↓</button>
        <button class="btn-icon" onclick="window.openMovModal('${p.id}','salida')"  title="Salida">↑</button>
        <button class="btn-icon" onclick="window.editProduct('${p.id}')"            title="Editar">✎</button>
        <button class="btn-icon btn-danger" onclick="window.deleteProduct('${p.id}')" title="Eliminar">✕</button>
      </td>
    </tr>`;
  }).join('');
}

// ========== MOVIMIENTOS ==========
function renderMovements() {
  const typeFilter = document.getElementById('filter-mov-type')?.value || '';
  const list = movements.filter(m => !typeFilter || m.type === typeFilter);
  const tbody = document.getElementById('mov-body');
  if (!tbody) return;
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state">Sin movimientos registrados.</div></td></tr>';
    return;
  }
  tbody.innerHTML = list.map(m => {
    const p        = getProduct(m.productId);
    const name     = p ? p.name : (m.productName || '—');
    const badge    = m.type === 'entrada'
      ? '<span class="badge badge-entrada">Entrada</span>'
      : '<span class="badge badge-salida">Salida</span>';
    const gainCell = m.type === 'salida' && p
      ? `<td class="td-gain">${fmt(((p.sellPrice || 0) - (p.buyPrice || 0)) * m.qty)}</td>`
      : '<td>—</td>';
    return `<tr>
      <td class="td-date">${fmtDate(m.date)}</td>
      <td class="td-name">${escapeHtml(name)}</td>
      <td>${badge}</td>
      <td>${m.qty}</td>
      <td>${fmt(m.price)}</td>
      <td>${fmt(m.price * m.qty)}</td>
      ${gainCell}
    </tr>`;
  }).join('');
}

// ========== MODAL MOVIMIENTOS ==========
window.openMovModal = function(productId, type) {
  const p = getProduct(productId);
  if (!p) return;
  document.getElementById('m-product-id').value    = productId;
  document.getElementById('m-product-name').value  = p.name;
  document.getElementById('m-type').value          = type;
  document.getElementById('m-qty').value           = 1;
  document.getElementById('m-price').value         = type === 'salida' ? p.sellPrice : p.buyPrice;
  document.getElementById('m-price-label').textContent =
    type === 'salida' ? 'Precio de Venta ($)' : 'Precio de Compra ($)';
  document.getElementById('modal-title').textContent =
    type === 'entrada' ? 'Registrar entrada' : 'Registrar salida';
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
    alert(`Stock insuficiente. Solo hay ${p.stock} unidades.`); return;
  }
  p.stock = (p.stock || 0) + (type === 'entrada' ? qty : -qty);
  await saveProductToFirebase(p);
  await registrarMovimiento(p.id, p.name, type, qty, price);
  renderInventory();
  updateSummary();
  renderSaleProductList();
  window.closeMovModal();
  showToast(`${type === 'entrada' ? 'Entrada' : 'Salida'} registrada: ${qty} × ${p.name}`);
});

// ========== CRUD PRODUCTOS ==========
window.editProduct = function(id) {
  const p = getProduct(id);
  if (!p) return;
  document.getElementById('edit-id').value       = p.id;
  document.getElementById('f-name').value        = p.name;
  document.getElementById('f-category').value    = p.category;
  document.getElementById('f-stock').value       = p.stock;
  document.getElementById('f-buy').value         = p.buyPrice;
  document.getElementById('f-sell').value        = p.sellPrice;
  document.getElementById('f-desc').value        = p.desc || '';
  document.getElementById('form-title').textContent = 'Editar Producto';
  document.getElementById('cancel-edit').style.display = 'inline-block';
  // Cargar imágenes existentes
  productImages = ['', '', ''];
  [['img', 0], ['img2', 1], ['img3', 2]].forEach(([key, slot]) => {
    const src = p[key] || '';
    productImages[slot] = src;
    const preview   = document.getElementById('f-img-preview-' + slot);
    const holder    = document.getElementById('f-img-placeholder-' + slot);
    const removeBtn = document.getElementById('f-img-remove-' + slot);
    if (src) {
      if (preview)   { preview.src = src; preview.classList.remove('hidden'); }
      if (holder)    holder.classList.add('hidden');
      if (removeBtn) removeBtn.style.display = 'inline-block';
    } else {
      if (preview)   { preview.src = ''; preview.classList.add('hidden'); }
      if (holder)    holder.classList.remove('hidden');
      if (removeBtn) removeBtn.style.display = 'none';
    }
  });
  navigate('agregar');
};

window.deleteProduct = async function(id) {
  const p = getProduct(id);
  if (!p) return;
  if (!confirm(`¿Eliminar "${p.name}"?`)) return;
  await deleteProductFromFirebase(id);
  showToast(`Producto "${p.name}" eliminado`);
};

document.getElementById('cancel-edit')?.addEventListener('click', () => {
  document.getElementById('product-form').reset();
  document.getElementById('edit-id').value = '';
  document.getElementById('form-title').textContent = 'Nuevo Producto';
  document.getElementById('cancel-edit').style.display = 'none';
  navigate('productos');
});

document.getElementById('product-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const editId = document.getElementById('edit-id').value;
  const data = {
    name:      document.getElementById('f-name').value.trim(),
    category:  document.getElementById('f-category').value,
    stock:     parseInt(document.getElementById('f-stock').value),
    buyPrice:  parseFloat(document.getElementById('f-buy').value),
    sellPrice: parseFloat(document.getElementById('f-sell').value),
    desc:      document.getElementById('f-desc').value.trim()
  };
  if (data.sellPrice < data.buyPrice) {
    alert('El precio de venta no puede ser menor al precio de compra.'); return;
  }
  // Agregar imágenes al producto
  const imgs = productImages.filter(i => i);
  data.img  = imgs[0] || '';
  data.img2 = imgs[1] || '';
  data.img3 = imgs[2] || '';

  if (editId) {
    const existing = getProduct(editId);
    // Conservar imágenes viejas si no se subieron nuevas
    if (!data.img  && existing.img)  data.img  = existing.img;
    if (!data.img2 && existing.img2) data.img2 = existing.img2;
    if (!data.img3 && existing.img3) data.img3 = existing.img3;
    await saveProductToFirebase({ ...existing, ...data, id: editId });
    showToast(`Producto "${data.name}" actualizado`);
  } else {
    await saveProductToFirebase({ id: uid(), ...data });
    showToast(`Producto "${data.name}" agregado`);
  }
  // Limpiar imágenes
  productImages = ['', '', ''];
  [0, 1, 2].forEach(slot => {
    const preview = document.getElementById('f-img-preview-' + slot);
    const holder  = document.getElementById('f-img-placeholder-' + slot);
    const removeBtn = document.getElementById('f-img-remove-' + slot);
    const input = document.getElementById('f-img-' + slot);
    if (preview)   { preview.src = ''; preview.classList.add('hidden'); }
    if (holder)    holder.classList.remove('hidden');
    if (removeBtn) removeBtn.style.display = 'none';
    if (input)     input.value = '';
  });
  document.getElementById('product-form').reset();
  document.getElementById('edit-id').value = '';
  document.getElementById('cancel-edit').style.display = 'none';
  navigate('productos');
});

// ========== VENTAS ==========
function renderSaleProductList() {
  const search = (document.getElementById('sale-search')?.value || '').toLowerCase();
  const cat    = document.querySelector('.scat-btn.active')?.dataset.cat || '';
  const list   = products.filter(p =>
    (!cat || p.category === cat) &&
    (!search || (p.name || '').toLowerCase().includes(search))
  );
  const container = document.getElementById('sale-product-list');
  if (!container) return;
  if (list.length === 0) { container.innerHTML = '<div class="empty-state">Sin productos.</div>'; return; }
  container.innerHTML = list.map(p => {
    const qty     = cart[p.id] || 0;
    const noStock = (p.stock || 0) <= 0;
    return `<div class="sale-product-item ${qty > 0 ? 'in-cart' : ''} ${noStock ? 'out-of-stock' : ''}" data-id="${p.id}">
      <div style="display:flex;align-items:center;gap:10px;flex:1">
        ${p.img ? `<img src="${p.img}" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:8px;flex-shrink:0" />` : '<div style="width:44px;height:44px;border-radius:8px;background:var(--surface2);flex-shrink:0"></div>'}
        <div class="sale-product-info">
          <div class="sale-product-name">${escapeHtml(p.name)}</div>
          <div class="sale-product-meta">Stock: ${p.stock || 0} | Precio: ${fmt(p.sellPrice)}</div>
        </div>
      </div>
      <div class="sale-qty-ctrl">
        <button class="sale-qty-btn" onclick="window.cartChange('${p.id}',-1)">−</button>
        <input class="sale-qty-val" type="number" min="0" max="${p.stock || 0}"
          value="${qty}" onchange="window.cartSet('${p.id}',this.value)" />
        <button class="sale-qty-btn" onclick="window.cartChange('${p.id}',1)">+</button>
      </div>
    </div>`;
  }).join('');
}

window.cartChange = function(id, delta) {
  const p = getProduct(id);
  if (!p) return;
  const nxt = Math.max(0, Math.min(p.stock || 0, (cart[id] || 0) + delta));
  if (nxt === 0) delete cart[id]; else cart[id] = nxt;
  renderSaleProductList(); renderCart();
};

window.cartSet = function(id, val) {
  const p = getProduct(id);
  if (!p) return;
  const n = Math.max(0, Math.min(p.stock || 0, parseInt(val) || 0));
  if (n === 0) delete cart[id]; else cart[id] = n;
  renderSaleProductList(); renderCart();
};


// ========== COMPARTIR VENTA ACTUAL ==========
function compartirVentaActual() {
  const ids = Object.keys(cart);
  if (!ids.length) { showToast('El carrito está vacío'); return; }
  const total = ids.reduce((s,id) => s + (getProduct(id)?.sellPrice||0)*cart[id], 0);
  const gain  = ids.reduce((s,id) => { const p=getProduct(id); return s + ((p?.sellPrice||0)-(p?.buyPrice||0))*cart[id]; }, 0);
  let txt = '🛍️ *Venta TALARA*\n';
  txt += '📅 ' + new Date().toLocaleDateString('es-MX', {day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}) + '\n';
  txt += '─────────────────\n';
  ids.forEach(id => {
    const p = getProduct(id);
    if (!p) return;
    txt += '• ' + p.name + ' x' + cart[id] + ' → $' + (p.sellPrice*cart[id]).toFixed(2) + '\n';
  });
  txt += '─────────────────\n';
  txt += '💰 Total: $' + total.toFixed(2) + '\n';
  txt += '✅ Ganancia: $' + gain.toFixed(2) + '\n';
  txt += '─────────────────\n';
  txt += 'Inventario TALARA';

  // Intentar Web Share API (móvil) o abrir WhatsApp
  if (navigator.share) {
    navigator.share({ title: 'Venta TALARA', text: txt }).catch(()=>{});
  } else {
    window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank');
  }
}

function renderCart() {
  const container  = document.getElementById('cart-items');
  const totalSpan  = document.getElementById('cart-total');
  const gainSpan   = document.getElementById('cart-gain');
  const btn        = document.getElementById('btn-confirm-sale');
  if (!container) return;
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
    const qty = cart[id];
    const sub = (p.sellPrice || 0) * qty;
    total += sub;
    gain  += ((p.sellPrice || 0) - (p.buyPrice || 0)) * qty;
    return `<div class="cart-item">
      <span class="cart-item-name">${escapeHtml(p.name)}</span>
      <span class="cart-item-qty">×${qty}</span>
      <span class="cart-item-total">${fmt(sub)}</span>
      <button class="btn-icon btn-danger" onclick="window.cartChange('${id}',-999)">✕</button>
    </div>`;
  }).join('');
  if (totalSpan) totalSpan.textContent = fmt(total);
  if (gainSpan)  gainSpan.textContent  = fmt(gain);
  if (btn) btn.disabled = false;

  // Botón compartir PDF de venta actual
  let shareBtn = document.getElementById('btn-share-sale');
  if (!shareBtn) {
    shareBtn = document.createElement('button');
    shareBtn.id = 'btn-share-sale';
    shareBtn.className = 'btn-ghost-sm';
    shareBtn.style.cssText = 'width:100%;margin-top:8px';
    shareBtn.textContent = '📄 Compartir como PDF / WhatsApp';
    shareBtn.onclick = compartirVentaActual;
    btn?.parentNode?.insertBefore(shareBtn, btn.nextSibling);
  }

  // Botón registrar gasto/cancelación
  let gastoBtn = document.getElementById('btn-gasto');
  if (!gastoBtn) {
    gastoBtn = document.createElement('button');
    gastoBtn.id = 'btn-gasto';
    gastoBtn.className = 'btn-ghost-sm';
    gastoBtn.style.cssText = 'width:100%;margin-top:8px;color:var(--danger,#f87171)';
    gastoBtn.textContent = '🗑️ Cancelar / Registrar Gasto';
    gastoBtn.onclick = () => {
      const m = document.getElementById('modal-gasto');
      if (m) { m.style.display='flex'; m.classList.remove('hidden'); }
    };
    btn?.parentNode?.appendChild(gastoBtn);
  }
}

document.getElementById('btn-confirm-sale')?.addEventListener('click', async () => {
  const ids = Object.keys(cart);
  if (!ids.length) return;
  const btn = document.getElementById('btn-confirm-sale');
  if (btn) btn.disabled = true;
  for (const id of ids) {
    const p = getProduct(id); if (!p) continue;
    const qty = cart[id];
    p.stock = (p.stock || 0) - qty;
    await saveProductToFirebase(p);
    await registrarMovimiento(p.id, p.name, 'salida', qty, p.sellPrice || 0);
  }
  cart = {};
  renderSaleProductList(); renderCart();
  // Mensaje de venta exitosa
  const msgDiv = document.createElement('div');
  msgDiv.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#4ade80;color:#000;padding:24px 40px;border-radius:16px;font-size:1.2rem;font-weight:700;z-index:9999;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.3)';
  msgDiv.innerHTML = '✅ ¡Venta Exitosa!<br><span style="font-size:0.9rem;font-weight:400">' + ids.length + ' producto' + (ids.length > 1 ? 's' : '') + ' vendido' + (ids.length > 1 ? 's' : '') + '</span>';
  document.body.appendChild(msgDiv);
  setTimeout(() => msgDiv.remove(), 2500);
});

document.getElementById('cart-clear')?.addEventListener('click', () => {
  cart = {}; renderSaleProductList(); renderCart();
});

document.getElementById('sale-search')?.addEventListener('input', renderSaleProductList);
document.querySelectorAll('.scat-btn').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.scat-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    renderSaleProductList();
  });
});

// ========== USUARIOS ==========
function renderUsers() {
  const container = document.getElementById('user-list');
  const label     = document.getElementById('user-count-label');
  if (!container) return;
  if (label) label.textContent = `${users.length} usuario${users.length !== 1 ? 's' : ''} con acceso`;
  if (users.length === 0) {
    container.innerHTML = '<div class="empty-state">Sin usuarios registrados.</div>'; return;
  }
  container.innerHTML = users.map(u => {
    const roleKey = u.role === 'Admin' ? 'admin' : u.role === 'Usuario' ? 'usuario' : 'readonly';
    return `<div class="user-item">
      <div class="user-avatar">${u.name.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase()}</div>
      <div class="user-info">
        <div class="user-name">${escapeHtml(u.name)}</div>
        <div class="user-email">${escapeHtml(u.email)}</div>
      </div>
      <span class="badge badge-${roleKey}">${u.role}</span>
      ${u.role !== 'Admin'
        ? `<button class="btn-icon btn-danger" onclick="window.deleteUser('${u.id}')">✕</button>`
        : '<span style="width:32px;display:inline-block"></span>'}
    </div>`;
  }).join('');
}

window.deleteUser = function(id) {
  const u = users.find(x => x.id === id); if (!u) return;
  if (!confirm(`¿Eliminar a "${u.name}"?`)) return;
  users = users.filter(x => x.id !== id);
  try { localStorage.setItem('users', JSON.stringify(users)); } catch(e) {}
  renderUsers();
  showToast(`Usuario "${u.name}" eliminado`);
};

document.getElementById('user-form')?.addEventListener('submit', e => {
  e.preventDefault();
  const name  = document.getElementById('u-name').value.trim();
  const email = document.getElementById('u-email').value.trim().toLowerCase();
  const role  = document.getElementById('u-role').value;
  if (!name || !email) { alert('Completa todos los campos'); return; }
  if (users.find(u => u.email === email)) { alert('Ya existe un usuario con ese correo.'); return; }
  const u = { id: uid(), name, email, role, date: new Date().toISOString() };
  users.push(u);
  try { localStorage.setItem('users', JSON.stringify(users)); } catch(e) {}
  renderUsers();
  document.getElementById('user-form').reset();
  showToast(`Usuario "${name}" agregado`);
});



// ========== IMAGEN DE FONDO ==========
function setupBgUpload() {
  const input     = document.getElementById('s-bg');
  const preview   = document.getElementById('bg-preview');
  const removeBtn = document.getElementById('remove-bg');
  const opacitySlider = document.getElementById('s-bg-opacity');
  const opacityVal    = document.getElementById('s-bg-opacity-val');
  if (!input) return;

  function applyBg(src, opacity) {
    const content = document.querySelector('.content');
    if (!content) return;
    if (src) {
      content.style.backgroundImage  = `url(${src})`;
      content.style.backgroundSize   = 'cover';
      content.style.backgroundRepeat = 'no-repeat';
      content.style.backgroundAttachment = 'fixed';
      content.style.setProperty('--bg-opacity', (opacity || 15) / 100);
    } else {
      content.style.backgroundImage = 'none';
    }
  }

  // Cargar fondo guardado
  const savedBg  = localStorage.getItem('bg_image');
  const savedOp  = localStorage.getItem('bg_opacity') || '15';
  if (savedBg && preview) {
    preview.src = savedBg; preview.classList.remove('hidden');
    if (removeBtn) removeBtn.style.display = 'inline-block';
    applyBg(savedBg, parseInt(savedOp));
  }
  if (opacitySlider) { opacitySlider.value = savedOp; }
  if (opacityVal)    { opacityVal.textContent = savedOp + '%'; }

  input.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    showToast('⏳ Cargando fondo…');
    const base64 = await comprimirImagen(file, 1200, 0.7);
    try { localStorage.setItem('bg_image', base64); } catch(e) { showToast('⚠️ Imagen muy grande'); return; }
    if (preview) { preview.src = base64; preview.classList.remove('hidden'); }
    if (removeBtn) removeBtn.style.display = 'inline-block';
    applyBg(base64, parseInt(opacitySlider?.value || 15));
    showToast('✅ Fondo guardado');
  });

  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      try { localStorage.removeItem('bg_image'); } catch(e) {}
      if (preview) { preview.src = ''; preview.classList.add('hidden'); }
      removeBtn.style.display = 'none';
      input.value = '';
      applyBg(null);
    });
  }

  if (opacitySlider) {
    opacitySlider.addEventListener('input', () => {
      const val = opacitySlider.value;
      if (opacityVal) opacityVal.textContent = val + '%';
      try { localStorage.setItem('bg_opacity', val); } catch(e) {}
      const bg = localStorage.getItem('bg_image');
      if (bg) applyBg(bg, parseInt(val));
    });
  }
}

// ========== LOGOS EN AJUSTES ==========
function setupLogoUpload(inputId, previewId, removeId, storageKey, applyFn) {
  const input     = document.getElementById(inputId);
  const preview   = document.getElementById(previewId);
  const removeBtn = document.getElementById(removeId);
  if (!input) return;

  // Cargar logo guardado
  const saved = localStorage.getItem(storageKey);
  if (saved && preview) {
    preview.src = saved;
    preview.classList.remove('hidden');
    if (removeBtn) removeBtn.style.display = 'inline-block';
    if (applyFn) applyFn(saved);
  }

  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    showToast('⏳ Cargando logo…');
    const base64 = await comprimirImagen(file, 300, 0.85);
    try { localStorage.setItem(storageKey, base64); } catch(e) {}
    if (preview) { preview.src = base64; preview.classList.remove('hidden'); }
    if (removeBtn) removeBtn.style.display = 'inline-block';
    if (applyFn) applyFn(base64);
    showToast('✅ Logo guardado');
  });

  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      try { localStorage.removeItem(storageKey); } catch(e) {}
      if (preview) { preview.src = ''; preview.classList.add('hidden'); }
      removeBtn.style.display = 'none';
      input.value = '';
      if (applyFn) applyFn(null);
    });
  }
}

function applyLogoSidebar(src) {
  const el = document.getElementById('sidebar-logo');
  if (!el) return;
  if (src) { el.src = src; el.classList.remove('hidden'); }
  else { el.classList.add('hidden'); }
}

function applyLogoMobile(src) {
  const el = document.getElementById('mobile-logo');
  if (!el) return;
  if (src) { el.src = src; el.style.display = 'block'; el.classList.remove('hidden'); }
  else { el.style.display = 'none'; el.classList.add('hidden'); }
}

// ========== AJUSTES ==========
function loadSettingsUI() {
  const name     = localStorage.getItem('store_name')     || 'Inventario';
  const subtitle = localStorage.getItem('store_subtitle') || 'Dulces & Pulseras';
  const el1 = document.getElementById('s-storename');
  const el2 = document.getElementById('s-subtitle');
  if (el1) el1.value = name;
  if (el2) el2.value = subtitle;

  setupLogoUpload('s-logo',        'logo-preview',        'remove-logo',        'logo_sidebar',  applyLogoSidebar);
  setupLogoUpload('s-logo-mobile', 'logo-mobile-preview', 'remove-logo-mobile', 'logo_mobile',   applyLogoMobile);
  setupBgUpload();
}

document.getElementById('btn-save-settings')?.addEventListener('click', () => {
  const name     = document.getElementById('s-storename')?.value || 'Inventario';
  const subtitle = document.getElementById('s-subtitle')?.value  || 'Dulces & Pulseras';
  try {
    localStorage.setItem('store_name',     name);
    localStorage.setItem('store_subtitle', subtitle);
  } catch(e) {}
  // Aplicar nombre y subtítulo en toda la UI
  document.querySelectorAll('.brand-title, .mobile-brand-title').forEach(el => el.textContent = name);
  document.querySelectorAll('.brand-sub, .mobile-brand-sub').forEach(el => el.textContent = subtitle);
  document.getElementById('splash-name') && (document.getElementById('splash-name').textContent = name);
  document.getElementById('splash-sub')  && (document.getElementById('splash-sub').textContent  = subtitle);
  document.title = name + ' — Inventario';
  // Aplicar color y tema
  applyTheme();
  // Aplicar imagen de fondo si existe
  const bg = localStorage.getItem('bg_image');
  const bgOpacity = localStorage.getItem('bg_opacity') || '15';
  if (bg) {
    document.querySelector('.content') && (document.querySelector('.content').style.backgroundImage = `url(${bg})`);
    document.querySelector('.content') && (document.querySelector('.content').style.backgroundSize = 'cover');
  }
  showToast('✅ Configuración guardada');
});

function applyTheme() {
  const theme  = localStorage.getItem('theme')  || 'dark';
  const accent = localStorage.getItem('accent') || '#e07b39';
  document.documentElement.style.setProperty('--orange',    accent);
  document.documentElement.style.setProperty('--orange-dk', accent);
  const vars = theme === 'light'
    ? { '--bg':'#f5f5f5','--surface':'#ffffff','--surface2':'#f0f0f0','--border':'#e0e0e0','--text':'#1a1a1a','--muted':'#888888' }
    : { '--bg':'#141414','--surface':'#1e1e1e','--surface2':'#252525','--border':'#2e2e2e','--text':'#f0ece6','--muted':'#7a7570' };
  Object.entries(vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
}

document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    try { localStorage.setItem('theme', btn.dataset.theme); } catch(e) {}
    applyTheme();
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});
document.querySelectorAll('.swatch').forEach(sw => {
  sw.addEventListener('click', () => {
    const color = sw.dataset.color; if (!color) return;
    try { localStorage.setItem('accent', color); } catch(e) {}
    applyTheme();
    document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
    sw.classList.add('active');
  });
});
document.getElementById('s-custom-color')?.addEventListener('input', e => {
  try { localStorage.setItem('accent', e.target.value); } catch(e) {}
  applyTheme();
});

// ========== REPORTES ==========
function initReportSelectors() {
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const now   = new Date();
  const mSel  = document.getElementById('r-month');
  const ySel  = document.getElementById('r-year');
  const dInp  = document.getElementById('r-date');
  if (mSel) mSel.innerHTML = meses.map((m, i) =>
    `<option value="${i}" ${i === now.getMonth() ? 'selected' : ''}>${m}</option>`).join('');
  if (ySel) ySel.innerHTML = [now.getFullYear(), now.getFullYear()-1].map(y =>
    `<option value="${y}" ${y === now.getFullYear() ? 'selected' : ''}>${y}</option>`).join('');
  if (dInp) {
    // Fecha local correcta (no UTC)
    const y = now.getFullYear();
    const m = String(now.getMonth()+1).padStart(2,'0');
    const d = String(now.getDate()).padStart(2,'0');
    dInp.value = y + '-' + m + '-' + d;
  }
}

function getSalesByRange(from, to) {
  return movements.filter(m => {
    if (m.type !== 'salida') return false;
    const d = new Date(m.date);
    return d >= from && d <= to;
  });
}

function groupByProduct(sales) {
  const map = {};
  sales.forEach(m => {
    const p = getProduct(m.productId);
    if (!map[m.productId]) map[m.productId] = {
      name:     p ? p.name     : (m.productName || '—'),
      category: p ? p.category : '—',
      qty: 0, revenue: 0, gain: 0
    };
    map[m.productId].qty     += m.qty;
    map[m.productId].revenue += (m.price || 0) * m.qty;
    if (p) map[m.productId].gain += ((m.price || 0) - (p.buyPrice || 0)) * m.qty;
  });
  return Object.values(map).sort((a, b) => b.revenue - a.revenue);
}


// ========== EXPORTAR REPORTES ==========
function exportarReporteCSV(title, sales) {
  if (!sales.length) { showToast('Sin ventas para exportar'); return; }
  const rows = [];
  rows.push(['Producto','Categoría','Cantidad','Precio Unit.','Total','Ganancia']);
  const grouped = {};
  sales.forEach(m => {
    const p = getProduct(m.productId);
    if (!grouped[m.productId]) grouped[m.productId] = {
      name: p ? p.name : m.productName,
      category: p ? (p.category === 'dulce' ? 'Dulce' : 'Pulsera') : '—',
      qty: 0, price: m.price, revenue: 0, gain: 0
    };
    grouped[m.productId].qty     += m.qty;
    grouped[m.productId].revenue += m.price * m.qty;
    if (p) grouped[m.productId].gain += (m.price - (p.buyPrice||0)) * m.qty;
  });
  const totRev = Object.values(grouped).reduce((s,r)=>s+r.revenue,0);
  const totGain = Object.values(grouped).reduce((s,r)=>s+r.gain,0);
  const totQty  = Object.values(grouped).reduce((s,r)=>s+r.qty,0);
  Object.values(grouped).forEach(r => {
    rows.push([r.name, r.category, r.qty, '$'+r.price.toFixed(2), '$'+r.revenue.toFixed(2), '$'+r.gain.toFixed(2)]);
  });
  rows.push([]);
  rows.push(['TOTAL','',''+totQty,'','$'+totRev.toFixed(2),'$'+totGain.toFixed(2)]);
  const csv = rows.map(r => r.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = title.replace(/\s+/g,'-') + '.csv';
  a.click();
  showToast('✅ CSV descargado');
}

function exportarReporteTexto(title, subtitle, sales) {
  if (!sales.length) { showToast('Sin ventas para compartir'); return; }
  const grouped = {};
  sales.forEach(m => {
    const p = getProduct(m.productId);
    if (!grouped[m.productId]) grouped[m.productId] = {
      name: p ? p.name : m.productName, qty: 0, revenue: 0, gain: 0
    };
    grouped[m.productId].qty     += m.qty;
    grouped[m.productId].revenue += m.price * m.qty;
    if (p) grouped[m.productId].gain += (m.price - (p.buyPrice||0)) * m.qty;
  });
  const rows   = Object.values(grouped).sort((a,b)=>b.revenue-a.revenue);
  const totRev  = rows.reduce((s,r)=>s+r.revenue,0);
  const totGain = rows.reduce((s,r)=>s+r.gain,0);
  const totQty  = rows.reduce((s,r)=>s+r.qty,0);
  let txt = '📊 *' + title + '*\n';
  txt += '📅 ' + subtitle + '\n';
  txt += '─────────────────\n';
  rows.forEach(r => {
    txt += '• ' + r.name + ' x'+r.qty+' → $'+r.revenue.toFixed(2)+'\n';
  });
  txt += '─────────────────\n';
  txt += '📦 Unidades: ' + totQty + '\n';
  txt += '💰 Total vendido: $' + totRev.toFixed(2) + '\n';
  txt += '✅ Ganancia: $' + totGain.toFixed(2) + '\n';
  txt += '─────────────────\n';
  txt += 'Inventario TALARA';
  return txt;
}

function compartirWhatsApp(title, subtitle, sales) {
  const txt = exportarReporteTexto(title, subtitle, sales);
  if (!txt) return;
  const url = 'https://wa.me/?text=' + encodeURIComponent(txt);
  window.open(url, '_blank');
}

function imprimirReporte() {
  window.print();
}

function mostrarBotonesReporte(containerId, title, subtitle, sales) {
  const container = document.getElementById(containerId);
  if (!container || !sales.length) return;
  const bar = document.createElement('div');
  bar.className = 'report-actions';
  bar.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;margin:12px 0;';
  bar.innerHTML = `
    <button class="btn-ghost-sm" onclick="window._exportCSV('${containerId}')">⬇ Descargar CSV</button>
    <button class="btn-ghost-sm" onclick="window._shareWA('${containerId}')">📱 Compartir WhatsApp</button>
    <button class="btn-ghost-sm" onclick="window.print()">🖨️ Imprimir</button>
  `;
  // Guardar datos para usar en los botones
  window['_reportData_'+containerId] = {title, subtitle, sales};
  window._exportCSV = (id) => {
    const d = window['_reportData_'+id];
    if (d) exportarReporteCSV(d.title + ' ' + d.subtitle, d.sales);
  };
  window._shareWA = (id) => {
    const d = window['_reportData_'+id];
    if (d) compartirWhatsApp(d.title, d.subtitle, d.sales);
  };
  // Insertar botones antes del reporte
  const existing = container.querySelector('.report-actions');
  if (existing) existing.remove();
  container.insertBefore(bar, container.firstChild);
}

function buildReportHTML(title, subtitle, sales) {
  if (sales.length === 0) return `
    <div class="report-card">
      <div class="report-header"><div>
        <div class="report-title">${title}</div>
        <div class="report-subtitle">${subtitle}</div>
      </div></div>
      <div class="empty-state">Sin ventas en este período.</div>
    </div>`;
  const rows    = groupByProduct(sales);
  const totQty  = rows.reduce((s, r) => s + r.qty,     0);
  const totRev  = rows.reduce((s, r) => s + r.revenue, 0);
  const totGain = rows.reduce((s, r) => s + r.gain,    0);
  const tableRows = rows.map(r => `<tr>
    <td><span class="td-name">${escapeHtml(r.name)}</span></td>
    <td><span class="badge ${r.category === 'dulce' ? 'badge-dulce' : 'badge-pulsera'}">
      ${r.category === 'dulce' ? 'Dulce' : 'Pulsera'}</span></td>
    <td>${r.qty}</td>
    <td>${fmt(r.revenue)}</td>
    <td class="td-gain">${fmt(r.gain)}</td>
  </tr>`).join('');
  return `<div class="report-card">
    <div class="report-header"><div>
      <div class="report-title">${title}</div>
      <div class="report-subtitle">${subtitle}</div>
    </div></div>
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
        <span class="report-stat-label orange">Total vendido</span>
        <span class="report-stat-value orange">${fmt(totRev)}</span>
      </div>
      <div class="report-stat">
        <span class="report-stat-label green">Ganancia</span>
        <span class="report-stat-value green">${fmt(totGain)}</span>
      </div>
    </div>
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr>
          <th>Producto</th><th>Categoría</th>
          <th>Uds.</th><th>Total</th><th>Ganancia</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  </div>`;
}

document.getElementById('btn-gen-daily')?.addEventListener('click', () => {
  const dateStr = document.getElementById('r-date')?.value;
  if (!dateStr) return;
  const from  = new Date(dateStr + 'T00:00:00');
  const to    = new Date(dateStr + 'T23:59:59');
  const sales = getSalesByRange(from, to);
  const label = new Date(dateStr).toLocaleDateString('es-MX', {
    weekday:'long', day:'2-digit', month:'long', year:'numeric'
  });
  const out = document.getElementById('report-daily-out');
  if (out) {
    out.innerHTML = buildReportHTML('Reporte Diario', label, sales);
    mostrarBotonesReporte('report-daily-out', 'Reporte Diario', label, sales);
  }
});

document.getElementById('btn-gen-monthly')?.addEventListener('click', () => {
  const month = parseInt(document.getElementById('r-month')?.value);
  const year  = parseInt(document.getElementById('r-year')?.value);
  const from  = new Date(year, month, 1);
  const to    = new Date(year, month + 1, 0, 23, 59, 59);
  const sales = getSalesByRange(from, to);
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const out = document.getElementById('report-monthly-out');
  if (out) {
    const subtitle2 = meses[month] + ' ' + year;
    out.innerHTML = buildReportHTML('Reporte Mensual', subtitle2, sales);
    mostrarBotonesReporte('report-monthly-out', 'Reporte Mensual', subtitle2, sales);
  }
});

// ========== EXPORTAR / RESET ==========
document.getElementById('btn-export')?.addEventListener('click', () => {
  const data = { products, movements, users, exportDate: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `inventario-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  showToast('✅ Datos exportados');
});

document.getElementById('btn-reset')?.addEventListener('click', () => {
  if (!confirm('¿Restablecer ajustes visuales? Los productos y ventas en Firebase NO se borran.')) return;
  localStorage.clear();
  location.reload();
});

// ========== LOGOUT ==========
document.getElementById('btn-logout')?.addEventListener('click', () => {
  if (confirm('¿Cerrar sesión?')) location.reload();
});

// ========== CARGA MASIVA CSV ==========
let bulkParsed = [];

document.getElementById('bulk-download-template')?.addEventListener('click', () => {
  const csv = [
    'nombre,categoria,stock,precio_compra,precio_venta,descripcion',
    'Mazapán de Rosa,dulce,20,5,12,Dulce tradicional',
    'Pulsera Chaquira,pulsera,10,20,55,Pulsera de chaquiras'
  ].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'plantilla_productos.csv';
  a.click();
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
  const start = /nombre|name|producto/i.test(lines[0]) ? 1 : 0;
  bulkParsed  = [];
  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
    const cat  = cols[1]?.toLowerCase().includes('dulce') ? 'dulce'
               : cols[1]?.toLowerCase().includes('pulsera') ? 'pulsera' : '';
    const row  = {
      name: cols[0] || '', category: cat,
      stock: parseInt(cols[2]) || 0,
      buyPrice: parseFloat(cols[3]) || 0,
      sellPrice: parseFloat(cols[4]) || 0,
      desc: cols[5] || '',
      _line: i + 1, _errors: []
    };
    if (!row.name)     row._errors.push('Nombre vacío');
    if (!row.category) row._errors.push('Categoría inválida (usa dulce o pulsera)');
    if (row.sellPrice < row.buyPrice) row._errors.push('Precio venta < compra');
    bulkParsed.push(row);
  }
  renderBulkPreview();
}

function renderBulkPreview() {
  const valid = bulkParsed.filter(r => !r._errors.length);
  const cs = document.getElementById('bulk-count');
  if (cs) cs.textContent = `${bulkParsed.length} filas — ${valid.length} válidas`;
  const tbody = document.getElementById('bulk-preview-body');
  if (tbody) {
    tbody.innerHTML = bulkParsed.map(r => `
      <tr class="${r._errors.length ? 'bulk-row-error' : 'bulk-row-ok'}">
        <td>${r._line}</td>
        <td>${escapeHtml(r.name)}</td>
        <td>${r.category}</td>
        <td>${r.stock}</td>
        <td>${r.buyPrice}</td>
        <td>${r.sellPrice}</td>
        <td>${escapeHtml(r.desc).substring(0, 30)}</td>
        <td>${r._errors.length
          ? `<span class="bulk-status-error">✕ ${r._errors[0]}</span>`
          : '<span class="bulk-status-ok">✓ OK</span>'}</td>
      </tr>`).join('');
  }
  document.getElementById('bulk-preview-wrap')?.classList.remove('hidden');
  const confirmBtn = document.getElementById('bulk-confirm');
  if (confirmBtn) confirmBtn.disabled = valid.length === 0;
}

document.getElementById('bulk-confirm')?.addEventListener('click', async () => {
  const valid = bulkParsed.filter(r => !r._errors.length);
  showToast(`⏳ Importando ${valid.length} productos…`);
  for (const r of valid) {
    await saveProductToFirebase({ id: uid(), name: r.name, category: r.category,
      stock: r.stock, buyPrice: r.buyPrice, sellPrice: r.sellPrice, desc: r.desc });
  }
  closeBulkModal();
  showToast(`✅ ${valid.length} productos importados a Firebase`);
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
    const view = item.dataset.view;
    if (view) navigate(view);
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
const moreBtn = document.getElementById('bnav-more-btn');
const moreMenu = document.getElementById('bnav-more-menu');
if (moreBtn && moreMenu) {
  moreBtn.addEventListener('click', e => {
    e.stopPropagation(); moreMenu.classList.toggle('hidden');
  });
  document.addEventListener('click', () => moreMenu.classList.add('hidden'));
  document.querySelectorAll('.bnav-more-item').forEach(item => {
    item.addEventListener('click', () => {
      moreMenu.classList.add('hidden');
      const view = item.dataset.view; if (view) navigate(view);
    });
  });
  document.getElementById('bnav-logout-btn')?.addEventListener('click', () => {
    if (confirm('¿Cerrar sesión?')) location.reload();
  });
}


// ========== MODAL GASTO / CANCELACIÓN ==========
function crearModalGasto() {
  if (document.getElementById('modal-gasto')) return;
  const modal = document.createElement('div');
  modal.id = 'modal-gasto';
  modal.className = 'hidden';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;display:none;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML = `
    <div style="background:var(--surface);border-radius:16px;padding:24px;max-width:420px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,0.4)">
      <h3 style="margin-bottom:16px;color:var(--text)">🗑️ Cancelar Venta / Registrar Gasto</h3>
      <div class="form-group" style="margin-bottom:12px">
        <label style="color:var(--muted);font-size:0.82rem;display:block;margin-bottom:6px">Tipo</label>
        <select id="gasto-tipo" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:inherit">
          <option value="cancelacion">❌ Cancelación de venta</option>
          <option value="gasto">💸 Retiro / Gasto</option>
          <option value="devolucion">↩️ Devolución</option>
          <option value="otro">📝 Otro</option>
        </select>
      </div>
      <div class="form-group" style="margin-bottom:12px">
        <label style="color:var(--muted);font-size:0.82rem;display:block;margin-bottom:6px">Monto ($) — opcional</label>
        <input type="number" id="gasto-monto" min="0" step="0.01" placeholder="0.00"
          style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:inherit" />
      </div>
      <div class="form-group" style="margin-bottom:16px">
        <label style="color:var(--muted);font-size:0.82rem;display:block;margin-bottom:6px">Observaciones *</label>
        <textarea id="gasto-obs" rows="3" placeholder="Ej: Cliente canceló por precio, Gasto en materiales, Devolución por defecto..."
          style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:inherit;resize:vertical"></textarea>
      </div>
      <div style="display:flex;gap:10px">
        <button id="btn-gasto-confirmar" class="btn-primary" style="flex:1">Registrar</button>
        <button onclick="const m=document.getElementById('modal-gasto');if(m){m.style.display='none';m.classList.add('hidden');}" class="btn-ghost" style="flex:1">Cancelar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('btn-gasto-confirmar').addEventListener('click', async () => {
    const tipo  = document.getElementById('gasto-tipo').value;
    const monto = parseFloat(document.getElementById('gasto-monto').value) || 0;
    const obs   = document.getElementById('gasto-obs').value.trim();
    if (!obs) { showToast('Escribe una observación'); return; }

    // Registrar como movimiento especial
    const tipoLabel = { cancelacion:'Cancelación', gasto:'Gasto/Retiro', devolucion:'Devolución', otro:'Otro' }[tipo];
    const mov = {
      id: uid(), productId: 'gasto_'+tipo, productName: tipoLabel + (obs ? ': '+obs : ''),
      type: 'gasto', qty: 1, price: monto, total: monto, date: new Date().toISOString(),
      obs, tipoGasto: tipo
    };
    await saveMovimientoToFirebase(mov);

    // Limpiar carrito si es cancelación
    if (tipo === 'cancelacion' || tipo === 'devolucion') {
      cart = {};
      renderSaleProductList();
      renderCart();
    }

    const mg = document.getElementById('modal-gasto');
    if (mg) { mg.style.display='none'; mg.classList.add('hidden'); }
    document.getElementById('gasto-obs').value = '';
    document.getElementById('gasto-monto').value = '';
    showToast('✅ ' + tipoLabel + ' registrada');
  });
}

// ========== INICIALIZAR ==========
document.addEventListener('DOMContentLoaded', () => {
  // Limpiar datos grandes del localStorage (ahora todo va a Firebase)
  try {
    localStorage.removeItem('products');
    localStorage.removeItem('movements');
  } catch(e) {}

  // Cargar usuarios desde localStorage (son pocos, sin problema)
  try {
    const u = localStorage.getItem('users');
    if (u) users = JSON.parse(u);
    else users = [{ id: 'admin', name: 'Administrador', email: 'admin@inventario.com', role: 'Admin', date: new Date().toISOString() }];
  } catch(e) {
    users = [{ id: 'admin', name: 'Administrador', email: 'admin@inventario.com', role: 'Admin', date: new Date().toISOString() }];
  }

  applyTheme();
  initReportSelectors();

  // ── Manejo de imágenes del formulario ──
  [0, 1, 2].forEach(slot => {
    const input   = document.getElementById('f-img-' + slot);
    const preview = document.getElementById('f-img-preview-' + slot);
    const holder  = document.getElementById('f-img-placeholder-' + slot);
    const removeBtn = document.getElementById('f-img-remove-' + slot);
    if (!input) return;

    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      showToast('⏳ Comprimiendo imagen…');
      const base64 = await comprimirImagen(file);
      productImages[slot] = base64;
      if (preview) { preview.src = base64; preview.classList.remove('hidden'); }
      if (holder)  holder.classList.add('hidden');
      if (removeBtn) removeBtn.style.display = 'inline-block';
      showToast('✅ Imagen lista');
    });

    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        productImages[slot] = '';
        if (preview) { preview.src = ''; preview.classList.add('hidden'); }
        if (holder)  holder.classList.remove('hidden');
        removeBtn.style.display = 'none';
        input.value = '';
      });
    }
  });
  loadSettingsUI();
  renderInventory();
  renderMovements();
  renderUsers();
  updateSummary();
  renderSaleProductList();
  navigate('panel');

  // Tabs de reportes
  document.querySelectorAll('.rtab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.rtab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.rtab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const target = document.getElementById('rtab-' + tab.dataset.rtab);
      if (target) target.classList.add('active');
    });
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

  setTimeout(hideSplash, 600);

  // Crear modal de gasto/cancelación
  crearModalGasto();

  // Iniciar sync con Firebase — fuente única de verdad
  iniciarSyncFirebase();
});
