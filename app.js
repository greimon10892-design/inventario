let products = [];
let movements = [];
let users = [];
let activeUser = null;
let currentRole = 'Admin';
let _saleCart = {};
let _editId = null;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = (n) => '$' + Number(n || 0).toLocaleString('es-MX', {minimumFractionDigits: 2});
const fmtDate = (iso) => new Date(iso).toLocaleDateString('es-MX', {day: '2-digit', month: 'short'});

function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.style.transform = 'translateY(0)';
    setTimeout(() => { t.style.transform = 'translateY(100px)'; }, 3000);
}

initFirebase({
    onData: (col, data) => {
        if (col === 'products') products = data;
        if (col === 'movements') movements = data;
        if (col === 'users') users = data;
        renderAll();
    },
    onUser: (user) => {
        activeUser = user;
        const splash = document.getElementById('splash');
        if (splash) splash.style.opacity = '0';
        setTimeout(() => { if(splash) splash.remove(); }, 600);
    }
});

function renderAll() {
    const activeSection = document.querySelector('.view.active');
    if (!activeSection) return;
    const activeView = activeSection.id.replace('view-', '');
    if (activeView === 'panel') renderPanel();
    if (activeView === 'productos') renderInventory();
    if (activeView === 'ventas') renderSaleView();
    if (activeView === 'movimientos') renderMovements();
}

function navigate(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const el = document.getElementById('view-' + view);
    if (el) el.classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(n => {
        if (n.textContent.toLowerCase().includes(view.replace('agregar','nuevo').toLowerCase())) {
            n.classList.add('active');
        }
    });

    if (view === 'panel') renderPanel();
    if (view === 'productos') renderInventory();
    if (view === 'ventas') renderSaleView();
    if (view === 'movimientos') renderMovements();
    if (view === 'agregar') resetForm();
}

function renderPanel() {
    const inv = products.reduce((s, p) => s + (p.buyPrice * p.stock), 0);
    const gain = products.reduce((s, p) => s + ((p.sellPrice - p.buyPrice) * p.stock), 0);
    const sold = movements.filter(m => m.type === 'out').reduce((s, m) => s + (m.price * m.qty), 0);

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('stat-products', products.length);
    set('stat-investment', fmt(inv));
    set('stat-gain', fmt(gain));
    set('stat-sold', fmt(sold));

    const low = products.filter(p => p.stock <= 3).sort((a,b) => a.stock - b.stock);
    const lowEl = document.getElementById('low-stock-list');
    if (lowEl) {
        if (!low.length) {
            lowEl.innerHTML = '<p style="color:var(--muted); padding:10px;">Stock completo.</p>';
        } else {
            lowEl.innerHTML = low.map(p => `
                <div style="display:flex; justify-content:space-between; padding:8px 10px; background:#252525; border-radius:8px; margin-bottom:5px;">
                    <span>${p.name}</span>
                    <span style="color:var(--danger); font-weight:600;">${p.stock} uds</span>
                </div>
            `).join('');
        }
    }
}

function renderInventory() {
    const search = (document.getElementById('search-products') || {}).value || '';
    const cat = (document.getElementById('filter-cat') || {}).value || '';
    const tbody = document.getElementById('inventory-body');
    if (!tbody) return;
    
    const list = products.filter(p => 
        p.name.toLowerCase().includes(search.toLowerCase()) && (!cat || p.category === cat)
    );

    tbody.innerHTML = list.map(p => `
        <tr>
            <td style="font-size:20px">${p.category === 'dulce' ? '🍬' : '📿'}</td>
            <td><strong>${p.name}</strong></td>
            <td style="color:var(--muted)">${p.category}</td>
            <td><span style="background:#333; padding:4px 10px; border-radius:15px; font-weight:600;">${p.stock}</span></td>
            <td>${fmt(p.buyPrice)}</td>
            <td>${fmt(p.sellPrice)}</td>
            <td>
                <button onclick="editProduct('${p.id}')" style="background:none; border:none; cursor:pointer;">✏️</button>
                <button onclick="deleteProduct('${p.id}')" style="background:none; border:none; cursor:pointer;">🗑️</button>
            </td>
        </tr>
    `).join('');
}

