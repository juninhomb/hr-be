module.exports = (err, req, res, next) => {
  console.error('🔥 Erro detetado:', err.stack);

  // Erros do multer (limites internos) — código próprio.
  if (err && err.name === 'MulterError') {
    const map = {
      LIMIT_FILE_SIZE: 'Imagem demasiado grande (máx. 5 MB por ficheiro).',
      LIMIT_UNEXPECTED_FILE: 'Campo de upload inesperado (usa "images" ou "image").',
      LIMIT_FILE_COUNT: 'Demasiados ficheiros (máx. 12 por pedido).',
      LIMIT_PART_COUNT: 'Demasiadas partes no upload.',
      LIMIT_FIELD_KEY: 'Nome de campo demasiado longo.',
      LIMIT_FIELD_VALUE: 'Valor de campo demasiado longo.',
      LIMIT_FIELD_COUNT: 'Demasiados campos no formulário.',
    };
    return res.status(400).json({
      error: map[err.code] || `Erro no upload: ${err.code}`,
      code: err.code,
    });
  }

  // Erros do fileFilter (mime não permitido) — marcados com statusCode + code.
  if (err && err.code === 'UNSUPPORTED_MIME') {
    return res.status(400).json({ error: err.message, code: err.code });
  }

  // Body grande (body-parser) — pode acontecer com JSON > 2 MB.
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Pedido demasiado grande. Reduz o tamanho dos dados enviados.',
      code: 'PAYLOAD_TOO_LARGE',
    });
  }

  // Erros aplicacionais com statusCode definido pelo service.
  if (err && typeof err.statusCode === 'number') {
    return res.status(err.statusCode).json({
      error: err.message || 'Erro na requisição.',
      ...(err.code ? { code: err.code } : {}),
    });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Ocorreu um erro interno no servidor.',
  });
};
