import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import apiRouter from './routes/index.js'
import { connectMongo, disconnectMongo } from './db/mongoose.js'

const app = express()
const port = Number(process.env.API_PORT || 4000)

app.use(cors())
app.use(express.json())

app.use('/api', apiRouter)

app.use((error, _req, res, next) => {
  console.error(error)

  if (res.headersSent) {
    return next(error)
  }

  res.status(500).json({ ok: false, message: 'Error interno del servidor' })
})

async function bootstrap() {
  await connectMongo(process.env.MONGODB_URI)

  app.listen(port, () => {
    console.log(`API lista en http://localhost:${port}`)
  })
}

bootstrap().catch((error) => {
  console.error('No se pudo iniciar la API:', error.message)
  process.exit(1)
})

process.on('SIGINT', async () => {
  await disconnectMongo()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await disconnectMongo()
  process.exit(0)
})
