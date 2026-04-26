const db = require('../config/db');

class LogService {
  async register(adminUser, action, details) {
    const query = 'INSERT INTO audit_logs (admin_user, action, details) VALUES ($1, $2, $3)';
    await db.query(query, [adminUser, action, JSON.stringify(details)]);
  }
}

module.exports = new LogService();