/* =============================================================
   Devoo — نظام تجاري متكامل | Enterprise Commerce Engine
   Architecture: CONFIG → DB → EventBus → Validator → Inventory
                 → Models → Analytics → Auth → Toast → Modal
                 → Cart UI → Public UI → Admin UI → Router → App
   ============================================================= */

'use strict';

/* ========================= LAYER 0: CONFIG ========================= */
const CONFIG = Object.freeze({
  brand: (window.Settings && Settings.get().storeName) || 'ديفو',
  currency: (window.Settings && Settings.get().currencyName) || 'EGP',
  currencySymbol: (window.Settings && Settings.get().currencySymbol) || 'ج.م',
  adminPassword: 'devoo2026',
  adminSessionMinutes: 60,
  maxLoginAttempts: 5,
  lockoutMinutes: 15,
  lowStockThreshold: 5,
  schemaVersion: 4,
  categories: ['المطبخ', 'الديكور', 'التنظيم', 'المنزل الذكي', 'الحمام'],
});

/* ========================= LAYER 0.5: PRICING ENGINE (Central Pricing Authority) =========================
   Single source of truth for all price/tax/shipping calculations across the app.
   Reads live values from Settings (js/core/settings.js) — never hardcodes tax/shipping numbers. */
const PricingEngine = (() => {
  const _settings = () => (window.Settings ? Settings.get() : {});

  const calcSubtotal = (items) =>
    (items || []).reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 0), 0);

  const calcTax = (subtotal) => {
    const s = _settings();
    if (!s.taxEnabled) return 0;
    const rate = Number(s.taxRate) || 0;
    return Math.round(subtotal * (rate / 100) * 100) / 100;
  };

  const calcShipping = (subtotal) => {
    const s = _settings();
    if (!subtotal || subtotal <= 0) return 0;
    if (!s.shippingEnabled) return 0;
    if (s.freeShippingEnabled && subtotal >= (Number(s.freeShippingThreshold) || 0)) return 0;
    return Number(s.shippingCost) || 0;
  };

  const calcTotal = ({ subtotal = 0, shippingFee = 0, tax = 0 } = {}) => subtotal + shippingFee + tax;

  const getTaxRate = () => {
    const s = _settings();
    return s.taxEnabled ? (Number(s.taxRate) || 0) : 0;
  };

  const getFreeShippingThreshold = () => Number(_settings().freeShippingThreshold) || 0;

  /** Compute full pricing breakdown for a list of { price, qty } items. */
  const calcOrderTotals = (items) => {
    const subtotal = calcSubtotal(items);
    const shippingFee = calcShipping(subtotal);
    const tax = calcTax(subtotal);
    const total = calcTotal({ subtotal, shippingFee, tax });
    return { subtotal, shippingFee, tax, total };
  };

  return { calcSubtotal, calcTax, calcShipping, calcTotal, calcOrderTotals, getTaxRate, getFreeShippingThreshold };
})();
window.PricingEngine = PricingEngine;

const KEYS = Object.freeze({
  products: 'devoo_products',
  orders: 'devoo_orders',
  customers: 'devoo_customers',
  reviews: 'devoo_reviews',
  session: 'devoo_admin_session',
  cart: 'devoo_cart',
  loginAttempts: 'devoo_login_attempts',
  schemaVersion: 'devoo_schema_version',
  backup: 'devoo_backup',
  expenses: 'devoo_expenses',
  invoices: 'devoo_invoices',
});

/* ===== Admin Expenses — general business expenses (rent, utilities,
   labor, marketing…), independent from invoices/orders. Used only to
   compute Net Profit (Sales Profit - Expenses) on Dashboard/Reports. ===== */
const EXPENSE_CATEGORIES = ['كهرباء', 'مياه', 'عمال', 'إيجار', 'تسويق', 'صيانة', 'مصروفات عامة', 'أخرى'];

const ORDER_STATUSES = ['draft', 'pending', 'confirmed', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];

/* Refund reasons — fixed list; 'سبب آخر' requires refundReasonNote. */
const REFUND_REASONS = [
  'العميل غير راضٍ عن المنتج',
  'المنتج تالف',
  'المنتج مختلف عن المطلوب',
  'المنتج غير مطابق للوصف',
  'تأخر التوصيل',
  'العميل غيّر رأيه',
  'مشكلة في المقاس/الكمية',
  'سبب آخر',
];
const REFUND_REASON_OTHER = 'سبب آخر';

const STATUS_LABEL = {
  draft: 'مسودة', pending: 'قيد الانتظار', confirmed: 'مؤكد',
  paid: 'مدفوع', processing: 'قيد التجهيز', shipped: 'تم الشحن',
  delivered: 'تم التوصيل', cancelled: 'ملغي', refunded: 'مسترد',
  // legacy
  new: 'جديد',
};

const STATUS_ICON = {
  draft:'📝', pending:'⏳', confirmed:'✅', paid:'💳',
  processing:'⚙️', shipped:'🚚', delivered:'🏠', cancelled:'❌', refunded:'↩️',
};

/* ===== Order Lifecycle — Order Status Registry =====
   Independent tracking stage for the order lifecycle feature. Lives on order.orderStage
   (separate from the existing order.status / paymentStatus workflow, which is untouched).
   Will be surfaced on the customer-facing order tracking page in a later phase. */
const ORDER_STAGES = ['received', 'confirmed', 'preparing', 'ready', 'shipping', 'delivered', 'cancelled'];

const ORDER_STAGE_LABEL = {
  received: 'تم استلام الطلب',
  confirmed: 'مؤكد',
  preparing: 'جاري التجهيز',
  ready: 'جاهز',
  shipping: 'قيد الشحن',
  delivered: 'تم التوصيل',
  cancelled: 'ملغي',
};

const ORDER_STAGE_ICON = {
  received: '📥', confirmed: '✅', preparing: '⚙️', ready: '📦',
  shipping: '🚚', delivered: '🏠', cancelled: '❌',
};

const ORDER_STAGE_FINAL = ['delivered', 'cancelled'];

/* ===== Payment Methods Registry =====
   Canonical payment data lives ONLY on order.paymentStatus ('unpaid' | 'paid')
   and order.paymentMethod ('cod' | 'wallet' | 'cash'). Legacy orders may have
   no paymentMethod (or an obsolete value) — those are shown as generic
   paid / unpaid labels; the historical method is never guessed. */
const PAYMENT_METHODS = ['cod', 'wallet', 'cash'];

const PAYMENT_METHOD_LABEL = {
  cod: 'الدفع عند التوصيل',
  wallet: 'تم الدفع — محفظة إلكترونية',
  cash: 'تم الدفع — كاش',
};

const PAYMENT_METHOD_ICON = {
  cod: '🚚', wallet: '💳', cash: '💵',
};

/* paymentStatus that each method implies when Admin picks it. */
const PAYMENT_METHOD_STATUS = { cod: 'unpaid', wallet: 'paid', cash: 'paid' };

const PAYMENT_LEGACY_LABEL = { paid: 'تم الدفع', unpaid: 'لم يتم الدفع بعد' };
const PAYMENT_LEGACY_ICON = { paid: '✔', unpaid: '⏳' };

const Payment = (() => {
  /* Effective method, or '' when the order has none (legacy data). Never guesses. */
  const getMethod = (order) => {
    const m = order?.paymentMethod;
    return m && PAYMENT_METHODS.includes(m) ? m : '';
  };
  const getStatus = (order) => (order?.paymentStatus === 'paid' ? 'paid' : 'unpaid');
  const getMethodLabel = (method) => PAYMENT_METHOD_LABEL[method] || '';
  const getMethodIcon = (method) => PAYMENT_METHOD_ICON[method] || '';
  /* THE single shared payment formatter — every UI must use this. */
  const getLabel = (order) => {
    const m = getMethod(order);
    if (m) return PAYMENT_METHOD_LABEL[m];
    return PAYMENT_LEGACY_LABEL[getStatus(order)];
  };
  const getIcon = (order) => {
    const m = getMethod(order);
    return m ? PAYMENT_METHOD_ICON[m] : PAYMENT_LEGACY_ICON[getStatus(order)];
  };
  const getBadgeClass = (order) => getMethod(order) || getStatus(order);
  const getStatusFor = (method) => PAYMENT_METHOD_STATUS[method] || 'unpaid';
  const isPaid = (order) => getStatus(order) === 'paid';
  const getAvailableMethods = () => PAYMENT_METHODS.slice();
  return {
    getMethod, getStatus, getMethodLabel, getMethodIcon, getLabel, getIcon,
    getBadgeClass, getStatusFor, isPaid, getAvailableMethods,
  };
})();

window.Payment = Payment;

/* Legacy order.status -> customer-facing order.orderStage mapping.
   Used ONLY to keep the two systems synced when Admin changes the
   legacy status; does not replace or duplicate the lifecycle system. */
const LEGACY_STATUS_TO_STAGE = {
  draft: 'received',
  pending: 'received',
  confirmed: 'confirmed',
  paid: 'confirmed',
  processing: 'preparing',
  shipped: 'shipping',
  delivered: 'delivered',
  cancelled: 'cancelled',
  refunded: 'cancelled',
};

