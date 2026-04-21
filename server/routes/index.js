import { Router } from 'express'
import mongoose from 'mongoose'
import {
  Category,
  Client,
  InventoryMovement,
  Product,
  Sale,
  SaleDetail,
  SalePayment,
  Setting,
  User
} from '../models/index.js'

const router = Router()

// ── Timezone helpers ──────────────────────────────────────────────────────────
// Configure via TZ_OFFSET_HOURS env var (default -4 = Bolivia BOT / UTC-4)
const TZ_OFFSET_MS = parseInt(process.env.TZ_OFFSET_HOURS ?? '-4', 10) * 3600 * 1000

// TZ string for MongoDB $dateToString (e.g. "-04:00")
const TZ_STR = (() => {
  const h = parseInt(process.env.TZ_OFFSET_HOURS ?? '-4', 10)
  const sign = h >= 0 ? '+' : '-'
  return `${sign}${String(Math.abs(h)).padStart(2, '0')}:00`
})()

/**
 * Returns UTC Date boundaries for the local calendar day.
 * offsetDays: 0 = today, -1 = yesterday, -6 = 6 days ago, etc.
 */
function getLocalDay(offsetDays = 0) {
  // Shift server UTC time to local timezone to get the local calendar date
  const localNow = new Date(Date.now() + TZ_OFFSET_MS)
  const y = localNow.getUTCFullYear(),
    mo = localNow.getUTCMonth(),
    d = localNow.getUTCDate()
  // Midnight of the requested local day, in UTC
  const baseMs = Date.UTC(y, mo, d + offsetDays, 0, 0, 0, 0)
  return {
    start: new Date(baseMs - TZ_OFFSET_MS), // local 00:00 → UTC
    end: new Date(baseMs - TZ_OFFSET_MS + 86400000 - 1), // local 23:59:59.999 → UTC
    label: new Date(baseMs).toISOString().slice(0, 10) // "YYYY-MM-DD" in local TZ
  }
}
// ─────────────────────────────────────────────────────────────────────────────

const toObjectIdOrNull = (value) => {
  if (!value || typeof value !== 'string' || value.length !== 24) {
    return null
  }

  return value
}

const getAuditContext = (req) => {
  const userId = req.headers['x-user-id']
  const username = req.headers['x-user-name'] || req.headers['x-username'] || 'system'

  return {
    userId: toObjectIdOrNull(String(userId || '')),
    username: String(username),
    ip: String(req.headers['x-forwarded-for'] || req.ip || '')
  }
}

const getCreateAuditFields = (req) => {
  const audit = getAuditContext(req)
  return {
    created_by_id: audit.userId,
    created_by_username: audit.username,
    created_from_ip: audit.ip,
    updated_by_id: audit.userId,
    updated_by_username: audit.username,
    updated_from_ip: audit.ip
  }
}

const getUpdateAuditFields = (req) => {
  const audit = getAuditContext(req)
  return {
    updated_by_id: audit.userId,
    updated_by_username: audit.username,
    updated_from_ip: audit.ip
  }
}

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'inventario-api' })
})

