// =============================================
// KRIVVA — Core App Logic
// Navigation, Products, Cart, Wishlist, Orders, Reviews
// =============================================

// ===== CURSOR =====
const cursor = document.getElementById('cursor');
const ring   = document.getElementById('cursor-ring');

// ===== SUPABASE READS/WRITES & REALTIME SUBSCRIPTION =====
let activeDetailProductId = null;

async function loadProductsFromSupabase() {
  if (!supabaseClient) {
    console.warn("Supabase client is not initialized yet.");
    return;
  }
  try {
    const { data, error } = await supabaseClient
      .from('products')
      .select(`
        *,
        variants (
          id,
          size,
          color,
          sku,
          stock (
            quantity
          )
        )
      `)
      .eq('is_active', true);

    if (error) throw error;

    products = (data || []).map(p => {
      const rawVariants = p.variants || [];
      const sizes = rawVariants.map(v => v.size);
      const totalStock = rawVariants.reduce((sum, v) => sum + (v.stock?.quantity || 0), 0);
      return {
        id: p.id,
        name: p.name,
        cat: p.category || 'Other',
        mrp: Number(p.price),
        offer: 0,
        photo: p.image_url || p.photo || '',
        icon: '👗',
        desc: p.description || p.name || '',
        sizes: sizes,
        stock: totalStock,
        reviews: [],
        raw_variants: rawVariants,
        isNew: p.is_new || false,
        isTrending: p.is_trending || false
      };
    });

    // Rebuild CATS array dynamically from fetched products
    const baseCats = [
      { id: 'all',      name: 'All' },
      { id: 'new',      name: 'New Arrivals' },
      { id: 'trending', name: '🔥 Trending' }
    ];
    const uniqueCats = new Set();
    products.forEach(p => {
      if (p.cat && p.cat !== 'new' && p.cat !== 'trending') {
        uniqueCats.add(p.cat);
      }
    });
    
    // Mutate the global CATS array
    CATS.length = 0;
    CATS.push(...baseCats);
    uniqueCats.forEach(cat => {
      CATS.push({ id: cat, name: cat });
    });

    renderCats();
    renderProducts();
    loadWishlistFromSupabase();
    handleURLHashProduct();
  } catch (err) {
    console.error("Error loading products from Supabase:", err);
    showToast("Error loading catalog", "red");
  }
}

function subscribeStockChanges() {
  if (!supabaseClient) return;

  supabaseClient
    .channel('public:stock')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'stock' }, payload => {
      console.log('Realtime stock update:', payload);
      let updated = false;
      products.forEach(p => {
        const variant = p.raw_variants?.find(v => v.id === payload.new.variant_id);
        if (variant) {
          if (!variant.stock) variant.stock = {};
          variant.stock.quantity = payload.new.quantity;
          p.stock = p.raw_variants.reduce((sum, v) => sum + (v.stock?.quantity || 0), 0);
          updated = true;

          // If this is the currently open product detail, refresh the size buttons & stock text
          if (activeDetailProductId === p.id) {
            const selectedSize = selectedSizes[p.id];
            if (selectedSize && selectedSize === variant.size) {
              const qty = payload.new.quantity;
              const stockEl = document.getElementById('detail-stock-display');
              if (stockEl) {
                stockEl.style.color = qty <= 5 ? 'var(--red)' : 'var(--muted)';
                stockEl.textContent = qty === 0 ? 'Out of Stock' : qty <= 5 ? `Only ${qty} left!` : `${qty} in stock`;
              }
            } else if (!selectedSize) {
              const stockEl = document.getElementById('detail-stock-display');
              if (stockEl) {
                stockEl.style.color = p.stock <= 5 ? 'var(--red)' : 'var(--muted)';
                stockEl.textContent = p.stock === 0 ? 'Out of Stock' : p.stock <= 5 ? `Only ${p.stock} left!` : `${p.stock} in stock`;
              }
            }
          }
        }
      });

      if (updated) {
        renderProducts();
      }
    })
    .subscribe();
}

document.addEventListener('mousemove', e => {
  cursor.style.left = e.clientX + 'px'; cursor.style.top = e.clientY + 'px';
  ring.style.left   = e.clientX + 'px'; ring.style.top   = e.clientY + 'px';
});
document.addEventListener('mousedown', () => { cursor.style.width = '12px'; cursor.style.height = '12px'; });
document.addEventListener('mouseup',   () => { cursor.style.width = '8px';  cursor.style.height = '8px';  });

// ===== LOADER =====
window.addEventListener('load', () => {
  setTimeout(() => {
    const loader = document.getElementById('loader');
    loader.style.opacity = '0';
    setTimeout(() => loader.style.display = 'none', 600);
  }, 1200);
});

// ===== SCROLL-TO-TOP =====
window.addEventListener('scroll', () => {
  const st = document.getElementById('scroll-top');
  if (window.scrollY > 300) st.classList.add('visible');
  else st.classList.remove('visible');
});

