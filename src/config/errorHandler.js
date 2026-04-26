module.exports = (err, req, res, next) => {
  console.error('🔥 Erro detetado:', err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Ocorreu um erro interno no servidor.'
  });
};