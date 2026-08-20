/* Devoo · Invoices — auto-generate on order, view/print/PDF/share */
'use strict';

const Invoices = (() => {
  const KEY = 'devoo_invoices';

  const list = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
  const save = (arr) => { try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch (e) { console.warn(e); } };

  const _yearSeq = () => {
    const y = new Date().getFullYear();
    const arr = list();
    const thisYear = arr.filter(i => i.year === y);
    return { year: y, seq: thisYear.length + 1 };
  };

  const _format = (year, seq) => {
    const prefix = (Settings.get().invoicePrefix || 'INV').toUpperCase();
    return `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
  };

  const getByOrder = (orderId) => list().find(i => i.orderId === orderId);

  /* Deletes a single invoice by exact ID match. Never touches the Order
     record (or any other invoice) — the order itself is left intact. */
  const remove = (invoiceId) => {
    const all = list();
    const next = all.filter(i => i.id !== invoiceId);
    save(next);
    EventBus.emit('invoice:removed', { id: invoiceId });
    return next.length !== all.length;
  };

  /* ===== Order Workflow — Stage 3: unified Order Object (draft, not persisted) =====
     Built once checkout validation succeeds. Used for the preview only — actual
     persistence still goes through the existing Orders.create / Cart.checkout (Stage 6). */
  const buildDraftOrder = ({ customer = {}, items = [], notes = '' } = {}) => {
    const snapItems = (items || []).map(it => {
      const p = Products.get(it.productId);
      if (!p) return null;
      const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
      return {
        productId: p.id,
        name: p.name,
        qty,
        unitPrice: p.price,
        image: (p.images || [])[0] || '',
        total: p.price * qty,
      };
    }).filter(Boolean);

    // Same Pricing Engine used everywhere else — figures computed once, reused in Stage 4.
    const { subtotal, shippingFee, tax, total } = PricingEngine.calcOrderTotals(
      snapItems.map(i => ({ price: i.unitPrice, qty: i.qty }))
    );

    const s = Settings.get();

    return {
      id: uid('o_'),          // Order ID (preview only — Stage 6 assigns the real order its own id)
      number: null,            // Order Number — assigned once the real invoice is created
      createdAt: Date.now(),
      customer: {
        name: customer.name || '',
        phone: customer.phone || '',
        email: customer.email || '',
        address: customer.address || '',
        notes: stripHTML(String(notes || '')),
      },
      items: snapItems,
      pricing: { subtotal, tax, shipping: shippingFee, grandTotal: total },
      storeSnapshot: {
        storeName: s.storeName, currency: s.currencyName, currencySymbol: s.currencySymbol,
      },
      pricingSnapshot: {
        taxEnabled: s.taxEnabled, taxRate: s.taxRate,
        shippingEnabled: s.shippingEnabled, shippingCost: s.shippingCost,
      },
      status: 'new',
    };
  };

  /* ===== Stage 4: Invoice built from the Order Object — no price recalculation ===== */
  const buildDraftInvoice = (draftOrder) => {
    if (!draftOrder) return null;
    return {
      id: null,
      number: null,
      orderId: draftOrder.id,
      createdAt: draftOrder.createdAt,
      snapshot: {
        items: draftOrder.items,
        subtotal: draftOrder.pricing.subtotal,
        shippingFee: draftOrder.pricing.shipping,
        tax: draftOrder.pricing.tax,
        total: draftOrder.pricing.grandTotal,
        customer: draftOrder.customer,
        status: draftOrder.status,
        paymentStatus: 'unpaid',
        paymentMethod: draftOrder.paymentMethod || 'cod',
      },
    };
  };

  const createForOrder = (order) => {
    if (!order) return null;
    const existing = getByOrder(order.id);
    if (existing) return existing;
    const { year, seq } = _yearSeq();
    const inv = {
      id: 'inv_' + Date.now().toString(36),
      number: _format(year, seq),
      year, seq,
      orderId: order.id,
      createdAt: Date.now(),
      snapshot: {
        items: order.items, subtotal: order.subtotal, shippingFee: order.shippingFee,
        tax: order.tax, total: order.total, customer: order.customerSnapshot,
        status: order.status, paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod || '',
      },
    };
    const all = list(); all.unshift(inv); save(all);
    // attach invoice number back to order
    try {
      const orders = Orders.list();
      const o = orders.find(x => x.id === order.id);
      if (o) { o.invoiceNumber = inv.number; o.invoiceId = inv.id; Orders.save(orders); }
    } catch (e) { console.warn('[Invoices] cannot attach to order', e); }
    EventBus.emit('invoice:created', inv);
    return inv;
  };

  const _statusBadge = (status) => {
    const cls = `inv-badge inv-badge-${status}`;
    return `<span class="${cls}">${STATUS_ICON[status] || ''} ${STATUS_LABEL[status] || status}</span>`;
  };

  const renderHTML = (invoice, order) => {
    const s = Settings.get();
    const c = order?.customerSnapshot || invoice.snapshot.customer || {};
    const items = order?.items || invoice.snapshot.items || [];
    const subtotal = order?.subtotal ?? invoice.snapshot.subtotal ?? 0;
    const shipping = order?.shippingFee ?? invoice.snapshot.shippingFee ?? 0;
    const tax = order?.tax ?? invoice.snapshot.tax ?? 0;
    const total = order?.total ?? invoice.snapshot.total ?? 0;
    const status = order?.status || invoice.snapshot.status;
    /* Prefer the live order (Admin may have changed payment after invoicing),
       fall back to the invoice snapshot. Formatting comes from the shared
       Payment module so screen / PDF / admin never drift. */
    /* CURRENT order payment state always wins over the invoice snapshot, so an
       invoice never stays stuck on an old payment state after Admin updates it. */
    const liveOrder = order || (invoice.orderId ? (typeof Orders !== 'undefined' ? Orders.get(invoice.orderId) : null) : null);
    const payState = liveOrder || {
      paymentMethod: invoice.snapshot.paymentMethod,
      paymentStatus: invoice.snapshot.paymentStatus,
    };

    const logoHtml = `<img src="${esc(H.logoSrc(s))}" alt="${esc(s.storeName || '')}" class="inv-logo" onerror="this.onerror=null;this.src=window.H.inlineLogo"/>`;

    return `
      <article class="invoice" id="invoiceDoc" dir="rtl">
        <header class="inv-head">
          <div class="inv-brand">
            ${logoHtml}
            <div class="inv-store">
              <strong>${esc(s.storeName)}</strong>
              <small>${esc(s.storeAddress || '')}</small>
              <small>${esc(s.storePhone || '')} · ${esc(s.storeEmail || '')}</small>
              ${s.taxNumber ? `<small>الرقم الضريبي: ${esc(s.taxNumber)}</small>` : ''}
            </div>
          </div>
          <div class="inv-meta">
            <h2>فاتورة</h2>
            <div><span>رقم الفاتورة</span><strong>${esc(invoice.number)}</strong></div>
            <div><span>رقم الطلب</span><strong>${esc(order?.orderNumber || invoice.orderId)}</strong></div>
            <div><span>التاريخ</span><strong>${esc(fmtDateTime(invoice.createdAt))}</strong></div>
            <div>${_statusBadge(status)}</div>
          </div>
        </header>

        <section class="inv-customer">
          <h3>بيانات العميل</h3>
          <div class="inv-cust-grid">
            <div><span>الاسم</span><strong>${esc(c.name || '—')}</strong></div>
            <div><span>الجوال</span><strong>${esc(c.phone || '—')}</strong></div>
            <div><span>المدينة</span><strong>${esc(c.city || '—')}</strong></div>
            <div class="full"><span>العنوان</span><strong>${esc(c.address || '—')}</strong></div>
          </div>
        </section>

        <section class="inv-items">
          <table>
            <thead><tr><th>#</th><th>المنتج</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
            <tbody>
              ${items.map((i, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td>${esc(i.name)}</td>
                  <td>${i.qty}</td>
                  <td>${money(i.price)}</td>
                  <td>${money(i.price * i.qty)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </section>

        <section class="inv-totals">
          <div><span>الإجمالي الفرعي</span><strong>${money(subtotal)}</strong></div>
          <div><span>الشحن</span><strong>${money(shipping)}</strong></div>
          <div><span>الضريبة</span><strong>${money(tax)}</strong></div>
          <div class="grand"><span>الإجمالي النهائي</span><strong>${money(total)}</strong></div>
          <div class="pay-line"><span>حالة الدفع</span><strong>${Payment.getIcon(payState)} ${esc(Payment.getLabel(payState))}</strong></div>
        </section>

        <footer class="inv-foot">
          <p>${esc(s.footerNote || '')}</p>
        </footer>
      </article>
    `;
  };

  /* ===== PDF Template — fully independent from the on-screen View Template =====
     Table/block layout only (no transform / animation / transition /
     backdrop-filter / sticky / fixed / complex flex-grid) so html2canvas
     captures it reliably. Pure function of (invoice, order) → HTML string,
     so it can be reused later for Drive/Sheets/WhatsApp/Email attachments
     without any redesign. Reads figures already computed by PricingEngine —
     no recalculation here. */
  // Internal-only normalization: some invoices may carry items shaped by an
  // older/alternate source (e.g. price vs unitPrice, missing total). This
  // guarantees renderPDFHTML always works off one consistent item shape —
  // it never mutates the real Order Object, only the local copy used to draw
  // the PDF.
  const _normalizePDFItem = (i) => {
    const price = Number(i?.price ?? i?.unitPrice ?? 0) || 0;
    const qty = Number(i?.qty ?? i?.quantity ?? 1) || 1;
    return {
      name: i?.name ?? i?.productName ?? '',
      qty,
      price,
      total: Number(i?.total ?? price * qty) || price * qty,
      image: i?.image ?? i?.img ?? '',
    };
  };

  const renderPDFHTML = (invoice, order) => {
    const s = Settings.get();
    const c = order?.customerSnapshot || invoice.snapshot.customer || {};
    const items = (order?.items || invoice.snapshot.items || []).map(_normalizePDFItem);
    const subtotal = order?.subtotal ?? invoice.snapshot.subtotal ?? 0;
    const shipping = order?.shippingFee ?? invoice.snapshot.shippingFee ?? 0;
    const tax = order?.tax ?? invoice.snapshot.tax ?? 0;
    const total = order?.total ?? invoice.snapshot.total ?? 0;
    const discount = order?.discount ?? invoice.snapshot.discount ?? 0;
    /* CURRENT order payment state always wins over the invoice snapshot, so an
       invoice never stays stuck on an old payment state after Admin updates it. */
    const liveOrder = order || (invoice.orderId ? (typeof Orders !== 'undefined' ? Orders.get(invoice.orderId) : null) : null);
    const payState = liveOrder || {
      paymentMethod: invoice.snapshot.paymentMethod,
      paymentStatus: invoice.snapshot.paymentStatus,
    };

    const logoHtml = `<img src="${esc(H.logoSrc(s))}" alt="${esc(s.storeName || '')}" class="pdf-logo-img"/>`;

    const itemRows = items.map((i, idx) => {
      const img = i.image
        ? `<img src="${esc(i.image)}" alt="" class="pdf-item-img"/>`
        : `<img src="${H.fallbackImg}" alt="" class="pdf-item-img"/>`;
      return `
        <tr class="pdf-avoid-break">
          <td class="pdf-c">${idx + 1}</td>
          <td class="pdf-c">${img}</td>
          <td>${esc(i.name)}</td>
          <td class="pdf-c">${i.qty}</td>
          <td class="pdf-c">${money(i.price)}</td>
          <td class="pdf-c">${money(i.total)}</td>
        </tr>`;
    }).join('');

    return `
      <div class="pdf-invoice" dir="rtl" lang="ar">
        <table class="pdf-head-table"><tbody><tr>
          <td class="pdf-head-brand">
            ${logoHtml}
            <div class="pdf-store-name">${esc(s.storeName)}</div>
            ${s.storeAddress ? `<div class="pdf-store-line">${esc(s.storeAddress)}</div>` : ''}
            <div class="pdf-store-line">${esc(s.storePhone || '')}${s.storeEmail ? ` · ${esc(s.storeEmail)}` : ''}</div>
            ${s.taxNumber ? `<div class="pdf-store-line">الرقم الضريبي: ${esc(s.taxNumber)}</div>` : ''}
          </td>
          <td class="pdf-head-meta">
            <div class="pdf-inv-title">فاتورة</div>
            <table class="pdf-meta-table"><tbody>
              <tr><td>رقم الفاتورة</td><td>${esc(invoice.number)}</td></tr>
              <tr><td>رقم الطلب</td><td>${esc(order?.orderNumber || invoice.orderId)}</td></tr>
              <tr><td>التاريخ</td><td>${esc(fmtDateTime(invoice.createdAt))}</td></tr>
              <tr><td>حالة الدفع</td><td>${esc(Payment.getLabel(payState))}</td></tr>
            </tbody></table>
          </td>
        </tr></tbody></table>

        <div class="pdf-section-title">بيانات العميل</div>
        <table class="pdf-cust-table"><tbody>
          <tr>
            <td class="pdf-label">الاسم</td><td>${esc(c.name || '—')}</td>
            <td class="pdf-label">الجوال</td><td>${esc(c.phone || '—')}</td>
          </tr>
          <tr>
            <td class="pdf-label">المدينة</td><td>${esc(c.city || '—')}</td>
            <td class="pdf-label">العنوان</td><td>${esc(c.address || '—')}</td>
          </tr>
        </tbody></table>

        <div class="pdf-section-title">المنتجات</div>
        <table class="pdf-items-table">
          <thead><tr><th>#</th><th>صورة</th><th>المنتج</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
          <tbody>${itemRows}</tbody>
        </table>

        <table class="pdf-totals-table"><tbody>
          <tr><td>الإجمالي الفرعي</td><td>${money(subtotal)}</td></tr>
          ${discount > 0 ? `<tr><td>الخصم</td><td>-${money(discount)}</td></tr>` : ''}
          <tr><td>الشحن</td><td>${shipping > 0 ? money(shipping) : 'مجاني'}</td></tr>
          <tr><td>الضريبة</td><td>${money(tax)}</td></tr>
          <tr class="pdf-grand"><td>الإجمالي النهائي</td><td>${money(total)}</td></tr>
        </tbody></table>

        <div class="pdf-footer">${esc(s.footerNote || '')}</div>
      </div>
    `;
  };

  const open = (invoiceOrOrderId) => {
    let invoice, order;
    if (typeof invoiceOrOrderId === 'string') {
      invoice = list().find(i => i.id === invoiceOrOrderId) || getByOrder(invoiceOrOrderId);
      order = invoice ? Orders.get(invoice.orderId) : Orders.get(invoiceOrOrderId);
      if (!invoice && order) invoice = createForOrder(order);
    } else {
      invoice = invoiceOrOrderId;
      order = Orders.get(invoice.orderId);
    }
    if (!invoice) { Toast.error('الفاتورة غير موجودة'); return; }

    const body = `<div class="invoice-wrap">${renderHTML(invoice, order)}</div>`;
    const footer = `
      <button class="btn btn-ghost" data-close>إغلاق</button>
      <button class="btn btn-ghost" id="invPrintBtn">🖨️ طباعة</button>
      <button class="btn btn-ghost" id="invWaBtn">💬 واتساب</button>
      <button class="btn btn-primary" id="invPdfBtn">⬇️ تحميل PDF</button>
    `;
    const { close, root } = Modal.open({ title: `فاتورة ${invoice.number}`, body, footer, size: 'large' });

    root.querySelector('#invPrintBtn').addEventListener('click', () => {
      PDFService.printElement(root.querySelector('#invoiceDoc'));
    });
    root.querySelector('#invPdfBtn').addEventListener('click', () => {
      PDFService.exportHTML(renderPDFHTML(invoice, order), `${invoice.number}.pdf`);
    });
    root.querySelector('#invWaBtn').addEventListener('click', () => {
      // Admin invoice WhatsApp must always go to the store's own configured
      // number (Settings.whatsappNumber), never the customer's phone.
      if (order) WhatsAppService.send(WhatsAppService.orderSummary(order), Settings.get().whatsappNumber);
      else Toast.error('لا يمكن فتح واتساب: لا يوجد طلب مرتبط بهذه الفاتورة');
    });
  };

  /* ===== Customer Invoice — separate entry point from the Admin Invoices.open().
     Only ever shows the invoice belonging to the given orderId (no fallback to
     any other invoice), and reuses the existing invoice renderer. Admin-only
     actions (WhatsApp, edit, delete, print) are intentionally left out. ===== */
  const openCustomer = (orderId) => {
    const invoice = getByOrder(orderId);
    if (!invoice || invoice.orderId !== orderId) {
      Toast.error('لا توجد فاتورة لهذا الطلب.');
      return;
    }
    const order = Orders.get(orderId);

    const body = `<div class="invoice-wrap">${renderHTML(invoice, order)}</div>`;
    const footer = `
      <button class="btn btn-ghost" data-close>إغلاق</button>
      <button class="btn btn-primary" id="custInvPdfBtn">⬇️ تحميل PDF</button>
    `;
    const { root } = Modal.open({ title: `فاتورة ${invoice.number}`, body, footer, size: 'large' });

    root.querySelector('#custInvPdfBtn').addEventListener('click', () => {
      PDFService.exportHTML(renderPDFHTML(invoice, order), `${invoice.number}.pdf`);
    });
  };

  const init = () => {
    try {
      // Auto-create invoice when an order is created
      EventBus.on('order:created', (order) => { try { createForOrder(order); } catch (e) { console.warn(e); } });
      // Backfill: ensure every existing order has an invoice
      Orders.list().forEach(o => { if (!getByOrder(o.id)) createForOrder(o); });
    } catch (e) { console.warn('[Invoices] init', e); }
  };

  return { init, list, getByOrder, createForOrder, remove, open, openCustomer, renderHTML, renderPDFHTML, buildDraftOrder, buildDraftInvoice };
})();

window.Invoices = Invoices;
