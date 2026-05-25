const ShippingService = require('../services/shippingService');

class ShippingController {
  // -----------------------------------------------------------------
  // PÚBLICO (sem JWT)
  // -----------------------------------------------------------------

  /**
   * GET /api/public/shipping-zones
   *
   * Devolve apenas zonas ATIVAS, sem dados internos sensíveis.
   * Usado pelo storefront para popular o select de "país" e mostrar
   * a tarifa esperada antes do checkout.
   */
  async listPublic(req, res, next) {
    try {
      const rows = await ShippingService.listAll({ activeOnly: true });
      res.json(
        rows.map((z) => ({
          id: z.id,
          country_code: z.country_code,
          region: z.region,
          label: z.label,
          fee_eur: z.fee_eur,
          free_above_eur: z.free_above_eur,
          postal_code_prefix: z.postal_code_prefix || null,
          requires_whatsapp_checkout: Boolean(z.requires_whatsapp_checkout),
        }))
      );
    } catch (e) { next(e); }
  }

  /**
   * GET /api/public/shipping-quote?country=PT&postal_code=2700-001&subtotal=42.5
   *
   * Devolve o frete que será aplicado na criação do pedido.
   * O storefront usa para mostrar o valor dinâmico ao cliente,
   * mas o servidor é a fonte da verdade no `createWebsiteOrder`.
   */
  async quote(req, res, next) {
    try {
      const country = String(req.query.country || '').trim();
      const postalCode = String(req.query.postal_code || '').trim();
      const subtotal = Number(req.query.subtotal || 0) || 0;

      if (!country) {
        return res.status(400).json({ error: 'country é obrigatório.' });
      }

      const result = await ShippingService.computeFee({
        country, postal_code: postalCode, subtotal,
      });

      if (!result.zone) {
        return res.status(404).json({
          error: 'Sem entrega para o destino indicado. Fala connosco pelo WhatsApp.',
        });
      }
      res.json({
        fee_eur: result.fee,
        free_shipping_applied: result.free_shipping_applied,
        // True quando o destino só aceita pedidos via WhatsApp (logística
        // diferenciada). O storefront usa este flag para esconder o botão
        // "Confirmar pedido" e mostrar um CTA "Continuar no WhatsApp".
        requires_whatsapp_checkout: Boolean(result.zone.requires_whatsapp_checkout),
        zone: {
          id: result.zone.id,
          country_code: result.zone.country_code,
          region: result.zone.region,
          label: result.zone.label,
          free_above_eur: result.zone.free_above_eur,
        },
      });
    } catch (e) { next(e); }
  }

  /**
   * GET /api/public/postal-code/:cp
   *
   * Detalhes de CP em Portugal via `data/pt-postal-lookup.json`
   * (`npm run build:postal-data` — Central de Dados, sem API externa).
   */
  async lookupCp(req, res, next) {
    try {
      const data = await ShippingService.lookupPortugalPostalCode(req.params.cp);
      res.json(data);
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message });
      next(e);
    }
  }

  // -----------------------------------------------------------------
  // ADMIN (via /api/orders/* — JWT já aplicado pelo router)
  // -----------------------------------------------------------------

  async listAdmin(req, res, next) {
    try {
      const rows = await ShippingService.listAll({ activeOnly: false });
      res.json(rows);
    } catch (e) { next(e); }
  }

  async createAdmin(req, res, next) {
    try {
      const created = await ShippingService.create(req.body || {});
      res.status(201).json(created);
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message });
      next(e);
    }
  }

  async updateAdmin(req, res, next) {
    try {
      const updated = await ShippingService.update(req.params.id, req.body || {});
      if (!updated) return res.status(404).json({ error: 'Zona não encontrada.' });
      res.json(updated);
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message });
      next(e);
    }
  }

  async destroyAdmin(req, res, next) {
    try {
      const ok = await ShippingService.destroy(req.params.id);
      if (!ok) return res.status(404).json({ error: 'Zona não encontrada.' });
      res.status(204).end();
    } catch (e) { next(e); }
  }
}

module.exports = new ShippingController();
