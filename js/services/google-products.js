/* Devoo · Google Products Service — isolated integration layer for future Google Apps Script sync.
   Not wired to run automatically. Not called by any existing product flow.
   LocalStorage remains the primary data source; this is a secondary, optional layer. */
'use strict';

const GoogleProductsService = (() => {
  const getUrl = () => {
    try { return String(Settings.get().googleAppsScriptUrl || '').trim(); }
    catch { return ''; }
  };

  const isConfigured = () => !!getUrl();

  const _request = (action, payload) => {
    const url = getUrl();
    if (!url) return Promise.resolve(null); // no URL configured, no-op

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload }),
    })
      .then(res => res.json())
      .catch(err => {
        console.error('[GoogleProductsService] request failed:', err);
        return null;
      });
  };

  const loadProducts = () => _request('loadProducts');

  const saveProduct = (product) => _request('saveProduct', product);

  const updateProduct = (id, patch) => _request('updateProduct', { id, patch });

  const deleteProduct = (id) => _request('deleteProduct', { id });

  const syncProducts = () => _request('syncProducts');

  return { isConfigured, loadProducts, saveProduct, updateProduct, deleteProduct, syncProducts };
})();

window.GoogleProductsService = GoogleProductsService;
