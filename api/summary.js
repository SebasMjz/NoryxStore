import {
  Client,
  InventoryMovement,
  Product,
  Sale,
  SaleDetail,
  User
} from '../server/models/index.js'
import { ensureDbConnection } from './_lib/db.js'

export default async function handler(_req, res) {
  try {
    await ensureDbConnection()

    const [users, clients, products, sales, saleDetails, movements] = await Promise.all([
      User.countDocuments(),
      Client.countDocuments(),
      Product.countDocuments(),
      Sale.countDocuments(),
      SaleDetail.countDocuments(),
      InventoryMovement.countDocuments()
    ])

    res.status(200).json({
      users,
      clients,
      products,
      sales,
      sale_details: saleDetails,
      inventory_movements: movements
    })
  } catch (error) {
    console.error('Error en /api/summary:', error)
    res.status(500).json({ ok: false, message: 'Error interno del servidor' })
  }
}
