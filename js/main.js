/* Devoo · main — boot sequence for all add-on modules (engine.js boots itself separately) */
'use strict';

(function bootAddons() {
  const start = () => {
    try { MobileUX.init(); } catch (e) { console.warn(e); }
    try { Settings.get(); } catch {}
    try { Invoices.init(); } catch (e) { console.warn(e); }
    try { Uploads.init(); } catch (e) { console.warn(e); }
    try { WhatsAppService.init(); } catch (e) { console.warn(e); }
    try { SocialService.init(); } catch (e) { console.warn(e); }
    try { SettingsPanel.init(); } catch (e) { console.warn(e); }
    try { InvoicesTab.init(); } catch (e) { console.warn(e); }
    try { OrderActions.init(); } catch (e) { console.warn(e); }
    console.info('[Devoo] add-on modules ready');
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
