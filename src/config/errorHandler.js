module.exports = (err, req, res, next) => {
  console.error('🔥 Erro detetado:', err.stack);

  // Erros do multer têm código próprio — traduzimos para PT.
  if (err && err.name === 'MulterError') {
    const map = {
      LIMIT_FILE_SIZE: 'Imagem demasiado grande (máx. 5 MB).',
      LIMIT_UNEXPECTED_FILE: 'Campo de upload inesperado (esperado "image").',
    };
    return res.status(400).json({
      error: map[err.code] || `Erro no upload: ${err.code}`,
    });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Ocorreu um erro interno no servidor.',
  });
};