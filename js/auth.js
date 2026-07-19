// =============================================
// KRIVVA — Auth Module
// Handles both local (demo) auth and Supabase auth
// =============================================

// ----- SUPABASE CLIENT -----
// Initialised after the Supabase SDK script loads (see index.html)
let supabaseClient = null;

const KRIVVA_CONFIG = window.KRIVVA_CONFIG || {
  url: 'https://lhsfxibmgamsxnhzdkao.supabase.co',
  anonKey: 'sb_publishable_J-kV5jiXlqQo5itAwTVShA_4jrkLyv8'
};

// ----- USER PROFILE & CART SYNCHRONIZATION -----
async function syncUserSessionData(u) {
  if (!u) return;
  const email = u.email;

  // 1. Restore address from Supabase metadata if present
  if (u.user_metadata?.address) {
    localStorage.setItem(`profile_address_${email}`, JSON.stringify(u.user_metadata.address));
  }

  // 2. Restore/Merge cart from Supabase metadata if present
  const accountCart = u.user_metadata?.cart || [];
  const guestCartJson = localStorage.getItem('krivva_cart_guest');
  let guestCart = [];
  if (guestCartJson) {
    try { guestCart = JSON.parse(guestCartJson) || []; } catch(e){}
  }

  let finalCart = [...accountCart];
  let changed = false;

  if (guestCart.length > 0) {
    // Merge guest cart with account cart
    guestCart.forEach(gItem => {
      const ex = finalCart.find(mItem => mItem.key === gItem.key);
      if (ex) {
        ex.qty += gItem.qty;
      } else {
        finalCart.push(gItem);
      }
    });
    // Clear guest cart
    localStorage.removeItem('krivva_cart_guest');
    changed = true;
  }

  localStorage.setItem(`krivva_cart_${email}`, JSON.stringify(finalCart));

  // Sync back to active cart state in app.js if loaded
  if (typeof cart !== 'undefined') {
    cart.length = 0;
    cart.push(...finalCart);
    if (typeof updateCartCount === 'function') updateCartCount();
  }

  if (changed && supabaseClient) {
    try {
      await supabaseClient.auth.updateUser({ data: { cart: finalCart } });
    } catch(err) {
      console.error("Error syncing merged cart back to Supabase:", err);
    }
  }
}

function initSupabase() {
  if (window.supabase) {
    supabaseClient = window.supabase.createClient(
      KRIVVA_CONFIG.url,
      KRIVVA_CONFIG.anonKey
    );

    // Load products from Supabase
    if (typeof loadProductsFromSupabase === 'function') {
      loadProductsFromSupabase();
    }

    // Subscribe to stock realtime updates
    if (typeof subscribeStockChanges === 'function') {
      subscribeStockChanges();
    }

    // Load storefront settings and subscribe to real-time banner/headings updates
    if (typeof loadStorefrontSettings === 'function') {
      loadStorefrontSettings();
    }
    if (typeof subscribeStorefrontSettings === 'function') {
      subscribeStorefrontSettings();
    }

    // Auto-restore session on load and listen to auth changes dynamically
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        const u = session.user;
        currentUser = {
          name:  u.user_metadata?.full_name || u.email.split('@')[0],
          email: u.email,
          phone: u.user_metadata?.phone || '',
        };
        syncUserSessionData(u).then(() => {
          if (typeof loadWishlistFromSupabase === 'function') {
            loadWishlistFromSupabase();
          }
          updateUserNav();
          updateWelcomeBanner();
          if (typeof loadCartFromLocalStorage === 'function') {
            loadCartFromLocalStorage();
          }
        });
      } else {
        currentUser = null;
        updateUserNav();
        updateWelcomeBanner();
        if (typeof loadCartFromLocalStorage === 'function') {
          loadCartFromLocalStorage();
        }
      }
    });
  }
}

// ----- MODAL OPEN / CLOSE -----
let pendingCheckout = false;

function showAuthModal(ctx) {
  if (currentUser) { showUserMenu(); return; }
  pendingCheckout = (ctx === 'checkout');
  renderAuthForm('login');
  document.getElementById('auth-modal').classList.remove('hide');
}

function closeAuth() {
  document.getElementById('auth-modal').classList.add('hide');
}

// ----- TAB SWITCHER -----
function authTab(tab, el) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderAuthForm(tab);
}

