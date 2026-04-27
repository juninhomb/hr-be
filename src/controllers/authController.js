const jwt = require('jsonwebtoken');
require('dotenv').config();

class AuthController {
  async login(req, res) {
    const { username, password } = req.body;

    // 1. Definição da lista de utilizadores autorizados com base no .env
    const authorizedUsers = [
      { user: process.env.ADMIN_USER, pass: process.env.ADMIN_PASS },
      { user: process.env.FERNANDA_USER, pass: process.env.FERNANDA_PASS },
      { user: process.env.TALITTA_USER, pass: process.env.TALITTA_PASS }
    ];

    // 2. Procura um utilizador que corresponda às credenciais enviadas
    const validUser = authorizedUsers.find(
      (u) => u.user === username && u.user !== undefined && u.pass === password && u.pass !== undefined
    );

    // 3. Validação e geração do Token JWT
    if (validUser) {
      const token = jwt.sign(
        { user: username }, 
        process.env.JWT_SECRET, 
        { expiresIn: '2h' } // Expira em 8 horas
      );
      
      return res.json({ 
        auth: true, 
        token, 
        username: validUser.user 
      });
    }

    // 4. Resposta em caso de falha
    return res.status(401).json({ error: "Credenciais inválidas" });
  }
}

module.exports = new AuthController();