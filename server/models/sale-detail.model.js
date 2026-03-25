import mongoose from 'mongoose'

const saleDetailSchema = new mongoose.Schema(
  {
    venta_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sale',
      required: true
    },
    producto_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    cantidad: { type: Number, required: true, min: 1 },
    precio_unitario: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, min: 0 }
  },
  {
    collection: 'sale_details',
    timestamps: {
      createdAt: 'created_at',
      updatedAt: false
    }
  }
)

export const SaleDetail = mongoose.model('SaleDetail', saleDetailSchema)
