-- Migration: Add is_delivery and shipping_fee to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS is_delivery BOOLEAN DEFAULT false;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC(12,2) DEFAULT 0;
