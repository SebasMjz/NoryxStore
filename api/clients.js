import { Client } from '../server/models/index.js'
import { ensureDbConnection } from './_lib/db.js'

export default async function handler(_req, res) {
  try {
    await ensureDbConnection()
    const clients = await Client.find().sort({ created_at: -1 }).limit(100)
    res.status(200).json(clients)
  } catch (error) {
    console.error('Error en /api/clients:', error)
    res.status(500).json({ ok: false, message: 'Error interno del servidor' })
  }
}
