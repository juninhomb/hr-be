const express = require('express');
const cors = require('cors');
const orderRoutes = require('./routes/orderRoutes'); // Removi a barra que estava aqui \
const errorHandler = require('./config/errorHandler');
require('dotenv').config();

const app = express();

// ==========================================
// 1. MIDDLEWARES GLOBAIS
// ==========================================
app.use(cors()); 
app.use(express.json()); 

// ==========================================
// 2. DEFINIÇÃO DE ROTAS
// ==========================================

// O roteador centraliza as rotas. A proteção JWT acontece 
// dentro do ficheiro orderRoutes.js através do middleware.
app.use('/api/orders', orderRoutes);

// Rota de saúde para monitorização (Pública)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'online', 
    uptime: process.uptime(),
    message: 'HR Store API protegida por JWT está ativa! 🛡️' 
  });
});

// Middleware de erro deve ser sempre o ÚLTIMO antes do listen
app.use(errorHandler);

// ==========================================
// 3. INICIALIZAÇÃO DO SERVIDOR
// ==========================================
const PORT = process.env.PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ==============================================
  🚀 HR STORE BACKEND - MODO JWT ATIVO
  📡 Porta: ${PORT}
  🔑 Admin User: ${process.env.ADMIN_USER}
  🔗 Endpoints protegidos em: /api/orders/*
  ==============================================
  `);
});