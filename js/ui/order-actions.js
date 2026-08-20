/* Devoo · Order Actions — injects Invoice/PDF/WhatsApp buttons into order modals
   (orders details, admin order rows, my-orders). Uses delegation. */
'use strict';

const OrderActions = (() => {
  const _augmentOrderModal = (modal) => {
    if (!modal || modal.dataset.invoiceWired) return;
    const titleEl = modal.querySelector('.modal-head h3');
    if (!titleEl || !/طلب|Order/i.test(titleEl.textContent || '')) return;
    // Find order id heuristically from a data attribute or text
    const orderIdMatch = (modal.textContent || '').match(/o_[a-z0-9]+/i);
    if (!orderIdMatch) return;
    const orderId = orderIdMatch[0];
    if (!Orders.get(orderId)) return;
    modal.dataset.invoiceWired = '1';

    const footer = modal.querySelector('.modal-foot');
    if (!footer) return;
    const wrap = document.createElement('div');
    wrap.className = 'order-actions-extra';
    wrap.innerHTML = `
      <button class="btn btn-ghost" data-act="invoice">🧾 الفاتورة</button>
      <button class="btn btn-ghost" data-act="wa">💬 واتساب</button>
    `;
    footer.prepend(wrap);
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      const o = Orders.get(orderId);
      if (b.dataset.act === 'invoice') Invoices.open(orderId);
      if (b.dataset.act === 'wa' && o) WhatsAppService.shareOrder(o);
    });
  };

  const init = () => {
    const root = document.getElementById('modalRoot');
    if (!root) return;
    const obs = new MutationObserver(() => {
      root.querySelectorAll('.modal').forEach(_augmentOrderModal);
    });
    obs.observe(root, { childList: true, subtree: true });
  };

  return { init };
})();

window.OrderActions = OrderActions;
