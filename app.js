// ── Helpers ──────────────────────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function fmt(n) { return '$' + Number(n||0).toFixed(2); }
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'});
}
function localDateStr(d) {
  d = d || new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function showToast(msg, type) {
  var t = document.getElementById('toast'); if(!t) return;
  t.textContent = msg; t.className = 'toast show '+(type||'success');
  clearTimeout(t._t); t._t = setTimeout(function(){ t.className='toast'; }, 3000);
}

// ── Estado global ─────────────────────────────────────────────────────────────
var products  = [];
var movements = [];
var users     = [];
var activeUserId  = 'guest';
var currentRole   = 'Admin';
var _editId       = null;
var _img1 = null, _img2 = null, _img3 = null;
var _movPid = null, _movType = null;
var _cart   = {};
var _pending = {};
var _bulkOk  = [];

// ── DEFAULTS de ajustes ───────────────────────────────────────────────────────
var DEFAULTS = {
  storeName:'TALARA', storeSubtitle:'Dulces & Pulseras',
  theme:'dark', accent:'#e07b39',
  logoData:null, logoMobileData:null
};

// ── Firebase bridge (fire-and-forget) ─────────────────────────────────────────
function saveItem(col, item) {
  // Actualizar local inmediatamente
  var arr = col==='products' ? products : col==='movements' ? movements : users;
  var i = arr.findIndex(function(x){ return x.id===item.id; });
  if (i>=0) arr[i]=item; else arr.push(item);
  renderAll();
  // Enviar a Firebase en background
  if (typeof fbSaveItem==='function') {
    fbSaveItem(col, item).catch(function(e){ console.warn(col+' save:',e.message); });
  }
}
function deleteItem(col, id) {
  if (col==='products')  products  = products.filter(function(x){ return x.id!==id; });
  if (col==='movements') movements = movements.filter(function(x){ return x.id!==id; });
  if (col==='users')     users     = users.filter(function(x){ return x.id!==id; });
  renderAll();
  if (typeof fbDeleteItem==='function') {
    fbDeleteItem(col, id).catch(function(e){ console.warn(col+' delete:',e.message); });
  }
}

// ── Navegación ────────────────────────────────────────────────────────────────
function navigate(view) {
  document.querySelectorAll('.view').forEach(function(v){ v.classList.remove('active'); });
  document.querySelectorAll('.nav-item,.bnav-item').forEach(function(n){ n.classList.remove('active'); });
  var el = document.getElementById('view-'+view);
  if (el) el.classList.add('active');
  document.querySelectorAll('[data-view="'+view+'"]').forEach(function(n){ n.classList.add('active'); });
  window.scrollTo(0,0);
  if (view==='panel')    renderPanel();
  if (view==='products') renderInventory();
  if (view==='sales')    initSaleView();
  if (view==='history')  renderMovements();
  if (view==='reports')  initReports();
  if (view==='users')    renderUsers();
  if (view==='settings') loadSettingsUI();
}

// ── Panel ─────────────────────────────────────────────────────────────────────
function renderPanel() {
  var tp  = products.length;
  var inv = products.reduce(function(s,p){ return s+p.buyPrice*p.stock; },0);
  var pot = products.reduce(function(s,p){ return s+(p.sellPrice-p.buyPrice)*p.stock; },0);
  var sol = movements.filter(function(m){ return m.type==='out'; })
                     .reduce(function(s,m){ return s+m.price*m.qty; },0);
  function se(id,v){ var e=document.getElementById(id); if(e) e.textContent=v; }
  se('stat-products', tp);
  se('stat-investment', fmt(inv));
  se('stat-gain', fmt(pot));
  se('stat-sold', fmt(sol));
  var ll = document.getElementById('low-stock-list');
  if (ll) {
    var low = products.filter(function(p){ return p.stock<=3; })
                      .sort(function(a,b){ return a.stock-b.stock; });
    ll.innerHTML = !low.length
      ? '<p style="padding:12px 16px;color:var(--muted)">Sin productos con bajo stock</p>'
      : low.map(function(p){
          return '<div class="low-item"><span>'+p.name+'</span>'+
            '<span class="badge '+(p.stock===0?'badge-danger':'badge-warn')+'">'+p.stock+' uds</span></div>';
        }).join('');
  }
}

// ── Inventario ────────────────────────────────────────────────────────────────
function renderInventory() {
  var search = (document.getElementById('search-products')||{}).value||'';
  var cat    = (document.getElementById('filter-cat')||{}).value||'';
  var tbody  = document.getElementById('inventory-body');
  if (!tbody) return;
  var list = products.filter(function(p){
    return p.name.toLowerCase().includes(search.toLowerCase()) && (!cat||p.category===cat);
  });
  if (!list.length) {
    tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--muted)">'+
      'Sin productos. Usa <strong>Nuevo Producto</strong> para agregar.</td></tr>';
    return;
  }
  var isAdmin = currentRole==='Admin';
  var canW    = currentRole!=='Solo lectura';
  tbody.innerHTML = list.map(function(p){
    var img = p.img
      ? '<img src="'+p.img+'" style="width:38px;height:38px;border-radius:6px;object-fit:cover">'
      : '<span style="font-size:22px">'+(p.category==='dulces'?'🍬':'📿')+'</span>';
    return '<tr>'+
      '<td>'+img+'</td>'+
      '<td><strong>'+p.name+'</strong>'+(p.description?'<br><small style="color:var(--muted)">'+p.description+'</small>':'')+'</td>'+
      '<td><span class="badge">'+p.category+'</span></td>'+
      '<td style="color:'+(p.stock<=3?'#e74c3c':'inherit')+'"><strong>'+p.stock+'</strong></td>'+
      '<td>'+fmt(p.buyPrice)+'</td>'+
      '<td>'+fmt(p.sellPrice)+'</td>'+
      '<td class="admin-only">'+fmt((p.sellPrice-p.buyPrice).toFixed(2))+'</td>'+
      '<td style="white-space:nowrap">'+
        '<button class="btn-action btn-in"  onclick="openMovModal(\''+p.id+'\',\'in\')"  title="Entrada">↓</button>'+
        '<button class="btn-action btn-out" onclick="openMovModal(\''+p.id+'\',\'out\')" title="Salida">↑</button>'+
        (canW?'<button class="btn-action btn-edit"   onclick="editProduct(\''+p.id+'\')" title="Editar">✎</button>':'')+
        (isAdmin?'<button class="btn-action btn-delete" onclick="deleteProduct(\''+p.id+'\')" title="Eliminar">✕</button>':'')+
      '</td></tr>';
  }).join('');
}

