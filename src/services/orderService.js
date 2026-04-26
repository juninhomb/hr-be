const db = require('../config/db');
const LogService = require('./logService');

class OrderService {
  // Pedidos pendentes do WhatsApp (IA)
  async getPendingOrders() {
    const query = `
      SELECT o.id, c.full_name, c.whatsapp_number, o.total_amount, o.status, o.origin, o.created_at
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.status = 'aguardando_pagamento'
      ORDER BY o.created_at DESC;
    `;
    const { rows } = await db.query(query);
    return rows;
  }

  // Histórico Geral (Relatórios)
  async getOrderHistory() {
    const query = `
      SELECT o.id, c.full_name, o.total_amount, o.status, o.origin, o.created_at
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      ORDER BY o.created_at DESC;
    `;
    const { rows } = await db.query(query);
    return rows;
  }

  // Criar Pedido Manual (Loja Física)
  async createManualOrder(data) {
    const { customer_id, items, total_amount, payment_method, status = 'pago', origin = 'loja_fisica' } = data;
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const orderRes = await client.query(
        'INSERT INTO orders (customer_id, total_amount, status, origin, payment_method) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [customer_id, total_amount, status, origin, payment_method]
      );
      const orderId = orderRes.rows[0].id;

      for (const item of items) {
        const stockUpdate = await client.query(
          'UPDATE product_variants SET stock_quantity = stock_quantity - $1 WHERE sku = $2 AND stock_quantity >= $1 RETURNING id',
          [item.quantity, item.sku]
        );
        if (stockUpdate.rowCount === 0) throw new Error(`Stock insuficiente para SKU: ${item.sku}`);

        const variantId = stockUpdate.rows[0].id;
        await client.query(
          'INSERT INTO order_items (order_id, variant_id, sku, quantity, unit_price) VALUES ($1, $2, $3, $4, $5)',
          [orderId, variantId, item.sku, item.quantity, item.unit_price || null]
        );
      }

      await client.query(
        'UPDATE customers SET total_orders = total_orders + 1 WHERE id = $1',
        [customer_id]
      );

      await client.query('COMMIT');
      await LogService.register('system', 'order_created', { orderId, customer_id, total_amount, origin });
      return { success: true, orderId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Confirmar Pedido da IA
  async confirmPayment(orderId, sku) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const orderRes = await client.query(
        "UPDATE orders SET status = 'pago' WHERE id = $1 RETURNING customer_id",
        [orderId]
      );

      const stockUpdate = await client.query(
        'UPDATE product_variants SET stock_quantity = stock_quantity - 1 WHERE sku = $1 AND stock_quantity > 0 RETURNING id',
        [sku]
      );
      if (stockUpdate.rowCount === 0) throw new Error('Stock insuficiente.');

      const customerId = orderRes.rows[0]?.customer_id;
      if (customerId) {
        await client.query(
          'UPDATE customers SET total_orders = total_orders + 1 WHERE id = $1',
          [customerId]
        );
      }

      await client.query('COMMIT');
      await LogService.register('system', 'payment_confirmed', { orderId, sku });
      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new OrderService();