/* ========================= LAYER 1: DB (Enterprise Storage Engine) ========================= */
const DB = (() => {
  const _safe = (fn, fallback) => {
    try { return fn(); }
    catch (e) { console.warn('[DB]', e.message); return fallback; }
  };

  const read = (key, fallback = null) => _safe(() => {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  }, fallback);

  const write = (key, value) => _safe(() => {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  }, false);

  const remove = (key) => _safe(() => { localStorage.removeItem(key); return true; }, false);

  const validate = () => {
    const issues = [];
    const products = read(KEYS.products, null);
    const orders = read(KEYS.orders, null);
    if (products !== null && !Array.isArray(products)) issues.push('products: corrupt');
    if (orders !== null && !Array.isArray(orders)) issues.push('orders: corrupt');
    return { valid: issues.length === 0, issues };
  };

  const repair = () => {
    const v = validate();
    if (v.valid) return true;
    v.issues.forEach(issue => {
      const key = issue.split(':')[0].trim();
      const mapping = {
        products: KEYS.products, orders: KEYS.orders,
        customers: KEYS.customers, reviews: KEYS.reviews,
        expenses: KEYS.expenses,
      };
      if (mapping[key]) { remove(mapping[key]); console.warn('[DB] Repaired:', key); }
    });
    return true;
  };

  /* Full project snapshot — products/orders/customers/reviews/expenses/invoices/
     settings, plus schema/version metadata. Stored to localStorage (for the
     no-UI restore path) AND downloaded as a real JSON file via Blob so the
     user has an actual backup outside localStorage. */
  const backup = () => {
    const snap = {
      backupVersion: 1,
      schemaVersion: read(KEYS.schemaVersion, CONFIG.schemaVersion),
      exportedAt: Date.now(),
      products: read(KEYS.products, []),
      orders: read(KEYS.orders, []),
      customers: read(KEYS.customers, []),
      reviews: read(KEYS.reviews, []),
      expenses: read(KEYS.expenses, []),
      invoices: read(KEYS.invoices, []),
      settings: window.Settings ? Settings.get() : {},
    };
    write(KEYS.backup, snap);

    _safe(() => {
      const pad = (n) => String(n).padStart(2, '0');
      const d = new Date();
      const fname = `devoo-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}.json`;
      const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fname;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, null);

    return snap;
  };

  /* Restores a snapshot produced by backup(). Accepts an explicit snapshot
     (e.g. parsed from an uploaded backup JSON file) or falls back to the
     last snapshot stored in localStorage. Refuses anything that isn't a
     valid Devoo backup (must be an object with backupVersion + at least
     one recognizable data array) rather than restoring a random file. */
  const restore = (snapshot) => {
    const snap = snapshot || read(KEYS.backup, null);
    if (!snap || typeof snap !== 'object' || Array.isArray(snap)) return false;
    if (!snap.backupVersion) return false;
    const hasCoreData = Array.isArray(snap.products) || Array.isArray(snap.orders)
      || Array.isArray(snap.customers) || Array.isArray(snap.invoices);
    if (!hasCoreData) return false;

    if (Array.isArray(snap.products)) write(KEYS.products, snap.products);
    if (Array.isArray(snap.orders)) write(KEYS.orders, snap.orders);
    if (Array.isArray(snap.customers)) write(KEYS.customers, snap.customers);
    if (Array.isArray(snap.reviews)) write(KEYS.reviews, snap.reviews);
    if (Array.isArray(snap.expenses)) write(KEYS.expenses, snap.expenses);
    if (Array.isArray(snap.invoices)) write(KEYS.invoices, snap.invoices);
    if (snap.settings && typeof snap.settings === 'object' && window.Settings) Settings.save(snap.settings);
    return true;
  };

  const factoryReset = () => {
    Object.values(KEYS).forEach(k => remove(k));
    // Settings live under their own key (js/core/settings.js), outside KEYS —
    // reuse the module's own reset() rather than guessing its storage key.
    if (window.Settings && typeof Settings.reset === 'function') Settings.reset();
  };

  const migrate = () => {
    const current = read(KEYS.schemaVersion, 1);
    if (current >= CONFIG.schemaVersion) return;

    // v1 -> v2: normalize order statuses (new -> pending)
    if (current < 2) {
      const orders = read(KEYS.orders, []);
      const migrated = orders.map(o => ({
        ...o,
        status: o.status === 'new' ? 'confirmed' : o.status,
        statusHistory: o.statusHistory || [{ status: o.status || 'confirmed', ts: o.createdAt || Date.now(), note: '' }],
        paymentStatus: o.paymentStatus || 'unpaid',
        // never invent a method for legacy orders — keep it missing if absent
        ...(o.paymentMethod ? { paymentMethod: o.paymentMethod } : {}),
        shippingFee: o.shippingFee || 0,
        tax: o.tax || 0,
        subtotal: o.subtotal || o.total || 0,
      }));
      write(KEYS.orders, migrated);
    }

    // v2 -> v3: add SKU/stock fields to products
    if (current < 3) {
      const products = read(KEYS.products, []);
      const migrated = products.map(p => ({
        ...p,
        sku: p.sku || `SKU-${p.id.slice(-6).toUpperCase()}`,
        reserved: p.reserved || 0,
      }));
      write(KEYS.products, migrated);
    }

    // v3 -> v4: backfill Order Lifecycle stage on orders created before this feature existed
    if (current < 4) {
      const orders = read(KEYS.orders, []);
      const migrated = orders.map(o => (o.orderStage ? o : {
        ...o,
        orderStage: 'received',
        orderStageLabel: ORDER_STAGE_LABEL.received,
        orderStageUpdatedAt: o.createdAt || Date.now(),
      }));
      write(KEYS.orders, migrated);
    }

    write(KEYS.schemaVersion, CONFIG.schemaVersion);
  };

  const init = () => {
    repair();
    migrate();
  };

  return { read, write, remove, validate, repair, backup, restore, factoryReset, migrate, init };
})();

/* ========================= LAYER 2: EVENT BUS (Pub/Sub) ========================= */
const EventBus = (() => {
  const _subs = {};
  const on = (event, fn) => {
    if (!_subs[event]) _subs[event] = [];
    _subs[event].push(fn);
    return () => { _subs[event] = _subs[event].filter(f => f !== fn); };
  };
  const emit = (event, data) => {
    (_subs[event] || []).forEach(fn => { try { fn(data); } catch (e) { console.error('[EventBus]', event, e); } });
  };
  return { on, emit };
})();

/* ========================= LAYER 3: UTILS ========================= */
const uid = (prefix = '') =>
  prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const arNum = n => {
  const fmt = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
  return fmt.format(Number(n) || 0);
};
const money = n => `${arNum(n)} ${CONFIG.currencySymbol}`;

const fmtDate = ts => {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
};

const fmtDateTime = ts => {
  if (!ts) return '';
  return new Date(ts).toLocaleString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const stars = (rating) => {
  const r = Math.max(0, Math.min(5, Math.round(rating || 0)));
  return '★★★★★'.slice(0, r) + '☆☆☆☆☆'.slice(0, 5 - r);
};

const debounce = (fn, ms = 200) => {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

const throttle = (fn, ms = 100) => {
  let last = 0;
  return (...a) => { const now = Date.now(); if (now - last >= ms) { last = now; fn(...a); } };
};

const stripHTML = s => String(s || '').replace(/<[^>]*>/g, '').trim();

/* ========================= LAYER 4: SEED DATA ========================= */
const SEED_PRODUCTS = [
  {
    name: 'هاون ومدقة من الرخام', category: 'المطبخ',
    description: 'طقم رخام كرارا الإيطالي الفاخر لطحن البهارات وتحضير البيستو.',
    features: ['رخام إيطالي أصلي', 'قاعدة لباد مانعة للانزلاق', 'تشطيب يدوي'],
    images: [
      'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80',
      'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=800&q=80',
    ],
    price: 749, oldPrice: 999, costPrice: 320, rating: 4.8, stock: 24,
  },
  {
    name: 'سلة تخزين من الكتان', category: 'التنظيم',
    description: 'سلة قابلة للطي بمقابض قطنية ناعمة، للملابس أو الألعاب.',
    features: ['تصميم قابل للطي', 'قابلة للغسل', 'سعة 40 لتر'],
    images: ['https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=800&q=80'],
    price: 449, oldPrice: 590, costPrice: 170, rating: 4.6, stock: 60,
  },
  {
    name: 'مزهرية سيراميك — رملية', category: 'الديكور',
    description: 'مزهرية مصنوعة يدوياً بتشطيب مطفي دافئ. مثالية مع نبات البامباس المجفف.',
    features: ['تصنيع يدوي', 'تشطيب مطفي', 'الارتفاع 28 سم'],
    images: ['https://images.unsplash.com/photo-1578500494198-246f612d3b3d?w=800&q=80'],
    price: 599, oldPrice: 0, costPrice: 210, rating: 4.9, stock: 18,
  },
  {
    name: 'لمبة LED ذكية (واي فاي)', category: 'المنزل الذكي',
    description: 'لمبة ذكية بألوان وإضاءة قابلة للضبط — تعمل مع أليكسا وجوجل هوم.',
    features: ['16 مليون لون', 'تحكم صوتي', 'جدولة ومشاهد'],
    images: ['https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800&q=80'],
    price: 220, oldPrice: 350, costPrice: 90, rating: 4.5, stock: 120,
  },
  {
    name: 'منظم أدراج من الخيزران', category: 'المطبخ',
    description: 'منظم قابل للتوسيع بخمسة أقسام عملية، من الخيزران المستدام.',
    features: ['يتوسع من 30 إلى 46 سم', 'خيزران مستدام', 'لباد مانع للانزلاق'],
    images: ['https://images.unsplash.com/photo-1556909114-31bf09f64fec?w=800&q=80'],
    price: 489, oldPrice: 620, costPrice: 195, rating: 4.7, stock: 36,
  },
  {
    name: 'ساعة حائط بسيطة', category: 'الديكور',
    description: 'ساعة حائط بحركة صامتة وعقارب من الألومنيوم المصقول.',
    features: ['حركة صامتة', 'القطر 30 سم', 'بطارية AA مرفقة'],
    images: ['https://images.unsplash.com/photo-1495364141860-b0d03eccd065?w=800&q=80'],
    price: 380, oldPrice: 0, costPrice: 140, rating: 4.4, stock: 50,
  },
  {
    name: 'موزع زيوت عطرية — حجري', category: 'المنزل الذكي',
    description: 'موزع بالموجات فوق الصوتية بـ 7 ألوان دافئة وإيقاف تلقائي.',
    features: ['خزان 300 مل', 'تشغيل 8 ساعات', 'خالي من BPA'],
    images: ['https://images.unsplash.com/photo-1602928298849-325cec8771c0?w=800&q=80'],
    price: 549, oldPrice: 750, costPrice: 210, rating: 4.7, stock: 42,
  },
  {
    name: 'طقم مناشف قطنية', category: 'الحمام',
    description: 'مناشف قطنية خفيفة بلون أخضر مريح. الطقم يحتوي قطعتين.',
    features: ['قطن 100%', 'سريعة الجفاف', 'معتمدة Oeko-Tex'],
    images: ['https://images.unsplash.com/photo-1620626011761-996317b8d101?w=800&q=80'],
    price: 440, oldPrice: 580, costPrice: 180, rating: 4.6, stock: 70,
  },
];

const SEED_REVIEWS = [
  { name: 'لينا ك.', rating: 5, comment: 'المزهرية الجديدة رائعة — التشطيب المطفي جميل جداً.', image: '' },
  { name: 'دانيال س.', rating: 5, comment: 'اللمبة الذكية اتربطت في 30 ثانية، والإضاءة الدافئة مريحة جداً.', image: '' },
  { name: 'ميرا ع.', rating: 4, comment: 'منظم الخيزران ضبط الدرج بشكل ممتاز. الخامة ممتازة.', image: '' },
];

/* ========================= LAYER 5: VALIDATION ENGINE ========================= */
const Validator = (() => {
  const RULES = {
    name: v => {
      const s = stripHTML(v);
      if (!s || s.length < 2) return 'من فضلك أدخل اسمك بالكامل.';
      if (s.length > 100) return 'الاسم طويل جداً.';
      return null;
    },
    phone: v => {
      const s = String(v || '').replace(/\s/g, '');
      if (!s) return 'رقم الهاتف مطلوب.';
      if (!/^[\d+()\-٠-٩]{7,15}$/.test(s)) return 'رقم الهاتف غير صحيح.';
      return null;
    },
    address: v => {
      const s = stripHTML(v);
      if (!s || s.length < 4) return 'أدخل عنوان التسليم.';
      if (s.length > 300) return 'العنوان طويل جداً.';
      return null;
    },
    city: v => {
      const s = stripHTML(v);
      if (!s || s.length < 2) return 'أدخل اسم المدينة.';
      return null;
    },
    price: v => {
      const n = Number(v);
      if (isNaN(n) || n < 0) return 'السعر غير صحيح.';
      if (n > 1000000) return 'السعر مرتفع جداً.';
      return null;
    },
    stock: v => {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0) return 'الكمية يجب أن تكون صحيحاً غير سالب.';
      if (n > 99999) return 'الكمية مرتفعة جداً.';
      return null;
    },
    qty: v => {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1) return 'الكمية يجب أن تكون 1 على الأقل.';
      if (n > 99) return 'الكمية مرتفعة جداً.';
      return null;
    },
    comment: v => {
      const s = stripHTML(v);
      if (!s || s.length < 4) return 'اكتب بضع كلمات على الأقل.';
      if (s.length > 1000) return 'التعليق طويل جداً.';
      return null;
    },
    productName: v => {
      const s = stripHTML(v);
      if (!s || s.length < 2) return 'اسم المنتج مطلوب.';
      if (s.length > 200) return 'الاسم طويل جداً.';
      return null;
    },
  };

  const field = (ruleName, value) => (RULES[ruleName] ? RULES[ruleName](value) : null);

  const form = (fields) => {
    const errors = {};
    Object.entries(fields).forEach(([rule, value]) => {
      const err = field(rule, value);
      if (err) errors[rule] = err;
    });
    return errors;
  };

  const applyErrors = (formEl, errors) => {
    formEl.querySelectorAll('.field-err').forEach(e => e.textContent = '');
    formEl.querySelectorAll('input,select,textarea').forEach(el => el.classList.remove('error'));
    Object.entries(errors).forEach(([name, msg]) => {
      const input = formEl.querySelector(`[name="${name}"]`);
      if (input) {
        input.classList.add('error');
        const errEl = input.nextElementSibling;
        if (errEl && errEl.classList.contains('field-err')) errEl.textContent = msg;
      }
    });
  };

  return { field, form, applyErrors };
})();

/* ========================= LAYER 6: INVENTORY ENGINE ========================= */
const Inventory = (() => {
  const available = (product) => Math.max(0, (product.stock || 0) - (product.reserved || 0));

  const isAvailable = (productId, qty = 1) => {
    const p = Products.get(productId);
    if (!p) return false;
    return available(p) >= qty;
  };

  const reserve = (productId, qty) => {
    const all = Products.list();
    const i = all.findIndex(p => p.id === productId);
    if (i === -1) return false;
    const avail = available(all[i]);
    if (avail < qty) return false;
    all[i].reserved = (all[i].reserved || 0) + qty;
    Products.save(all);
    EventBus.emit('inventory:changed', { productId, type: 'reserve', qty });
    return true;
  };

  const release = (productId, qty) => {
    const all = Products.list();
    const i = all.findIndex(p => p.id === productId);
    if (i === -1) return;
    all[i].reserved = Math.max(0, (all[i].reserved || 0) - qty);
    Products.save(all);
    EventBus.emit('inventory:changed', { productId, type: 'release', qty });
  };

  const deduct = (productId, qty) => {
    const all = Products.list();
    const i = all.findIndex(p => p.id === productId);
    if (i === -1) return false;
    if (all[i].stock < qty) return false;
    all[i].stock = Math.max(0, all[i].stock - qty);
    all[i].reserved = Math.max(0, (all[i].reserved || 0) - qty);
    Products.save(all);
    EventBus.emit('inventory:changed', { productId, type: 'deduct', qty });
    return true;
  };

  const restore = (productId, qty) => {
    const all = Products.list();
    const i = all.findIndex(p => p.id === productId);
    if (i === -1) return;
    all[i].stock = (all[i].stock || 0) + qty;
    Products.save(all);
    EventBus.emit('inventory:changed', { productId, type: 'restore', qty });
  };

  const getLowStock = () => Products.list().filter(p => p.stock > 0 && p.stock <= CONFIG.lowStockThreshold);
  const getOutOfStock = () => Products.list().filter(p => (p.stock || 0) === 0);

  return { available, isAvailable, reserve, release, deduct, restore, getLowStock, getOutOfStock };
})();

/* ========================= LAYER 7: MODELS ========================= */

/* --- Products --- */
const Products = (() => {
  const list = () => DB.read(KEYS.products, []);
  const get = (id) => list().find(p => p.id === id) || null;
  const save = (all) => { DB.write(KEYS.products, all); EventBus.emit('products:changed'); };

  const _normalize = (p) => ({
    id: p.id || uid('p_'),
    sku: p.sku || `SKU-${(p.id || uid()).slice(-6).toUpperCase()}`,
    name: stripHTML(String(p.name || '')).trim(),
    category: stripHTML(String(p.category || '')).trim(),
    description: stripHTML(String(p.description || '')),
    features: Array.isArray(p.features) ? p.features.map(f => stripHTML(String(f))) :
      String(p.features || '').split('\n').map(s => stripHTML(s)).filter(Boolean),
    images: Array.isArray(p.images) ? p.images.map(s => String(s).trim()).filter(Boolean) :
      String(p.images || '').split('\n').map(s => s.trim()).filter(Boolean),
    price: Math.max(0, Number(p.price) || 0),
    oldPrice: Math.max(0, Number(p.oldPrice) || 0),
    costPrice: Math.max(0, Number(p.costPrice) || 0),
    rating: Math.max(0, Math.min(5, Number(p.rating) || 0)),
    stock: Math.max(0, Math.floor(Number(p.stock) || 0)),
    reserved: Math.max(0, Math.floor(Number(p.reserved) || 0)),
    createdAt: p.createdAt || Date.now(),
    updatedAt: p.updatedAt || Date.now(),
  });

  const create = (data) => {
    const p = _normalize({ id: uid('p_'), createdAt: Date.now(), updatedAt: Date.now(), ...data });
    const all = list(); all.unshift(p); save(all); return p;
  };

  const update = (id, patch) => {
    const all = list();
    const i = all.findIndex(p => p.id === id);
    if (i === -1) return null;
    all[i] = _normalize({ ...all[i], ...patch, id, updatedAt: Date.now() });
    save(all); return all[i];
  };

  const remove = (id) => { save(list().filter(p => p.id !== id)); };

  const seedIfEmpty = () => {
    if (list().length === 0) {
      save(SEED_PRODUCTS.map(s => _normalize({
        id: uid('p_'), createdAt: Date.now() - Math.random() * 1e9, ...s,
      })));
    }
  };

  return { list, get, save, create, update, remove, seedIfEmpty, _normalize };
})();

/* --- Customers --- */
const Customers = (() => {
  const list = () => DB.read(KEYS.customers, []);
  const save = (all) => { DB.write(KEYS.customers, all); EventBus.emit('customers:changed'); };

  const upsert = (info) => {
    const all = list();
    const phone = String(info.phone || '').trim().replace(/\s/g, '');
    let rec = all.find(c => c.phone === phone);
    if (rec) {
      if (info.name) rec.name = stripHTML(info.name);
      if (info.address) rec.address = stripHTML(info.address);
      if (info.city) rec.city = stripHTML(info.city);
      rec.updatedAt = Date.now();
    } else {
      rec = {
        id: uid('c_'),
        name: stripHTML(info.name || ''), phone,
        address: stripHTML(info.address || ''),
        city: stripHTML(info.city || ''),
        ordersCount: 0, totalSpent: 0,
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      all.push(rec);
    }
    save(all);
    return rec;
  };

  const recompute = () => {
    const all = list();
    const orders = Orders.list();
    all.forEach(c => {
      const mine = orders.filter(o => o.customerId === c.id && !['cancelled', 'refunded'].includes(o.status));
      c.ordersCount = mine.length;
      c.totalSpent = mine.reduce((s, o) => s + (o.total || 0), 0);
    });
    save(all);
  };

  const remove = (id) => { save(list().filter(c => c.id !== id)); };

  return { list, save, upsert, recompute, remove };
})();

/* --- Orders --- */
const Orders = (() => {
  const list = () => DB.read(KEYS.orders, []);
  const get = (id) => list().find(o => o.id === id) || null;
  const save = (all) => { DB.write(KEYS.orders, all); EventBus.emit('orders:changed'); };

  const _calcTotals = (items) => {
    const { subtotal, shippingFee, tax, total } = PricingEngine.calcOrderTotals(items);
    const profit = items.reduce((s, i) => s + (i.price - (i.costPrice || 0)) * i.qty, 0) - shippingFee;
    return { subtotal, shippingFee, tax, total, profit };
  };

  /* ===== Order Number System — sequential, human-friendly order numbers (DV-000001, DV-000002, ...)
     No new localStorage key: the next number is derived from the existing devoo_orders records,
     reusing the same storage already used for orders. */
  const ORDER_NUMBER_PREFIX = 'DV-';
  const ORDER_NUMBER_PAD = 6;

  const _orderNumberSeq = (orderNumber) => {
    const m = /^DV-(\d+)$/.exec(String(orderNumber || ''));
    return m ? parseInt(m[1], 10) : 0;
  };

  const _nextOrderNumber = (all) => {
    const arr = all || list();
    const maxSeq = arr.reduce((max, o) => Math.max(max, _orderNumberSeq(o.orderNumber)), 0);
    return ORDER_NUMBER_PREFIX + String(maxSeq + 1).padStart(ORDER_NUMBER_PAD, '0');
  };

  /* One-time safe migration: any existing order missing orderNumber gets one, in chronological
     order, continuing from the current max. Existing data/fields are left untouched. */
  const migrateOrderNumbers = () => {
    const all = list();
    const missing = all.filter(o => !o.orderNumber);
    if (missing.length === 0) return;
    missing.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    let seq = all.reduce((max, o) => Math.max(max, _orderNumberSeq(o.orderNumber)), 0);
    missing.forEach(o => {
      seq += 1;
      o.orderNumber = ORDER_NUMBER_PREFIX + String(seq).padStart(ORDER_NUMBER_PAD, '0');
    });
    save(all);
  };

  const create = ({ customer, items, notes = '', source = 'storefront' }) => {
    if (!items || items.length === 0) throw new Error('لا توجد منتجات في الطلب.');

    const customerRec = Customers.upsert(customer);

    const snapItems = items.map(it => {
      const p = Products.get(it.productId);
      if (!p) return null;
      const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
      if (Inventory.available(p) < qty) throw new Error(`المخزون غير كافٍ للمنتج: ${p.name}`);
      return {
        productId: p.id, name: p.name,
        image: (p.images || [])[0] || '',
        qty, price: p.price, costPrice: p.costPrice || 0,
      };
    }).filter(Boolean);

    if (snapItems.length === 0) throw new Error('منتجات غير متاحة.');

    const { subtotal, shippingFee, tax, total, profit } = _calcTotals(snapItems);
    const now = Date.now();

    const order = {
      id: uid('o_'),
      orderNumber: _nextOrderNumber(),
      customerId: customerRec.id,
      customerSnapshot: {
        name: customerRec.name, phone: customerRec.phone,
        address: customerRec.address, city: customerRec.city,
      },
      items: snapItems,
      subtotal, shippingFee, tax, total, profit,
      status: 'confirmed',
      paymentStatus: 'unpaid',
      paymentMethod: 'cod',
      statusHistory: [{ status: 'confirmed', ts: now, note: 'تم إنشاء الطلب' }],
      orderStage: 'received',
      orderStageLabel: ORDER_STAGE_LABEL.received,
      orderStageUpdatedAt: now,
      notes: stripHTML(String(notes || '')),
      source,
      createdAt: now,
      updatedAt: now,
    };

    // Reserve inventory
    snapItems.forEach(i => Inventory.reserve(i.productId, i.qty));

    const all = list(); all.unshift(order); save(all);
    Customers.recompute();
    EventBus.emit('order:created', order);
    return order;
  };

  const updateStatus = (id, status, note = '') => {
    if (!ORDER_STATUSES.includes(status)) throw new Error('حالة غير صحيحة.');
    const all = list();
    const o = all.find(x => x.id === id);
    if (!o) throw new Error('الطلب غير موجود.');

    const prev = o.status;
    o.status = status;
    o.updatedAt = Date.now();
    o.statusHistory = o.statusHistory || [];
    o.statusHistory.push({ status, ts: Date.now(), note });

    // Inventory side effects
    if (status === 'delivered') {
      // Deduct from stock (releases reservation + actual stock)
      o.items.forEach(i => Inventory.deduct(i.productId, i.qty));
    } else if (['cancelled', 'refunded'].includes(status) && !['cancelled', 'refunded'].includes(prev)) {
      // Release reservation on cancel/refund
      o.items.forEach(i => Inventory.release(i.productId, i.qty));
      if (status === 'refunded') Inventory.restore && o.items.forEach(i => Inventory.restore(i.productId, i.qty));
    }

    // Keep the customer-facing lifecycle (order.orderStage) in sync with
    // whatever legacy status Admin just set, using the fixed mapping.
    // This is the ONLY place legacy status is translated into a stage;
    // it does not create a second status system and never touches
    // order.status/order.statusHistory.
    const mappedStage = LEGACY_STATUS_TO_STAGE[status];
    if (mappedStage && o.orderStage !== mappedStage && !ORDER_STAGE_FINAL.includes(o.orderStage)) {
      o.orderStage = mappedStage;
      o.orderStageLabel = ORDER_STAGE_LABEL[mappedStage];
      o.orderStageUpdatedAt = Date.now();
    }

    save(all);
    Customers.recompute();
    EventBus.emit('order:statusChanged', { id, prev, status });
    if (mappedStage) EventBus.emit('order:stageChanged', { id, stage: o.orderStage, note: 'synced-from-legacy-status' });
    return o;
  };

  /* Payment is fully independent from the order lifecycle: this never touches
     order.orderStage (and OrderLifecycle never touches payment fields). */
  const updatePayment = (id, paymentStatus, paymentMethod) => {
    const all = list();
    const o = all.find(x => x.id === id);
    if (!o) return;
    if (['cancelled', 'refunded'].includes(o.status) || o.orderStage === 'cancelled' || o.refunded === true) throw new Error('لا يمكن تعديل الدفع لطلب ملغي أو مسترد.');
    if (!['paid', 'unpaid'].includes(paymentStatus)) throw new Error('حالة دفع غير صحيحة.');
    o.paymentStatus = paymentStatus;
    if (paymentMethod !== undefined && paymentMethod !== null && paymentMethod !== '') {
      if (!PAYMENT_METHODS.includes(paymentMethod)) throw new Error('طريقة دفع غير صحيحة.');
      o.paymentMethod = paymentMethod;
    }
    o.updatedAt = Date.now();
    save(all);
    EventBus.emit('order:paymentChanged', { id, paymentStatus: o.paymentStatus, paymentMethod: o.paymentMethod || '' });
    return o;
  };

  const remove = (id) => {
    const o = get(id);
    if (o && !['cancelled', 'delivered'].includes(o.status)) {
      o.items.forEach(i => Inventory.release(i.productId, i.qty));
    }
    save(list().filter(o => o.id !== id));
    Customers.recompute();
  };

  /* Refund — only for orders already delivered and paid, once. Keeps full
     history (never deletes the order); marks it with status='refunded' so
     the existing Finance.isFinancialOrder() exclusion (already keys off
     order.status !== 'refunded') removes it from revenue/cost/profit/
     reports/top-products with no changes needed there. */
  const refund = (id, refundShippingCost = 0, refundReason = '', refundReasonNote = '', refundShippingPaidBy = 'customer') => {
    const all = list();
    const o = all.find(x => x.id === id);
    if (!o) throw new Error('الطلب غير موجود.');
    if ((o.orderStage || 'received') !== 'delivered') throw new Error('لا يمكن استرداد طلب لم يتم تسليمه بعد.');
    if (o.paymentStatus !== 'paid') throw new Error('لا يمكن استرداد طلب غير مدفوع.');
    if (o.refunded) throw new Error('تم استرداد هذا الطلب من قبل.');
    if (!refundReason || !REFUND_REASONS.includes(refundReason)) throw new Error('سبب الاسترداد إلزامي.');
    if (refundReason === REFUND_REASON_OTHER && !String(refundReasonNote || '').trim()) throw new Error('يرجى كتابة ملاحظة عند اختيار "سبب آخر".');

    const now = Date.now();
    o.refunded = true;
    o.refundedAt = now;
    o.refundShippingCost = Math.max(0, Number(refundShippingCost) || 0);
    o.refundShippingPaidBy = refundShippingPaidBy === 'store' ? 'store' : 'customer';
    o.refundReason = refundReason;
    o.refundReasonNote = refundReason === REFUND_REASON_OTHER ? String(refundReasonNote || '').trim() : '';
    o.status = 'refunded';
    o.updatedAt = now;
    o.statusHistory = o.statusHistory || [];
    o.statusHistory.push({ status: 'refunded', ts: now, note: 'استرداد الطلب: ' + refundReason });

    save(all);
    Customers.recompute();
    EventBus.emit('order:refunded', { id, refundShippingCost: o.refundShippingCost, refundShippingPaidBy: o.refundShippingPaidBy, refundReason: o.refundReason });
    return o;
  };

  const filter = ({ status, stage, search, dateFrom, dateTo } = {}) => {
    let arr = list();
    if (status) arr = arr.filter(o => o.status === status);
    if (stage) arr = arr.filter(o => (o.orderStage || 'received') === stage);
    if (search) {
      const q = search.toLowerCase();
      arr = arr.filter(o =>
        o.id.toLowerCase().includes(q) ||
        (o.customerSnapshot?.name || '').toLowerCase().includes(q) ||
        (o.customerSnapshot?.phone || '').includes(q)
      );
    }
    if (dateFrom) arr = arr.filter(o => o.createdAt >= dateFrom);
    if (dateTo) arr = arr.filter(o => o.createdAt <= dateTo);
    return arr;
  };

  return { list, get, save, create, updateStatus, updatePayment, remove, refund, filter, migrateOrderNumbers };
})();

/* ===== Order Lifecycle — central status functions (order.orderStage only) ===== */
const OrderLifecycle = (() => {
  const getAvailableStatuses = () => ORDER_STAGES.slice();
  /* Forward-only options for the Admin transition control: only the current
     stage's index and later ('cancelled' always sorts last so it stays a
     valid option throughout). Never surfaces an earlier stage. */
  const getNextStatuses = (currentStage) => {
    const cur = currentStage || 'received';
    const curIdx = ORDER_STAGES.indexOf(cur);
    return ORDER_STAGES.filter(s => s !== cur && ORDER_STAGES.indexOf(s) >= curIdx);
  };
  const getStatusLabel = (stage) => ORDER_STAGE_LABEL[stage] || stage;
  const getStatusIcon = (stage) => ORDER_STAGE_ICON[stage] || '';
  const isFinal = (stage) => ORDER_STAGE_FINAL.includes(stage);

  const updateOrderStatus = (id, stage, note = '') => {
    if (!ORDER_STAGES.includes(stage)) throw new Error('حالة غير صحيحة.');
    const all = Orders.list();
    const o = all.find(x => x.id === id);
    if (!o) throw new Error('الطلب غير موجود.');
    const current = o.orderStage || 'received';
    if (ORDER_STAGE_FINAL.includes(current)) {
      throw new Error('لا يمكن تغيير حالة طلب وصل لمرحلة نهائية.');
    }
    // Forward-only: index(newStage) >= index(currentStage). 'cancelled' is
    // always last in ORDER_STAGES so cancelling remains available.
    if (ORDER_STAGES.indexOf(stage) < ORDER_STAGES.indexOf(current)) {
      throw new Error('لا يمكن الرجوع إلى مرحلة سابقة.');
    }
    // Delivered requires payment already confirmed.
    if (stage === 'delivered' && o.paymentStatus !== 'paid') {
      throw new Error('لا يمكن تسليم الطلب قبل تأكيد الدفع.');
    }

    const now = Date.now();
    o.orderStage = stage;
    o.orderStageLabel = ORDER_STAGE_LABEL[stage];
    o.orderStageUpdatedAt = now;
    o.updatedAt = now;

    Orders.save(all);
    EventBus.emit('order:stageChanged', { id, stage, note });
    return o;
  };

  return { getAvailableStatuses, getNextStatuses, getStatusLabel, getStatusIcon, isFinal, updateOrderStatus };
})();

window.OrderLifecycle = OrderLifecycle;

/* --- Cart --- */
const Cart = (() => {
  const _load = () => DB.read(KEYS.cart, { items: [], savedAt: null });
  const _save = (cart) => {
    cart.savedAt = Date.now();
    DB.write(KEYS.cart, cart);
    EventBus.emit('cart:changed', cart);
  };

  const getItems = () => _load().items || [];

  const count = () => getItems().reduce((s, i) => s + i.qty, 0);

  const totals = () => {
    const items = getItems().map(i => {
      const p = Products.get(i.productId);
      return p ? { ...i, price: p.price, costPrice: p.costPrice || 0 } : null;
    }).filter(Boolean);
    const { subtotal, shippingFee, tax, total } = PricingEngine.calcOrderTotals(items);
    return { subtotal, shippingFee, tax, total, itemCount: count() };
  };

  const add = (productId, qty = 1) => {
    const p = Products.get(productId);
    if (!p) return { ok: false, error: 'المنتج غير موجود.' };
    const avail = Inventory.available(p);
    const cart = _load();
    const existing = cart.items.find(i => i.productId === productId);
    const currentQty = existing ? existing.qty : 0;
    if (currentQty + qty > avail) {
      return { ok: false, error: avail === 0 ? 'المنتج غير متاح.' : `المتاح فقط ${arNum(avail)} قطعة.` };
    }
    if (existing) {
      existing.qty += qty;
    } else {
      cart.items.push({ productId, qty, addedAt: Date.now() });
    }
    _save(cart);
    return { ok: true };
  };

  const setQty = (productId, qty) => {
    if (qty <= 0) return remove(productId);
    const p = Products.get(productId);
    if (!p) return { ok: false, error: 'المنتج غير موجود.' };
    const avail = Inventory.available(p);
    if (qty > avail) return { ok: false, error: `المتاح فقط ${arNum(avail)} قطعة.` };
    const cart = _load();
    const item = cart.items.find(i => i.productId === productId);
    if (item) item.qty = qty;
    _save(cart);
    return { ok: true };
  };

  const remove = (productId) => {
    const cart = _load();
    cart.items = cart.items.filter(i => i.productId !== productId);
    _save(cart);
  };

  const clear = () => _save({ items: [], savedAt: null });

  const validate = () => {
    const items = getItems();
    const issues = [];
    items.forEach(i => {
      const p = Products.get(i.productId);
      if (!p) { issues.push({ productId: i.productId, error: 'منتج غير موجود.' }); return; }
      const avail = Inventory.available(p);
      if (avail < i.qty) issues.push({ productId: i.productId, name: p.name, error: `المتاح فقط ${arNum(avail)} قطعة.`, avail });
    });
    return { valid: issues.length === 0, issues };
  };

  const checkout = ({ customer, notes = '' }) => {
    const validation = validate();
    if (!validation.valid) throw new Error(validation.issues.map(i => i.error).join(' | '));
    const items = getItems().filter(i => Products.get(i.productId));
    if (items.length === 0) throw new Error('السلة فارغة.');
    const order = Orders.create({ customer, items, notes, source: 'cart' });
    clear();
    return order;
  };

  return { getItems, count, totals, add, setQty, remove, clear, validate, checkout };
})();

/* --- Reviews --- */
const Reviews = (() => {
  const list = () => DB.read(KEYS.reviews, []);
  const save = (all) => { DB.write(KEYS.reviews, all); EventBus.emit('reviews:changed'); };

  const create = (data) => {
    const r = {
      id: uid('r_'),
      name: stripHTML(String(data.name || '')).trim(),
      rating: Math.max(1, Math.min(5, Number(data.rating) || 5)),
      comment: stripHTML(String(data.comment || '')).trim(),
      image: String(data.image || '').trim(),
      productId: data.productId || null,
      createdAt: Date.now(),
    };
    const all = list(); all.unshift(r); save(all); return r;
  };

  const remove = (id) => { save(list().filter(r => r.id !== id)); };

  const seedIfEmpty = () => {
    if (list().length === 0) {
      save(SEED_REVIEWS.map(s => ({
        id: uid('r_'), createdAt: Date.now() - Math.random() * 1e9, productId: null, ...s,
      })));
    }
  };

  return { list, save, create, remove, seedIfEmpty };
})();

/* --- Expenses (Admin-only) --- */
const Expenses = (() => {
  const list = () => DB.read(KEYS.expenses, []);
  const save = (all) => { DB.write(KEYS.expenses, all); EventBus.emit('expenses:changed'); };
  const get = (id) => list().find(e => e.id === id) || null;

  const _normalize = (data) => ({
    category: EXPENSE_CATEGORIES.includes(data.category) ? data.category : 'أخرى',
    amount: Math.max(0, Number(data.amount) || 0),
    date: Number(data.date) || Date.now(),
    notes: stripHTML(String(data.notes || '')).trim(),
  });

  const create = (data) => {
    const e = { id: uid('exp_'), createdAt: Date.now(), ..._normalize(data) };
    const all = list(); all.unshift(e); save(all); return e;
  };

  const update = (id, data) => {
    const all = list();
    const idx = all.findIndex(e => e.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ..._normalize(data) };
    save(all);
    return all[idx];
  };

  const remove = (id) => { save(list().filter(e => e.id !== id)); };

  /* All expenses whose date falls within [from, to] (inclusive), for Reports. */
  const inRange = (from, to) => list().filter(e => e.date >= from && e.date <= to);

  const total = (expenseList) => (expenseList || list()).reduce((s, e) => s + (e.amount || 0), 0);

  return { list, get, create, update, remove, inRange, total };
})();

/* ========================= LAYER 8: ANALYTICS ========================= */
/* ===== Finance — the ONE shared financial calculation used by Dashboard,
   Reports and Best-Selling-Products. Payment (order.paymentStatus) is the
   only thing that makes an order "financial"; order.orderStage never
   affects revenue/cost/profit. Uses the existing item.costPrice snapshot
   (falls back to 0 for old orders that never had one). Never returns
   NaN/Infinity. ===== */
const Finance = (() => {
  const isFinancialOrder = (o) => o && o.paymentStatus === 'paid' && o.status !== 'refunded';

  const safeDiv = (a, b) => (b > 0 ? (a / b) : 0);

  const computeForOrders = (allOrders) => {
    const paid = allOrders.filter(isFinancialOrder);
    const revenue = paid.reduce((s, o) => s + (o.total || 0), 0);
    const cost = paid.reduce((s, o) => s + (o.items || []).reduce((si, i) => si + (i.costPrice || 0) * i.qty, 0), 0);
    const profit = revenue - cost;
    const margin = safeDiv(profit, revenue) * 100;
    return {
      paidOrders: paid,
      ordersCount: allOrders.length,
      paidCount: paid.length,
      totalSales: allOrders.reduce((s, o) => s + (o.total || 0), 0),
      revenue, cost, profit,
      margin: Number.isFinite(margin) ? margin : 0,
      avgPaidOrderValue: safeDiv(revenue, paid.length),
    };
  };

  /* Per-product breakdown from paid, non-refunded orders only, using the
     historical item snapshots (price/costPrice at time of order). */
  const productBreakdown = (allOrders) => {
    const paid = allOrders.filter(isFinancialOrder);
    const map = {};
    paid.forEach(o => (o.items || []).forEach(i => {
      const key = i.productId;
      if (!map[key]) map[key] = { id: key, name: i.name, qty: 0, revenue: 0, cost: 0 };
      map[key].qty += i.qty;
      map[key].revenue += (i.price || 0) * i.qty;
      map[key].cost += (i.costPrice || 0) * i.qty;
    }));
    return Object.values(map).map(p => {
      const profit = p.revenue - p.cost;
      const margin = safeDiv(profit, p.revenue) * 100;
      return { ...p, profit, margin: Number.isFinite(margin) ? margin : 0 };
    }).sort((a, b) => b.qty - a.qty);
  };

  /* Sum of refundShippingCost across refunded orders in the given order set
     (scoped by the caller — all orders for Dashboard, in-range orders for
     Reports — same scoping pattern as computeForOrders/productBreakdown). */
  const refundShippingTotal = (allOrders) =>
    (allOrders || []).filter(o => o && o.refunded).reduce((s, o) => s + (Number(o.refundShippingCost) || 0), 0);

  /* Net Profit = Sales Profit (revenue - product cost) - General Expenses
     - Refund Shipping Costs. Expenses passed in must already be filtered to
     the relevant period/scope by the caller (Expenses.inRange for Reports,
     Expenses.list() for the all-time Dashboard); refundShipping likewise
     (Finance.refundShippingTotal over the same order scope). Never returns
     NaN/Infinity. */
  const computeNet = (fin, expensesList, refundShipping = 0) => {
    const expensesTotal = Expenses.total(expensesList);
    const netProfit = fin.profit - expensesTotal - (Number(refundShipping) || 0);
    const netMargin = safeDiv(netProfit, fin.revenue) * 100;
    return { expensesTotal, netProfit, netMargin: Number.isFinite(netMargin) ? netMargin : 0 };
  };

  /* Per-invoice (per-order) profit — Admin-only. Unpaid/refunded orders
     always show a profit of 0; never distributes general expenses onto a
     single invoice (req. 1). */
  const invoiceProfit = (order) => {
    if (!isFinancialOrder(order)) return { revenue: 0, cost: 0, profit: 0 };
    const revenue = order.total || 0;
    const cost = (order.items || []).reduce((s, i) => s + (i.costPrice || 0) * i.qty, 0);
    return { revenue, cost, profit: revenue - cost };
  };

  /* Independent refund section — never mixed into revenue/profit. Scoped by
     the caller the same way as computeForOrders (all orders for Dashboard,
     in-range orders for Reports). refundShippingCost is store-borne cost
     only (charged to the customer amounts are not tracked here as a loss). */
  const refundStats = (allOrders) => {
    const refunded = (allOrders || []).filter(o => o && o.refunded);
    const value = refunded.reduce((s, o) => s + (o.total || 0), 0);
    const cost = refunded.reduce((s, o) => s + (o.items || []).reduce((si, i) => si + (i.costPrice || 0) * i.qty, 0), 0);
    /* Return shipping is a store loss ONLY when the store bore it
       (order.refundShippingPaidBy === 'store'); missing field = 'customer'. */
    const shipping = refunded
      .filter(o => o.refundShippingPaidBy === 'store')
      .reduce((s, o) => s + (Number(o.refundShippingCost) || 0), 0);
    const lostGrossProfit = value - cost;
    const loss = lostGrossProfit + shipping;
    const totalOrders = (allOrders || []).length;
    const refundRate = safeDiv(refunded.length, totalOrders) * 100;
    const totalSales = (allOrders || []).reduce((s, o) => s + (o.total || 0), 0);
    const impactPct = safeDiv(loss, totalSales) * 100;

    const reasonMap = {};
    refunded.forEach(o => {
      const reason = o.refundReason || 'سبب آخر';
      if (!reasonMap[reason]) reasonMap[reason] = { reason, count: 0, value: 0 };
      reasonMap[reason].count++;
      reasonMap[reason].value += o.total || 0;
    });
    const reasons = Object.values(reasonMap)
      .map(r => ({ ...r, pct: safeDiv(r.count, refunded.length) * 100 }))
      .sort((a, b) => b.count - a.count);

    return {
      count: refunded.length, value, cost, shipping, loss,
      lostGrossProfit: Number.isFinite(lostGrossProfit) ? lostGrossProfit : 0,
      refundRate: Number.isFinite(refundRate) ? refundRate : 0,
      impactPct: Number.isFinite(impactPct) ? impactPct : 0,
      reasons,
    };
  };

  return { isFinancialOrder, computeForOrders, productBreakdown, computeNet, invoiceProfit, refundShippingTotal, refundStats };
})();

/* ===== Periods — date-range helpers for Reports (today / week / month /
   year / custom) plus the matching previous-equivalent period for
   comparisons. No storage, pure date math. ===== */
const Periods = (() => {
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
  const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x.getTime(); };
  const startOfWeek = (d) => { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); return startOfDay(x); };
  const startOfMonth = (d) => { const x = new Date(d); x.setDate(1); return startOfDay(x); };
  const startOfYear = (d) => { const x = new Date(d); x.setMonth(0, 1); return startOfDay(x); };

  const range = (period, customFrom, customTo) => {
    const now = new Date();
    switch (period) {
      case 'today': return { from: startOfDay(now), to: endOfDay(now) };
      case 'week': return { from: startOfWeek(now), to: endOfDay(now) };
      case 'month': return { from: startOfMonth(now), to: endOfDay(now) };
      case 'year': return { from: startOfYear(now), to: endOfDay(now) };
      case 'custom': {
        const from = customFrom ? startOfDay(new Date(customFrom)) : startOfMonth(now);
        const to = customTo ? endOfDay(new Date(customTo)) : endOfDay(now);
        return { from: Math.min(from, to), to: Math.max(from, to) };
      }
      default: return { from: startOfMonth(now), to: endOfDay(now) };
    }
  };

  /* The immediately preceding period of the same length (e.g. last week for
     this week, previous month for this month). */
  const previousRange = ({ from, to }) => {
    const span = to - from + 1;
    return { from: from - span, to: from - 1 };
  };

  const pctChange = (cur, prev) => {
    if (!prev || prev <= 0) return null;
    const v = ((cur - prev) / prev) * 100;
    return Number.isFinite(v) ? v : null;
  };

  return { range, previousRange, pctChange };
})();