router.get('/summary', async (_req, res, next) => {
  try {
    // Use local timezone (TZ_OFFSET_HOURS, default Bolivia UTC-4)
    const today = getLocalDay(0)

    // Last 7 local days (index 0 = 6 days ago, index 6 = today)
    const last7Days = Array.from({ length: 7 }, (_, i) => getLocalDay(i - 6))

    const DAY_NAMES_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

    const [
      users,
      clients,
      products,
      sales,
      movements,
      salesToday,
      revenueTodayAgg,
      salesByPayment,
      salesLast7DaysAgg
    ] = await Promise.all([
      User.countDocuments(),
      Client.countDocuments(),
      Product.countDocuments(),
      Sale.countDocuments(),
      InventoryMovement.countDocuments(),
      Sale.countDocuments({ fecha: { $gte: today.start, $lte: today.end }, estado: 'activa' }),
      Sale.aggregate([
        { $match: { fecha: { $gte: today.start, $lte: today.end }, estado: 'activa' } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]),
      Sale.aggregate([
        { $group: { _id: '$metodo_pago', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      Sale.aggregate([
        { $match: { fecha: { $gte: last7Days[0].start } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$fecha', timezone: TZ_STR } },
            total: { $sum: '$total' },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ])

    const revenueToday = revenueTodayAgg.length > 0 ? revenueTodayAgg[0].total : 0

    // Build 7-day array keyed by local date label ("YYYY-MM-DD" in local TZ)
    const salesLast7Days = last7Days.map((day) => {
      const found = salesLast7DaysAgg.find((r) => r._id === day.label)
      return {
        date: day.label,
        label: DAY_NAMES_ES[new Date(day.label + 'T12:00:00Z').getUTCDay()],
        total: found ? found.total : 0,
        count: found ? found.count : 0
      }
    })

    res.json({
      users,
      clients,
      products,
      sales,
      inventory_movements: movements,
      sales_today: salesToday,
      revenue_today: revenueToday,
      sales_by_payment: salesByPayment,
      sales_last_7_days: salesLast7Days
    })
  } catch (error) {
    next(error)
  }
})

// ---- Top clients ----
router.get('/summary/top-clients', async (req, res, next) => {
  try {
    const period = req.query.period || 'all'
    let matchStage = { estado: 'activa', cliente_id: { $ne: null } }

    if (period === 'week') {
      const weekStart = new Date()
      weekStart.setDate(weekStart.getDate() - 7)
      weekStart.setHours(0, 0, 0, 0)
      matchStage.fecha = { $gte: weekStart }
    } else if (period === 'month') {
      const monthStart = new Date()
      monthStart.setDate(1)
      monthStart.setHours(0, 0, 0, 0)
      matchStage.fecha = { $gte: monthStart }
    }

    const topClients = await Sale.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$cliente_id',
          total_comprado: { $sum: '$total' },
          cantidad_compras: { $sum: 1 }
        }
      },
      { $sort: { total_comprado: -1 } },
      { $limit: 8 },
      {
        $lookup: {
          from: 'clients',
          localField: '_id',
          foreignField: '_id',
          as: 'cliente'
        }
      },
      { $unwind: { path: '$cliente', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          nombre: '$cliente.nombre',
          celular: '$cliente.celular',
          total_comprado: 1,
          cantidad_compras: 1
        }
      }
    ])

    res.json(topClients)
  } catch (error) {
    next(error)
  }
})

// ---- Caja del período ----
// Query params:
//   period=all           → all-time (no date filter)
//   from=<ISO>&to=<ISO>  → custom range
//   (none)               → today in local timezone
router.get('/summary/caja', async (req, res, next) => {
  try {
    let matchDate = {}
    let dateLabel = ''

    if (req.query.period === 'all') {
      dateLabel = 'Todo el tiempo'
    } else if (req.query.from && req.query.to) {
      const start = new Date(req.query.from)
      const end = new Date(req.query.to)
      matchDate = { $gte: start, $lte: end }
      dateLabel = req.query.label || `${req.query.from.slice(0, 10)} — ${req.query.to.slice(0, 10)}`
    } else {
      const today = getLocalDay(0)
      matchDate = { $gte: today.start, $lte: today.end }
      dateLabel = today.label
    }

    const baseMatch = Object.keys(matchDate).length ? { fecha: matchDate } : {}
    const activeMatch = { ...baseMatch, estado: 'activa' }
    const annulledMatch = { ...baseMatch, estado: 'anulada' }

    const byPayment = await Sale.aggregate([
      { $match: activeMatch },
      {
        $group: {
          _id: '$metodo_pago',
          total: { $sum: '$total' },
          count: { $sum: 1 }
        }
      },
      { $sort: { total: -1 } }
    ])

    const annulled = await Sale.countDocuments(annulledMatch)

    const totalIngresos = byPayment.reduce((s, r) => s + r.total, 0)
    const totalVentas = byPayment.reduce((s, r) => s + r.count, 0)

    res.json({ totalVentas, totalIngresos, annulled, byPayment, date: dateLabel })
  } catch (error) {
    next(error)
  }
})

// ---- Settings: métodos de pago ----
const PAYMENT_METHODS_KEY = 'payment_methods'
const DEFAULT_PAYMENT_METHODS = ['Efectivo', 'QR']
const RECEIPT_SEQUENCE_KEY = 'receipt_sequence_counter'

/** Siguiente número de comprobante (atómico, persistente en BD). */
async function getNextReceiptNumber() {
  const doc = await Setting.findOneAndUpdate(
    { key: RECEIPT_SEQUENCE_KEY },
    { $inc: { value: 1 }, $setOnInsert: { key: RECEIPT_SEQUENCE_KEY } },
    { new: true, upsert: true }
  )
  const n = Number(doc?.value)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

router.get('/settings/payment-methods', async (_req, res, next) => {
  try {
    let setting = await Setting.findOne({ key: PAYMENT_METHODS_KEY })
    if (!setting) {
      setting = await Setting.create({ key: PAYMENT_METHODS_KEY, value: DEFAULT_PAYMENT_METHODS })
    }
    res.json({ methods: setting.value })
  } catch (error) {
    next(error)
  }
})

router.post('/settings/payment-methods', async (req, res, next) => {
  try {
    const { method } = req.body || {}
    if (!method || typeof method !== 'string' || !method.trim()) {
      return res.status(400).json({ ok: false, message: 'El nombre del metodo es requerido' })
    }
    const name = method.trim()
    let setting = await Setting.findOne({ key: PAYMENT_METHODS_KEY })
    if (!setting) {
      setting = await Setting.create({ key: PAYMENT_METHODS_KEY, value: DEFAULT_PAYMENT_METHODS })
    }
    const current = Array.isArray(setting.value) ? setting.value : DEFAULT_PAYMENT_METHODS
    if (current.includes(name)) {
      return res.status(400).json({ ok: false, message: 'Ese metodo ya existe' })
    }
    setting.value = [...current, name]
    setting.markModified('value')
    await setting.save()
    res.json({ ok: true, methods: setting.value })
  } catch (error) {
    next(error)
  }
})

router.delete('/settings/payment-methods/:name', async (req, res, next) => {
  try {
    const name = decodeURIComponent(req.params.name)
    let setting = await Setting.findOne({ key: PAYMENT_METHODS_KEY })
    if (!setting) {
      return res.status(404).json({ ok: false, message: 'Configuracion no encontrada' })
    }
    const current = Array.isArray(setting.value) ? setting.value : DEFAULT_PAYMENT_METHODS
    setting.value = current.filter((m) => m !== name)
    setting.markModified('value')
    await setting.save()
    res.json({ ok: true, methods: setting.value })
  } catch (error) {
    next(error)
  }
})

// ---- Categories ----
router.get('/categories', async (_req, res, next) => {
  try {
    const categories = await Category.find().sort({ nombre: 1 })
    res.json(categories)
  } catch (error) {
    next(error)
  }
})

router.post('/categories', async (req, res, next) => {
  try {
    const payload = req.body || {}
    const audit = getCreateAuditFields(req)
    const category = await Category.create({
      nombre: payload.nombre,
      descripcion: payload.descripcion || '',
      activo: payload.activo !== false,
      created_by_id: audit.created_by_id,
      created_by_username: audit.created_by_username,
      updated_by_id: audit.updated_by_id,
      updated_by_username: audit.updated_by_username
    })
    res.status(201).json(category)
  } catch (error) {
    next(error)
  }
})

router.put('/categories/:id', async (req, res, next) => {
  try {
    const payload = req.body || {}
    const audit = getUpdateAuditFields(req)
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      {
        nombre: payload.nombre,
        descripcion: payload.descripcion,
        activo: payload.activo,
        updated_by_id: audit.updated_by_id,
        updated_by_username: audit.updated_by_username
      },
      { new: true, runValidators: true }
    )
    if (!category) return res.status(404).json({ ok: false, message: 'Categoría no encontrada' })
    res.json(category)
  } catch (error) {
    next(error)
  }
})

router.delete('/categories/:id', async (req, res, next) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id)
    if (!category) return res.status(404).json({ ok: false, message: 'Categoría no encontrada' })
    await Product.updateMany({ categoria_id: req.params.id }, { $set: { categoria_id: null } })
    res.json({ ok: true, message: 'Categoría eliminada' })
  } catch (error) {
    next(error)
  }
})

// ---- Products ----
router.get('/products', async (_req, res, next) => {
  try {
    const products = await Product.find()
      .populate('categoria_id', 'nombre')
      .sort({ created_at: -1 })
      .limit(200)
    res.json(products)
  } catch (error) {
    next(error)
  }
})

router.get('/products/:id', async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id)
    if (!product) return res.status(404).json({ ok: false, message: 'Producto no encontrado' })
    res.json(product)
  } catch (error) {
    next(error)
  }
})

