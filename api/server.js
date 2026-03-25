/**
 * Vercel serverless catch-all handler.
 * Wraps the full Express app so all /api/* routes work the same
 * as in local development.
 */
import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import apiRouter from '../server/routes/index.js'
import { connectMongo } from '../server/db/mongoose.js'

const app = express()

app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use('/api', apiRouter)

// Error handler
app.use((error, _req, res, _next) => {
  console.error('[API Error]', error?.message || error)
  res.status(500).json({ ok: false, message: 'Error interno del servidor' })
})

// Keep a single DB connection alive across warm invocations
let _dbReady = false
async function ensureDb() {
  if (_dbReady) return
  await connectMongo(process.env.MONGODB_URI)
  _dbReady = true
}

export default async function handler(req, res) {
  try {
    await ensureDb()
  } catch (err) {
    console.error('[DB Connection Error]', err?.message)
    return res.status(503).json({ ok: false, message: 'No se pudo conectar a la base de datos' })
  }

  // Let Express handle the request
  return new Promise((resolve) => {
    app(req, res, resolve)
  })
}
