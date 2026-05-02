const emailService = require('../services/emailService');

class MailController {
  /**
   * POST /api/orders/mail/test
   * Body opcional: { "to": "email@exemplo.com" }
   * Requer JWT (authMiddleware no router).
   */
  async test(req, res, next) {
    try {
      const to = req.body?.to;
      if (!emailService.isMailConfigured()) {
        return res.status(503).json({
          error: 'E-mail não configurado',
          missing: emailService.missingMailEnvKeys(),
        });
      }
      if (!emailService.mailSendingEnabled()) {
        return res.status(503).json({ error: 'MAIL_SENDING_ENABLED=0 — envio desactivado' });
      }
      const result = await emailService.sendTestMail(to);
      res.json({ ok: true, ...result });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new MailController();