router.post('/products', async (req, res, next) => {
  try {
    const payload = req.body || {}
    const manualCode = String(payload.codigo || '').trim()
    const codigo = manualCode || (await generateNextProductCode())
    const product = await Product.create({
      categoria_id: payload.categoria_id || null,
      codigo,
      nombre: payload.nombre,
      descripcion: payload.descripcion || '',
      precio_compra: Number(payload.precio_compra || 0),
      precio_venta: Number(payload.precio_venta || 0),
      stock: Number(payload.stock || 0),
      stock_minimo: Math.max(0, Number(payload.stock_minimo ?? 10)),
      activo: payload.activo !== false,
      ...getCreateAuditFields(req)
    })

    res.status(201).json(product)
  } catch (error) {
    next(error)
  }
})

router.put('/products/:id', async (req, res, next) => {
  try {
    const payload = req.body || {}
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      {
        ...payload,
        ...getUpdateAuditFields(req)
      },
      { new: true, runValidators: true }
    )

    if (!product) {
      return res.status(404).json({ ok: false, message: 'Producto no encontrado' })
    }

    res.json(product)
  } catch (error) {
    next(error)
  }
})

router.delete('/products/:id', async (req, res, next) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id)
    if (!product) return res.status(404).json({ ok: false, message: 'Producto no encontrado' })
    res.json({ ok: true, message: 'Producto eliminado exitosamente' })
  } catch (error) {
    next(error)
  }
})

router.get('/clients', async (_req, res, next) => {
  try {
    const clients = await Client.find().sort({ nombre: 1 }).limit(500)
    res.json(clients)
  } catch (error) {
    next(error)
  }
})

router.get('/clients/:id/sales', async (req, res, next) => {
  try {
    const sales = await Sale.find({ cliente_id: req.params.id })
      .populate('vendedor_id', 'nombre')
      .sort({ fecha: -1 })
      .limit(100)

    const salesWithDetails = await Promise.all(
      sales.map(async (sale) => {
        const details = await SaleDetail.find({ venta_id: sale._id }).populate(
          'producto_id',
          'nombre codigo'
        )
        return { ...sale.toObject(), items: details }
      })
    )

    res.json(salesWithDetails)
  } catch (error) {
    next(error)
  }
})

router.get('/clients/stats', async (_req, res, next) => {
  try {
    const stats = await Sale.aggregate([
      { $match: { cliente_id: { $ne: null }, estado: 'activa' } },
      {
        $group: {
          _id: '$cliente_id',
          total_comprado: { $sum: '$total' },
          cantidad_compras: { $sum: 1 },
          deuda: { $sum: { $ifNull: ['$saldo_pendiente', 0] } }
        }
      }
    ])
    const result = {}
    stats.forEach((s) => {
      result[String(s._id)] = { total: s.total_comprado, count: s.cantidad_compras, deuda: s.deuda }
    })
    res.json(result)
  } catch (error) {
    next(error)
  }
})

router.get('/clients/:id', async (req, res, next) => {
  try {
    const client = await Client.findById(req.params.id)
    if (!client) return res.status(404).json({ ok: false, message: 'Cliente no encontrado' })
    res.json(client)
  } catch (error) {
    next(error)
  }
})

router.post('/clients', async (req, res, next) => {
  try {
    const payload = req.body || {}
    const client = await Client.create({
      nombre: payload.nombre,
      celular: payload.celular || '',
      ...getCreateAuditFields(req)
    })

    res.status(201).json(client)
  } catch (error) {
    next(error)
  }
})

router.put('/clients/:id', async (req, res, next) => {
  try {
    const payload = req.body || {}
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      {
        ...payload,
        ...getUpdateAuditFields(req)
      },
      { new: true, runValidators: true }
    )

    if (!client) {
      return res.status(404).json({ ok: false, message: 'Cliente no encontrado' })
    }

    res.json(client)
  } catch (error) {
    next(error)
  }
})

router.delete('/clients/:id', async (req, res, next) => {
  try {
    const client = await Client.findByIdAndDelete(req.params.id)
    if (!client) return res.status(404).json({ ok: false, message: 'Cliente no encontrado' })
    res.json({ ok: true, message: 'Cliente eliminado exitosamente' })
  } catch (error) {
    next(error)
  }
})

router.get('/sales', async (_req, res, next) => {
  try {
    const sales = await Sale.find()
      .populate('cliente_id', 'nombre celular')
      .populate('vendedor_id', 'nombre tipo_usuario')
      .sort({ fecha: -1 })
      .limit(100)

    res.json(sales)
  } catch (error) {
    next(error)
  }
})

function normalizePagosMixtos(raw, total) {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: true, pagos: undefined }
  const cleaned = raw
    .map((p) => ({
      metodo: String(p.metodo || '').trim(),
      monto: Math.max(0, Number(p.monto) || 0)
    }))
    .filter((p) => p.metodo && p.monto > 0)
  if (cleaned.length < 2) {
    return { ok: false, message: 'Pago mixto: use al menos dos medios con monto mayor a cero.' }
  }
  const sum = cleaned.reduce((s, p) => s + p.monto, 0)
  if (Math.abs(sum - total) > 0.02) {
    return {
      ok: false,
      message: 'Pago mixto: la suma de los montos debe igualar el total de la venta.'
    }
  }
  return { ok: true, pagos: cleaned }
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function buildEstadoCobro(total, totalPagado) {
  const t = roundMoney(total)
  const p = Math.max(0, roundMoney(totalPagado))
  const saldo = Math.max(0, roundMoney(t - p))
  if (saldo <= 0.01) {
    return { total_pagado: t, saldo_pendiente: 0, estado_cobro: 'pagada' }
  }
  if (p <= 0.01) {
    return { total_pagado: 0, saldo_pendiente: saldo, estado_cobro: 'pendiente' }
  }
  return { total_pagado: p, saldo_pendiente: saldo, estado_cobro: 'parcial' }
}

function shouldRequireClienteForMovement(tipo, motivo) {
  return tipo === 'salida' || motivo === 'consignacion_devolucion'
}

