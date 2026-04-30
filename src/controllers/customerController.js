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
      if (!customer) return res.status(404).json({ error: 'Cliente não encontrado.' });
      res.json(customer);
    } catch (error) { next(error); }
  }

  async store(req, res, next) {
    try {
      const customer = await CustomerService.upsertCustomer(req.body || {});
      res.status(201).json(customer);
    } catch (error) {
      if (error.code === '23514') {
        return res.status(400).json({
          error: 'Formato de número inválido na base — 10–15 dígitos com país (ex.: 351912345678).',
        });
      }
      if (error.status) return res.status(error.status).json({ error: error.message });
      next(error);
    }
  }

  async destroySavedAddress(req, res, next) {
    try {
      const { whatsapp, addressId } = req.params;
      const ok = await CustomerService.deleteSavedAddress(whatsapp, addressId);
      if (!ok) return res.status(404).json({ error: 'Morada não encontrada.' });
      res.status(204).send();
    } catch (error) {
      if (error.status) return res.status(error.status).json({ error: error.message });
      next(error);
    }
  }

  async storeSavedAddress(req, res, next) {
    try {
      const detail = await CustomerService.addSavedAddress(req.params.whatsapp, req.body || {});
      res.status(201).json(detail);
    } catch (error) {
      if (error.status) return res.status(error.status).json({ error: error.message });
      next(error);
    }
  }

  async destroy(req, res, next) {
    try {
      const { whatsapp } = req.params;
      const deleted = await CustomerService.deleteCustomer(whatsapp);
      if (!deleted) return res.status(404).json({ error: 'Cliente não encontrado.' });
      res.status(204).send();
    } catch (error) { next(error); }
  }
}

module.exports = new CustomerController();