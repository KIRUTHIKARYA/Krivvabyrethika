// =============================================
// KRIVVA — Auth Module
// Handles both local (demo) auth and Supabase auth
// =============================================

// ----- SUPABASE CLIENT -----
// Initialised after the Supabase SDK script loads (see index.html)
let supabaseClient = null;

function initSupabase() {
  if (window.supabase) {
    supabaseClient = window.supabase.createClient(
      'https://lhsfxibmgamsxnhzdkao.supabase.co',
      'sb_publishable_J-kV5jiXlqQo5itAwTVShA_4jrkLyv8'
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
        if (typeof loadWishlistFromSupabase === 'function') {
          loadWishlistFromSupabase();
        }
      } else {
        currentUser = null;
      }
      updateUserNav();
      updateWelcomeBanner();
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
      <button class="btn-gold" onclick="doSignup()" style="width:100%">Create Account</button>`;
  }
}

// ----- LOCAL DEMO AUTH -----
function doLogin() {
  const email = document.getElementById('auth-email').value.trim();
  const pass  = document.getElementById('auth-pass').value.trim();
  if (!email || !pass) { showToast('Please fill all fields', 'red'); return; }

  // Try Supabase first; fall back to demo mode if SDK not loaded
  if (supabaseClient) {
    supabaseClient.auth.signInWithPassword({ email, password: pass })
      .then(({ data, error }) => {
        if (error) {
          // Supabase failed – fall back to demo mode so dev can still test
          currentUser = { name: email.split('@')[0], email, phone: '' };
          afterLogin();
          showToast('Demo mode (Supabase: ' + error.message + ')');
        } else {
          const u = data.user;
          currentUser = {
            name:  u.user_metadata?.full_name || u.email.split('@')[0],
            email: u.email,
            phone: '',
          };
          afterLogin();
        }
      });
  } else {
    // Pure demo fallback
    currentUser = { name: email.split('@')[0], email, phone: '' };
    afterLogin();
  }
}

function doSignup() {
  const name  = document.getElementById('auth-name').value.trim();
  const email = document.getElementById('auth-email').value.trim();
  const pass  = document.getElementById('auth-pass').value.trim();
  const phone = document.getElementById('auth-phone')?.value || '';
  if (!name || !email || !pass) { showToast('Please fill all fields', 'red'); return; }

  if (supabaseClient) {
    supabaseClient.auth.signUp({ email, password: pass, options: { data: { full_name: name, phone } } })
      .then(({ data, error }) => {
        if (error) {
          showToast('Signup error: ' + error.message, 'red');
        } else {
          currentUser = { name, email, phone };
          afterLogin();
          showToast('Account created! Check email to verify.', 'green');
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
        redirectTo: window.location.origin
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
  openProfileModal();
}

function openProfileModal() {
  if (!currentUser) return;
  const avatarEl = document.getElementById('profile-avatar');
  const nameEl = document.getElementById('profile-name');
  const emailEl = document.getElementById('profile-email');
  const phoneEl = document.getElementById('profile-phone');
  
  if (avatarEl) avatarEl.textContent = currentUser.name[0].toUpperCase();
  if (nameEl) nameEl.textContent = currentUser.name;
  if (emailEl) emailEl.textContent = currentUser.email;
  if (phoneEl) phoneEl.textContent = currentUser.phone ? '📞 ' + currentUser.phone : 'No phone number added';
  
  document.getElementById('profile-modal').classList.remove('hide');
}

function closeProfileModal() {
  document.getElementById('profile-modal').classList.add('hide');
}

function doLogout() {
  if (supabaseClient) {
    supabaseClient.auth.signOut().then(({ error }) => {
      if (error) {
        showToast('Logout error: ' + error.message, 'red');
      } else {
        currentUser = null;
        closeProfileModal();
        updateUserNav();
        updateWelcomeBanner();
        showToast('Logged out successfully', 'gold');
        showPage('home');
      }
    });
  } else {
    currentUser = null;
    closeProfileModal();
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
