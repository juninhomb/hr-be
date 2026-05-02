/**
 * E-mail quando o staff libera levantamento na loja (site + sem entrega).
 * @param {object} p
 * @param {number|string} p.orderId
 * @param {string} [p.customerName]
 * @param {{ product_name?: string, sku?: string, quantity?: number, color?: string|null, size?: string|null }[]} [p.items]
 * @param {{ address?: string, notes?: string }} p.store
 */

function escapeHtml(s) {
  const t = String(s ?? '');
  return t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function variantCaption(it) {
  const parts = [it.color, it.size]
    .map((v) => (v == null ? '' : String(v).trim()))
    .filter(Boolean);
  return parts.join(' · ');
}

function linesText(items) {
  if (!Array.isArray(items) || items.length === 0) return '  (ver detalhe no teu email de confirmação de pagamento)';
  return items
    .map((it, i) => {
      const name = it.product_name || it.sku || 'Artigo';
      const v = variantCaption(it);
      const q = Number(it.quantity) || 0;
      const extra = v ? ` (${v})` : '';
      return `  ${i + 1}. ${name}${extra} — SKU ${it.sku || '—'} × ${q}`;
    })
    .join('\n');
}

function linesHtml(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p style="color:#666">Lista de artigos no email de confirmação de pagamento.</p>';
  }
  const lis = items.map((it) => {
    const name = escapeHtml(it.product_name || it.sku || 'Artigo');
    const v = variantCaption(it);
    const vhtml = v ? ` <span style="color:#555">(${escapeHtml(v)})</span>` : '';
    const q = Number(it.quantity) || 0;
    return `<li>${name}${vhtml} — <span style="font-size:13px">SKU ${escapeHtml(it.sku || '—')} × ${q}</span></li>`;
  });
  return `<ul style="margin:8px 0;padding-left:20px">${lis.join('')}</ul>`;
}

function storeParagraphs(store) {
  const addr = store?.address?.trim();
  const notes = store?.notes?.trim();
  const lines = [];
  if (addr) lines.push(addr);
  if (notes) lines.push(notes);
  if (lines.length === 0) {
    lines.push(
      'Confirma no site ou através dos nossos contactos habituais o horário e a morada para levantamento.',
    );
  }
  return lines;
}

function build({ orderId, customerName, items, store }) {
  const name = customerName?.trim() || 'Cliente';
  const oid = escapeHtml(orderId);
  const paras = storeParagraphs(store || {});

  const subject = `[HR Store] Pedido #${orderId} disponível para levantamento na loja`;

  const addrBlock = paras.map((p) => `- ${p}`).join('\n');

  const text = `Olá ${name},

O teu pedido #${orderId} está pronto para levantamento na nossa loja.

Artigos:
${linesText(items)}

Onde e como levantar:
${addrBlock}

Identifica-te com o número do pedido (#${orderId}) no balcão. Se tiveres dúvidas, responde a este email ou contacta-nos pelos canais habituais.

Obrigado pela preferência,
HR Store
`.trim();

  const storeHtml = paras
    .map((p) => `<p style="margin:6px 0">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');

  const html = `
<!DOCTYPE html>
<html lang="pt">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"/></head>
<body style="font-family:system-ui,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;background:#fafafa;margin:0;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;padding:28px;border-radius:8px;border:1px solid #e8e8e8">
    <p>Olá <strong>${escapeHtml(name)}</strong>,</p>
    <p>O teu pedido <strong>#${oid}</strong> está <strong>pronto para levantamento</strong> na nossa loja.</p>
    <p style="margin-top:20px"><strong>Artigos</strong></p>
    ${linesHtml(items)}
    <p style="margin-top:20px"><strong>Onde e como levantar</strong></p>
    <div style="background:#f6f6f6;border-radius:8px;padding:14px 16px;margin:8px 0">
      ${storeHtml}
    </div>
    <p style="margin-top:16px;font-size:14px;color:#444">No balcão, indica o <strong>número do pedido (#${oid})</strong>. Em caso de dúvida, responde a este email.</p>
    <p style="margin-top:28px;color:#555">Obrigado pela preferência,<br/>HR Store</p>
  </div>
</body>
</html>`.trim();

  return { subject, text, html };
}

module.exports = { build };
