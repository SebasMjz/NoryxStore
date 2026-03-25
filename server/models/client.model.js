import mongoose from 'mongoose'

const clientSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    celular: { type: String, trim: true, default: '' },
    created_by_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    created_by_username: { type: String, default: 'system' },
    created_from_ip: { type: String, default: '' },
    updated_by_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updated_by_username: { type: String, default: 'system' },
    updated_from_ip: { type: String, default: '' }
  },
  {
    collection: 'clients',
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
)

export const Client = mongoose.model('Client', clientSchema)
