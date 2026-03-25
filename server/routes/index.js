import { Router } from 'express'
import { Category, Client, InventoryMovement, Product, Sale, SaleDetail, Setting, User } from '../models/index.js'

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
  const y = localNow.getUTCFullYear(), mo = localNow.getUTCMonth(), d = localNow.getUTCDate()
  // Midnight of the requested local day, in UTC
  const baseMs = Date.UTC(y, mo, d + offsetDays, 0, 0, 0, 0)
  return {
    start: new Date(baseMs - TZ_OFFSET_MS),           // local 00:00 → UTC
    end:   new Date(baseMs - TZ_OFFSET_MS + 86400000 - 1), // local 23:59:59.999 → UTC
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
        date:  day.label,
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
      const end   = new Date(req.query.to)
      matchDate = { $gte: start, $lte: end }
      dateLabel = req.query.label || `${req.query.from.slice(0,10)} — ${req.query.to.slice(0,10)}`
    } else {
      const today = getLocalDay(0)
      matchDate = { $gte: today.start, $lte: today.end }
      dateLabel = today.label
    }

    const baseMatch  = Object.keys(matchDate).length ? { fecha: matchDate } : {}
    const activeMatch  = { ...baseMatch, estado: 'activa' }
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
    const totalVentas   = byPayment.reduce((s, r) => s + r.count, 0)

    res.json({ totalVentas, totalIngresos, annulled, byPayment, date: dateLabel })
  } catch (error) {
    next(error)
  }
})

// ---- Settings: métodos de pago ----
const PAYMENT_METHODS_KEY = 'payment_methods'
const DEFAULT_PAYMENT_METHODS = ['Efectivo', 'QR']

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
      { nombre: payload.nombre, descripcion: payload.descripcion, activo: payload.activo, updated_by_id: audit.updated_by_id, updated_by_username: audit.updated_by_username },
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
    const product = await Product.create({
      codigo: payload.codigo,
      nombre: payload.nombre,
      descripcion: payload.descripcion || '',
      precio_compra: Number(payload.precio_compra || 0),
      precio_venta: Number(payload.precio_venta || 0),
      stock: Number(payload.stock || 0),
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
          cantidad_compras: { $sum: 1 }
        }
      }
    ])
    const result = {}
    stats.forEach((s) => {
      result[String(s._id)] = { total: s.total_comprado, count: s.cantidad_compras }
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

router.post('/sales', async (req, res, next) => {
  try {
    const payload = req.body || {}
    const items = Array.isArray(payload.items) ? payload.items : []

    if (items.length === 0) {
      return res.status(400).json({ ok: false, message: 'La venta debe tener al menos un producto' })
    }

    const total = items.reduce((sum, item) => {
      return sum + Number(item.precio_unitario || 0) * Number(item.cantidad || 1)
    }, 0)

    const sale = await Sale.create({
      cliente_id: payload.cliente_id || null,
      vendedor_id: payload.vendedor_id || null,
      fecha: new Date(),
      total,
      estado: 'activa',
      metodo_pago: payload.metodo_pago || '',
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

    res.status(201).json({ ok: true, sale })
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
      details.map((d) =>
        Product.findByIdAndUpdate(d.producto_id, { $inc: { stock: d.cantidad } })
      )
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
    const user = await User.findById(
      req.params.id,
      'nombre username celular tipo_usuario activo'
    )
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
      .sort({ fecha: -1 })
      .limit(100)

    res.json(movements)
  } catch (error) {
    next(error)
  }
})

router.get('/inventory-movements/:id', async (req, res, next) => {
  try {
    const movement = await InventoryMovement.findById(req.params.id)
    if (!movement) return res.status(404).json({ ok: false, message: 'Movimiento no encontrado' })
    res.json(movement)
  } catch (error) {
    next(error)
  }
})

router.post('/inventory-movements', async (req, res, next) => {
  try {
    const payload = req.body || {}

    const movement = await InventoryMovement.create({
      producto_id: payload.producto_id,
      tipo_movimiento: payload.tipo_movimiento,
      cantidad: Number(payload.cantidad || 0),
      precio_compra: payload.tipo_movimiento === 'entrada' && payload.precio_compra != null
        ? Number(payload.precio_compra)
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
    if (payload.tipo_movimiento === 'entrada' && payload.precio_compra != null) {
      productUpdate.$set = { precio_compra: Number(payload.precio_compra) }
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
    const movement = await InventoryMovement.findByIdAndUpdate(
      req.params.id,
      {
        ...payload,
        ...getUpdateAuditFields(req)
      },
      { new: true, runValidators: true }
    )
    if (!movement) return res.status(404).json({ ok: false, message: 'Movimiento no encontrado' })
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
