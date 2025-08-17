# StockFlow Inventory Management Case Study - Complete Solution

## Part 1: Code Review & Debugging

### Issues Identified

1. **No Input Validation**
   - Missing validation for required fields
   - No data type checking
   - No bounds checking for price/quantity

2. **No Error Handling**
   - No try-catch blocks for database operations
   - Missing handling for duplicate SKUs
   - No rollback mechanism for failed transactions

3. **Race Condition Risk**
   - Two separate commits create atomicity issues
   - If second commit fails, we have orphaned product record

4. **Missing Business Logic Validation**
   - SKU uniqueness not enforced in code
   - No validation that warehouse exists
   - No validation for decimal price precision

5. **Security Issues**
   - Direct access to request data without sanitization
   - No authentication/authorization checks

6. **Poor Error Responses**
   - Generic success message regardless of actual outcome
   - No proper HTTP status codes for different scenarios

### Production Impact

- **Data Integrity**: Orphaned products if inventory creation fails
- **Duplicate SKUs**: Could break business logic and create confusion
- **System Crashes**: Unhandled exceptions could crash the service
- **Security Vulnerabilities**: Potential for injection attacks
- **Poor UX**: Users won't know why requests fail

### Corrected Implementation

```python
from flask import request, jsonify
from sqlalchemy.exc import IntegrityError
from decimal import Decimal, InvalidOperation
import logging

@app.route('/api/products', methods=['POST'])
def create_product():
    try:
        # Input validation
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        # Required field validation
        required_fields = ['name', 'sku', 'price', 'warehouse_id', 'initial_quantity']
        for field in required_fields:
            if field not in data or data[field] is None:
                return jsonify({"error": f"Missing required field: {field}"}), 400
        
        # Data type and business rule validation
        try:
            price = Decimal(str(data['price']))
            if price < 0:
                return jsonify({"error": "Price cannot be negative"}), 400
        except (InvalidOperation, ValueError):
            return jsonify({"error": "Invalid price format"}), 400
        
        initial_quantity = data['initial_quantity']
        if not isinstance(initial_quantity, int) or initial_quantity < 0:
            return jsonify({"error": "Initial quantity must be non-negative integer"}), 400
        
        # Validate warehouse exists
        warehouse = Warehouse.query.get(data['warehouse_id'])
        if not warehouse:
            return jsonify({"error": "Warehouse not found"}), 404
        
        # Start transaction
        db.session.begin()
        
        # Create product with SKU uniqueness handled by DB constraint
        product = Product(
            name=data['name'].strip(),
            sku=data['sku'].strip().upper(),  # Normalize SKU
            price=price,
            warehouse_id=data['warehouse_id']
        )
        db.session.add(product)
        db.session.flush()  # Get product ID without committing
        
        # Create inventory record
        inventory = Inventory(
            product_id=product.id,
            warehouse_id=data['warehouse_id'],
            quantity=initial_quantity
        )
        db.session.add(inventory)
        
        # Commit both operations together
        db.session.commit()
        
        return jsonify({
            "message": "Product created successfully",
            "product_id": product.id,
            "sku": product.sku
        }), 201
        
    except IntegrityError as e:
        db.session.rollback()
        if "sku" in str(e).lower():
            return jsonify({"error": "SKU already exists"}), 409
        return jsonify({"error": "Database constraint violation"}), 400
        
    except Exception as e:
        db.session.rollback()
        logging.error(f"Error creating product: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500
```

## Part 2: Database Design

### Core Schema Design

