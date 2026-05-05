// ── Helpers ────────────────────────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function fmt(n) { return '$' + Number(n || 0).toFixed(2); }
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
function showToast(msg, type) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show ' + (type || 'success');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 3000);
}

// ── State ────────────────────────────────────────────────────────────────────
let products   = [];
let movements  = [];
let users      = [];
let activeUserId  = null;
let currentRole   = 'Admin';
let _productImgData  = null;
let _productImg2Data = null;
let _productImg3Data = null;
let _editId          = null;
let _saleCart        = {};
let _pendingSettings = {};
let _movProductId    = null;
let _movType         = null;
let _bulkValid       = [];

// ── Firebase bridge ──────────────────────────────────────────────────────────
function saveItem(col, item) {
  if (typeof fbSaveItem === 'function') {
    fbSaveItem(col, item).catch(function(e){ console.warn('Save error:', e.message); });
  }
  var arr = col === 'products' ? products : col === 'movements' ? movements : users;
  var idx = arr.findIndex(function(x){ return x.id === item.id; });
  if (idx >= 0) arr[idx] = item; else arr.push(item);
  renderAll();
}
function deleteItem(col, id) {
  if (typeof fbDeleteItem === 'function') {
    fbDeleteItem(col, id).catch(function(e){ console.warn('Delete error:', e.message); });
  }
  if (col === 'products')  products  = products.filter(function(x){ return x.id !== id; });
  if (col === 'movements') movements = movements.filter(function(x){ return x.id !== id; });
  if (col === 'users')     users     = users.filter(function(x){ return x.id !== id; });
  renderAll();
}

// ── Navigation ───────────────────────────────────────────────────────────────
function navigate(view) {
  document.querySelectorAll('.view').forEach(function(v){ v.classList.remove('active'); });
  document.querySelectorAll('.nav-item, .bnav-item').forEach(function(n){ n.classList.remove('active'); });
  var el = document.getElementById('view-' + view);
  if (el) el.classList.add('active');
  document.querySelectorAll('[data-view="' + view + '"]').forEach(function(n){ n.classList.add('active'); });
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
  var totalProducts   = products.length;
  var totalInvestment = products.reduce(function(s,p){ return s + p.buyPrice * p.stock; }, 0);
  var totalPotential  = products.reduce(function(s,p){ return s + (p.sellPrice - p.buyPrice) * p.stock; }, 0);
  var totalSold       = movements.filter(function(m){ return m.type === 'out'; })
                                 .reduce(function(s,m){ return s + m.price * m.qty; }, 0);
  function set(id, v) { var e = document.getElementById(id); if (e) e.textContent = v; }
  set('stat-products',   totalProducts);
  set('stat-investment', fmt(totalInvestment));
  set('stat-gain',       fmt(totalPotential));
  set('stat-sold',       fmt(totalSold));
  var lowList = document.getElementById('low-stock-list');
  if (lowList) {
    var low = products.filter(function(p){ return p.stock <= 3; }).sort(function(a,b){ return a.stock - b.stock; });
    if (!low.length) {
      lowList.innerHTML = '<p class="muted" style="padding:12px 16px">Sin productos con bajo stock</p>';
    } else {
      lowList.innerHTML = low.map(function(p){
        return '<div class="low-item"><span>' + p.name + '</span><span class="badge ' +
          (p.stock === 0 ? 'badge-danger' : 'badge-warn') + '">' + p.stock + ' uds</span></div>';
      }).join('');
    }
  }
}

// ── Render Inventory ──────────────────────────────────────────────────────────
function renderInventory() {
  var search = (document.getElementById('search-products') || {}).value || '';
  var cat    = (document.getElementById('filter-cat') || {}).value || '';
  var tbody  = document.getElementById('inventory-body');
  if (!tbody) return;
  var list = products.filter(function(p){
    return p.name.toLowerCase().includes(search.toLowerCase()) && (!cat || p.category === cat);
  });
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted)">Sin productos. Usa "Nuevo Producto" para agregar.</td></tr>';
    return;
  }
  var isAdmin = currentRole === 'Admin';
  var canWrite = currentRole !== 'Solo lectura';
  tbody.innerHTML = list.map(function(p){
    var profit = (p.sellPrice - p.buyPrice).toFixed(2);
    var img = p.img
      ? '<img src="' + p.img + '" style="width:36px;height:36px;border-radius:6px;object-fit:cover;" alt="">'
      : '<span style="font-size:20px">' + (p.category === 'dulces' ? '🍬' : '📿') + '</span>';
    return '<tr>' +
      '<td>' + img + '</td>' +
      '<td><strong>' + p.name + '</strong>' + (p.description ? '<br><small style="color:var(--muted)">' + p.description + '</small>' : '') + '</td>' +
      '<td><span class="badge">' + p.category + '</span></td>' +
      '<td><strong style="color:' + (p.stock <= 3 ? '#e74c3c' : 'inherit') + '">' + p.stock + '</strong></td>' +
      '<td>' + fmt(p.buyPrice) + '</td>' +
      '<td>' + fmt(p.sellPrice) + '</td>' +
      '<td class="admin-only">' + fmt(profit) + '</td>' +
      '<td style="white-space:nowrap">' +
        '<button class="btn-action btn-in"   onclick="openMovModal(\'' + p.id + '\',\'in\')"  title="Entrada">↓</button>' +
        '<button class="btn-action btn-out"  onclick="openMovModal(\'' + p.id + '\',\'out\')" title="Salida">↑</button>' +
        (canWrite ? '<button class="btn-action btn-edit"   onclick="editProduct(\'' + p.id + '\')" title="Editar">✎</button>' : '') +
        (isAdmin  ? '<button class="btn-action btn-delete" onclick="deleteProduct(\'' + p.id + '\')" title="Eliminar">✕</button>' : '') +
      '</td></tr>';
  }).join('');
}

