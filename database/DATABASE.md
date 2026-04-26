# 📊 HR Store Database Documentation

**Last Updated**: April 26, 2026  
**Database**: PostgreSQL (evolution_db)  
**Status**: Production Ready

---

## 📑 Table of Contents

1. [Overview](#overview)
2. [Database Architecture](#database-architecture)
3. [Tables Reference](#tables-reference)
4. [Relationships & Foreign Keys](#relationships--foreign-keys)
5. [Indexes & Performance](#indexes--performance)
6. [Views](#views)
7. [Data Integrity Constraints](#data-integrity-constraints)
8. [Backup & Recovery](#backup--recovery)
9. [Common Queries](#common-queries)
10. [ERD Diagram](#erd-diagram)

---

## Overview

The HR Store database manages:
- **Products & Variants**: 78 SKUs with color/size combinations
- **Customers**: WhatsApp-based CRM
- **Orders**: Purchase tracking and payment status
- **Audit Logs**: Compliance and action tracking

**Environment**: `DATABASE_URL=postgresql://evolution:suasenha_segura@localhost:5432/evolution_db`

---

## Database Architecture

```
┌─────────────────────────────────┐
│         CATEGORIES              │
│  (Product classification)       │
└──────────────┬──────────────────┘
               │
               │ 1:N
               ↓
┌─────────────────────────────────┐      ┌──────────────────────────┐
│         PRODUCTS                │◄─────┤  PRODUCT_VARIANTS        │
│  (Base product info)            │ 1:N  │  (Color × Size × Stock)  │
└──────────────┬──────────────────┘      └──────────────────────────┘
               │                                    
               │                          ┌──────────────────────────┐
               │                          │  CUSTOMERS               │
               │                          │  (WhatsApp CRM)          │
               │                          └──────────────┬───────────┘
               │                                        │
               │                          ┌─────────────┘
               │                          │
               │                          ↓ 1:N
               │      ┌──────────────────────────────┐
               └─────►│        ORDERS                │
                      │  (Purchases & payments)      │
                      └──────────────────────────────┘


AUDIT_LOGS (Separate - Compliance tracking)
```

---

## Tables Reference

### 1️⃣ PRODUCTS

| Column | Type | Constraint | Default | Description |
|--------|------|-----------|---------|-------------|
| **id** | SERIAL | PRIMARY KEY | - | Unique product identifier |
| **category_id** | INTEGER | FK → categories.id | NULL | Product category |
| **name** | VARCHAR(255) | NOT NULL | - | Product display name |
| **description** | TEXT | - | NULL | Long product description |
| **base_price** | NUMERIC(12,2) | NOT NULL | - | Base price in EUR |
| **image_placeholder_url** | VARCHAR(500) | - | NULL | Product image URL |
| **is_active** | BOOLEAN | - | true | Soft delete / visibility |
| **created_at** | TIMESTAMP | - | CURRENT_TIMESTAMP | Creation timestamp |

**Indexes**:
- `idx_products_category_id` - Fast category lookups
- `idx_products_is_active` - Filter active products

**Indexes**:
```sql
CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_is_active ON products(is_active);
```

---

### 2️⃣ PRODUCT_VARIANTS

| Column | Type | Constraint | Default | Description |
|--------|------|-----------|---------|-------------|
| **id** | SERIAL | PRIMARY KEY | - | Variant identifier |
| **product_id** | INTEGER | FK → products.id | - | Parent product |
| **sku** | VARCHAR(100) | UNIQUE, NOT NULL | - | Stock Keeping Unit (e.g., `TEE-RED-M`) |
| **color** | VARCHAR(50) | - | NULL | Color variation |
| **size** | VARCHAR(20) | - | NULL | Size variation (XS, S, M, L, XL) |
| **stock_quantity** | INTEGER | - | 0 | Available inventory |
| **created_at** | TIMESTAMP | - | CURRENT_TIMESTAMP | Creation timestamp |

**Indexes**:
```sql
CREATE INDEX idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX idx_product_variants_sku ON product_variants(sku);
CREATE INDEX idx_product_variants_color_size ON product_variants(color, size);
```

**Example SKUs**:
- `TEE-BLACK-S` → T-shirt, Black, Small
- `PANTS-BLUE-L` → Pants, Blue, Large
- `HAT-WHITE-OS` → Hat, White, One Size

---

### 3️⃣ CUSTOMERS

| Column | Type | Constraint | Default | Description |
|--------|------|-----------|---------|-------------|
| **id** | SERIAL | PRIMARY KEY | - | Customer identifier |
| **full_name** | VARCHAR(255) | - | NULL | Customer name (auto-filled by AI) |
| **whatsapp_number** | VARCHAR(20) | UNIQUE, NOT NULL | - | WhatsApp contact (format: +351912345678) |
| **email** | VARCHAR(255) | - | NULL | Email address |
| **total_orders** | INTEGER | - | 0 | Count of orders placed |
| **created_at** | TIMESTAMP | - | CURRENT_TIMESTAMP | Registration timestamp |

**Constraints**:
```sql
CHECK (whatsapp_number ~ '^\+?[0-9]{10,15}$')
```

**Indexes**:
```sql
CREATE INDEX idx_customers_whatsapp_number ON customers(whatsapp_number);
CREATE INDEX idx_customers_created_at ON customers(created_at);
```

**Key Features**:
- WhatsApp number is the primary identifier for the CRM
- Auto-registered when customer interacts via Evolution API
- Denormalized `total_orders` for performance

---

### 4️⃣ ORDERS

| Column | Type | Constraint | Default | Description |
|--------|------|-----------|---------|-------------|
| **id** | SERIAL | PRIMARY KEY | - | Order identifier |
| **customer_id** | INTEGER | FK → customers.id | NULL | Customer reference |
| **total_amount** | NUMERIC(12,2) | NOT NULL | - | Total order value in EUR |
| **payment_method** | VARCHAR(50) | - | NULL | Payment type (stripe, manual, etc.) |
| **status** | VARCHAR(50) | CHECK IN (valid statuses) | 'aguardando_pagamento' | Order state |
| **origin** | VARCHAR(50) | - | NULL | Order source (whatsapp, website) |
| **stripe_link_id** | VARCHAR(500) | - | NULL | Stripe payment link reference |
| **created_at** | TIMESTAMP | - | CURRENT_TIMESTAMP | Order timestamp |

**Valid Status Values**:
- `aguardando_pagamento` - Awaiting payment confirmation
- `pago` - Payment confirmed
- `enviado` - Shipped to customer
- `entregue` - Delivered
- `cancelado` - Order cancelled

**Indexes**:
```sql
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_orders_stripe_link_id ON orders(stripe_link_id);
```

---

### 5️⃣ AUDIT_LOGS

| Column | Type | Constraint | Default | Description |
|--------|------|-----------|---------|-------------|
| **id** | SERIAL | PRIMARY KEY | - | Log entry identifier |
| **admin_user** | VARCHAR(255) | - | NULL | Admin who performed action |
| **action** | VARCHAR(255) | - | NULL | Action type (UPDATE_PRICE, CONFIRM_ORDER, etc.) |
| **details** | JSONB | - | NULL | Flexible action metadata |
| **created_at** | TIMESTAMP | - | CURRENT_TIMESTAMP | Timestamp of action |

**Indexes**:
```sql
CREATE INDEX idx_audit_logs_admin_user ON audit_logs(admin_user);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_details ON audit_logs USING GIN(details);
```

**Example Entry**:
```json
{
  "admin_user": "heitor",
  "action": "CONFIRM_ORDER",
  "details": {
    "order_id": 42,
    "customer_whatsapp": "351912345678",
    "sku": "TEE-BLACK-M",
    "quantity": 2,
    "new_stock": 18
  },
  "created_at": "2026-04-26T14:30:00Z"
}
```

---

### 6️⃣ CATEGORIES

| Column | Type | Constraint | Default | Description |
|--------|------|-----------|---------|-------------|
| **id** | SERIAL | PRIMARY KEY | - | Category identifier |
| **name** | VARCHAR(100) | UNIQUE, NOT NULL | - | Category name |
| **description** | TEXT | - | NULL | Category description |
| **created_at** | TIMESTAMP | - | CURRENT_TIMESTAMP | Creation timestamp |

---

## Relationships & Foreign Keys

### One-to-Many Relationships

```
categories (1) ──────→ (N) products
  - A category contains multiple products
  - ON DELETE SET NULL → Products remain but category reference clears

products (1) ──────→ (N) product_variants
  - A product has multiple variants (colors × sizes)
  - ON DELETE CASCADE → Deleting product deletes all variants

customers (1) ──────→ (N) orders
  - A customer can have multiple orders
  - ON DELETE SET NULL → Orders kept for audit, customer reference clears
```

---

## Indexes & Performance

### Index Strategy

| Table | Index | Type | Purpose |
|-------|-------|------|---------|
| products | category_id | B-Tree | Filter by category |
| products | is_active | B-Tree | Show/hide products |
| product_variants | product_id | B-Tree | Get variants for product |
| product_variants | sku | UNIQUE | Fast SKU lookups |
| product_variants | (color, size) | Composite | Search by attributes |
| customers | whatsapp_number | UNIQUE | Primary CRM identifier |
| customers | created_at | B-Tree | Recent customers |
| orders | customer_id | B-Tree | Get customer orders |
| orders | status | B-Tree | Filter by status (pending, paid, etc.) |
| orders | created_at | B-Tree | Recent orders |
| orders | stripe_link_id | B-Tree | Stripe reconciliation |
| audit_logs | admin_user | B-Tree | User action tracking |
| audit_logs | action | B-Tree | Action type filtering |
| audit_logs | created_at | B-Tree | Timeline queries |
| audit_logs | details | GIN | JSON search capability |

---

## Views

### 1. customer_order_summary

**Purpose**: 360° customer view for CRM  
**Refresh**: Real-time (view queries tables directly)

```sql
SELECT 
  c.id,
  c.full_name,
  c.whatsapp_number,
  c.email,
  total_orders_placed,
  lifetime_value,
  last_order_date,
  customer_since
FROM customer_order_summary
WHERE customer_since > NOW() - INTERVAL '30 days';
```

**Columns**:
- `total_orders_placed` - Count of all orders
- `lifetime_value` - Sum of order amounts
- `last_order_date` - Most recent purchase
- `customer_since` - Registration date

---

### 2. product_stock_status

**Purpose**: Inventory monitoring  
**Status Values**:
- `out_of_stock` - Quantity = 0
- `low_stock` - Quantity < 5
- `in_stock` - Quantity ≥ 5

```sql
SELECT * FROM product_stock_status
WHERE stock_status IN ('out_of_stock', 'low_stock')
ORDER BY stock_quantity ASC;
```

---

### 3. recent_orders_with_customers

**Purpose**: Dashboard and admin viewing

```sql
SELECT * FROM recent_orders_with_customers
WHERE created_at > NOW() - INTERVAL '7 days'
  AND status = 'aguardando_pagamento'
ORDER BY created_at DESC;
```

---

## Data Integrity Constraints

### Primary Keys
- All tables have `id SERIAL PRIMARY KEY`
- Auto-incremented on insert

### Unique Constraints
- `products.sku` - No duplicate product variants
- `customers.whatsapp_number` - One customer per WhatsApp account
- `categories.name` - One category per name

### Foreign Keys
- `products.category_id` → `categories.id`
- `product_variants.product_id` → `products.id`
- `orders.customer_id` → `customers.id`

### Check Constraints
- `customers.whatsapp_number ~ '^\+?[0-9]{10,15}$'` - Valid phone format
- `orders.status IN (...)` - Valid order states only

### Default Values
- `products.is_active = true` - New products visible
- `product_variants.stock_quantity = 0` - Default empty stock
- `customers.total_orders = 0` - Counter starts at zero
- `orders.status = 'aguardando_pagamento'` - Default pending
- All `created_at` fields = `CURRENT_TIMESTAMP`

---

## Backup & Recovery

### Backup Commands

```bash
# Full database backup
pg_dump evolution_db > backup_$(date +%Y%m%d).sql

# Compressed backup
pg_dump evolution_db | gzip > backup_$(date +%Y%m%d).sql.gz

# Backup specific table
pg_dump evolution_db -t orders > backup_orders_$(date +%Y%m%d).sql
```

### Restore Commands

```bash
# Full restore
psql evolution_db < backup_20260426.sql

# From compressed backup
gunzip -c backup_20260426.sql.gz | psql evolution_db

# Restore specific table
psql evolution_db < backup_orders_20260426.sql
```

---

## Common Queries

### 1. List Pending Orders with Customer Details

```sql
SELECT 
  o.id,
  c.full_name,
  c.whatsapp_number,
  o.total_amount,
  o.status,
  o.created_at
FROM orders o
JOIN customers c ON o.customer_id = c.id
WHERE o.status = 'aguardando_pagamento'
ORDER BY o.created_at DESC;
```

### 2. Get Stock Status by Color & Size

```sql
SELECT 
  p.name,
  pv.color,
  pv.size,
  pv.stock_quantity,
  CASE 
    WHEN pv.stock_quantity = 0 THEN '❌ Out of Stock'
    WHEN pv.stock_quantity < 5 THEN '⚠️  Low Stock'
    ELSE '✅ In Stock'
  END as status
FROM product_variants pv
JOIN products p ON pv.product_id = p.id
ORDER BY pv.color, pv.size;
```

### 3. Customer Lifetime Value

```sql
SELECT 
  c.full_name,
  c.whatsapp_number,
  COUNT(o.id) as orders,
  SUM(o.total_amount) as lifetime_value,
  AVG(o.total_amount) as avg_order_value
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
GROUP BY c.id
ORDER BY lifetime_value DESC
LIMIT 20;
```

### 4. Recent Audit Actions

```sql
SELECT 
  admin_user,
  action,
  details,
  created_at
FROM audit_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

### 5. Update Product Price

```sql
UPDATE products 
SET base_price = 29.99
WHERE id = 5;

-- Log the change
INSERT INTO audit_logs (admin_user, action, details)
VALUES (
  'heitor',
  'UPDATE_PRICE',
  jsonb_build_object(
    'product_id', 5,
    'old_price', 24.99,
    'new_price', 29.99
  )
);
```

### 6. Update Stock for SKU

```sql
UPDATE product_variants 
SET stock_quantity = stock_quantity - 2
WHERE sku = 'TEE-BLACK-M';

-- Log the stock change
INSERT INTO audit_logs (admin_user, action, details)
VALUES (
  'heitor',
  'STOCK_DEDUCTION',
  jsonb_build_object(
    'sku', 'TEE-BLACK-M',
    'quantity_removed', 2,
    'new_stock', (SELECT stock_quantity FROM product_variants WHERE sku = 'TEE-BLACK-M')
  )
);
```

---

## ERD Diagram

```
                    ┌─────────────────┐
                    │   CATEGORIES    │
                    │─────────────────│
                    │ id (PK)         │
                    │ name (UNIQUE)   │
                    │ description     │
                    │ created_at      │
                    └────────┬────────┘
                             │
                             │ 1:N
                             │
        ┌────────────────────▼──────────────────────┐
        │          PRODUCTS                         │
        │──────────────────────────────────────────│
        │ id (PK)                                  │
        │ category_id (FK)                         │
        │ name (NOT NULL)                          │
        │ description                              │
        │ base_price (NOT NULL)                    │
        │ image_placeholder_url                    │
        │ is_active (DEFAULT true)                 │
        │ created_at                               │
        └────────────────────┬──────────────────────┘
                             │
                             │ 1:N
                             │
        ┌────────────────────▼──────────────────────┐
        │      PRODUCT_VARIANTS                     │
        │──────────────────────────────────────────│
        │ id (PK)                                  │
        │ product_id (FK) ON DELETE CASCADE        │
        │ sku (UNIQUE, NOT NULL)                   │
        │ color                                    │
        │ size                                     │
        │ stock_quantity (DEFAULT 0)               │
        │ created_at                               │
        └───────────────────────────────────────────┘


        ┌─────────────────────────────┐
        │      CUSTOMERS              │
        │─────────────────────────────│
        │ id (PK)                     │
        │ full_name                   │
        │ whatsapp_number (UNIQUE)    │
        │ email                       │
        │ total_orders (DEFAULT 0)    │
        │ created_at                  │
        └──────────────┬──────────────┘
                       │
                       │ 1:N
                       │
        ┌──────────────▼──────────────┐
        │       ORDERS                │
        │──────────────────────────────│
        │ id (PK)                     │
        │ customer_id (FK)            │
        │ total_amount (NOT NULL)     │
        │ payment_method              │
        │ status (CHECK)              │
        │ origin                      │
        │ stripe_link_id              │
        │ created_at                  │
        └─────────────────────────────┘


        ┌─────────────────────────────┐
        │     AUDIT_LOGS              │
        │ (Compliance Tracking)       │
        │─────────────────────────────│
        │ id (PK)                     │
        │ admin_user                  │
        │ action                      │
        │ details (JSONB)             │
        │ created_at                  │
        └─────────────────────────────┘
```

---

## Migration History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-04-26 | Initial schema creation |

---

## Support & Troubleshooting

### Common Issues

**Q: WhatsApp numbers not being validated?**  
A: Check the regex constraint: `^\+?[0-9]{10,15}$`

**Q: Orders showing NULL customer?**  
A: Possible if customer was deleted (FK has ON DELETE SET NULL)

**Q: Stock not updating correctly?**  
A: Verify the transaction is committed; check audit_logs for the update action

---

**Database Created**: April 26, 2026  
**Last Updated**: April 26, 2026
