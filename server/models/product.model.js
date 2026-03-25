import mongoose from 'mongoose'

const productSchema = new mongoose.Schema(
  {
    categoria_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    codigo: { type: String, required: true, trim: true, unique: true },
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String, default: '' },
    precio_compra: { type: Number, default: 0, min: 0 },
    precio_venta: { type: Number, required: true, min: 0 },
    stock: { type: Number, default: 0 },
    activo: { type: Boolean, default: true },
    created_by_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    created_by_username: { type: String, default: 'system' },
    created_from_ip: { type: String, default: '' },
    updated_by_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updated_by_username: { type: String, default: 'system' },
    updated_from_ip: { type: String, default: '' }
  },
  {
    collection: 'products',
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
)

productSchema.index({ activo: 1, nombre: 1 })
productSchema.index({ categoria_id: 1 })

export const Product = mongoose.model('Product', productSchema)
