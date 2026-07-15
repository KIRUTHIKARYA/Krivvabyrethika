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
    // Read from product_variants (inventory manager's actual table)
    // product_reviews joined gracefully — won't break if table is missing
    const { data, error } = await supabaseClient
      .from('products')
      .select(`
        *,
        product_variants (
          id,
          size,
          qty
        ),
        product_reviews (
          user_name,
          rating,
          review_text,
          created_at
        )
      `)
      .neq('is_active', false);

    if (error) throw error;

    products = (data || []).map(p => {
      // Sort variants by standard size order
      const sizeOrder = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'];
      const rawVariants = (p.product_variants || []).sort((a, b) => {
        const idxA = sizeOrder.indexOf(a.size);
        const idxB = sizeOrder.indexOf(b.size);
        return (idxA > -1 ? idxA : 99) - (idxB > -1 ? idxB : 99);
      });
      
      const sizes = rawVariants.map(v => v.size);
      const totalStock = rawVariants.reduce((sum, v) => sum + (v.qty || 0), 0);
      const rawReviews = p.product_reviews || [];
      const reviews = rawReviews.map(r => ({
        author: r.user_name,
        stars: Number(r.rating || 5),
        text: r.review_text
      }));
      // Build a size→qty map for cart quantity checks
      const sizeQtyMap = {};
      rawVariants.forEach(v => { sizeQtyMap[v.size] = v.qty || 0; });
      return {
        id: p.id,
        name: p.name,
        cat: p.category || 'Other',
        mrp: Number(p.price),
        offer: 0,
        photo: p.photo || p.image_url || '',
        icon: '\uD83D\uDC57',
        desc: p.description || '',
        sizes: sizes,
        sizeQtyMap: sizeQtyMap,
        stock: totalStock,
        reviews: reviews,
        raw_variants: rawVariants,
        isNew: p.is_new || false,
        isTrending: p.is_trending || false,
        isFestive: p.is_festive || false
      };
    });

    // Rebuild CATS array dynamically from fetched products
    const baseCats = [
      { id: 'all',      name: 'All' },
      { id: 'new',      name: 'New Arrivals' },
      { id: 'trending', name: '\uD83D\uDD25 Trending' }
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
    renderShopCategoryChips();
    renderMobileMenuCategories();
    loadWishlistFromSupabase();
    handleURLHashProduct();
    loadCartFromLocalStorage();
    loadReelsFromSupabase();
    loadPostersFromSupabase();
    loadPromoBannersFromSupabase();
    loadCategoryCoversFromSupabase();
    loadSpotlightPromoFromSupabase();
    loadTestimonialsFromSupabase();
    startCountdown();
  } catch (err) {
    console.error("Error loading products from Supabase:", err);
    showToast("Error loading catalog", "red");
  }
}

