const salesSchema = new mongoose.Schema({
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
  quantitySold: { type: Number, required: true },
  saleDate: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

salesSchema.index({ productId: 1, saleDate: -1 });
salesSchema.index({ warehouseId: 1, saleDate: -1 });
module.exports = mongoose.model("Sales", salesSchema);