function showProductForm() {
  if (currentRole==='Solo lectura'){ alert('Sin permisos'); return; }
  navigate('new-product'); resetForm();
}
function resetForm() {
  _editId=_img1=_img2=_img3=null;
  var f=document.getElementById('product-form'); if(f) f.reset();
  ['img-preview','img2-preview','img3-preview'].forEach(function(id){
    var e=document.getElementById(id); if(e){e.src='';e.style.display='none';}
  });
  var t=document.getElementById('form-title'); if(t) t.textContent='Nuevo Producto';
  var b=document.getElementById('form-btn');   if(b) b.textContent='Guardar Producto';
}
function editProduct(pid) {
  if (currentRole==='Solo lectura'){ alert('Sin permisos'); return; }
  var p=products.find(function(x){ return x.id===pid; }); if(!p) return;
  navigate('new-product'); _editId=pid;
  _img1=p.img||null; _img2=p.img2||null; _img3=p.img3||null;
  function sv(id,v){ var e=document.getElementById(id); if(e) e.value=v||''; }
  sv('f-name',p.name); sv('f-category',p.category);
  sv('f-stock',p.stock); sv('f-buy',p.buyPrice);
  sv('f-sell',p.sellPrice); sv('f-desc',p.description||'');
  [['img-preview',p.img],['img2-preview',p.img2],['img3-preview',p.img3]].forEach(function(x){
    var e=document.getElementById(x[0]); if(e&&x[1]){e.src=x[1];e.style.display='block';}
  });
  var t=document.getElementById('form-title'); if(t) t.textContent='Editar Producto';
  var b=document.getElementById('form-btn');   if(b) b.textContent='Actualizar Producto';
}
function deleteProduct(pid) {
  if (currentRole!=='Admin'){ alert('Solo Admin puede eliminar'); return; }
  if (!confirm('¿Eliminar este producto?')) return;
  deleteItem('products', pid); showToast('Producto eliminado');
}
function compressImage(file, maxPx, q) {
  maxPx=maxPx||480; q=q||0.65;
  return new Promise(function(resolve){
    var r=new FileReader();
    r.onload=function(ev){
      var img=new Image();
      img.onload=function(){
        var c=document.createElement('canvas'),w=img.width,h=img.height;
        if(w>maxPx||h>maxPx){ if(w>h){h=Math.round(h*maxPx/w);w=maxPx;}else{w=Math.round(w*maxPx/h);h=maxPx;} }
        c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);
        resolve(c.toDataURL('image/jpeg',q));
      };
      img.src=ev.target.result;
    };
    r.readAsDataURL(file);
  });
}

// ── Modal movimiento ──────────────────────────────────────────────────────────
function openMovModal(pid, type) { /* fixed */
  if (currentRole==='Solo lectura'){ alert('Sin permisos'); return; }
  _movPid=pid; _movType=type;
  var p=products.find(function(x){ return x.id===pid; }); if(!p) return;
  var o=document.getElementById('modal-overlay'); if(!o) return;
  function se(id,v){ var e=document.getElementById(id); if(e) e.textContent=v; }
  function sv(id,v){ var e=document.getElementById(id); if(e) e.value=v; }
  se('mov-title', type==='in'?'Registrar Entrada':'Registrar Salida');
  se('mov-product-info', p.name);
  se('mov-stock', p.stock);
  sv('mov-price', type==='out'?p.sellPrice:p.buyPrice);
  sv('mov-qty', 1);
  var q=document.getElementById('mov-qty'); if(q) q.max=type==='out'?p.stock:9999;
  o.classList.remove('hidden');
}
function closeMovModal() {
  var o=document.getElementById('modal-overlay'); if(o) o.classList.add('hidden');
}
function submitMovement(e) {
  e.preventDefault();
  var qty  =parseInt((document.getElementById('mov-qty')||{}).value)||0;
  var price=parseFloat((document.getElementById('mov-price')||{}).value)||0;
  var note =(document.getElementById('mov-note')||{}).value||'';
  var p=products.find(function(x){ return x.id===_movPid; }); if(!p) return;
  if (_movType==='out'&&qty>p.stock){ showToast('Stock insuficiente','error'); return; }
  if (qty<=0){ showToast('Cantidad debe ser mayor a 0','error'); return; }
  saveItem('products', Object.assign({},p,{stock:_movType==='in'?p.stock+qty:p.stock-qty}));
  saveItem('movements',{ id:uid(), productId:p.id, productName:p.name,
    type:_movType, qty:qty, price:price,
    profit:_movType==='out'?(price-p.buyPrice)*qty:0,
    note:note, date:new Date().toISOString() });
  closeMovModal();
  showToast(_movType==='in'?'Entrada registrada ✓':'Salida registrada ✓');
}

