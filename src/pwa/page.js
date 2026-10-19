(function () {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(function (e) { console.warn('SW register failed', e); });
  }
  async function takeShared() {
    var p = new URLSearchParams(location.search);
    if (p.get('shared') !== '1') return;
    try {
      var cache = await caches.open('euc-shared');
      var res = await cache.match('shared/latest');
      if (res) {
        var blob = await res.blob();
        var name = decodeURIComponent(res.headers.get('x-filename') || 'shared.csv');
        await cache.delete('shared/latest');
        history.replaceState(null, '', location.pathname);
        await window.eucApp.loadFile(new File([blob], name, { type: blob.type }));
        return;
      }
    } catch (e) { console.error('shared file failed', e); }
    history.replaceState(null, '', location.pathname);
  }
  if (window.eucApp) takeShared();
  else window.addEventListener('euc-ready', takeShared, { once: true });
})();
