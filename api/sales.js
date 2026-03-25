import { Sale } from '../server/models/index.js'
import { ensureDbConnection } from './_lib/db.js'

export default async function handler(_req, res) {
  try {
    await ensureDbConnection()

    const sales = await Sale.find()
      .populate('cliente_id', 'nombre celular')
      .populate('vendedor_id', 'nombre tipo_usuario')
      .sort({ fecha: -1 })
      .limit(100)

    res.status(200).json(sales)
  } catch (error) {
    console.error('Error en /api/sales:', error)
    res.status(500).json({ ok: false, message: 'Error interno del servidor' })
  }
}
