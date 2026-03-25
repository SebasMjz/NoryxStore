import mongoose from 'mongoose'

const categorySchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true, unique: true },
    descripcion: { type: String, default: '' },
    activo: { type: Boolean, default: true },
    created_by_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    created_by_username: { type: String, default: 'system' },
    updated_by_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updated_by_username: { type: String, default: 'system' }
  },
  {
    collection: 'categories',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
  }
)

export const Category = mongoose.model('Category', categorySchema)