async function generateNextProductCode() {
  const rows = await Product.find({}, 'codigo').lean()
  let maxN = 0
  const used = new Set()
  for (const r of rows) {
    const code = String(r.codigo || '').trim().toUpperCase()
    if (!code) continue
    used.add(code)
    const m = code.match(/(\d+)$/)
    if (!m) continue
    const n = Number(m[1])
    if (Number.isFinite(n) && n > maxN) maxN = n
  }
  let next = maxN + 1
  while (next < 1000000) {
    const candidate = `PROD-${String(next).padStart(3, '0')}`
    if (!used.has(candidate)) return candidate
    next += 1
  }
  return `PROD-${Date.now()}`
}

router.post('/sales', async (req, res, next) => {
  try {
    const payload = req.body || {}
    const items = Array.isArray(payload.items) ? payload.items : []

    if (items.length === 0) {
      return res
        .status(400)
        .json({ ok: false, message: 'La venta debe tener al menos un producto' })
    }

    const subtotal = items.reduce((sum, item) => {
      return sum + Number(item.precio_unitario || 0) * Number(item.cantidad || 1)
    }, 0)

    const rawDesc = Math.max(0, Number(payload.descuento_monto) || 0)
    const descuento_monto = Math.min(rawDesc, subtotal)
    const total = Math.max(0, subtotal - descuento_monto)

    const mixNorm = normalizePagosMixtos(payload.pagos_mixtos, total)
    if (!mixNorm.ok) {
      return res.status(400).json({ ok: false, message: mixNorm.message })
    }

    let metodo_pago = String(payload.metodo_pago || '').trim()
    let pagos_mixtos = mixNorm.pagos
    if (pagos_mixtos && pagos_mixtos.length) {
      metodo_pago = 'Mixto'
    } else if (!metodo_pago) {
      return res.status(400).json({ ok: false, message: 'Indique el método de pago' })
    }

    const numero_comprobante = await getNextReceiptNumber()
    const pagoInicialRaw = Math.max(0, Number(payload.monto_pagado_inicial) || 0)
    const pagoInicial = Math.min(roundMoney(pagoInicialRaw), roundMoney(total))
    const cobro = buildEstadoCobro(total, pagoInicial)

    if (cobro.saldo_pendiente > 0.01 && !payload.cliente_id) {
      return res.status(400).json({
        ok: false,
        message: 'Para registrar deuda o saldo pendiente debe seleccionar un cliente.'
      })
    }

    if (pagoInicialRaw > total + 0.01) {
      return res.status(400).json({
        ok: false,
        message: 'El monto pagado no puede ser mayor al total de la venta.'
      })
    }

    const sale = await Sale.create({
      cliente_id: payload.cliente_id || null,
      vendedor_id: payload.vendedor_id || null,
      fecha: new Date(),
      subtotal,
      descuento_monto,
      total,
      numero_comprobante,
      estado: 'activa',
      metodo_pago,
      pagos_mixtos: pagos_mixtos && pagos_mixtos.length ? pagos_mixtos : undefined,
      total_pagado: cobro.total_pagado,
      saldo_pendiente: cobro.saldo_pendiente,
      estado_cobro: cobro.estado_cobro,
      fecha_vencimiento: payload.fecha_vencimiento || null,
      observacion: payload.observacion || '',
      ...getCreateAuditFields(req)
    })

    await Promise.all(
      items.map(async (item) => {
        const cantidad = Number(item.cantidad || 1)
        const precio = Number(item.precio_unitario || 0)
        await SaleDetail.create({
          venta_id: sale._id,
          producto_id: item.producto_id,
          cantidad,
          precio_unitario: precio,
          subtotal: cantidad * precio
        })
        await Product.findByIdAndUpdate(item.producto_id, { $inc: { stock: -cantidad } })
      })
    )

    if (pagoInicial > 0.01 && sale.cliente_id) {
      await SalePayment.create({
        venta_id: sale._id,
        cliente_id: sale.cliente_id,
        monto: pagoInicial,
        metodo_pago,
        observacion: 'Pago inicial registrado al crear la venta',
        fecha: new Date(),
        ...getCreateAuditFields(req)
      })
    }

    const saleOut = await Sale.findById(sale._id)
      .populate('cliente_id', 'nombre celular')
      .populate('vendedor_id', 'nombre tipo_usuario')

    res.status(201).json({ ok: true, sale: saleOut })
  } catch (error) {
    next(error)
  }
})

router.put('/sales/:id', async (req, res, next) => {
  try {
    const payload = req.body || {}
    const sale = await Sale.findByIdAndUpdate(
      req.params.id,
      {
        ...payload,
        ...getUpdateAuditFields(req)
      },
      { new: true, runValidators: true }
    )

    if (!sale) {
      return res.status(404).json({ ok: false, message: 'Venta no encontrada' })
    }

    res.json(sale)
  } catch (error) {
    next(error)
  }
})

router.get('/sales/:id/details', async (req, res, next) => {
  try {
    const details = await SaleDetail.find({ venta_id: req.params.id }).populate(
      'producto_id',
      'nombre codigo'
    )
    res.json(details)
  } catch (error) {
    next(error)
  }
})

router.get('/sales/:id/payments', async (req, res, next) => {
  try {
    const payments = await SalePayment.find({ venta_id: req.params.id })
      .populate('cliente_id', 'nombre celular')
      .sort({ fecha: -1 })

    res.json(payments)
  } catch (error) {
    next(error)
  }
})

router.post('/sales/:id/payments', async (req, res, next) => {
  try {
    const sale = await Sale.findById(req.params.id)
    if (!sale) return res.status(404).json({ ok: false, message: 'Venta no encontrada' })
    if (sale.estado !== 'activa') {
      return res.status(400).json({ ok: false, message: 'Solo se pueden abonar ventas activas.' })
    }
    if (!sale.cliente_id) {
      return res.status(400).json({ ok: false, message: 'La venta no tiene cliente asociado.' })
    }

    const monto = roundMoney(Math.max(0, Number(req.body?.monto) || 0))
    const metodo_pago = String(req.body?.metodo_pago || '').trim()
    const observacion = String(req.body?.observacion || '').trim()
    if (monto < 0.01) {
      return res
        .status(400)
        .json({ ok: false, message: 'El monto del abono debe ser mayor a cero.' })
    }
    if (sale.saldo_pendiente <= 0.01) {
      return res.status(400).json({ ok: false, message: 'La venta no tiene saldo pendiente.' })
    }
    if (monto > sale.saldo_pendiente + 0.01) {
      return res
        .status(400)
        .json({ ok: false, message: 'El abono no puede superar el saldo pendiente.' })
    }

    const payment = await SalePayment.create({
      venta_id: sale._id,
      cliente_id: sale.cliente_id,
      monto,
      metodo_pago,
      observacion,
      fecha: new Date(),
      ...getCreateAuditFields(req)
    })

    const nuevoTotalPagado = roundMoney(Number(sale.total_pagado || 0) + monto)
    const cobro = buildEstadoCobro(sale.total, nuevoTotalPagado)
    sale.total_pagado = cobro.total_pagado
    sale.saldo_pendiente = cobro.saldo_pendiente
    sale.estado_cobro = cobro.estado_cobro
    Object.assign(sale, getUpdateAuditFields(req))
    await sale.save()

    const saleOut = await Sale.findById(sale._id)
      .populate('cliente_id', 'nombre celular')
      .populate('vendedor_id', 'nombre tipo_usuario')

    res.status(201).json({ ok: true, payment, sale: saleOut })
  } catch (error) {
    next(error)
  }
})

