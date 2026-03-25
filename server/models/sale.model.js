import mongoose from 'mongoose'

const saleSchema = new mongoose.Schema(
  {
    cliente_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      default: null
    },
    vendedor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    fecha: { type: Date, default: Date.now },
    total: { type: Number, required: true, min: 0 },
    estado: {
      type: String,
      enum: ['activa', 'anulada'],
      default: 'activa'
    },
    metodo_pago: { type: String, trim: true, default: '' },
    observacion: { type: String, default: '' },
    motivo_anulacion: { type: String, default: '' },
    created_by_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    created_by_username: { type: String, default: 'system' },
    created_from_ip: { type: String, default: '' },
    updated_by_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updated_by_username: { type: String, default: 'system' },
    updated_from_ip: { type: String, default: '' }
  },
  {
    collection: 'sales',
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
)

saleSchema.index({ fecha: -1 })
saleSchema.index({ cliente_id: 1, fecha: -1 })
saleSchema.index({ estado: 1, fecha: -1 })

export const Sale = mongoose.model('Sale', saleSchema)
