/* Configuration de l'ancien service API en ligne. */
window.LCA=window.LCA||{};
const localHost=typeof location!=='undefined'&&/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
window.LCA.config=Object.assign({apiBase:localHost?'http://127.0.0.1:8787':''},window.LCA.config||{});