router.get('/clients/:id/debt-summary', async (req, res, next) => {
  try {
    const client = await Client.findById(req.params.id)
    if (!client) return res.status(404).json({ ok: false, message: 'Cliente no encontrado' })

    const salesWithDebt = await Sale.find({
      cliente_id: req.params.id,
      estado: 'activa',
      saldo_pendiente: { $gt: 0.01 }
    })
      .sort({ fecha: -1 })
      .limit(200)

    const total_deuda = roundMoney(
      salesWithDebt.reduce((sum, sale) => sum + Number(sale.saldo_pendiente || 0), 0)
    )

    res.json({
      ok: true,
      client: {
        _id: client._id,
        nombre: client.nombre,
        celular: client.celular || ''
      },
      total_deuda,
      ventas_con_saldo: salesWithDebt.map((sale) => ({
        _id: sale._id,
        fecha: sale.fecha,
        numero_comprobante: sale.numero_comprobante,
        total: sale.total,
        total_pagado: sale.total_pagado,
        saldo_pendiente: sale.saldo_pendiente,
        estado_cobro: sale.estado_cobro
      }))
    })
  } catch (error) {
    next(error)
  }
})

router.post('/clients/:id/settle-debt', async (req, res, next) => {
  try {
    const client = await Client.findById(req.params.id)
    if (!client) return res.status(404).json({ ok: false, message: 'Cliente no encontrado' })

    const monto = roundMoney(Math.max(0, Number(req.body?.monto) || 0))
    const metodo_pago = String(req.body?.metodo_pago || '').trim()
    const observacion = String(req.body?.observacion || '').trim()

    if (monto < 0.01) {
      return res.status(400).json({ ok: false, message: 'El monto debe ser mayor a cero.' })
    }

    const salesWithDebt = await Sale.find({
      cliente_id: client._id,
      estado: 'activa',
      saldo_pendiente: { $gt: 0.01 }
    }).sort({ fecha: 1 }) // Pay older dates first

    const total_deuda = roundMoney(
      salesWithDebt.reduce((sum, sale) => sum + Number(sale.saldo_pendiente || 0), 0)
    )

    if (salesWithDebt.length === 0 || total_deuda < 0.01) {
      return res.status(400).json({ ok: false, message: 'El cliente no tiene deuda pendiente.' })
    }
    
    if (monto > total_deuda + 0.01) {
      return res.status(400).json({ ok: false, message: 'Abono supera la deuda total.' })
    }

    let montoRestante = monto
    const paymentsCreated = []

    for (const sale of salesWithDebt) {
      if (montoRestante <= 0.01) break
      
      const abonarAsale = Math.min(montoRestante, sale.saldo_pendiente)
      montoRestante -= abonarAsale

      const payment = await SalePayment.create({
        venta_id: sale._id,
        cliente_id: sale.cliente_id,
        monto: abonarAsale,
        metodo_pago,
        observacion: observacion || 'Pago masivo de saldo de cliente',
        fecha: new Date(),
        ...getCreateAuditFields(req)
      })

      const nuevoTotalPagado = roundMoney(Number(sale.total_pagado || 0) + abonarAsale)
      const cobro = buildEstadoCobro(sale.total, nuevoTotalPagado)
      sale.total_pagado = cobro.total_pagado
      sale.saldo_pendiente = cobro.saldo_pendiente
      sale.estado_cobro = cobro.estado_cobro
      Object.assign(sale, getUpdateAuditFields(req))
      await sale.save()
      
      paymentsCreated.push(payment)
    }

    res.json({ ok: true, payments: paymentsCreated, message: 'Deuda saldada correctamente.' })
  } catch (error) {
    next(error)
  }
})

router.get('/clients/:id/payments', async (req, res, next) => {
  try {
    const client = await Client.findById(req.params.id)
    if (!client) return res.status(404).json({ ok: false, message: 'Cliente no encontrado' })

    const payments = await SalePayment.find({ cliente_id: req.params.id })
      .populate('venta_id', 'numero_comprobante total total_pagado saldo_pendiente fecha')
      .sort({ fecha: -1 })
      .limit(300)

    res.json({ ok: true, client, payments })
  } catch (error) {
    next(error)
  }
})

router.patch('/sales/:id/cancel', async (req, res, next) => {
  try {
    const sale = await Sale.findById(req.params.id)
    if (!sale) return res.status(404).json({ ok: false, message: 'Venta no encontrada' })
    if (sale.estado === 'anulada') {
      return res.status(400).json({ ok: false, message: 'La venta ya esta anulada' })
    }

    // Restore stock for each detail
    const details = await SaleDetail.find({ venta_id: sale._id })
    await Promise.all(
      details.map((d) => Product.findByIdAndUpdate(d.producto_id, { $inc: { stock: d.cantidad } }))
    )

    sale.estado = 'anulada'
    sale.motivo_anulacion = String(req.body?.motivo || '').trim()
    Object.assign(sale, getUpdateAuditFields(req))
    await sale.save()

    res.json({ ok: true, sale })
  } catch (error) {
    next(error)
  }
})

router.delete('/sales/:id', async (req, res, next) => {
  try {
    const sale = await Sale.findByIdAndDelete(req.params.id)
    if (!sale) return res.status(404).json({ ok: false, message: 'Venta no encontrada' })
    await SaleDetail.deleteMany({ venta_id: req.params.id })
    res.json({ ok: true, message: 'Venta eliminada exitosamente' })
  } catch (error) {
    next(error)
  }
})