```sql
-- Companies table
CREATE TABLE companies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Warehouses table
CREATE TABLE warehouses (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id),
    name VARCHAR(255) NOT NULL,
    address TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, name)
);

-- Product categories for threshold management
CREATE TABLE product_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    default_low_stock_threshold INTEGER DEFAULT 10
);

-- Products table
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id),
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(100) NOT NULL UNIQUE,
    price DECIMAL(10,2),
    category_id INTEGER REFERENCES product_categories(id),
    is_bundle BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_products_sku (sku),
    INDEX idx_products_company (company_id)
);

-- Bundle components for products that contain other products
CREATE TABLE bundle_components (
    id SERIAL PRIMARY KEY,
    bundle_product_id INTEGER NOT NULL REFERENCES products(id),
    component_product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    UNIQUE(bundle_product_id, component_product_id)
);

-- Suppliers table
CREATE TABLE suppliers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    address TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Product-Supplier relationships
CREATE TABLE product_suppliers (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    supplier_sku VARCHAR(100),
    lead_time_days INTEGER DEFAULT 7,
    minimum_order_quantity INTEGER DEFAULT 1,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, supplier_id)
);

-- Inventory table - current stock levels
CREATE TABLE inventory (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
    quantity INTEGER NOT NULL DEFAULT 0,
    reserved_quantity INTEGER DEFAULT 0,
    low_stock_threshold INTEGER,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, warehouse_id),
    INDEX idx_inventory_product (product_id),
    INDEX idx_inventory_warehouse (warehouse_id)
);

-- Inventory movements - audit trail
CREATE TABLE inventory_movements (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
    movement_type ENUM('IN', 'OUT', 'TRANSFER', 'ADJUSTMENT') NOT NULL,
    quantity INTEGER NOT NULL,
    reference_type VARCHAR(50), -- 'SALE', 'PURCHASE', 'RETURN', etc.
    reference_id INTEGER,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER, -- user_id if available
    INDEX idx_movements_product_warehouse (product_id, warehouse_id),
    INDEX idx_movements_date (created_at)
);

-- Sales data for calculating velocity
CREATE TABLE sales (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
    quantity_sold INTEGER NOT NULL,
    sale_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_sales_product_date (product_id, sale_date),
    INDEX idx_sales_warehouse_date (warehouse_id, sale_date)
);
```

### Design Decisions

- **Compound Primary Keys vs Surrogate**: Used surrogate keys for easier referencing and future flexibility
- **Separate Movements Table**: Enables full audit trail and velocity calculations
- **Nullable Thresholds**: Allows product-specific overrides of category defaults
- **Enum for Movement Types**: Ensures data consistency while remaining extensible
- **Indexes**: Strategically placed on foreign keys and common query patterns

## Part 3: API Implementation (MERN Stack)

### Assumptions Made

1. Recent sales activity = last 30 days
2. Low stock threshold can be set per product or inherited from category
3. Stockout calculation uses simple linear projection based on 30-day velocity
4. Only active products and warehouses are considered
5. Must have at least 1 sale in recent period to qualify for alerts
6. Using MongoDB with Mongoose ODM
7. Express.js for API routing with proper middleware

### MongoDB Schema Models

```javascript
// models/Company.js
const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Company', companySchema);

// models/Warehouse.js
const warehouseSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  name: { type: String, required: true },
  address: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

warehouseSchema.index({ companyId: 1, name: 1 }, { unique: true });
module.exports = mongoose.model('Warehouse', warehouseSchema);

// models/Product.js
const productSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  name: { type: String, required: true },
  sku: { type: String, required: true, unique: true },
  price: { type: Number, min: 0 },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductCategory' },
  isBundle: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

productSchema.index({ sku: 1 });
productSchema.index({ companyId: 1 });
module.exports = mongoose.model('Product', productSchema);

// models/Inventory.js
const inventorySchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  quantity: { type: Number, required: true, default: 0 },
  reservedQuantity: { type: Number, default: 0 },
  lowStockThreshold: Number,
  updatedAt: { type: Date, default: Date.now }
});

inventorySchema.index({ productId: 1, warehouseId: 1 }, { unique: true });
module.exports = mongoose.model('Inventory', inventorySchema);

// models/Sales.js
const salesSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  quantitySold: { type: Number, required: true },
  saleDate: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
});

salesSchema.index({ productId: 1, saleDate: -1 });
salesSchema.index({ warehouseId: 1, saleDate: -1 });
module.exports = mongoose.model('Sales', salesSchema);

// models/Supplier.js
const supplierSchema = new mongoose.Schema({
  name: { type: String, required: true },
  contactEmail: String,
  contactPhone: String,
  address: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Supplier', supplierSchema);

// models/ProductSupplier.js
const productSupplierSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
  supplierSku: String,
  leadTimeDays: { type: Number, default: 7 },
  minimumOrderQuantity: { type: Number, default: 1 },
  isPrimary: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

productSupplierSchema.index({ productId: 1, supplierId: 1 }, { unique: true });
module.exports = mongoose.model('ProductSupplier', productSupplierSchema);
```

### Express.js API Implementation

