/**
 * Email enviado À EQUIPA (não ao cliente) quando o site cria um pedido
 * com pagamento manual (MB Way / transferência) — fica em
 * `aguardando_pagamento` e precisa de monitorização manual da entrada
 * no MB Way ou no extracto bancário para depois ser confirmado no admin.
 *
 * @param {object} payload
 * @param {number|string} payload.orderId
 * @param {string} [payload.customerName]
 * @param {string} [payload.customerEmail]
 * @param {string} [payload.customerWhatsapp]
 * @param {number|string} payload.totalAmount
 * @param {number|string} [payload.shippingFee]
 * @param {boolean} [payload.isDelivery]
 * @param {string} [payload.paymentMethod]
 * @param {{ product_name?: string, sku?: string, quantity?: number, unit_price?: number|string, color?: string|null, size?: string|null }[]} [payload.items]
 */

function escapeHtml(s) {
  const t = String(s ?? '');
  return t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(x);
}

function variantCaption(it) {
  const parts = [it.color, it.size]
    .map((v) => (v == null ? '' : String(v).trim()))
    .filter(Boolean);
  return parts.join(' · ');
}

function lineUnitTotal(it) {
  const q = Number(it.quantity) || 0;
  const u = Number(it.unit_price) || 0;
  return q * u;
}

function paymentLabel(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'mb_way_ou_transferencia') return 'MB Way ou transferência';
  if (v === 'mb_way' || v === 'mbway') return 'MB Way';
  if (v === 'transferencia') return 'Transferência bancária';
  if (v === 'a_definir' || !v) return 'A definir (MB Way / transferência)';
  if (v === 'stripe') return 'Stripe (cartão / Klarna)';
  return raw;
}

function build({
  orderId,
  customerName,
  customerEmail,
  customerWhatsapp,
  totalAmount,
  shippingFee,
  isDelivery,
  paymentMethod,
  items,
}) {
  const subject = `[HR Store] Pedido #${orderId} — aguardando pagamento (${paymentLabel(paymentMethod)})`;

  const ship = Number(shippingFee) || 0;
  const itemsList = Array.isArray(items) ? items : [];

  // ---------- TEXT ----------
  const textLines = [
    `Novo pedido no site aguarda confirmação de pagamento.`,
    ``,
    `Pedido: #${orderId}`,
    `Cliente: ${customerName || '—'}`,
    customerWhatsapp ? `WhatsApp: ${customerWhatsapp}` : null,
    customerEmail ? `Email: ${customerEmail}` : null,
    ``,
    `Pagamento: ${paymentLabel(paymentMethod)}`,
    `Entrega ao domicílio: ${isDelivery ? 'sim' : 'não (levantamento na loja)'}`,
    ship > 0 ? `Portes: ${fmtMoney(ship)}` : null,
    `Total a cobrar: ${fmtMoney(totalAmount)}`,
    ``,
    `Itens:`,
    ...itemsList.map((it) => {
      const caption = variantCaption(it);
      const sub = fmtMoney(lineUnitTotal(it));
      return `  ${it.quantity}× ${it.product_name || it.sku || '—'}${caption ? ` (${caption})` : ''} · ${it.sku || ''} · ${sub}`;
    }),
    ``,
    `Próximo passo: monitorizar entrada do MB Way ou extracto bancário; quando entrar, confirmar pagamento no admin.`,
  ].filter(Boolean);

  const text = textLines.join('\n') + '\n';

  // ---------- HTML ----------
  const itemRows = itemsList
    .map((it) => {
      const caption = variantCaption(it);
      const sub = fmtMoney(lineUnitTotal(it));
      return `
        <tr>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;">
            <strong>${escapeHtml(String(it.quantity ?? ''))}×</strong>
            ${escapeHtml(it.product_name || it.sku || '—')}
            ${caption ? `<br><span style="color:#666;font-size:11px;">${escapeHtml(caption)}</span>` : ''}
            <br><span style="color:#999;font-size:11px;font-family:ui-monospace,monospace;">${escapeHtml(it.sku || '')}</span>
          </td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;text-align:right;font-family:ui-monospace,monospace;">${escapeHtml(sub)}</td>
        </tr>`;
    })
    .join('');

  const html = `<!doctype html>
<html lang="pt-PT">
  <body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#111;background:#FBF8F4;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #eee;border-radius:16px;padding:24px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#B5562C;">Aguardando pagamento</p>
      <h1 style="margin:0 0 12px;font-size:22px;line-height:1.2;">Pedido #${escapeHtml(orderId)} — site</h1>
      <p style="margin:0 0 16px;color:#444;font-size:14px;line-height:1.5;">
        Novo pedido com pagamento <strong>${escapeHtml(paymentLabel(paymentMethod))}</strong>. Monitorizar entrada e confirmar no admin.
      </p>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:16px 0;font-size:13px;">
        <div><div style="color:#777;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Cliente</div><div style="font-weight:600;">${escapeHtml(customerName || '—')}</div></div>
        ${customerWhatsapp ? `<div><div style="color:#777;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">WhatsApp</div><div style="font-family:ui-monospace,monospace;">${escapeHtml(customerWhatsapp)}</div></div>` : ''}
        ${customerEmail ? `<div style="grid-column:1/-1;"><div style="color:#777;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Email</div><div>${escapeHtml(customerEmail)}</div></div>` : ''}
      </div>

      <div style="margin:16px 0;padding:12px;border:1px solid #eee;border-radius:12px;background:#FBF8F4;">
        <div style="display:flex;justify-content:space-between;font-size:13px;">
          <span>Entrega ao domicílio</span>
          <strong>${isDelivery ? 'Sim' : 'Não (levantamento)'}</strong>
        </div>
        ${ship > 0 ? `<div style="display:flex;justify-content:space-between;font-size:13px;margin-top:4px;"><span>Portes</span><strong>${escapeHtml(fmtMoney(ship))}</strong></div>` : ''}
        <div style="display:flex;justify-content:space-between;font-size:15px;margin-top:8px;border-top:1px dashed #ccc;padding-top:8px;">
          <span><strong>Total a cobrar</strong></span>
          <strong style="font-family:ui-monospace,monospace;">${escapeHtml(fmtMoney(totalAmount))}</strong>
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-top:8px;">
        <thead>
          <tr>
            <th style="text-align:left;padding:6px 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#777;border-bottom:1px solid #ddd;">Item</th>
            <th style="text-align:right;padding:6px 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#777;border-bottom:1px solid #ddd;">Subtotal</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <p style="margin:20px 0 0;font-size:12px;color:#666;line-height:1.5;">
        Quando o pagamento entrar, confirma no admin (<em>Vendas → Pedidos Pendentes → Confirmar Pagamento</em>) — o cliente recebe automaticamente o email de confirmação.
      </p>
    </div>
  </body>
</html>`;

  return { subject, text, html };
}

module.exports = { build };
