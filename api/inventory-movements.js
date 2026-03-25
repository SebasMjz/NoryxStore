import { InventoryMovement } from '../server/models/index.js'
import { ensureDbConnection } from './_lib/db.js'

export default async function handler(_req, res) {
  try {
    await ensureDbConnection()

    const movements = await InventoryMovement.find()
      .populate('producto_id', 'nombre codigo')
      .populate('usuario_id', 'nombre tipo_usuario')
      .sort({ fecha: -1 })
      .limit(100)

    res.status(200).json(movements)
  } catch (error) {
    console.error('Error en /api/inventory-movements:', error)
    res.status(500).json({ ok: false, message: 'Error interno del servidor' })
  }
}
