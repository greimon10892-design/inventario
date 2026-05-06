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
  var arr = col==='products' ? products : col==='movements' ? movements : users;
  var i = arr.findIndex(function(x){ return x.id===item.id; });
  if (i>=0) arr[i]=item; else arr.push(item);
  renderAll();
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
  var sol = movements.filter(function(m){ return m.type==='out'; }).reduce(function(s,m){ return s+m.price*m.qty; },0);
  function se(id,v){ var e=document.getElementById(id); if(e) e.textContent=v; }
  se('stat-products', tp); se('stat-investment', fmt(inv)); se('stat-gain', fmt(pot)); se('stat-sold', fmt(sol));
  var ll = document.getElementById('low-stock-list');
  if (ll) {
    var low = products.filter(function(p){ return p.stock<=3; }).sort(function(a,b){ return a.stock-b.stock; });
    ll.innerHTML = !low.length ? '<p style="padding:12px 16px;color:var(--muted)">Sin productos con bajo stock</p>' : low.map(function(p){ return '<div class="low-item"><span>'+p.name+'</span><span class="badge '+(p.stock===0?'badge-danger':'badge-warn')+'">'+p.stock+' uds</span></div>'; }).join('');
  }
}

// ── Inventario ────────────────────────────────────────────────────────────────
function renderInventory() {
  var search = (document.getElementById('search-products')||{}).value||'';
  var cat    = (document.getElementById('filter-cat')||{}).value||'';
  var tbody  = document.getElementById('inventory-body');
  if (!tbody) return;
  var list = products.filter(function(p){ return p.name.toLowerCase().includes(search.toLowerCase()) && (!cat||p.category===cat); });
  if (!list.length) { tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--muted)">Sin productos. Usa <strong>Nuevo Producto</strong> para agregar.</td></tr>'; return; }
  var isAdmin = currentRole==='Admin'; var canW = currentRole!=='Solo lectura';
  tbody.innerHTML = list.map(function(p){
    var img = p.img ? '<img src="'+p.img+'" style="width:38px;height:38px;border-radius:6px;object-fit:cover">' : '<span style="font-size:22px">'+(p.category==='dulces'?'🍬':'📿')+'</span>';
    return '<tr><td>'+img+'</td><td><strong>'+p.name+'</strong>'+(p.description?'<br><small style="color:var(--muted)">'+p.description+'</small>':'')+'</td><td><span class="badge">'+p.category+'</span></td><td style="color:'+(p.stock<=3?'#e74c3c':'inherit')+'"><strong>'+p.stock+'</strong></td><td>'+fmt(p.buyPrice)+'</td><td>'+fmt(p.sellPrice)+'</td><td class="admin-only">'+fmt((p.sellPrice-p.buyPrice).toFixed(2))+'</td><td style="white-space:nowrap"><button class="btn-action btn-in" onclick="openMovModal(\''+p.id+'\',\'in\')">↓</button><button class="btn-action btn-out" onclick="openMovModal(\''+p.id+'\',\'out\')">↑</button>'+(canW?'<button class="btn-action btn-edit" onclick="editProduct(\''+p.id+'\')">✎</button>':'')+(isAdmin?'<button class="btn-action btn-delete" onclick="deleteProduct(\''+p.id+'\')">✕</button>':'')+'</td></tr>';
  }).join('');
}

function showProductForm() { if (currentRole==='Solo lectura'){ alert('Sin permisos'); return; } navigate('new-product'); resetForm(); }
function resetForm() {
  _editId=_img1=_img2=_img3=null;
  var f=document.getElementById('product-form'); if(f) f.reset();
  ['img-preview','img2-preview','img3-preview'].forEach(function(id){ var e=document.getElementById(id); if(e){e.src='';e.style.display='none';} });
  var t=document.getElementById('form-title'); if(t) t.textContent='Nuevo Producto';
  var b=document.getElementById('form-btn'); if(b) b.textContent='Guardar Producto';
}
function editProduct(pid) {
  if (currentRole==='Solo lectura'){ alert('Sin permisos'); return; }
  var p=products.find(function(x){ return x.id===pid; }); if(!p) return;
  navigate('new-product'); _editId=pid; _img1=p.img||null; _img2=p.img2||null; _img3=p.img3||null;
  function sv(id,v){ var e=document.getElementById(id); if(e) e.value=v||''; }
  sv('f-name',p.name); sv('f-category',p.category); sv('f-stock',p.stock); sv('f-buy',p.buyPrice); sv('f-sell',p.sellPrice); sv('f-desc',p.description||'');
  [['img-preview',p.img],['img2-preview',p.img2],['img3-preview',p.img3]].forEach(function(x){ var e=document.getElementById(x[0]); if(e&&x[1]){e.src=x[1];e.style.display='block';} });
  var t=document.getElementById('form-title'); if(t) t.textContent='Editar Producto';
  var b=document.getElementById('form-btn'); if(b) b.textContent='Actualizar Producto';
}
function deleteProduct(pid) { if (currentRole!=='Admin'){ alert('Solo Admin puede eliminar'); return; } if (!confirm('¿Eliminar?')) return; deleteItem('products', pid); showToast('Producto eliminado'); }
function compressImage(file, maxPx, q) {
  maxPx=maxPx||480; q=q||0.65;
  return new Promise(function(resolve){
    var r=new FileReader(); r.onload=function(ev){
      var img=new Image(); img.onload=function(){
        var c=document.createElement('canvas'),w=img.width,h=img.height;
        if(w>maxPx||h>maxPx){ if(w>h){h=Math.round(h*maxPx/w);w=maxPx;}else{w=Math.round(w*maxPx/h);h=maxPx;} }
        c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h); resolve(c.toDataURL('image/jpeg',q));
      }; img.src=ev.target.result;
    }; r.readAsDataURL(file);
  });
}

