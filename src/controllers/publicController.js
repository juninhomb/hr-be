const PublicService = require('../services/publicService');

/**
 * Idempotency-Key: aceitamos só strings curtas (≤ 80 chars) e seguras
 * (alfanuméricos + `-_`). Qualquer outra coisa é tratada como ausente —
 * preferimos criar pedido novo do que devolver um pedido errado.
 */
function sanitizeIdempotencyKey(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 80) return null;
  return /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : null;
}

class PublicController {
  async listProducts(req, res, next) {
    try {
      const { search = '', category_id = '', featured } = req.query;
      // featured: 'true' / '1' → só destaques; 'false' / '0' → só não-destaques;
      // ausente / outro valor → tudo (compat com o admin).
      let featuredFlag = null;
      if (featured === 'true' || featured === '1') featuredFlag = true;
      else if (featured === 'false' || featured === '0') featuredFlag = false;

      const data = await PublicService.listProducts({
        search: String(search).trim(),
        categoryId: category_id ? parseInt(category_id, 10) : null,
        featured: featuredFlag,
      });
      res.json(data);
    } catch (error) { next(error); }
  }

  async getProduct(req, res, next) {
    try {
      const product = await PublicService.getProductById(req.params.id);
      if (!product) return res.status(404).json({ error: 'Produto não encontrado' });
      res.json(product);
    } catch (error) { next(error); }
  }

  async listCategories(req, res, next) {
    try {
      const cats = await PublicService.listCategories();
      res.json(cats);
    } catch (error) { next(error); }
  }

  async createOrder(req, res, next) {
    try {
      const {
        customer = {}, items = [], delivery = {}, notes, coupon_code: couponCode,
      } = req.body || {};
      const idempotencyKey = sanitizeIdempotencyKey(req.headers['idempotency-key']);
      const result = await PublicService.createWebsiteOrder({
        customer, items, delivery, notes, idempotencyKey, coupon_code: couponCode,
      });
      res.status(201).json(result);
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      next(error);
    }
  }

  async couponQuote(req, res, next) {
    try {
      const { code, items } = req.body || {};
      const data = await PublicService.couponQuote({ code, items });
      res.json(data);
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      next(error);
    }
  }

  /** Confirma sessão Stripe já paga e marca pedido `pago` (backup ao webhook). */
  async verifyStripeCheckoutSession(req, res, next) {
    try {
      const raw = req.body?.session_id;
      if (!raw || typeof raw !== 'string') {
        return res.status(400).json({ error: 'session_id é obrigatório.' });
      }
      const sessionId = raw.trim();
      if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
        return res.status(400).json({ error: 'session_id inválido.' });
      }
      const result = await PublicService.verifyStripeCheckoutSession(sessionId);
      res.json(result);
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      next(error);
    }
  }

  /** Checkout Stripe: cria pedido + sessão Stripe Checkout (redirect). */
  async createStripeCheckout(req, res, next) {
    try {
      const {
        customer = {},
        items = [],
        delivery = {},
        notes,
        success_url: successUrl,
        cancel_url: cancelUrl,
        coupon_code: couponCode,
      } = req.body || {};
      const data = await PublicService.createWebsiteOrderStripeCheckout({
        customer,
        items,
        delivery,
        notes,
        success_url: successUrl,
        cancel_url: cancelUrl,
        idempotencyKey: sanitizeIdempotencyKey(req.headers['idempotency-key']),
        coupon_code: couponCode,
      });
      res.status(201).json(data);
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      next(error);
    }
  }

  /** Conferência de cliente + moradas sugeridas (só identificação pelo número no checkout). */
  async customerHints(req, res, next) {
    try {
      const { whatsapp_number } = req.body || {};
      const data = await PublicService.getCheckoutHints(whatsapp_number);
      res.json(data);
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      next(error);
    }
  }
}

module.exports = new PublicController();
