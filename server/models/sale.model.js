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
    /** Suma de subtotales de líneas antes del descuento */
    subtotal: { type: Number, default: 0, min: 0 },
    /** Descuento global sobre la venta (monto fijo) */
    descuento_monto: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    /** Número de comprobante visible (1, 2, 3…), único por tienda */
    numero_comprobante: { type: Number, default: null, min: 1, sparse: true, unique: true },
    estado: {
      type: String,
      enum: ['activa', 'anulada'],
      default: 'activa'
    },
    metodo_pago: { type: String, trim: true, default: '' },
    /** Desglose cuando el cliente paga con varios medios a la vez (suma = total) */
    pagos_mixtos: {
      type: [
        {
          metodo: { type: String, trim: true, required: true },
          monto: { type: Number, required: true, min: 0 }
        }
      ],
      default: undefined
    },
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
