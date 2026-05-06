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

// ── Navegación ──
function navigate(view) {
  document.querySelectorAll('.view').forEach(function(v){ v.classList.remove('active'); });
  document.querySelectorAll('.nav-item,.bnav-item').forEach(function(n){ n.classList.remove('active'); });
  var el = document.getElementById('view-'+view);
  if (el) el.classList.add('active');
  document.querySelectorAll('[data-view="'+view+'"]').forEach(function(n){ n.classList.add('active'); });
  window.scrollTo(0,0);
  if (view==='panel') renderPanel();
  if (view==='products') renderInventory();
  if (view==='sales') initSaleView();
  if (view==='history') renderMovements();
  if (view==='reports') initReports();
  if (view==='users') renderUsers();
  if (view==='settings') loadSettingsUI();
}

// ── Ajustes Corregidos (Fix Robert) ──
function applySettings(s) {
  // SI NO HAY AJUSTES, USA LOS DE POR DEFECTO PARA QUE NO SE TRABE
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
  var sn=document.getElementById('splash-store-name'); if(sn) sn.textContent=s.storeName||'TALARA';
  document.title=(s.storeName||'TALARA')+' — Inventario';
}

function renderAll() {
  renderPanel(); renderInventory(); renderMovements(); renderUsers();
}

function hideSplash() {
  var s=document.getElementById('splash');
  if(s){s.style.opacity='0';setTimeout(function(){s.style.display='none';},420);}
  document.body.style.visibility='visible';
}

document.addEventListener('DOMContentLoaded',function(){
  document.querySelectorAll('[data-view]').forEach(function(el){
    el.addEventListener('click',function(){navigate(el.dataset.view);});
  });
  applySettings(getUserSettings('guest'));
});

navigate('panel');

if(typeof initFirebase==='function'){
  initFirebase({
    onData:function(col,data){ if(col==='products')products=data; if(col==='movements')movements=data; renderAll(); },
    onUser:function(user){ if(!user)return; activeUserId=user.uid; applySettings(getUserSettings(user.uid)); hideSplash(); }
  });
} else { hideSplash(); }