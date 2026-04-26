const ProductService = require('../services/productService');

class ProductController {
  async list(req, res, next) {
    try {
      const { search = '' } = req.query;
      const products = await ProductService.getAllProducts(search);
      res.json(products);
    } catch (error) { next(error); }
  }

  async update(req, res, next) {
    try {
      const { sku } = req.params;
      const product = await ProductService.updateProduct(sku, req.body);
      if (!product) return res.status(404).json({ error: 'Produto não encontrado' });
      res.json(product);
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