router.get('/users', async (_req, res, next) => {
  try {
    const users = await User.find(
      {},
      'nombre username celular tipo_usuario activo created_at updated_at'
    )
      .sort({ created_at: -1 })
      .limit(100)

    res.json(users)
  } catch (error) {
    next(error)
  }
})

router.get('/users/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id, 'nombre username celular tipo_usuario activo')
    if (!user) return res.status(404).json({ ok: false, message: 'Usuario no encontrado' })
    res.json(user)
  } catch (error) {
    next(error)
  }
})

router.post('/users', async (req, res, next) => {
  try {
    const payload = req.body || {}

    const user = await User.create({
      nombre: payload.nombre,
      username: payload.username,
      password_hash: payload.password_hash,
      celular: payload.celular || '',
      tipo_usuario: payload.tipo_usuario,
      activo: payload.activo !== false,
      ...getCreateAuditFields(req)
    })

    res.status(201).json(user)
  } catch (error) {
    next(error)
  }
})

router.put('/users/:id', async (req, res, next) => {
  try {
    const payload = { ...req.body }

    if (!payload.password_hash) {
      delete payload.password_hash
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        ...payload,
        ...getUpdateAuditFields(req)
      },
      { new: true, runValidators: true }
    )

    if (!user) {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado' })
    }

    res.json(user)
  } catch (error) {
    next(error)
  }
})

router.delete('/users/:id', async (req, res, next) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id)
    if (!user) return res.status(404).json({ ok: false, message: 'Usuario no encontrado' })
    res.json({ ok: true, message: 'Usuario eliminado exitosamente' })
  } catch (error) {
    next(error)
  }
})

router.get('/inventory-movements', async (_req, res, next) => {
  try {
    const movements = await InventoryMovement.find()
      .populate('producto_id', 'nombre codigo')
      .populate('usuario_id', 'nombre tipo_usuario')
      .populate('cliente_id', 'nombre celular')
      .sort({ fecha: -1 })
      .limit(100)

    res.json(movements)
  } catch (error) {
    next(error)
  }
})

router.get('/inventory-movements/transaccion/:tid', async (req, res, next) => {
  try {
    const tid = req.params.tid
    if (!mongoose.Types.ObjectId.isValid(tid)) {
      return res.status(400).json({ ok: false, message: 'ID de transacción inválido' })
    }
    const lines = await InventoryMovement.find({ transaccion_id: tid })
      .populate('producto_id', 'nombre codigo')
      .populate('usuario_id', 'nombre tipo_usuario')
      .populate('cliente_id', 'nombre celular')
      .sort({ _id: 1 })
    if (!lines.length) {
      return res.status(404).json({ ok: false, message: 'Transacción no encontrada' })
    }
    res.json({ ok: true, transaccion_id: tid, lines })
  } catch (error) {
    next(error)
  }
})

/** Actualizar todas las líneas de una transacción (cantidades, precios, motivo, observación). Ajusta stock por delta. */
router.put('/inventory-movements/transaccion/:tid', async (req, res, next) => {
  try {
    const tid = req.params.tid
    if (!mongoose.Types.ObjectId.isValid(tid)) {
      return res.status(400).json({ ok: false, message: 'ID de transacción inválido' })
    }
    const payload = req.body || {}
    const items = payload.items
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, message: 'items[] es requerido' })
    }
    if (!payload.motivo || !payload.usuario_id) {
      return res.status(400).json({ ok: false, message: 'motivo y usuario_id son requeridos' })
    }

    const existing = await InventoryMovement.find({ transaccion_id: tid }).sort({ _id: 1 })
    if (!existing.length) {
      return res.status(404).json({ ok: false, message: 'Transacción no encontrada' })
    }
    if (items.length !== existing.length) {
      return res
        .status(400)
        .json({ ok: false, message: 'La cantidad de líneas no coincide con la transacción' })
    }

    const refTipo = existing[0].tipo_movimiento
    const requireCliente = shouldRequireClienteForMovement(refTipo, payload.motivo)
    if (requireCliente && !payload.cliente_id) {
      return res.status(400).json({
        ok: false,
        message: 'cliente_id es requerido para salidas y devoluciones de consignación.'
      })
    }
    for (const m of existing) {
      if (m.tipo_movimiento !== refTipo) {
        return res.status(400).json({ ok: false, message: 'Transacción inconsistente' })
      }
    }

    const existingById = new Map(existing.map((m) => [String(m._id), m]))
    const used = new Set()
    for (const it of items) {
      const mid = it.movement_id || it.id
      if (!mid || !existingById.has(String(mid))) {
        return res
          .status(400)
          .json({
            ok: false,
            message: 'Cada ítem debe incluir movement_id válido de esta transacción'
          })
      }
      if (used.has(String(mid))) {
        return res.status(400).json({ ok: false, message: 'movement_id duplicado' })
      }
      used.add(String(mid))
      const m = existingById.get(String(mid))
      if (it.producto_id && String(it.producto_id) !== String(m.producto_id)) {
        return res
          .status(400)
          .json({ ok: false, message: 'No se puede cambiar el producto de una línea' })
      }
      const newQty = Number(it.cantidad)
      if (!Number.isFinite(newQty) || newQty < 1) {
        return res.status(400).json({ ok: false, message: 'Cada línea necesita cantidad ≥ 1' })
      }
    }
    if (used.size !== existing.length) {
      return res.status(400).json({ ok: false, message: 'Faltan líneas en items[]' })
    }

    const observacion = payload.observacion != null ? String(payload.observacion) : ''
    const audit = getUpdateAuditFields(req)

    for (const it of items) {
      const m = existingById.get(String(it.movement_id || it.id))
      const oldQty = Number(m.cantidad)
      const newQty = Number(it.cantidad)
      const tipoM = m.tipo_movimiento
      const isConsignacionDevolucion =
        tipoM === 'entrada' && payload.motivo === 'consignacion_devolucion'
      const stockDelta = tipoM === 'entrada' ? newQty - oldQty : oldQty - newQty
      await Product.findByIdAndUpdate(m.producto_id, { $inc: { stock: stockDelta } })

      let precio_compra = m.precio_compra
      let precio_venta = m.precio_venta
      if (tipoM === 'entrada') {
        if (
          !isConsignacionDevolucion &&
          it.precio_compra !== undefined &&
          it.precio_compra !== ''
        ) {
          precio_compra = it.precio_compra == null ? null : Number(it.precio_compra)
        }
        if (it.precio_venta !== undefined && it.precio_venta !== '') {
          precio_venta = it.precio_venta == null ? null : Number(it.precio_venta)
        }
        if (isConsignacionDevolucion) {
          precio_compra = null
        }
      } else {
        precio_compra = null
        precio_venta = null
      }

      await InventoryMovement.findByIdAndUpdate(
        m._id,
        {
          cantidad: newQty,
          precio_compra: tipoM === 'entrada' ? precio_compra : null,
          precio_venta: tipoM === 'entrada' ? precio_venta : null,
          motivo: payload.motivo,
          cliente_id: payload.cliente_id || null,
          usuario_id: payload.usuario_id,
          observacion,
          ...audit
        },
        { new: true, runValidators: true }
      )

      if (tipoM === 'entrada' && !isConsignacionDevolucion) {
        const set = {}
        if (precio_compra != null && !Number.isNaN(Number(precio_compra)))
          set.precio_compra = Number(precio_compra)
        if (precio_venta != null && !Number.isNaN(Number(precio_venta)))
          set.precio_venta = Number(precio_venta)
        if (Object.keys(set).length > 0) {
          await Product.findByIdAndUpdate(m.producto_id, { $set: set })
        }
      }
    }

    const lines = await InventoryMovement.find({ transaccion_id: tid })
      .populate('producto_id', 'nombre codigo')
      .populate('usuario_id', 'nombre tipo_usuario')
      .populate('cliente_id', 'nombre celular')
      .sort({ _id: 1 })

    res.json({ ok: true, transaccion_id: tid, lines })
  } catch (error) {
    next(error)
  }
})

