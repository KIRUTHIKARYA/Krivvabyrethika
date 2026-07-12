// =============================================
// KRIVVA — Admin Panel Module
// =============================================

// ----- STATS -----
function renderAdminStats() {
  const revenue = orders.reduce((a, b) => a + b.total, 0);
  const pending = orders.filter(o => o.status === 'placed').length;
  document.getElementById('admin-stats').innerHTML = `
    <div class="stat"><div class="stat-val">${orders.length}</div><div class="stat-label">Orders</div></div>
    <div class="stat"><div class="stat-val">₹${(revenue / 1000).toFixed(1)}k</div><div class="stat-label">Revenue</div></div>
    <div class="stat"><div class="stat-val">${products.length}</div><div class="stat-label">Products</div></div>
    <div class="stat"><div class="stat-val">${pending}</div><div class="stat-label">Pending</div></div>
    <div class="stat"><div class="stat-val">${wishlist.length}</div><div class="stat-label">Wishlists</div></div>
    <div class="stat"><div class="stat-val">${coupons.length}</div><div class="stat-label">Coupons</div></div>`;
}

// ----- CHART -----
function renderAdminChart() {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const vals   = [18, 24, 19, 32, 28, 35];
  const max    = Math.max(...vals);
  document.getElementById('admin-chart-area').innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);padding:16px;margin-bottom:12px">
      <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:16px">Monthly Revenue (₹k)</div>
      <div class="chart-bar">
        ${vals.map((v, i) => `
          <div class="bar" style="height:${(v / max * 100)}%" title="₹${v}k">
            <span class="bar-val">₹${v}k</span>
            <span class="bar-label">${months[i]}</span>
          </div>`).join('')}
      </div>
      <div style="margin-top:28px"></div>
    </div>`;
}

// ----- LOW STOCK ALERTS -----
function renderLowStock() {
  const low = products.filter(p => p.stock <= 5 && p.stock > 0);
  const oos = products.filter(p => p.stock === 0);
  let html = '';
  if (oos.length) html += `<div class="low-stock-alert">⚠️ Out of Stock: ${oos.map(p => p.name).join(', ')}</div>`;
  if (low.length) html += `<div class="low-stock-alert" style="color:orange;background:rgba(255,165,0,.08);border-color:rgba(255,165,0,.3)">⚡ Low Stock: ${low.map(p => `${p.name} (${p.stock} left)`).join(', ')}</div>`;
  document.getElementById('low-stock-area').innerHTML = html;
}

// ----- TAB SWITCHER -----
function adminTab(tab, el) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  ['orders', 'products', 'add', 'coupons', 'banner'].forEach(t =>
    document.getElementById('admin-' + t + '-tab').classList.toggle('hide', t !== tab)
  );
}

// ----- ORDERS TAB -----
function renderAdminOrders() {
  document.getElementById('admin-orders-tab').innerHTML =
    `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-size:11px;color:var(--muted)">${orders.length} total orders</div>
      <button class="btn-outline btn-sm" onclick="exportOrders()">Export CSV</button>
    </div>` +
    orders.map(o => `
    <div class="edit-card">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:8px">
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--white)">${o.id} — ${o.name}</div>
          <div style="font-size:10px;color:var(--muted)">${o.phone} • ${o.addr}, ${o.city} ${o.pin}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:2px">
            ${o.items.map(i => i.name + (i.size ? ' (' + i.size + ')' : '') + (i.qty > 1 ? ' ×' + i.qty : '')).join(', ')}
          </div>
        </div>
        <div style="font-family:'Cormorant Garamond',serif;color:var(--gold)">₹${o.total.toLocaleString()}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <select style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:6px 9px;font-family:'Jost',sans-serif;font-size:11px;outline:none" id="st-${o.id}">
          ${['placed', 'packed', 'dispatched', 'delivered'].map(s =>
            `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <button class="btn-gold btn-sm" onclick="updateStatus('${o.id}')">Update</button>
        <button class="btn-outline btn-sm" onclick="notifyWhatsApp('${o.id}')">📱 Notify</button>
        <button class="btn-outline btn-sm" onclick="viewInvoice('${o.id}')">🧾 Invoice</button>
        <span class="status-badge status-${o.status}" id="sbadge-${o.id}">${o.status}</span>
      </div>
    </div>`).join('');
}

