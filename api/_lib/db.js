import { connectMongo } from '../../server/db/mongoose.js'

let cachedConnection = null

export async function ensureDbConnection() {
  if (cachedConnection && cachedConnection.readyState === 1) {
    return cachedConnection
  }

  cachedConnection = await connectMongo(process.env.MONGODB_URI)
  return cachedConnection
}
