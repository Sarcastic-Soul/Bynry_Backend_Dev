const productSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true,
  },
  name: { type: String, required: true },
  sku: { type: String, required: true, unique: true },
  price: { type: Number, min: 0 },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "ProductCategory" },
  isBundle: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

productSchema.index({ sku: 1 });
productSchema.index({ companyId: 1 });
module.exports = mongoose.model("Product", productSchema);
