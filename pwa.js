/* MILO PWA: service worker and browser-native install only. No site install buttons or intercepted prompt. */
(() => {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost','127.0.0.1'].includes(location.hostname))) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js?v=19', {updateViaCache:'none'}).catch(err => console.warn('MILO SW:', err)));
  }
})();