function updateStatus(id) {
  const o = orders.find(x => x.id === id); if (!o) return;
  o.status = document.getElementById('st-' + id).value;
  document.getElementById('sbadge-' + id).className = 'status-badge status-' + o.status;
  document.getElementById('sbadge-' + id).textContent = o.status;
  saveOrders();
  renderAdminStats();
  showToast('Order ' + id + ' → ' + o.status, 'green');
}

function notifyWhatsApp(id) {
  const o = orders.find(x => x.id === id); if (!o) return;
  
  const subtotal = o.subtotal || o.items.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const discount = o.discount || 0;
  const shipping = o.shipping !== undefined ? o.shipping : (o.total >= 999 ? 0 : 99);
  const cgst = o.cgst || 0;
  const sgst = o.sgst || 0;
  const invId = getInvoiceId(o.id);

  // Generate self-contained invoice URL
  const orderData = {
    id: o.id, name: o.name, phone: o.phone, email: o.email,
    addr: o.addr, city: o.city, pin: o.pin, items: o.items,
    total: o.total, date: o.date, status: o.status,
    subtotal, discount, shipping, cgst, sgst
  };
  const dataStr = btoa(unescape(encodeURIComponent(JSON.stringify(orderData))));
  const invoiceUrl = `${window.location.origin}/invoice.html?data=${dataStr}`;

  // Format order items
  const itemsText = o.items.map(i => {
    const sizeStr = i.size ? ` (Size: ${i.size})` : '';
    const itemTotal = i.price * i.qty;
    return `• ${i.name}${sizeStr} × ${i.qty}\n ₹${itemTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }).join('\n\n');

  // Format numbers
  const subtotalStr = subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const shippingStr = shipping.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cgstStr = cgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sgstStr = sgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const totalStr = o.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // WhatsApp formatted template
  const msg = `✨ KRIVVA BY RETHIKA ✨

━━━━━━━━━━━━━━━━━━

🧾 Invoice: ${invId}
🌸 Customer: ${o.name}

🛍️ Order Details

${itemsText}

━━━━━━━━━━━━━━━━━━

💳 Billing Summary

• Subtotal …….. ₹${subtotalStr}
• Shipping …… ₹${shippingStr}
• CGST …………. ₹${cgstStr}
• SGST …………. ₹${sgstStr}

💖 Amount Paid: ₹${totalStr}

━━━━━━━━━━━━━━━━━━

📄 Download Invoice (PDF)
${invoiceUrl}

━━━━━━━━━━━━━━━━━━

🌷 Thank you for choosing KRIVVA BY RETHIKA.

Your support means the world to us. We hope you love your purchase and look forward to styling you again soon. ✨💕

With love,
Team KRIVVA BY RETHIKA 🤍`;

  window.open(`https://wa.me/91${o.phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

function exportOrders() {
  const rows = [
    ['Order ID', 'Name', 'Phone', 'Items', 'Total', 'Status', 'Date'],
    ...orders.map(o => [o.id, o.name, o.phone, o.items.map(i => i.name).join(';'), o.total, o.status, o.date]),
  ];
  const csv = rows.map(r => r.join(',')).join('\n');
  const a   = document.createElement('a');
  a.href = 'data:text/csv,' + encodeURIComponent(csv);
  a.download = 'krivva_orders.csv';
  a.click();
  showToast('Orders exported!', 'green');
}

// ----- EDIT PRODUCTS TAB -----
function renderAdminEditProducts() {
  document.getElementById('admin-products-tab').innerHTML =
    `<div class="insta-note">📸 Upload photos from device or paste image URLs. Edit all details and click Save.</div>` +
    products.map(p => `
    <div class="edit-card">
      <div style="display:flex;gap:10px;margin-bottom:12px;align-items:flex-start">
        <div style="width:56px;height:56px;background:var(--surface2);flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:24px" id="thumb-${p.id}">
          ${getPhoto(p) ? `<img src="${getPhoto(p)}" style="width:100%;height:100%;object-fit:cover"/>` : p.icon}
        </div>
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--white)">${p.name}</div>
          <div style="font-size:10px;color:var(--muted)">${p.cat} • Stock: ${p.stock} • ID: ${p.id}</div>
        </div>
      </div>
      <div class="form-group"><label>Product Name</label><input type="text" id="ep-name-${p.id}" value="${p.name}"/></div>
      <div class="form-group"><label>Description</label><textarea id="ep-desc-${p.id}" rows="2">${p.desc}</textarea></div>
      <div class="form-group">
        <label>Photo URL</label>
        <input type="text" id="ep-url-${p.id}" value="${p.photo}" placeholder="https://..." oninput="previewURL(${p.id})"/>
        <div class="url-hint">Paste Instagram or Google image link</div>
      </div>
      <div class="photo-upload-area" onclick="document.getElementById('ep-file-${p.id}').click()">
        <input type="file" id="ep-file-${p.id}" accept="image/*" onchange="handleFileUpload(event,${p.id})" style="display:none"/>
        <div style="font-size:11px;color:var(--muted)">📁 Upload from device</div>
        <img id="ep-preview-${p.id}" class="photo-preview-img" src="" alt=""/>
      </div>
      <div class="edit-row3" style="margin-top:10px">
        <div class="form-group"><label>MRP (₹)</label><input type="number" id="ep-mrp-${p.id}" value="${p.mrp}" oninput="computeOffer(${p.id})"/></div>
        <div class="form-group"><label>Offer %</label><input type="number" id="ep-offer-${p.id}" value="${p.offer}" min="0" max="90" oninput="computeOffer(${p.id})"/></div>
        <div class="form-group"><label>Final Price</label><div class="computed-price" id="ep-computed-${p.id}">₹${ep(p).toLocaleString()}</div></div>
      </div>
      <div class="edit-row2">
        <div class="form-group"><label>Category</label>
          <select id="ep-cat-${p.id}">${['kurti','dress','coord','ethnic','casual','winter'].map(c =>
            `<option value="${c}" ${p.cat === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>Stock Qty</label><input type="number" id="ep-stock-${p.id}" value="${p.stock}" min="0"/></div>
      </div>
      <div class="form-group"><label>Sizes (comma separated)</label><input type="text" id="ep-sizes-${p.id}" value="${p.sizes?.join(',') || 'S,M,L,XL'}"/></div>
      <div class="toggle-row">
        <div class="toggle-item"><input type="checkbox" id="ep-new-${p.id}" ${p.isNew ? 'checked' : ''}/><label for="ep-new-${p.id}">🆕 New Arrival</label></div>
        <div class="toggle-item"><input type="checkbox" id="ep-trend-${p.id}" ${p.isTrending ? 'checked' : ''}/><label for="ep-trend-${p.id}">🔥 Trending</label></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-gold btn-sm" onclick="saveProduct(${p.id})">Save Changes</button>
        <button class="btn-red btn-sm" onclick="deleteProduct(${p.id})">Remove</button>
      </div>
    </div>`).join('');
}

function computeOffer(id) {
  const mrp   = parseFloat(document.getElementById('ep-mrp-' + id)?.value) || 0;
  const offer = parseFloat(document.getElementById('ep-offer-' + id)?.value) || 0;
  const final = offer > 0 ? Math.round(mrp * (1 - offer / 100)) : mrp;
  const el    = document.getElementById('ep-computed-' + id);
  if (el) el.textContent = '₹' + final.toLocaleString() + (offer > 0 ? ` (${offer}% off)` : '');
}

function previewURL(id) {
  const url   = document.getElementById('ep-url-' + id)?.value.trim();
  if (!url) return;
  const thumb = document.getElementById('thumb-' + id);
  if (thumb) thumb.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'"/>`;
}

function handleFileUpload(e, id) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const data = ev.target.result;
    photoStore[id] = data;
    const thumb = document.getElementById('thumb-' + id);
    if (thumb) thumb.innerHTML = `<img src="${data}" style="width:100%;height:100%;object-fit:cover"/>`;
    const prev = document.getElementById('ep-preview-' + id);
    if (prev) { prev.src = data; prev.style.display = 'block'; }
    showToast('Photo uploaded!', 'green');
  };
  reader.readAsDataURL(file);
}

function saveProduct(id) {
  const p = products.find(x => x.id === id); if (!p) return;
  p.name       = document.getElementById('ep-name-' + id)?.value.trim()  || p.name;
  p.desc       = document.getElementById('ep-desc-' + id)?.value.trim()  || p.desc;
  p.photo      = document.getElementById('ep-url-' + id)?.value.trim()   || p.photo;
  p.mrp        = parseFloat(document.getElementById('ep-mrp-' + id)?.value)   || p.mrp;
  p.offer      = parseFloat(document.getElementById('ep-offer-' + id)?.value) || 0;
  p.price      = ep(p);
  p.cat        = document.getElementById('ep-cat-' + id)?.value   || p.cat;
  p.stock      = parseInt(document.getElementById('ep-stock-' + id)?.value) || 0;
  const sv     = document.getElementById('ep-sizes-' + id)?.value;
  if (sv) p.sizes = sv.split(',').map(s => s.trim()).filter(Boolean);
  p.isNew      = document.getElementById('ep-new-' + id)?.checked  || false;
  p.isTrending = document.getElementById('ep-trend-' + id)?.checked || false;
  if (photoStore[id]) p.photo = photoStore[id];
  renderProducts(); renderAdminStats(); renderLowStock();
  showToast(p.name + ' saved ✓', 'green');
}

function deleteProduct(id) {
  products = products.filter(p => p.id !== id);
  renderProducts(); renderAdminStats(); renderAdminEditProducts(); renderLowStock();
  showToast('Product removed', 'red');
}

// ----- ADD PRODUCT TAB -----
function renderAdminAddProduct() {
  document.getElementById('admin-add-tab').innerHTML = `
    <div class="edit-card">
      <div class="section-title" style="margin-bottom:14px">Add New Product</div>
      <div class="form-group"><label>Product Name</label><input type="text" id="np-name" placeholder="e.g. Silk Kurti Set"/></div>
      <div class="form-group"><label>Description</label><textarea id="np-desc" rows="2" placeholder="Describe the product..."></textarea></div>
      <div class="form-group">
        <label>Photo URL</label>
        <input type="text" id="np-url" placeholder="https://..."/>
        <div class="url-hint">Or upload from device below</div>
      </div>
      <div class="photo-upload-area" onclick="document.getElementById('np-file').click()">
        <input type="file" id="np-file" accept="image/*" onchange="handleNewFileUpload(event)" style="display:none"/>
        <div style="font-size:11px;color:var(--muted)">📁 Upload product photo</div>
        <img id="np-preview" class="photo-preview-img" src="" alt=""/>
      </div>
      <div class="edit-row2" style="margin-top:10px">
        <div class="form-group"><label>MRP (₹)</label><input type="number" id="np-mrp" placeholder="1999" oninput="computeNewOffer()"/></div>
        <div class="form-group"><label>Offer %</label><input type="number" id="np-offer" placeholder="0" min="0" max="90" oninput="computeNewOffer()"/></div>
      </div>
      <div class="computed-price" id="np-computed" style="margin-bottom:10px"></div>
      <div class="edit-row2">
        <div class="form-group"><label>Category</label>
          <select id="np-cat">${['kurti','dress','coord','ethnic','casual','winter'].map(c => `<option>${c}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>Stock Qty</label><input type="number" id="np-stock" placeholder="10" min="0"/></div>
      </div>
      <div class="form-group"><label>Sizes (comma separated)</label><input type="text" id="np-sizes" placeholder="S,M,L,XL"/></div>
      <div class="form-group"><label>Icon (emoji)</label><input type="text" id="np-icon" placeholder="👗" style="width:80px"/></div>
      <div class="toggle-row">
        <div class="toggle-item"><input type="checkbox" id="np-new"/><label for="np-new">🆕 New Arrival</label></div>
        <div class="toggle-item"><input type="checkbox" id="np-trend"/><label for="np-trend">🔥 Trending</label></div>
      </div>
      <button class="btn-gold" onclick="addNewProduct()" style="width:100%;margin-top:4px">Add Product</button>
    </div>`;
}

function handleNewFileUpload(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    newPhotoData = ev.target.result;
    const prev  = document.getElementById('np-preview');
    if (prev) { prev.src = newPhotoData; prev.style.display = 'block'; }
    showToast('Photo ready!', 'green');
  };
  reader.readAsDataURL(file);
}

function computeNewOffer() {
  const mrp   = parseFloat(document.getElementById('np-mrp')?.value) || 0;
  const offer = parseFloat(document.getElementById('np-offer')?.value) || 0;
  const final = offer > 0 ? Math.round(mrp * (1 - offer / 100)) : mrp;
  const el    = document.getElementById('np-computed');
  if (el && mrp) el.textContent = 'Final: ₹' + final.toLocaleString() + (offer > 0 ? ` (${offer}% off)` : '');
}

function addNewProduct() {
  const name = document.getElementById('np-name')?.value.trim();
  const mrp  = parseFloat(document.getElementById('np-mrp')?.value);
  if (!name || !mrp) { showToast('Name and MRP are required', 'red'); return; }
  const offer    = parseFloat(document.getElementById('np-offer')?.value) || 0;
  const photo    = newPhotoData || document.getElementById('np-url')?.value.trim() || '';
  const sizesVal = document.getElementById('np-sizes')?.value || 'S,M,L,XL';
  const id       = Date.now();
  const p = {
    id, name,
    desc:       document.getElementById('np-desc')?.value.trim() || name,
    photo,
    icon:       document.getElementById('np-icon')?.value.trim() || '👗',
    cat:        document.getElementById('np-cat')?.value || 'kurti',
    mrp, offer,
    price:      offer > 0 ? Math.round(mrp * (1 - offer / 100)) : mrp,
    stock:      parseInt(document.getElementById('np-stock')?.value) || 10,
    sizes:      sizesVal.split(',').map(s => s.trim()).filter(Boolean),
    isNew:      document.getElementById('np-new')?.checked  || false,
    isTrending: document.getElementById('np-trend')?.checked || false,
    reviews:    [],
  };
  if (photo) photoStore[id] = photo;
  products.unshift(p);
  renderProducts(); renderAdminStats(); renderAdminEditProducts(); renderLowStock();
  newPhotoData = ''; renderAdminAddProduct();
  showToast(name + ' added ✓', 'green');
}

// ----- COUPONS TAB -----
function renderAdminCoupons() {
  document.getElementById('admin-coupons-tab').innerHTML = `
    <div style="margin-bottom:14px">
      <div style="font-size:11px;color:var(--muted);margin-bottom:10px">Active Coupons</div>
      ${coupons.map(c => `
        <div class="coupon-admin-card">
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--gold);letter-spacing:2px">${c.code}</div>
            <div style="font-size:11px;color:var(--muted)">${c.type === 'percent' ? c.discount + '% off' : 'Flat ₹' + c.discount + ' off'}</div>
          </div>
          <button class="btn-red btn-sm" onclick="deleteCoupon('${c.code}')">Remove</button>
        </div>`).join('')}
    </div>
    <div class="edit-card">
      <div style="font-size:12px;font-weight:600;color:var(--white);margin-bottom:12px">Add New Coupon</div>
      <div class="form-group"><label>Coupon Code</label><input type="text" id="nc-code" placeholder="e.g. SAVE20" style="text-transform:uppercase"/></div>
      <div class="edit-row2">
        <div class="form-group"><label>Discount</label><input type="number" id="nc-val" placeholder="10"/></div>
        <div class="form-group"><label>Type</label>
          <select id="nc-type">
            <option value="percent">Percent %</option>
            <option value="flat">Flat ₹</option>
          </select>
        </div>
      </div>
      <button class="btn-gold" onclick="addCoupon()" style="width:100%">Add Coupon</button>
    </div>`;
}

function deleteCoupon(code) {
  coupons = coupons.filter(c => c.code !== code);
  renderAdminCoupons();
  showToast('Coupon removed', 'red');
}

function addCoupon() {
  const code = document.getElementById('nc-code').value.trim().toUpperCase();
  const val  = parseFloat(document.getElementById('nc-val').value);
  if (!code || !val) { showToast('Fill all fields', 'red'); return; }
  coupons.push({ code, discount: val, type: document.getElementById('nc-type').value });
  renderAdminCoupons();
  showToast('Coupon ' + code + ' added ✓', 'green');
}

// ----- BANNER TAB -----
function renderAdminBanner() {
  document.getElementById('admin-banner-tab').innerHTML = `
    <div class="edit-card">
      <div style="font-size:12px;font-weight:600;color:var(--white);margin-bottom:12px">Announcement Banner</div>
      <div class="form-group">
        <label>Banner Text</label>
        <input type="text" id="banner-text" value="FREE SHIPPING ON ORDERS ABOVE ₹999 ✦ USE CODE KRIVVA10 FOR 10% OFF ✦ NEW COLLECTION JUST DROPPED"/>
      </div>
      <button class="btn-gold" onclick="updateBanner()" style="width:100%">Update Banner</button>
    </div>`;
}

function updateBanner() {
  const text = document.getElementById('banner-text').value.trim();
  if (!text) return;
  document.querySelector('.announce-bar .marquee').textContent = '✦ ' + text + ' ✦ ' + text;
  showToast('Banner updated ✓', 'green');
}