const Analytics = (() => {
  const compute = () => {
    const products = Products.list();
    const orders = Orders.list();
    const customers = Customers.list();
    const reviews = Reviews.list();
    const delivered = orders.filter(o => (o.orderStage || 'received') === 'delivered');
    const active = orders.filter(o => (o.orderStage || 'received') !== 'cancelled');
    const fin = Finance.computeForOrders(orders);
    const { revenue, cost, profit, margin } = fin;
    const { expensesTotal, netProfit, netMargin } = Finance.computeNet(fin, Expenses.list(), Finance.refundShippingTotal(orders));
    const refundStats = Finance.refundStats(orders);

    const topProducts = Finance.productBreakdown(orders).slice(0, 5);

    const topCustomers = [...customers]
      .sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0)).slice(0, 5);

    const days = 14;
    const buckets = Array.from({ length: days }, (_, i) => {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (days - 1 - i));
      return { ts: d.getTime(), label: d.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }), count: 0, revenue: 0 };
    });
    orders.forEach(o => {
      const d = new Date(o.createdAt); d.setHours(0, 0, 0, 0);
      const b = buckets.find(x => x.ts === d.getTime());
      if (b) { b.count++; if (Finance.isFinancialOrder(o)) b.revenue += o.total || 0; }
    });

    const completionRate = orders.length === 0 ? 0 : (delivered.length / orders.length) * 100;
    const avgOrderValue = fin.avgPaidOrderValue;
    const lowStock = Inventory.getLowStock();
    const outOfStock = Inventory.getOutOfStock();

    const stageBreakdown = {};
    ORDER_STAGES.forEach(s => { stageBreakdown[s] = orders.filter(o => (o.orderStage || 'received') === s).length; });

    return {
      totals: {
        products: products.length, orders: orders.length, delivered: delivered.length,
        totalSales: fin.totalSales, revenue, cost, profit, margin, customers: customers.length, reviews: reviews.length,
        completionRate, avgOrderValue, activeOrders: active.length,
        lowStockCount: lowStock.length, outOfStockCount: outOfStock.length,
        expensesTotal, netProfit, netMargin,
      },
      topProducts, topCustomers, buckets, stageBreakdown,
      lowStock, outOfStock, refundStats,
    };
  };

  return { compute };
})();

/* ========================= LAYER 9: AUTH (with lockout & brute-force protection) ========================= */
const Auth = (() => {
  const _getAttempts = () => DB.read(KEYS.loginAttempts, { count: 0, lastAt: 0, lockedUntil: 0 });
  const _saveAttempts = (a) => DB.write(KEYS.loginAttempts, a);

  const isLocked = () => {
    const a = _getAttempts();
    return a.lockedUntil > Date.now();
  };

  const lockoutRemaining = () => {
    const a = _getAttempts();
    return Math.max(0, Math.ceil((a.lockedUntil - Date.now()) / 60000));
  };

  const isLoggedIn = () => {
    const s = DB.read(KEYS.session, null);
    if (!s || !s.expiresAt) return false;
    if (Date.now() > s.expiresAt) { logout(); return false; }
    return true;
  };

  const login = (password) => {
    if (isLocked()) {
      const mins = lockoutRemaining();
      return { ok: false, error: `تم قفل الحساب. حاول بعد ${arNum(mins)} دقيقة.` };
    }

    if (password !== CONFIG.adminPassword) {
      const a = _getAttempts();
      a.count++;
      a.lastAt = Date.now();
      if (a.count >= CONFIG.maxLoginAttempts) {
        a.lockedUntil = Date.now() + CONFIG.lockoutMinutes * 60 * 1000;
        a.count = 0;
        _saveAttempts(a);
        return { ok: false, error: `تم قفل الحساب لمدة ${arNum(CONFIG.lockoutMinutes)} دقيقة بسبب محاولات خاطئة متعددة.` };
      }
      _saveAttempts(a);
      const remaining = CONFIG.maxLoginAttempts - a.count;
      return { ok: false, error: `كلمة المرور غير صحيحة. (${arNum(remaining)} محاولة متبقية)` };
    }

    // Success
    _saveAttempts({ count: 0, lastAt: 0, lockedUntil: 0 });
    DB.write(KEYS.session, {
      ok: true,
      expiresAt: Date.now() + CONFIG.adminSessionMinutes * 60 * 1000,
    });
    return { ok: true };
  };

  const touch = () => {
    if (!isLoggedIn()) return;
    DB.write(KEYS.session, { ok: true, expiresAt: Date.now() + CONFIG.adminSessionMinutes * 60 * 1000 });
  };

  const logout = () => { DB.remove(KEYS.session); };

  return { isLoggedIn, isLocked, lockoutRemaining, login, touch, logout };
})();

/* ========================= LAYER 10: TOAST ========================= */
const Toast = (() => {
  const _root = () => document.getElementById('toasts');
  const show = (msg, type = 'info', ms = 3000) => {
    const root = _root(); if (!root) return;
    const t = document.createElement('div');
    t.className = `toast ${type || ''}`;
    t.textContent = String(msg);
    root.appendChild(t);
    const remove = () => {
      t.style.opacity = '0';
      t.style.transition = 'opacity .25s';
      setTimeout(() => { if (t.parentNode) t.remove(); }, 250);
    };
    const timer = setTimeout(remove, ms);
    t.addEventListener('click', () => { clearTimeout(timer); remove(); });
  };
  const success = (m) => show(m, 'success');
  const error = (m) => show(m, 'error', 5000);
  const warn = (m) => show(m, 'warn', 4000);
  return { show, success, error, warn };
})();

/* ========================= LAYER 11: MODAL SYSTEM ========================= */
const Modal = (() => {
  const _stack = [];

  const open = ({ title = '', body = '', footer = '', size = 'medium', onClose } = {}) => {
    const root = document.getElementById('modalRoot');
    const wrap = document.createElement('div');
    wrap.className = 'modal-instance';
    wrap.innerHTML = `
      <div class="modal-backdrop" data-close></div>
      <div class="modal ${size}" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h3>${esc(title)}</h3>
          <button class="modal-close" data-close aria-label="إغلاق">✕</button>
        </div>
        <div class="modal-body"></div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>
    `;
    const bodyEl = wrap.querySelector('.modal-body');
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else if (body instanceof Node) bodyEl.appendChild(body);

    root.appendChild(wrap);
    root.classList.add('open');
    root.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    const close = () => {
      wrap.remove();
      _stack.splice(_stack.findIndex(x => x.wrap === wrap), 1);
      if (_stack.length === 0) {
        root.classList.remove('open');
        root.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
      }
      document.removeEventListener('keydown', escHandler);
      if (typeof onClose === 'function') { try { onClose(); } catch (_) {} }
    };
    wrap.addEventListener('click', e => { if (e.target.matches('[data-close]')) close(); });
    const escHandler = (e) => { if (e.key === 'Escape' && _stack[_stack.length - 1]?.wrap === wrap) close(); };
    document.addEventListener('keydown', escHandler);
    _stack.push({ wrap, close, escHandler });
    return { close, root: wrap };
  };

  const confirm = ({ title = 'هل أنت متأكد؟', message = '', confirmLabel = 'تأكيد', danger = false } = {}) => {
    return new Promise(resolve => {
      let resolved = false;
      const { close } = open({
        title, size: 'small',
        body: `<p style="color:var(--text-soft);line-height:1.8">${esc(message)}</p>`,
        footer: `
          <button class="btn btn-ghost" data-cancel>إلغاء</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${esc(confirmLabel)}</button>
        `,
        onClose: () => { if (!resolved) resolve(false); },
      });
      const inst = _stack[_stack.length - 1].wrap;
      inst.querySelector('[data-cancel]').addEventListener('click', () => { resolved = true; resolve(false); close(); });
      inst.querySelector('[data-confirm]').addEventListener('click', () => { resolved = true; resolve(true); close(); });
    });
  };

  const closeAll = () => {
    while (_stack.length) _stack[_stack.length - 1].close();
  };

  return { open, confirm, closeAll };
})();

