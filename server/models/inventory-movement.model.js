import mongoose from 'mongoose'

const inventoryMovementSchema = new mongoose.Schema(
  {
    producto_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    cliente_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      default: null
    },
    tipo_movimiento: {
      type: String,
      enum: ['entrada', 'salida'],
      required: true
    },
    cantidad: { type: Number, required: true },
    precio_compra: { type: Number, default: null },
    /** Precio de venta aplicado en esta entrada (actualiza el producto). */
    precio_venta: { type: Number, default: null },
    motivo: {
      type: String,
      // Entradas: compra | reposicion | consignacion_devolucion
      // Salidas: venta | ajuste_manual | consignacion_envio
      enum: [
        'compra',
        'reposicion',
        'venta',
        'ajuste_manual',
        'consignacion_envio',
        'consignacion_devolucion'
      ],
      required: true
    },
    referencia_id: { type: mongoose.Schema.Types.ObjectId },
    usuario_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    observacion: { type: String, default: '' },
    fecha: { type: Date, default: Date.now },
    /** Mismo id en todas las líneas creadas en un solo envío (varios productos). */
    transaccion_id: { type: mongoose.Schema.Types.ObjectId, default: null, index: true }
  },
  {
    collection: 'inventory_movements',
    timestamps: {
      createdAt: 'created_at',
      updatedAt: false
    }
  }
)

inventoryMovementSchema.index({ fecha: -1 })
inventoryMovementSchema.index({ producto_id: 1, fecha: -1 })
inventoryMovementSchema.index({ cliente_id: 1, fecha: -1 })
inventoryMovementSchema.index({ transaccion_id: 1, fecha: -1 })

export const InventoryMovement = mongoose.model('InventoryMovement', inventoryMovementSchema)
