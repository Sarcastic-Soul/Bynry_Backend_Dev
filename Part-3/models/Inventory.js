const inventorySchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Warehouse",
    required: true,
  },
  quantity: { type: Number, required: true, default: 0 },
  reservedQuantity: { type: Number, default: 0 },
  lowStockThreshold: Number,
  updatedAt: { type: Date, default: Date.now },
});

inventorySchema.index({ productId: 1, warehouseId: 1 }, { unique: true });
module.exports = mongoose.model("Inventory", inventorySchema);
