/* Register the service worker so the site can be installed to a phone home screen and work offline. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
