/**
 * Configuração do multer para upload de imagens.
 *
 * Suportamos dois tipos de upload:
 *  - Produtos / variantes  → grava em `uploads/products/`.
 *  - Categorias           → grava em `uploads/categories/`.
 *
 * O destino é decidido em runtime, com base no parâmetro de URL presente
 * (`req.params.categoryId` vs `req.params.productId`/`variantId`). Assim
 * mantemos um único middleware `upload.single('image')` reutilizável em
 * todos os endpoints.
 *
 * - Nome do ficheiro: `<kind>-<id>-<timestamp>.<ext>`.
 * - Aceita apenas imagens raster comuns (jpg/jpeg/png/webp/avif/gif).
 * - Limite: 5 MB.
 *
 * NÃO usamos a pasta como CDN — para isso, mais tarde, basta colocar
 * Cloudflare ou S3 à frente de `/uploads/`.
 */
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const PRODUCTS_DIR = path.resolve(process.cwd(), 'uploads', 'products');
const CATEGORIES_DIR = path.resolve(process.cwd(), 'uploads', 'categories');

// Garante que ambas as pastas existem (no boot do processo).
for (const dir of [PRODUCTS_DIR, CATEGORIES_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
]);

function pickKind(req) {
  if (req.params.categoryId) return 'category';
  if (req.params.variantId) return 'variant';
  if (req.params.productId) return 'product';
  return 'misc';
}

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const kind = pickKind(req);
    cb(null, kind === 'category' ? CATEGORIES_DIR : PRODUCTS_DIR);
  },
  filename(req, file, cb) {
    const kind = pickKind(req);
    const id =
      req.params.categoryId ||
      req.params.variantId ||
      req.params.productId ||
      'x';
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    const stamp = Date.now();
    cb(null, `${kind}-${id}-${stamp}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error(`Tipo de ficheiro não suportado: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

module.exports = {
  upload,
  // Mantido para compat — `productService` ainda importa `UPLOAD_DIR`
  // como sinónimo de "pasta dos produtos".
  UPLOAD_DIR: PRODUCTS_DIR,
  PRODUCTS_DIR,
  CATEGORIES_DIR,
  /**
   * Caminho público (relativo) que o frontend usa para apontar para a
   * imagem de PRODUTO/VARIANTE.
   * Ex.: `/uploads/products/product-12-1714521234.jpg`
   */
  toPublicUrl(filename) {
    return `/uploads/products/${filename}`;
  },
  /**
   * Caminho público para imagens de CATEGORIAS.
   * Ex.: `/uploads/categories/category-3-1714521234.jpg`
   */
  toCategoryPublicUrl(filename) {
    return `/uploads/categories/${filename}`;
  },
};
