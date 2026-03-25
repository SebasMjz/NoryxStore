import { User } from '../server/models/index.js'
import { ensureDbConnection } from './_lib/db.js'

export default async function handler(_req, res) {
  try {
    await ensureDbConnection()

    const users = await User.find(
      {},
      'nombre username celular tipo_usuario activo created_at updated_at'
    )
      .sort({ created_at: -1 })
      .limit(100)

    res.status(200).json(users)
  } catch (error) {
    console.error('Error en /api/users:', error)
    res.status(500).json({ ok: false, message: 'Error interno del servidor' })
  }
}