```javascript
// routes/alerts.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Import models
const Company = require('../models/Company');
const Product = require('../models/Product');
const Warehouse = require('../models/Warehouse');
const Inventory = require('../models/Inventory');
const Sales = require('../models/Sales');
const Supplier = require('../models/Supplier');
const ProductSupplier = require('../models/ProductSupplier');
const ProductCategory = require('../models/ProductCategory');

// Middleware for request validation
const validateCompanyId = (req, res, next) => {
  const { companyId } = req.params;
  
  if (!mongoose.Types.ObjectId.isValid(companyId)) {
    return res.status(400).json({ error: 'Invalid company ID format' });
  }
  
  req.companyId = new mongoose.Types.ObjectId(companyId);
  next();
};

// GET /api/companies/:companyId/alerts/low-stock
router.get('/:companyId/alerts/low-stock', validateCompanyId, async (req, res) => {
  try {
    // Validate company exists
    const company = await Company.findById(req.companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Calculate date for recent sales (30 days ago)
    const recentSalesCutoff = new Date();
    recentSalesCutoff.setDate(recentSalesCutoff.getDate() - 30);

    // MongoDB aggregation pipeline for low stock alerts
    const pipeline = [
      // Stage 1: Match active products for the company
      {
        $match: {
          companyId: req.companyId,
          isActive: true,
          isBundle: false
        }
      },
      
      // Stage 2: Lookup inventory data
      {
        $lookup: {
          from: 'inventories',
          localField: '_id',
          foreignField: 'productId',
          as: 'inventory'
        }
      },
      
      // Stage 3: Unwind inventory (one record per product-warehouse)
      {
        $unwind: '$inventory'
      },
      
      // Stage 4: Lookup warehouse data
      {
        $lookup: {
          from: 'warehouses',
          let: { warehouseId: '$inventory.warehouseId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$_id', '$warehouseId'] },
                    { $eq: ['$companyId', req.companyId] },
                    { $eq: ['$isActive', true] }
                  ]
                }
              }
            }
          ],
          as: 'warehouse'
        }
      },
      
      // Stage 5: Filter out inactive warehouses
      {
        $match: {
          'warehouse.0': { $exists: true }
        }
      },
      
      // Stage 6: Lookup recent sales data
      {
        $lookup: {
          from: 'sales',
          let: { 
            productId: '$_id',
            warehouseId: '$inventory.warehouseId'
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$productId', '$productId'] },
                    { $eq: ['$warehouseId', '$warehouseId'] },
                    { $gte: ['$saleDate', recentSalesCutoff] }
                  ]
                }
              }
            },
            {
              $group: {
                _id: null,
                totalSales: { $sum: '$quantitySold' }
              }
            }
          ],
          as: 'recentSales'
        }
      },
      
      // Stage 7: Filter products with recent sales
      {
        $match: {
          'recentSales.0.totalSales': { $gt: 0 }
        }
      },
      
      // Stage 8: Lookup category for default threshold
      {
        $lookup: {
          from: 'productcategories',
          localField: 'categoryId',
          foreignField: '_id',
          as: 'category'
        }
      },
      
      // Stage 9: Lookup primary supplier
      {
        $lookup: {
          from: 'productsuppliers',
          let: { productId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$productId', '$productId'] },
                    { $eq: ['$isPrimary', true] }
                  ]
                }
              }
            },
            {
              $lookup: {
                from: 'suppliers',
                localField: 'supplierId',
                foreignField: '_id',
                as: 'supplier'
              }
            },
            {
              $unwind: '$supplier'
            }
          ],
          as: 'primarySupplier'
        }
      },
      
      // Stage 10: Project and calculate fields
      {
        $project: {
          productId: '$_id',
          productName: '$name',
          sku: 1,
          warehouseId: { $arrayElemAt: ['$warehouse._id', 0] },
          warehouseName: { $arrayElemAt: ['$warehouse.name', 0] },
          currentStock: '$inventory.quantity',
          customThreshold: '$inventory.lowStockThreshold',
          categoryThreshold: { $arrayElemAt: ['$category.defaultLowStockThreshold', 0] },
          sales30Days: { $arrayElemAt: ['$recentSales.totalSales', 0] },
          supplier: {
            $cond: {
              if: { $gt: [{ $size: '$primarySupplier' }, 0] },
              then: {
                id: { $arrayElemAt: ['$primarySupplier.supplier._id', 0] },
                name: { $arrayElemAt: ['$primarySupplier.supplier.name', 0] },
                contactEmail: { $arrayElemAt: ['$primarySupplier.supplier.contactEmail', 0] }
              },
              else: null
            }
          }
        }
      },
      
      // Stage 11: Add computed fields
      {
        $addFields: {
          threshold: {
            $cond: {
              if: { $ne: ['$customThreshold', null] },
              then: '$customThreshold',
              else: {
                $cond: {
                  if: { $ne: ['$categoryThreshold', null] },
                  then: '$categoryThreshold',
                  else: 10 // Default fallback
                }
              }
            }
          },
          dailyVelocity: {
            $cond: {
              if: { $gt: ['$sales30Days', 0] },
              then: { $divide: ['$sales30Days', 30] },
              else: 0
            }
          }
        }
      },
      
      // Stage 12: Filter for low stock items
      {
        $match: {
          $expr: { $lte: ['$currentStock', '$threshold'] }
        }
      },
      
      // Stage 13: Add days until stockout
      {
        $addFields: {
          daysUntilStockout: {
            $cond: {
              if: { $gt: ['$dailyVelocity', 0] },
              then: { $floor: { $divide: ['$currentStock', '$dailyVelocity'] } },
              else: 999
            }
          }
        }
      },
      
      // Stage 14: Final projection
      {
        $project: {
          _id: 0,
          product_id: '$productId',
          product_name: '$productName',
          sku: 1,
          warehouse_id: '$warehouseId',
          warehouse_name: '$warehouseName',
          current_stock: '$currentStock',
          threshold: 1,
          days_until_stockout: '$daysUntilStockout',
          supplier: 1
        }
      },
      
      // Stage 15: Sort by urgency (lowest days until stockout first)
      {
        $sort: { days_until_stockout: 1 }
      }
    ];

    // Execute aggregation
    const alerts = await Product.aggregate(pipeline);

    res.json({
      alerts,
      total_alerts: alerts.length
    });

  } catch (error) {
    console.error('Error fetching low stock alerts:', error);
    
    // Handle specific MongoDB errors
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid data format' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/inventory/:inventoryId/threshold
router.put('/inventory/:inventoryId/threshold', async (req, res) => {
  try {
    const { inventoryId } = req.params;
    const { threshold } = req.body;

    // Validate inventory ID format
    if (!mongoose.Types.ObjectId.isValid(inventoryId)) {
      return res.status(400).json({ error: 'Invalid inventory ID format' });
    }

    // Validate threshold
    if (typeof threshold !== 'number' || threshold < 0 || !Number.isInteger(threshold)) {
      return res.status(400).json({ error: 'Threshold must be non-negative integer' });
    }

    // Update inventory threshold
    const inventory = await Inventory.findByIdAndUpdate(
      inventoryId,
      { 
        lowStockThreshold: threshold,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!inventory) {
      return res.status(404).json({ error: 'Inventory record not found' });
    }

    res.json({ 
      message: 'Threshold updated successfully',
      inventory: {
        id: inventory._id,
        threshold: inventory.lowStockThreshold
      }
    });

  } catch (error) {
    console.error('Error updating threshold:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
```

