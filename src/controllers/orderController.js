const OrderService = require('../services/orderService');

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

  async confirm(req, res, next) {
    try {
      const { orderId, items } = req.body;
      if (!orderId) return res.status(400).json({ error: 'orderId é obrigatório' });
      const result = await OrderService.confirmPayment(orderId, items || null);
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
      if (error.message?.match(/pedido|pago/i)) {
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
      if (error.message?.match(/stock|item|quantidade/i)) {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  }
}

module.exports = new OrderController();