// ── Movimientos ───────────────────────────────────────────────────────────────
function renderMovements() {
  var tb=document.getElementById('movements-body'); if(!tb) return;
  var list=movements.slice().sort(function(a,b){ return new Date(b.date)-new Date(a.date); });
  if (!list.length){ tb.innerHTML='<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--muted)">Sin movimientos</td></tr>'; return; }
  tb.innerHTML=list.slice(0,150).map(function(m){
    return '<tr>'+
      '<td>'+fmtDate(m.date)+'</td>'+
      '<td>'+m.productName+'</td>'+
      '<td><span class="badge '+(m.type==='in'?'badge-in':'badge-out')+'">'+(m.type==='in'?'Entrada':'Salida')+'</span></td>'+
      '<td>'+m.qty+'</td><td>'+fmt(m.price)+'</td>'+
      '<td class="admin-only">'+(m.type==='out'?fmt(m.profit):'-')+'</td>'+
      '<td>'+(m.note||'-')+'</td></tr>';
  }).join('');
}

// ── Ventas ────────────────────────────────────────────────────────────────────
function initSaleView() {
  _cart={};
  renderSaleList(); renderCart();
  function bind(id,fn){ var e=document.getElementById(id); if(e&&!e._sb){e.addEventListener('input',fn);e._sb=true;} }
  bind('sale-search', renderSaleList);
  var sf=document.getElementById('sale-cat-filter');
  if(sf&&!sf._sb){ sf.addEventListener('change',renderSaleList); sf._sb=true; }
  var cb=document.getElementById('confirm-sale-btn');
  if(cb&&!cb._sb){ cb.addEventListener('click',confirmSale); cb._sb=true; }
}
function renderSaleList() {
  var s=(document.getElementById('sale-search')||{}).value||'';
  var c=(document.getElementById('sale-cat-filter')||{}).value||'';
  var el=document.getElementById('sale-product-list'); if(!el) return;
  var prods=products.filter(function(p){ return p.stock>0; });
  if(s) prods=prods.filter(function(p){ return p.name.toLowerCase().includes(s.toLowerCase()); });
  if(c) prods=prods.filter(function(p){ return p.category===c; });
  if(!prods.length){ el.innerHTML='<p style="color:var(--muted);padding:16px;grid-column:1/-1">Sin productos disponibles</p>'; return; }
  el.innerHTML=prods.map(function(p){
    var q=_cart[p.id]||0;
    var img=p.img
      ? '<img src="'+p.img+'" style="width:100%;height:100px;object-fit:cover;border-radius:8px 8px 0 0">'
      : '<div style="height:100px;display:flex;align-items:center;justify-content:center;font-size:32px;background:var(--surface2);border-radius:8px 8px 0 0">'+(p.category==='dulces'?'🍬':'📿')+'</div>';
    return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden">'+
      img+
      '<div style="padding:8px">'+
        '<div style="font-size:12px;font-weight:600;line-height:1.3;margin-bottom:2px">'+p.name+'</div>'+
        '<div style="font-size:11px;color:var(--muted)">Stock: '+p.stock+'</div>'+
        '<div style="font-size:14px;font-weight:700;color:var(--orange)">'+fmt(p.sellPrice)+'</div>'+
      '</div>'+
      '<div style="padding:6px 8px;display:flex;align-items:center;gap:4px;border-top:1px solid var(--border)">'+
        '<button onclick="chgQ(\''+p.id+'\',-1)" style="width:26px;height:26px;border:1px solid var(--border);background:var(--surface2);color:var(--text);border-radius:5px;cursor:pointer;font-size:14px">−</button>'+
        '<input type="number" min="0" max="'+p.stock+'" value="'+q+'" onchange="setQ(\''+p.id+'\',this.value)" style="width:36px;text-align:center;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:5px;padding:3px;font-size:12px">'+
        '<button onclick="chgQ(\''+p.id+'\',1)"  style="width:26px;height:26px;border:1px solid var(--border);background:var(--surface2);color:var(--text);border-radius:5px;cursor:pointer;font-size:14px">+</button>'+
      '</div>'+
    '</div>';
  }).join('');
}
function chgQ(pid,d){ var p=products.find(function(x){return x.id===pid;}); if(!p) return; var n=Math.max(0,Math.min(p.stock,(_cart[pid]||0)+d)); if(n===0) delete _cart[pid]; else _cart[pid]=n; renderSaleList(); renderCart(); }
function setQ(pid,v){ var p=products.find(function(x){return x.id===pid;}); if(!p) return; var n=Math.max(0,Math.min(p.stock,parseInt(v)||0)); if(n===0) delete _cart[pid]; else _cart[pid]=n; renderCart(); }
function renderCart() {
  var ce=document.getElementById('cart-items'),te=document.getElementById('cart-total'),ge=document.getElementById('cart-gain'),btn=document.getElementById('confirm-sale-btn');
  if(!ce) return;
  var entries=Object.entries(_cart).filter(function(e){ return e[1]>0; });
  if(!entries.length){ ce.innerHTML='<p style="color:var(--muted);font-size:13px">Sin productos</p>'; if(te)te.textContent=fmt(0); if(ge)ge.textContent=fmt(0); if(btn)btn.disabled=true; return; }
  var tot=0,gain=0;
  ce.innerHTML=entries.map(function(e){ var p=products.find(function(x){return x.id===e[0];}); if(!p)return''; var s=p.sellPrice*e[1],g=(p.sellPrice-p.buyPrice)*e[1]; tot+=s;gain+=g; return '<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0;border-bottom:1px solid var(--border)"><span>'+p.name+' x'+e[1]+'</span><strong>'+fmt(s)+'</strong></div>'; }).join('');
  if(te)te.textContent=fmt(tot); if(ge)ge.textContent=fmt(gain); if(btn)btn.disabled=false;
}
function confirmSale() {
  if(currentRole==='Solo lectura'){alert('Sin permisos');return;}
  var entries=Object.entries(_cart).filter(function(e){return e[1]>0;});
  if(!entries.length){showToast('Agrega productos','error');return;}
  entries.forEach(function(e){
    var p=products.find(function(x){return x.id===e[0];}); if(!p)return;
    saveItem('products',Object.assign({},p,{stock:p.stock-e[1]}));
    saveItem('movements',{id:uid(),productId:p.id,productName:p.name,type:'out',qty:e[1],price:p.sellPrice,profit:(p.sellPrice-p.buyPrice)*e[1],note:'Venta rápida',date:new Date().toISOString()});
  });
  showToast('Venta registrada ✓');
  _cart={}; renderSaleList(); renderCart();
}

