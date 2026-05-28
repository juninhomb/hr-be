const OrderService = require('../services/orderService');
const ExchangeService = require('../services/exchangeService');
const Ship2uCypressRunner = require('../services/ship2uCypressRunner');
const { generateReceiptPdf } = require('../services/receiptPdfService');

class OrderController {
  async listPending(req, res, next) {
    try {
      const orders = await OrderService.getPendingOrders();
      res.json(orders);
    } catch (error) { next(error); }
  }

  async listHistory(req, res, next) {
    try {
      const orders = await OrderService.getOrderHistory();
      res.json(orders);
    } catch (error) { next(error); }
  }

  async show(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ error: 'ID inválido' });
      const order = await OrderService.getOrderById(id);
      if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
      res.json(order);
    } catch (error) { next(error); }
  }

  async receiptPdf(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ error: 'ID inválido' });

      const order = await OrderService.getOrderById(id);
      if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

      const paperMmRaw = req.query?.paper;
      const contentMmRaw = req.query?.content;
      const paperMm = Number(String(paperMmRaw ?? '').trim());
      const contentMm = Number(String(contentMmRaw ?? '').trim());

      const pdfBuffer = await generateReceiptPdf(order, {
        ...(Number.isFinite(paperMm) && paperMm > 0 ? { paperMm } : {}),
        ...(Number.isFinite(contentMm) && contentMm > 0 ? { contentMm } : {}),
      });

      const safeOrigin = String(order.origin || 'pedido')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-');
      const filename = `${safeOrigin}-${id}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', String(pdfBuffer.length));
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      return res.end(pdfBuffer);
    } catch (error) {
      if (error?.message?.match(/font|PDF|pedido/i)) {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  }

  async confirm(req, res, next) {
    try {
      const { orderId, items, shipping_fee } = req.body;
      if (!orderId) return res.status(400).json({ error: 'orderId é obrigatório' });
      const result = await OrderService.confirmPayment(orderId, items || null, shipping_fee);
      res.json(result);
    } catch (error) {
      // Erros de stock / regra de negócio retornam 400, não 500
      if (error.message?.match(/stock|pedido|item/i)) {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  }

  async cancel(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ error: 'ID inválido' });
      const result = await OrderService.cancelOrder(id);
      res.json(result);
    } catch (error) {
      if (error.message?.match(/pedido|stock|pendente/i)) {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  }

  async ship(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ error: 'ID inválido' });
      const { trackingCode } = req.body || {};
      const result = await OrderService.markAsShipped(id, trackingCode);
      res.json(result);
    } catch (error) {
      if (error.message?.match(/pedido|expedido|CTT|envio/i)) {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  }

  async markExpedited(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ error: 'ID inválido' });
      const result = await OrderService.markAsExpedited(id);
      res.json(result);
    } catch (error) {
      if (error.message?.match(/pedido|entrega|expedido|pago|enviado/i)) {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  }

  /** Arranca automação Cypress Ship2U no servidor (mesmo processo que o backend). */
  async runShip2uCypress(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ error: 'ID inválido' });
      // `variant`: 'default' (com recolha) | 'sem_retirada'. Aceita via body
      // ou query string; default 'default' para compat retroactiva.
      const rawVariant = String(req.body?.variant ?? req.query?.variant ?? '').trim().toLowerCase();
      const variant = rawVariant === 'sem_retirada' ? 'sem_retirada' : 'default';
      const recipient = await OrderService.getShip2uRecipientForOrder(id);
      const result = await Ship2uCypressRunner.runAndWait(id, recipient, { variant });
      res.json({ success: true, variant, ...result });
    } catch (error) {
      // 1) Falhas técnicas do Cypress (exit code, sinal, timeout, npx em falta).
      //    Avaliar PRIMEIRO — a mensagem «Cypress terminou com código X» contém
      //    "código" e batia falsamente na regex de validação abaixo.
      if (
        typeof error.exitCode === 'number'
        || error.signal
        || error.timedOut
        || error.code === 'ENOENT'
      ) {
        return res.status(502).json({
          error:
            error.code === 'ENOENT'
              ? 'Comando Cypress/npx não encontrado no servidor.'
              : error.message || 'Ship2U Cypress falhou.',
          logTail: error.logTail || null,
          logFile: error.logFile || null,
          logFileRelative: error.logFileRelative || null,
        });
      }
      // 2) Erros de validação vindos do OrderService (morada, telemóvel, etc.).
      if (
        error.message?.match(
          /pedido|entrega|morada|Morada|email|Email|falta|actualiza|Ship2U|Telemóvel|WhatsApp|postal/i,
        )
      ) {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  }

  /** Envia email ao cliente: pedido pronto para levantar na loja (site + recolha). */
  async notifyPickupReady(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ error: 'ID inválido' });
      const adminLabel = typeof req.userId === 'string' ? req.userId : String(req.userId ?? 'admin');
      const result = await OrderService.notifyPickupReadyForWebsiteStore(id, adminLabel);
      res.json(result);
    } catch (error) {
      if (error?.message) {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  }

  /** Pedido levantado pelo cliente na loja (site + recolha) → status entregue. */
  async markPickupCollected(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ error: 'ID inválido' });
      const adminLabel = typeof req.userId === 'string' ? req.userId : String(req.userId ?? 'admin');
      const result = await OrderService.markPickupCollectedForWebsiteStore(id, adminLabel);
      res.json(result);
    } catch (error) {
      if (error?.message) {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  }

  async updateShippingFee(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ error: 'ID inválido' });
      const { shipping_fee } = req.body || {};
      if (shipping_fee === undefined || shipping_fee === null) {
        return res.status(400).json({ error: 'shipping_fee é obrigatório' });
      }
      const result = await OrderService.updatePendingShippingFee(id, shipping_fee);
      res.json(result);
    } catch (error) {
      if (error.message?.match(/pedido|frete|entrega|item/i)) {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  }

  async destroy(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ error: 'ID inválido' });
      const result = await OrderService.deleteOrder(id);
      res.json(result);
    } catch (error) {
      if (error.message?.match(/pedido/i)) {
        return res.status(404).json({ error: error.message });
      }
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      const result = await OrderService.createManualOrder(req.body);
      res.status(201).json(result);
    } catch (error) {
      if (error.message?.match(/stock|item|quantidade|cupão|Cupão|desconto|migração/i)) {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  }

  async createTroca(req, res, next) {
    try {
      const adminUser = req.user?.username || 'admin';
      const result = await ExchangeService.createExchange({
        ...req.body,
        admin_user: adminUser,
      });
      res.status(201).json(result);
    } catch (error) {
      if (error.message?.match(/stock|SKU|Quantidade|Indica|Pedido|reembolso|original|troca|inválid/i)) {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  }

  async getTrocaReturnedSummary(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ error: 'ID inválido' });
      const data = await ExchangeService.getReturnedSummary(id);
      res.json(data);
    } catch (error) { next(error); }
  }

  async couponQuote(req, res, next) {
    try {
      const { code, items } = req.body || {};
      const data = await OrderService.couponQuoteForPdv({ code, items });
      res.json(data);
    } catch (error) {
      if (error.message?.match(/carrinho|inválido|cupão|Indica/i)) {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  }

  async createPdvStripeCheckoutSession(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ error: 'ID inválido' });
      const data = await OrderService.createPdvStripeCheckoutSession(id);
      res.json(data);
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      if (error.message?.match(/Define STRIPE|configurado|STRIPE_SECRET|STRIPE_ADMIN_PUBLIC|origem do admin/i)) {
        return res.status(503).json({ error: error.message });
      }
      if (error.message?.match(/pedido|pendente|PDV|Stripe|inválido|registado/i)) {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  }

  /**
   * Diagnóstico: confirma se o processo Node está com sk_live_ ou sk_test_
   * (ex.: após deploy / PM2 com CWD errado). Requer JWT admin.
   */
  async stripeEnvDiagnostics(req, res) {
    const { ENV_PATH } = require('../config/env');
    const raw = process.env.STRIPE_SECRET_KEY;
    const k = typeof raw === 'string' ? raw.trim() : '';
    let mode = 'unset';
    if (k.startsWith('sk_live_')) mode = 'live';
    else if (k.startsWith('sk_test_')) mode = 'test';
    else if (k) mode = 'invalid_prefix';
    res.json({
      stripe_mode: mode,
      checkout_session_id_prefix: mode === 'live' ? 'cs_live_' : mode === 'test' ? 'cs_test_' : null,
      env_file_resolved: ENV_PATH,
      hint:
        mode === 'test'
          ? 'Servidor com sk_test_: actualiza STRIPE_SECRET_KEY para sk_live_ no ficheiro indicado, reinicia o backend e verifica que não há STRIPE_SECRET_KEY=sk_test no systemd/PM2/Docker.'
          : mode === 'live'
            ? 'Novas Checkout Sessions devem usar URLs com cs_live_.'
            : 'Define STRIPE_SECRET_KEY no .env na raiz do backend.',
    });
  }
}

module.exports = new OrderController();
