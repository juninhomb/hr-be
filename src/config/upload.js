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
    // Sufixo aleatório evita sobrescrever ficheiros no mesmo ms (upload múltiplo).
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    cb(null, `${kind}-${id}-${stamp}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      const err = new Error(`Tipo de ficheiro não suportado: ${file.mimetype}. Aceites: JPG, PNG, WebP, AVIF, GIF.`);
      err.statusCode = 400;
      err.code = 'UNSUPPORTED_MIME';
      return cb(err);
    }
    cb(null, true);
  },
});

/** Galeria produto/variante: aceita `images` (vários) ou `image` (um). */
const uploadGallery = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 12 },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      const err = new Error(`Tipo de ficheiro não suportado: ${file.mimetype}. Aceites: JPG, PNG, WebP, AVIF, GIF.`);
      err.statusCode = 400;
      err.code = 'UNSUPPORTED_MIME';
      return cb(err);
    }
    cb(null, true);
  },
}).fields([
  { name: 'images', maxCount: 12 },
  { name: 'image', maxCount: 12 },
]);

function collectGalleryFiles(req) {
  const out = [];
  if (req.files && typeof req.files === 'object' && !Array.isArray(req.files)) {
    for (const key of ['images', 'image']) {
      const chunk = req.files[key];
      if (Array.isArray(chunk)) out.push(...chunk);
    }
  } else if (Array.isArray(req.files)) {
    out.push(...req.files);
  }
  if (req.file) out.push(req.file);
  return out;
}

module.exports = {
  upload,
  uploadGallery,
  collectGalleryFiles,
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
