const ProductService = require('../services/productService');
const ProductImageService = require('../services/productImageService');
const { collectGalleryFiles } = require('../config/upload');

class ProductController {
  async list(req, res, next) {
    try {
      const { search = '' } = req.query;
      const products = await ProductService.getAllProducts(search);
      res.json(products);
    } catch (error) { next(error); }
  }

  async listBase(req, res, next) {
    try {
      const products = await ProductService.getBaseProducts();
      res.json(products);
    } catch (error) { next(error); }
  }

  async listCategories(req, res, next) {
    try {
      const cats = await ProductService.listCategories();
      res.json(cats);
    } catch (error) { next(error); }
  }

  async create(req, res, next) {
    try {
      const {
        name, base_price, sku, color, color_id, size, stock_quantity, category_id, variant_is_active, characteristics,
      } = req.body;
      const priceNum = Number(base_price);
      if (!name || base_price === undefined || base_price === null || base_price === '' || Number.isNaN(priceNum) || priceNum < 0 || !sku) {
        return res.status(400).json({ error: 'name, base_price (≥0) e sku são obrigatórios' });
      }
      const stockNum = Number.isFinite(Number(stock_quantity)) ? Number(stock_quantity) : 0;
      const product = await ProductService.createProduct({
        name: name.trim(),
        base_price: priceNum,
        sku: sku.trim().toUpperCase(),
        color_id: color_id ?? null,
        color: color?.trim() || null,
        size: size?.trim() || null,
        stock_quantity: stockNum,
        category_id: category_id ?? null,
        variant_is_active,
        characteristics: characteristics != null && String(characteristics).trim() !== '' ? String(characteristics) : null,
      });
      res.status(201).json(product);
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'SKU já existe' });
      }
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      next(error);
    }
  }

  async addVariant(req, res, next) {
    try {
      const productId = parseInt(req.params.productId, 10);
      if (!productId) return res.status(400).json({ error: 'productId inválido' });
      const { sku, color, color_id, size, stock_quantity, is_active } = req.body;
      if (!sku) return res.status(400).json({ error: 'sku é obrigatório' });
      const stockNum = Number.isFinite(Number(stock_quantity)) ? Number(stock_quantity) : 0;
      const variant = await ProductService.addVariantToProduct(productId, {
        sku: sku.trim().toUpperCase(),
        color_id: color_id ?? null,
        color: color?.trim() || null,
        size: size?.trim() || null,
        stock_quantity: stockNum,
        is_active,
      });
      if (!variant) return res.status(404).json({ error: 'Produto não encontrado' });
      res.status(201).json(variant);
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'SKU já existe' });
      }
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const { sku } = req.params;
      const product = await ProductService.updateProduct(sku, req.body);
      if (!product) return res.status(404).json({ error: 'Produto não encontrado' });
      res.json(product);
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      next(error);
    }
  }

  /**
   * POST /products/import
   * Body: { rows: [ { sku, stock?, name?, ... } ] }
   * Actualiza apenas SKU existentes (mesmo contrato que o Excel exportado).
   */
  async importInventory(req, res, next) {
    try {
      const { rows } = req.body || {};
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'rows (array não vazio) é obrigatório' });
      }
      if (rows.length > 5000) {
        return res.status(400).json({ error: 'Máximo 5000 linhas por importação' });
      }
      const result = await ProductService.importInventoryRows(rows);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async destroy(req, res, next) {
    try {
      const { sku } = req.params;
      const deleted = await ProductService.deleteProduct(sku);
      if (!deleted) return res.status(404).json({ error: 'Produto não encontrado' });
      res.status(204).send();
    } catch (error) { next(error); }
  }

  async addStock(req, res, next) {
    try {
      const { sku } = req.params;
      const { quantity } = req.body;
      
      if (quantity === undefined || quantity === null) {
        return res.status(400).json({ error: 'Quantidade é obrigatória' });
      }

      const product = await ProductService.addStock(sku, quantity);
      if (!product) return res.status(404).json({ error: 'Produto não encontrado' });
      
      res.json(product);
    } catch (error) { next(error); }
  }

  // -------------------------------------------------------------
  // Imagens
  // -------------------------------------------------------------

  /**
   * POST /products/:productId/image (multipart/form-data, field "image")
   * Multer já gravou o ficheiro em `uploads/products/`. Aqui só atualizamos
   * a referência na DB.
   */
  async uploadImage(req, res, next) {
    try {
      if (!req.file) return res.status(400).json({ error: 'Ficheiro "image" é obrigatório.' });
      const productId = parseInt(req.params.productId, 10);
      if (!Number.isFinite(productId)) return res.status(400).json({ error: 'productId inválido' });

      const updated = await ProductService.setProductImage(productId, req.file.filename);
      if (!updated) return res.status(404).json({ error: 'Produto não encontrado' });
      res.json(updated);
    } catch (error) { next(error); }
  }

  async removeImage(req, res, next) {
    try {
      const productId = parseInt(req.params.productId, 10);
      if (!Number.isFinite(productId)) return res.status(400).json({ error: 'productId inválido' });
      const result = await ProductService.removeProductImage(productId);
      if (!result) return res.status(404).json({ error: 'Produto não encontrado' });
      res.json(result);
    } catch (error) { next(error); }
  }

  /**
   * POST /products/variants/:variantId/image (multipart, field "image")
   * Body opcional: applyToColor=true → propaga para todas as variantes da
   * mesma cor (útil porque tipicamente foto varia por cor, não por tamanho).
   */
  async uploadVariantImage(req, res, next) {
    try {
      if (!req.file) return res.status(400).json({ error: 'Ficheiro "image" é obrigatório.' });
      const variantId = parseInt(req.params.variantId, 10);
      if (!Number.isFinite(variantId)) return res.status(400).json({ error: 'variantId inválido' });

      const applyToColor = String(req.body?.applyToColor ?? '').toLowerCase() === 'true';
      const result = await ProductService.setVariantImage(variantId, req.file.filename, { applyToColor });
      if (!result) return res.status(404).json({ error: 'Variante não encontrada' });
      res.json(result);
    } catch (error) { next(error); }
  }

  async removeVariantImage(req, res, next) {
    try {
      const variantId = parseInt(req.params.variantId, 10);
      if (!Number.isFinite(variantId)) return res.status(400).json({ error: 'variantId inválido' });
      const result = await ProductService.removeVariantImage(variantId);
      if (!result) return res.status(404).json({ error: 'Variante não encontrada' });
      res.json(result);
    } catch (error) { next(error); }
  }

  // Galeria — múltiplas imagens
  async listProductImages(req, res, next) {
    try {
      const productId = parseInt(req.params.productId, 10);
      if (!Number.isFinite(productId)) return res.status(400).json({ error: 'productId inválido' });
      const images = await ProductImageService.listProductImages(productId);
      res.json(images);
    } catch (error) {
      if (error.code === '42P01') {
        return res.status(503).json({
          error: 'Tabela product_images em falta. Aplica a migração 2026-05-22_product_variant_images.sql.',
        });
      }
      next(error);
    }
  }

  async uploadProductImages(req, res, next) {
    try {
      const files = collectGalleryFiles(req);
      if (!files.length) {
        return res.status(400).json({
          error: 'Nenhum ficheiro recebido. Usa o campo "images" (vários) ou "image" (um).',
        });
      }
      const productId = parseInt(req.params.productId, 10);
      if (!Number.isFinite(productId)) return res.status(400).json({ error: 'productId inválido' });
      const result = await ProductImageService.addProductImages(
        productId,
        files.map((f) => f.filename),
      );
      if (!result) return res.status(404).json({ error: 'Produto não encontrado' });
      res.json(result);
    } catch (error) {
      if (error.code === '42P01') {
        return res.status(503).json({
          error: 'Tabela product_images em falta na base de dados. Aplica a migração 2026-05-22_product_variant_images.sql.',
        });
      }
      if (error.statusCode === 400) return res.status(400).json({ error: error.message });
      next(error);
    }
  }

  async deleteProductImage(req, res, next) {
    try {
      const imageId = parseInt(req.params.imageId, 10);
      if (!Number.isFinite(imageId)) return res.status(400).json({ error: 'imageId inválido' });
      const result = await ProductImageService.removeProductImage(imageId);
      if (!result) return res.status(404).json({ error: 'Imagem não encontrada' });
      res.json(result);
    } catch (error) { next(error); }
  }

  async listVariantImages(req, res, next) {
    try {
      const variantId = parseInt(req.params.variantId, 10);
      if (!Number.isFinite(variantId)) return res.status(400).json({ error: 'variantId inválido' });
      const images = await ProductImageService.listVariantImages(variantId);
      res.json(images);
    } catch (error) {
      if (error.code === '42P01') {
        return res.status(503).json({
          error: 'Tabela variant_images em falta. Aplica a migração 2026-05-22_product_variant_images.sql.',
        });
      }
      next(error);
    }
  }

  async uploadVariantImages(req, res, next) {
    try {
      const files = collectGalleryFiles(req);
      if (!files.length) {
        return res.status(400).json({
          error: 'Nenhum ficheiro recebido. Usa o campo "images" (vários) ou "image" (um).',
        });
      }
      const variantId = parseInt(req.params.variantId, 10);
      if (!Number.isFinite(variantId)) return res.status(400).json({ error: 'variantId inválido' });
      const applyToColor = String(req.body?.applyToColor ?? '').toLowerCase() === 'true';
      const result = await ProductImageService.addVariantImages(
        variantId,
        files.map((f) => f.filename),
        { applyToColor },
      );
      if (!result) return res.status(404).json({ error: 'Variante não encontrada' });
      res.json(result);
    } catch (error) {
      if (error.code === '42P01') {
        return res.status(503).json({
          error: 'Tabela variant_images em falta na base de dados. Aplica a migração 2026-05-22_product_variant_images.sql.',
        });
      }
      if (error.statusCode === 400) return res.status(400).json({ error: error.message });
      next(error);
    }
  }

  async deleteVariantImage(req, res, next) {
    try {
      const imageId = parseInt(req.params.imageId, 10);
      if (!Number.isFinite(imageId)) return res.status(400).json({ error: 'imageId inválido' });
      const result = await ProductImageService.removeVariantImage(imageId);
      if (!result) return res.status(404).json({ error: 'Imagem não encontrada' });
      res.json(result);
    } catch (error) { next(error); }
  }

  // -------------------------------------------------------------
  // Destaque (marca/desmarca produto para a homepage)
  // -------------------------------------------------------------

  async setFeatured(req, res, next) {
    try {
      const productId = parseInt(req.params.productId, 10);
      if (!Number.isFinite(productId)) {
        return res.status(400).json({ error: 'productId inválido' });
      }
      const value = req.body?.is_featured;
      if (typeof value !== 'boolean') {
        return res.status(400).json({ error: '`is_featured` (boolean) é obrigatório.' });
      }
      const updated = await ProductService.setFeatured(productId, value);
      if (!updated) return res.status(404).json({ error: 'Produto não encontrado' });
      res.json(updated);
    } catch (error) { next(error); }
  }

  async setSaldo(req, res, next) {
    try {
      const productId = parseInt(req.params.productId, 10);
      if (!Number.isFinite(productId)) {
        return res.status(400).json({ error: 'productId inválido' });
      }
      const value = req.body?.is_saldo;
      if (typeof value !== 'boolean') {
        return res.status(400).json({ error: '`is_saldo` (boolean) é obrigatório.' });
      }
      const updated = await ProductService.setSaldo(productId, value);
      if (!updated) return res.status(404).json({ error: 'Produto não encontrado' });
      res.json(updated);
    } catch (error) { next(error); }
  }
}

module.exports = new ProductController();
