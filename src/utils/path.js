/**
 * URL pública para estáticos bajo /assets/… y raíz (favicon, etc.).
 * En desarrollo, Astro/Vite no monta /dist/; las rutas /assets/* las sirve
 * el plugin `devStaticAssetsPlugin` en config/astro.config.mjs desde src/assets.
 * @param {string} p - Ruta que empieza con / (ej. /assets/img/… o /favicon.ico)
 */
function getAssetPrefix(p) {
  const path = p.startsWith('/') ? p : `/${p}`
  return path
}

function getPathPrefix(path) {
  return path
}

export { getAssetPrefix, getPathPrefix }
