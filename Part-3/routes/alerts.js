// routes/alerts.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

// Import models
const Company = require("../models/Company");
const Product = require("../models/Product");
const Warehouse = require("../models/Warehouse");
const Inventory = require("../models/Inventory");
const Sales = require("../models/Sales");
const Supplier = require("../models/Supplier");
const ProductSupplier = require("../models/ProductSupplier");
const ProductCategory = require("../models/ProductCategory");

// Middleware for request validation
const validateCompanyId = (req, res, next) => {
  const { companyId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(companyId)) {
    return res.status(400).json({ error: "Invalid company ID format" });
  }

  req.companyId = new mongoose.Types.ObjectId(companyId);
  next();
};

// GET /api/companies/:companyId/alerts/low-stock
router.get(
  "/:companyId/alerts/low-stock",
  validateCompanyId,
  async (req, res) => {
    try {
      // Validate company exists
      const company = await Company.findById(req.companyId);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
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
            isBundle: false,
          },
        },

        // Stage 2: Lookup inventory data
        {
          $lookup: {
            from: "inventories",
            localField: "_id",
            foreignField: "productId",
            as: "inventory",
          },
        },

        // Stage 3: Unwind inventory (one record per product-warehouse)
        {
          $unwind: "$inventory",
        },

        // Stage 4: Lookup warehouse data
        {
          $lookup: {
            from: "warehouses",
            let: { warehouseId: "$inventory.warehouseId" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$_id", "$warehouseId"] },
                      { $eq: ["$companyId", req.companyId] },
                      { $eq: ["$isActive", true] },
                    ],
                  },
                },
              },
            ],
            as: "warehouse",
          },
        },

        // Stage 5: Filter out inactive warehouses
        {
          $match: {
            "warehouse.0": { $exists: true },
          },
        },

        // Stage 6: Lookup recent sales data
        {
          $lookup: {
            from: "sales",
            let: {
              productId: "$_id",
              warehouseId: "$inventory.warehouseId",
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$productId", "$productId"] },
                      { $eq: ["$warehouseId", "$warehouseId"] },
                      { $gte: ["$saleDate", recentSalesCutoff] },
                    ],
                  },
                },
              },
              {
                $group: {
                  _id: null,
                  totalSales: { $sum: "$quantitySold" },
                },
              },
            ],
            as: "recentSales",
          },
        },

        // Stage 7: Filter products with recent sales
        {
          $match: {
            "recentSales.0.totalSales": { $gt: 0 },
          },
        },

        // Stage 8: Lookup category for default threshold
        {
          $lookup: {
            from: "productcategories",
            localField: "categoryId",
            foreignField: "_id",
            as: "category",
          },
        },

        // Stage 9: Lookup primary supplier
        {
          $lookup: {
            from: "productsuppliers",
            let: { productId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$productId", "$productId"] },
                      { $eq: ["$isPrimary", true] },
                    ],
                  },
                },
              },
              {
                $lookup: {
                  from: "suppliers",
                  localField: "supplierId",
                  foreignField: "_id",
                  as: "supplier",
                },
              },
              {
                $unwind: "$supplier",
              },
            ],
            as: "primarySupplier",
          },
        },

        // Stage 10: Project and calculate fields
        {
          $project: {
            productId: "$_id",
            productName: "$name",
            sku: 1,
            warehouseId: { $arrayElemAt: ["$warehouse._id", 0] },
            warehouseName: { $arrayElemAt: ["$warehouse.name", 0] },
            currentStock: "$inventory.quantity",
            customThreshold: "$inventory.lowStockThreshold",
            categoryThreshold: {
              $arrayElemAt: ["$category.defaultLowStockThreshold", 0],
            },
            sales30Days: { $arrayElemAt: ["$recentSales.totalSales", 0] },
            supplier: {
              $cond: {
                if: { $gt: [{ $size: "$primarySupplier" }, 0] },
                then: {
                  id: { $arrayElemAt: ["$primarySupplier.supplier._id", 0] },
                  name: { $arrayElemAt: ["$primarySupplier.supplier.name", 0] },
                  contactEmail: {
                    $arrayElemAt: ["$primarySupplier.supplier.contactEmail", 0],
                  },
                },
                else: null,
              },
            },
          },
        },

        // Stage 11: Add computed fields
        {
          $addFields: {
            threshold: {
              $cond: {
                if: { $ne: ["$customThreshold", null] },
                then: "$customThreshold",
                else: {
                  $cond: {
                    if: { $ne: ["$categoryThreshold", null] },
                    then: "$categoryThreshold",
                    else: 10, // Default fallback
                  },
                },
              },
            },
            dailyVelocity: {
              $cond: {
                if: { $gt: ["$sales30Days", 0] },
                then: { $divide: ["$sales30Days", 30] },
                else: 0,
              },
            },
          },
        },

        // Stage 12: Filter for low stock items
        {
          $match: {
            $expr: { $lte: ["$currentStock", "$threshold"] },
          },
        },

        // Stage 13: Add days until stockout
        {
          $addFields: {
            daysUntilStockout: {
              $cond: {
                if: { $gt: ["$dailyVelocity", 0] },
                then: {
                  $floor: { $divide: ["$currentStock", "$dailyVelocity"] },
                },
                else: 999,
              },
            },
          },
        },

        // Stage 14: Final projection
        {
          $project: {
            _id: 0,
            product_id: "$productId",
            product_name: "$productName",
            sku: 1,
            warehouse_id: "$warehouseId",
            warehouse_name: "$warehouseName",
            current_stock: "$currentStock",
            threshold: 1,
            days_until_stockout: "$daysUntilStockout",
            supplier: 1,
          },
        },

        // Stage 15: Sort by urgency (lowest days until stockout first)
        {
          $sort: { days_until_stockout: 1 },
        },
      ];

      // Execute aggregation
      const alerts = await Product.aggregate(pipeline);

      res.json({
        alerts,
        total_alerts: alerts.length,
      });
    } catch (error) {
      console.error("Error fetching low stock alerts:", error);

      // Handle specific MongoDB errors
      if (error.name === "CastError") {
        return res.status(400).json({ error: "Invalid data format" });
      }

      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PUT /api/inventory/:inventoryId/threshold
router.put("/inventory/:inventoryId/threshold", async (req, res) => {
  try {
    const { inventoryId } = req.params;
    const { threshold } = req.body;

    // Validate inventory ID format
    if (!mongoose.Types.ObjectId.isValid(inventoryId)) {
      return res.status(400).json({ error: "Invalid inventory ID format" });
    }

    // Validate threshold
    if (
      typeof threshold !== "number" ||
      threshold < 0 ||
      !Number.isInteger(threshold)
    ) {
      return res
        .status(400)
        .json({ error: "Threshold must be non-negative integer" });
    }

    // Update inventory threshold
    const inventory = await Inventory.findByIdAndUpdate(
      inventoryId,
      {
        lowStockThreshold: threshold,
        updatedAt: new Date(),
      },
      { new: true },
    );

    if (!inventory) {
      return res.status(404).json({ error: "Inventory record not found" });
    }

    res.json({
      message: "Threshold updated successfully",
      inventory: {
        id: inventory._id,
        threshold: inventory.lowStockThreshold,
      },
    });
  } catch (error) {
    console.error("Error updating threshold:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
