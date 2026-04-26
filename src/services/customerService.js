const db = require('../config/db');

class CustomerService {
  async getAllCustomers(search = '') {
    const query = `
      SELECT id, full_name, whatsapp_number, email, total_orders, created_at 
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
    const { name, whatsapp_number, email } = data;
    const query = `
      INSERT INTO customers (full_name, whatsapp_number, email)
      VALUES ($1, $2, $3)
      ON CONFLICT (whatsapp_number) 
      DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email
      RETURNING *;
    `;
    const { rows } = await db.query(query, [name, whatsapp_number, email]);
    return rows[0];
  }
}

module.exports = new CustomerService();