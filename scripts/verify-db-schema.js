#!/usr/bin/env node
/**
 * Verifica se a base tem as tabelas/colunas que o backend Node usa.
 * Uso: npm run db:verify  (lê DATABASE_URL do .env via src/config/env)
 */
require('../src/config/env');
const { Pool } = require('pg');

/** Contrato mínimo alinhado a schema.sql + migrações aplicadas (db:bootstrap). */
const REQUIRED = {
  categories: [
    'id', 'name', 'description', 'image_url', 'sort_order', 'slug', 'created_at',
  ],
  catalog_colors: ['id', 'name', 'sort_order', 'created_at'],
  products: [
    'id', 'category_id', 'name', 'description', 'characteristics', 'base_price',
    'image_placeholder_url', 'is_active', 'is_featured', 'created_at',
  ],
  product_variants: [
    'id', 'product_id', 'sku', 'color', 'size', 'stock_quantity', 'is_active',
    'image_url', 'color_id', 'created_at',
  ],
  customers: [
    'id', 'full_name', 'whatsapp_number', 'email', 'address',
    'postal_code', 'city', 'district', 'country', 'phone',
    'total_orders', 'created_at',
  ],
  customer_addresses: [
    'id', 'customer_id', 'label', 'street_name', 'street_number', 'apartment',
    'address_obs', 'postal_code', 'city', 'district', 'country', 'address_key',
    'created_at', 'updated_at',
  ],
  shipping_zones: [
    'id', 'country_code', 'region', 'label', 'fee_eur', 'free_above_eur',
    'postal_code_prefix', 'sort_order', 'is_active', 'requires_whatsapp_checkout',
    'created_at', 'updated_at',
  ],
  orders: [
    'id', 'customer_id', 'total_amount', 'payment_method', 'status', 'origin',
    'stripe_link_id', 'customer_notes', 'coupon_code', 'discount_amount',
    'is_delivery', 'shipping_fee', 'shipping_zone_id', 'delivery_address',
    'idempotency_key', 'pickup_ready_notified_at', 'pickup_collected_at',
    'created_at',
  ],
  order_items: [
    'id', 'order_id', 'variant_id', 'sku', 'quantity', 'unit_price', 'created_at',
  ],
  audit_logs: ['id', 'admin_user', 'action', 'details', 'created_at'],
  discount_coupons: [
    'id', 'code', 'kind', 'value', 'is_active', 'created_at', 'updated_at',
  ],
};

async function main() {
  const url = String(process.env.DATABASE_URL || '').trim();
  if (!url) {
    console.error('DATABASE_URL em falta (define no .env na raiz do hr-be).');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url, max: 2 });
  let failed = false;

  try {
    for (const [table, cols] of Object.entries(REQUIRED)) {
      const { rows } = await pool.query(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1`,
        [table],
      );
      if (rows.length === 0) {
        console.error(`[falta] tabela public.${table}`);
        failed = true;
        continue;
      }
      const have = new Set(rows.map((r) => r.column_name));
      for (const c of cols) {
        if (!have.has(c)) {
          console.error(`[falta] coluna public.${table}.${c}`);
          failed = true;
        }
      }
    }
  } catch (e) {
    console.error('Erro ao consultar a base:', e.message || e);
    failed = true;
  } finally {
    await pool.end();
  }

  if (failed) {
    console.error('\nCorre na base configurada: npm run db:bootstrap');
    process.exit(1);
  }
  console.log('db:verify OK — estrutura mínima do backend está presente.');
}

main();