// ===== COUNTDOWN =====
function startCountdown() {
  const end = new Date(); end.setHours(end.getHours() + 5, end.getMinutes() + 30, 0, 0);
  setInterval(() => {
    const diff = end - new Date();
    if (diff <= 0) return;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    document.getElementById('cd-h').textContent = String(h).padStart(2, '0');
    document.getElementById('cd-m').textContent = String(m).padStart(2, '0');
    document.getElementById('cd-s').textContent = String(s).padStart(2, '0');
  }, 1000);
}

// ===== NAVIGATION =====
function showPage(pg) {
  ['home', 'wishlist', 'orders', 'admin', 'profile'].forEach(x => {
    document.getElementById('page-' + x).classList.toggle('hide', x !== pg);
    const n = document.getElementById('nav-' + x); if (n) n.classList.toggle('active', x === pg);
  });
  if (pg === 'orders')   renderMyOrders();
  if (pg === 'wishlist') renderWishlist();
  if (pg === 'admin')    renderAdminStats();
  if (pg === 'profile')  populateProfilePage();
  setBN(pg);
}

function setBN(pg) {
  document.querySelectorAll('.bottom-nav-item').forEach(el => el.classList.remove('active'));
  const bnId = pg === 'profile' ? 'account' : pg;
  const el = document.getElementById('bn-' + bnId); if (el) el.classList.add('active');
}

// ===== SEARCH =====
let searchOpen = false;

function toggleSearch() {
  searchOpen = !searchOpen;
  document.getElementById('search-area').classList.toggle('hide', !searchOpen);
  if (searchOpen) {
    document.getElementById('search-input').focus();
    document.getElementById('search-results').innerHTML = '';
  }
}

function closeSearch() {
  searchOpen = false;
  document.getElementById('search-area').classList.add('hide');
}

function doSearch(q) {
  const r = document.getElementById('search-results');
  if (!q.trim()) { r.innerHTML = ''; return; }
  const res = products.filter(p =>
    p.name.toLowerCase().includes(q.toLowerCase()) ||
    p.cat.toLowerCase().includes(q.toLowerCase())
  );
  if (!res.length) {
    r.innerHTML = '<div class="empty" style="padding:20px;color:var(--muted)">No products found</div>';
    return;
  }
  r.innerHTML = res.map(p => productCardHTML(p)).join('');
}

// ===== CATEGORIES =====
function renderCats() {
  document.getElementById('cats-container').innerHTML =
    CATS.map(c => `<div class="cat ${c.id === activeCat ? 'active' : ''}" onclick="filterCat('${c.id}')">${c.name}</div>`).join('');
}

function filterCat(id) {
  activeCat = id; renderCats(); renderProducts();
  const label = CATS.find(c => c.id === id)?.name || 'All';
  document.getElementById('filter-label').textContent = id === 'all' ? 'All Items' : label;
  document.getElementById('shop').scrollIntoView({ behavior: 'smooth' });
}

function getFiltered() {
  if (activeCat === 'all')      return products;
  if (activeCat === 'new')      return products.filter(p => p.isNew);
  if (activeCat === 'trending') return products.filter(p => p.isTrending);
  return products.filter(p => p.cat === activeCat);
}

// ===== PRODUCTS =====
function avgStars(p) {
  if (!p.reviews?.length) return 0;
  return Math.round(p.reviews.reduce((a, b) => a + b.stars, 0) / p.reviews.length);
}
function starsHTML(n) { return '⭐'.repeat(n) + '☆'.repeat(5 - n); }

function productCardHTML(p) {
  const price = ep(p), wl = wishlist.includes(p.id);
  const isLow = p.stock > 0 && p.stock <= 5;
  const stars = avgStars(p);
  return `<div class="product-card" id="pc-${p.id}">
    <div class="product-img" onclick="openDetail('${p.id}')">
      ${getPhoto(p)
        ? `<img src="${getPhoto(p)}" alt="${p.name}" style="width:100%;height:160px;object-fit:cover" onerror="this.style.display='none'"/>`
        : `<span class="emoji-fb">${p.icon}</span>`}
      <div class="product-img-overlay">
        <button class="overlay-btn" onclick="event.stopPropagation();openDetail('${p.id}')">Quick View</button>
      </div>
    </div>
    <div class="p-badges">
      ${p.isNew        ? '<span class="p-badge badge-new">New</span>' : ''}
      ${p.isTrending   ? '<span class="p-badge badge-trending">🔥 Hot</span>' : ''}
      ${p.offer > 0    ? `<span class="p-badge badge-offer">${p.offer}% off</span>` : ''}
      ${isLow          ? `<span class="p-badge" style="background:rgba(224,82,82,.85);color:#fff">Only ${p.stock} left!</span>` : ''}
    </div>
    <button class="wishlist-btn ${wl ? 'active' : ''}" onclick="toggleWishlist('${p.id}')">♥</button>
    <div class="product-info">
      <div class="product-name">${p.name}</div>
      <div class="product-cat">${p.cat}</div>
      ${stars > 0 ? `<div class="stars">${starsHTML(stars)} <span style="font-size:9px;color:var(--muted)">(${p.reviews.length})</span></div>` : ''}
      <div class="price-row">
        <span class="product-price">₹${price.toLocaleString()}</span>
        ${p.mrp > price ? `<span class="product-old">₹${p.mrp.toLocaleString()}</span>` : ''}
        ${p.offer > 0   ? `<span class="offer-tag">${p.offer}% off</span>` : ''}
      </div>
      ${p.stock === 0 ? '<div style="font-size:10px;color:var(--red);margin-bottom:6px">Out of Stock</div>' : ''}
      <button class="add-cart" onclick="quickAddToCart('${p.id}')" ${p.stock === 0 ? 'disabled style="opacity:.4;cursor:not-allowed"' : ''}>
        ${p.stock === 0 ? 'Out of Stock' : 'Add to Bag'}
      </button>
    </div>
  </div>`;
}

