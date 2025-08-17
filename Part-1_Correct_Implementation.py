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
