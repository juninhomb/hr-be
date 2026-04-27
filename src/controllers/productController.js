const ProductService = require('../services/productService');

class ProductController {
  async list(req, res, next) {
    try {
      const { search = '' } = req.query;
      const products = await ProductService.getAllProducts(search);
      res.json(products);
    } catch (error) { next(error); }
  }

  async create(req, res, next) {
    try {
      const { name, base_price, sku, color, size, stock_quantity } = req.body;
      if (!name || !base_price || !sku) {
        return res.status(400).json({ error: 'name, base_price e sku são obrigatórios' });
      }
      const product = await ProductService.createProduct({ name, base_price, sku, color, size, stock_quantity });
      res.status(201).json(product);
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