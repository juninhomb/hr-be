const db = require('../config/db');

class CustomerService {
  async getAllCustomers(search = '') {
    const query = `
      SELECT id, full_name, whatsapp_number, email, address, total_orders, created_at 
      FROM customers 
      WHERE full_name ILIKE $1 OR whatsapp_number ILIKE $1
      ORDER BY full_name ASC
    `;
    const { rows } = await db.query(query, [`%${search}%`]);
    return rows;
  }

  async getCustomerByPhone(whatsapp) {
    const query = 'SELECT * FROM customers WHERE whatsapp_number = $1';
    const { rows } = await db.query(query, [whatsapp]);
    return rows[0];
  }

  async upsertCustomer(data) {
    const { name, whatsapp_number, email, address } = data;
    const query = `
      INSERT INTO customers (full_name, whatsapp_number, email, address)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (whatsapp_number) 
      DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email, address = EXCLUDED.address
      RETURNING *;
    `;
    const { rows } = await db.query(query, [name, whatsapp_number, email, address]);
    return rows[0];
  }

  async deleteCustomer(whatsapp) {
    const { rows } = await db.query(
      `DELETE FROM customers WHERE whatsapp_number = $1 RETURNING id`,
      [whatsapp]
    );
    return rows[0] || null;
  }
}

module.exports = new CustomerService();