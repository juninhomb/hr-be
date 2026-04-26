const DashboardService = require('../services/dashboardService');

class DashboardController {
  async getStats(req, res, next) {
    try {
      const stats = await DashboardService.getStats();
      res.json(stats);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new DashboardController();