// ── Vistas y Ajustes Corregidos ──
function applySettings(s) {
  // REPARACIÓN ROBERT: Evitar el error de "undefined" que bloquea los botones
  s = s || DEFAULTS; 
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
  se('sidebar-store-name',s.storeName); se('sidebar-store-subtitle',s.storeSubtitle); se('mobile-store-name',s.storeName);
  var sl=document.getElementById('sidebar-logo'); if(sl&&s.logoData){sl.src=s.logoData;sl.style.display='block';}
  var ml=document.getElementById('mobile-logo'); if(ml&&(s.logoMobileData||s.logoData)){ml.src=s.logoMobileData||s.logoData;ml.style.display='block';}
  var sn=document.getElementById('splash-store-name'); if(sn) sn.textContent=s.storeName||'TALARA';
  document.title=(s.storeName||'TALARA')+' — Inventario';
}

function loadSettingsUI() {
  var s=getUserSettings(activeUserId); _pending=Object.assign({},s);
  function sv(id,v){var e=document.getElementById(id);if(e)e.value=v||'';}
  sv('set-store-name',s.storeName); sv('set-store-subtitle',s.storeSubtitle); sv('set-accent',s.accent||'#e07b39');
  document.querySelectorAll('.theme-btn').forEach(function(b){b.classList.toggle('active',b.dataset.theme===s.theme);});
}

function saveSettings() { saveUserSettings(activeUserId,_pending); applySettings(_pending); showToast('✓ Guardado'); }

// ── Operaciones y Otros ────────────────────────────────────────────────────────
function initSaleView() { _cart={}; renderSaleList(); renderCart(); }
function renderSaleList() {
  var el=document.getElementById('sale-product-list'); if(!el) return;
  el.innerHTML=products.filter(function(p){return p.stock>0;}).map(function(p){
    return '<div class="stat-card" style="cursor:pointer" onclick="chgQ(\''+p.id+'\',1)"><b>'+p.name+'</b><br>Stock: '+p.stock+'<br>'+fmt(p.sellPrice)+'</div>';
  }).join('');
}
function chgQ(pid,d){ _cart[pid]=(_cart[pid]||0)+d; renderCart(); }
function renderCart() { var ce=document.getElementById('cart-items'); if(ce) ce.innerHTML=Object.entries(_cart).map(function(e){ return '<div>'+e[0]+' x'+e[1]+'</div>'; }).join(''); }
function confirmSale() { alert('Venta procesada'); _cart={}; renderCart(); }

function initReports() { var rd=document.getElementById('r-date'); if(rd&&!rd.value) rd.value=localDateStr(); }
function generateDailyReport() { alert('Generando reporte...'); }
function generateMonthlyReport() { alert('Generando reporte...'); }

function renderUsers() { var l=document.getElementById('users-list'); if(l) l.innerHTML='Usuarios cargando...'; }
function applyPrivileges(role) { currentRole=role; }

function openBulkModal(){ document.getElementById('bulk-overlay').style.display='flex'; }
function closeBulkModal(){ document.getElementById('bulk-overlay').style.display='none'; }

function renderAll() { renderPanel(); renderInventory(); }
function hideSplash() { var s=document.getElementById('splash'); if(s) s.style.opacity='0'; setTimeout(function(){if(s)s.style.display='none';},400); document.body.style.visibility='visible'; }

document.addEventListener('DOMContentLoaded',function(){
  document.querySelectorAll('[data-view]').forEach(function(el){ el.addEventListener('click',function(){navigate(el.dataset.view);}); });
  var sb=document.getElementById('save-settings-btn'); if(sb) sb.addEventListener('click',saveSettings);
  applySettings(getUserSettings('guest'));
});

navigate('panel');

if(typeof initFirebase==='function'){
  initFirebase({
    onData:function(col,data){ if(col==='products') products=data; if(col==='movements') movements=data; renderAll(); },
    onUser:function(user){ if(!user) return; activeUserId=user.uid; applySettings(getUserSettings(user.uid)); hideSplash(); }
  });
} else { hideSplash(); }