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

  async confirm(req, res, next) {
    try {
      const { orderId, sku } = req.body;
      const result = await OrderService.confirmPayment(orderId, sku);
      res.json(result);
    } catch (error) { next(error); }
  }

  async create(req, res, next) {
    try {
      const result = await OrderService.createManualOrder(req.body);
      res.status(201).json(result);
    } catch (error) { next(error); }
  }
}

module.exports = new OrderController();