// ── Reportes ──────────────────────────────────────────────────────────────────
function initReports() {
  var rd=document.getElementById('r-date'); if(rd&&!rd.value) rd.value=localDateStr();
  var now=new Date();
  var rm=document.getElementById('r-month'); if(rm&&!rm.value) rm.value=now.getMonth()+1;
  var ry=document.getElementById('r-year');  if(ry&&!ry.value) ry.value=now.getFullYear();
  if(rd&&!rd._rb){ rd.addEventListener('change',generateDailyReport); rd._rb=true; }
  if(rm&&!rm._rb){ rm.addEventListener('change',generateMonthlyReport); rm._rb=true; }
  if(ry&&!ry._rb){ ry.addEventListener('change',generateMonthlyReport); ry._rb=true; }
  generateDailyReport(); generateMonthlyReport();
}
function generateDailyReport() {
  var rd=document.getElementById('r-date'), date=rd?rd.value:localDateStr();
  var movs=movements.filter(function(m){return m.type==='out'&&m.date.startsWith(date);});
  var box=document.getElementById('daily-report'); if(!box) return;
  if(!movs.length){box.innerHTML='<p style="color:var(--muted);padding:16px">Sin ventas para esta fecha.</p>';return;}
  box.innerHTML=buildReport(movs,'daily',date);
}
function generateMonthlyReport() {
  var mEl=document.getElementById('r-month'),yEl=document.getElementById('r-year'); if(!mEl||!yEl) return;
  var prefix=yEl.value+'-'+String(mEl.value).padStart(2,'0');
  var movs=movements.filter(function(m){return m.type==='out'&&m.date.startsWith(prefix);});
  var box=document.getElementById('monthly-report'); if(!box) return;
  if(!movs.length){box.innerHTML='<p style="color:var(--muted);padding:16px">Sin ventas para este mes.</p>';return;}
  box.innerHTML=buildReport(movs,'monthly',prefix);
}
function buildReport(movs,type,date) {
  var sold=movs.reduce(function(s,m){return s+m.price*m.qty;},0);
  var gain=movs.reduce(function(s,m){return s+(m.profit||0);},0);
  var units=movs.reduce(function(s,m){return s+m.qty;},0);
  var dP=new Set(movs.map(function(m){return m.productId;})).size;
  var rows=movs.map(function(m){return '<tr><td>'+fmtDate(m.date)+'</td><td>'+m.productName+'</td><td>'+m.qty+'</td><td>'+fmt(m.price)+'</td><td>'+fmt(m.price*m.qty)+'</td><td class="admin-only">'+fmt(m.profit||0)+'</td></tr>';}).join('');
  return '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">'+
    '<div class="rstat"><div class="rstat-val">'+dP+'</div><div class="rstat-label">Productos</div></div>'+
    '<div class="rstat"><div class="rstat-val">'+units+'</div><div class="rstat-label">Unidades</div></div>'+
    '<div class="rstat"><div class="rstat-val">'+fmt(sold)+'</div><div class="rstat-label">Total vendido</div></div>'+
    '<div class="rstat admin-only"><div class="rstat-val">'+fmt(gain)+'</div><div class="rstat-label">Ganancia</div></div>'+
    '</div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">'+
      '<button class="btn-secondary" onclick="dlCSV(\''+type+'\',\''+date+'\')">⬇ CSV</button>'+
      '<button class="btn-secondary" onclick="dlPDF(\''+type+'\',\''+date+'\')">📄 PDF</button>'+
      '<button class="btn-secondary" onclick="shareRep(\''+type+'\',\''+date+'\')">📤 Compartir</button>'+
    '</div>'+
    '<div class="table-scroll"><table class="data-table"><thead><tr><th>Fecha</th><th>Producto</th><th>Cant</th><th>Precio</th><th>Total</th><th class="admin-only">Ganancia</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function dlCSV(type,date) {
  var movs=movements.filter(function(m){return m.type==='out'&&m.date.startsWith(date);});
  var csv='\uFEFFFecha,Producto,Cantidad,Precio,Total,Ganancia\n'+movs.map(function(m){return fmtDate(m.date)+','+m.productName+','+m.qty+','+m.price+','+(m.price*m.qty)+','+(m.profit||0);}).join('\n');
  var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); a.download='reporte_'+date+'.csv'; a.click();
}
function dlPDF(type,date) {
  var movs=movements.filter(function(m){return m.type==='out'&&m.date.startsWith(date);});
  var cfg=getUserSettings(activeUserId), store=cfg.storeName||'TALARA';
  var total=movs.reduce(function(s,m){return s+m.price*m.qty;},0);
  var rows=movs.map(function(m){return '<tr><td>'+fmtDate(m.date)+'</td><td>'+m.productName+'</td><td>'+m.qty+'</td><td>'+fmt(m.price)+'</td><td>'+fmt(m.price*m.qty)+'</td></tr>';}).join('');
  var w=window.open('','_blank');
  if(w){ w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;padding:24px}h1{color:#e07b39}table{width:100%;border-collapse:collapse;margin-top:16px}th{background:#f5f5f5;padding:8px;text-align:left;border-bottom:2px solid #ddd}td{padding:7px 8px;border-bottom:1px solid #eee}.tot{font-weight:bold;text-align:right;margin-top:12px}</style></head><body><h1>'+store+'</h1><h2 style="color:#555">Ventas — '+date+'</h2><table><thead><tr><th>Fecha</th><th>Producto</th><th>Cant</th><th>Precio</th><th>Total</th></tr></thead><tbody>'+rows+'</tbody></table><p class="tot">Total: '+fmt(total)+'</p><script>window.onload=function(){window.print();}<\/script></body></html>'); w.document.close(); }
  else showToast('Activa ventanas emergentes para el PDF','error');
}
function shareRep(type,date) {
  if(navigator.share) navigator.share({title:'Reporte TALARA',text:'Reporte '+date,url:location.href});
  else navigator.clipboard.writeText(location.href).then(function(){showToast('URL copiada');});
}

// ── Usuarios ──────────────────────────────────────────────────────────────────
function renderUsers() {
  var list=document.getElementById('users-list'); if(!list) return;
  if(!users.length){list.innerHTML='<p style="color:var(--muted);padding:16px">Sin usuarios registrados</p>';return;}
  var cols={Admin:'#e07b39',Usuario:'#4a9e6f','Solo lectura':'#7a7570'};
  list.innerHTML=users.map(function(u){
    var ini=(u.name||'?').split(' ').map(function(w){return w[0];}).join('').toUpperCase().slice(0,2);
    var col=cols[u.role]||'#7a7570';
    return '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border)">'+
      '<div style="width:40px;height:40px;border-radius:50%;background:'+col+';display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;flex-shrink:0">'+ini+'</div>'+
      '<div style="flex:1;min-width:0"><div style="font-weight:600">'+(u.name||'Sin nombre')+'</div><div style="font-size:12px;color:var(--muted)">'+(u.email||'')+'</div></div>'+
      '<span class="badge" style="background:'+col+'22;color:'+col+'">'+u.role+'</span>'+
      (currentRole==='Admin'?'<select onchange="changeRole(\''+u.id+'\',this.value)" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:4px 6px;font-size:12px"><option '+(u.role==='Admin'?'selected':'')+'>Admin</option><option '+(u.role==='Usuario'?'selected':'')+'>Usuario</option><option '+(u.role==='Solo lectura'?'selected':'')+'>Solo lectura</option></select>':'')+
    '</div>';
  }).join('');
}
function changeRole(uid,role) {
  if(currentRole!=='Admin'){alert('Solo Admin puede cambiar roles');return;}
  var u=users.find(function(x){return x.id===uid;}); if(!u)return;
  saveItem('users',Object.assign({},u,{role:role})); showToast('Rol actualizado');
}

// ── Ajustes ───────────────────────────────────────────────────────────────────
function getUserSettings(uid) {
  try {
    var key = 'inv_settings_'+(uid||'guest');
    var raw = localStorage.getItem(key);
    return raw ? Object.assign({},DEFAULTS,JSON.parse(raw)) : Object.assign({},DEFAULTS);
  } catch(e) { return Object.assign({},DEFAULTS); }
}
function saveUserSettings(uid, s) {
  localStorage.setItem('inv_settings_'+(uid||'guest'), JSON.stringify(s));
  if(typeof fbSaveSettings==='function') fbSaveSettings(uid,s).catch(function(){});
}
function applySettings(s) {
  if (!s) s = DEFAULTS;
  var root=document.documentElement;
  if(s.theme==='light'){
    root.style.setProperty('--bg','#f5f5f5'); root.style.setProperty('--surface','#ffffff');
    root.style.setProperty('--surface2','#eeeeee'); root.style.setProperty('--border','#dddddd');
    root.style.setProperty('--text','#111111'); root.style.setProperty('--muted','#666666');
  } else {
    root.style.setProperty('--bg','#141414'); root.style.setProperty('--surface','#1e1e1e');
    root.style.setProperty('--surface2','#252525'); root.style.setProperty('--border','#2e2e2e');
    root.style.setProperty('--text','#f0ece6'); root.style.setProperty('--muted','#7a7570');
  }
  root.style.setProperty('--orange',s.accent||'#e07b39');
  function se(id,v){var e=document.getElementById(id);if(e)e.textContent=v||'';}
  se('sidebar-store-name',s.storeName); se('sidebar-store-subtitle',s.storeSubtitle);
  se('mobile-store-name',s.storeName);
  var sl=document.getElementById('sidebar-logo');
  if(sl&&s.logoData){sl.src=s.logoData;sl.style.display='block';}
  var ml=document.getElementById('mobile-logo');
  if(ml&&(s.logoMobileData||s.logoData)){ml.src=s.logoMobileData||s.logoData;ml.style.display='block';}
  var st=document.getElementById('splash-logo-text'); if(st) st.textContent=(s.storeName||'T')[0];
  var sn=document.getElementById('splash-store-name'); if(sn) sn.textContent=s.storeName||'TALARA';
  document.title=(s.storeName||'TALARA')+' — Inventario';
}
function loadSettingsUI() {
  var s=getUserSettings(activeUserId); _pending=Object.assign({},s);
  function sv(id,v){var e=document.getElementById(id);if(e)e.value=v||'';}
  sv('set-store-name',s.storeName); sv('set-store-subtitle',s.storeSubtitle);
  sv('set-accent',s.accent||'#e07b39');
  document.querySelectorAll('.theme-btn').forEach(function(b){b.classList.toggle('active',b.dataset.theme===s.theme);});
  function sp(id,src){var e=document.getElementById(id);if(e&&src){e.src=src;e.style.display='block';}}
  sp('logo-preview',s.logoData); sp('logo-mobile-preview',s.logoMobileData);
}
function saveSettings() {
  saveUserSettings(activeUserId,_pending); applySettings(_pending); showToast('✓ Cambios guardados');
}

// ── Privilegios ───────────────────────────────────────────────────────────────
function applyPrivileges(role) {
  currentRole=role;
  var isAdmin=role==='Admin', canW=role!=='Solo lectura';
  document.querySelectorAll('.admin-only').forEach(function(e){e.style.display=isAdmin?'':'none';});
  document.querySelectorAll('.write-only').forEach(function(e){e.style.display=canW?'':'none';});
  var np=document.querySelector('[data-view="new-product"]'); if(np) np.style.display=canW?'':'none';
  var uv=document.querySelector('[data-view="users"]');       if(uv) uv.style.display=isAdmin?'':'none';
  var u=users.find(function(x){return x.id===activeUserId;});
  var ns=u?u.name+' · '+u.role:role;
  function se(id,v){var e=document.getElementById(id);if(e)e.textContent=v;}
  se('sidebar-user-info',ns); se('mobile-user-info',ns);
}

// ── Bulk import ───────────────────────────────────────────────────────────────
function openBulkModal(){var o=document.getElementById('bulk-overlay');if(o)o.classList.remove('hidden');}
function closeBulkModal(){var o=document.getElementById('bulk-overlay');if(o)o.classList.add('hidden');_bulkOk=[];}
function downloadTemplate(){
  var a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['\uFEFFnombre,categoria,stock,precio_compra,precio_venta,descripcion\nChocolate,dulces,20,15,25,Hecho a mano\nPulsera,pulseras,10,30,60,Multicolor\n'],{type:'text/csv;charset=utf-8'}));
  a.download='plantilla.csv'; a.click();
}
function handleBulkFile(e){
  var file=e.target.files[0];if(!file)return;
  var r=new FileReader();
  r.onload=function(ev){
    var lines=ev.target.result.replace(/^\uFEFF/,'').split(/\r?\n/).filter(function(l){return l.trim();});
    var start=lines[0].toLowerCase().includes('nombre')?1:0;
    var tb=document.getElementById('bulk-tbody'),pv=document.getElementById('bulk-preview');
    if(!tb)return; _bulkOk=[];
    tb.innerHTML=lines.slice(start).map(function(line){
      var c=line.split(',').map(function(s){return s.replace(/^"|"$/g,'').trim();});
      var errs=[];
      if(!c[0])errs.push('Nombre vacío');
      if(!['dulces','pulseras'].includes((c[1]||'').toLowerCase()))errs.push('Categoría inválida');
      if(isNaN(parseInt(c[2]))||parseInt(c[2])<0)errs.push('Stock inválido');
      if(isNaN(parseFloat(c[3])))errs.push('Precio compra inválido');
      if(isNaN(parseFloat(c[4])))errs.push('Precio venta inválido');
      if(!errs.length&&parseFloat(c[4])<parseFloat(c[3]))errs.push('Venta < compra');
      if(!errs.length) _bulkOk.push({id:uid(),name:c[0],category:c[1].toLowerCase(),stock:parseInt(c[2]),buyPrice:parseFloat(c[3]),sellPrice:parseFloat(c[4]),description:c[5]||'',img:null,img2:null,img3:null,createdAt:new Date().toISOString()});
      return '<tr style="background:'+(errs.length?'#e74c3c11':'#2ecc7111')+'"><td>'+(c[0]||'-')+'</td><td>'+(c[1]||'-')+'</td><td>'+(c[2]||'-')+'</td><td>'+(c[3]||'-')+'</td><td>'+(c[4]||'-')+'</td><td style="color:'+(errs.length?'#e74c3c':'#2ecc71')+'">'+(errs.join(', ')||'✓')+'</td></tr>';
    }).join('');
    if(pv)pv.classList.remove('hidden');
  };
  r.readAsText(file,'UTF-8');
}
function confirmBulkImport(){
  if(!_bulkOk.length){showToast('Sin filas válidas','error');return;}
  _bulkOk.forEach(function(p){saveItem('products',p);});
  showToast(_bulkOk.length+' productos importados ✓'); closeBulkModal();
}