function subscribeStockChanges() {
  if (!supabaseClient) return;

  // Subscribe to product_variants table (inventory manager's actual stock table)
  supabaseClient
    .channel('public:product_variants')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'product_variants' }, payload => {
      console.log('Realtime stock update (product_variants):', payload);
      let updated = false;
      products.forEach(p => {
        // Match by variant id directly
        const variant = p.raw_variants?.find(v => v.id === payload.new.id);
        if (variant) {
          // Update the qty in place
          variant.qty = payload.new.qty;
          // Rebuild sizeQtyMap
          p.sizeQtyMap = p.sizeQtyMap || {};
          p.sizeQtyMap[variant.size] = payload.new.qty;
          // Recalculate total stock
          p.stock = p.raw_variants.reduce((sum, v) => sum + (v.qty || 0), 0);
          // Keep all sizes, sorted in order
          const sizeOrder = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'];
          p.sizes = p.raw_variants.map(v => v.size).sort((a, b) => {
            const idxA = sizeOrder.indexOf(a);
            const idxB = sizeOrder.indexOf(b);
            return (idxA > -1 ? idxA : 99) - (idxB > -1 ? idxB : 99);
          });
          updated = true;

          // If this is the currently open product detail, refresh stock display and size buttons
          if (activeDetailProductId === p.id) {
            const selectedSize = selectedSizes[p.id];
            
            // Refresh size grid buttons dynamically
            const sizeGrid = document.querySelector('#detail-modal .size-grid');
            if (sizeGrid) {
              sizeGrid.innerHTML = p.sizes.map(s => {
                const q = p.sizeQtyMap[s] || 0;
                if (q === 0) {
                  return `<button class="size-btn out-of-stock" disabled>${s}<span class="size-stock-badge">Sold Out</span></button>`;
                } else if (q <= 5) {
                  return `<button class="size-btn ${selectedSizes[p.id] === s ? 'active' : ''}" onclick="selectSize('${p.id}','${s}',this)">${s}<span class="size-stock-badge">${q} left</span></button>`;
                } else {
                  return `<button class="size-btn ${selectedSizes[p.id] === s ? 'active' : ''}" onclick="selectSize('${p.id}','${s}',this)">${s}</button>`;
                }
              }).join('');
            }

            if (selectedSize && selectedSize === variant.size) {
              const qty = payload.new.qty;
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

  // Also subscribe to products table for is_active / is_new / is_trending changes
  supabaseClient
    .channel('public:products')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'products' }, payload => {
      console.log('Realtime product update:', payload);
      const idx = products.findIndex(p => p.id === payload.new.id);
      if (idx !== -1) {
        // If product was deactivated, remove from list
        if (payload.new.is_active === false) {
          products.splice(idx, 1);
        } else {
          // Update name, price, description, flags in-place
          products[idx].name = payload.new.name;
          products[idx].mrp = Number(payload.new.price);
          products[idx].desc = payload.new.description || '';
          products[idx].isNew = payload.new.is_new || false;
          products[idx].isTrending = payload.new.is_trending || false;
          products[idx].photo = payload.new.photo || payload.new.image_url || '';
          products[idx].cat = payload.new.category || 'Other';
        }
        renderProducts();
      } else if (payload.new.is_active !== false) {
        // New product became active — reload full list
        loadProductsFromSupabase();
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
async function startCountdown() {
  const cdBar = document.querySelector('.countdown-bar');
  if (!cdBar) return;
  
  if (!supabaseClient) {
    cdBar.style.display = 'none';
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from('storefront_settings')
      .select('value')
      .eq('key', 'sale_countdown')
      .single();

    if (error || !data || !data.value || data.value.enabled === false || !data.value.end_time) {
      cdBar.style.display = 'none';
      return;
    }

    const end = new Date(data.value.end_time);
    
    if (end - new Date() <= 0) {
      cdBar.style.display = 'none';
      return;
    }

    cdBar.style.display = 'flex';

    const interval = setInterval(() => {
      const diff = end - new Date();
      if (diff <= 0) {
        cdBar.style.display = 'none';
        clearInterval(interval);
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      document.getElementById('cd-h').textContent = String(h).padStart(2, '0');
      document.getElementById('cd-m').textContent = String(m).padStart(2, '0');
      document.getElementById('cd-s').textContent = String(s).padStart(2, '0');
    }, 1000);
  } catch (err) {
    console.error('Error starting countdown:', err);
    cdBar.style.display = 'none';
  }
}

// ===== NAVIGATION =====
function showPage(pg) {
  ['home', 'wishlist', 'orders', 'admin', 'profile', 'category'].forEach(x => {
    const el = document.getElementById('page-' + x);
    if (el) el.classList.toggle('hide', x !== pg);
    const n = document.getElementById('nav-' + x); if (n) n.classList.toggle('active', x === pg);
  });
  if (pg === 'orders')   renderMyOrders();
  if (pg === 'wishlist') renderWishlist();
  if (pg === 'admin')    renderAdminStats();
  if (pg === 'profile')  populateProfilePage();
  if (pg !== 'category') closeMobileMenu();
  setBN(pg === 'category' ? 'home' : pg);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** All real inventory categories from loaded products */
function getInventoryCategories() {
  const systemIds = new Set(['new', 'trending', 'all', 'ethnic']);
  const cats = new Map();
  products.forEach(p => {
    if (p.cat && !systemIds.has(p.cat) && p.cat !== 'Other') {
      cats.set(p.cat, p.cat);
    }
  });
  return Array.from(cats.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function renderShopCategoryChips() {
  const container = document.getElementById('shop-category-chips');
  const section = document.getElementById('shop-category-section');
  if (!container) return;
  const cats = getInventoryCategories();
  if (!cats.length) {
    if (section) section.classList.add('hide');
    return;
  }
  if (section) section.classList.remove('hide');
  container.innerHTML = cats.map(c => {
    const count = products.filter(p => p.cat === c.id).length;
    return `<button type="button" class="shop-cat-chip" onclick="showCategoryPage('${c.id.replace(/'/g, "\\'")}')">${c.name} <span style="color:var(--muted);font-size:9px">(${count})</span></button>`;
  }).join('');
}

function renderMobileMenuCategories() {
  const container = document.getElementById('mobile-menu-categories');
  if (!container) return;
  const cats = getInventoryCategories();
  const quickHTML = `
    <button type="button" class="mobile-menu-link" onclick="closeMobileMenu();showPage('home');filterCat('all')">Shop All</button>
    <button type="button" class="mobile-menu-link" onclick="closeMobileMenu();showPage('home');filterCat('new')">New Arrivals</button>
    <button type="button" class="mobile-menu-link" onclick="closeMobileMenu();showPage('home');filterCat('trending')">Best Sellers</button>
  `;
  const catHTML = cats.map(c => {
    const count = products.filter(p => p.cat === c.id).length;
    return `<button type="button" class="mobile-menu-link" onclick="showCategoryPage('${c.id.replace(/'/g, "\\'")}')">
      ${c.name}<span class="cat-count">${count}</span>
    </button>`;
  }).join('');
  container.innerHTML = quickHTML + catHTML;
}

window.toggleMobileMenu = function() {
  const menu = document.getElementById('mobile-menu');
  const overlay = document.getElementById('mobile-menu-overlay');
  if (!menu || !overlay) return;
  renderMobileMenuCategories();
  const willOpen = menu.classList.contains('hide');
  if (willOpen) {
    menu.classList.remove('hide');
    overlay.classList.remove('hide');
    document.body.style.overflow = 'hidden';
  } else {
    closeMobileMenu();
  }
};

window.closeMobileMenu = function() {
  const menu = document.getElementById('mobile-menu');
  const overlay = document.getElementById('mobile-menu-overlay');
  if (menu) menu.classList.add('hide');
  if (overlay) overlay.classList.add('hide');
  document.body.style.overflow = '';
};

window.showCategoryPage = function(catId) {
  closeMobileMenu();
  const catName = catId;
  const list = products.filter(p => p.cat === catId);
  const titleEl = document.getElementById('category-page-title');
  const countEl = document.getElementById('category-page-count');
  const grid = document.getElementById('category-products-container');
  if (titleEl) titleEl.textContent = catName;
  if (countEl) countEl.textContent = list.length + ' items';
  if (grid) {
    grid.innerHTML = list.length
      ? list.map(productCardHTML).join('')
      : `<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--muted)">No products in this category yet.</div>`;
  }
  showPage('category');
};

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
  const suggestionsBox = document.getElementById('search-suggestions');
  
  if (!q.trim()) { 
    r.innerHTML = ''; 
    if (suggestionsBox) {
      suggestionsBox.innerHTML = '';
      suggestionsBox.classList.add('hide');
    }
    return; 
  }
  
  const res = products.filter(p =>
    p.name.toLowerCase().includes(q.toLowerCase()) ||
    p.cat.toLowerCase().includes(q.toLowerCase())
  );
  
  // Suggestions Dropdown rendering
  if (suggestionsBox) {
    if (res.length > 0) {
      suggestionsBox.classList.remove('hide');
      suggestionsBox.innerHTML = res.slice(0, 5).map(p => `
        <div class="suggestion-item" onclick="openDetail('${p.id}'); closeSearchSuggestion()">
          <img src="${getPhoto(p)}" alt="" />
          <div class="suggestion-item-details">
            <span class="suggestion-title">${p.name}</span>
            <span class="suggestion-meta">${p.cat} • ₹${ep(p).toLocaleString()}</span>
          </div>
        </div>
      `).join('');
    } else {
      suggestionsBox.innerHTML = '<div style="padding:12px; font-size:11px; color:var(--muted); text-align:center">No suggestions</div>';
      suggestionsBox.classList.remove('hide');
    }
  }

  if (!res.length) {
    r.innerHTML = '<div class="empty" style="padding:20px;color:var(--muted)">No products found</div>';
    return;
  }
  r.innerHTML = res.map(p => productCardHTML(p)).join('');
}

window.closeSearchSuggestion = function() {
  const suggestionsBox = document.getElementById('search-suggestions');
  if (suggestionsBox) {
    suggestionsBox.classList.add('hide');
  }
};

// Close search suggestions when clicking outside
document.addEventListener('click', (e) => {
  const suggestionsBox = document.getElementById('search-suggestions');
  const searchInput = document.getElementById('search-input');
  if (suggestionsBox && e.target !== searchInput && !suggestionsBox.contains(e.target)) {
    suggestionsBox.classList.add('hide');
  }
});

// ===== CATEGORIES =====
function renderCats() {
  document.getElementById('cats-container').innerHTML =
    CATS.map(c => `<div class="cat ${c.id === activeCat ? 'active' : ''}" onclick="filterCat('${c.id}')">${c.name}</div>`).join('');
}

let maxPriceFilter = null;

function filterCat(id) {
  maxPriceFilter = null;
  activeCat = id;
  renderCats();
  showPage('home');
  if (id === 'new') {
    document.getElementById('new-arrivals-section')?.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  if (id === 'trending' || id === 'all') {
    document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  showCategoryPage(id);
}

window.filterUnderPrice = function(maxVal) {
  maxPriceFilter = maxVal;
  activeCat = 'all';
  renderCats();
  renderProducts();
  document.getElementById('filter-label').textContent = `Items Under ₹${maxVal}`;
  document.getElementById('shop').scrollIntoView({ behavior: 'smooth' });
};

function getShopProducts() {
  if (maxPriceFilter !== null) {
    return products.filter(p => ep(p) <= maxPriceFilter);
  }
  return products;
}

// ===== PRODUCTS =====
function avgStars(p) {
  if (!p.reviews?.length) return 0;
  return Math.round(p.reviews.reduce((a, b) => a + b.stars, 0) / p.reviews.length);
}
function starsHTML(n) { return '⭐'.repeat(n) + '☆'.repeat(5 - n); }

function productCardHTML(p) {
  const price = ep(p), wl = wishlist.includes(p.id);
  const isSoldOut = p.stock === 0;
  const isLow     = p.stock > 0 && p.stock <= 5;
  const isOnSale  = p.offer > 0;
  const stars = avgStars(p);
  const photos = getProductPhotos(p);
  const primary = photos[0] || '';
  const hover = photos[1] || '';
  const sizePills = (p.sizes || []).map(s => {
    const q = (p.sizeQtyMap && p.sizeQtyMap[s]) || 0;
    const sold = q === 0;
    const active = selectedSizes[p.id] === s;
    return `<button type="button" class="size-pill ${sold ? 'sold' : ''} ${active ? 'active' : ''}"
      ${sold ? 'disabled' : ''}
      onclick="event.stopPropagation();selectCardSize('${p.id}','${s}',this)">${s}</button>`;
  }).join('');

  const imageBlock = primary
    ? (hover
        ? `<img class="product-img-primary" src="${primary}" alt="${p.name}" loading="lazy" onerror="this.style.display='none'"/>
           <img class="product-img-hover" src="${hover}" alt="${p.name}" loading="lazy" onerror="this.style.display='none'"/>`
        : `<img class="product-img-primary" src="${primary}" alt="${p.name}" loading="lazy" onerror="this.style.display='none'"/>`)
    : `<span class="emoji-fb">${p.icon}</span>`;

  return `<div class="product-card" id="pc-${p.id}">
    <div class="product-img" onclick="openDetail('${p.id}')">
      ${imageBlock}
      ${isSoldOut ? '<div class="sold-out-overlay"><div class="sold-out-stamp">SOLD OUT</div></div>' : ''}
      <div class="product-img-overlay">
        <button class="overlay-btn" onclick="event.stopPropagation();openDetail('${p.id}')">Quick View</button>
      </div>
    </div>
    <div class="p-badges">
      ${p.isNew      ? '<span class="p-badge badge-new">New</span>' : ''}
      ${p.isTrending ? '<span class="p-badge badge-trending">Hot</span>' : ''}
      ${isOnSale     ? `<span class="p-badge badge-sale">${p.offer}% OFF</span>` : ''}
      ${isSoldOut    ? '<span class="p-badge badge-soldout">Sold Out</span>' : ''}
      ${isLow && !isSoldOut ? `<span class="p-badge badge-sale">Only ${p.stock} left</span>` : ''}
    </div>
    <button class="wishlist-btn ${wl ? 'active' : ''}" onclick="toggleWishlist('${p.id}')">♥</button>
    <div class="product-info">
      <div class="product-name">${p.name}</div>
      <div class="product-cat">${p.cat}</div>
      ${stars > 0 ? `<div class="stars">${starsHTML(stars)} <span style="font-size:9px;color:var(--muted)">(${p.reviews.length})</span></div>` : ''}
      <div class="price-row">
        <span class="product-price">₹${price.toLocaleString()}</span>
        ${p.mrp > price ? `<span class="product-old">₹${p.mrp.toLocaleString()}</span>` : ''}
        ${isOnSale     ? `<span class="offer-tag">${p.offer}% off</span>` : ''}
      </div>
      ${sizePills ? `<div class="card-size-pills">${sizePills}</div>` : ''}
      ${isSoldOut
        ? `<button class="add-cart" onclick="event.stopPropagation();openNotifyMe('${p.id}')" style="color:var(--muted)">Notify Me</button>`
        : `<button class="add-cart" onclick="quickAddToCart('${p.id}')">Add to Bag</button>`}
    </div>
  </div>`;
}

function renderNewArrivalsRow() {
  const row = document.getElementById('new-arrivals-row');
  const section = document.getElementById('new-arrivals-section');
  if (!row) return;
  const latest = products.filter(p => p.isNew).slice(0, 12);
  const list = latest.length ? latest : products.slice(0, 8);
  if (!list.length) {
    if (section) section.classList.add('hide');
    return;
  }
  if (section) section.classList.remove('hide');
  row.innerHTML = list.map(productCardHTML).join('');
}

function renderProducts() {
  const list = getShopProducts();
  const countEl = document.getElementById('product-count');
  const labelEl = document.getElementById('filter-label');
  if (countEl) countEl.textContent = list.length + ' items';
  if (labelEl) {
    labelEl.textContent = maxPriceFilter !== null
      ? `Items Under ₹${maxPriceFilter}`
      : 'All Products';
  }
  const container = document.getElementById('products-container');
  if (!container) return;
  container.innerHTML = list.length
    ? list.map(productCardHTML).join('')
    : `<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--muted)">
         <div style="font-size:36px;margin-bottom:10px">👗</div><div>No products here</div>
       </div>`;
  if (typeof renderNewArrivalsRow === 'function') renderNewArrivalsRow();
  if (typeof renderShopCategoryChips === 'function') renderShopCategoryChips();
  if (typeof renderMobileMenuCategories === 'function') renderMobileMenuCategories();
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
        <div class="pd-img">
          ${(() => {
            const photos = p.photo ? p.photo.split(',') : [];
            if (photos.length > 1) {
              return `
                <div class="carousel-container" style="position:relative;width:100%;height:220px;overflow:hidden;border-radius:4px">
                  <div class="carousel-slides" style="display:flex;width:100%;height:100%;transition:transform 0.3s ease-in-out" id="slides-${p.id}">
                    ${photos.map(url => `
                      <div class="zoom-img-wrapper" onmousemove="zoomPhoto(event, this)" onmouseleave="resetZoom(this)" style="width:100%;height:100%;overflow:hidden;flex-shrink:0;">
                        <img src="${url}" style="width:100%;height:100%;object-fit:cover;transition:transform 0.1s ease-out"/>
                      </div>
                    `).join('')}
                  </div>
                  <button type="button" onclick="prevSlide('${p.id}')" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.6);border:none;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:10px;z-index:2">◀</button>
                  <button type="button" onclick="nextSlide('${p.id}')" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.6);border:none;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:10px;z-index:2">▶</button>
                  <div style="position:absolute;bottom:8px;left:50%;transform:translateX(-50%);display:flex;gap:4px;z-index:2">
                    ${photos.map((_, idx) => `<span class="dot" onclick="setSlide('${p.id}', ${idx})" style="width:6px;height:6px;border-radius:50%;background:${idx === 0 ? 'var(--gold)' : 'rgba(255,255,255,0.5)'};cursor:pointer" id="dot-${p.id}-${idx}"></span>`).join('')}
                  </div>
                </div>
              `;
            } else if (photos.length === 1) {
              return `
                <div class="zoom-img-wrapper" onmousemove="zoomPhoto(event, this)" onmouseleave="resetZoom(this)" style="width:100%;height:220px;overflow:hidden;border-radius:4px;">
                  <img src="${photos[0]}" style="width:100%;height:220px;object-fit:cover;transition:transform 0.1s ease-out"/>
                </div>
              `;
            } else {
              return `<div style="font-size:52px;height:220px;display:flex;align-items:center;justify-content:center;background:var(--surface2)">${p.icon}</div>`;
            }
          })()}
        </div>
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
        <div class="size-grid" style="margin-bottom:4px">
          ${p.sizes.map(s => {
            const q = p.sizeQtyMap[s] || 0;
            if (q === 0) {
              return `<button class="size-btn out-of-stock" disabled>${s}<span class="size-stock-badge">Sold Out</span></button>`;
            } else if (q <= 5) {
              return `<button class="size-btn ${selectedSizes[id] === s ? 'active' : ''}" onclick="selectSize('${id}','${s}',this)">${s}<span class="size-stock-badge">${q} left</span></button>`;
            } else {
              return `<button class="size-btn ${selectedSizes[id] === s ? 'active' : ''}" onclick="selectSize('${id}','${s}',this)">${s}</button>`;
            }
          }).join('')}
        </div>
        <div id="size-chart-btn-container" style="margin-bottom:8px"></div>
        <div id="detail-stock-display" style="font-size:11px;color:${(() => {
          const selectedSize = selectedSizes[id];
          const qty = selectedSize ? (p.sizeQtyMap[selectedSize] || 0) : p.stock;
          return qty <= 5 ? 'var(--red)' : 'var(--muted)';
        })()};margin-bottom:12px">
          ${(() => {
            const selectedSize = selectedSizes[id];
            const qty = selectedSize ? (p.sizeQtyMap[selectedSize] || 0) : p.stock;
            return qty === 0 ? 'Out of Stock' : qty <= 5 ? `Only ${qty} left!` : `${qty} in stock`;
          })()}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${p.stock === 0
            ? `<button class="btn-outline btn-sm" onclick="openNotifyMe('${id}')" style="flex:1">🔔 Notify Me When Back</button>`
            : `<button class="btn-gold" onclick="addToCartFromDetail('${id}')">Add to Bag</button>`
          }
          <button class="btn-outline btn-sm" onclick="toggleWishlist('${id}')">${wishlist.includes(id) ? '❤️ Saved' : '🤍 Wishlist'}</button>
        </div>
      </div>
    </div>
    <div class="divider"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-size:12px;font-weight:500;color:var(--text)">Customer Reviews</div>
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
    <div style="font-size:12px;font-weight:500;color:var(--text);margin-bottom:10px">You May Also Like</div>
    <div class="related-grid">
      ${products.filter(x => x.cat === p.cat && x.id !== p.id).slice(0, 4).map(r => `
        <div style="background:var(--bg-cream);border:1px solid var(--border);cursor:pointer"
             onclick="closeDetail();setTimeout(()=>openDetail('${r.id}'),100)">
          <div style="height:80px;display:flex;align-items:center;justify-content:center;background:var(--bg-beige);overflow:hidden">
            ${getPhoto(r) ? `<img src="${getPhoto(r)}" style="width:100%;height:80px;object-fit:cover"/>` : `<span style="font-size:28px">${r.icon}</span>`}
          </div>
          <div style="padding:8px">
            <div style="font-size:11px;color:var(--text)">${r.name}</div>
            <div style="font-size:10px;color:var(--maroon)">₹${ep(r).toLocaleString()}</div>
          </div>
        </div>`).join('')}
    </div>`;
  document.getElementById('detail-modal').classList.remove('hide');

  // Query size chart after details element is added to DOM
  setTimeout(async () => {
    try {
      const { data } = await supabaseClient
        .from('storefront_settings')
        .select('value')
        .eq('key', `size_chart_${p.id}`)
        .single();
      if (data && data.value?.url) {
        const btnContainer = document.getElementById('size-chart-btn-container');
        if (btnContainer) {
          btnContainer.innerHTML = `
            <button type="button" onclick="openSizeChart('${data.value.url}')" class="btn-outline btn-sm" style="padding:4px 8px;font-size:10px;display:inline-flex;align-items:center;gap:4px;margin-top:2px">
              📐 View Size Chart
            </button>
          `;
        }
      }
    } catch (e) {}
  }, 50);
}

function closeDetail() {
  activeDetailProductId = null;
  document.getElementById('detail-modal').classList.add('hide');
}

function selectSize(pid, size, el) {
  selectedSizes[pid] = size;
  document.querySelectorAll('#detail-modal .size-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');

  // Sync card pills when selecting from detail modal
  const card = document.getElementById('pc-' + pid);
  if (card) {
    card.querySelectorAll('.size-pill').forEach(pill => {
      pill.classList.toggle('active', pill.textContent.trim() === size);
    });
  }

  const p = products.find(x => x.id === pid);
  if (p) {
    const qty = p.sizeQtyMap[size] || 0;
    const stockEl = document.getElementById('detail-stock-display');
    if (stockEl) {
      stockEl.style.color = qty <= 5 ? 'var(--red)' : 'var(--muted)';
      stockEl.textContent = qty === 0 ? 'Out of Stock' : qty <= 5 ? `Only ${qty} left!` : `${qty} in stock`;
    }
  }
}

window.selectCardSize = function(pid, size, el) {
  selectedSizes[pid] = size;
  const card = document.getElementById('pc-' + pid);
  if (card) {
    card.querySelectorAll('.size-pill').forEach(b => b.classList.remove('active'));
  }
  if (el) el.classList.add('active');
};

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
        <div style="font-size:12px;font-weight:500;color:var(--text);margin-bottom:3px">${p.name}</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:1rem;color:var(--maroon);margin-bottom:8px">₹${ep(p).toLocaleString()}</div>
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
  if (!selectedSizes[id] && p.sizes?.length) {
    showToast('Please select a size first', 'red');
    return;
  }
  const size = selectedSizes[id] || (p.sizes?.length ? p.sizes[0] : 'M');
  const qty = (p.sizeQtyMap && p.sizeQtyMap[size]) || 0;
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
  const qty = p.sizeQtyMap[size] || 0;

  // Check how many items of this size are already in the cart
  const key = `${id}-${size}`;
  const inCart = cart.find(x => x.key === key)?.qty || 0;

  if (qty === 0) {
    showToast(`Size ${size} is out of stock`, 'red');
    return;
  }
  if (inCart >= qty) {
    showToast(`Only ${qty} left in stock for size ${size}. Cannot add more.`, 'red');
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
  saveCartToLocalStorage();
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
        <div style="font-size:12px;font-weight:500;color:var(--text)">${i.name}</div>
        <div style="font-size:10px;color:var(--muted)">Size: ${i.size}</div>
        <div style="font-size:12px;color:var(--maroon)">₹${i.price.toLocaleString()}</div>
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
    <div class="order-note-row">
      <div class="order-note-label">📝 Order Note (optional)</div>
      <textarea id="cart-note" placeholder="Any special instructions? (gift wrapping, colour preference…)" rows="2">${cartNote || ''}</textarea>
    </div>
    <div style="font-size:11px;color:var(--muted);padding:8px 0;border-top:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>Subtotal</span><span>₹${subtotal.toLocaleString()}</span></div>
      ${discount > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:4px;color:var(--green)"><span>Discount</span><span>-₹${discount.toLocaleString()}</span></div>` : ''}
      <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>Shipping</span><span>${shipping === 0 ? '<span style="color:var(--green)">FREE</span>' : '₹' + shipping}</span></div>
    </div>
    <div style="padding:10px 0;display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border)">
      <span style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--muted)">Total</span>
      <span style="font-family:'Cormorant Garamond',serif;font-size:1.5rem;color:var(--gold)">₹${grand.toLocaleString()}</span>
    </div>
    <div class="trust-badges" style="margin-bottom:10px">
      <span class="trust-badge"><span class="tb-icon">🔒</span> Secure</span>
      <span class="trust-badge"><span class="tb-icon">✅</span> Genuine</span>
      <span class="trust-badge"><span class="tb-icon">↩️</span> 7-day Returns</span>
      <span class="trust-badge"><span class="tb-icon">🚚</span> Fast Ship</span>
    </div>
    <button class="btn-gold" style="width:100%" onclick="syncCartNoteAndCheckout(${grand})">Proceed to Checkout</button>
    <div style="font-size:10px;color:var(--muted);text-align:center;margin-top:6px">
      ${shipping === 0 ? '🎉 You qualify for FREE shipping!' : 'Add ₹' + (999 - subtotal) + ' more for FREE shipping'}
    </div>`;
}

function changeQty(key, d) {
  const i = cart.find(x => x.key === key); if (!i) return;

  if (d > 0) {
    const p = products.find(prod => prod.id === i.id);
    const maxQty = p?.sizeQtyMap?.[i.size] || 0;
    if (i.qty >= maxQty) {
      showToast(`Only ${maxQty} items available in stock for size ${i.size}`, 'red');
      return;
    }
  }

  i.qty += d;
  if (i.qty <= 0) cart = cart.filter(x => x.key !== key);
  updateCartCount(); renderCart();
  saveCartToLocalStorage();
}
function removeFromCart(key) {
  cart = cart.filter(x => x.key !== key);
  updateCartCount(); renderCart();
  saveCartToLocalStorage();
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

// Sync cart note to checkout note field before opening checkout
function syncCartNoteAndCheckout(total) {
  cartNote = (document.getElementById('cart-note')?.value || '').trim();
  goCheckout(total);
}

async function simulateRazorpay() {
  const name  = document.getElementById('o-name').value.trim();
  const phone = document.getElementById('o-phone').value.trim();
  const addr  = document.getElementById('o-addr').value.trim();
  const email = document.getElementById('o-email').value.trim();
  const city  = document.getElementById('o-city').value.trim();
  const pin   = document.getElementById('o-pin').value.trim();
  const note  = document.getElementById('o-note')?.value?.trim() || cartNote || '';
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
        shipping_pincode: pin,
        customer_note: note || null
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
    saveCartToLocalStorage();
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
          <div style="font-size:11px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${i.name}</div>
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
          <div style="font-size:12px;font-weight:600;color:var(--text);word-break:break-all">${o.id.substring(0,8)}…</div>
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

async function submitReview() {
  const text = document.getElementById('review-text').value.trim();
  const rating = Number(document.getElementById('review-rating')?.value || 5);
  if (!text) { showToast('Please write a review', 'red'); return; }
  if (!currentUser) { showToast('Please login first', 'red'); return; }

  // Verify the reviewer has actually placed an order for this product
  if (supabaseClient && activeReviewProductId) {
    try {
      // Look for any order_items with a matching variant for this product, linked to an order by this user's email
      const { data: purchased, error: purchaseErr } = await supabaseClient
        .from('orders')
        .select('id, order_items(id, variants(id, products(id)))')
        .eq('customer_email', currentUser.email)
        .neq('status', 'cancelled');

      if (purchaseErr) throw purchaseErr;

      const hasBought = (purchased || []).some(order =>
        (order.order_items || []).some(item =>
          item.variants?.products?.id === activeReviewProductId
        )
      );

      if (!hasBought) {
        showToast('Only verified buyers can leave a review for this product.', 'red');
        return;
      }
    } catch (err) {
      // If check fails due to network, allow the review to go through rather than blocking
      console.warn('Could not verify purchase status, allowing review:', err);
    }
  }

  if (supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from('product_reviews')
        .insert({
          product_id: activeReviewProductId,
          user_name: currentUser.name,
          user_email: currentUser.email,
          rating: rating,
          review_text: text
        });

      if (error) throw error;

      showToast('Review submitted successfully! ✓', 'green');
      loadProductsFromSupabase();
    } catch (err) {
      console.error('Error submitting review:', err);
      showToast('Error submitting review: ' + err.message, 'red');
    }
  } else {
    const p = products.find(x => x.id === activeReviewProductId);
    if (p) {
      p.reviews.push({ author: currentUser.name, stars: rating, text });
      showToast('Review submitted! Thank you ✓ (Demo)', 'green');
    }
    renderProducts();
  }
  document.getElementById('review-modal').classList.add('hide');
  document.getElementById('review-text').value = '';
  setRating(5);
}

// ===== INIT =====
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
      if (ann && ann.value && ann.value.text !== undefined) {
        const marquee = document.getElementById('announce-marquee');
        if (marquee) {
          marquee.textContent = ann.value.text ? '✦ ' + ann.value.text + ' ✦ ' + ann.value.text : '';
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
        
        heroBgImageUrl = hero.value.bg_image_url || '';
        if (posters && posters.length === 0) {
          renderDefaultHeroBackground();
        }
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
        if (marquee && text !== undefined) {
          marquee.textContent = text ? '✦ ' + text + ' ✦ ' + text : '';
        }
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

function saveCartToLocalStorage() {
  const email = currentUser ? currentUser.email : 'guest';
  localStorage.setItem(`krivva_cart_${email}`, JSON.stringify(cart));
}

function loadCartFromLocalStorage() {
  const email = currentUser ? currentUser.email : 'guest';
  const saved = localStorage.getItem(`krivva_cart_${email}`);
  if (saved) {
    try {
      cart = JSON.parse(saved) || [];
    } catch (e) {
      console.error("Error loading cart:", e);
      cart = [];
    }
  } else {
    cart = [];
  }
  updateCartCount();
  if (document.getElementById('cart-modal') && !document.getElementById('cart-modal').classList.contains('hide')) {
    renderCart();
  }
}

function setRating(val) {
  const ratingInput = document.getElementById('review-rating');
  if (ratingInput) ratingInput.value = val;
  for (let i = 1; i <= 5; i++) {
    const star = document.getElementById('star-' + i);
    if (star) {
      star.style.opacity = i <= val ? '1' : '0.3';
    }
  }
}

updateUserNav();
loadCartFromLocalStorage();

// ===== MULTI-PHOTO CAROUSEL CONTROLS =====
let activeSlides = {};

window.nextSlide = function(id) {
  const p = products.find(x => x.id === id);
  const photos = p && p.photo ? p.photo.split(',') : [];
  if (photos.length <= 1) return;
  if (activeSlides[id] === undefined) activeSlides[id] = 0;
  activeSlides[id] = (activeSlides[id] + 1) % photos.length;
  updateSlidePosition(id, photos.length);
};

window.prevSlide = function(id) {
  const p = products.find(x => x.id === id);
  const photos = p && p.photo ? p.photo.split(',') : [];
  if (photos.length <= 1) return;
  if (activeSlides[id] === undefined) activeSlides[id] = 0;
  activeSlides[id] = (activeSlides[id] - 1 + photos.length) % photos.length;
  updateSlidePosition(id, photos.length);
};

window.setSlide = function(id, idx) {
  const p = products.find(x => x.id === id);
  const photos = p && p.photo ? p.photo.split(',') : [];
  if (photos.length <= 1) return;
  activeSlides[id] = idx;
  updateSlidePosition(id, photos.length);
};

function updateSlidePosition(id, total) {
  const idx = activeSlides[id] || 0;
  const slidesEl = document.getElementById(`slides-${id}`);
  if (slidesEl) {
    slidesEl.style.transform = `translateX(-${idx * 100}%)`;
  }
  for (let i = 0; i < total; i++) {
    const dot = document.getElementById(`dot-${id}-${i}`);
    if (dot) {
      dot.style.background = i === idx ? 'var(--gold)' : 'rgba(255,255,255,0.5)';
    }
  }
}

window.openSizeChart = function(url) {
  const modal = document.getElementById('size-chart-modal');
  const img = document.getElementById('size-chart-img');
  if (modal && img) {
    img.src = url;
    modal.classList.remove('hide');
  }
};

window.closeSizeChart = function() {
  const modal = document.getElementById('size-chart-modal');
  if (modal) {
    modal.classList.add('hide');
  }
};

// ===== CART NOTE GLOBAL =====
let cartNote = '';

// ===== COOKIE CONSENT =====
function initCookieConsent() {
  const choice = localStorage.getItem('krivva_cookie_consent');
  if (!choice) {
    // Show bar after a short delay so it doesn't flash on load
    setTimeout(() => {
      const bar = document.getElementById('cookie-bar');
      if (bar) bar.classList.add('visible');
    }, 1800);
  }
}

function dismissCookies(accepted) {
  localStorage.setItem('krivva_cookie_consent', accepted ? 'accepted' : 'declined');
  const bar = document.getElementById('cookie-bar');
  if (bar) {
    bar.style.transform = 'translateY(100%)';
    setTimeout(() => bar.style.display = 'none', 400);
  }
}

// ===== TERMS OF SERVICE MODAL =====
function openTos() {
  document.getElementById('tos-modal').classList.remove('hide');
}
function closeTos() {
  document.getElementById('tos-modal').classList.add('hide');
}

// ===== NOTIFY ME (sold-out restock alert) =====
function openNotifyMe(productId) {
  const p = products.find(x => x.id === productId || x.id === String(productId));
  document.getElementById('notify-product-id').value = productId;
  // Pre-fill with logged-in user email if available
  const emailInput = document.getElementById('notify-email');
  if (emailInput && currentUser?.email) emailInput.value = currentUser.email;
  document.getElementById('notify-modal').classList.remove('hide');
}

function closeNotifyModal() {
  document.getElementById('notify-modal').classList.add('hide');
}

async function submitNotifyMe() {
  const productId = document.getElementById('notify-product-id').value;
  const email = document.getElementById('notify-email').value.trim();
  const p = products.find(x => x.id === productId || x.id === String(productId));

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast('Please enter a valid email address', 'red');
    return;
  }

  if (supabaseClient) {
    try {
      // Store in storefront_settings as a notify request list
      const key = `notify_requests_${productId}`;
      const { data: existing } = await supabaseClient
        .from('storefront_settings')
        .select('value')
        .eq('key', key)
        .single();

      const current = existing?.value?.emails || [];
      if (!current.includes(email)) current.push(email);

      await supabaseClient
        .from('storefront_settings')
        .upsert({ key, value: { emails: current, product_name: p?.name || '' } });

      showToast(`We'll notify ${email} when it's back! 🔔`, 'green');
    } catch (err) {
      console.error('Notify Me error:', err);
      // Still show success to customer — don't expose DB errors
      showToast(`We'll notify you when it's back! 🔔`, 'green');
    }
  } else {
    showToast(`We'll notify you when it's back! 🔔`, 'green');
  }

  closeNotifyModal();
  document.getElementById('notify-email').value = '';
}

// ===== INSTAGRAM STORIES / REELS LOGIC =====
let reels = [];
let activeReelIdx = 0;
let reelPlaybackTimer = null;
let reelMuted = true; // Auto-muted by default to comply with browser autoplay rules
let reelPaused = false;

async function loadReelsFromSupabase() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from('storefront_settings')
      .select('value')
      .eq('key', 'storefront_reels')
      .single();
      
    if (!error && data && Array.isArray(data.value)) {
      reels = data.value;
      renderReelsBubbles();
    }
  } catch (err) {
    console.error('Error loading reels:', err);
  }
}

function renderReelsBubbles() {
  const container = document.getElementById('reels-row-container');
  const list = document.getElementById('reels-list');
  if (!container || !list) return;

  if (reels.length === 0) {
    container.classList.add('hide');
    return;
  }

  container.classList.remove('hide');
  list.innerHTML = reels.map((r, idx) => `
    <div class="reel-card" onclick="openReel(${idx})">
      <div class="reel-card-video-wrapper">
        <video src="${r.video_url}" muted playsinline loop autoplay></video>
        <div class="reel-card-overlay">
          <span class="reel-card-caption">${r.caption || 'Krivva Styling'}</span>
        </div>
      </div>
    </div>
  `).join('');
}

window.openReel = function(idx) {
  activeReelIdx = idx;
  const modal = document.getElementById('reels-modal');
  const video = document.getElementById('reel-video-player');
  if (!modal || !video) return;

  modal.classList.remove('hide');
  
  // Set muted state
  video.muted = reelMuted;
  document.getElementById('reel-mute-btn').textContent = reelMuted ? '🔇' : '🔊';

  playReelIndex(idx);
};

function playReelIndex(idx) {
  if (idx < 0 || idx >= reels.length) {
    closeReels();
    return;
  }
  
  activeReelIdx = idx;
  const reel = reels[idx];
  const video = document.getElementById('reel-video-player');
  if (!video) return;

  video.src = reel.video_url;
  document.getElementById('reel-caption').textContent = reel.caption || '';

  const shopBtn = document.getElementById('reel-shop-btn');
  if (shopBtn) {
    if (reel.product_id) {
      const linkedProduct = products.find(p => p.id === reel.product_id);
      if (linkedProduct) {
        shopBtn.textContent = `Shop ${linkedProduct.name} 🛍️`;
        shopBtn.onclick = function() {
          closeReels();
          openDetail(linkedProduct.id);
        };
      } else {
        shopBtn.textContent = 'Shop the Look 👗✨';
        shopBtn.onclick = function() {
          closeReels();
          document.getElementById('shop').scrollIntoView({behavior:'smooth'});
        };
      }
    } else {
      shopBtn.textContent = 'Shop the Look 👗✨';
      shopBtn.onclick = function() {
        closeReels();
        document.getElementById('shop').scrollIntoView({behavior:'smooth'});
      };
    }
  }
  
  // Render progress segments
  const progressBars = document.getElementById('reels-progress-bars');
  if (progressBars) {
    progressBars.innerHTML = reels.map((_, i) => `
      <div class="progress-bar-segment">
        <div class="progress-bar-fill" id="reel-progress-fill-${i}" style="width: ${i < idx ? '100%' : '0%'}"></div>
      </div>
    `).join('');
  }

  reelPaused = false;
  document.getElementById('reel-play-overlay').style.opacity = 0;
  
  video.load();
  video.play().then(() => {
    startReelTimer();
  }).catch(err => {
    console.error('Error playing reel:', err);
    video.muted = true;
    reelMuted = true;
    document.getElementById('reel-mute-btn').textContent = '🔇';
    video.play();
    startReelTimer();
  });
}

function startReelTimer() {
  if (reelPlaybackTimer) clearInterval(reelPlaybackTimer);
  const video = document.getElementById('reel-video-player');
  if (!video) return;

  const fillEl = document.getElementById(`reel-progress-fill-${activeReelIdx}`);
  
  reelPlaybackTimer = setInterval(() => {
    if (reelPaused) return;
    
    if (video.duration) {
      const pct = (video.currentTime / video.duration) * 100;
      if (fillEl) fillEl.style.width = `${pct}%`;
      
      if (video.ended) {
        clearInterval(reelPlaybackTimer);
        nextReel();
      }
    }
  }, 100);
}

window.closeReels = function() {
  if (reelPlaybackTimer) clearInterval(reelPlaybackTimer);
  const modal = document.getElementById('reels-modal');
  const video = document.getElementById('reel-video-player');
  if (modal) modal.classList.add('hide');
  if (video) video.pause();
};

window.nextReel = function() {
  if (activeReelIdx < reels.length - 1) {
    const prevFill = document.getElementById(`reel-progress-fill-${activeReelIdx}`);
    if (prevFill) prevFill.style.width = '100%';
    playReelIndex(activeReelIdx + 1);
  } else {
    closeReels();
  }
};

window.prevReel = function() {
  if (activeReelIdx > 0) {
    const prevFill = document.getElementById(`reel-progress-fill-${activeReelIdx}`);
    if (prevFill) prevFill.style.width = '0%';
    const currentFill = document.getElementById(`reel-progress-fill-${activeReelIdx - 1}`);
    if (currentFill) currentFill.style.width = '0%';
    playReelIndex(activeReelIdx - 1);
  }
};

window.toggleReelPause = function() {
  const video = document.getElementById('reel-video-player');
  const overlay = document.getElementById('reel-play-overlay');
  if (!video) return;

  reelPaused = !reelPaused;
  if (reelPaused) {
    video.pause();
    if (overlay) {
      overlay.textContent = '⏸';
      overlay.style.opacity = 1;
    }
  } else {
    video.play();
    if (overlay) {
      overlay.style.opacity = 0;
    }
  }
};

window.toggleReelAudio = function() {
  const video = document.getElementById('reel-video-player');
  const btn = document.getElementById('reel-mute-btn');
  if (!video) return;

  reelMuted = !reelMuted;
  video.muted = reelMuted;
  if (btn) btn.textContent = reelMuted ? '🔇' : '🔊';
};

// ===== HOVER ZOOM LOGIC =====
window.zoomPhoto = function(e, element) {
  const img = element.querySelector('img');
  if (!img) return;
  const rect = element.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;
  img.style.transformOrigin = `${x}% ${y}%`;
  img.style.transform = 'scale(2.2)';
};

window.resetZoom = function(element) {
  const img = element.querySelector('img');
  if (!img) return;
  img.style.transform = 'scale(1)';
};

// ===== HOMEPAGE SLIDESHOW / POSTERS LOGIC =====
let posters = [];
let activePosterIdx = 0;
let posterInterval = null;
let heroBgImageUrl = '';

async function loadPostersFromSupabase() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from('storefront_settings')
      .select('value')
      .eq('key', 'homepage_posters')
      .single();
      
    if (!error && data && Array.isArray(data.value) && data.value.length > 0) {
      posters = data.value;
      renderPostersSlideshow();
    } else {
      renderDefaultHeroBackground();
    }
  } catch (err) {
    console.error('Error loading posters:', err);
    renderDefaultHeroBackground();
  }
}

function renderPostersSlideshow() {
  const container = document.getElementById('hero-slideshow');
  const dotsContainer = document.getElementById('hero-dots');
  if (!container) return;

  container.innerHTML = posters.map((p) => `
    <div class="hero-slide" style="background-image: url('${p.url}')"></div>
  `).join('');

  if (dotsContainer) {
    if (posters.length > 1) {
      dotsContainer.innerHTML = posters.map((_, idx) => `
        <span class="hero-dot ${idx === 0 ? 'active' : ''}" onclick="goToSlide(${idx})" title="Go to slide ${idx + 1}"></span>
      `).join('');
    } else {
      dotsContainer.innerHTML = '';
    }
  }

  activePosterIdx = 0;
  updateSlideshowPosition();

  if (posters.length > 1) {
    startPostersInterval();
  }
}

window.goToSlide = function(idx) {
  activePosterIdx = idx;
  updateSlideshowPosition();
  if (posters.length > 1) {
    startPostersInterval(); // Reset interval timer
  }
};

function updateSlideshowPosition() {
  const container = document.getElementById('hero-slideshow');
  if (!container) return;
  container.style.transform = `translateX(-${activePosterIdx * 100}%)`;

  const dots = document.querySelectorAll('.hero-dot');
  dots.forEach((dot, idx) => {
    if (idx === activePosterIdx) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });
}

function startPostersInterval() {
  if (posterInterval) clearInterval(posterInterval);
  posterInterval = setInterval(() => {
    if (posters.length <= 1) return;
    activePosterIdx = (activePosterIdx + 1) % posters.length;
    updateSlideshowPosition();
  }, 5000); // rotates every 5 seconds
}

function renderDefaultHeroBackground() {
  const container = document.getElementById('hero-slideshow');
  const dotsContainer = document.getElementById('hero-dots');
  if (!container) return;
  
  if (heroBgImageUrl) {
    container.innerHTML = `<div class="hero-slide" style="background-image: url('${heroBgImageUrl}')"></div>`;
  } else {
    container.innerHTML = `<div class="hero-slide" style="background: linear-gradient(145deg, #fdfbf7 0%, #eae5d9 100%)"></div>`;
  }
  if (dotsContainer) dotsContainer.innerHTML = '';
  container.style.transform = 'none';
}

// ===== PROMOTIONAL BANNERS GRID LOGIC =====
async function loadPromoBannersFromSupabase() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from('storefront_settings')
      .select('value')
      .eq('key', 'homepage_banners')
      .single();
      
    if (!error && data && Array.isArray(data.value)) {
      renderPromoBanners(data.value);
    } else {
      renderPromoBanners([]);
    }
  } catch (err) {
    console.error('Error loading promotional banners:', err);
    renderPromoBanners([]);
  }
}

function renderPromoBanners(bannersList) {
  const container = document.getElementById('promo-banners-section');
  if (!container) return;

  if (!bannersList || bannersList.length === 0) {
    container.innerHTML = '';
    container.classList.add('hide');
    return;
  }

  container.classList.remove('hide');
  container.innerHTML = bannersList.map(b => {
    const url = b.url || '';
    if (!url) return '';
    const title = b.title || 'Collection Drop';
    const tag = b.tag || 'Trending';
    const btnText = b.btn_text || 'Shop Now';
    const btnLink = b.btn_link || '#shop';
    
    return `
      <div class="promo-banner-card" onclick="window.location.hash = '${btnLink}'; document.getElementById('shop')?.scrollIntoView({behavior:'smooth'});">
        <div class="promo-banner-img" style="background-image: url('${url}')"></div>
        <div class="promo-banner-overlay">
          <span class="promo-banner-tag">${tag}</span>
          <h3 class="promo-banner-title">${title}</h3>
          <button class="promo-banner-btn">${btnText}</button>
        </div>
      </div>
    `;
  }).filter(Boolean).join('');

  if (!container.innerHTML.trim()) {
    container.classList.add('hide');
  }
}

// ===== DYNAMIC CATEGORY SHOWCASE COVERS =====
async function loadCategoryCoversFromSupabase() {
  if (!supabaseClient) return;
  const container = document.getElementById('category-bubbles-container');
  if (!container) return;

  try {
    const { data, error } = await supabaseClient
      .from('storefront_settings')
      .select('value')
      .eq('key', 'category_covers')
      .single();

    const coversMap = (!error && data && data.value) ? data.value : {};
    const catsToShow = getInventoryCategories();

    container.innerHTML = catsToShow.map(({ id, name }) => {
      let imageUrl = coversMap[name] || coversMap[id];
      if (!imageUrl) {
        const matchingProd = products.find(p => p.cat === id || p.cat === name);
        if (matchingProd) imageUrl = getPhoto(matchingProd);
      }
      if (!imageUrl) {
        imageUrl = 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?q=80&w=300&auto=format&fit=crop';
      }

      return `
        <div class="category-bubble-card" onclick="showCategoryPage('${id.replace(/'/g, "\\'")}')">
          <div class="category-bubble-ring">
            <div class="category-bubble-img">
              <img src="${imageUrl}" alt="${name}" loading="lazy" />
            </div>
          </div>
          <span class="category-bubble-name">${name}</span>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Error rendering category covers:', err);
  }
}

window.selectShowcaseCategory = function(catName) {
  showCategoryPage(catName);
};

// ===== DYNAMIC SPOTLIGHT PROMO =====
async function loadSpotlightPromoFromSupabase() {
  if (!supabaseClient) return;
  const section = document.getElementById('spotlight-section');
  if (!section) return;

  try {
    const { data, error } = await supabaseClient
      .from('storefront_settings')
      .select('value')
      .eq('key', 'spotlight_promo')
      .single();

    if (error || !data || !data.value || !data.value.image_url) {
      section.classList.add('hide');
      return;
    }

    const promo = data.value;
    const imgBlock = document.getElementById('spotlight-image-block');
    const titleEl = document.getElementById('spotlight-title');
    const descEl = document.getElementById('spotlight-desc');
    const btnEl = document.getElementById('spotlight-action-btn');

    if (imgBlock) imgBlock.style.backgroundImage = `url('${promo.image_url}')`;
    if (titleEl) titleEl.innerHTML = promo.title || 'Exclusive Drop';
    if (descEl) descEl.textContent = promo.subtitle || 'Shop our newest arrivals.';
    
    if (btnEl) {
      btnEl.innerHTML = promo.btn_label || 'Shop Collection 🛍️';
      btnEl.onclick = () => {
        const target = promo.btn_link || '#shop';
        if (target.startsWith('#')) {
          const el = document.getElementById(target.substring(1));
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        } else {
          window.open(target, '_blank');
        }
      };
    }

    section.classList.remove('hide');
  } catch (err) {
    console.error('Error loading spotlight promo:', err);
    section.classList.add('hide');
  }
}

// ===== CLIENT TESTIMONIALS SLIDER =====
let testimonials = [];
let activeTestimonialIdx = 0;
let testimonialInterval = null;

async function loadTestimonialsFromSupabase() {
  if (!supabaseClient) return;
  const section = document.getElementById('testimonials-section');
  const slider = document.getElementById('testimonial-slider');
  const dotsContainer = document.getElementById('testimonial-dots');
  if (!section || !slider) return;

  try {
    const { data, error } = await supabaseClient
      .from('storefront_settings')
      .select('value')
      .eq('key', 'homepage_testimonials')
      .single();

    if (error || !data || !Array.isArray(data.value) || data.value.length === 0) {
      section.classList.add('hide');
      return;
    }

    testimonials = data.value;

    // Render slides
    slider.innerHTML = testimonials.map((t, idx) => `
      <div class="testimonial-slide ${idx === 0 ? 'active' : ''}" id="t-slide-${idx}">
        <div class="testimonial-stars">${'★'.repeat(t.rating)}</div>
        <p class="testimonial-text">"${t.review}"</p>
        <div class="testimonial-author">${t.name} ${t.dress ? `— Bought: ${t.dress}` : ''}</div>
      </div>
    `).join('');

    // Render dots
    if (dotsContainer) {
      dotsContainer.innerHTML = testimonials.map((_, idx) => `
        <span class="testimonial-dot ${idx === 0 ? 'active' : ''}" onclick="showTestimonialSlide(${idx})"></span>
      `).join('');
    }

    section.classList.remove('hide');

    if (testimonials.length > 1) {
      startTestimonialInterval();
    }
  } catch (err) {
    console.error('Error loading testimonials:', err);
    section.classList.add('hide');
  }
}

window.showTestimonialSlide = function(idx) {
  const slides = document.querySelectorAll('.testimonial-slide');
  const dots = document.querySelectorAll('.testimonial-dot');
  if (!slides.length) return;

  slides[activeTestimonialIdx].classList.remove('active');
  if (dots[activeTestimonialIdx]) dots[activeTestimonialIdx].classList.remove('active');

  activeTestimonialIdx = idx;

  slides[activeTestimonialIdx].classList.add('active');
  if (dots[activeTestimonialIdx]) dots[activeTestimonialIdx].classList.add('active');

  // Reset timer
  if (testimonials.length > 1) {
    startTestimonialInterval();
  }
};

function startTestimonialInterval() {
  if (testimonialInterval) clearInterval(testimonialInterval);
  testimonialInterval = setInterval(() => {
    const nextIdx = (activeTestimonialIdx + 1) % testimonials.length;
    showTestimonialSlide(nextIdx);
  }, 6000); // rotates reviews every 6 seconds
}

// ===== NEWSLETTER SIGNUP HANDLER =====
window.handleNewsletterSubmit = function(e) {
  e.preventDefault();
  const emailInput = document.getElementById('news-email');
  if (!emailInput) return;

  const email = emailInput.value.trim();
  if (email) {
    showToast("You're on the list! We'll notify you about new drops & restocks.", "gold");
    emailInput.value = '';
  }
};

// ===== BOOT COOKIE CONSENT CHECK =====
initCookieConsent();
