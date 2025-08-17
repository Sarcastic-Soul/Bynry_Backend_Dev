const productSupplierSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Supplier",
    required: true,
  },
  supplierSku: String,
  leadTimeDays: { type: Number, default: 7 },
  minimumOrderQuantity: { type: Number, default: 1 },
  isPrimary: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

productSupplierSchema.index({ productId: 1, supplierId: 1 }, { unique: true });
module.exports = mongoose.model("ProductSupplier", productSupplierSchema);
