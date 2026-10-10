/* Exact legacy recovery for the 404 page only; this is not an HTTP 301. */
(function (root) {
  'use strict';
  const routes = Object.freeze({
    '/2026/08/29/01-ubuntu-server-secure-setup/': '/posts/01-ubuntu-server-secure-setup/',
    '/2026/08/29/02-hexo-docker-nginx-publish/': '/posts/02-hexo-docker-nginx-publish/',
    '/archives/2026/': '/archives/',
    '/archives/2026/08/': '/archives/'
  });
  const paths = Object.create(null);
  for (const [oldPath, target] of Object.entries(routes)) {
    paths[oldPath] = target;
    paths[oldPath.slice(0, -1)] = target;
    paths[oldPath + 'index.html'] = target;
  }
  Object.freeze(paths);
  function resolveLegacyPath(pathname) {
    return typeof pathname === 'string' && Object.prototype.hasOwnProperty.call(paths, pathname)
      ? paths[pathname] : '';
  }
  function recoverLegacyPath(location) {
    const target = resolveLegacyPath(location.pathname);
    if (!target) return false;
    // Targets come solely from the fixed same-origin map, never from query/hash.
    location.replace(target + location.search + location.hash);
    return true;
  }
  if (typeof module === 'object' && module.exports) {
    module.exports = { resolveLegacyPath, recoverLegacyPath };
  } else if (root && root.location) {
    recoverLegacyPath(root.location);
  }
})(typeof window === 'undefined' ? null : window);