// ── Render all ────────────────────────────────────────────────────────────────
function renderAll() {
  renderPanel(); renderInventory(); renderMovements(); renderUsers();
  var sv=document.getElementById('view-sales');
  if(sv&&sv.classList.contains('active')){ renderSaleList(); renderCart(); }
}

// ── Splash ────────────────────────────────────────────────────────────────────
function hideSplash() {
  var s=document.getElementById('splash');
  if(s){s.style.opacity='0';s.style.transition='opacity 0.4s';setTimeout(function(){s.style.display='none';},420);}
  document.body.style.visibility='visible';
}

// ── DOMContentLoaded ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',function(){
  // Imágenes del formulario
  [['f-img','img-preview',1],['f-img2','img2-preview',2],['f-img3','img3-preview',3]].forEach(function(slot){
    var el=document.getElementById(slot[0]); if(!el)return;
    el.addEventListener('change',function(ev){
      var file=ev.target.files[0]; if(!file)return;
      compressImage(file,480,0.65).then(function(comp){
        if(slot[2]===1)_img1=comp; if(slot[2]===2)_img2=comp; if(slot[2]===3)_img3=comp;
        var p=document.getElementById(slot[1]); if(p){p.src=comp;p.style.display='block';}
      });
    });
  });

  // Formulario de producto
  var f=document.getElementById('product-form');
  if(f) f.addEventListener('submit',function(ev){
    ev.preventDefault();
    function g(id){return(document.getElementById(id)||{}).value||'';}
    var name=g('f-name').trim(),cat=g('f-category'),stock=parseInt(g('f-stock'))||0,buy=parseFloat(g('f-buy'))||0,sell=parseFloat(g('f-sell'))||0,desc=g('f-desc');
    if(!name||!cat){showToast('Nombre y categoría requeridos','error');return;}
    if(sell<buy){showToast('Precio venta debe ser ≥ precio compra','error');return;}
    var ex=_editId?(products.find(function(p){return p.id===_editId;})||{}):{};
    saveItem('products',{id:_editId||uid(),name:name,category:cat,stock:stock,buyPrice:buy,sellPrice:sell,description:desc,img:_img1||ex.img||null,img2:_img2||ex.img2||null,img3:_img3||ex.img3||null,createdAt:ex.createdAt||new Date().toISOString()});
    showToast(_editId?'Producto actualizado ✓':'Producto guardado ✓');
    resetForm(); navigate('products');
  });

  // Modal movimiento
  var mf=document.getElementById('mov-form'); if(mf) mf.addEventListener('submit',submitMovement);
  var mc=document.getElementById('mov-close'); if(mc) mc.addEventListener('click',closeMovModal);

  // Nav items (data-view)
  document.querySelectorAll('[data-view]').forEach(function(el){
    el.addEventListener('click',function(){navigate(el.dataset.view);});
  });

  // Menú "Más" (móvil)
  var mb=document.getElementById('bnav-more'),mm=document.getElementById('more-menu');
  if(mb&&mm){
    mm.style.display='none';
    mb.addEventListener('click',function(e){e.stopPropagation();mm.style.display=mm.style.display==='none'?'block':'none';});
    document.addEventListener('click',function(){mm.style.display='none';});
  }

  // Logout
  ['logout-btn','logout-btn-mobile'].forEach(function(id){
    var el=document.getElementById(id);
    if(el)el.addEventListener('click',function(){if(typeof fbLogout==='function')fbLogout();});
  });

  // Búsqueda inventario
  var sp=document.getElementById('search-products'); if(sp) sp.addEventListener('input',renderInventory);
  var fc=document.getElementById('filter-cat');      if(fc) fc.addEventListener('change',renderInventory);

  // Bulk import
  var bb=document.getElementById('bulk-import-btn'); if(bb) bb.addEventListener('click',openBulkModal);
  var bf=document.getElementById('bulk-file');       if(bf) bf.addEventListener('change',handleBulkFile);
  var bc=document.getElementById('bulk-confirm');    if(bc) bc.addEventListener('click',confirmBulkImport);
  var bx=document.getElementById('bulk-close');      if(bx) bx.addEventListener('click',closeBulkModal);
  var bt=document.getElementById('download-template');if(bt)bt.addEventListener('click',downloadTemplate);

  // Ajustes
  var sb=document.getElementById('save-settings-btn'); if(sb) sb.addEventListener('click',saveSettings);
  function bi(id,key,fn){var e=document.getElementById(id);if(e)e.addEventListener('input',function(){_pending[key]=fn?fn(e.value):e.value;});}
  bi('set-store-name','storeName'); bi('set-store-subtitle','storeSubtitle'); bi('set-accent','accent');
  document.querySelectorAll('.theme-btn').forEach(function(b){
    b.addEventListener('click',function(){document.querySelectorAll('.theme-btn').forEach(function(x){x.classList.remove('active');});b.classList.add('active');_pending.theme=b.dataset.theme;applySettings(_pending);});
  });
  document.querySelectorAll('.accent-btn').forEach(function(b){
    b.addEventListener('click',function(){_pending.accent=b.dataset.color;var ac=document.getElementById('set-accent');if(ac)ac.value=b.dataset.color;applySettings(_pending);});
  });
  function bl(inputId,prevId,key){var e=document.getElementById(inputId);if(!e)return;e.addEventListener('change',function(ev){var file=ev.target.files[0];if(!file)return;compressImage(file,300,0.85).then(function(c){_pending[key]=c;var p=document.getElementById(prevId);if(p){p.src=c;p.style.display='block';}});});}
  bl('logo-upload','logo-preview','logoData');
  bl('logo-mobile-upload','logo-mobile-preview','logoMobileData');

  // Export / Reset
  var ex=document.getElementById('export-data-btn');
  if(ex)ex.addEventListener('click',function(){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({products:products,movements:movements,users:users,exported:new Date().toISOString()},null,2)],{type:'application/json'}));a.download='talara_backup.json';a.click();});
  var rx=document.getElementById('reset-data-btn');
  if(rx)rx.addEventListener('click',function(){if(!confirm('¿Restablecer todo?'))return;products=[];movements=[];users=[];renderAll();showToast('Datos restablecidos');});

  // Fechas de reportes
  var rd=document.getElementById('r-date'); if(rd)rd.value=localDateStr();
  var now=new Date();
  var rm=document.getElementById('r-month');if(rm)rm.value=now.getMonth()+1;
  var ry=document.getElementById('r-year'); if(ry)ry.value=now.getFullYear();

  // Header móvil
  if(window.innerWidth<=768){var mh=document.getElementById('mobile-header');if(mh)mh.style.display='flex';}
});