function renderProducts() {
  const list = getFiltered();
  document.getElementById('product-count').textContent = list.length + ' items';
  document.getElementById('products-container').innerHTML = list.length
    ? list.map(productCardHTML).join('')
    : `<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--muted)">
         <div style="font-size:36px;margin-bottom:10px">👗</div><div>No products here</div>
       </div>`;
}

// ===== PRODUCT DETAIL =====
function openDetail(id) {
  activeDetailProductId = id;
  const p = products.find(x => x.id === id); if (!p) return;
  const price = ep(p);
  document.getElementById('detail-title').textContent = p.name;
  document.getElementById('detail-content').innerHTML = `
    <div class="product-detail">
      <div>
        <div class="pd-img">${getPhoto(p) ? `<img src="${getPhoto(p)}" style="width:100%;height:220px;object-fit:cover"/>` : p.icon}</div>
        <div style="margin-top:10px">
          <div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:6px">Share</div>
          <button onclick="shareProduct('${p.id}')" class="btn-outline btn-sm" style="display:flex;align-items:center;gap:6px;padding:6px 12px;font-size:11px;">
            <span>🔗</span> Share Product
          </button>
        </div>
      </div>
      <div>
        <div class="pd-title">${p.name}</div>
        <div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:8px">${p.cat}</div>
        ${avgStars(p) > 0 ? `<div class="stars" style="margin-bottom:8px">${starsHTML(avgStars(p))} (${p.reviews.length} reviews)</div>` : ''}
        <div class="price-row" style="margin-bottom:10px">
          <span class="product-price" style="font-size:1.4rem">₹${price.toLocaleString()}</span>
          ${p.mrp > price ? `<span class="product-old">₹${p.mrp.toLocaleString()}</span>` : ''}
          ${p.offer > 0   ? `<span class="offer-tag">${p.offer}% off</span>` : ''}
        </div>
        <div class="pd-desc">${p.desc}</div>
        <div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:8px">Select Size</div>
        <div class="size-grid">
          ${p.sizes.map(s => `<button class="size-btn ${selectedSizes[id] === s ? 'active' : ''}" onclick="selectSize('${id}','${s}',this)">${s}</button>`).join('')}
        </div>
        <div id="detail-stock-display" style="font-size:11px;color:${p.stock <= 5 ? 'var(--red)' : 'var(--muted)'};margin-bottom:12px">
          ${p.stock === 0 ? 'Out of Stock' : p.stock <= 5 ? `Only ${p.stock} left!` : `${p.stock} in stock`}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-gold" onclick="addToCartFromDetail('${id}')" ${p.stock === 0 ? 'disabled' : ''}>${p.stock === 0 ? 'Out of Stock' : 'Add to Bag'}</button>
          <button class="btn-outline btn-sm" onclick="toggleWishlist('${id}')">${wishlist.includes(id) ? '❤️ Saved' : '🤍 Wishlist'}</button>
        </div>
      </div>
    </div>
    <div class="divider"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-size:12px;font-weight:500;color:var(--white)">Customer Reviews</div>
      <button class="btn-outline btn-sm" onclick="openReview('${id}')">Write Review</button>
    </div>
    ${p.reviews?.length
      ? p.reviews.map(r => `
          <div class="review-card">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <div class="review-author">${r.author}</div>
              <div style="font-size:10px">⭐${r.stars}</div>
            </div>
            <div class="review-text">${r.text}</div>
          </div>`).join('')
      : '<div style="font-size:12px;color:var(--muted);padding:8px">No reviews yet. Be the first!</div>'}
    <div class="divider"></div>
    <div style="font-size:12px;font-weight:500;color:var(--white);margin-bottom:10px">You May Also Like</div>
    <div class="related-grid">
      ${products.filter(x => x.cat === p.cat && x.id !== p.id).slice(0, 4).map(r => `
        <div style="background:var(--surface);border:1px solid var(--border);cursor:pointer"
             onclick="closeDetail();setTimeout(()=>openDetail('${r.id}'),100)">
          <div style="height:80px;display:flex;align-items:center;justify-content:center;background:var(--surface2);overflow:hidden">
            ${getPhoto(r) ? `<img src="${getPhoto(r)}" style="width:100%;height:80px;object-fit:cover"/>` : `<span style="font-size:28px">${r.icon}</span>`}
          </div>
          <div style="padding:8px">
            <div style="font-size:11px;color:var(--white)">${r.name}</div>
            <div style="font-size:10px;color:var(--gold)">₹${ep(r).toLocaleString()}</div>
          </div>
        </div>`).join('')}
    </div>`;
  document.getElementById('detail-modal').classList.remove('hide');
}

