const { ColorService } = require('../services/colorService');

class ColorController {
  async list(req, res, next) {
    try {
      const data = await ColorService.list();
      res.json(data);
    } catch (e) {
      next(e);
    }
  }

  async create(req, res, next) {
    try {
      const { name, sort_order } = req.body || {};
      const created = await ColorService.create({ name, sort_order });
      res.status(201).json(created);
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message });
      next(e);
    }
  }

  async update(req, res, next) {
    try {
      const updated = await ColorService.update(req.params.id, req.body || {});
      if (!updated) return res.status(404).json({ error: 'Cor não encontrada.' });
      res.json(updated);
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message });
      next(e);
    }
  }

  async destroy(req, res, next) {
    try {
      const ok = await ColorService.destroy(req.params.id);
      if (!ok) return res.status(404).json({ error: 'Cor não encontrada.' });
      res.status(204).send();
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message });
      next(e);
    }
  }
}

module.exports = new ColorController();
