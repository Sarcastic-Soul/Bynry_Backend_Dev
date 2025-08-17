// models/Company.js
const mongoose = require("mongoose");

const companySchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Company", companySchema);

// models/Warehouse.js
const warehouseSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true,
  },
  name: { type: String, required: true },
  address: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

warehouseSchema.index({ companyId: 1, name: 1 }, { unique: true });
module.exports = mongoose.model("Warehouse", warehouseSchema);

// models/Product.js
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

// models/Inventory.js
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

// models/Sales.js
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

// models/Supplier.js
const supplierSchema = new mongoose.Schema({
  name: { type: String, required: true },
  contactEmail: String,
  contactPhone: String,
  address: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Supplier", supplierSchema);

// models/ProductSupplier.js
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