/* ========================= LAYER 12: UI HELPERS ========================= */
const Render = (() => {
  const productCard = (p) => {
    const avail = Inventory.available(p);
    const isOutOfStock = avail === 0;
    const isLowStock = avail > 0 && avail <= CONFIG.lowStockThreshold;
    const discount = p.oldPrice && p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
    const img = (p.images || [])[0] || H.fallbackImg;
    return `
      <article class="product-card" data-product="${esc(p.id)}">
        <div class="pc-media">
          <img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy"
               onerror="this.onerror=null;this.src=H.fallbackImg" />
          ${discount > 0 ? `<span class="discount-badge">خصم ${arNum(discount)}%</span>` : ''}
          ${isLowStock ? `<span class="stock-badge">آخر ${arNum(avail)} قطع!</span>` : ''}
          ${isOutOfStock ? `<div class="out-of-stock-overlay"><span>نفد المخزون</span></div>` : ''}
        </div>
        <div class="pc-body">
          <span class="pc-cat">${esc(p.category || (Settings.get().storeName || ''))}</span>
          <h3 class="pc-name">${esc(p.name)}</h3>
          <div class="pc-rating">${stars(p.rating)} <span style="color:var(--muted);font-size:.8rem">(${arNum((p.rating || 0).toFixed(1))})</span></div>
          <p class="pc-desc">${esc((p.description || '').slice(0, 90))}${(p.description || '').length > 90 ? '…' : ''}</p>
          <div class="pc-price-row">
            <span class="pc-price">${money(p.price)}</span>
            ${discount > 0 ? `<span class="pc-old">${money(p.oldPrice)}</span>` : ''}
          </div>
          <div class="pc-actions">
            <button class="btn btn-primary btn-sm" style="flex:1" data-order ${isOutOfStock ? 'disabled' : ''}>${isOutOfStock ? 'نفد المخزون' : 'اطلب الآن'}</button>
            <button class="btn-cart" data-add-cart title="أضف للسلة" ${isOutOfStock ? 'disabled' : ''}>🛒</button>
          </div>
        </div>
      </article>
    `;
  };

  /* Single source of truth for the customer-facing order lifecycle timeline —
     reads order.orderStage only, used identically by Admin (order detail) and
     the Customer (order tracking / "طلباتي"). */
  const orderLifecycleTimeline = (order) => {
    const stage = order.orderStage || 'received';
    if (stage === 'cancelled') {
      return `
        <div class="ot-cancelled">
          <div class="ot-cancelled-icon">${OrderLifecycle.getStatusIcon('cancelled')}</div>
          <div class="ot-cancelled-info">
            <div class="ot-cancelled-title">${esc(OrderLifecycle.getStatusLabel('cancelled'))}</div>
            <div class="ot-ts">${fmtDateTime(order.orderStageUpdatedAt || order.updatedAt || order.createdAt)}</div>
          </div>
        </div>
      `;
    }
    const stages = ORDER_STAGES.filter(s => s !== 'cancelled');
    const currentIdx = stages.indexOf(stage);
    return stages.map((s, i) => {
      const cls = i < currentIdx ? 'done' : (i === currentIdx ? 'current' : 'upcoming');
      return `
        <div class="ot-step ${cls}">
          <div class="ot-dot">${OrderLifecycle.getStatusIcon(s)}</div>
          <div class="ot-info">
            <div class="ot-label">${esc(OrderLifecycle.getStatusLabel(s))}</div>
            ${i === currentIdx ? `<div class="ot-ts">${fmtDateTime(order.orderStageUpdatedAt || order.updatedAt)}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  };

  return { productCard, orderLifecycleTimeline };
})();

/* ========================= LAYER 13: CART UI ========================= */
const CartUI = (() => {
  const _updateBadges = () => {
    const c = Cart.count();
    const badge = document.getElementById('cartBadge');
    const badgeMobile = document.getElementById('cartBadgeMobile');
    if (badge) { badge.textContent = arNum(c); badge.hidden = c === 0; }
    if (badgeMobile) { badgeMobile.textContent = c > 0 ? `(${arNum(c)})` : ''; badgeMobile.hidden = c === 0; }
  };

  const open = () => {
    const items = Cart.getItems();
    const t = Cart.totals();

    const body = items.length === 0 ? `
      <div class="empty" style="padding:40px 20px">
        <div class="empty-illu">🛒</div>
        <h3>السلة فارغة</h3>
        <p class="muted">أضف منتجات لتبدأ تسوقك.</p>
      </div>
    ` : `
      <div class="cart-items">
        ${items.map(item => {
          const p = Products.get(item.productId);
          if (!p) return '';
          const img = (p.images || [])[0] || H.fallbackImg;
          return `
            <div class="cart-item" data-cart-item="${esc(p.id)}">
              <img class="cart-item-img" src="${esc(img)}" alt="${esc(p.name)}"
                   onerror="this.onerror=null;this.src=H.fallbackImg" />
              <div class="cart-item-info">
                <div class="cart-item-name">${esc(p.name)}</div>
                <div class="cart-item-price">${money(p.price)} / قطعة</div>
                <div class="cart-item-qty">
                  <button class="qty-btn" data-qty-dec="${esc(p.id)}">−</button>
                  <span class="qty-val">${arNum(item.qty)}</span>
                  <button class="qty-btn" data-qty-inc="${esc(p.id)}">+</button>
                </div>
              </div>
              <button class="cart-item-remove" data-cart-remove="${esc(p.id)}" title="حذف">✕</button>
            </div>
          `;
        }).join('')}
      </div>
      <div class="cart-summary">
        <div class="cart-summary-row"><span>المجموع الجزئي</span><span>${money(t.subtotal)}</span></div>
        <div class="cart-summary-row"><span>الشحن</span><span>${t.shippingFee === 0 ? '<span style="color:var(--success);font-weight:700">مجاني</span>' : money(t.shippingFee)}</span></div>
        <div class="cart-summary-row"><span>ضريبة القيمة المضافة (${arNum(PricingEngine.getTaxRate())}%)</span><span>${money(t.tax)}</span></div>
        <div class="cart-summary-row total"><span>الإجمالي</span><span>${money(t.total)}</span></div>
        ${t.shippingFee > 0 ? `<div style="font-size:.78rem;color:var(--muted);margin-top:6px">أضف ${money(PricingEngine.getFreeShippingThreshold() - t.subtotal)} للحصول على شحن مجاني</div>` : ''}
      </div>
    `;

    const footer = items.length === 0 ? '' : `
      <button class="btn btn-ghost" id="cartClearBtn">إفراغ السلة</button>
      <button class="btn btn-primary" id="cartCheckoutBtn">إتمام الطلب (${arNum(Cart.count())} منتج)</button>
    `;

    const { close, root } = Modal.open({ title: `سلة التسوق`, body, footer, size: 'medium' });

    // Events: qty change / remove / checkout / clear
    root.querySelectorAll('[data-qty-dec]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-qty-dec');
        const item = Cart.getItems().find(i => i.productId === id);
        if (!item) return;
        if (item.qty <= 1) { Cart.remove(id); }
        else { Cart.setQty(id, item.qty - 1); }
        close(); open();
      });
    });
    root.querySelectorAll('[data-qty-inc]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-qty-inc');
        const item = Cart.getItems().find(i => i.productId === id);
        if (!item) return;
        const r = Cart.setQty(id, item.qty + 1);
        if (!r.ok) Toast.warn(r.error);
        close(); open();
      });
    });
    root.querySelectorAll('[data-cart-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-cart-remove');
        Cart.remove(id);
        close(); open();
      });
    });

    const clearBtn = root.querySelector('#cartClearBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        const ok = await Modal.confirm({ title: 'إفراغ السلة', message: 'هل تريد إزالة كل المنتجات من السلة؟', confirmLabel: 'إفراغ', danger: true });
        if (ok) { Cart.clear(); close(); }
      });
    }

    const checkoutBtn = root.querySelector('#cartCheckoutBtn');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', () => {
        close();
        UI.openCheckoutModal();
      });
    }
  };

  const init = () => {
    EventBus.on('cart:changed', _updateBadges);
    _updateBadges();

    document.getElementById('cartBtn')?.addEventListener('click', open);
    document.getElementById('bottomCartBtn')?.addEventListener('click', e => { e.preventDefault(); open(); });
  };

  return { open, init, updateBadges: _updateBadges };
})();

