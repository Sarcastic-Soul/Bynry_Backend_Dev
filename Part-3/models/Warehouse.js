const warehouseSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  name: { type: String, required: true },
  address: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

warehouseSchema.index({ companyId: 1, name: 1 }, { unique: true });
module.exports = mongoose.model('Warehouse', warehouseSchema);