// ── Init ──────────────────────────────────────────────────────────────────────
navigate('panel');

// Aplicar ajustes guardados antes de que Firebase responda
applySettings(getUserSettings('guest'));

if(typeof initFirebase==='function'){
  initFirebase({
    onData:function(col,data){
      if(col==='products')  products  = data;
      if(col==='movements') movements = data;
      if(col==='users')     users     = data;
      renderAll();
    },
    onUser:function(user){
      if(!user) return;
      activeUserId = user.uid;
      var u=users.find(function(x){return x.id===user.uid;});
      applyPrivileges(u?u.role:'Admin');
      applySettings(getUserSettings(user.uid));
      hideSplash();
    },
    onSettings:function(uid,s){
      if(uid===activeUserId) applySettings(Object.assign({},getUserSettings(uid),s));
    }
  });
} else {
  hideSplash();
}
// v20260505

// ── Fix: override modal open/close con display correcto ──────────────────────
function openMovModal(pid, type) {
  if (currentRole==='Solo lectura'){ alert('Sin permisos'); return; }
  _movPid=pid; _movType=type;
  var p=products.find(function(x){ return x.id===pid; }); if(!p) return;
  var o=document.getElementById('modal-overlay'); if(!o) return;
  function se(id,v){ var e=document.getElementById(id); if(e) e.textContent=v; }
  function sv(id,v){ var e=document.getElementById(id); if(e) e.value=v; }
  se('mov-title', type==='in'?'Registrar Entrada':'Registrar Salida');
  se('mov-product-info', p.name);
  se('mov-stock', p.stock);
  sv('mov-price', type==='out'?p.sellPrice:p.buyPrice);
  sv('mov-qty', 1);
  var q=document.getElementById('mov-qty'); if(q) q.max=type==='out'?p.stock:9999;
  o.style.display='flex';
}
function closeMovModal() {
  var o=document.getElementById('modal-overlay'); 
  if(o){ o.style.display='none'; }
}
function openBulkModal() {
  var o=document.getElementById('bulk-overlay'); 
  if(o){ o.style.display='flex'; }
}
function closeBulkModal() {
  var o=document.getElementById('bulk-overlay'); 
  if(o){ o.style.display='none'; }
  _bulkOk=[];
  var bf=document.getElementById('bulk-file'); if(bf) bf.value='';
  var bp=document.getElementById('bulk-preview'); if(bp) bp.classList.add('hidden');
}