function closeDetail() {
  activeDetailProductId = null;
  document.getElementById('detail-modal').classList.add('hide');
}

function selectSize(pid, size, el) {
  selectedSizes[pid] = size;
  document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');

  const p = products.find(x => x.id === pid);
  if (p && p.raw_variants) {
    const variant = p.raw_variants.find(v => v.size === size);
    const qty = variant?.stock?.quantity || 0;
    const stockEl = document.getElementById('detail-stock-display');
    if (stockEl) {
      stockEl.style.color = qty <= 5 ? 'var(--red)' : 'var(--muted)';
      stockEl.textContent = qty === 0 ? 'Out of Stock' : qty <= 5 ? `Only ${qty} left!` : `${qty} in stock`;
    }
  }
}

function shareProduct(id) {
  const p = products.find(x => x.id === id); if (!p) return;
  const shareUrl = `${window.location.origin}${window.location.pathname}#prod-${p.id}`;
  
  if (navigator.share) {
    navigator.share({
      title: p.name,
      text: `Check out ${p.name} at KRIVVA! 👗✨`,
      url: shareUrl
    }).catch(err => {
      console.log('Error sharing:', err);
    });
  } else {
    // Desktop Fallback: Copy to clipboard
    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast('Product link copied to clipboard! 📋', 'green');
    }).catch(err => {
      // Fallback 2: WhatsApp web redirection
      const text = `Check out ${p.name} at KRIVVA for ₹${ep(p).toLocaleString()}! 👗✨\n${shareUrl}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    });
  }
}

function handleURLHashProduct() {
  const hash = window.location.hash;
  if (hash && hash.startsWith('#prod-')) {
    const id = hash.replace('#prod-', '');
    setTimeout(() => {
      openDetail(id);
    }, 200);
  }
}

window.addEventListener('hashchange', handleURLHashProduct);

// ===== WISHLIST =====
async function toggleWishlist(id) {
  const idx = wishlist.indexOf(id);
  let removed = false;
  if (idx > -1) { 
    wishlist.splice(idx, 1); 
    showToast('Removed from wishlist', 'red'); 
    removed = true;
  } else { 
    wishlist.push(id);       
    showToast('Added to wishlist ♥', 'gold'); 
  }
  updateWLCount(); renderProducts();
  if (!document.getElementById('page-wishlist').classList.contains('hide')) renderWishlist();

  // Sync to database if logged in
  if (supabaseClient && currentUser) {
    try {
      const { data: authUser } = await supabaseClient.auth.getUser();
      if (authUser?.user) {
        if (removed) {
          await supabaseClient
            .from('wishlists')
            .delete()
            .eq('user_id', authUser.user.id)
            .eq('product_id', id);
        } else {
          await supabaseClient
            .from('wishlists')
            .insert({
              user_id: authUser.user.id,
              product_id: id
            });
        }
      }
    } catch (err) {
      console.error("Error syncing wishlist to Supabase:", err);
    }
  }
}

async function loadWishlistFromSupabase() {
  if (!supabaseClient || !currentUser) return;
  try {
    const { data: authUser } = await supabaseClient.auth.getUser();
    if (authUser?.user) {
      const { data, error } = await supabaseClient
        .from('wishlists')
        .select('product_id')
        .eq('user_id', authUser.user.id);

      if (error) throw error;
      
      wishlist = (data || []).map(item => item.product_id);
      updateWLCount();
      renderProducts();
      if (!document.getElementById('page-wishlist').classList.contains('hide')) renderWishlist();
    }
  } catch (err) {
    console.error("Error loading wishlist from Supabase:", err);
  }
}

function updateWLCount() {
  const n  = wishlist.length;
  const el = document.getElementById('wl-count-nav');
  el.textContent = n; el.classList.toggle('hide', n === 0);
}

function renderWishlist() {
  const c = document.getElementById('wishlist-container');
  if (!wishlist.length) {
    c.innerHTML = '<div class="empty" style="padding:40px;text-align:center;color:var(--muted)"><div style="font-size:40px;margin-bottom:10px">🤍</div><div>No saved items</div></div>';
    return;
  }
  const items = products.filter(p => wishlist.includes(p.id));
  c.innerHTML = `<div class="wishlist-grid">${items.map(p => `
    <div class="wishlist-card">
      <div class="wl-img" onclick="openDetail('${p.id}')" style="cursor:pointer">
        ${getPhoto(p) ? `<img src="${getPhoto(p)}" style="width:100%;height:110px;object-fit:cover"/>` : p.icon}
      </div>
      <div class="wl-info">
        <div style="font-size:12px;font-weight:500;color:var(--white);margin-bottom:3px">${p.name}</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:1rem;color:var(--gold);margin-bottom:8px">₹${ep(p).toLocaleString()}</div>
        <div style="display:flex;gap:6px">
          <button class="add-cart" style="flex:1" onclick="quickAddToCart('${p.id}')">Add to Bag</button>
          <button onclick="toggleWishlist('${p.id}')" style="background:none;border:1px solid var(--border);color:var(--red);padding:7px 8px;cursor:pointer">✕</button>
        </div>
      </div>
    </div>`).join('')}</div>`;
}

// ===== CART =====
function quickAddToCart(id) {
  const p = products.find(x => x.id === id); if (!p) return;
  const size = selectedSizes[id] || (p.sizes?.length ? p.sizes[0] : 'M');
  const variant = p.raw_variants?.find(v => v.size === size);
  const qty = variant?.stock?.quantity || 0;
  if (qty === 0) {
    showToast(`Size ${size} is out of stock`, 'red');
    return;
  }
  addToCartItem(p, size);
}

function addToCartFromDetail(id) {
  const p = products.find(x => x.id === id); if (!p) return;
  if (!selectedSizes[id] && p.sizes?.length) { showToast('Please select a size first', 'red'); return; }
  const size = selectedSizes[id] || 'M';
  const variant = p.raw_variants?.find(v => v.size === size);
  const qty = variant?.stock?.quantity || 0;
  if (qty === 0) {
    showToast(`Size ${size} is out of stock`, 'red');
    return;
  }
  addToCartItem(p, size);
  closeDetail();
}

function addToCartItem(p, size) {
  const price = ep(p);
  const key   = `${p.id}-${size}`;
  const ex    = cart.find(x => x.key === key);
  if (ex) ex.qty++;
  else cart.push({ id: p.id, key, name: p.name, price, icon: p.icon, photo: getPhoto(p), qty: 1, size });
  updateCartCount();
  showToast(`${p.name} (${size}) added to bag ✓`);
}

function updateCartCount() {
  document.getElementById('cart-count').textContent = cart.reduce((a, b) => a + b.qty, 0);
}

function showCart()  { renderCart(); document.getElementById('cart-modal').classList.remove('hide'); }
function closeCart() { document.getElementById('cart-modal').classList.add('hide'); }

function renderCart() {
  const c = document.getElementById('cart-items-container');
  const f = document.getElementById('cart-footer');

  if (!cart.length) {
    c.innerHTML = '<div style="text-align:center;padding:32px;color:var(--muted)"><div style="font-size:36px;margin-bottom:10px">🛍️</div><div>Your bag is empty</div></div>';
    f.innerHTML = '';
    return;
  }

  c.innerHTML = cart.map(i => `
    <div class="cart-item">
      <div class="cart-thumb">${i.photo ? `<img src="${i.photo}" style="width:100%;height:100%;object-fit:cover"/>` : i.icon}</div>
      <div style="flex:1">
        <div style="font-size:12px;font-weight:500;color:var(--white)">${i.name}</div>
        <div style="font-size:10px;color:var(--muted)">Size: ${i.size}</div>
        <div style="font-size:12px;color:var(--gold)">₹${i.price.toLocaleString()}</div>
        <div style="display:flex;align-items:center;gap:7px;margin-top:5px">
          <button class="qty-btn" onclick="changeQty('${i.key}',-1)">−</button>
          <span style="font-size:12px">${i.qty}</span>
          <button class="qty-btn" onclick="changeQty('${i.key}',1)">+</button>
        </div>
      </div>
      <button class="remove-btn" onclick="removeFromCart('${i.key}')">✕</button>
    </div>`).join('');

  let subtotal = cart.reduce((a, b) => a + b.price * b.qty, 0);
  let discount = 0;
  if (appliedCoupon) {
    discount = appliedCoupon.type === 'percent'
      ? Math.round(subtotal * appliedCoupon.discount / 100)
      : appliedCoupon.discount;
  }
  const total    = Math.max(0, subtotal - discount);
  const shipping = total >= 999 ? 0 : 99;
  const grand    = total + shipping;

  f.innerHTML = `
    <div class="coupon-row">
      <input type="text" id="coupon-input" placeholder="Coupon code (try KRIVVA10)"
             value="${appliedCoupon ? appliedCoupon.code : ''}" ${appliedCoupon ? 'disabled' : ''}/>
      <button onclick="${appliedCoupon ? 'removeCoupon()' : 'applyCoupon()'}">${appliedCoupon ? 'Remove' : 'Apply'}</button>
    </div>
    ${appliedCoupon ? `<div style="font-size:11px;color:var(--green);margin-bottom:8px">✓ ${appliedCoupon.code} applied — Saved ₹${discount.toLocaleString()}</div>` : ''}
    <div style="font-size:11px;color:var(--muted);padding:8px 0;border-top:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>Subtotal</span><span>₹${subtotal.toLocaleString()}</span></div>
      ${discount > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:4px;color:var(--green)"><span>Discount</span><span>-₹${discount.toLocaleString()}</span></div>` : ''}
      <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>Shipping</span><span>${shipping === 0 ? '<span style="color:var(--green)">FREE</span>' : '₹' + shipping}</span></div>
    </div>
    <div style="padding:10px 0;display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border)">
      <span style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--muted)">Total</span>
      <span style="font-family:'Cormorant Garamond',serif;font-size:1.5rem;color:var(--gold)">₹${grand.toLocaleString()}</span>
    </div>
    <button class="btn-gold" style="width:100%" onclick="goCheckout(${grand})">Proceed to Checkout</button>
    <div style="font-size:10px;color:var(--muted);text-align:center;margin-top:6px">
      ${shipping === 0 ? '🎉 You qualify for FREE shipping!' : 'Add ₹' + (999 - subtotal) + ' more for FREE shipping'}
    </div>`;
}

function changeQty(key, d) {
  const i = cart.find(x => x.key === key); if (!i) return;
  i.qty += d;
  if (i.qty <= 0) cart = cart.filter(x => x.key !== key);
  updateCartCount(); renderCart();
}
function removeFromCart(key) {
  cart = cart.filter(x => x.key !== key);
  updateCartCount(); renderCart();
}

function applyCoupon() {
  const code = document.getElementById('coupon-input').value.trim().toUpperCase();
  const c    = coupons.find(x => x.code === code);
  if (c) { appliedCoupon = c; showToast('Coupon applied! ✓', 'green'); }
  else     showToast('Invalid coupon code', 'red');
  renderCart();
}
function removeCoupon() { appliedCoupon = null; renderCart(); }

// ===== CHECKOUT =====
function goCheckout(total) {
  if (!currentUser) { closeCart(); showToast('Please login to continue', 'red'); showAuthModal('checkout'); return; }
  closeCart();
  
  // Try to load saved profile address details
  const savedAddress = localStorage.getItem(`profile_address_${currentUser.email}`);
  if (savedAddress) {
    try {
      const addr = JSON.parse(savedAddress);
      document.getElementById('o-name').value  = addr.name || currentUser.name || '';
      document.getElementById('o-phone').value = addr.phone || '';
      document.getElementById('o-email').value = currentUser.email || '';
      document.getElementById('o-addr').value  = addr.street || '';
      document.getElementById('o-city').value  = addr.city || '';
      document.getElementById('o-pin').value   = addr.pin || '';
    } catch (e) {
      console.error('Error auto-filling checkout address:', e);
    }
  } else {
    document.getElementById('o-name').value  = currentUser.name || '';
    document.getElementById('o-email').value = currentUser.email || '';
    document.getElementById('o-phone').value = '';
    document.getElementById('o-addr').value  = '';
    document.getElementById('o-city').value  = '';
    document.getElementById('o-pin').value   = '';
  }

  document.getElementById('order-total-display').textContent = '₹' + total.toLocaleString();
  document.getElementById('checkout-user-info').innerHTML =
    `👤 Logged in as <strong>${currentUser.name}</strong> (${currentUser.email})`;
  setEstDelivery();
  document.getElementById('order-modal').classList.remove('hide');
}

function setEstDelivery() {
  const d    = new Date(); d.setDate(d.getDate() + 4);
  const opts = { weekday: 'long', month: 'long', day: 'numeric' };
  document.getElementById('est-delivery').textContent = 'Estimated by ' + d.toLocaleDateString('en-IN', opts);
}

function checkDelivery() {
  const pin = document.getElementById('delivery-pin').value.trim();
  const el  = document.getElementById('delivery-result');
  if (pin.length !== 6 || isNaN(pin)) {
    el.innerHTML = '<div class="pincode-result pincode-no">Please enter a valid 6-digit pincode</div>'; return;
  }
  const serviceablePins = ['400001', '411001', '560001', '500001', '600001', '110001', '302001', '380001'];
  const ok = serviceablePins.includes(pin) || pin.startsWith('4') || pin.startsWith('5');
  el.innerHTML = ok
    ? `<div class="pincode-result pincode-ok">✓ Delivery available to ${pin} — arrives in 3-5 days</div>`
    : `<div class="pincode-result pincode-no">✕ We don't deliver to ${pin} yet. Try a nearby pincode.</div>`;
}

function closeOrderModal() { document.getElementById('order-modal').classList.add('hide'); }

async function simulateRazorpay() {
  const name  = document.getElementById('o-name').value.trim();
  const phone = document.getElementById('o-phone').value.trim();
  const addr  = document.getElementById('o-addr').value.trim();
  const email = document.getElementById('o-email').value.trim();
  const city  = document.getElementById('o-city').value.trim();
  const pin   = document.getElementById('o-pin').value.trim();
  if (!name || !phone || !addr) { showToast('Please fill all required fields', 'red'); return; }

  const subtotal = cart.reduce((a, b) => a + b.price * b.qty, 0);
  let discount   = 0;
  if (appliedCoupon) {
    discount = appliedCoupon.type === 'percent'
      ? Math.round(subtotal * appliedCoupon.discount / 100)
      : appliedCoupon.discount;
  }
  const shipping = subtotal >= 999 ? 0 : 99;
  const total    = Math.max(0, subtotal - discount) + shipping;

  try {
    // 1. Create the order row in the Supabase orders table
    const { data: orderData, error: orderError } = await supabaseClient
      .from('orders')
      .insert({
        source: 'ecommerce',
        customer_name: name,
        customer_phone: phone,
        customer_email: email || null,
        status: 'pending',
        total_amount: total,
        shipping_address: addr,
        shipping_city: city,
        shipping_pincode: pin
      })
      .select()
      .single();

    if (orderError) throw orderError;

    const orderId = orderData.id;

    // 2. Map cart items to variant IDs and prepare records for order_items
    const orderItemsToInsert = cart.map(item => {
      const p = products.find(x => x.id === item.id);
      const variant = p?.raw_variants?.find(v => v.size === item.size);
      if (!variant) {
        throw new Error(`Variant not found for size ${item.size} of product ${item.name}`);
      }
      return {
        order_id: orderId,
        variant_id: variant.id,
        quantity: item.qty,
        unit_price: item.price
      };
    });

    // 3. Save order items to Supabase (this will trigger stock decrement)
    const { error: itemsError } = await supabaseClient
      .from('order_items')
      .insert(orderItemsToInsert);

    if (itemsError) throw itemsError;

    showToast('Order placed! Payment successful ✓', 'green');

    // Add to local storage for "My Orders" tab
    orders.unshift({
      id: orderId,
      name,
      phone,
      email,
      addr,
      city,
      pin,
      items: cart.map(i => ({ name: i.name, price: i.price, qty: i.qty, icon: i.icon, size: i.size })),
      total,
      status: 'placed',
      date: new Date().toISOString().split('T')[0],
      subtotal,
      discount,
      shipping,
      cgst: 0,
      sgst: 0
    });
    saveOrders();

    cart = [];
    appliedCoupon = null;
    updateCartCount();
    closeOrderModal();

    // Reload the catalog to reflect the decremented stock immediately
    await loadProductsFromSupabase();

    setTimeout(() => showPage('orders'), 1400);

  } catch (err) {
    console.error("Error placing order:", err);
    showToast("Failed to place order: " + err.message, "red");
  }
}

// ===== MY ORDERS =====
// ===== MY ORDERS =====
async function renderMyOrders() {
  const c = document.getElementById('my-orders-container');
  if (!currentUser) {
    c.innerHTML = `<div style="text-align:center;padding:40px;color:var(--muted)">
      <div style="font-size:36px;margin-bottom:10px">🔒</div>
      <div>Please login to view your orders</div>
      <button class="btn-gold" style="margin-top:14px" onclick="showAuthModal()">Login</button>
    </div>`;
    return;
  }

  // Show a loading spinner
  c.innerHTML = `<div style="text-align:center;padding:40px;color:var(--muted)">
    <div style="display:inline-block;border:2px solid rgba(188,143,143,0.1);border-left-color:var(--gold);border-radius:50%;width:24px;height:24px;animation:spin 1s linear infinite;margin-bottom:10px"></div>
    <div>Loading your orders...</div>
  </div>`;

  if (supabaseClient) {
    try {
      // Fetch orders with items, variants, and products
      const { data, error } = await supabaseClient
        .from('orders')
        .select(`
          id,
          created_at,
          customer_name,
          customer_phone,
          customer_email,
          status,
          fulfillment_status,
          total_amount,
          shipping_address,
          shipping_city,
          shipping_pincode,
          pdf_url,
          order_items (
            id,
            quantity,
            unit_price,
            variant_id,
            variants (
              size,
              products (
                name,
                photo,
                image_url
              )
            )
          )
        `)
        .eq('customer_email', currentUser.email)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Also try to fetch invoice pdf_url (order UUID = invoice ID after SQL patch)
      const orderIds = (data || []).map(o => o.id);
      let invoiceMap = {};
      if (orderIds.length > 0) {
        const { data: invData } = await supabaseClient
          .from('invoices')
          .select('id, pdf_url, fulfillment_status')
          .in('id', orderIds);
        (invData || []).forEach(inv => { invoiceMap[inv.id] = inv; });
      }

      orders = (data || []).map(o => {
        const items = (o.order_items || []).map(item => {
          const productName = item.variants?.products?.name || 'Product';
          const productPhoto = item.variants?.products?.photo || item.variants?.products?.image_url || '';
          return {
            name: productName,
            photo: productPhoto,
            price: Number(item.unit_price),
            qty: item.quantity,
            size: item.variants?.size || 'M'
          };
        });

        const inv = invoiceMap[o.id];
        return {
          id: o.id,
          date: new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
          name: o.customer_name,
          phone: o.customer_phone,
          email: o.customer_email,
          addr: o.shipping_address || '',
          city: o.shipping_city || '',
          pin: o.shipping_pincode || '',
          items: items,
          total: Number(o.total_amount),
          status: o.fulfillment_status
            ? o.fulfillment_status.toLowerCase()
            : (o.status === 'pending' ? 'placed' : o.status),
          pdf_url: o.pdf_url || inv?.pdf_url || null,
          fulfillment_status: inv?.fulfillment_status || o.fulfillment_status || o.status
        };
      });
    } catch (err) {
      console.error("Error loading orders from Supabase:", err);
    }
  }

  if (!orders.length) {
    c.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)"><div style="font-size:36px;margin-bottom:10px">📦</div><div>No orders yet</div></div>';
    return;
  }
  const steps = ['placed', 'packed', 'dispatched', 'delivered'];
  c.innerHTML = orders.map(o => {
    const si = steps.indexOf(o.status);
    const itemsList = o.items.map(i =>
      `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
        ${i.photo ? `<img src="${i.photo}" style="width:36px;height:36px;object-fit:cover;border-radius:4px;flex-shrink:0" onerror="this.style.display='none'"/>` : '<div style="width:36px;height:36px;background:rgba(255,255,255,0.05);border-radius:4px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:14px">👗</div>'}
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:600;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${i.name}</div>
          <div style="font-size:10px;color:var(--muted)">Size: ${i.size}${i.qty > 1 ? ' × ' + i.qty : ''} · ₹${(i.price * i.qty).toLocaleString()}</div>
        </div>
      </div>`
    ).join('');

    const invoiceBtn = o.pdf_url
      ? `<a href="${o.pdf_url}" target="_blank" class="btn-outline btn-sm" style="font-size:10px;padding:5px 10px;text-decoration:none;display:inline-flex;align-items:center;gap:4px">📄 Download Invoice</a>`
      : `<button class="btn-outline btn-sm" onclick="viewInvoice('${o.id}')" style="font-size:10px;padding:5px 10px;cursor:pointer">🧾 View Invoice</button>`;

    return `<div class="order-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px;margin-bottom:10px">
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--gold);letter-spacing:0.5px">ORDER</div>
          <div style="font-size:12px;font-weight:600;color:var(--white);word-break:break-all">${o.id.substring(0,8)}…</div>
          <div style="font-size:10px;color:var(--muted);margin-top:2px">${o.date} · ${o.city || ''}</div>
        </div>
        <span class="status-badge status-${o.status}" style="white-space:nowrap">${o.fulfillment_status || o.status}</span>
      </div>
      <div style="margin-bottom:10px">${itemsList}</div>
      <div style="font-family:'Cormorant Garamond',serif;font-size:1.1rem;color:var(--gold);margin-bottom:10px;text-align:right">Total: ₹${o.total.toLocaleString()}</div>
      <div class="track-bar">
        ${steps.map((s, i) => `
          <div class="track-step ${i <= si ? 'done' : ''}">
            <div class="track-dot ${i <= si ? 'done' : ''}">${i <= si ? '✓' : ''}</div>
            <div class="track-label">${s}</div>
          </div>`).join('')}
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:14px">
        ${invoiceBtn}
      </div>
    </div>`;
  }).join('');
}

