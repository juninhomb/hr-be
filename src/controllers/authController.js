const jwt = require('jsonwebtoken');
require('dotenv').config();

class AuthController {
  async login(req, res) {
    const { username, password } = req.body;

    // Verificação simples contra o .env (ou poderias usar uma tabela de users no futuro)
    if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
      const token = jwt.sign(
        { user: username }, 
        process.env.JWT_SECRET, 
        { expiresIn: '8h' } // O token expira em 8 horas
      );
      return res.json({ auth: true, token });
    }

    return res.status(401).json({ error: "Credenciais inválidas" });
  }
}

module.exports = new AuthController();