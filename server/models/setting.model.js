import mongoose from 'mongoose'

const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true }
  },
  {
    collection: 'settings',
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
)

export const Setting = mongoose.model('Setting', settingSchema)
