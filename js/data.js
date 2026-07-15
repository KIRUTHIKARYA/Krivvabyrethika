// =============================================
// KRIVVA — Data Layer
// Products, Orders, Coupons & App State
// =============================================

// ----- CATEGORIES -----
const CATS = [
  { id: 'all',      name: 'All' },
  { id: 'new',      name: 'New Arrivals' },
  { id: 'trending', name: '🔥 Trending' },
  { id: 'kurti',    name: 'Kurtis' },
  { id: 'dress',    name: 'Dresses' },
  { id: 'coord',    name: 'Co-ords' },
  { id: 'ethnic',   name: 'Ethnic' },
  { id: 'casual',   name: 'Casual' },
  { id: 'winter',   name: 'Winter' },
];

// ----- PRODUCTS -----
let products = [
  {
    id: 1, name: 'Midnight Bloom Kurti', cat: 'kurti',
    mrp: 1899, offer: 0, photo: '', icon: '👘',
    isNew: true, isTrending: false,
    desc: 'Elegant black kurti with gold embroidery. Perfect for festive and casual occasions.',
    sizes: ['S', 'M', 'L', 'XL'], stock: 12,
    reviews: [
      { author: 'Priya S.',  stars: 5, text: 'Absolutely stunning! The quality is amazing.' },
      { author: 'Meera R.',  stars: 4, text: 'Very elegant, fits perfectly.' },
    ],
  },
  {
    id: 2, name: 'Golden Hour Dress', cat: 'dress',
    mrp: 3499, offer: 10, photo: '', icon: '👗',
    isNew: true, isTrending: true,
    desc: 'Flowy gold-accent evening dress, perfect for parties and special occasions.',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock: 5,
    reviews: [
      { author: 'Ananya K.', stars: 5, text: 'Got so many compliments wearing this!' },
      { author: 'Riya M.',   stars: 5, text: 'Worth every rupee!' },
    ],
  },
  {
    id: 3, name: 'Noir Co-ord Set', cat: 'coord',
    mrp: 4299, offer: 0, photo: '', icon: '🧥',
    isNew: false, isTrending: true,
    desc: 'Premium black co-ord set with belt. Sophisticated and modern styling.',
    sizes: ['S', 'M', 'L'], stock: 8,
    reviews: [
      { author: 'Divya P.', stars: 4, text: 'Very chic and modern look.' },
    ],
  },
  {
    id: 4, name: 'Royal Anarkali', cat: 'ethnic',
    mrp: 5999, offer: 15, photo: '', icon: '🥻',
    isNew: true, isTrending: true,
    desc: 'Regal anarkali with gold zari work. A showstopper for weddings and festivals.',
    sizes: ['S', 'M', 'L', 'XL'], stock: 3,
    reviews: [
      { author: 'Pooja V.',  stars: 5, text: 'Perfect for wedding season. Gorgeous!' },
      { author: 'Shruti A.', stars: 5, text: 'Received so many compliments!' },
    ],
  },
  {
    id: 5, name: 'Velvet Casual Top', cat: 'casual',
    mrp: 1299, offer: 0, photo: '', icon: '👕',
    isNew: false, isTrending: false,
    desc: 'Soft velvet casual top. Perfect for everyday comfort and style.',
    sizes: ['S', 'M', 'L', 'XL'], stock: 20,
    reviews: [
      { author: 'Nisha K.', stars: 4, text: 'Super soft and comfortable!' },
    ],
  },
  {
    id: 6, name: 'Embroidered Kurti Set', cat: 'kurti',
    mrp: 2599, offer: 20, photo: '', icon: '👘',
    isNew: false, isTrending: true,
    desc: 'Cotton kurti with palazzo. Comfortable for daily wear with a traditional touch.',
    sizes: ['M', 'L', 'XL'], stock: 15,
    reviews: [
      { author: 'Kavya M.', stars: 4, text: 'Great quality cotton fabric.' },
    ],
  },
  {
    id: 7, name: 'Wrap Maxi Dress', cat: 'dress',
    mrp: 2999, offer: 0, photo: '', icon: '👗',
    isNew: true, isTrending: false,
    desc: 'Elegant wrap style maxi dress. Versatile and sophisticated for any occasion.',
    sizes: ['S', 'M', 'L'], stock: 2,
    reviews: [],
  },
  {
    id: 8, name: 'Bridal Lehenga', cat: 'ethnic',
    mrp: 9999, offer: 30, photo: '', icon: '🥻',
    isNew: false, isTrending: true,
    desc: 'Heavy embroidered bridal lehenga with dupatta. A dream come true for brides.',
    sizes: ['S', 'M', 'L', 'XL'], stock: 4,
    reviews: [
      { author: 'Rashmi B.', stars: 5, text: 'My dream lehenga! Absolutely gorgeous!' },
    ],
  },
];