router.delete('/inventory-movements/transaccion/:tid', async (req, res, next) => {
  try {
    const tid = req.params.tid
    if (!mongoose.Types.ObjectId.isValid(tid)) {
      return res.status(400).json({ ok: false, message: 'ID de transacción inválido' })
    }
    const result = await InventoryMovement.deleteMany({ transaccion_id: tid })
    if (result.deletedCount === 0) {
      return res.status(404).json({ ok: false, message: 'Transacción no encontrada' })
    }
    res.json({ ok: true, message: 'Transacción eliminada', deleted: result.deletedCount })
  } catch (error) {
    next(error)
  }
})

router.get('/inventory-movements/consignaciones', async (req, res, next) => {
  try {
    const query = {
      tipo_movimiento: 'salida',
      motivo: 'consignacion_envio'
    }
    const clienteId = String(req.query?.cliente_id || '').trim()
    if (clienteId && mongoose.Types.ObjectId.isValid(clienteId)) {
      query.cliente_id = clienteId
    }

    const lines = await InventoryMovement.find(query)
      .populate('producto_id', 'nombre codigo precio_venta')
      .populate('cliente_id', 'nombre celular')
      .sort({ fecha: -1, _id: 1 })
      .limit(600)

    const grouped = new Map()
    for (const m of lines) {
      const key = m.transaccion_id ? String(m.transaccion_id) : String(m._id)
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          transaccion_id: m.transaccion_id ? String(m.transaccion_id) : null,
          fecha: m.fecha,
          cliente_id: m.cliente_id || null,
          items: []
        })
      }
      grouped.get(key).items.push({
        movement_id: String(m._id),
        producto_id: m.producto_id?._id || null,
        producto_nombre: m.producto_id?.nombre || '—',
        codigo: m.producto_id?.codigo || '',
        cantidad: Number(m.cantidad || 0)
      })
    }

    const consignaciones = [...grouped.values()]
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      .map((g) => ({
        ...g,
        total_productos: g.items.length,
        total_cantidad: g.items.reduce((s, i) => s + Number(i.cantidad || 0), 0)
      }))

    res.json({ ok: true, consignaciones })
  } catch (error) {
    next(error)
  }
})

router.get('/inventory-movements/:id', async (req, res, next) => {
  try {
    const movement = await InventoryMovement.findById(req.params.id)
      .populate('producto_id', 'nombre codigo')
      .populate('usuario_id', 'nombre tipo_usuario')
      .populate('cliente_id', 'nombre celular')
    if (!movement) return res.status(404).json({ ok: false, message: 'Movimiento no encontrado' })
    res.json(movement)
  } catch (error) {
    next(error)
  }
})

