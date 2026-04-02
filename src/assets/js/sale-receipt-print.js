/**
 * Comprobante de venta: HTML compacto (media carta), Blob URL, descarga e impresión.
 * Número visible: sale.numero_comprobante (asignado en el servidor al registrar la venta).
 */

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmt(n) {
  return '$' + Number(n || 0).toFixed(2)
}

function fmtDate(v) {
  if (!v) return '—'
  const d = new Date(v)
  return d.toLocaleDateString('es-BO', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function grupo999(n) {
  if (n === 0) return ''
  const c = Math.floor(n / 100)
  const resto = n % 100
  const cNames = [
    '',
    'ciento',
    'doscientos',
    'trescientos',
    'cuatrocientos',
    'quinientos',
    'seiscientos',
    'setecientos',
    'ochocientos',
    'novecientos'
  ]
  const u = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve']
  const d10 = [
    'diez',
    'once',
    'doce',
    'trece',
    'catorce',
    'quince',
    'dieciséis',
    'diecisiete',
    'dieciocho',
    'diecinueve'
  ]
  const d20 = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
  const veinti = [
    '',
    'veintiuno',
    'veintidós',
    'veintitrés',
    'veinticuatro',
    'veinticinco',
    'veintiséis',
    'veintisiete',
    'veintiocho',
    'veintinueve'
  ]

  let out = []
  if (c === 1 && resto === 0) return 'cien'
  if (c > 0) out.push(cNames[c])

  if (resto === 0) return out.filter(Boolean).join(' ')
  if (resto < 10) {
    out.push(u[resto])
    return out.filter(Boolean).join(' ')
  }
  if (resto < 20) {
    out.push(d10[resto - 10])
    return out.filter(Boolean).join(' ')
  }
  const dm = Math.floor(resto / 10)
  const um = resto % 10
  if (dm === 2 && um > 0) {
    out.push(veinti[um])
  } else if (um === 0) {
    out.push(d20[dm])
  } else {
    out.push(d20[dm] + ' y ' + u[um])
  }
  return out.filter(Boolean).join(' ')
}

function milesLetras(n) {
  if (n === 0) return 'cero'
  if (n < 1000) return grupo999(n)
  const miles = Math.floor(n / 1000)
  const rest = n % 1000
  let pref = miles === 1 ? 'mil' : grupo999(miles) + ' mil'
  if (rest) pref += ' ' + grupo999(rest)
  return pref.trim()
}

function montoALetras(num) {
  const v = Math.max(0, Number(num) || 0)
  const fixed = v.toFixed(2)
  const [ent, cent] = fixed.split('.')
  const entero = parseInt(ent, 10)
  const letras = milesLetras(entero)
  return `SON: ${letras.toUpperCase()} CON ${cent}/100 BOLIVIANOS`
}

function receiptId(sale, opts) {
  if (opts?.draft || sale?._id === '__draft__') {
    return 'VISTA-PREVIA'
  }
  const num = sale?.numero_comprobante
  if (num != null && Number.isFinite(Number(num)) && Number(num) >= 1) {
    return String(Number(num))
  }
  const id = String(sale._id || '')
  const tail = id.slice(-8).toUpperCase().replace(/[^0-9A-F]/g, '')
  return tail || id.slice(0, 8).toUpperCase()
}

function absolutizeAssetUrl(u) {
  if (typeof window === 'undefined' || !u) return u
  if (/^https?:\/\//i.test(u)) return u
  return window.location.origin + (u.startsWith('/') ? u : '/' + u)
}

/**
 * @param {object} sale
 * @param {object[]} details
 * @param {{ logoUrl?: string, companyName?: string, tagline?: string, itemsHalfPage?: number, draft?: boolean, autoPrint?: boolean }} [options]
 */
export function buildSaleReceiptHtml(sale, details, options) {
  const opts = options || {}
  const logoUrl = absolutizeAssetUrl(opts.logoUrl || (typeof window !== 'undefined' && window.__RECEIPT_LOGO_URL) || '')
  const companyName = opts.companyName || 'Noryx Store'
  const tagline = opts.tagline || 'Comprobante de venta'
  const halfThreshold = typeof opts.itemsHalfPage === 'number' ? opts.itemsHalfPage : 10

  const list = Array.isArray(details) ? details : []
  const sumLines = list.reduce((s, d) => s + Number(d.subtotal || 0), 0)
  const subtotal = Number(sale && sale.subtotal) > 0 ? Number(sale.subtotal) : sumLines
  const descuento = Number(sale && sale.descuento_monto) > 0 ? Number(sale.descuento_monto) : 0
  const total = Number(sale && sale.total) || 0
  const pageRule = list.length > halfThreshold ? 'size: 8.5in 11in;' : 'size: 5.5in 8.5in;'

  const cliente = sale?.cliente_id?.nombre || 'Consumidor final'
  const celular = sale?.cliente_id?.celular || ''
  const vendedor = sale?.vendedor_id?.nombre || '—'
  const mix = Array.isArray(sale?.pagos_mixtos)
    ? sale.pagos_mixtos.filter((p) => p && Number(p.monto) > 0)
    : []
  const pagoLabel = mix.length ? 'Mixto' : sale?.metodo_pago || '—'
  const pagoDetalle =
    mix.length > 0
      ? mix.map((p) => `<div class="mix-line">${esc(p.metodo)}: ${fmt(Number(p.monto))}</div>`).join('')
      : ''

  const rows = list
    .map((d) => {
      const nom = d.producto_id?.nombre || '—'
      const cod = d.producto_id?.codigo || '—'
      const cant = Number(d.cantidad || 0)
      const pu = Number(d.precio_unitario || 0)
      const sub = Number(d.subtotal || 0)
      return `<tr>
          <td class="t-cod">${esc(cod)}</td>
          <td class="t-desc">${esc(nom)}</td>
          <td class="t-num">${cant}</td>
          <td class="t-c">UND</td>
          <td class="t-num">${fmt(pu)}</td>
          <td class="t-num">${fmt(sub)}</td>
        </tr>`
    })
    .join('')

  const descBlock =
    descuento > 0
      ? `<div class="tot-row"><span>DESCUENTO</span><span>- ${fmt(descuento)}</span></div>`
      : ''

  const anuladaBanner =
    sale?.estado === 'anulada'
      ? `<div class="anulada">DOCUMENTO ANULADO — NO VÁLIDO COMO COMPROBANTE</div>`
      : ''

  const draftBanner = opts.draft
    ? `<div class="draft-banner">Vista previa — la venta se registrará al confirmar.</div>`
    : ''

  const printScript = opts.autoPrint
    ? `<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},300);});<\/script>`
    : ''

  const rid = receiptId(sale, opts)
  const titleShort = opts.draft ? 'Vista previa recibo' : `Recibo N° ${rid}`

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(titleShort)}</title>
<!-- Al imprimir en Chrome/Edge: desactiva "Encabezados y pies de página" para ocultar URL, fecha y "1/1" -->
<style>
  @page { ${pageRule} margin: 5mm; }
  @media print {
    html, body { height: auto !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; }
    .wrap { padding: 0 !important; margin: 0 !important; }
  }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 8.5pt; line-height: 1.25; color: #111; margin: 0; padding: 4px 6px; }
  .wrap { max-width: 100%; padding: 0; margin: 0; }
  .draft-banner { background: #e7f1ff; color: #084298; text-align: center; font-weight: 700; padding: 5px 6px; margin: 0 0 6px; font-size: 7.5pt; border: 1px solid #b6d4fe; }
  .hdr { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; border-bottom: 1px solid #222; padding-bottom: 5px; margin-bottom: 6px; }
  .brand { display: flex; gap: 6px; align-items: flex-start; }
  .brand img { width: 36px; height: 36px; object-fit: contain; flex-shrink: 0; }
  .brand h1 { margin: 0; font-size: 10pt; font-weight: 700; letter-spacing: 0.02em; }
  .brand .sub { font-size: 6.5pt; color: #444; margin-top: 0; }
  .box-id { border: 1px solid #222; padding: 4px 8px; text-align: right; min-width: 118px; }
  .box-id .doc { font-weight: 700; font-size: 6.5pt; letter-spacing: 0.04em; }
  .box-id .num { font-size: 10pt; font-weight: 700; margin-top: 2px; line-height: 1.1; }
  .box-id .dt { font-size: 6.5pt; margin-top: 3px; color: #444; }
  .meta-grid { display: grid; grid-template-columns: 1fr auto; gap: 2px 18px; align-items: start; font-size: 7.5pt; margin-bottom: 6px; line-height: 1.35; }
  .meta-left .meta-row { margin-bottom: 2px; }
  .meta-right { text-align: right; min-width: 110px; padding-top: 0; }
  .meta-right .meta-row { margin-bottom: 2px; }
  .meta-right .mix-line { font-size: 6.5pt; color: #333; line-height: 1.3; margin-top: 1px; }
  .meta .lbl { color: #444; font-weight: 600; }
  .meta-row { margin-bottom: 2px; }
  table.items { width: 100%; border-collapse: collapse; font-size: 7.5pt; margin-bottom: 4px; }
  table.items th { text-align: left; border-bottom: 1px solid #222; padding: 3px 3px 4px; font-weight: 700; }
  table.items td { border-bottom: 1px solid #ddd; padding: 2px 3px; vertical-align: top; }
  table.items .t-num { text-align: right; white-space: nowrap; }
  table.items .t-c { text-align: center; width: 32px; }
  table.items .t-cod { width: 52px; font-weight: 600; }
  table.items .t-desc { }
  .totals { margin-left: auto; max-width: 200px; font-size: 7.5pt; margin-top: 2px; }
  .tot-row { display: flex; justify-content: space-between; padding: 1px 0; border-bottom: 1px solid #eee; }
  .tot-row.total { font-weight: 800; font-size: 8.5pt; border-bottom: none; margin-top: 2px; padding-top: 2px; }
  .letras { font-weight: 700; font-size: 7pt; margin: 5px 0 0; line-height: 1.25; }
  .anulada { background: #fee; color: #a00; text-align: center; font-weight: 800; padding: 5px; margin-bottom: 6px; border: 1px solid #c00; font-size: 7.5pt; }
</style></head><body>
<div class="wrap">
  ${draftBanner}
  ${anuladaBanner}
  <div class="hdr">
    <div class="brand">
      ${logoUrl ? `<img src="${esc(logoUrl)}" alt="" />` : '<div style="width:36px;height:36px"></div>'}
      <div>
        <h1>${esc(companyName)}</h1>
        <div class="sub">${esc(tagline)}</div>
      </div>
    </div>
    <div class="box-id">
      <div class="doc">COMPROBANTE DE VENTA</div>
      <div class="num">Nº ${esc(rid)}</div>
      <div class="dt">${fmtDate(sale?.fecha)}</div>
    </div>
  </div>
  <div class="meta meta-grid">
    <div class="meta-left">
      <div class="meta-row"><span class="lbl">Cliente:</span> ${esc(cliente)}</div>
      ${celular ? `<div class="meta-row"><span class="lbl">Celular:</span> ${esc(celular)}</div>` : ''}
      <div class="meta-row"><span class="lbl">Vendedor:</span> ${esc(vendedor)}</div>
    </div>
    <div class="meta-right">
      <div class="meta-row"><span class="lbl">Pago:</span> ${esc(pagoLabel)}</div>
      ${pagoDetalle}
    </div>
  </div>
  <table class="items">
    <thead><tr>
      <th>COD.</th>
      <th>DESCRIPCIÓN</th>
      <th class="t-num">CANT.</th>
      <th class="t-c">UNID.</th>
      <th class="t-num">P. UNIT.</th>
      <th class="t-num">TOTAL</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:#888">Sin ítems</td></tr>'}</tbody>
  </table>
  <div class="totals">
    <div class="tot-row"><span>SUBTOTAL</span><span>${fmt(subtotal)}</span></div>
    ${descBlock}
    <div class="tot-row total"><span>TOTAL A PAGAR</span><span>${fmt(total)}</span></div>
  </div>
  <div class="letras">${esc(montoALetras(total))}</div>
</div>
${printScript}
</body></html>`
}

export function openReceiptHtmlInNewTab(html) {
  if (typeof window === 'undefined') return false
  try {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank')
    if (!w) {
      URL.revokeObjectURL(url)
      return false
    }
    w.addEventListener('beforeunload', () => {
      try {
        URL.revokeObjectURL(url)
      } catch {
        /* no-op */
      }
    })
    setTimeout(() => URL.revokeObjectURL(url), 120_000)
    return true
  } catch {
    return false
  }
}

/** Descarga como Recibo-N.html (el nombre base suele ser Recibo-123). */
export function downloadReceiptHtml(html, filenameBase) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  try {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const safe = String(filenameBase || 'Recibo').replace(/[^a-zA-Z0-9-_]/g, '_')
    a.download = `${safe}.html`
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
    return true
  } catch {
    return false
  }
}

export function printSaleReceipt(sale, details, options) {
  const html = buildSaleReceiptHtml(sale, details, { ...options, autoPrint: true })
  return openReceiptHtmlInNewTab(html)
}