// ----- RENDER FORM -----
function renderAuthForm(type) {
  const c = document.getElementById('auth-form-container');
  if (type === 'login') {
    c.innerHTML = `
      <div class="form-group">
        <label>Email</label>
        <input type="email" id="auth-email" placeholder="email@example.com"/>
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="auth-pass" placeholder="Password"/>
      </div>
      <button class="btn-gold" onclick="doLogin()" style="width:100%">Login</button>
      <div style="font-size:10px;color:var(--muted);text-align:center;margin-top:10px">
        Demo: any email + any password
      </div>`;
  } else {
    c.innerHTML = `
      <div class="form-group">
        <label>Full Name</label>
        <input type="text" id="auth-name" placeholder="Your name"/>
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" id="auth-email" placeholder="email@example.com"/>
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="auth-pass" placeholder="Create password"/>
      </div>
      <div class="form-group">
        <label>Phone</label>
        <input type="text" id="auth-phone" placeholder="10 digit number"/>
      </div>
      <button class="btn-gold" onclick="doSignup()" style="width:100%">Create Account</button>
      <div class="h-captcha" data-sitekey="10000000-ffff-ffff-ffff-000000000001" data-callback="onCaptchaSignedUp" style="margin-top:10px;display:flex;justify-content:center"></div>`;
  }
}

// ----- LOCAL DEMO AUTH -----
function doLogin() {
  const email = document.getElementById('auth-email').value.trim();
  const pass  = document.getElementById('auth-pass').value.trim();
  if (!email || !pass) { showToast('Please fill all fields', 'red'); return; }

  if (supabaseClient) {
    supabaseClient.auth.signInWithPassword({ email, password: pass })
      .then(async ({ data, error }) => {
        if (error) {
          showToast('Login error: ' + error.message, 'red');
        } else {
          const u = data.user;
          currentUser = {
            name:  u.user_metadata?.full_name || u.email.split('@')[0],
            email: u.email,
            phone: u.user_metadata?.phone || '',
          };
          await syncUserSessionData(u);
          afterLogin();
        }
      });
  } else {
    currentUser = { name: email.split('@')[0], email, phone: '' };
    afterLogin();
    showToast('Offline Demo Mode');
  }
}

let captchaToken = null;

function onCaptchaSignedUp(token) {
  captchaToken = token;
}

function doSignup() {
  const name  = document.getElementById('auth-name').value.trim();
  const email = document.getElementById('auth-email').value.trim();
  const pass  = document.getElementById('auth-pass').value.trim();
  const phone = document.getElementById('auth-phone')?.value || '';
  if (!name || !email || !pass) { showToast('Please fill all fields', 'red'); return; }
  if (!captchaToken) { showToast('Please complete the captcha', 'red'); return; }

  if (supabaseClient) {
    supabaseClient.auth.signUp({ email, password: pass, options: { data: { full_name: name, phone } } })
      .then(async ({ data, error }) => {
        if (error) {
          showToast('Signup error: ' + error.message, 'red');
        } else {
          if (data?.session) {
            const u = data.user;
            currentUser = {
              name: u.user_metadata?.full_name || name,
              email: u.email,
              phone: u.user_metadata?.phone || phone
            };
            await syncUserSessionData(u);
            afterLogin();
          } else {
            closeAuth();
            showToast('Account created! Please check your Gmail to confirm and verify your email.', 'green', 8000);
          }
        }
      });
  } else {
    currentUser = { name, email, phone };
    afterLogin();
  }
}

function socialLogin(provider) {
  if (supabaseClient && provider.toLowerCase() === 'google') {
    supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          prompt: 'select_account'
        }
      }
    }).then(({ error }) => {
      if (error) {
        showToast('Google login error: ' + error.message, 'red');
      }
    });
  } else {
    currentUser = {
      name:  provider + ' User',
      email: 'user@' + provider.toLowerCase() + '.com',
      phone: '',
    };
    afterLogin();
  }
}

// ----- POST-LOGIN ACTIONS -----
function afterLogin() {
  closeAuth();
  updateUserNav();
  updateWelcomeBanner();
  showToast('Welcome, ' + currentUser.name + '! 👗', 'green');
  if (typeof loadWishlistFromSupabase === 'function') {
    loadWishlistFromSupabase();
  }
  if (pendingCheckout) {
    pendingCheckout = false;
    const t = cart.reduce((a, b) => a + b.price * b.qty, 0);
    setTimeout(() => goCheckout(t), 400);
  }
}

// ----- NAV / HEADER STATE -----
function updateUserNav() {
  const area = document.getElementById('user-nav-area');
  if (!area) return;
  if (currentUser) {
    area.innerHTML = `<div class="user-avatar" onclick="showUserMenu()" title="${currentUser.name}">${currentUser.name[0].toUpperCase()}</div>`;
  } else {
    area.innerHTML = `<button class="nav-icon-btn" onclick="showAuthModal()" title="Login">👤</button>`;
  }
}