router.post('/inventory-movements', async (req, res, next) => {
  try {
    const payload = req.body || {}

    /** Varios productos en un mismo movimiento (mismo tipo, motivo y observación). */
    if (Array.isArray(payload.items) && payload.items.length > 0) {
      const tipo = payload.tipo_movimiento
      const motivo = payload.motivo
      const isConsignacionDevolucion = tipo === 'entrada' && motivo === 'consignacion_devolucion'
      const usuario_id = payload.usuario_id
      if (!['entrada', 'salida'].includes(tipo)) {
        return res.status(400).json({ ok: false, message: 'tipo_movimiento inválido' })
      }
      if (!motivo || !usuario_id) {
        return res.status(400).json({ ok: false, message: 'motivo y usuario_id son requeridos' })
      }
      const requireCliente = shouldRequireClienteForMovement(tipo, motivo)
      if (requireCliente && !payload.cliente_id) {
        return res.status(400).json({
          ok: false,
          message: 'cliente_id es requerido para salidas y devoluciones de consignación.'
        })
      }

        if (isConsignacionDevolucion) {
          const consignacionQuery = {
            tipo_movimiento: 'salida',
            motivo: 'consignacion_envio'
          }
          if (payload.cliente_id) consignacionQuery.cliente_id = payload.cliente_id
          const hasConsignaciones = await InventoryMovement.exists(consignacionQuery)
          if (!hasConsignaciones) {
            return res.status(400).json({
              ok: false,
              message: 'No hay consignaciones activas para registrar una devolución.'
            })
          }
        }

      const observacion = payload.observacion || ''
      const fecha = payload.fecha ? new Date(payload.fecha) : new Date()
      const audit = getCreateAuditFields(req)
      const movements = []
      const transaccion_id = payload.items.length > 1 ? new mongoose.Types.ObjectId() : null

      for (const item of payload.items) {
        const cantidad = Number(item.cantidad || 0)
        if (!item.producto_id || cantidad < 1) {
          return res
            .status(400)
            .json({ ok: false, message: 'Cada ítem necesita producto_id y cantidad ≥ 1' })
        }

        const precioCompra =
          tipo === 'entrada' &&
          !isConsignacionDevolucion &&
          item.precio_compra != null &&
          item.precio_compra !== ''
            ? Number(item.precio_compra)
            : null
        const precioVenta =
          tipo === 'entrada' && item.precio_venta != null && item.precio_venta !== ''
            ? Number(item.precio_venta)
            : null

        const movement = await InventoryMovement.create({
          producto_id: item.producto_id,
          cliente_id: payload.cliente_id || null,
          tipo_movimiento: tipo,
          cantidad,
          precio_compra: precioCompra,
          precio_venta: precioVenta,
          motivo,
          usuario_id,
          observacion,
          fecha,
          transaccion_id,
          ...audit
        })

        const stockDelta = tipo === 'entrada' ? cantidad : -cantidad
        const productUpdate = { $inc: { stock: stockDelta } }
        if (tipo === 'entrada' && !isConsignacionDevolucion) {
          const set = {}
          if (precioCompra != null && !Number.isNaN(precioCompra)) set.precio_compra = precioCompra
          if (precioVenta != null && !Number.isNaN(precioVenta)) set.precio_venta = precioVenta
          if (Object.keys(set).length > 0) productUpdate.$set = set
        }

        await Product.findByIdAndUpdate(item.producto_id, productUpdate)
        movements.push(movement)
      }

      return res.status(201).json({
        ok: true,
        movements,
        count: movements.length,
        transaccion_id: transaccion_id ? String(transaccion_id) : null
      })
    }

    if (
      shouldRequireClienteForMovement(payload.tipo_movimiento, payload.motivo) &&
      !payload.cliente_id
    ) {
      return res.status(400).json({
        ok: false,
        message: 'cliente_id es requerido para salidas y devoluciones de consignación.'
      })
    }

    const movement = await InventoryMovement.create({
      producto_id: payload.producto_id,
      cliente_id: payload.cliente_id || null,
      tipo_movimiento: payload.tipo_movimiento,
      cantidad: Number(payload.cantidad || 0),
      precio_compra:
        payload.tipo_movimiento === 'entrada' &&
        payload.motivo !== 'consignacion_devolucion' &&
        payload.precio_compra != null
          ? Number(payload.precio_compra)
          : null,
      precio_venta:
        payload.tipo_movimiento === 'entrada' && payload.precio_venta != null
          ? Number(payload.precio_venta)
          : null,
      motivo: payload.motivo,
      usuario_id: payload.usuario_id,
      observacion: payload.observacion || '',
      fecha: payload.fecha || new Date(),
      ...getCreateAuditFields(req)
    })

    const stockDelta =
      payload.tipo_movimiento === 'entrada'
        ? Number(payload.cantidad || 0)
        : -Number(payload.cantidad || 0)

    const productUpdate = { $inc: { stock: stockDelta } }
    if (payload.tipo_movimiento === 'entrada' && payload.motivo !== 'consignacion_devolucion') {
      const set = {}
      if (payload.precio_compra != null) set.precio_compra = Number(payload.precio_compra)
      if (payload.precio_venta != null) set.precio_venta = Number(payload.precio_venta)
      if (Object.keys(set).length > 0) productUpdate.$set = set
    }

    await Product.findByIdAndUpdate(payload.producto_id, productUpdate)

    res.status(201).json(movement)
  } catch (error) {
    next(error)
  }
})

// inventory movements are mostly immutable, but allow corrections:
router.put('/inventory-movements/:id', async (req, res, next) => {
  try {
    const payload = req.body || {}
    const existing = await InventoryMovement.findById(req.params.id)
    if (!existing) return res.status(404).json({ ok: false, message: 'Movimiento no encontrado' })

    const finalTipo = payload.tipo_movimiento || existing.tipo_movimiento
    const finalMotivo = payload.motivo || existing.motivo
    const finalCliente = payload.cliente_id ?? existing.cliente_id
    if (shouldRequireClienteForMovement(finalTipo, finalMotivo) && !finalCliente) {
      return res.status(400).json({
        ok: false,
        message: 'cliente_id es requerido para salidas y devoluciones de consignación.'
      })
    }

    if (finalTipo === 'entrada' && finalMotivo === 'consignacion_devolucion') {
      const consignacionQuery = {
        tipo_movimiento: 'salida',
        motivo: 'consignacion_envio'
      }
      if (finalCliente) consignacionQuery.cliente_id = finalCliente
      const hasConsignaciones = await InventoryMovement.exists(consignacionQuery)
      if (!hasConsignaciones) {
        return res.status(400).json({
          ok: false,
          message: 'No hay consignaciones activas para registrar una devolución.'
        })
      }
    }

    const movement = await InventoryMovement.findByIdAndUpdate(
      req.params.id,
      {
        ...payload,
        ...getUpdateAuditFields(req)
      },
      { new: true, runValidators: true }
    )
    if (!movement) return res.status(404).json({ ok: false, message: 'Movimiento no encontrado' })

    if (
      movement.tipo_movimiento === 'entrada' &&
      movement.motivo !== 'consignacion_devolucion' &&
      movement.producto_id
    ) {
      const set = {}
      if (movement.precio_compra != null) set.precio_compra = Number(movement.precio_compra)
      if (movement.precio_venta != null) set.precio_venta = Number(movement.precio_venta)
      if (Object.keys(set).length > 0) {
        await Product.findByIdAndUpdate(movement.producto_id, { $set: set })
      }
    }

    res.json(movement)
  } catch (error) {
    next(error)
  }
})

router.delete('/inventory-movements/:id', async (req, res, next) => {
  try {
    const movement = await InventoryMovement.findByIdAndDelete(req.params.id)
    if (!movement) return res.status(404).json({ ok: false, message: 'Movimiento no encontrado' })
    res.json({ ok: true, message: 'Movimiento eliminado exitosamente' })
  } catch (error) {
    next(error)
  }
})

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {}

    if (!username || !password) {
      return res.status(400).json({ ok: false, message: 'Usuario y contrasena son requeridos' })
    }

    const user = await User.findOne({ username, activo: true })

    if (!user || user.password_hash !== password) {
      return res.status(401).json({ ok: false, message: 'Credenciales invalidas' })
    }

    res.json({
      ok: true,
      user: {
        id: user._id,
        nombre: user.nombre,
        username: user.username,
        tipo_usuario: user.tipo_usuario
      }
    })
  } catch (error) {
    next(error)
  }
})

export default router
