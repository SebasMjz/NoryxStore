import mongoose from 'mongoose'

const salePaymentSchema = new mongoose.Schema(
  {
    venta_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sale',
      required: true
    },
    cliente_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true
    },
    monto: { type: Number, required: true, min: 0.01 },
    metodo_pago: { type: String, trim: true, default: '' },
    observacion: { type: String, default: '' },
    fecha: { type: Date, default: Date.now },
    created_by_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    created_by_username: { type: String, default: 'system' },
    created_from_ip: { type: String, default: '' },
    updated_by_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updated_by_username: { type: String, default: 'system' },
    updated_from_ip: { type: String, default: '' }
  },
  {
    collection: 'sale_payments',
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
)

salePaymentSchema.index({ venta_id: 1, fecha: -1 })
salePaymentSchema.index({ cliente_id: 1, fecha: -1 })

export const SalePayment = mongoose.model('SalePayment', salePaymentSchema)
