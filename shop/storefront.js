// Preserve referral attribution when entering a collection or featured product.
(() => {
  const agent = new URLSearchParams(location.search).get('a');
  if (!agent) return;
  document.querySelectorAll('[data-collection-link]').forEach(link => {
    const url = new URL(link.getAttribute('href'), location.href);
    url.searchParams.set('a', agent);
    link.href = url.pathname + url.search + url.hash;
  });
})();
