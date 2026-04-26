const CustomerService = require('../services/customerService');

class CustomerController {
  async list(req, res, next) {
    try {
      const { search } = req.query;
      const customers = await CustomerService.getAllCustomers(search);
      res.json(customers);
    } catch (error) { next(error); }
  }

  async show(req, res, next) {
    try {
      const { whatsapp } = req.params;
      const customer = await CustomerService.getCustomerByPhone(whatsapp);
      if (!customer) return res.status(404).json({ error: 'Cliente não encontrada' });
      res.json(customer);
    } catch (error) { next(error); }
  }

  async store(req, res, next) {
    try {
      const customer = await CustomerService.upsertCustomer(req.body);
      res.status(201).json(customer);
    } catch (error) { next(error); }
  }
}

module.exports = new CustomerController();