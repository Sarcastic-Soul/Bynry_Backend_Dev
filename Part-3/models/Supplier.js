const supplierSchema = new mongoose.Schema({
  name: { type: String, required: true },
  contactEmail: String,
  contactPhone: String,
  address: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Supplier", supplierSchema);
