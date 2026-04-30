/**
 * Controller admin para gestão de categorias.
 * Rotas registadas em `routes/orderRoutes.js` (atrás do JWT).
 */
const CategoryService = require('../services/categoryService');

class CategoryController {
  async list(req, res, next) {
    try {
      const data = await CategoryService.list();
      res.json(data);
    } catch (e) { next(e); }
  }

  async create(req, res, next) {
    try {
      const { name, description, sort_order } = req.body || {};
      const created = await CategoryService.create({ name, description, sort_order });
      res.status(201).json(created);
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message });
      next(e);
    }
  }

  async update(req, res, next) {
    try {
      const updated = await CategoryService.update(req.params.id, req.body || {});
      if (!updated) return res.status(404).json({ error: 'Categoria não encontrada' });
      res.json(updated);
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message });
      next(e);
    }
  }

  async destroy(req, res, next) {
    try {
      const ok = await CategoryService.destroy(req.params.id);
      if (!ok) return res.status(404).json({ error: 'Categoria não encontrada' });
      res.status(204).send();
    } catch (e) { next(e); }
  }

  // -------------------------------------------------------------
  // Imagem (multipart, field "image")
  // -------------------------------------------------------------

  async uploadImage(req, res, next) {
    try {
      if (!req.file) return res.status(400).json({ error: 'Ficheiro "image" é obrigatório.' });
      const updated = await CategoryService.setImage(req.params.categoryId, req.file.filename);
      if (!updated) return res.status(404).json({ error: 'Categoria não encontrada' });
      res.json(updated);
    } catch (e) { next(e); }
  }

  async removeImage(req, res, next) {
    try {
      const result = await CategoryService.removeImage(req.params.categoryId);
      if (!result) return res.status(404).json({ error: 'Categoria não encontrada' });
      res.json(result);
    } catch (e) { next(e); }
  }
}

module.exports = new CategoryController();