// ----- ORDERS -----
let orders = JSON.parse(localStorage.getItem('krivva_orders')) || [
  {
    id: 'KRV-001', name: 'Priya Sharma', phone: '9876543210',
    email: 'priya@email.com', addr: '12 MG Road', city: 'Pune', pin: '411001',
    items: [{ name: 'Golden Hour Dress', price: 3149, qty: 1, icon: '👗', size: 'M' }],
    total: 3149, status: 'dispatched', date: '2026-04-28',
    subtotal: 3149, discount: 0, shipping: 0, cgst: 0, sgst: 0
  },
  {
    id: 'KRV-002', name: 'Ananya Singh', phone: '9812345678',
    email: 'ananya@email.com', addr: '45 Park St', city: 'Mumbai', pin: '400001',
    items: [{ name: 'Royal Anarkali', price: 5099, qty: 1, icon: '🥻', size: 'L' }],
    total: 5099, status: 'delivered', date: '2026-04-25',
    subtotal: 5099, discount: 0, shipping: 0, cgst: 0, sgst: 0
  },
];

// ----- COUPONS -----
let coupons = [
  { code: 'KRIVVA10', discount: 10,  type: 'percent' },
  { code: 'FLAT200',  discount: 200, type: 'flat' },
  { code: 'NEW50',    discount: 50,  type: 'flat' },
];

// ----- APP STATE -----
let cart          = [];
let wishlist      = [];
let activeCat     = 'all';
let orderCount    = parseInt(localStorage.getItem('krivva_order_count')) || orders.length;
let currentUser   = null;
let selectedSizes = {};
let activeReviewProductId = null;
let appliedCoupon = null;
let newPhotoData  = '';

// Photo store: id → base64 or URL
const photoStore  = {};

// ----- HELPERS -----
/** Effective (discounted) price */
function ep(p) {
  return p.offer > 0 ? Math.round(p.mrp * (1 - p.offer / 100)) : p.mrp;
}

/** Get all photo URLs for a product */
function getProductPhotos(p) {
  const raw = photoStore[p.id] || p.photo || '';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

/** Get the best available photo for a product (always returns the first photo URL) */
function getPhoto(p) {
  const photos = getProductPhotos(p);
  return photos[0] || '';
}

/** Build an <img> or emoji fallback for a product */
function imgHTML(p, h = 160) {
  const ph = getPhoto(p);
  if (ph) return `<img src="${ph}" alt="${p.name}" style="width:100%;height:${h}px;object-fit:cover" onerror="this.style.display='none'"/>`;
  return `<span class="emoji-fb" style="font-size:${h > 100 ? 52 : 36}px">${p.icon}</span>`;
}

/** Show a brief toast notification */
function showToast(msg, type = 'gold') {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.style.borderLeftColor = type === 'green' ? 'var(--green)' : type === 'red' ? 'var(--red)' : 'var(--gold)';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

function saveOrders() {
  localStorage.setItem('krivva_orders', JSON.stringify(orders));
}

function getInvoiceId(orderId) {
  const num = orderId.replace(/\D/g, '');
  return `INV-${1000 + parseInt(num || 1, 10)}`;
}

async function viewInvoice(id) {
  const o = orders.find(x => x.id === id); if (!o) return;

  // Check if this is a UUID-based ecommerce order (synced with Supabase invoices)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  if (isUuid && typeof supabaseClient !== 'undefined' && supabaseClient) {
    try {
      // Try to fetch the invoice PDF URL from Supabase invoices table
      const { data: inv, error } = await supabaseClient
        .from('invoices')
        .select('id, pdf_url')
        .eq('id', id)
        .maybeSingle();

      if (!error && inv && inv.pdf_url) {
        // PDF already generated by inventory manager — open it directly
        window.open(inv.pdf_url, '_blank');
        return;
      }

      // No PDF yet — try the orders table for a pdf_url stored there
      const { data: ord } = await supabaseClient
        .from('orders')
        .select('id, pdf_url')
        .eq('id', id)
        .maybeSingle();

      if (ord && ord.pdf_url) {
        window.open(ord.pdf_url, '_blank');
        return;
      }
    } catch (err) {
      console.warn('Could not fetch invoice from Supabase, falling back to local renderer:', err);
    }
  }

  // Fallback: build the invoice locally using order data and open invoice.html
  const subtotal = o.subtotal || o.items.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const discount = o.discount || 0;
  const shipping = o.shipping !== undefined ? o.shipping : (o.total >= 999 ? 0 : 99);
  const cgst = o.cgst || 0;
  const sgst = o.sgst || 0;

  const orderData = {
    id: o.id,
    name: o.name,
    phone: o.phone,
    email: o.email,
    addr: o.addr,
    city: o.city,
    pin: o.pin,
    items: o.items,
    total: o.total,
    date: o.date,
    status: o.status,
    subtotal,
    discount,
    shipping,
    cgst,
    sgst
  };
  const dataStr = btoa(unescape(encodeURIComponent(JSON.stringify(orderData))));
  window.open(`invoice.html?data=${dataStr}`, '_blank');
}