window.handleProductSubmit = (e) => {
    e.preventDefault();
    const item = {
        id: _editId || uid(),
        name: document.getElementById('f-name').value,
        category: document.getElementById('f-category').value,
        stock: parseInt(document.getElementById('f-stock').value) || 0,
        buyPrice: parseFloat(document.getElementById('f-buy').value) || 0,
        sellPrice: parseFloat(document.getElementById('f-sell').value) || 0,
        description: document.getElementById('f-desc').value,
        updatedAt: new Date().toISOString()
    };
    fbSaveItem('products', item);
    showToast(_editId ? "Actualizado" : "Guardado");
    navigate('productos');
};

function resetForm() {
    _editId = null;
    const form = document.getElementById('product-form');
    if (form) form.reset();
    document.getElementById('form-title').textContent = "Nuevo Producto";
    document.getElementById('form-btn').textContent = "Guardar Producto";
}

function editProduct(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    navigate('agregar');
    _editId = id;
    document.getElementById('f-name').value = p.name;
    document.getElementById('f-category').value = p.category;
    document.getElementById('f-stock').value = p.stock;
    document.getElementById('f-buy').value = p.buyPrice;
    document.getElementById('f-sell').value = p.sellPrice;
    document.getElementById('f-desc').value = p.description || '';
    document.getElementById('form-title').textContent = "Editar Producto";
    document.getElementById('form-btn').textContent = "Actualizar Cambios";
}

function deleteProduct(id) {
    if (confirm("¿Borrar producto?")) {
        fbDeleteItem('products', id);
        showToast("Eliminado");
    }
}

function renderSaleView() {
    const list = document.getElementById('sale-product-list');
    if (!list) return;
    const available = products.filter(p => p.stock > 0);
    list.innerHTML = available.map(p => `
        <div class="stat-card" style="padding:15px; text-align:center; cursor:pointer;" onclick="addToCart('${p.id}')">
            <div style="font-size:30px; margin-bottom:10px;">${p.category === 'dulce' ? '🍬' : '📿'}</div>
            <div style="font-weight:600; font-size:13px;">${p.name}</div>
            <div style="color:var(--orange); font-weight:700; margin-top:5px;">${fmt(p.sellPrice)}</div>
            <div style="font-size:11px; color:var(--muted);">Stock: ${p.stock}</div>
        </div>
    `).join('');
    renderCart();
}

window.addToCart = (id) => {
    const p = products.find(x => x.id === id);
    if (_saleCart[id]) {
        if (_saleCart[id] < p.stock) _saleCart[id]++;
    } else {
        _saleCart[id] = 1;
    }
    renderCart();
};

function renderCart() {
    const itemsEl = document.getElementById('cart-items');
    if (!itemsEl) return;
    const ids = Object.keys(_saleCart);
    if (!ids.length) {
        itemsEl.innerHTML = '<p style="color:var(--muted); text-align:center;">Vacio</p>';
        document.getElementById('cart-total').textContent = "$0.00";
        return;
    }

    let total = 0;
    itemsEl.innerHTML = ids.map(id => {
        const p = products.find(x => x.id === id);
        const sub = p.sellPrice * _saleCart[id];
        total += sub;
        return `<div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:14px;"><span>${p.name} x${_saleCart[id]}</span><span>${fmt(sub)}</span></div>`;
    }).join('');
    document.getElementById('cart-total').textContent = fmt(total);
}

window.confirmSale = () => {
    const ids = Object.keys(_saleCart);
    if (!ids.length) return;
    
    ids.forEach(id => {
        const p = products.find(x => x.id === id);
        const qty = _saleCart[id];
        fbSaveItem('products', { ...p, stock: p.stock - qty });
        fbSaveItem('movements', {
            id: uid(), productId: id, productName: p.name,
            type: 'out', qty: qty, price: p.sellPrice,
            profit: (p.sellPrice - p.buyPrice) * qty,
            date: new Date().toISOString()
        });
    });

    _saleCart = {};
    showToast("¡Vendido!");
    renderSaleView();
};

function renderMovements() {
    const tbody = document.getElementById('movements-body');
    if (!tbody) return;
    const list = movements.sort((a,b) => new Date(b.date) - new Date(a.date));
    tbody.innerHTML = list.slice(0, 50).map(m => `
        <tr>
            <td>${fmtDate(m.date)}</td>
            <td>${m.productName}</td>
            <td><span style="color:${m.type === 'in' ? 'var(--success)' : 'var(--orange)'}">${m.type === 'in' ? 'Entrada' : 'Salida'}</span></td>
            <td>${m.qty}</td>
            <td>${fmt(m.price)}</td>
            <td style="color:var(--success)">${m.profit ? fmt(m.profit) : '-'}</td>
        </tr>
    `).join('');
}