function updateWelcomeBanner() {
  const el = document.getElementById('welcome-user');
  if (!el) return;
  el.textContent = currentUser ? 'Welcome ' + currentUser.name : 'Welcome Guest';
}

function showUserMenu() {
  showPage('profile');
}

function populateProfilePage() {
  if (!currentUser) return;
  
  const greetingEl = document.getElementById('profile-greeting');
  if (greetingEl) {
    greetingEl.textContent = `Hello, ${currentUser.name}`;
  }
  
  const secEmail = document.getElementById('sec-email');
  if (secEmail) secEmail.textContent = currentUser.email;
  
  const secId = document.getElementById('sec-id');
  if (secId) {
    if (supabaseClient) {
      supabaseClient.auth.getUser().then(({ data: { user } }) => {
        if (user) secId.textContent = user.id;
      });
    } else {
      secId.textContent = 'demo-user-id';
    }
  }

  // Load address
  const savedAddress = localStorage.getItem(`profile_address_${currentUser.email}`);
  if (savedAddress) {
    try {
      const addr = JSON.parse(savedAddress);
      document.getElementById('prof-addr-name').value = addr.name || '';
      document.getElementById('prof-addr-phone').value = addr.phone || '';
      document.getElementById('prof-addr-street').value = addr.street || '';
      document.getElementById('prof-addr-city').value = addr.city || '';
      document.getElementById('prof-addr-pin').value = addr.pin || '';
    } catch (e) {
      console.error('Error parsing profile address:', e);
    }
  } else {
    document.getElementById('prof-addr-name').value = currentUser.name || '';
    document.getElementById('prof-addr-phone').value = '';
    document.getElementById('prof-addr-street').value = '';
    document.getElementById('prof-addr-city').value = '';
    document.getElementById('prof-addr-pin').value = '';
  }
}

function saveProfileAddress(event) {
  event.preventDefault();
  if (!currentUser) { showToast('Please log in first', 'red'); return; }
  
  const addressDetails = {
    name: document.getElementById('prof-addr-name').value.trim(),
    phone: document.getElementById('prof-addr-phone').value.trim(),
    street: document.getElementById('prof-addr-street').value.trim(),
    city: document.getElementById('prof-addr-city').value.trim(),
    pin: document.getElementById('prof-addr-pin').value.trim(),
  };

  localStorage.setItem(`profile_address_${currentUser.email}`, JSON.stringify(addressDetails));

  if (supabaseClient) {
    supabaseClient.auth.updateUser({
      data: { address: addressDetails }
    }).then(({ error }) => {
      if (error) {
        console.error("Error saving address to Supabase:", error);
        showToast('Address saved locally (Cloud sync failed)', 'coral');
      } else {
        showToast('Default shipping address saved to account! ✓', 'green');
      }
    });
  } else {
    showToast('Default shipping address saved successfully! ✓', 'green');
  }
}

function toggleSecurityInfo() {
  const details = document.getElementById('security-details');
  if (details) {
    details.classList.toggle('hide');
  }
}

function doLogout() {
  if (supabaseClient) {
    supabaseClient.auth.signOut().then(({ error }) => {
      if (error) {
        showToast('Logout error: ' + error.message, 'red');
      } else {
        // Clear all krivva_ localStorage keys
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('krivva_')) localStorage.removeItem(key);
        });
        currentUser = null;
        updateUserNav();
        updateWelcomeBanner();
        showToast('Logged out successfully', 'gold');
        showPage('home');
      }
    });
  } else {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('krivva_')) localStorage.removeItem(key);
    });
    currentUser = null;
    updateUserNav();
    updateWelcomeBanner();
    showToast('Logged out successfully (Demo)', 'gold');
    showPage('home');
  }
}

// ----- ADMIN AUTH -----
function adminLogin() {
  if (document.getElementById('admin-pass').value === 'krivva123') {
    document.getElementById('admin-login-section').classList.add('hide');
    document.getElementById('admin-panel').classList.remove('hide');
    renderAdminStats();
    renderAdminChart();
    renderLowStock();
    renderAdminOrders();
    renderAdminEditProducts();
    renderAdminAddProduct();
    renderAdminCoupons();
    renderAdminBanner();
  } else {
    showToast('Wrong password!', 'red');
  }
}

function handleAccountNav() {
  if (currentUser) {
    showPage('profile');
  } else {
    showAuthModal();
  }
}