### Express App Setup

```javascript
// app.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const alertsRouter = require('./routes/alerts');

const app = express();

// Middleware
app.use(helmet()); // Security headers
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

// Routes
app.use('/api/companies', alertsRouter);

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
```

### Edge Cases Handled

1. **No Sales Data**: MongoDB aggregation filters out products without recent sales
2. **Missing Suppliers**: Conditional projection handles null supplier gracefully
3. **Zero Velocity**: Days until stockout defaults to 999 (effectively infinite)
4. **Missing Thresholds**: Cascading fallback: custom → category → default (10)
5. **Inactive Records**: Pipeline filters out inactive products and warehouses
6. **Invalid ObjectIds**: Middleware validates MongoDB ObjectId format
7. **Large Result Sets**: Aggregation pipeline is optimized and sortable

### Performance Considerations

1. **Single Aggregation Pipeline**: Eliminates multiple database round trips
2. **Strategic Indexing**: Compound indexes on frequently queried fields
3. **Pipeline Optimization**: Early filtering reduces documents in later stages
4. **Memory Efficiency**: Uses MongoDB's native aggregation framework
5. **Connection Pooling**: Mongoose handles connection pooling automatically

### MERN Stack Advantages

1. **MongoDB Aggregation**: Powerful for complex queries with multiple collections
2. **Flexible Schema**: Easy to adapt to changing business requirements  
3. **JSON Native**: No object-relational mapping overhead
4. **Horizontal Scaling**: MongoDB sharding for large datasets
5. **Real-time Capabilities**: Easy integration with Socket.io for live alerts

### Alternative Approaches Considered

1. **Multiple Queries**: More readable but less efficient
2. **GraphQL with DataLoader**: Better for complex frontend requirements
3. **Redis Caching**: Pre-computed alerts for high-traffic scenarios
4. **Event-Driven Architecture**: Real-time inventory updates with message queues
