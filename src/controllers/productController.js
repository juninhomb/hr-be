const ProductService = require('../services/productService');

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

  async create(req, res, next) {
    try {
      const { name, base_price, sku, color, size, stock_quantity } = req.body;
      // base_price pode ser 0 — valida apenas null/undefined/'')
      const priceNum = Number(base_price);
      if (!name || base_price === undefined || base_price === null || base_price === '' || Number.isNaN(priceNum) || priceNum < 0 || !sku) {
        return res.status(400).json({ error: 'name, base_price (≥0) e sku são obrigatórios' });
      }
      const stockNum = Number.isFinite(Number(stock_quantity)) ? Number(stock_quantity) : 0;
      const product = await ProductService.createProduct({
        name: name.trim(), base_price: priceNum, sku: sku.trim().toUpperCase(),
        color: color?.trim() || null, size: size?.trim() || null,
        stock_quantity: stockNum,
      });
      res.status(201).json(product);
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'SKU já existe' });
      }
      next(error);
    }
  }

  async addVariant(req, res, next) {
    try {
      const productId = parseInt(req.params.productId, 10);
      if (!productId) return res.status(400).json({ error: 'productId inválido' });
      const { sku, color, size, stock_quantity } = req.body;
      if (!sku) return res.status(400).json({ error: 'sku é obrigatório' });
      const stockNum = Number.isFinite(Number(stock_quantity)) ? Number(stock_quantity) : 0;
      const variant = await ProductService.addVariantToProduct(productId, {
        sku: sku.trim().toUpperCase(),
        color: color?.trim() || null,
        size: size?.trim() || null,
        stock_quantity: stockNum,
      });
      if (!variant) return res.status(404).json({ error: 'Produto não encontrado' });
      res.status(201).json(variant);
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'SKU já existe' });
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
    } catch (error) { next(error); }
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
}

module.exports = new ProductController();