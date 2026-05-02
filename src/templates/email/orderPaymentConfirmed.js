/**
 * E-mail único quando o pagamento é confirmado (Stripe webhook ou staff no backoffice).
 * @param {object} payload
 * @param {number|string} payload.orderId
 * @param {string} [payload.customerName]
 * @param {number|string} payload.totalAmount
 * @param {number|string} [payload.shippingFee]
 * @param {boolean} [payload.isDelivery]
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
  const q = num(it.quantity);
  const u = num(it.unit_price);
  return q * u;
}

/** Soma dos subtotais por linha (produtos). */
function itemsSubtotal(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((acc, it) => acc + lineUnitTotal(it), 0);
}

function linesText(items) {
  if (!Array.isArray(items) || items.length === 0) return '  (sem linhas de detalhe)';
  return items
    .map((it, i) => {
      const name = it.product_name || it.sku || 'Artigo';
      const sku = it.sku || '—';
      const varPart = variantCaption(it);
      const varStr = varPart ? ` | ${varPart}` : '';
      const q = num(it.quantity);
      const u = num(it.unit_price);
      const lineTot = lineUnitTotal(it);
      const pricePart = u > 0 || lineTot > 0
        ? `  ${q} × ${fmtMoney(u)} = ${fmtMoney(lineTot)}`
        : `  quantidade: ${q}`;
      return `  ${i + 1}. ${name}${varStr}\n     ref. ${sku}\n${pricePart}`;
    })
    .join('\n\n');
}

function linesHtml(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p style="color:#666">—</p>';
  }
  const rows = items
    .map((it) => {
      const name = escapeHtml(it.product_name || it.sku || 'Artigo');
      const sku = escapeHtml(it.sku || '—');
      const varPart = variantCaption(it);
      const varHtml = varPart
        ? `<div style="font-size:13px;color:#555;margin-top:2px">${escapeHtml(varPart)}</div>`
        : '';
      const q = num(it.quantity);
      const u = num(it.unit_price);
      const lineTot = lineUnitTotal(it);
      const priceCell = u > 0 || lineTot > 0
        ? `${escapeHtml(fmtMoney(u))} × ${q}<br/><strong>${escapeHtml(fmtMoney(lineTot))}</strong>`
        : `× ${q}`;
      return `<tr>
  <td style="padding:10px 8px;border-bottom:1px solid #eee;vertical-align:top">
    <strong>${name}</strong>${varHtml}
    <div style="font-size:12px;color:#888;margin-top:4px">SKU ${sku}</div>
  </td>
  <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${priceCell}</td>
</tr>`;
    })
    .join('');
  return `<table style="width:100%;border-collapse:collapse;margin:8px 0">${rows}</table>`;
}

function summaryText({ isDelivery, shippingFee, subtotal, totalAmount }) {
  const ship = num(shippingFee);
  const showShip = Boolean(isDelivery) && ship > 0.009;
  const total = num(totalAmount);
  const lines = [];
  lines.push(`Subtotal (artigos): ${fmtMoney(subtotal)}`);
  if (showShip) {
    lines.push(`Portes de envio: ${fmtMoney(ship)}`);
    lines.push(`Total pago (artigos + portes): ${fmtMoney(total)}`);
    lines.push('');
    lines.push('O valor total pago inclui os portes de envio indicados acima.');
  } else {
    lines.push(`Total pago: ${fmtMoney(total)}`);
  }
  return lines.join('\n');
}

function summaryHtml({ isDelivery, shippingFee, subtotal, totalAmount }) {
  const ship = num(shippingFee);
  const showShip = Boolean(isDelivery) && ship > 0.009;
  const total = num(totalAmount);
  const extra = showShip
    ? `<p style="margin:12px 0 0;font-size:14px;color:#444">O <strong>total pago</strong> inclui os <strong>portes de envio</strong>.</p>`
    : '';
  const shipRow = showShip
    ? `<tr><td style="padding:6px 0">Portes de envio</td><td style="padding:6px 0;text-align:right">${escapeHtml(fmtMoney(ship))}</td></tr>`
    : '';
  const totalLabel = showShip ? 'Total pago (artigos + portes)' : 'Total pago';
  return `
<table style="width:100%;max-width:400px;margin:16px 0;border-top:1px solid #ddd;padding-top:12px">
  <tr><td style="padding:6px 0">Subtotal (artigos)</td><td style="padding:6px 0;text-align:right">${escapeHtml(fmtMoney(subtotal))}</td></tr>
  ${shipRow}
  <tr><td style="padding:10px 0 0"><strong>${escapeHtml(totalLabel)}</strong></td><td style="padding:10px 0 0;text-align:right;font-size:18px"><strong>${escapeHtml(fmtMoney(total))}</strong></td></tr>
</table>
${extra}`.trim();
}

function build({ orderId, customerName, totalAmount, shippingFee, isDelivery, items }) {
  const name = customerName?.trim() || 'Cliente';
  const oid = escapeHtml(orderId);
  const subtotal = itemsSubtotal(items || []);
  const deliveryPhrase = isDelivery
    ? 'Os artigos serão enviados para a morada indicada na encomenda.'
    : 'Para levantamento / entrega combinada connosco, entraremos em contacto caso seja necessário.';

  const subject = `[HR Store] Pagamento confirmado — pedido #${orderId}`;

  const text = `Olá ${name},

Confirmámos o pagamento do teu pedido #${orderId}.

Produtos encomendados:
${linesText(items)}

${summaryText({ isDelivery, shippingFee, subtotal, totalAmount })}

${deliveryPhrase}

Obrigado pela compra na HR Store.
`;

  const html = `
<!DOCTYPE html>
<html lang="pt">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"/></head>
<body style="font-family:system-ui,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;background:#fafafa;margin:0;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;padding:28px;border-radius:8px;border:1px solid #e8e8e8">
    <p>Olá <strong>${escapeHtml(name)}</strong>,</p>
    <p>Confirmámos o <strong>pagamento</strong> do teu pedido <strong>#${oid}</strong>.</p>
    <p style="margin-top:20px"><strong>Produtos encomendados</strong></p>
    ${linesHtml(items)}
    ${summaryHtml({ isDelivery, shippingFee, subtotal, totalAmount })}
    <p style="margin-top:20px">${escapeHtml(deliveryPhrase)}</p>
    <p style="margin-top:28px;color:#555">Obrigado pela compra na HR Store.</p>
  </div>
</body>
</html>`.trim();

  return { subject, text: text.trim(), html };
}

module.exports = { build };
