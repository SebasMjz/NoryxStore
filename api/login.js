import { User } from '../server/models/index.js'
import { ensureDbConnection } from './_lib/db.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Metodo no permitido' })
  }

  try {
    await ensureDbConnection()

    const { username, password } = req.body || {}

    if (!username || !password) {
      return res.status(400).json({ ok: false, message: 'Usuario y contrasena son requeridos' })
    }

    const user = await User.findOne({ username, activo: true })

    if (!user || user.password_hash !== password) {
      return res.status(401).json({ ok: false, message: 'Credenciales invalidas' })
    }

    return res.status(200).json({
      ok: true,
      user: {
        id: user._id,
        nombre: user.nombre,
        username: user.username,
        tipo_usuario: user.tipo_usuario
      }
    })
  } catch (error) {
    console.error('Error en /api/login:', error)
    return res.status(500).json({ ok: false, message: 'Error interno del servidor' })
  }
}