/* ========================= LAYER 14: PUBLIC UI ========================= */
const UI = (() => {
  const state = { search: '', category: '', sort: 'newest' };

  const mount = () => {
    document.getElementById('year').textContent = new Date().getFullYear();
    document.body.classList.add('has-bottom-nav');
    _bindHeader();
    _bindFilters();
    _bindBottomNav();
    renderCategories();
    _skeletonGrid();
    setTimeout(() => {
      renderProducts();
      renderReviews();
      renderAbout();
      _updateOrdersBadge();
    }, 180);

    // Re-render products when inventory changes
    EventBus.on('inventory:changed', debounce(renderProducts, 200));
    EventBus.on('products:changed', debounce(renderProducts, 200));
  };

  const _bindHeader = () => {
    const menuToggle = document.getElementById('menuToggle');
    const nav = document.getElementById('mainNav');
    const overlay = document.getElementById('navOverlay');

    const openMenu = () => {
      nav.classList.add('open'); overlay.hidden = false;
      requestAnimationFrame(() => overlay.classList.add('show'));
      document.body.classList.add('menu-open');
    };
    const closeMenu = () => {
      nav.classList.remove('open'); overlay.classList.remove('show');
      document.body.classList.remove('menu-open');
      setTimeout(() => { overlay.hidden = true; }, 220);
    };
    menuToggle.addEventListener('click', () => nav.classList.contains('open') ? closeMenu() : openMenu());
    overlay.addEventListener('click', closeMenu);
    nav.addEventListener('click', e => { if (e.target.tagName === 'A') closeMenu(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && nav.classList.contains('open')) closeMenu(); });

    document.getElementById('ordersBtn')?.addEventListener('click', openMyOrders);
    document.getElementById('adminEntry')?.addEventListener('click', e => { e.preventDefault(); location.hash = '#/admin'; });

    const search = document.getElementById('searchInput');
    const searchMobile = document.getElementById('searchInputMobile');
    const onSearch = debounce(v => { state.search = v.trim().toLowerCase(); renderProducts(); }, 150);
    search?.addEventListener('input', e => onSearch(e.target.value));
    searchMobile?.addEventListener('input', e => onSearch(e.target.value));

    const mobileSearch = document.getElementById('mobileSearch');
    const searchBtn = document.getElementById('searchBtnMobile');
    searchBtn?.addEventListener('click', () => {
      mobileSearch.hidden = !mobileSearch.hidden;
      if (!mobileSearch.hidden) setTimeout(() => searchMobile.focus(), 50);
    });
  };

  const _bindBottomNav = () => {
    const setActive = () => {
      const h = location.hash || '#/';
      document.getElementById('bottomNav')?.querySelectorAll('a').forEach(a => {
        const href = a.getAttribute('href');
        a.classList.toggle('active', href !== '#' && href === h);
      });
    };
    window.addEventListener('hashchange', setActive);
    setActive();
  };

  const _bindFilters = () => {
    document.getElementById('categoryFilter')?.addEventListener('change', e => {
      state.category = e.target.value; renderProducts();
    });
    document.getElementById('sortFilter')?.addEventListener('change', e => {
      state.sort = e.target.value; renderProducts();
    });
    document.getElementById('openReviewBtn')?.addEventListener('click', openReviewModal);
  };

  const renderCategories = () => {
    const sel = document.getElementById('categoryFilter');
    if (!sel) return;
    const cats = Array.from(new Set([...CONFIG.categories, ...Products.list().map(p => p.category)])).filter(Boolean);
    sel.innerHTML = '<option value="">كل الفئات</option>' +
      cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  };

  const _skeletonGrid = () => {
    const grid = document.getElementById('productsGrid');
    if (grid) grid.innerHTML = Array.from({ length: 8 }).map(() => '<div class="skeleton skel-card"></div>').join('');
  };

  const _filteredProducts = () => {
    let arr = Products.list();
    if (state.category) arr = arr.filter(p => p.category === state.category);
    if (state.search) {
      const q = state.search;
      arr = arr.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    }
    switch (state.sort) {
      case 'price-asc':  arr = arr.slice().sort((a, b) => a.price - b.price); break;
      case 'price-desc': arr = arr.slice().sort((a, b) => b.price - a.price); break;
      case 'rating':     arr = arr.slice().sort((a, b) => b.rating - a.rating); break;
      default:           arr = arr.slice().sort((a, b) => b.createdAt - a.createdAt);
    }
    return arr;
  };

  const renderProducts = () => {
    const grid = document.getElementById('productsGrid');
    const empty = document.getElementById('productsEmpty');
    if (!grid) return;
    const arr = _filteredProducts();
    if (arr.length === 0) {
      grid.innerHTML = '';
      empty?.classList.remove('hidden');
      return;
    }
    empty?.classList.add('hidden');
    grid.innerHTML = arr.map(p => Render.productCard(p)).join('');
    grid.querySelectorAll('[data-product]').forEach(el => {
      el.addEventListener('click', e => {
        const id = el.getAttribute('data-product');
        if (e.target.matches('[data-order]') || e.target.closest('[data-order]')) {
          e.stopPropagation();
          openOrderModal(id);
        } else if (e.target.matches('[data-add-cart]') || e.target.closest('[data-add-cart]')) {
          e.stopPropagation();
          const r = Cart.add(id, 1);
          if (r.ok) Toast.success('تم إضافة المنتج للسلة.');
          else Toast.error(r.error);
        } else {
          openProductModal(id);
        }
      });
    });
  };

  const openProductModal = (id) => {
    const p = Products.get(id); if (!p) return;
    const reviews = Reviews.list().filter(r => !r.productId || r.productId === id);
    const images = (p.images && p.images.length) ? p.images : [H.fallbackImg];
    const discount = p.oldPrice && p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
    const avail = Inventory.available(p);
    const isOut = avail === 0;

    const body = `
      <div class="pd-grid">
        <div class="pd-gallery">
          <div class="pd-main"><img id="pdMain" src="${esc(images[0])}" alt="${esc(p.name)}"
            onerror="this.onerror=null;this.src=H.fallbackImg" /></div>
          ${images.length > 1 ? `<div class="pd-thumbs">
            ${images.map((src, i) => `<button class="pd-thumb ${i === 0 ? 'active' : ''}" data-src="${esc(src)}"><img src="${esc(src)}" alt=""/></button>`).join('')}
          </div>` : ''}
        </div>
        <div class="pd-info">
          <span class="pd-cat">${esc(p.category)}</span>
          <h2>${esc(p.name)}</h2>
          <div style="margin:4px 0;font-size:.82rem;color:var(--muted)">SKU: ${esc(p.sku || '')}</div>
          <div class="pc-rating">${stars(p.rating)} <span style="color:var(--muted);font-size:.85rem">${arNum((p.rating || 0).toFixed(1))} · ${arNum(reviews.length)} تقييم</span></div>
          <div class="pd-price-row pc-price-row">
            <span class="pc-price" style="font-size:1.4rem">${money(p.price)}</span>
            ${discount > 0 ? `<span class="pc-old">${money(p.oldPrice)}</span><span class="discount-badge" style="position:static">خصم ${arNum(discount)}%</span>` : ''}
          </div>
          ${isOut
            ? `<div style="color:var(--danger);font-weight:700;margin:8px 0">⛔ نفد من المخزون</div>`
            : avail <= CONFIG.lowStockThreshold
              ? `<div style="color:var(--warning);font-weight:700;margin:8px 0">⚠ آخر ${arNum(avail)} قطع فقط!</div>`
              : `<div style="color:var(--success);font-weight:600;font-size:.88rem;margin:6px 0">✔ متاح في المخزون</div>`
          }
          <p class="pd-desc">${esc(p.description)}</p>
          ${p.features && p.features.length ? `<ul class="pd-features">${p.features.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
          <div style="display:flex;gap:10px;margin-top:14px">
            <button class="btn btn-primary" style="flex:1" id="pdOrder" ${isOut ? 'disabled' : ''}>${isOut ? 'نفد المخزون' : 'اطلب الآن'}</button>
            <button class="btn btn-ghost" id="pdAddCart" ${isOut ? 'disabled' : ''}>+ السلة</button>
          </div>
          <div class="pd-reviews">
            <h4>تقييمات العملاء</h4>
            ${reviews.length === 0
              ? '<p class="muted">لا توجد تقييمات بعد. كن أول من يقيّم!</p>'
              : reviews.slice(0, 5).map(r => `
                <div class="pd-review">
                  <strong>${esc(r.name)}</strong> <span class="review-stars">${stars(r.rating)}</span>
                  <p class="muted" style="margin-top:4px">${esc(r.comment)}</p>
                </div>`).join('')}
          </div>
        </div>
      </div>
    `;
    const { close, root } = Modal.open({ title: p.name, body, size: 'medium' });
    root.querySelectorAll('.pd-thumb').forEach(btn => {
      btn.addEventListener('click', () => {
        root.querySelectorAll('.pd-thumb').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        root.querySelector('#pdMain').src = btn.getAttribute('data-src');
      });
    });
    root.querySelector('#pdOrder')?.addEventListener('click', () => { close(); openOrderModal(id); });
    root.querySelector('#pdAddCart')?.addEventListener('click', () => {
      const r = Cart.add(id, 1);
      if (r.ok) { Toast.success('تم إضافة المنتج للسلة.'); close(); CartUI.open(); }
      else Toast.error(r.error);
    });
  };

  /* ===== Order Workflow — Stage 5: final invoice preview before confirmation =====
     Reads the draft Order/Invoice built by Invoices.buildDraftOrder/buildDraftInvoice
     (Stage 3/4) — no prices are recalculated here. Reuses the existing cart-item /
     cart-summary styles so the visual design stays unchanged. */
  const _renderOrderPreview = (draftOrder, draftInvoice) => {
    const snap = draftInvoice.snapshot;
    const body = `
      <div class="cart-items">
        ${draftOrder.items.map(i => `
          <div class="cart-item">
            <img class="cart-item-img" src="${esc(i.image || H.fallbackImg)}" alt="${esc(i.name)}"
                 onerror="this.onerror=null;this.src=H.fallbackImg" />
            <div class="cart-item-info">
              <div class="cart-item-name">${esc(i.name)}</div>
              <div class="cart-item-price">${money(i.unitPrice)} × ${arNum(i.qty)} = ${money(i.total)}</div>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="cart-summary">
        <div class="cart-summary-row"><span>المجموع الجزئي</span><span>${money(snap.subtotal)}</span></div>
        <div class="cart-summary-row"><span>الشحن</span><span>${snap.shippingFee === 0 ? '<span style="color:var(--success);font-weight:700">مجاني</span>' : money(snap.shippingFee)}</span></div>
        <div class="cart-summary-row"><span>الضريبة (${arNum(PricingEngine.getTaxRate())}%)</span><span>${money(snap.tax)}</span></div>
        <div class="cart-summary-row total"><span>الإجمالي النهائي</span><span>${money(snap.total)}</span></div>
      </div>
      <div class="muted" style="margin-top:12px;font-size:.85rem;line-height:1.8">
        <div><strong>التسليم إلى:</strong> ${esc(draftOrder.customer.name)} — ${esc(draftOrder.customer.phone)}</div>
        <div>${esc(draftOrder.customer.address)}</div>
      </div>
    `;
    const footer = `
      <button class="btn btn-ghost" data-close>رجوع للتعديل</button>
      <button class="btn btn-primary" id="previewConfirmBtn">تأكيد الطلب النهائي</button>
    `;
    return Modal.open({ title: 'معاينة الفاتورة قبل التأكيد', body, footer, size: 'medium' });
  };

  const openOrderModal = (productId) => {
    const p = Products.get(productId); if (!p) return;
    const avail = Inventory.available(p);
    if (avail === 0) { Toast.error('المنتج نفد من المخزون.'); return; }

    const body = `
      <div style="display:flex;gap:14px;align-items:center;margin-bottom:18px;padding:12px;background:var(--bg-muted);border-radius:12px">
        <img src="${esc((p.images || [])[0] || '')}" alt="" class="row-thumb" style="width:64px;height:64px"
             onerror="this.onerror=null;this.src=H.fallbackImg" />
        <div>
          <div style="font-weight:700">${esc(p.name)}</div>
          <div class="muted" style="font-size:.88rem">${money(p.price)} · ${esc(p.category)}</div>
          <div style="font-size:.82rem;color:var(--muted)">المتاح: ${arNum(avail)} قطعة</div>
        </div>
      </div>
      <form id="orderForm" class="form-grid" novalidate>
        <div class="form-2col form-grid" style="gap:14px">
          <div class="form-row"><label>الاسم بالكامل</label><input name="name" required autocomplete="name" /><span class="field-err"></span></div>
          <div class="form-row"><label>رقم الهاتف</label><input name="phone" required inputmode="tel" autocomplete="tel" placeholder="01xxxxxxxxx" /><span class="field-err"></span></div>
        </div>
        <div class="form-row"><label>العنوان</label><input name="address" required autocomplete="street-address" /><span class="field-err"></span></div>
        <div class="form-2col form-grid" style="gap:14px">
          <div class="form-row"><label>المدينة / المحافظة</label><input name="city" required autocomplete="address-level2" /><span class="field-err"></span></div>
          <div class="form-row"><label>الكمية</label><input name="qty" type="number" min="1" max="${avail}" value="1" inputmode="numeric" /></div>
        </div>
        <div class="form-row"><label>ملاحظات (اختياري)</label><textarea name="notes" placeholder="موعد التسليم، اللون المفضل، إلخ."></textarea></div>
      </form>
      <div id="orderSummary" style="margin-top:14px;padding:12px;background:var(--bg-muted);border-radius:12px;font-size:.9rem;display:none"></div>
    `;
    const footer = `
      <button class="btn btn-ghost" data-close>إلغاء</button>
      <button class="btn btn-primary" id="submitOrder">تأكيد الطلب</button>
    `;
    const { close, root } = Modal.open({ title: 'إتمام الطلب', body, footer, size: 'medium' });

    // Live order summary update
    const qtyInput = root.querySelector('[name="qty"]');
    const summaryEl = root.querySelector('#orderSummary');
    const updateSummary = () => {
      const qty = Math.max(1, Math.min(avail, Number(qtyInput.value) || 1));
      const { subtotal, shippingFee: ship, tax, total } = PricingEngine.calcOrderTotals([{ price: p.price, qty }]);
      summaryEl.style.display = 'block';
      summaryEl.innerHTML = `
        <div style="display:grid;gap:4px">
          <div style="display:flex;justify-content:space-between"><span>المجموع الجزئي</span><span>${money(subtotal)}</span></div>
          <div style="display:flex;justify-content:space-between"><span>الشحن</span><span>${ship === 0 ? '<span style="color:var(--success)">مجاني</span>' : money(ship)}</span></div>
          <div style="display:flex;justify-content:space-between"><span>الضريبة (${arNum(PricingEngine.getTaxRate())}%)</span><span>${money(tax)}</span></div>
          <div style="display:flex;justify-content:space-between;font-weight:800;border-top:1px solid var(--border);padding-top:6px;margin-top:4px"><span>الإجمالي</span><span>${money(total)}</span></div>
        </div>`;
    };
    qtyInput?.addEventListener('input', updateSummary);
    updateSummary();

    root.querySelector('#submitOrder')?.addEventListener('click', () => {
      const form = root.querySelector('#orderForm');
      const data = Object.fromEntries(new FormData(form).entries());
      const qty = Math.max(1, Math.floor(Number(data.qty) || 1));

      const errors = Validator.form({
        name: data.name, phone: data.phone, address: data.address, city: data.city, qty: data.qty,
      });

      if (qty > avail) errors.qty = `المتاح فقط ${arNum(avail)} قطعة.`;

      Validator.applyErrors(form, errors);
      if (Object.keys(errors).length) { Toast.error('من فضلك صحّح الحقول المظللة.'); return; }

      const customer = { name: data.name, phone: data.phone, address: data.address, city: data.city };
      const draftOrder = Invoices.buildDraftOrder({ customer, items: [{ productId: p.id, qty }], notes: data.notes });
      const draftInvoice = Invoices.buildDraftInvoice(draftOrder);
      const { close: closePreview, root: previewRoot } = _renderOrderPreview(draftOrder, draftInvoice);

      previewRoot.querySelector('#previewConfirmBtn')?.addEventListener('click', () => {
        const confirmBtn = previewRoot.querySelector('#previewConfirmBtn');
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'جارٍ المعالجة…';
        try {
          const order = Orders.create({
            customer,
            items: [{ productId: p.id, qty }],
            notes: data.notes,
          });
          closePreview();
          close();
          _openOrderSuccess(order);
          _updateOrdersBadge();
        } catch (e) {
          Toast.error(e.message || 'حدث خطأ. يرجى المحاولة مرة أخرى.');
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'تأكيد الطلب النهائي';
        }
      });
    });
  };

  const openCheckoutModal = () => {
    const items = Cart.getItems();
    if (items.length === 0) { Toast.warn('السلة فارغة.'); return; }

    const validation = Cart.validate();
    if (!validation.valid) {
      Toast.error('بعض المنتجات في سلتك لم تعد متاحة. يرجى مراجعة السلة.');
      CartUI.open(); return;
    }

    const t = Cart.totals();
    const body = `
      <div style="background:var(--bg-muted);border-radius:12px;padding:14px;margin-bottom:18px">
        ${items.map(i => {
          const p = Products.get(i.productId);
          if (!p) return '';
          return `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:.9rem"><span>${esc(p.name)} ×${arNum(i.qty)}</span><span>${money(p.price * i.qty)}</span></div>`;
        }).join('')}
        <div style="border-top:1px solid var(--border);padding-top:8px;margin-top:8px;display:flex;justify-content:space-between;font-weight:800"><span>الإجمالي</span><span>${money(t.total)}</span></div>
      </div>
      <form id="checkoutForm" class="form-grid" novalidate>
        <div class="form-2col form-grid" style="gap:14px">
          <div class="form-row"><label>الاسم بالكامل</label><input name="name" required autocomplete="name" /><span class="field-err"></span></div>
          <div class="form-row"><label>رقم الهاتف</label><input name="phone" required inputmode="tel" autocomplete="tel" placeholder="01xxxxxxxxx" /><span class="field-err"></span></div>
        </div>
        <div class="form-row"><label>العنوان</label><input name="address" required autocomplete="street-address" /><span class="field-err"></span></div>
        <div class="form-row"><label>المدينة / المحافظة</label><input name="city" required autocomplete="address-level2" /><span class="field-err"></span></div>
        <div class="form-row"><label>ملاحظات (اختياري)</label><textarea name="notes" placeholder="ملاحظات التوصيل…"></textarea></div>
      </form>
    `;
    const footer = `
      <button class="btn btn-ghost" data-close>إلغاء</button>
      <button class="btn btn-primary" id="submitCheckout">تأكيد الطلب (${money(t.total)})</button>
    `;
    const { close, root } = Modal.open({ title: 'إتمام الطلب', body, footer, size: 'medium' });

    root.querySelector('#submitCheckout')?.addEventListener('click', () => {
      const form = root.querySelector('#checkoutForm');
      const data = Object.fromEntries(new FormData(form).entries());
      const errors = Validator.form({ name: data.name, phone: data.phone, address: data.address, city: data.city });
      Validator.applyErrors(form, errors);
      if (Object.keys(errors).length) { Toast.error('من فضلك صحّح الحقول المظللة.'); return; }

      const customer = { name: data.name, phone: data.phone, address: data.address, city: data.city };
      const draftOrder = Invoices.buildDraftOrder({ customer, items: Cart.getItems(), notes: data.notes });
      const draftInvoice = Invoices.buildDraftInvoice(draftOrder);
      const { close: closePreview, root: previewRoot } = _renderOrderPreview(draftOrder, draftInvoice);

      previewRoot.querySelector('#previewConfirmBtn')?.addEventListener('click', () => {
        const confirmBtn = previewRoot.querySelector('#previewConfirmBtn');
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'جارٍ المعالجة…';
        try {
          const order = Cart.checkout({ customer, notes: data.notes });
          closePreview();
          close();
          _openOrderSuccess(order);
          _updateOrdersBadge();
        } catch (e) {
          Toast.error(e.message || 'حدث خطأ. يرجى المحاولة مرة أخرى.');
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'تأكيد الطلب النهائي';
        }
      });
    });
  };

  const _openOrderSuccess = (order) => {
    const orderNumber = order.orderNumber || order.id;
    const body = `
      <div style="text-align:center;padding:10px 0 20px">
        <div style="font-size:3.4rem">✅</div>
        <h3 style="font-size:1.5rem;margin:12px 0 6px;font-weight:800">تم استلام طلبك بنجاح</h3>
        <p class="muted">شكراً ${esc(order.customerSnapshot.name)}! استلمنا طلبك بنجاح.</p>
        <div style="background:var(--bg-muted);border-radius:14px;padding:16px;margin-top:18px;text-align:center">
          <div class="muted" style="font-size:.85rem">رقم الطلب</div>
          <div style="font-size:1.4rem;font-weight:800;letter-spacing:1px;margin-top:4px" id="successOrderNumber">${esc(orderNumber)}</div>
        </div>
        <div style="background:var(--bg-muted);border-radius:14px;padding:16px;margin-top:12px;text-align:right;line-height:2">
          <div><strong>المجموع الجزئي:</strong> ${money(order.subtotal)}</div>
          <div><strong>الشحن:</strong> ${order.shippingFee === 0 ? 'مجاني' : money(order.shippingFee)}</div>
          <div><strong>الضريبة:</strong> ${money(order.tax)}</div>
          <div style="font-weight:800"><strong>الإجمالي:</strong> ${money(order.total)}</div>
          <div class="muted" style="font-size:.85rem;margin-top:6px">سنتواصل معك قريباً لتأكيد التسليم.</div>
        </div>
        <div style="display:flex;gap:10px;margin-top:16px">
          <button class="btn btn-ghost" id="copyOrderNumberBtn" style="flex:1">📋 نسخ رقم الطلب</button>
          <button class="btn btn-ghost" id="trackOrderBtn" style="flex:1">🔍 تتبع الطلب</button>
        </div>
      </div>
    `;
    const { root } = Modal.open({
      title: 'شكراً لك', body, size: 'small',
      footer: '<button class="btn btn-primary btn-block" data-close>متابعة التسوّق</button>',
    });

    root.querySelector('#copyOrderNumberBtn')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(orderNumber);
        Toast.success('تم نسخ رقم الطلب.');
      } catch (e) {
        Toast.warn('تعذر نسخ رقم الطلب.');
      }
    });

    root.querySelector('#trackOrderBtn')?.addEventListener('click', () => {
      _openCustomerTracking(order.id);
    });
  };

  /* ===== Customer Order Tracking — read-only view of the existing Order Lifecycle
     (order.orderStage). Does not introduce a second tracking system; it only
     renders the existing stages/helpers for the customer. ===== */
  const _openCustomerTracking = (orderId) => {
    // Always re-read the current order from storage — never a stale/captured
    // object — so tracking reflects whatever Admin last saved.
    const order = Orders.get(orderId);
    if (!order) { Toast.error('تعذر العثور على الطلب.'); return; }
    const stage = order.orderStage || 'received';
    const orderNumber = order.orderNumber || order.id;
    const body = `
      <div class="tracking-summary">
        <div class="tracking-order-label">رقم الطلب</div>
        <div class="tracking-order-number">${esc(orderNumber)}</div>
        <span class="pill lg ${esc(stage)}">${OrderLifecycle.getStatusIcon(stage)} ${esc(OrderLifecycle.getStatusLabel(stage))}</span>
        <div class="tracking-updated">آخر تحديث: ${fmtDateTime(order.orderStageUpdatedAt || order.updatedAt || order.createdAt)}</div>
        <div class="tracking-payment"><span class="muted">حالة الدفع:</span> <span class="pay-badge ${esc(Payment.getBadgeClass(order))}">${Payment.getIcon(order)} ${esc(Payment.getLabel(order))}</span></div>
      </div>
      <div class="order-timeline ${stage === 'cancelled' ? 'is-cancelled' : ''}">${Render.orderLifecycleTimeline(order)}</div>
    `;
    Modal.open({ title: 'تتبع الطلب', body, size: 'small', footer: '<button class="btn btn-primary btn-block" data-close>إغلاق</button>' });
  };

  const openMyOrders = () => {
    const body = `
      <p class="muted">أدخل رقم الهاتف أو رقم الطلب — سنعرض لك سجلك.</p>
      <div class="form-row" style="margin-top:14px"><label>رقم الهاتف أو رقم الطلب</label><input id="myOrdersPhone" inputmode="text" placeholder="01xxxxxxxxx أو DV-000001" /></div>
      <button class="btn btn-primary btn-block" id="myOrdersLookup" style="margin-top:14px">ابحث عن طلباتي</button>
      <div id="myOrdersResults" style="margin-top:18px"></div>
    `;
    const { root } = Modal.open({ title: 'طلباتي', body, size: 'medium' });

    const lookup = () => {
      const raw = root.querySelector('#myOrdersPhone').value.trim();
      const out = root.querySelector('#myOrdersResults');
      if (!raw) { out.innerHTML = '<p class="muted">من فضلك أدخل رقم هاتفك أو رقم طلبك.</p>'; return; }

      const all = Orders.list();
      const byOrderNumber = all.find(o => o.orderNumber === raw);
      let mine;
      if (byOrderNumber) {
        mine = [byOrderNumber];
      } else {
        const phone = raw.replace(/\s/g, '');
        mine = all.filter(o => o.customerSnapshot && o.customerSnapshot.phone === phone);
      }

      if (mine.length === 0) {
        out.innerHTML = '<div class="empty" style="padding:30px"><div class="empty-illu">📭</div><h3 style="font-size:1rem">لا توجد طلبات</h3><p class="muted">لم نجد أي طلبات بهذا الرقم أو رقم الطلب.</p></div>';
        return;
      }
      out.innerHTML = `<div class="myorders-list">${mine.map(o => `
        <div class="order-card">
          <div class="order-card-top">
            <strong class="order-card-number">${esc(o.orderNumber || ('#' + o.id.slice(-8).toUpperCase()))}</strong>
            <span class="pill ${esc(o.orderStage || 'received')}">${OrderLifecycle.getStatusIcon(o.orderStage || 'received')} ${esc(OrderLifecycle.getStatusLabel(o.orderStage || 'received'))}</span>
          </div>
          <div class="order-card-meta">${fmtDate(o.createdAt)} · ${money(o.total)}</div>
          <div class="order-card-pay"><span class="pay-badge ${esc(Payment.getBadgeClass(o))}">${Payment.getIcon(o)} ${esc(Payment.getLabel(o))}</span></div>
          <div class="order-card-items">${o.items.map(i => `${esc(i.name)} ×${arNum(i.qty)}`).join('، ')}</div>
          <div class="order-card-actions">
            <button class="btn btn-ghost btn-sm" data-track="${esc(o.id)}">🔍 تتبع الطلب</button>
            <button class="btn btn-ghost btn-sm" data-view-invoice="${esc(o.id)}">🧾 عرض الفاتورة</button>
          </div>
        </div>
      `).join('')}</div>`;

      out.querySelectorAll('[data-track]').forEach(btn => {
        btn.addEventListener('click', () => _openCustomerTracking(btn.getAttribute('data-track')));
      });
      out.querySelectorAll('[data-view-invoice]').forEach(btn => {
        btn.addEventListener('click', () => Invoices.openCustomer(btn.getAttribute('data-view-invoice')));
      });
    };

    root.querySelector('#myOrdersLookup')?.addEventListener('click', lookup);
    root.querySelector('#myOrdersPhone')?.addEventListener('keypress', e => { if (e.key === 'Enter') lookup(); });
  };

  const _updateOrdersBadge = () => {
    const el = document.getElementById('ordersBadge');
    if (el) el.textContent = arNum(Orders.list().filter(o => !['cancelled', 'refunded'].includes(o.status)).length);
  };

  const renderReviews = () => {
    const grid = document.getElementById('reviewsGrid');
    if (!grid) return;
    const reviews = Reviews.list().slice(0, 6);
    if (reviews.length === 0) {
      grid.innerHTML = '<div class="empty"><div class="empty-illu">💬</div><h3>لا توجد تقييمات بعد</h3><p>كن أول من يشاركنا تجربته.</p></div>';
      return;
    }
    grid.innerHTML = reviews.map(r => `
      <div class="review-card">
        <div class="review-head">
          <div class="avatar" ${r.image ? `style="background-image:url('${esc(r.image)}')"` : ''}>${r.image ? '' : esc((r.name || '?').charAt(0).toUpperCase())}</div>
          <div>
            <strong>${esc(r.name)}</strong>
            <div class="review-stars">${stars(r.rating)}</div>
          </div>
        </div>
        <p>"${esc(r.comment)}"</p>
        <span class="review-date">${fmtDate(r.createdAt)}</span>
      </div>
    `).join('');
  };

  const openReviewModal = () => {
    const body = `
      <form id="reviewForm" class="form-grid" novalidate>
        <div class="form-row"><label>اسمك</label><input name="name" required /><span class="field-err"></span></div>
        <div class="form-row"><label>التقييم</label>
          <select name="rating">
            <option value="5">★★★★★ — ممتاز</option>
            <option value="4">★★★★ — جيد</option>
            <option value="3">★★★ — مقبول</option>
            <option value="2">★★ — ضعيف</option>
            <option value="1">★ — سيء</option>
          </select>
        </div>
        <div class="form-row"><label>تعليقك</label><textarea name="comment" required placeholder="شاركنا رأيك..."></textarea><span class="field-err"></span></div>
        <div class="form-row"><label>رابط صورة (اختياري)</label><input name="image" placeholder="https://…" inputmode="url" /></div>
      </form>
    `;
    const footer = `<button class="btn btn-ghost" data-close>إلغاء</button><button class="btn btn-primary" id="submitReview">نشر التقييم</button>`;
    const { close, root } = Modal.open({ title: 'اكتب تقييمك', body, footer, size: 'small' });
    root.querySelector('#submitReview')?.addEventListener('click', () => {
      const form = root.querySelector('#reviewForm');
      const d = Object.fromEntries(new FormData(form).entries());
      const errors = Validator.form({ name: d.name, comment: d.comment });
      Validator.applyErrors(form, errors);
      if (Object.keys(errors).length) return;
      Reviews.create(d);
      close();
      Toast.success('شكراً على تقييمك!');
      renderReviews();
      renderAbout();
    });
  };

  const renderAbout = () => {
    const a = Analytics.compute();
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('aboutOrders', arNum(a.totals.orders));
    set('aboutProducts', arNum(a.totals.products));
    set('aboutReviews', arNum(a.totals.reviews));
    set('statProducts', '+' + arNum(Math.max(200, a.totals.products)));
  };

  EventBus.on('orders:changed', _updateOrdersBadge);

  return { mount, renderProducts, renderReviews, renderAbout, renderCategories, openOrderModal, openCheckoutModal, openMyOrders };
})();

/* ========================= LAYER 15: ADMIN UI ========================= */
const Admin = (() => {
  const state = {
    tab: 'dashboard', orderStageFilter: '', orderRefundedFilter: false, orderSearch: '',
    reportsPeriod: 'month', reportsFrom: '', reportsTo: '',
  };
  // Captures the public store's original #app markup the first time Admin
  // takes over the container, so it can be restored instantly on exit
  // (no reload needed) and UI.mount() has real DOM to bind/render into.
  let _storeAppHTML = null;

  const open = () => {
    const app = document.getElementById('app');
    if (_storeAppHTML === null) _storeAppHTML = app.innerHTML;
    document.body.classList.add('admin-mode');
    document.body.classList.remove('has-bottom-nav');
    document.getElementById('siteHeader').style.display = 'none';
    document.querySelector('.site-footer').style.display = 'none';
    document.getElementById('bottomNav').style.display = 'none';
    app.innerHTML = '';
    _bindLiveUpdates();
    if (!Auth.isLoggedIn()) { _renderLogin(); return; }
    _renderShell();
  };

  /* ===== Live update (req. 13) — reuses the existing EventBus, no new
     state management. Whenever payment/lifecycle/orders change, re-render
     the current Admin tab if it's one that shows those numbers. ===== */
  let _liveBound = false;
  const _bindLiveUpdates = () => {
    if (_liveBound) return;
    _liveBound = true;
    const refresh = () => {
      if (!document.body.classList.contains('admin-mode')) return;
      if (['dashboard', 'orders', 'reports', 'expenses'].includes(state.tab)) _renderTab();
    };
    EventBus.on('order:paymentChanged', refresh);
    EventBus.on('order:stageChanged', refresh);
    EventBus.on('order:statusChanged', refresh);
    EventBus.on('orders:changed', refresh);
    EventBus.on('expenses:changed', refresh);
  };

  const close = () => {
    document.body.classList.remove('admin-mode');
    document.getElementById('siteHeader').style.display = '';
    document.querySelector('.site-footer').style.display = '';
    document.getElementById('bottomNav').style.display = '';
    const app = document.getElementById('app');
    if (_storeAppHTML !== null) app.innerHTML = _storeAppHTML;
    if (location.hash !== '#/') location.hash = '#/';
  };

  const _renderLogin = () => {
    const app = document.getElementById('app');

    if (Auth.isLocked()) {
      const mins = Auth.lockoutRemaining();
      app.innerHTML = `
        <div style="min-height:100vh;display:grid;place-items:center;background:var(--bg-muted);padding:20px">
          <div style="background:#fff;border:1px solid var(--border);border-radius:20px;padding:32px;width:100%;max-width:400px;box-shadow:var(--shadow);text-align:center">
            <div style="font-size:2.5rem;margin-bottom:12px">🔒</div>
            <h2 style="font-size:1.2rem;margin-bottom:8px">الحساب مقفل مؤقتاً</h2>
            <p class="muted" style="font-size:.9rem">بسبب محاولات دخول متعددة خاطئة، تم قفل الحساب لمدة ${arNum(mins)} دقيقة.</p>
            <a href="#/" style="display:inline-block;margin-top:14px;color:var(--muted);font-size:.88rem">← العودة للمتجر</a>
          </div>
        </div>`;
      return;
    }

    const _s = Settings.get();
    const _logo = _s.storeLogo || H.defaultLogo;
    app.innerHTML = `
      <div style="min-height:100vh;display:grid;place-items:center;background:var(--bg-muted);padding:20px">
        <form id="loginForm" style="background:#fff;border:1px solid var(--border);border-radius:20px;padding:32px;width:100%;max-width:400px;box-shadow:var(--shadow)">
          <div style="text-align:center;margin-bottom:18px">
            <img src="${esc(_logo)}" data-logo alt="${esc(_s.storeName)}" style="height:36px;margin:0 auto" />
            <h2 style="font-size:1.35rem;margin-top:14px;font-weight:800">دخول الموظفين</h2>
            <p class="muted" style="font-size:.85rem">منطقة محظورة</p>
          </div>
          <div class="form-row">
            <label>كلمة المرور</label>
            <input type="password" id="loginPw" autocomplete="current-password" autofocus />
            <span class="field-err" id="loginErr"></span>
          </div>
          <button class="btn btn-primary btn-block" style="margin-top:14px" type="submit">تسجيل الدخول</button>
          <div style="text-align:center;margin-top:14px"><a href="#/" style="color:var(--muted);font-size:.88rem">← العودة للمتجر</a></div>
        </form>
      </div>
    `;
    app.querySelector('#loginForm').addEventListener('submit', e => {
      e.preventDefault();
      const pw = app.querySelector('#loginPw').value;
      const result = Auth.login(pw);
      if (result.ok) { Toast.success('أهلاً بعودتك.'); _renderShell(); }
      else {
        app.querySelector('#loginErr').textContent = result.error;
        app.querySelector('#loginPw').value = '';
        app.querySelector('#loginPw').focus();
        if (Auth.isLocked()) setTimeout(() => _renderLogin(), 500);
      }
    });
  };

  const _renderShell = () => {
    const app = document.getElementById('app');
    const lowStock = Inventory.getLowStock();
    const s = Settings.get();
    const logo = s.storeLogo || H.defaultLogo;
    const tabLabels = {
      dashboard: 'لوحة التحكم', products: 'المنتجات', orders: 'الطلبات',
      customers: 'العملاء', reviews: 'التقييمات', inventory: 'المخزون',
      reports: 'التقارير', expenses: 'المصروفات',
    };
    app.innerHTML = `
      <div class="admin-shell">
        <div class="admin-topbar">
          <button class="icon-btn admin-menu-toggle" id="adminMenuToggle" aria-label="فتح قائمة الإدارة" aria-expanded="false">
            <span class="hamburger"><span></span><span></span><span></span></span>
          </button>
          <strong class="admin-topbar-title">الإدارة</strong>
          <span class="admin-topbar-section" id="adminTopbarSection">${esc(tabLabels[state.tab] || '')}</span>
        </div>
        <div class="admin-nav-overlay" id="adminNavOverlay" hidden></div>
        <aside class="admin-side" id="adminSide">
          <div class="a-brand">
            <img src="${esc(logo)}" data-logo alt="${esc(s.storeName)}" />
            <strong>الإدارة</strong>
          </div>
          <nav class="a-nav">
            <button class="nav-link" data-tab="dashboard">📊 لوحة التحكم</button>
            <button class="nav-link" data-tab="products">📦 المنتجات</button>
            <button class="nav-link" data-tab="orders">🧾 الطلبات</button>
            <button class="nav-link" data-tab="reports">📈 التقارير</button>
            <button class="nav-link" data-tab="expenses">💸 المصروفات</button>
            <button class="nav-link" data-tab="customers">👥 العملاء</button>
            <button class="nav-link" data-tab="reviews">⭐ التقييمات</button>
            <button class="nav-link" data-tab="inventory">📋 المخزون</button>
          </nav>
          <div class="a-foot">
            <a href="#" id="adminOpenSettings">⚙ إعدادات المتجر</a>
            <a href="#" id="adminOpenInvoices">🧾 الفواتير</a>
            <a href="#/">↩ المتجر</a>
            <a href="#" id="adminBackup">💾 نسخ احتياطي</a>
            <a href="#" id="adminReset">⚠ إعادة ضبط</a>
            <a href="#" id="adminLogout">⎋ خروج</a>
          </div>
        </aside>
        <main class="admin-main" id="adminMain"></main>
      </div>
    `;

    // Mobile/tablet off-canvas admin sidebar
    const side = app.querySelector('#adminSide');
    const menuToggle = app.querySelector('#adminMenuToggle');
    const navOverlay = app.querySelector('#adminNavOverlay');
    const openAdminMenu = () => {
      side.classList.add('open');
      navOverlay.hidden = false;
      requestAnimationFrame(() => navOverlay.classList.add('show'));
      document.body.classList.add('admin-menu-open');
      menuToggle.classList.add('menu-open');
      menuToggle.setAttribute('aria-expanded', 'true');
    };
    const closeAdminMenu = () => {
      side.classList.remove('open');
      navOverlay.classList.remove('show');
      document.body.classList.remove('admin-menu-open');
      menuToggle.classList.remove('menu-open');
      menuToggle.setAttribute('aria-expanded', 'false');
      setTimeout(() => { navOverlay.hidden = true; }, 220);
    };
    menuToggle?.addEventListener('click', () => side.classList.contains('open') ? closeAdminMenu() : openAdminMenu());
    navOverlay?.addEventListener('click', closeAdminMenu);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && side.classList.contains('open')) closeAdminMenu(); });

    app.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.tab = btn.getAttribute('data-tab');
        const sectionEl = app.querySelector('#adminTopbarSection');
        if (sectionEl) sectionEl.textContent = tabLabels[state.tab] || '';
        closeAdminMenu();
        _renderTab();
      });
    });
    app.querySelector('#adminOpenSettings').addEventListener('click', e => {
      e.preventDefault(); SettingsPanel.open();
    });
    app.querySelector('#adminOpenInvoices').addEventListener('click', e => {
      e.preventDefault(); InvoicesTab.open();
    });
    app.querySelector('#adminLogout').addEventListener('click', e => {
      e.preventDefault(); Auth.logout(); Toast.success('تم تسجيل الخروج.'); _renderLogin();
    });
    app.querySelector('#adminBackup').addEventListener('click', e => {
      e.preventDefault();
      DB.backup();
      Toast.success('تم تنزيل النسخة الاحتياطية بنجاح.');
    });
    app.querySelector('#adminReset').addEventListener('click', async e => {
      e.preventDefault();
      const ok = await Modal.confirm({
        title: 'إعادة ضبط المصنع',
        message: 'سيتم مسح كل المنتجات والطلبات والعملاء والتقييمات. هذا الإجراء لا يمكن التراجع عنه.',
        confirmLabel: 'احذف كل شيء', danger: true,
      });
      if (!ok) return;
      // Reset is a separate operation from Backup — it never auto-runs a
      // backup first; the admin must back up explicitly beforehand if wanted.
      DB.factoryReset();
      _bootstrapData();
      Toast.success('تم إرجاع البيانات للوضع الافتراضي.');
      _renderTab();
    });
    _renderTab();
  };

  const _renderTab = () => {
    Auth.touch();
    document.querySelectorAll('.admin-side .nav-link').forEach(b =>
      b.classList.toggle('active', b.getAttribute('data-tab') === state.tab));
    const main = document.getElementById('adminMain');
    if (!main) return;
    switch (state.tab) {
      case 'dashboard': _renderDashboard(main); break;
      case 'products':  _renderProducts(main); break;
      case 'orders':    _renderOrders(main); break;
      case 'reports':   _renderReports(main); break;
      case 'expenses':  _renderExpenses(main); break;
      case 'customers': _renderCustomers(main); break;
      case 'reviews':   _renderReviewsAdmin(main); break;
      case 'inventory': _renderInventory(main); break;
    }
  };

  /* Shared refund-stats markup — used by both Dashboard and Reports, each
     passing in a differently-scoped Finance.refundStats() result. Never
     mixed into revenue/profit KPIs above. */
  const _renderRefundSections = (rs) => `
      <div class="panel">
        <div class="panel-head"><h2>الطلبات المستردة</h2></div>
        <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)">
          <div class="kpi"><div class="label">عدد الطلبات المستردة</div><div class="val">${arNum(rs.count)}</div></div>
          <div class="kpi"><div class="label">قيمة الطلبات المستردة</div><div class="val">${money(rs.value)}</div></div>
          <div class="kpi"><div class="label">تكلفة المنتجات المستردة</div><div class="val">${money(rs.cost)}</div></div>
          <div class="kpi"><div class="label">الربح المفقود</div><div class="val">${money(rs.lostGrossProfit || 0)}</div></div>
          <div class="kpi"><div class="label">مصاريف شحن الإرجاع (على المتجر)</div><div class="val">${money(rs.shipping)}</div></div>
          <div class="kpi"><div class="label">إجمالي خسارة الاسترداد</div><div class="val">${money(rs.loss)}</div></div>
          <div class="kpi"><div class="label">نسبة الاسترداد</div><div class="val">${arNum(rs.refundRate.toFixed(1))}%</div></div>
          <div class="kpi"><div class="label">تأثير الاستردادات على الأرباح</div><div class="val">${arNum(rs.impactPct.toFixed(1))}%</div></div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>أسباب الاسترداد</h2></div>
        ${rs.reasons.length === 0 ? '<p class="muted">لا توجد طلبات مستردة.</p>' :
          '<div class="table-wrap"><table class="data"><thead><tr><th>السبب</th><th>عدد الطلبات</th><th>النسبة</th><th>القيمة</th></tr></thead><tbody>' +
          rs.reasons.map(r => `<tr><td data-label="السبب">${esc(r.reason)}</td><td data-label="عدد الطلبات">${arNum(r.count)}</td><td data-label="النسبة">${arNum(r.pct.toFixed(1))}%</td><td data-label="القيمة">${money(r.value)}</td></tr>`).join('') +
          '</tbody></table></div>'}
      </div>
  `;

  const _renderDashboard = (main) => {
    const a = Analytics.compute();
    const alerts = [];
    if (a.totals.outOfStockCount > 0) alerts.push(`<div class="alert-banner danger">⛔ ${arNum(a.totals.outOfStockCount)} منتج نفد من المخزون تماماً</div>`);
    if (a.totals.lowStockCount > 0) alerts.push(`<div class="alert-banner warn">⚠ ${arNum(a.totals.lowStockCount)} منتج على وشك النفاد (أقل من ${arNum(CONFIG.lowStockThreshold)} قطع)</div>`);

    main.innerHTML = `
      <div class="admin-head">
        <h1>لوحة التحكم</h1>
        <span class="muted">${new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
      </div>
      ${alerts.join('')}
      <div class="kpi-grid">
        <div class="kpi"><div class="label">إجمالي الطلبات</div><div class="val">${arNum(a.totals.orders)}</div><div class="kpi-sub">${arNum(a.totals.activeOrders)} نشط</div></div>
        <div class="kpi"><div class="label">تم التوصيل</div><div class="val">${arNum(a.totals.delivered)}</div><div class="kpi-sub">${arNum(a.totals.completionRate.toFixed(0))}% إتمام</div></div>
        <div class="kpi"><div class="label">إجمالي المبيعات</div><div class="val">${money(a.totals.totalSales)}</div></div>
        <div class="kpi"><div class="label">الإيرادات المحصلة</div><div class="val">${money(a.totals.revenue)}</div></div>
        <div class="kpi"><div class="label">تكلفة المنتجات</div><div class="val">${money(a.totals.cost)}</div></div>
        <div class="kpi"><div class="label">الربح الإجمالي</div><div class="val">${money(a.totals.profit)}</div></div>
        <div class="kpi"><div class="label">المصروفات</div><div class="val">${money(a.totals.expensesTotal)}</div></div>
        <div class="kpi"><div class="label">صافي الربح</div><div class="val">${money(a.totals.netProfit)}</div></div>
        <div class="kpi"><div class="label">هامش صافي الربح</div><div class="val">${arNum(a.totals.netMargin.toFixed(1))}%</div></div>
      </div>
      <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)">
        <div class="kpi"><div class="label">المنتجات</div><div class="val">${arNum(a.totals.products)}</div></div>
        <div class="kpi"><div class="label">العملاء</div><div class="val">${arNum(a.totals.customers)}</div></div>
        <div class="kpi"><div class="label">متوسط قيمة الطلب المدفوع</div><div class="val">${money(a.totals.avgOrderValue)}</div></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>الطلبات — آخر 14 يوم</h2><span class="muted">نسبة الإتمام: ${arNum(a.totals.completionRate.toFixed(0))}%</span></div>
        <div class="chart-wrap"><canvas id="ordersChart"></canvas></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px" class="dash-row">
        <div class="panel">
          <div class="panel-head"><h2>الأكثر مبيعاً</h2></div>
          ${a.topProducts.length === 0 ? '<p class="muted">لا توجد طلبات مدفوعة بعد.</p>' :
            '<div class="table-wrap"><table class="data"><thead><tr><th>المنتج</th><th>الكمية</th><th>الإيرادات</th><th>تكلفة المنتجات</th><th>الربح</th></tr></thead><tbody>' +
            a.topProducts.map(t => `<tr><td data-label="المنتج">${esc(t.name)}</td><td data-label="الكمية">${arNum(t.qty)}</td><td data-label="الإيرادات">${money(t.revenue)}</td><td data-label="تكلفة المنتجات">${money(t.cost)}</td><td data-label="الربح">${money(t.profit)}</td></tr>`).join('') + '</tbody></table></div>'}
        </div>
        <div class="panel">
          <div class="panel-head"><h2>أفضل العملاء</h2></div>
          ${a.topCustomers.length === 0 ? '<p class="muted">لا يوجد عملاء بعد.</p>' :
            '<table class="data"><thead><tr><th>الاسم</th><th>الطلبات</th><th>الإجمالي</th></tr></thead><tbody>' +
            a.topCustomers.map(c => `<tr><td data-label="الاسم">${esc(c.name)}</td><td data-label="الطلبات">${arNum(c.ordersCount || 0)}</td><td data-label="الإجمالي">${money(c.totalSpent || 0)}</td></tr>`).join('') + '</tbody></table>'}
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>توزيع الطلبات حسب مسار الطلب</h2></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${ORDER_STAGES.map(s => `
            <div style="display:flex;align-items:center;gap:8px;padding:8px 14px;background:var(--bg-muted);border-radius:999px;font-size:.85rem">
              <span class="pill ${s}">${OrderLifecycle.getStatusIcon(s)} ${OrderLifecycle.getStatusLabel(s)}</span>
              <strong>${arNum(a.stageBreakdown[s] || 0)}</strong>
            </div>
          `).join('')}
        </div>
      </div>
      ${_renderRefundSections(a.refundStats)}
    `;
    main.querySelectorAll('.dash-row').forEach(el => {
      if (window.innerWidth < 900) el.style.gridTemplateColumns = '1fr';
    });
    _drawChart(a.buckets);
  };

  const _drawChart = (buckets) => {
    const canvas = document.getElementById('ordersChart');
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth || 600, H = canvas.clientHeight || 260;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    const pad = { l: 36, r: 12, t: 16, b: 28 };
    const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
    const max = Math.max(1, ...buckets.map(b => b.count));
    ctx.strokeStyle = '#e8e8e5'; ctx.fillStyle = '#9ca3af';
    ctx.font = `11px Cairo, sans-serif`;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (ch / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke();
      ctx.fillStyle = '#9ca3af';
      ctx.fillText(String(Math.round(max - (max / 4) * i)), 4, y + 3);
    }
    const bw = cw / buckets.length;
    buckets.forEach((b, i) => {
      const h = (b.count / max) * ch;
      const x = pad.l + i * bw + bw * 0.18;
      const y = pad.t + ch - h;
      ctx.fillStyle = b.count > 0 ? '#0f172a' : '#e8e8e5';
      ctx.beginPath();
      const w = bw * 0.64, r = Math.min(4, w / 2);
      if (h > 0) {
        ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
      }
      ctx.fill();
      if (i % 2 === 0 || buckets.length <= 7) {
        ctx.fillStyle = '#9ca3af'; ctx.font = '10px Cairo, sans-serif';
        ctx.fillText(b.label, x + w / 2 - 10, H - pad.b + 14);
      }
    });
  };

  /* ===== Reports (req. 9-12) — reuses Finance/Periods; same formulas as
     the Dashboard, just scoped to a date range. ===== */
  const _reportsRange = () => Periods.range(state.reportsPeriod, state.reportsFrom, state.reportsTo);

  const _pctLabel = (v) => v === null ? '—' : `${v >= 0 ? '+' : ''}${arNum(v.toFixed(1))}%`;

  /* Human label for the currently selected report period, used as the PDF
     title/filename ("تقرير اليوم", "تقرير أغسطس 2026", "تقرير من .. إلى ..") */
  const _reportsPeriodLabel = (from, to) => {
    const p = state.reportsPeriod;
    if (p === 'today') return 'تقرير اليوم';
    if (p === 'week') return 'تقرير هذا الأسبوع';
    if (p === 'year') return `تقرير سنة ${new Date(from).getFullYear()}`;
    if (p === 'month') return `تقرير ${new Date(from).toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })}`;
    return `تقرير من ${new Date(from).toLocaleDateString('ar-EG')} إلى ${new Date(to).toLocaleDateString('ar-EG')}`;
  };

  /* ===== Report PDF (req. 5-6) — reuses the exact same PDFService.exportHTML
     mechanism as the invoice PDF (js/services/pdf.js is untouched). Static,
     in-flow, table-based markup only (no off-screen capture, no modal
     covering it, no flex/grid) so it never renders blank, same as the
     invoice template. ===== */
  const _renderReportPDFHTML = ({ from, to, fin, net, products, expensesInRange }) => {
    const s = Settings.get();
    const logoHtml = `<img src="${esc(H.logoSrc(s))}" alt="${esc(s.storeName || '')}" class="pdf-logo-img"/>`;
    const periodLabel = _reportsPeriodLabel(from, to);

    const kpiRows = [
      ['إجمالي المبيعات', money(fin.totalSales)],
      ['الإيرادات المحصلة', money(fin.revenue)],
      ['تكلفة المنتجات', money(fin.cost)],
      ['الربح الإجمالي', money(fin.profit)],
      ['المصروفات', money(net.expensesTotal)],
      ['صافي الربح', money(net.netProfit)],
      ['هامش صافي الربح', `${arNum(net.netMargin.toFixed(1))}%`],
    ];
    const salesRows = [
      ['إجمالي عدد الطلبات', arNum(fin.ordersCount)],
      ['عدد الطلبات المدفوعة', arNum(fin.paidCount)],
      ['متوسط قيمة الطلب المدفوع', money(fin.avgPaidOrderValue)],
    ];

    const topProductRows = products.slice(0, 10).map(p => `
      <tr class="pdf-avoid-break">
        <td>${esc(p.name)}</td><td class="pdf-c">${arNum(p.qty)}</td>
        <td class="pdf-c">${money(p.revenue)}</td><td class="pdf-c">${money(p.cost)}</td>
        <td class="pdf-c">${money(p.profit)}</td>
      </tr>`).join('');

    const expenseRows = expensesInRange.map(e => `
      <tr class="pdf-avoid-break">
        <td>${esc(e.category)}</td><td class="pdf-c">${fmtDate(e.date)}</td>
        <td class="pdf-c">${money(e.amount)}</td><td>${esc(e.notes || '—')}</td>
      </tr>`).join('');

    return `
      <div class="pdf-invoice" dir="rtl" lang="ar">
        <table class="pdf-head-table"><tbody><tr>
          <td class="pdf-head-brand">
            ${logoHtml}
            <div class="pdf-store-name">${esc(s.storeName)}</div>
            ${s.storeAddress ? `<div class="pdf-store-line">${esc(s.storeAddress)}</div>` : ''}
            <div class="pdf-store-line">${esc(s.storePhone || '')}${s.storeEmail ? ` · ${esc(s.storeEmail)}` : ''}</div>
          </td>
          <td class="pdf-head-meta">
            <div class="pdf-inv-title">تقرير المبيعات والأداء المالي</div>
            <table class="pdf-meta-table"><tbody>
              <tr><td>الفترة</td><td>${esc(periodLabel)}</td></tr>
              <tr><td>تاريخ الإصدار</td><td>${esc(fmtDateTime(Date.now()))}</td></tr>
            </tbody></table>
          </td>
        </tr></tbody></table>

        <div class="pdf-section-title">الملخص المالي</div>
        <table class="pdf-items-table"><tbody>
          ${kpiRows.map(([label, val]) => `<tr class="pdf-avoid-break"><td>${esc(label)}</td><td class="pdf-c">${val}</td></tr>`).join('')}
        </tbody></table>

        <div class="pdf-section-title">المبيعات</div>
        <table class="pdf-items-table"><tbody>
          ${salesRows.map(([label, val]) => `<tr class="pdf-avoid-break"><td>${esc(label)}</td><td class="pdf-c">${val}</td></tr>`).join('')}
        </tbody></table>

        <div class="pdf-section-title">الأكثر مبيعاً</div>
        ${topProductRows ? `
        <table class="pdf-items-table">
          <thead><tr><th>المنتج</th><th>الكمية</th><th>الإيرادات</th><th>التكلفة</th><th>الربح</th></tr></thead>
          <tbody>${topProductRows}</tbody>
        </table>` : `<p style="color:#64748b;font-size:12px">لا توجد بيانات مبيعات في هذه الفترة.</p>`}

        <div class="pdf-section-title">المصروفات</div>
        ${expenseRows ? `
        <table class="pdf-items-table">
          <thead><tr><th>الفئة</th><th>التاريخ</th><th>المبلغ</th><th>ملاحظات</th></tr></thead>
          <tbody>${expenseRows}</tbody>
        </table>` : `<p style="color:#64748b;font-size:12px">لا توجد مصروفات في هذه الفترة.</p>`}

        <div class="pdf-footer">${esc(s.storeName)} · ${esc(periodLabel)}</div>
      </div>
    `;
  };

  const _renderReports = (main) => {
    const { from, to } = _reportsRange();
    const prev = Periods.previousRange({ from, to });
    const allOrders = Orders.list();
    const inRange = allOrders.filter(o => o.createdAt >= from && o.createdAt <= to);
    const inPrev = allOrders.filter(o => o.createdAt >= prev.from && o.createdAt <= prev.to);

    const fin = Finance.computeForOrders(inRange);
    const finPrev = Finance.computeForOrders(inPrev);
    const products = Finance.productBreakdown(inRange);

    const expensesInRange = Expenses.inRange(from, to);
    const expensesInPrev = Expenses.inRange(prev.from, prev.to);
    const net = Finance.computeNet(fin, expensesInRange, Finance.refundShippingTotal(inRange));
    const netPrev = Finance.computeNet(finPrev, expensesInPrev, Finance.refundShippingTotal(inPrev));
    const refundStats = Finance.refundStats(inRange);

    const revChange = Periods.pctChange(fin.revenue, finPrev.revenue);
    const profitChange = Periods.pctChange(fin.profit, finPrev.profit);
    const netProfitChange = Periods.pctChange(net.netProfit, netPrev.netProfit);
    const ordersChange = Periods.pctChange(fin.ordersCount, finPrev.ordersCount);

    // Daily revenue trend across the selected range (capped at 60 points for readability)
    const dayMs = 86400000;
    let spanDays = Math.max(1, Math.round((to - from) / dayMs) + 1);
    const trendBuckets = [];
    if (spanDays <= 60) {
      for (let i = 0; i < spanDays; i++) {
        const ts = from + i * dayMs;
        trendBuckets.push({ ts, label: new Date(ts).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }), revenue: 0 });
      }
      inRange.forEach(o => {
        if (!Finance.isFinancialOrder(o)) return;
        const idx = Math.floor((o.createdAt - from) / dayMs);
        if (trendBuckets[idx]) trendBuckets[idx].revenue += o.total || 0;
      });
    }

    main.innerHTML = `
      <div class="admin-head">
        <h1>التقارير</h1>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span class="muted">${new Date(from).toLocaleDateString('ar-EG')} — ${new Date(to).toLocaleDateString('ar-EG')}</span>
          <button class="btn btn-ghost btn-sm" id="reportsPdfBtn">📄 تحميل التقرير PDF</button>
        </div>
      </div>
      <div class="panel reports-filter-panel">
        <div class="reports-filters">
          <select id="reportsPeriod" style="padding:10px 14px;border:1px solid var(--border);border-radius:999px;font-family:var(--font-body)">
            <option value="today" ${state.reportsPeriod === 'today' ? 'selected' : ''}>اليوم</option>
            <option value="week" ${state.reportsPeriod === 'week' ? 'selected' : ''}>هذا الأسبوع</option>
            <option value="month" ${state.reportsPeriod === 'month' ? 'selected' : ''}>هذا الشهر</option>
            <option value="year" ${state.reportsPeriod === 'year' ? 'selected' : ''}>هذه السنة</option>
            <option value="custom" ${state.reportsPeriod === 'custom' ? 'selected' : ''}>فترة مخصصة</option>
          </select>
          ${state.reportsPeriod === 'custom' ? `
            <label class="reports-date-label">من <input type="date" id="reportsFrom" value="${esc(state.reportsFrom)}" /></label>
            <label class="reports-date-label">إلى <input type="date" id="reportsTo" value="${esc(state.reportsTo)}" /></label>
          ` : ''}
        </div>
      </div>
      <div class="kpi-grid">
        <div class="kpi"><div class="label">إجمالي عدد الطلبات</div><div class="val">${arNum(fin.ordersCount)}</div><div class="kpi-sub">${_pctLabel(ordersChange)}</div></div>
        <div class="kpi"><div class="label">عدد الطلبات المدفوعة</div><div class="val">${arNum(fin.paidCount)}</div></div>
        <div class="kpi"><div class="label">إجمالي المبيعات</div><div class="val">${money(fin.totalSales)}</div></div>
        <div class="kpi"><div class="label">الإيرادات المحصلة</div><div class="val">${money(fin.revenue)}</div><div class="kpi-sub">${_pctLabel(revChange)}</div></div>
        <div class="kpi"><div class="label">تكلفة المنتجات</div><div class="val">${money(fin.cost)}</div></div>
        <div class="kpi"><div class="label">الربح الإجمالي</div><div class="val">${money(fin.profit)}</div><div class="kpi-sub">${_pctLabel(profitChange)}</div></div>
        <div class="kpi"><div class="label">المصروفات</div><div class="val">${money(net.expensesTotal)}</div></div>
        <div class="kpi"><div class="label">صافي الربح</div><div class="val">${money(net.netProfit)}</div><div class="kpi-sub">${_pctLabel(netProfitChange)}</div></div>
        <div class="kpi"><div class="label">هامش صافي الربح</div><div class="val">${arNum(net.netMargin.toFixed(1))}%</div></div>
        <div class="kpi"><div class="label">متوسط قيمة الطلب المدفوع</div><div class="val">${money(fin.avgPaidOrderValue)}</div></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>مقارنة بالفترة السابقة</h2></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <div class="cmp-chip"><span>تغير الإيرادات</span><strong class="${revChange > 0 ? 'up' : revChange < 0 ? 'down' : ''}">${_pctLabel(revChange)}</strong></div>
          <div class="cmp-chip"><span>تغير الربح الإجمالي</span><strong class="${profitChange > 0 ? 'up' : profitChange < 0 ? 'down' : ''}">${_pctLabel(profitChange)}</strong></div>
          <div class="cmp-chip"><span>تغير صافي الربح</span><strong class="${netProfitChange > 0 ? 'up' : netProfitChange < 0 ? 'down' : ''}">${_pctLabel(netProfitChange)}</strong></div>
          <div class="cmp-chip"><span>تغير عدد الطلبات</span><strong class="${ordersChange > 0 ? 'up' : ordersChange < 0 ? 'down' : ''}">${_pctLabel(ordersChange)}</strong></div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>اتجاه الإيرادات</h2></div>
        ${trendBuckets.length === 0 ? '<p class="muted">الفترة طويلة جداً لعرض اتجاه يومي.</p>' : '<div class="chart-wrap"><canvas id="revenueTrendChart"></canvas></div>'}
      </div>
      <div class="panel">
        <div class="panel-head"><h2>الأكثر مبيعاً</h2></div>
        ${products.length === 0 ? '<p class="muted">لا توجد طلبات مدفوعة في هذه الفترة.</p>' : '<div class="chart-wrap"><canvas id="reportsTopChart"></canvas></div>'}
      </div>
      <div class="panel">
        <div class="panel-head"><h2>تفاصيل المنتجات</h2></div>
        ${products.length === 0 ? '<p class="muted">لا توجد بيانات.</p>' :
          '<div class="table-wrap"><table class="data"><thead><tr><th>المنتج</th><th>الكمية المباعة</th><th>الإيرادات</th><th>التكلفة</th><th>الربح</th><th>هامش الربح</th></tr></thead><tbody>' +
          products.map(p => `<tr><td data-label="المنتج">${esc(p.name)}</td><td data-label="الكمية المباعة">${arNum(p.qty)}</td><td data-label="الإيرادات">${money(p.revenue)}</td><td data-label="التكلفة">${money(p.cost)}</td><td data-label="الربح">${money(p.profit)}</td><td data-label="هامش الربح">${arNum(p.margin.toFixed(1))}%</td></tr>`).join('') +
          '</tbody></table></div>'}
      </div>
      <div class="panel">
        <div class="panel-head"><h2>المصروفات في هذه الفترة</h2><span class="muted">${money(net.expensesTotal)}</span></div>
        ${expensesInRange.length === 0 ? '<p class="muted">لا توجد مصروفات مسجلة في هذه الفترة.</p>' :
          '<div class="table-wrap"><table class="data"><thead><tr><th>الفئة</th><th>التاريخ</th><th>المبلغ</th><th>ملاحظات</th></tr></thead><tbody>' +
          expensesInRange.map(e => `<tr><td data-label="الفئة">${esc(e.category)}</td><td data-label="التاريخ">${fmtDate(e.date)}</td><td data-label="المبلغ">${money(e.amount)}</td><td data-label="ملاحظات">${esc(e.notes || '—')}</td></tr>`).join('') +
          '</tbody></table></div>'}
      </div>
      <div class="admin-head"><h2>تقرير الاستردادات</h2></div>
      ${_renderRefundSections(refundStats)}
    `;

    main.querySelector('#reportsPdfBtn')?.addEventListener('click', () => {
      const html = _renderReportPDFHTML({ from, to, fin, net, products, expensesInRange });
      PDFService.exportHTML(html, `${_reportsPeriodLabel(from, to).replace(/[\\/:*?"<>|]/g, '-')}.pdf`);
    });

    main.querySelector('#reportsPeriod')?.addEventListener('change', e => {
      state.reportsPeriod = e.target.value;
      if (state.reportsPeriod === 'custom' && !state.reportsFrom) {
        const r = Periods.range('month');
        state.reportsFrom = new Date(r.from).toISOString().slice(0, 10);
        state.reportsTo = new Date(r.to).toISOString().slice(0, 10);
      }
      _renderTab();
    });
    main.querySelector('#reportsFrom')?.addEventListener('change', e => { state.reportsFrom = e.target.value; _renderTab(); });
    main.querySelector('#reportsTo')?.addEventListener('change', e => { state.reportsTo = e.target.value; _renderTab(); });

    if (trendBuckets.length) _drawRevenueTrend(trendBuckets);
    if (products.length) _drawTopProductsChart(products.slice(0, 5));
  };

  const _drawRevenueTrend = (buckets) => {
    const canvas = document.getElementById('revenueTrendChart');
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth || 600, H = canvas.clientHeight || 260;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    const pad = { l: 46, r: 12, t: 16, b: 28 };
    const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
    const max = Math.max(1, ...buckets.map(b => b.revenue));
    ctx.strokeStyle = '#e8e8e5'; ctx.font = '10px Cairo, sans-serif';
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (ch / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke();
      ctx.fillStyle = '#9ca3af';
      ctx.fillText(String(Math.round(max - (max / 4) * i)), 2, y + 3);
    }
    ctx.beginPath();
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2;
    buckets.forEach((b, i) => {
      const x = pad.l + (cw / Math.max(1, buckets.length - 1)) * i;
      const y = pad.t + ch - (b.revenue / max) * ch;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    const step = Math.max(1, Math.ceil(buckets.length / 7));
    buckets.forEach((b, i) => {
      if (i % step !== 0 && i !== buckets.length - 1) return;
      const x = pad.l + (cw / Math.max(1, buckets.length - 1)) * i;
      ctx.fillStyle = '#9ca3af'; ctx.font = '10px Cairo, sans-serif';
      ctx.fillText(b.label, x - 12, H - pad.b + 14);
    });
  };

  const _drawTopProductsChart = (products) => {
    const canvas = document.getElementById('reportsTopChart');
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth || 600, H = canvas.clientHeight || 260;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    const pad = { l: 12, r: 12, t: 16, b: 16 };
    const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
    const max = Math.max(1, ...products.map(p => p.qty));
    const rowH = ch / products.length;
    ctx.font = '11px Cairo, sans-serif';
    products.forEach((p, i) => {
      const y = pad.t + i * rowH + rowH * 0.22;
      const barH = rowH * 0.56;
      const w = (p.qty / max) * (cw - 90);
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      const r = Math.min(4, barH / 2);
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + Math.max(w, r), y);
      ctx.quadraticCurveTo(pad.l + w, y, pad.l + w, y + r);
      ctx.lineTo(pad.l + w, y + barH - r);
      ctx.quadraticCurveTo(pad.l + w, y + barH, pad.l + Math.max(w, r), y + barH);
      ctx.lineTo(pad.l, y + barH);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#374151';
      ctx.fillText(`${p.name} (${arNum(p.qty)})`, pad.l + w + 8, y + barH / 2 + 4);
    });
  };

  /* ===== Expenses admin screen (req. 2) — CRUD over the Expenses store,
     same table/modal patterns as Reviews/Products. Admin-only, reached via
     the "المصروفات" nav item. ===== */
  const _renderExpenses = (main) => {
    const expenses = Expenses.list().sort((a, b) => b.date - a.date);
    const total = Expenses.total(expenses);
    main.innerHTML = `
      <div class="admin-head">
        <h1>المصروفات (${arNum(expenses.length)})</h1>
        <button class="btn btn-primary" id="addExpenseBtn">+ إضافة مصروف</button>
      </div>
      <div class="kpi-grid" style="grid-template-columns:repeat(1,1fr)">
        <div class="kpi"><div class="label">إجمالي المصروفات</div><div class="val">${money(total)}</div></div>
      </div>
      <div class="panel">
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>الفئة</th><th>التاريخ</th><th>المبلغ</th><th>ملاحظات</th><th>إجراءات</th></tr></thead>
            <tbody>
              ${expenses.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:30px">لا توجد مصروفات</td></tr>' :
                expenses.map(e => `
                  <tr>
                    <td data-label="الفئة"><strong>${esc(e.category)}</strong></td>
                    <td data-label="التاريخ" style="font-size:.82rem">${fmtDate(e.date)}</td>
                    <td data-label="المبلغ">${money(e.amount)}</td>
                    <td data-label="ملاحظات">${esc((e.notes || '').slice(0, 80))}${(e.notes || '').length > 80 ? '…' : ''}</td>
                    <td data-label="إجراءات">
                      <div class="row-actions">
                        <button class="btn btn-ghost btn-sm" data-edit-exp="${esc(e.id)}">تعديل</button>
                        <button class="btn btn-danger btn-sm" data-del-exp="${esc(e.id)}">حذف</button>
                      </div>
                    </td>
                  </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    main.querySelector('#addExpenseBtn').addEventListener('click', () => _openExpenseForm());
    main.querySelectorAll('[data-edit-exp]').forEach(btn => {
      btn.addEventListener('click', () => _openExpenseForm(btn.getAttribute('data-edit-exp')));
    });
    main.querySelectorAll('[data-del-exp]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-del-exp');
        const ok = await Modal.confirm({ title: 'حذف المصروف', message: 'هل تريد حذف هذا المصروف؟', confirmLabel: 'حذف', danger: true });
        if (!ok) return;
        Expenses.remove(id);
        Toast.success('تم حذف المصروف.');
        _renderTab();
      });
    });
  };

  const _openExpenseForm = (id) => {
    const isEdit = !!id;
    const e = isEdit ? Expenses.get(id) : null;
    const dateVal = new Date(e ? e.date : Date.now()).toISOString().slice(0, 10);
    const body = `
      <form id="expenseForm" class="form-grid" novalidate>
        <div class="form-2col form-grid" style="gap:14px">
          <div class="form-row"><label>الفئة</label>
            <select name="category">
              ${EXPENSE_CATEGORIES.map(c => `<option value="${esc(c)}" ${e?.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
            </select>
          </div>
          <div class="form-row"><label>المبلغ (${CONFIG.currencySymbol})</label><input name="amount" type="number" min="0" step="0.01" required value="${e?.amount || ''}" /><span class="field-err"></span></div>
        </div>
        <div class="form-row"><label>التاريخ</label><input name="date" type="date" required value="${esc(dateVal)}" /><span class="field-err"></span></div>
        <div class="form-row"><label>ملاحظات (اختياري)</label><textarea name="notes">${esc(e?.notes || '')}</textarea></div>
      </form>
    `;
    const footer = `
      <button class="btn btn-ghost" data-close>إلغاء</button>
      <button class="btn btn-primary" id="saveExpenseBtn">${isEdit ? 'حفظ التعديلات' : 'إضافة المصروف'}</button>
    `;
    const { close, root } = Modal.open({ title: isEdit ? 'تعديل المصروف' : 'إضافة مصروف جديد', body, footer, size: 'small' });

    root.querySelector('#saveExpenseBtn').addEventListener('click', () => {
      const form = root.querySelector('#expenseForm');
      const d = Object.fromEntries(new FormData(form).entries());
      const amount = Number(d.amount);
      const dateMs = d.date ? new Date(d.date).setHours(0, 0, 0, 0) : Date.now();
      const errors = {};
      if (!d.amount || !(amount >= 0)) errors.amount = 'أدخل مبلغاً صحيحاً';
      if (!d.date) errors.date = 'اختر التاريخ';
      Validator.applyErrors(form, errors);
      if (Object.keys(errors).length) { Toast.error('من فضلك صحّح الحقول المظللة.'); return; }
      const data = { category: d.category, amount, date: dateMs, notes: d.notes };
      if (isEdit) { Expenses.update(id, data); Toast.success('تم تعديل المصروف.'); }
      else { Expenses.create(data); Toast.success('تم إضافة المصروف.'); }
      close();
      _renderTab();
    });
  };

  const _renderProducts = (main) => {
    const products = Products.list();
    main.innerHTML = `
      <div class="admin-head">
        <h1>المنتجات (${arNum(products.length)})</h1>
        <button class="btn btn-primary" id="addProductBtn">+ إضافة منتج</button>
      </div>
      <div class="panel">
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>الصورة</th><th>الاسم</th><th>SKU</th><th>الفئة</th><th>السعر</th><th>المخزون</th><th>المتاح</th><th>التقييم</th><th>إجراءات</th></tr></thead>
            <tbody>
              ${products.length === 0 ? '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:30px">لا توجد منتجات</td></tr>' :
                products.map(p => {
                  const avail = Inventory.available(p);
                  const isLow = avail > 0 && avail <= CONFIG.lowStockThreshold;
                  const isOut = avail === 0;
                  return `
                    <tr class="${isLow || isOut ? 'low-stock-row' : ''}">
                      <td data-label="الصورة"><img class="row-thumb" src="${esc((p.images || [])[0] || '')}" alt="" onerror="this.onerror=null;this.src=H.fallbackImg" /></td>
                      <td data-label="الاسم"><strong>${esc(p.name)}</strong></td>
                      <td data-label="SKU" style="font-family:monospace;font-size:.78rem">${esc(p.sku || '')}</td>
                      <td data-label="الفئة">${esc(p.category)}</td>
                      <td data-label="السعر">${money(p.price)}</td>
                      <td data-label="المخزون">${arNum(p.stock)}</td>
                      <td data-label="المتاح">${isOut ? '<span style="color:var(--danger);font-weight:700">0 — نفد</span>' : isLow ? `<span style="color:var(--warning);font-weight:700">${arNum(avail)} ⚠</span>` : arNum(avail)}</td>
                      <td data-label="التقييم">${stars(p.rating)} ${arNum((p.rating || 0).toFixed(1))}</td>
                      <td data-label="إجراءات">
                        <div class="row-actions">
                          <button class="btn btn-ghost btn-sm" data-edit="${esc(p.id)}">تعديل</button>
                          <button class="btn btn-danger btn-sm" data-delete="${esc(p.id)}">حذف</button>
                        </div>
                      </td>
                    </tr>`;
                }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    main.querySelector('#addProductBtn')?.addEventListener('click', () => _openProductForm(null));
    main.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => _openProductForm(btn.getAttribute('data-edit')));
    });
    main.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-delete');
        const p = Products.get(id);
        const ok = await Modal.confirm({
          title: 'حذف المنتج',
          message: `هل تريد حذف "${p?.name || id}"؟ لا يمكن التراجع عن هذا الإجراء.`,
          confirmLabel: 'حذف', danger: true,
        });
        if (!ok) return;
        Products.remove(id);
        Toast.success('تم حذف المنتج.');
        _renderTab();
      });
    });
  };

  const _openProductForm = (id) => {
    const isEdit = !!id;
    const p = isEdit ? Products.get(id) : null;

    const body = `
      <form id="productForm" class="form-grid" novalidate>
        <div class="form-2col form-grid" style="gap:14px">
          <div class="form-row"><label>اسم المنتج</label><input name="name" required value="${esc(p?.name || '')}" /><span class="field-err"></span></div>
          <div class="form-row"><label>الفئة</label>
            <select name="category">
              ${CONFIG.categories.map(c => `<option value="${esc(c)}" ${p?.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row"><label>الوصف</label><textarea name="description">${esc(p?.description || '')}</textarea></div>
        <div class="form-row"><label>المميزات (كل ميزة في سطر)</label><textarea name="features">${esc((p?.features || []).join('\n'))}</textarea></div>
        <div class="form-row"><label>روابط الصور (كل رابط في سطر)</label><textarea name="images">${esc((p?.images || []).join('\n'))}</textarea></div>
        <div style="margin-top:6px" id="imagePreview" class="image-preview"></div>
        <div class="form-2col form-grid" style="gap:14px">
          <div class="form-row"><label>السعر (${CONFIG.currencySymbol})</label><input name="price" type="number" min="0" step="0.01" required value="${p?.price || ''}" /><span class="field-err"></span></div>
          <div class="form-row"><label>السعر الأصلي (للخصم)</label><input name="oldPrice" type="number" min="0" step="0.01" value="${p?.oldPrice || ''}" /></div>
        </div>
        <div class="form-2col form-grid" style="gap:14px">
          <div class="form-row"><label>سعر التكلفة</label><input name="costPrice" type="number" min="0" step="0.01" value="${p?.costPrice || ''}" /></div>
          <div class="form-row"><label>المخزون</label><input name="stock" type="number" min="0" required value="${p?.stock ?? ''}" /><span class="field-err"></span></div>
        </div>
        <div class="form-row"><label>التقييم (0–5)</label><input name="rating" type="number" min="0" max="5" step="0.1" value="${p?.rating || ''}" /></div>
      </form>
    `;
    const footer = `
      <button class="btn btn-ghost" data-close>إلغاء</button>
      <button class="btn btn-primary" id="saveProductBtn">${isEdit ? 'حفظ التعديلات' : 'إضافة المنتج'}</button>
    `;
    const { close, root } = Modal.open({ title: isEdit ? 'تعديل المنتج' : 'إضافة منتج جديد', body, footer, size: 'medium' });

    // Image preview
    const updatePreview = debounce(() => {
      const urls = root.querySelector('[name="images"]').value.split('\n').map(s => s.trim()).filter(Boolean);
      const prev = root.querySelector('#imagePreview');
      if (!prev) return;
      prev.innerHTML = urls.slice(0, 5).map(url => `
        <div class="ip">
          <img src="${esc(url)}" onerror="this.parentNode.classList.add('broken');this.remove();this.parentNode.innerHTML='✗'" />
        </div>`).join('');
    }, 400);
    root.querySelector('[name="images"]').addEventListener('input', updatePreview);
    updatePreview();

    root.querySelector('#saveProductBtn').addEventListener('click', () => {
      const form = root.querySelector('#productForm');
      const d = Object.fromEntries(new FormData(form).entries());
      const errors = Validator.form({ productName: d.name, price: d.price, stock: d.stock });
      Validator.applyErrors(form, errors);
      if (Object.keys(errors).length) { Toast.error('من فضلك صحّح الحقول المظللة.'); return; }
      const data = {
        name: d.name, category: d.category, description: d.description,
        features: d.features, images: d.images,
        price: Number(d.price), oldPrice: Number(d.oldPrice) || 0,
        costPrice: Number(d.costPrice) || 0,
        stock: Math.floor(Number(d.stock)) || 0,
        rating: Math.min(5, Math.max(0, Number(d.rating) || 0)),
      };
      if (isEdit) { Products.update(id, data); Toast.success('تم تعديل المنتج.'); }
      else { Products.create(data); Toast.success('تم إضافة المنتج.'); }
      close();
      _renderTab();
    });
  };

  const _renderOrders = (main) => {
    let allOrders = Orders.filter({
      stage: state.orderRefundedFilter ? undefined : (state.orderStageFilter || undefined),
      search: state.orderSearch || undefined,
    });
    if (state.orderRefundedFilter) allOrders = allOrders.filter(o => o.status === 'refunded');

    main.innerHTML = `
      <div class="admin-head">
        <h1>الطلبات (${arNum(allOrders.length)})</h1>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <input type="search" id="orderSearch" placeholder="بحث بالاسم أو الهاتف أو رقم الطلب…"
            value="${esc(state.orderSearch)}"
            style="padding:10px 14px;border:1px solid var(--border);border-radius:999px;outline:none;width:260px;font-family:var(--font-body)" />
          <select id="orderStageFilter" style="padding:10px 14px;border:1px solid var(--border);border-radius:999px;font-family:var(--font-body)">
            <option value="">كل المراحل</option>
            ${OrderLifecycle.getAvailableStatuses().map(s => `<option value="${s}" ${!state.orderRefundedFilter && state.orderStageFilter === s ? 'selected' : ''}>${OrderLifecycle.getStatusIcon(s)} ${OrderLifecycle.getStatusLabel(s)}</option>`).join('')}
            <option value="__refunded" ${state.orderRefundedFilter ? 'selected' : ''}>↩️ مسترد</option>
          </select>
        </div>
      </div>
      <div class="panel">
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>رقم الطلب</th><th>العميل</th><th>الهاتف</th><th>الإجمالي</th><th>مسار الطلب</th><th>الدفع</th><th>التاريخ</th><th>إجراءات</th></tr></thead>
            <tbody>
              ${allOrders.length === 0 ? '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:30px">لا توجد طلبات</td></tr>' :
                allOrders.map(o => `
                  <tr>
                    <td data-label="رقم الطلب" style="font-family:monospace;font-size:.82rem">${esc(o.orderNumber || ('#' + o.id.slice(-8).toUpperCase()))}</td>
                    <td data-label="العميل"><strong>${esc(o.customerSnapshot?.name || '—')}</strong></td>
                    <td data-label="الهاتف" style="direction:ltr">${esc(o.customerSnapshot?.phone || '—')}</td>
                    <td data-label="الإجمالي"><strong>${money(o.total)}</strong></td>
                    <td data-label="مسار الطلب">${o.status === 'refunded'
                      ? `<span class="pill cancelled">↩️ مسترد</span>`
                      : `<span class="pill ${esc(o.orderStage || 'received')}">${OrderLifecycle.getStatusIcon(o.orderStage || 'received')} ${esc(OrderLifecycle.getStatusLabel(o.orderStage || 'received'))}</span>`}</td>
                    <td data-label="الدفع"><span class="pay-badge ${esc(Payment.getBadgeClass(o))}">${Payment.getIcon(o)} ${esc(Payment.getLabel(o))}</span></td>
                    <td data-label="التاريخ" style="font-size:.82rem">${fmtDate(o.createdAt)}</td>
                    <td data-label="إجراءات">
                      <div class="row-actions">
                        <button class="btn btn-ghost btn-sm" data-view-order="${esc(o.id)}">عرض</button>
                        <button class="btn btn-danger btn-sm" data-del-order="${esc(o.id)}">حذف</button>
                      </div>
                    </td>
                  </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const searchInput = main.querySelector('#orderSearch');
    searchInput?.addEventListener('input', debounce(() => { state.orderSearch = searchInput.value; _renderTab(); }, 300));
    main.querySelector('#orderStageFilter')?.addEventListener('change', e => {
      if (e.target.value === '__refunded') { state.orderRefundedFilter = true; state.orderStageFilter = ''; }
      else { state.orderRefundedFilter = false; state.orderStageFilter = e.target.value; }
      _renderTab();
    });

    main.querySelectorAll('[data-view-order]').forEach(btn => {
      btn.addEventListener('click', () => _openOrderDetail(btn.getAttribute('data-view-order')));
    });

    main.querySelectorAll('[data-del-order]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-del-order');
        const ok = await Modal.confirm({ title: 'حذف الطلب', message: 'هل تريد حذف هذا الطلب نهائياً؟', confirmLabel: 'حذف', danger: true });
        if (!ok) return;
        Orders.remove(id);
        Toast.success('تم حذف الطلب.');
        _renderTab();
      });
    });
  };

  const _openOrderDetail = (id) => {
    const o = Orders.get(id); if (!o) return;
    const body = `
      <div style="display:grid;gap:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div>
            <div style="font-size:.78rem;color:var(--muted)">رقم الطلب</div>
            <div style="font-family:monospace;font-size:1.1rem;font-weight:800">${esc(o.orderNumber || ('#' + o.id.slice(-8).toUpperCase()))}</div>
          </div>
          <span class="pill lg ${esc(o.orderStage || 'received')}">${OrderLifecycle.getStatusIcon(o.orderStage || 'received')} ${esc(OrderLifecycle.getStatusLabel(o.orderStage || 'received'))}</span>
        </div>
        <div class="order-detail-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div style="background:var(--bg-muted);border-radius:12px;padding:14px">
            <div style="font-weight:700;margin-bottom:8px">معلومات العميل</div>
            <div>${esc(o.customerSnapshot?.name)}</div>
            <div style="direction:ltr;text-align:right">${esc(o.customerSnapshot?.phone)}</div>
            <div class="muted">${esc(o.customerSnapshot?.address)}</div>
            <div class="muted">${esc(o.customerSnapshot?.city)}</div>
          </div>
          <div style="background:var(--bg-muted);border-radius:12px;padding:14px">
            <div style="font-weight:700;margin-bottom:8px">ملخص الطلب</div>
            <div style="display:flex;justify-content:space-between"><span>المجموع الجزئي</span><span>${money(o.subtotal || o.total)}</span></div>
            <div style="display:flex;justify-content:space-between"><span>الشحن</span><span>${money(o.shippingFee || 0)}</span></div>
            <div style="display:flex;justify-content:space-between"><span>الضريبة</span><span>${money(o.tax || 0)}</span></div>
            <div style="display:flex;justify-content:space-between;font-weight:800;border-top:1px solid var(--border);padding-top:6px;margin-top:6px"><span>إجمالي الفاتورة</span><span>${money(o.total)}</span></div>
            <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center;gap:8px">
              <span style="font-size:.82rem;color:var(--muted)">حالة الدفع</span>
              <span class="pay-badge ${esc(Payment.getBadgeClass(o))}">${Payment.getIcon(o)} ${esc(Payment.getLabel(o))}</span>
            </div>
            <div style="margin-top:10px;padding-top:8px;border-top:1px dashed var(--border);color:#166534">
              <div style="font-size:.72rem;color:var(--muted);margin-bottom:4px">مالياً (للإدارة فقط)</div>
              <div style="display:flex;justify-content:space-between"><span>تكلفة المنتجات</span><span>${money(Finance.invoiceProfit(o).cost)}</span></div>
              <div style="display:flex;justify-content:space-between;font-weight:700"><span>الربح الإجمالي</span><span>${money(Finance.invoiceProfit(o).profit)}</span></div>
              <div style="display:flex;justify-content:space-between;font-weight:800"><span>صافي ربح الفاتورة</span><span>${money(Finance.invoiceProfit(o).profit)}</span></div>
            </div>
          </div>
        </div>
        <div>
          <div style="font-weight:700;margin-bottom:10px">المنتجات</div>
          ${o.items.map(i => `
            <div style="display:flex;gap:12px;align-items:center;padding:10px;background:var(--bg-muted);border-radius:12px;margin-bottom:8px">
              <img src="${esc(i.image || '')}" style="width:50px;height:50px;border-radius:8px;object-fit:cover;background:#fff" onerror="this.onerror=null;this.src=H.fallbackImg" />
              <div style="flex:1">
                <div style="font-weight:700">${esc(i.name)}</div>
                <div class="muted" style="font-size:.85rem">×${arNum(i.qty)} · ${money(i.price)} للقطعة</div>
              </div>
              <div style="font-weight:800">${money(i.price * i.qty)}</div>
            </div>
          `).join('')}
        </div>
        ${o.notes ? `<div style="background:#fffbeb;border-radius:12px;padding:12px;border:1px solid #fde68a"><strong>ملاحظات:</strong> ${esc(o.notes)}</div>` : ''}
        <div>
          <div class="order-detail-section-head">
            <span>مسار الطلب (Order Lifecycle)</span>
            <span class="muted" style="font-size:.78rem;font-weight:500">الحالة التي يراها العميل في صفحة التتبع</span>
          </div>
          <div class="order-timeline ${(o.orderStage || 'received') === 'cancelled' ? 'is-cancelled' : ''}">${Render.orderLifecycleTimeline(o)}</div>
        </div>
        <div>
          <div class="order-detail-section-head"><span>تحديث المرحلة</span></div>
          <div class="stage-actions">
            ${OrderLifecycle.isFinal(o.orderStage)
              ? `<span class="muted">وصل الطلب لمرحلة نهائية ولا يمكن تغييرها.</span>`
              : OrderLifecycle.getNextStatuses(o.orderStage || 'received').map(s =>
                  `<button class="btn btn-ghost btn-sm" data-set-stage="${s}">${OrderLifecycle.getStatusIcon(s)} ${OrderLifecycle.getStatusLabel(s)}</button>`
                ).join('')}
          </div>
        </div>
        <div>
          <div class="order-detail-section-head">
            <span>💳 حالة الدفع</span>
            <span class="muted" style="font-size:.78rem;font-weight:500">تظهر للعميل في التتبع والفاتورة</span>
          </div>
          <div class="payment-card">
            <div class="payment-current">
              <span class="muted" style="font-size:.82rem">الحالة الحالية</span>
              <span class="pay-badge ${esc(Payment.getBadgeClass(o))}">${Payment.getIcon(o)} ${esc(Payment.getLabel(o))}</span>
            </div>
            ${(['cancelled', 'refunded'].includes(o.status) || o.orderStage === 'cancelled' || o.refunded === true) ? `
              <div class="muted" style="font-size:.82rem;margin-top:6px">🔒 هذا الطلب ${(o.status === 'refunded' || o.refunded === true) ? 'مسترد' : 'ملغي'} — لا يمكن تعديل حالة أو طريقة الدفع.</div>
            ` : `
            <div class="payment-methods">
              ${Payment.getAvailableMethods().map(m => `
                <button class="btn btn-sm pay-choice ${m === Payment.getMethod(o) ? 'btn-primary is-current' : 'btn-ghost'}" data-set-payment="${m}" ${m === Payment.getMethod(o) ? 'disabled' : ''}>
                  <span class="pay-choice-ic">${Payment.getMethodIcon(m)}</span>
                  <span>${esc(Payment.getMethodLabel(m))}</span>
                </button>`).join('')}
            </div>
            ${o.paymentStatus === 'paid' ? `<div class="muted" style="font-size:.76rem;margin-top:6px">⚠️ الطلب مدفوع بالفعل — تغيير طريقة الدفع يحتاج تأكيدًا صريحًا.</div>` : ''}
            `}
          </div>
        </div>
        ${o.refunded ? `
        <div>
          <div class="order-detail-section-head"><span>↩️ الاسترداد</span></div>
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:14px;display:grid;gap:6px">
            <div><strong>حالة الاسترداد:</strong> مسترد</div>
            <div><strong>سبب الاسترداد:</strong> ${esc(o.refundReason || '—')}</div>
            ${o.refundReasonNote ? `<div><strong>ملاحظات السبب:</strong> ${esc(o.refundReasonNote)}</div>` : ''}
            <div><strong>تاريخ الاسترداد:</strong> ${esc(fmtDateTime(o.refundedAt))}</div>
            <div><strong>قيمة الطلب المسترد:</strong> ${money(o.total)}</div>
            <div><strong>مصاريف شحن الإرجاع:</strong> ${money(o.refundShippingCost || 0)}</div>
            <div><strong>من تحمل شحن الإرجاع:</strong> ${o.refundShippingPaidBy === 'store' ? 'المتجر' : 'العميل'}</div>
            <div><strong>تكلفة المنتجات:</strong> ${money((o.items || []).reduce((s, i) => s + (i.costPrice || 0) * i.qty, 0))}</div>
            <div><strong>الربح المفقود:</strong> ${money((o.total || 0) - (o.items || []).reduce((s, i) => s + (i.costPrice || 0) * i.qty, 0))}</div>
            <div><strong>إجمالي خسارة الاسترداد:</strong> ${money((o.total || 0) - (o.items || []).reduce((s, i) => s + (i.costPrice || 0) * i.qty, 0) + (o.refundShippingPaidBy === 'store' ? (Number(o.refundShippingCost) || 0) : 0))}</div>
          </div>
        </div>` : (o.orderStage === 'delivered' && o.paymentStatus === 'paid') ? `
        <div>
          <div class="order-detail-section-head"><span>↩️ استرداد الطلب</span></div>
          <div style="background:var(--bg-muted);border-radius:12px;padding:14px;display:grid;gap:10px">
            <label style="font-size:.82rem;color:var(--muted)">سبب الاسترداد *
              <select id="refundReasonSelect" required
                style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;margin-top:4px;font-family:var(--font-body)">
                <option value="">اختر سبب الاسترداد…</option>
                ${REFUND_REASONS.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}
              </select>
            </label>
            <label id="refundReasonNoteWrap" style="display:none;font-size:.82rem;color:var(--muted)">ملاحظات السبب *
              <textarea id="refundReasonNoteInput" rows="2" required
                style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;margin-top:4px;font-family:var(--font-body)"></textarea>
            </label>
            <label style="font-size:.82rem;color:var(--muted)">مصاريف شحن الإرجاع
              <input type="number" id="refundShippingInput" min="0" step="0.01" value="0"
                style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;margin-top:4px;font-family:var(--font-body)" />
            </label>
            <label style="font-size:.82rem;color:var(--muted)">من يتحمل شحن الإرجاع؟
              <select id="refundShippingPaidBySelect"
                style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;margin-top:4px;font-family:var(--font-body)">
                <option value="customer" selected>العميل</option>
                <option value="store">المتجر</option>
              </select>
            </label>
            <button class="btn btn-danger btn-sm" id="refundOrderBtn">استرداد الطلب</button>
          </div>
        </div>` : ''}
      </div>
    `;
    const { close, root } = Modal.open({ title: 'تفاصيل الطلب', body, size: 'medium' });
    root.querySelectorAll('[data-set-stage]').forEach(btn => {
      btn.addEventListener('click', () => {
        const newStage = btn.getAttribute('data-set-stage');
        try {
          OrderLifecycle.updateOrderStatus(id, newStage);
          Toast.success(`تم تحديث مرحلة الطلب إلى: ${OrderLifecycle.getStatusLabel(newStage)}`);
          close();
          _renderTab();
          _openOrderDetail(id);
        } catch (e) { Toast.error(e.message); }
      });
    });
    root.querySelectorAll('[data-set-payment]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const method = btn.getAttribute('data-set-payment');
        const doUpdate = () => {
          try {
            Orders.updatePayment(id, Payment.getStatusFor(method), method);
            Toast.success(`تم تحديث حالة الدفع إلى: ${Payment.getMethodLabel(method)}`);
            close();
            _renderTab();
            _openOrderDetail(id);
          } catch (e) { Toast.error(e.message); }
        };
        if (o.paymentStatus === 'paid') {
          const ok = await Modal.confirm({
            title: 'تغيير طريقة الدفع',
            message: `هذا الطلب مدفوع بالفعل عبر "${Payment.getMethodLabel(Payment.getMethod(o))}". هل تريد تغيير طريقة الدفع إلى "${Payment.getMethodLabel(method)}"؟`,
            confirmLabel: 'تأكيد التغيير', danger: true,
          });
          if (!ok) return;
        }
        doUpdate();
      });
    });
    const refundReasonSelect = root.querySelector('#refundReasonSelect');
    const refundReasonNoteWrap = root.querySelector('#refundReasonNoteWrap');
    refundReasonSelect?.addEventListener('change', () => {
      if (refundReasonNoteWrap) refundReasonNoteWrap.style.display = refundReasonSelect.value === REFUND_REASON_OTHER ? '' : 'none';
    });
    root.querySelector('#refundOrderBtn')?.addEventListener('click', async () => {
      const cost = Number(root.querySelector('#refundShippingInput')?.value) || 0;
      const reason = refundReasonSelect?.value || '';
      const note = root.querySelector('#refundReasonNoteInput')?.value || '';
      if (!reason) { Toast.error('سبب الاسترداد إلزامي.'); return; }
      if (reason === REFUND_REASON_OTHER && !note.trim()) { Toast.error('يرجى كتابة ملاحظة عند اختيار "سبب آخر".'); return; }
      const ok = await Modal.confirm({
        title: 'استرداد الطلب',
        message: 'سيتم تعليم هذا الطلب كمسترد ولن يدخل بعدها ضمن الإيرادات أو الأرباح. هذا الإجراء لا يمكن التراجع عنه.',
        confirmLabel: 'تأكيد الاسترداد', danger: true,
      });
      if (!ok) return;
      try {
        const paidBy = root.querySelector('#refundShippingPaidBySelect')?.value === 'store' ? 'store' : 'customer';
        Orders.refund(id, cost, reason, note, paidBy);
        Toast.success('تم استرداد الطلب.');
        close();
        _renderTab();
        _openOrderDetail(id);
      } catch (e) { Toast.error(e.message); }
    });
  };

  const _renderCustomers = (main) => {
    const customers = Customers.list().sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0));
    main.innerHTML = `
      <div class="admin-head"><h1>العملاء (${arNum(customers.length)})</h1></div>
      <div class="panel">
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>الاسم</th><th>الهاتف</th><th>المدينة</th><th>الطلبات</th><th>الإجمالي</th><th>آخر تحديث</th><th>إجراءات</th></tr></thead>
            <tbody>
              ${customers.length === 0 ? '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:30px">لا يوجد عملاء</td></tr>' :
                customers.map(c => `
                  <tr>
                    <td data-label="الاسم"><strong>${esc(c.name)}</strong></td>
                    <td data-label="الهاتف" style="direction:ltr">${esc(c.phone)}</td>
                    <td data-label="المدينة">${esc(c.city || '—')}</td>
                    <td data-label="الطلبات">${arNum(c.ordersCount || 0)}</td>
                    <td data-label="الإجمالي"><strong>${money(c.totalSpent || 0)}</strong></td>
                    <td data-label="التاريخ" style="font-size:.82rem">${fmtDate(c.updatedAt)}</td>
                    <td data-label="إجراءات">
                      <div class="row-actions">
                        <button class="btn btn-danger btn-sm" data-del-cust="${esc(c.id)}">حذف</button>
                      </div>
                    </td>
                  </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    main.querySelectorAll('[data-del-cust]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-del-cust');
        const ok = await Modal.confirm({ title: 'حذف العميل', message: 'هل تريد حذف هذا العميل؟', confirmLabel: 'حذف', danger: true });
        if (!ok) return;
        Customers.remove(id);
        Toast.success('تم حذف العميل.');
        _renderTab();
      });
    });
  };

  const _renderReviewsAdmin = (main) => {
    const reviews = Reviews.list();
    main.innerHTML = `
      <div class="admin-head">
        <h1>التقييمات (${arNum(reviews.length)})</h1>
      </div>
      <div class="panel">
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>الاسم</th><th>التقييم</th><th>التعليق</th><th>التاريخ</th><th>إجراءات</th></tr></thead>
            <tbody>
              ${reviews.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:30px">لا توجد تقييمات</td></tr>' :
                reviews.map(r => `
                  <tr>
                    <td data-label="الاسم"><strong>${esc(r.name)}</strong></td>
                    <td data-label="التقييم" style="direction:ltr">${stars(r.rating)} ${arNum(r.rating)}</td>
                    <td data-label="التعليق">${esc((r.comment || '').slice(0, 100))}${(r.comment || '').length > 100 ? '…' : ''}</td>
                    <td data-label="التاريخ" style="font-size:.82rem">${fmtDate(r.createdAt)}</td>
                    <td data-label="إجراءات">
                      <div class="row-actions">
                        <button class="btn btn-danger btn-sm" data-del-rev="${esc(r.id)}">حذف</button>
                      </div>
                    </td>
                  </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    main.querySelectorAll('[data-del-rev]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-del-rev');
        const ok = await Modal.confirm({ title: 'حذف التقييم', message: 'هل تريد حذف هذا التقييم؟', confirmLabel: 'حذف', danger: true });
        if (!ok) return;
        Reviews.remove(id);
        Toast.success('تم حذف التقييم.');
        _renderTab();
      });
    });
  };

  const _renderInventory = (main) => {
    const products = Products.list();
    const lowStock = Inventory.getLowStock();
    const outOfStock = Inventory.getOutOfStock();

    main.innerHTML = `
      <div class="admin-head">
        <h1>إدارة المخزون</h1>
        <div style="display:flex;gap:8px">
          ${outOfStock.length > 0 ? `<span class="alert-banner danger" style="margin:0">⛔ ${arNum(outOfStock.length)} نفد</span>` : ''}
          ${lowStock.length > 0 ? `<span class="alert-banner warn" style="margin:0">⚠ ${arNum(lowStock.length)} يوشك النفاد</span>` : ''}
        </div>
      </div>
      <div class="panel">
        <div class="panel-head">
          <h2>جميع المنتجات</h2>
          <span class="muted">حد التنبيه: ${arNum(CONFIG.lowStockThreshold)} قطع</span>
        </div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>المنتج</th><th>SKU</th><th>المخزون الكلي</th><th>محجوز</th><th>المتاح</th><th>الحالة</th><th>تعديل المخزون</th></tr></thead>
            <tbody>
              ${products.map(p => {
                const avail = Inventory.available(p);
                const isOut = avail === 0;
                const isLow = avail > 0 && avail <= CONFIG.lowStockThreshold;
                return `
                  <tr class="${isOut || isLow ? 'low-stock-row' : ''}">
                    <td data-label="المنتج"><strong>${esc(p.name)}</strong></td>
                    <td data-label="SKU" style="font-family:monospace;font-size:.78rem">${esc(p.sku || '')}</td>
                    <td data-label="المخزون الكلي">${arNum(p.stock)}</td>
                    <td data-label="محجوز">${arNum(p.reserved || 0)}</td>
                    <td data-label="المتاح"><strong>${arNum(avail)}</strong></td>
                    <td data-label="الحالة">${isOut ? '<span style="color:var(--danger);font-weight:700">نفد</span>' : isLow ? '<span style="color:var(--warning);font-weight:700">يوشك النفاد</span>' : '<span style="color:var(--success)">متاح</span>'}</td>
                    <td data-label="تعديل المخزون">
                      <div style="display:flex;gap:6px;align-items:center">
                        <input type="number" min="0" value="${p.stock}" class="stock-input" data-pid="${esc(p.id)}"
                          style="width:80px;padding:7px 10px;border:1px solid var(--border);border-radius:10px;font-family:var(--font-body)" />
                        <button class="btn btn-primary btn-sm" data-update-stock="${esc(p.id)}">حفظ</button>
                      </div>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    main.querySelectorAll('[data-update-stock]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-update-stock');
        const input = main.querySelector(`.stock-input[data-pid="${id}"]`);
        const newStock = Math.max(0, Math.floor(Number(input?.value) || 0));
        const err = Validator.field('stock', newStock);
        if (err) { Toast.error(err); return; }
        Products.update(id, { stock: newStock });
        Toast.success('تم تحديث المخزون.');
        _renderTab();
      });
    });
  };

  return { open, close };
})();

/* ========================= LAYER 16: ROUTER ========================= */
const Router = (() => {
  const _handle = () => {
    const hash = location.hash || '#/';
    const isAdmin = hash.startsWith('#/admin');
    const wasAdmin = document.body.classList.contains('admin-mode');

    if (isAdmin) {
      Admin.open();
    } else if (wasAdmin) {
      Admin.close();
      UI.mount();
    }
  };

  const init = () => {
    window.addEventListener('hashchange', _handle);
    _handle();
  };

  return { init };
})();

/* ========================= LAYER 17: GLOBAL ERROR HANDLER ========================= */
window.addEventListener('error', (e) => {
  console.error('[App Error]', e.error || e.message);
  Toast.error('حدث خطأ غير متوقع. يرجى تحديث الصفحة.');
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[Unhandled Promise]', e.reason);
  Toast.error('حدث خطأ في العملية. يرجى المحاولة مرة أخرى.');
});

/* ========================= LAYER 18: APP BOOTSTRAP ========================= */
const _bootstrapData = () => {
  Products.seedIfEmpty();
  Reviews.seedIfEmpty();
};

const App = (() => {
  const init = () => {
    try {
      DB.init();
      Orders.migrateOrderNumbers();
      _bootstrapData();
      CartUI.init();

      const hash = location.hash || '#/';
      if (hash.startsWith('#/admin')) {
        Admin.open();
      } else {
        UI.mount();
      }

      Router.init();
    } catch (e) {
      console.error('[App] Bootstrap failed:', e);
      Toast.error('فشل تحميل التطبيق. يرجى مسح ذاكرة المتصفح وإعادة المحاولة.');
    }
  };

  return { init };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', App.init);
} else {
  App.init();
}