// ===== REVIEWS =====
function openReview(id) {
  activeReviewProductId = id;
  document.getElementById('review-modal').classList.remove('hide');
}

function submitReview() {
  const text = document.getElementById('review-text').value.trim();
  if (!text) { showToast('Please write a review', 'red'); return; }
  if (!currentUser) { showToast('Please login first', 'red'); return; }
  const p = products.find(x => x.id === activeReviewProductId);
  if (p) { p.reviews.push({ author: currentUser.name, stars: 5, text }); showToast('Review submitted! Thank you ✓', 'green'); }
  document.getElementById('review-modal').classList.add('hide');
  document.getElementById('review-text').value = '';
  renderProducts();
}

// ===== INIT =====
startCountdown();
renderCats();
renderProducts();

// ===== STOREFRONT DYNAMIC SETTINGS =====
async function loadStorefrontSettings() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from('storefront_settings')
      .select('*');
    
    if (error) throw error;
    
    if (data) {
      const ann = data.find(s => s.key === 'announcement_banner');
      if (ann && ann.value?.text) {
        const marquee = document.getElementById('announce-marquee');
        if (marquee) {
          marquee.textContent = '✦ ' + ann.value.text + ' ✦ ' + ann.value.text;
        }
      }
      
      const hero = data.find(s => s.key === 'hero_banner');
      if (hero && hero.value) {
        const tag = document.getElementById('hero-tagline');
        const title = document.getElementById('hero-title');
        const sub = document.getElementById('hero-subtitle');
        
        if (tag && hero.value.tag) tag.textContent = hero.value.tag;
        if (title && hero.value.title) title.innerHTML = hero.value.title;
        if (sub && hero.value.subtitle) sub.textContent = hero.value.subtitle;
      }
    }
  } catch (err) {
    console.error("Error loading storefront settings:", err);
  }
}

function subscribeStorefrontSettings() {
  if (!supabaseClient) return;
  
  supabaseClient
    .channel('public:storefront_settings')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'storefront_settings' }, payload => {
      console.log('Realtime settings update:', payload);
      if (payload.new.key === 'announcement_banner') {
        const text = payload.new.value?.text;
        const marquee = document.getElementById('announce-marquee');
        if (marquee && text) marquee.textContent = '✦ ' + text + ' ✦ ' + text;
      } else if (payload.new.key === 'hero_banner') {
        const tag = document.getElementById('hero-tagline');
        const title = document.getElementById('hero-title');
        const sub = document.getElementById('hero-subtitle');
        
        if (tag && payload.new.value.tag) tag.textContent = payload.new.value.tag;
        if (title && payload.new.value.title) title.innerHTML = payload.new.value.title;
        if (sub && payload.new.value.subtitle) sub.textContent = payload.new.value.subtitle;
      }
    })
    .subscribe();
}
updateUserNav();
