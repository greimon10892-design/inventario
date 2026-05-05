let products = [];
window.navigate = (v) => {
    document.querySelectorAll('.view').forEach(s => s.classList.remove('active'));
    document.getElementById('view-' + v).classList.add('active');
};
function render() {
    document.getElementById('stat-products').textContent = products.length;
    document.getElementById('inventory-body').innerHTML = products.map(p => `
        <div style="padding:15px; border-bottom:1px solid #2e2e2e;">
            <strong>${p.name}</strong> - Stock: ${p.stock} - $${p.sellPrice}
        </div>
    `).join('') || 'Sin productos';
}
initFirebase({
    onData: (col, data) => { products = data; render(); },
    onUser: () => { document.getElementById('splash').style.display = 'none'; }
});