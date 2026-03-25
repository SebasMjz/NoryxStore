import mongoose from 'mongoose'

export async function connectMongo(uri) {
  if (!uri) {
    throw new Error('MONGODB_URI no esta configurado en el entorno')
  }

  mongoose.set('strictQuery', true)
  await mongoose.connect(uri, {
    dbName: 'inventario_ventas'
  })

  return mongoose.connection
}

export async function disconnectMongo() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }
}
