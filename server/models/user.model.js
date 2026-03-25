import mongoose from 'mongoose'

const userSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    username: { type: String, required: true, trim: true, unique: true },
    password_hash: { type: String, required: true },
    celular: { type: String, trim: true, default: '' },
    tipo_usuario: {
      type: String,
      enum: ['admin', 'vendedor'],
      required: true
    },
    activo: { type: Boolean, default: true },
    created_by_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    created_by_username: { type: String, default: 'system' },
    created_from_ip: { type: String, default: '' },
    updated_by_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updated_by_username: { type: String, default: 'system' },
    updated_from_ip: { type: String, default: '' }
  },
  {
    collection: 'users',
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
)

export const User = mongoose.model('User', userSchema)
