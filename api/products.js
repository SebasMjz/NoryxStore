import { Product } from '../server/models/index.js'
import { ensureDbConnection } from './_lib/db.js'

export default async function handler(_req, res) {
  try {
    await ensureDbConnection()
    const products = await Product.find().sort({ created_at: -1 }).limit(100)
    res.status(200).json(products)
  } catch (error) {
    console.error('Error en /api/products:', error)
    res.status(500).json({ ok: false, message: 'Error interno del servidor' })
  }
}
