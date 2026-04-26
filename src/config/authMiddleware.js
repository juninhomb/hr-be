const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = (req, res, next) => {
  const token = req.headers['authorization']; // Espera "Bearer TOKEN_AQUI"

  if (!token) return res.status(401).json({ error: "Token não fornecido" });

  const jwtToken = token.split(' ')[1]; // Remove o "Bearer "

  jwt.verify(jwtToken, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: "Token inválido ou expirado" });
    
    req.userId = decoded.user;
    next();
  });
};