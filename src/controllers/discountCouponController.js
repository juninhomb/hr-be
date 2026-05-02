const DiscountCouponService = require('../services/discountCouponService');

class DiscountCouponController {
  async list(req, res, next) {
    try {
      const data = await DiscountCouponService.list();
      res.json(data);
    } catch (e) {
      next(e);
    }
  }

  async store(req, res, next) {
    try {
      const row = await DiscountCouponService.create(req.body || {});
      res.status(201).json(row);
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message });
      next(e);
    }
  }

  async update(req, res, next) {
    try {
      const row = await DiscountCouponService.update(req.params.id, req.body || {});
      res.json(row);
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message });
      next(e);
    }
  }

  async destroy(req, res, next) {
    try {
      const result = await DiscountCouponService.remove(req.params.id);
      res.json(result);
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message });
      next(e);
    }
  }
}

module.exports = new DiscountCouponController();