// ── Product form helpers ──────────────────────────────────────────────────────
function showProductForm() {
  if (currentRole === 'Solo lectura') { alert('Sin permisos'); return; }
  navigate('new-product');
  resetForm();
}
function resetForm() {
  _editId = _productImgData = _productImg2Data = _productImg3Data = null;
  var form = document.getElementById('product-form');
  if (form) form.reset();
  ['img-preview','img2-preview','img3-preview'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) { el.src = ''; el.style.display = 'none'; }
  });
  var title = document.getElementById('form-title');
  if (title) title.textContent = 'Nuevo Producto';
  var btn = document.getElementById('form-btn');
  if (btn) btn.textContent = 'Guardar Producto';
}
function editProduct(pid) {
  if (currentRole === 'Solo lectura') { alert('Sin permisos'); return; }
  var p = products.find(function(x){ return x.id === pid; });
  if (!p) return;
  navigate('new-product');
  _editId = pid;
  _productImgData  = p.img  || null;
  _productImg2Data = p.img2 || null;
  _productImg3Data = p.img3 || null;
  function s(id, v) { var e = document.getElementById(id); if (e) e.value = v || ''; }
  s('f-name', p.name); s('f-category', p.category);
  s('f-stock', p.stock); s('f-buy', p.buyPrice);
  s('f-sell', p.sellPrice); s('f-desc', p.description || '');
  [['img-preview',p.img],['img2-preview',p.img2],['img3-preview',p.img3]].forEach(function(pair){
    var el = document.getElementById(pair[0]);
    if (el && pair[1]) { el.src = pair[1]; el.style.display = 'block'; }
  });
  var title = document.getElementById('form-title');
  if (title) title.textContent = 'Editar Producto';
  var btn = document.getElementById('form-btn');
  if (btn) btn.textContent = 'Actualizar Producto';
}
function deleteProduct(pid) {
  if (currentRole !== 'Admin') { alert('Solo Admin puede eliminar'); return; }
  if (!confirm('¿Eliminar este producto?')) return;
  deleteItem('products', pid);
  showToast('Producto eliminado');
}
function compressImage(file, maxPx, quality) {
  maxPx = maxPx || 480; quality = quality || 0.65;
  return new Promise(function(resolve){
    var reader = new FileReader();
    reader.onload = function(ev){
      var img = new Image();
      img.onload = function(){
        var canvas = document.createElement('canvas');
        var w = img.width, h = img.height;
        if (w > maxPx || h > maxPx) {
          if (w > h) { h = Math.round(h * maxPx / w); w = maxPx; }
          else       { w = Math.round(w * maxPx / h); h = maxPx; }
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── Movement Modal ────────────────────────────────────────────────────────────
function openMovModal(pid, type) {
  if (currentRole === 'Solo lectura') { alert('Sin permisos'); return; }
  _movProductId = pid; _movType = type;
  var p = products.find(function(x){ return x.id === pid; });
  if (!p) return;
  var overlay = document.getElementById('modal-overlay');
  if (!overlay) return;
  function set(id, v) { var e = document.getElementById(id); if (e) e.textContent = v; }
  function val(id, v) { var e = document.getElementById(id); if (e) e.value = v; }
  set('mov-title', type === 'in' ? 'Registrar Entrada' : 'Registrar Salida');
  set('mov-product-info', p.name);
  set('mov-stock', p.stock);
  val('mov-price', type === 'out' ? p.sellPrice : p.buyPrice);
  val('mov-qty', 1);
  var qtyEl = document.getElementById('mov-qty');
  if (qtyEl) qtyEl.max = type === 'out' ? p.stock : 9999;
  overlay.classList.remove('hidden');
}
function closeMovModal() {
  var o = document.getElementById('modal-overlay');
  if (o) o.classList.add('hidden');
}
function submitMovement(e) {
  e.preventDefault();
  var qty   = parseInt((document.getElementById('mov-qty')   || {}).value) || 0;
  var price = parseFloat((document.getElementById('mov-price') || {}).value) || 0;
  var note  = (document.getElementById('mov-note') || {}).value || '';
  var p = products.find(function(x){ return x.id === _movProductId; });
  if (!p) return;
  if (_movType === 'out' && qty > p.stock) { showToast('Stock insuficiente', 'error'); return; }
  if (qty <= 0) { showToast('Cantidad debe ser mayor a 0', 'error'); return; }
  var newStock = _movType === 'in' ? p.stock + qty : p.stock - qty;
  saveItem('products', Object.assign({}, p, { stock: newStock }));
  saveItem('movements', {
    id: uid(), productId: p.id, productName: p.name,
    type: _movType, qty: qty, price: price,
    profit: _movType === 'out' ? (price - p.buyPrice) * qty : 0,
    note: note, date: new Date().toISOString()
  });
  closeMovModal();
  showToast(_movType === 'in' ? 'Entrada registrada ✓' : 'Salida registrada ✓');
}

// ── Render Movements ──────────────────────────────────────────────────────────
function renderMovements() {
  var tbody = document.getElementById('movements-body');
  if (!tbody) return;
  var list = movements.slice().sort(function(a,b){ return new Date(b.date) - new Date(a.date); });
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">Sin movimientos aún</td></tr>';
    return;
  }
  tbody.innerHTML = list.slice(0,150).map(function(m){
    return '<tr>' +
      '<td>' + fmtDate(m.date) + '</td>' +
      '<td>' + m.productName + '</td>' +
      '<td><span class="badge ' + (m.type==='in'?'badge-in':'badge-out') + '">' + (m.type==='in'?'Entrada':'Salida') + '</span></td>' +
      '<td>' + m.qty + '</td>' +
      '<td>' + fmt(m.price) + '</td>' +
      '<td class="admin-only">' + (m.type==='out' ? fmt(m.profit) : '-') + '</td>' +
      '<td>' + (m.note||'-') + '</td>' +
    '</tr>';
  }).join('');
}

// ── Sale View ─────────────────────────────────────────────────────────────────
function initSaleView() {
  _saleCart = {};
  renderSaleProductList();
  renderCart();
  var ss = document.getElementById('sale-search');
  if (ss && !ss._bound) { ss.addEventListener('input', renderSaleProductList); ss._bound = true; }
  var sf = document.getElementById('sale-cat-filter');
  if (sf && !sf._bound) { sf.addEventListener('change', renderSaleProductList); sf._bound = true; }
  var cb = document.getElementById('confirm-sale-btn');
  if (cb && !cb._bound) { cb.addEventListener('click', confirmSale); cb._bound = true; }
}
function renderSaleProductList() {
  var search = (document.getElementById('sale-search') || {}).value || '';
  var cat    = (document.getElementById('sale-cat-filter') || {}).value || '';
  var list   = document.getElementById('sale-product-list');
  if (!list) return;
  var prods = products.filter(function(p){ return p.stock > 0; });
  if (search) prods = prods.filter(function(p){ return p.name.toLowerCase().includes(search.toLowerCase()); });
  if (cat)    prods = prods.filter(function(p){ return p.category === cat; });
  if (!prods.length) {
    list.innerHTML = '<p style="color:var(--muted);padding:16px;grid-column:1/-1">Sin productos disponibles</p>';
    return;
  }
  list.innerHTML = prods.map(function(p){
    var qty = _saleCart[p.id] || 0;
    var img = p.img
      ? '<img src="'+p.img+'" style="width:100%;height:110px;object-fit:cover;border-radius:8px 8px 0 0;" alt="">'
      : '<div style="width:100%;height:110px;display:flex;align-items:center;justify-content:center;font-size:36px;background:var(--surface2);border-radius:8px 8px 0 0">'+(p.category==='dulces'?'🍬':'📿')+'</div>';
    return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;display:flex;flex-direction:column;">'+
      img+
      '<div style="padding:10px;flex:1;display:flex;flex-direction:column;gap:4px;">'+
        '<div style="font-size:13px;font-weight:600;line-height:1.3">'+p.name+'</div>'+
        '<div style="font-size:12px;color:var(--muted)">Stock: '+p.stock+'</div>'+
        '<div style="font-size:14px;font-weight:700;color:var(--orange)">'+fmt(p.sellPrice)+'</div>'+
      '</div>'+
      '<div style="padding:8px 10px;display:flex;align-items:center;gap:6px;border-top:1px solid var(--border)">'+
        '<button onclick="changeSaleQty(\''+p.id+'\',-1)" style="width:28px;height:28px;border:1px solid var(--border);background:var(--surface2);color:var(--text);border-radius:6px;cursor:pointer;font-size:16px;">−</button>'+
        '<input type="number" min="0" max="'+p.stock+'" value="'+qty+'" onchange="setSaleQty(\''+p.id+'\',this.value)" style="width:40px;text-align:center;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:4px;"/>'+
        '<button onclick="changeSaleQty(\''+p.id+'\',1)"  style="width:28px;height:28px;border:1px solid var(--border);background:var(--surface2);color:var(--text);border-radius:6px;cursor:pointer;font-size:16px;">+</button>'+
      '</div>'+
    '</div>';
  }).join('');
}
function changeSaleQty(pid, delta) {
  var p = products.find(function(x){ return x.id === pid; });
  if (!p) return;
  var cur  = _saleCart[pid] || 0;
  var next = Math.max(0, Math.min(p.stock, cur + delta));
  if (next === 0) delete _saleCart[pid]; else _saleCart[pid] = next;
  renderSaleProductList();
  renderCart();
}
function setSaleQty(pid, val) {
  var p = products.find(function(x){ return x.id === pid; });
  if (!p) return;
  var qty = Math.max(0, Math.min(p.stock, parseInt(val) || 0));
  if (qty === 0) delete _saleCart[pid]; else _saleCart[pid] = qty;
  renderCart();
}
function renderCart() {
  var cartEl  = document.getElementById('cart-items');
  var totalEl = document.getElementById('cart-total');
  var gainEl  = document.getElementById('cart-gain');
  var btn     = document.getElementById('confirm-sale-btn');
  if (!cartEl) return;
  var entries = Object.entries(_saleCart).filter(function(e){ return e[1] > 0; });
  if (!entries.length) {
    cartEl.innerHTML = '<p style="color:var(--muted);font-size:13px">Sin productos seleccionados</p>';
    if (totalEl) totalEl.textContent = fmt(0);
    if (gainEl)  gainEl.textContent  = fmt(0);
    if (btn) btn.disabled = true;
    return;
  }
  var total = 0, gain = 0;
  cartEl.innerHTML = entries.map(function(e){
    var p = products.find(function(x){ return x.id === e[0]; });
    if (!p) return '';
    var sub = p.sellPrice * e[1], g = (p.sellPrice - p.buyPrice) * e[1];
    total += sub; gain += g;
    return '<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid var(--border)"><span>'+p.name+' x'+e[1]+'</span><span style="font-weight:600">'+fmt(sub)+'</span></div>';
  }).join('');
  if (totalEl) totalEl.textContent = fmt(total);
  if (gainEl)  gainEl.textContent  = fmt(gain);
  if (btn) btn.disabled = false;
}
function confirmSale() {
  if (currentRole === 'Solo lectura') { alert('Sin permisos'); return; }
  var entries = Object.entries(_saleCart).filter(function(e){ return e[1] > 0; });
  if (!entries.length) { showToast('Agrega productos al carrito', 'error'); return; }
  entries.forEach(function(e){
    var p = products.find(function(x){ return x.id === e[0]; });
    if (!p) return;
    saveItem('products', Object.assign({}, p, { stock: p.stock - e[1] }));
    saveItem('movements', { id:uid(), productId:p.id, productName:p.name,
      type:'out', qty:e[1], price:p.sellPrice,
      profit:(p.sellPrice-p.buyPrice)*e[1], note:'Venta rápida', date:new Date().toISOString() });
  });
  showToast('Venta registrada ✓');
  _saleCart = {};
  renderSaleProductList();
  renderCart();
}

// ── Reports ───────────────────────────────────────────────────────────────────
function initReports() {
  var rd = document.getElementById('r-date');
  if (rd && !rd.value) rd.value = localDateStr();
  var now = new Date();
  var rm  = document.getElementById('r-month');
  var ry  = document.getElementById('r-year');
  if (rm && !rm.value) rm.value = now.getMonth() + 1;
  if (ry && !ry.value) ry.value = now.getFullYear();
  if (rd && !rd._rbound) {
    rd.addEventListener('change', generateDailyReport); rd._rbound = true;
    if (rm) rm.addEventListener('change', generateMonthlyReport);
    if (ry) ry.addEventListener('change', generateMonthlyReport);
  }
  generateDailyReport();
  generateMonthlyReport();
}
function generateDailyReport() {
  var dateEl = document.getElementById('r-date');
  var date   = dateEl ? dateEl.value : localDateStr();
  var movs   = movements.filter(function(m){ return m.type==='out' && m.date.startsWith(date); });
  var box    = document.getElementById('daily-report');
  if (!box) return;
  if (!movs.length) { box.innerHTML = '<p style="color:var(--muted);padding:16px">Sin ventas para esta fecha.</p>'; return; }
  var totalSold  = movs.reduce(function(s,m){ return s+m.price*m.qty; },0);
  var totalGain  = movs.reduce(function(s,m){ return s+(m.profit||0); },0);
  var totalUnits = movs.reduce(function(s,m){ return s+m.qty; },0);
  var distinctP  = new Set(movs.map(function(m){ return m.productId; })).size;
  box.innerHTML = buildReportHTML({ title:'Reporte '+date, movs:movs,
    stats:{ totalSold:totalSold, totalGain:totalGain, totalUnits:totalUnits, distinctProds:distinctP }, type:'daily', date:date });
}
function generateMonthlyReport() {
  var mEl = document.getElementById('r-month');
  var yEl = document.getElementById('r-year');
  if (!mEl || !yEl) return;
  var month  = parseInt(mEl.value);
  var year   = parseInt(yEl.value);
  var prefix = year+'-'+String(month).padStart(2,'0');
  var movs   = movements.filter(function(m){ return m.type==='out' && m.date.startsWith(prefix); });
  var box    = document.getElementById('monthly-report');
  if (!box) return;
  if (!movs.length) { box.innerHTML = '<p style="color:var(--muted);padding:16px">Sin ventas para este mes.</p>'; return; }
  var totalSold  = movs.reduce(function(s,m){ return s+m.price*m.qty; },0);
  var totalGain  = movs.reduce(function(s,m){ return s+(m.profit||0); },0);
  var totalUnits = movs.reduce(function(s,m){ return s+m.qty; },0);
  var distinctP  = new Set(movs.map(function(m){ return m.productId; })).size;
  var monthName  = mEl.options[mEl.selectedIndex].text;
  box.innerHTML = buildReportHTML({ title:'Reporte '+monthName+' '+year, movs:movs,
    stats:{ totalSold:totalSold, totalGain:totalGain, totalUnits:totalUnits, distinctProds:distinctP }, type:'monthly', date:prefix });
}
function buildReportHTML(opts) {
  var movs=opts.movs, stats=opts.stats, type=opts.type, date=opts.date;
  var rows = movs.map(function(m){
    return '<tr><td>'+fmtDate(m.date)+'</td><td>'+m.productName+'</td><td>'+m.qty+'</td><td>'+fmt(m.price)+'</td><td>'+fmt(m.price*m.qty)+'</td><td class="admin-only">'+fmt(m.profit||0)+'</td></tr>';
  }).join('');
  return '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">' +
    '<div class="rstat"><div class="rstat-val">'+stats.distinctProds+'</div><div class="rstat-label">Productos</div></div>' +
    '<div class="rstat"><div class="rstat-val">'+stats.totalUnits+'</div><div class="rstat-label">Unidades</div></div>' +
    '<div class="rstat"><div class="rstat-val">'+fmt(stats.totalSold)+'</div><div class="rstat-label">Total vendido</div></div>' +
    '<div class="rstat admin-only"><div class="rstat-val">'+fmt(stats.totalGain)+'</div><div class="rstat-label">Ganancia</div></div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">' +
      '<button class="btn-secondary" onclick="downloadCSV(\''+type+'\',\''+date+'\')">⬇ CSV</button>' +
      '<button class="btn-secondary" onclick="downloadPDF(\''+type+'\',\''+date+'\')">📄 PDF</button>' +
      '<button class="btn-secondary" onclick="shareReport(\''+type+'\',\''+date+'\')">📤 Compartir</button>' +
    '</div>' +
    '<div class="table-scroll"><table class="report-table"><thead><tr><th>Fecha</th><th>Producto</th><th>Cant</th><th>Precio</th><th>Total</th><th class="admin-only">Ganancia</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function downloadCSV(type, date) {
  var movs = movements.filter(function(m){ return m.type==='out' && m.date.startsWith(date); });
  var csv  = '\uFEFFFecha,Producto,Cantidad,Precio,Total,Ganancia\n' +
    movs.map(function(m){ return fmtDate(m.date)+','+m.productName+','+m.qty+','+m.price+','+(m.price*m.qty)+','+(m.profit||0); }).join('\n');
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download = 'reporte_'+date+'.csv'; a.click();
}
function downloadPDF(type, date) {
  var movs  = movements.filter(function(m){ return m.type==='out' && m.date.startsWith(date); });
  var cfg   = getUserSettings(activeUserId);
  var store = cfg.storeName || 'TALARA';
  var total = movs.reduce(function(s,m){ return s+m.price*m.qty; },0);
  var rows  = movs.map(function(m){ return '<tr><td>'+fmtDate(m.date)+'</td><td>'+m.productName+'</td><td>'+m.qty+'</td><td>'+fmt(m.price)+'</td><td>'+fmt(m.price*m.qty)+'</td></tr>'; }).join('');
  var html  = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reporte '+date+'</title><style>body{font-family:Arial,sans-serif;padding:24px}h1{color:#e07b39}table{width:100%;border-collapse:collapse;margin-top:16px}th{background:#f5f5f5;padding:8px;text-align:left;border-bottom:2px solid #ddd}td{padding:7px 8px;border-bottom:1px solid #eee}.tot{font-weight:bold;text-align:right;margin-top:12px;font-size:16px}</style></head><body><h1>'+store+'</h1><h2 style="color:#555">Ventas — '+date+'</h2><table><thead><tr><th>Fecha</th><th>Producto</th><th>Cant</th><th>Precio</th><th>Total</th></tr></thead><tbody>'+rows+'</tbody></table><p class="tot">Total: '+fmt(total)+'</p><script>window.onload=function(){window.print();}<\/script></body></html>';
  var w = window.open('','_blank');
  if (w) { w.document.write(html); w.document.close(); }
  else showToast('Permite ventanas emergentes para el PDF','error');
}
function shareReport(type, date) {
  if (navigator.share) {
    navigator.share({ title:'Reporte TALARA', text:'Reporte '+date, url:window.location.href });
  } else {
    navigator.clipboard.writeText(window.location.href).then(function(){ showToast('URL copiada'); });
  }
}

// ── Users ─────────────────────────────────────────────────────────────────────
function renderUsers() {
  var list = document.getElementById('users-list');
  if (!list) return;
  if (!users.length) { list.innerHTML = '<p style="color:var(--muted);padding:16px">Sin usuarios registrados</p>'; return; }
  var colors = { Admin:'#e07b39', Usuario:'#4a9e6f', 'Solo lectura':'#7a7570' };
  list.innerHTML = users.map(function(u){
    var ini   = (u.name||'?').split(' ').map(function(w){ return w[0]; }).join('').toUpperCase().slice(0,2);
    var color = colors[u.role] || '#7a7570';
    return '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border)">' +
      '<div style="width:40px;height:40px;border-radius:50%;background:'+color+';display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:15px;flex-shrink:0">'+ini+'</div>' +
      '<div style="flex:1;min-width:0"><div style="font-weight:600">'+( u.name||'Sin nombre')+'</div><div style="font-size:12px;color:var(--muted)">'+(u.email||'')+'</div></div>' +
      '<span class="badge" style="background:'+color+'22;color:'+color+'">'+u.role+'</span>' +
      (currentRole==='Admin' ? '<select onchange="changeUserRole(\''+u.id+'\',this.value)" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:4px 8px;font-size:12px"><option '+(u.role==='Admin'?'selected':'')+'>Admin</option><option '+(u.role==='Usuario'?'selected':'')+'>Usuario</option><option '+(u.role==='Solo lectura'?'selected':'')+'>Solo lectura</option></select>' : '') +
    '</div>';
  }).join('');
}
function changeUserRole(userId, role) {
  if (currentRole !== 'Admin') { alert('Solo Admin puede cambiar roles'); return; }
  var u = users.find(function(x){ return x.id === userId; });
  if (!u) return;
  saveItem('users', Object.assign({}, u, { role:role }));
  showToast('Rol actualizado');
}

// ── Settings ──────────────────────────────────────────────────────────────────
var DEFAULTS = {
  storeName:'TALARA', storeSubtitle:'Dulces & Pulseras',
  theme:'dark', accent:'#e07b39',
  bgOpacity:0, logoData:null, logoMobileData:null, bgData:null
};
function getUserSettings(uid) {
  try {
    var raw = localStorage.getItem('inv_settings_' + uid);
    return raw ? Object.assign({}, DEFAULTS, JSON.parse(raw)) : Object.assign({}, DEFAULTS);
  } catch(e) { return Object.assign({}, DEFAULTS); }
}
function saveUserSettings(uid, settings) {
  localStorage.setItem('inv_settings_' + uid, JSON.stringify(settings));
  if (typeof fbSaveSettings === 'function') {
    fbSaveSettings(uid, settings).catch(function(e){ console.warn('Settings:', e.message); });
  }
}
function applySettings(settings) {
  var root = document.documentElement;
  if (settings.theme === 'light') {
    root.style.setProperty('--bg','#f5f5f5'); root.style.setProperty('--surface','#ffffff');
    root.style.setProperty('--surface2','#eeeeee'); root.style.setProperty('--border','#dddddd');
    root.style.setProperty('--text','#111111'); root.style.setProperty('--muted','#666666');
  } else {
    root.style.setProperty('--bg','#141414'); root.style.setProperty('--surface','#1e1e1e');
    root.style.setProperty('--surface2','#252525'); root.style.setProperty('--border','#2e2e2e');
    root.style.setProperty('--text','#f0ece6'); root.style.setProperty('--muted','#7a7570');
  }
  root.style.setProperty('--orange', settings.accent || '#e07b39');
  function set(id, v) { var e=document.getElementById(id); if(e) e.textContent = v||''; }
  set('sidebar-store-name',     settings.storeName);
  set('sidebar-store-subtitle', settings.storeSubtitle);
  set('mobile-store-name',      settings.storeName);
  var sLogo = document.getElementById('sidebar-logo');
  if (sLogo && settings.logoData) { sLogo.src = settings.logoData; sLogo.style.display = 'block'; }
  var mLogo = document.getElementById('mobile-logo');
  if (mLogo && (settings.logoMobileData || settings.logoData)) {
    mLogo.src = settings.logoMobileData || settings.logoData; mLogo.style.display = 'block';
  }
  var splashT = document.getElementById('splash-logo-text');
  if (splashT) splashT.textContent = (settings.storeName||'I')[0];
  var splashN = document.getElementById('splash-store-name');
  if (splashN) splashN.textContent = settings.storeName || 'TALARA';
  document.title = settings.storeName || 'TALARA';
}
function loadSettingsUI() {
  var settings = getUserSettings(activeUserId);
  _pendingSettings = Object.assign({}, settings);
  function val(id, v) { var e=document.getElementById(id); if(e) e.value = v||''; }
  val('set-store-name',     settings.storeName);
  val('set-store-subtitle', settings.storeSubtitle);
  val('set-accent',         settings.accent||'#e07b39');
  val('set-bg-opacity',     settings.bgOpacity||0);
  document.querySelectorAll('.theme-btn').forEach(function(b){
    b.classList.toggle('active', b.dataset.theme === settings.theme);
  });
  function showPrev(id, src) { var e=document.getElementById(id); if(e&&src){e.src=src;e.style.display='block';} }
  showPrev('logo-preview',        settings.logoData);
  showPrev('logo-mobile-preview', settings.logoMobileData);
}
function saveSettings() {
  saveUserSettings(activeUserId, _pendingSettings);
  applySettings(_pendingSettings);
  showToast('✓ Cambios guardados');
}

// ── Privileges ────────────────────────────────────────────────────────────────
function applyPrivileges(role) {
  currentRole = role;
  var isAdmin  = role === 'Admin';
  var canWrite = role !== 'Solo lectura';
  document.querySelectorAll('.admin-only').forEach(function(el){ el.style.display = isAdmin ? '' : 'none'; });
  document.querySelectorAll('.write-only').forEach(function(el){ el.style.display = canWrite ? '' : 'none'; });
  var npNav = document.querySelector('[data-view="new-product"]');
  if (npNav) npNav.style.display = canWrite ? '' : 'none';
  var uNav = document.querySelector('[data-view="users"]');
  if (uNav) uNav.style.display = isAdmin ? '' : 'none';
  var u = users.find(function(x){ return x.id === activeUserId; });
  var nameStr = u ? u.name+' · '+u.role : role;
  function set(id,v){ var e=document.getElementById(id); if(e) e.textContent=v; }
  set('sidebar-user-info', nameStr);
  set('mobile-user-info',  nameStr);
}

// ── Bulk Import ───────────────────────────────────────────────────────────────
function openBulkModal()  { var o=document.getElementById('bulk-overlay'); if(o) o.classList.remove('hidden'); }
function closeBulkModal() { var o=document.getElementById('bulk-overlay'); if(o) o.classList.add('hidden'); _bulkValid=[]; }
function downloadTemplate() {
  var csv = '\uFEFFnombre,categoria,stock,precio_compra,precio_venta,descripcion\nChocolate artesanal,dulces,20,15,25,Hecho a mano\nPulsera chaquiras,pulseras,10,30,60,Multicolor\n';
  var a = document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download='plantilla_productos.csv'; a.click();
}
function handleBulkFile(e) {
  var file = e.target.files[0]; if(!file) return;
  var reader = new FileReader();
  reader.onload = function(ev){
    var text  = ev.target.result.replace(/^\uFEFF/,'');
    var lines = text.split(/\r?\n/).filter(function(l){ return l.trim(); });
    var hdr   = lines[0].toLowerCase();
    var start = hdr.includes('nombre') ? 1 : 0;
    var tbody = document.getElementById('bulk-tbody');
    var prev  = document.getElementById('bulk-preview');
    if (!tbody) return;
    _bulkValid = [];
    tbody.innerHTML = lines.slice(start).map(function(line){
      var c = line.split(',').map(function(s){ return s.replace(/^"|"$/g,'').trim(); });
      var name=c[0],cat=c[1],stock=c[2],buy=c[3],sell=c[4],desc=c[5];
      var errs=[];
      if(!name) errs.push('Nombre vacío');
      if(!['dulces','pulseras'].includes((cat||'').toLowerCase())) errs.push('Categoría inválida');
      if(isNaN(parseInt(stock))||parseInt(stock)<0) errs.push('Stock inválido');
      if(isNaN(parseFloat(buy)))  errs.push('Precio compra inválido');
      if(isNaN(parseFloat(sell))) errs.push('Precio venta inválido');
      if(!errs.length && parseFloat(sell)<parseFloat(buy)) errs.push('Venta < compra');
      if(!errs.length) _bulkValid.push({ id:uid(), name:name, category:cat.toLowerCase(),
        stock:parseInt(stock), buyPrice:parseFloat(buy), sellPrice:parseFloat(sell),
        description:desc||'', img:null, img2:null, img3:null, createdAt:new Date().toISOString() });
      return '<tr style="background:'+(errs.length?'#e74c3c11':'#2ecc7111')+'"><td>'+(name||'-')+'</td><td>'+(cat||'-')+'</td><td>'+(stock||'-')+'</td><td>'+(buy||'-')+'</td><td>'+(sell||'-')+'</td><td style="color:'+(errs.length?'#e74c3c':'#2ecc71')+'">'+(errs.join(', ')||'✓ Válido')+'</td></tr>';
    }).join('');
    if(prev) prev.classList.remove('hidden');
  };
  reader.readAsText(file,'UTF-8');
}
function confirmBulkImport() {
  if(!_bulkValid.length){ showToast('Sin filas válidas','error'); return; }
  _bulkValid.forEach(function(p){ saveItem('products',p); });
  showToast(_bulkValid.length+' productos importados ✓');
  closeBulkModal();
}

// ── Render All ────────────────────────────────────────────────────────────────
function renderAll() {
  renderPanel();
  renderInventory();
  renderMovements();
  renderUsers();
  var sv = document.getElementById('view-sales');
  if (sv && sv.classList.contains('active')) { renderSaleProductList(); renderCart(); }
}

// ── Splash ────────────────────────────────────────────────────────────────────
function hideSplash() {
  var s = document.getElementById('splash');
  if (s) { s.style.opacity='0'; s.style.transition='opacity 0.4s'; setTimeout(function(){ s.style.display='none'; },420); }
  document.body.style.visibility = 'visible';
}

// ── DOMContentLoaded ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {

  // Image slots
  [['f-img','img-preview',1],['f-img2','img2-preview',2],['f-img3','img3-preview',3]].forEach(function(slot){
    var el = document.getElementById(slot[0]);
    if (!el) return;
    el.addEventListener('change', function(ev){
      var file = ev.target.files[0]; if(!file) return;
      compressImage(file, 480, 0.65).then(function(comp){
        if(slot[2]===1) _productImgData  = comp;
        if(slot[2]===2) _productImg2Data = comp;
        if(slot[2]===3) _productImg3Data = comp;
        var p = document.getElementById(slot[1]);
        if(p){ p.src=comp; p.style.display='block'; }
      });
    });
  });

  // Product form submit
  var form = document.getElementById('product-form');
  if (form) {
    form.addEventListener('submit', function(ev){
      ev.preventDefault();
      function g(id){ return (document.getElementById(id)||{}).value||''; }
      var name      = g('f-name').trim();
      var category  = g('f-category');
      var stock     = parseInt(g('f-stock'))   || 0;
      var buyPrice  = parseFloat(g('f-buy'))   || 0;
      var sellPrice = parseFloat(g('f-sell'))  || 0;
      var desc      = g('f-desc');
      if (!name||!category) { showToast('Nombre y categoría requeridos','error'); return; }
      if (sellPrice < buyPrice) { showToast('Precio venta debe ser ≥ precio compra','error'); return; }
      var existing = _editId ? (products.find(function(p){ return p.id===_editId; })||{}) : {};
      saveItem('products', {
        id: _editId || uid(), name:name, category:category,
        stock:stock, buyPrice:buyPrice, sellPrice:sellPrice, description:desc,
        img:  _productImgData  || existing.img  || null,
        img2: _productImg2Data || existing.img2 || null,
        img3: _productImg3Data || existing.img3 || null,
        createdAt: existing.createdAt || new Date().toISOString()
      });
      showToast(_editId ? 'Producto actualizado ✓' : 'Producto guardado ✓');
      resetForm();
      navigate('products');
    });
  }

  // Movement form
  var movForm = document.getElementById('mov-form');
  if (movForm) movForm.addEventListener('submit', submitMovement);
  var movClose = document.getElementById('mov-close');
  if (movClose) movClose.addEventListener('click', closeMovModal);

  // Nav items
  document.querySelectorAll('[data-view]').forEach(function(el){
    el.addEventListener('click', function(){ navigate(el.dataset.view); });
  });

  // More menu (mobile bottom nav)
  var moreBtn  = document.getElementById('bnav-more');
  var moreMenu = document.getElementById('more-menu');
  if (moreBtn && moreMenu) {
    moreBtn.addEventListener('click', function(ev){
      ev.stopPropagation();
      moreMenu.classList.toggle('show');
    });
    document.addEventListener('click', function(){ moreMenu.classList.remove('show'); });
  }

  // Logout buttons
  ['logout-btn','logout-btn-mobile'].forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.addEventListener('click', function(){ if(typeof fbLogout==='function') fbLogout(); });
  });

  // Bulk import
  var bBtn=document.getElementById('bulk-import-btn');  if(bBtn) bBtn.addEventListener('click',openBulkModal);
  var bFile=document.getElementById('bulk-file');        if(bFile) bFile.addEventListener('change',handleBulkFile);
  var bConf=document.getElementById('bulk-confirm');     if(bConf) bConf.addEventListener('click',confirmBulkImport);
  var bClose=document.getElementById('bulk-close');      if(bClose) bClose.addEventListener('click',closeBulkModal);
  var bTpl=document.getElementById('download-template'); if(bTpl) bTpl.addEventListener('click',downloadTemplate);

  // Settings
  var saveBtn = document.getElementById('save-settings-btn');
  if (saveBtn) saveBtn.addEventListener('click', saveSettings);

  function bindInput(id, key, fn) {
    var el = document.getElementById(id);
    if(el) el.addEventListener('input', function(){ _pendingSettings[key] = fn ? fn(el.value) : el.value; });
  }
  bindInput('set-store-name',     'storeName');
  bindInput('set-store-subtitle', 'storeSubtitle');
  bindInput('set-accent',         'accent');
  bindInput('set-bg-opacity',     'bgOpacity', function(v){ return parseFloat(v); });

  document.querySelectorAll('.theme-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('.theme-btn').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      _pendingSettings.theme = btn.dataset.theme;
      applySettings(_pendingSettings);
    });
  });
  document.querySelectorAll('.accent-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      _pendingSettings.accent = btn.dataset.color;
      var ac = document.getElementById('set-accent');
      if(ac) ac.value = btn.dataset.color;
      applySettings(_pendingSettings);
    });
  });

  function bindLogo(inputId, previewId, key) {
    var el = document.getElementById(inputId);
    if(!el) return;
    el.addEventListener('change', function(ev){
      var file = ev.target.files[0]; if(!file) return;
      compressImage(file,300,0.85).then(function(comp){
        _pendingSettings[key] = comp;
        var pr = document.getElementById(previewId);
        if(pr){ pr.src=comp; pr.style.display='block'; }
      });
    });
  }
  bindLogo('logo-upload',        'logo-preview',        'logoData');
  bindLogo('logo-mobile-upload', 'logo-mobile-preview', 'logoMobileData');

  // Search / filter in inventory
  var sp = document.getElementById('search-products');
  if(sp) sp.addEventListener('input', renderInventory);
  var fc = document.getElementById('filter-cat');
  if(fc) fc.addEventListener('change', renderInventory);

  // Export / Reset
  var expBtn = document.getElementById('export-data-btn');
  if(expBtn) expBtn.addEventListener('click', function(){
    var data = { products:products, movements:movements, users:users, exported:new Date().toISOString() };
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    a.download = 'talara_backup.json'; a.click();
  });
  var rstBtn = document.getElementById('reset-data-btn');
  if(rstBtn) rstBtn.addEventListener('click', function(){
    if(!confirm('¿Restablecer todos los datos? No se puede deshacer.')) return;
    products=[]; movements=[]; users=[];
    renderAll(); showToast('Datos restablecidos');
  });

  // Reports date defaults
  var rd = document.getElementById('r-date');
  if(rd) rd.value = localDateStr();
  var now = new Date();
  var rm  = document.getElementById('r-month');
  var ry  = document.getElementById('r-year');
  if(rm) rm.value = now.getMonth()+1;
  if(ry) ry.value = now.getFullYear();
});

// ── Init ──────────────────────────────────────────────────────────────────────
navigate('panel');

if (typeof initFirebase === 'function') {
  initFirebase({
    onData: function(col, data) {
      if (col === 'products')  products  = data;
      if (col === 'movements') movements = data;
      if (col === 'users')     users     = data;
      renderAll();
    },
    onUser: function(user) {
      if (!user) return;
      activeUserId = user.uid;
      var u    = users.find(function(x){ return x.id === user.uid; });
      var role = u ? u.role : 'Admin';
      applyPrivileges(role);
      applySettings(getUserSettings(user.uid));
      hideSplash();
    },
    onSettings: function(uid, settings) {
      if (uid === activeUserId) {
        applySettings(Object.assign({}, getUserSettings(uid), settings));
      }
    }
  });
} else {
  hideSplash();
}
// v20260504
