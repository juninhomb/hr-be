/**
 * E-mail quando o pedido com entrega passa a estado «enviado» (CTT) no admin.
 * Sem código de tracking no corpo (uso interno apenas).
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

function num(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function variantCaption(it) {
  const parts = [it.color, it.size]
    .map((v) => (v == null ? '' : String(v).trim()))
    .filter(Boolean);
  return parts.join(' · ');
}

function lineUnitTotal(it) {
  return num(it.quantity) * num(it.unit_price);
}

function itemsSubtotal(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((acc, it) => acc + lineUnitTotal(it), 0);
}

function linesText(items) {
  if (!Array.isArray(items) || items.length === 0) return '  (sem detalhe)';
  return items
    .map((it, i) => {
      const name = it.product_name || it.sku || 'Artigo';
      const varPart = variantCaption(it);
      const varStr = varPart ? ` | ${varPart}` : '';
      return `  ${i + 1}. ${name}${varStr} — ×${num(it.quantity)}`;
    })
    .join('\n');
}

function linesHtml(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p style="color:#666">—</p>';
  }
  const rows = items
    .map((it) => {
      const name = escapeHtml(it.product_name || it.sku || 'Artigo');
      const varPart = variantCaption(it);
      const varHtml = varPart
        ? `<div style="font-size:13px;color:#555;margin-top:2px">${escapeHtml(varPart)}</div>`
        : '';
      return `<tr>
  <td style="padding:10px 8px;border-bottom:1px solid #eee;vertical-align:top">
    <strong>${name}</strong>${varHtml}
    <div style="font-size:12px;color:#666;margin-top:4px">× ${num(it.quantity)}</div>
  </td>
</tr>`;
    })
    .join('\n');
  return `<table style="width:100%;border-collapse:collapse">${rows}</table>`;
}

/**
 * @param {{ orderId: number|string, customerName?: string,
 *   totalAmount?: number|string, shippingFee?: number|string|null, isDelivery?: boolean, items?: unknown[] }} payload
 */
function build({ orderId, customerName, totalAmount, shippingFee, isDelivery, items }) {
  const name = customerName?.trim() || 'Cliente';
  const oid = escapeHtml(orderId);

  const subtotal = itemsSubtotal(items || []);
  const ship = num(shippingFee);
  const showShip = Boolean(isDelivery) && ship > 0.009;
  const summaryLines = [
    `Subtotal (artigos): ${fmtMoney(subtotal)}`,
    ...(showShip ? [`Portes: ${fmtMoney(ship)}`] : []),
    `Total pago: ${fmtMoney(totalAmount)}`,
  ].join('\n');

  const subject = `[HR Store] Pedido #${orderId} enviado`;

  const text = `Olá ${name},

O teu pedido #${orderId} foi enviado para entrega (CTT).

Resumo:
${summaryLines}

Artigos:
${linesText(items)}

Obrigado pela preferência. Em caso de dúvida, responde a este email.
— HR Store
`.trim();

  const html = `
<!DOCTYPE html>
<html lang="pt">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"/></head>
<body style="font-family:system-ui,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;background:#fafafa;margin:0;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;padding:28px;border-radius:8px;border:1px solid #e8e8e8">
    <p>Olá <strong>${escapeHtml(name)}</strong>,</p>
    <p>O teu pedido <strong>#${oid}</strong> foi <strong>enviado</strong> para entrega.</p>
    <p style="margin-top:20px"><strong>Artigos</strong></p>
    ${linesHtml(items)}
    <p style="margin-top:16px;font-size:14px;color:#444"><strong>Resumo</strong><br/>
      Subtotal: ${escapeHtml(fmtMoney(subtotal))}<br/>
      ${showShip ? `Portes: ${escapeHtml(fmtMoney(ship))}<br/>` : ''}
      <strong>Total pago: ${escapeHtml(fmtMoney(totalAmount))}</strong>
    </p>
    <p style="margin-top:28px;color:#555">Obrigado pela preferência.</p>
  </div>
</body>
</html>`.trim();

  return { subject, text, html };
}

module.exports = { build };
