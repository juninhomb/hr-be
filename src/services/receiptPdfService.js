const PDFDocument = require('pdfkit');

/**
 * Gera o recibo/romaneio como PDF de largura térmica (default 80mm) com
 * altura EXACTA do conteúdo (sem cauda de papel). Mono-página → a impressora
 * corta no fim do trabalho.
 *
 * Estratégia em 2 passes:
 *  1. «medição»: percorre os blocos a desenhar e soma a altura usando
 *     `doc.heightOfString` (com a fonte/tamanho de cada bloco).
 *  2. «render»: cria a página com [largura, alturaTotal] e desenha.
 *
 * Reaproveita a mesma estrutura visual do ecrã (EXPEDIÇÃO / RECIBO DE TROCA).
 */

const PT_PER_MM = 2.834645669;

function fmtMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(x);
}

function fmtPtDate(iso) {
  try { return new Date(iso).toLocaleString('pt-PT'); } catch { return String(iso ?? ''); }
}

function isDeliveryOrder(o) {
  return o.is_delivery === true || o.is_delivery === 'true' || o.is_delivery === 1 || o.is_delivery === '1';
}

function paymentLabel(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'mb_way_ou_transferencia') return 'MB Way ou transferência';
  if (v === 'transferencia') return 'Transferência';
  if (v === 'stripe') return 'Stripe';
  if (v === 'dinheiro') return 'Dinheiro';
  if (!v || v === 'a_definir') return 'A definir';
  return raw;
}

function parseReturnedItems(order) {
  const v = order.returned_items;
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
}

/**
 * Monta a lista de "blocos" a desenhar. Cada bloco:
 *  - { kind:'text', text, font, size, align, gap }
 *  - { kind:'row',  left, right, font, size, gap }   (label esq / valor dir)
 *  - { kind:'rule', gap }                            (linha tracejada)
 *  - { kind:'space', h }
 */
function buildBlocks(order) {
  const blocks = [];
  const isTroca = String(order.origin || '').toLowerCase() === 'troca';
  const delivery = isDeliveryOrder(order);
  const items = Array.isArray(order.items) ? order.items : [];
  const returned = parseReturnedItems(order);
  const ship = Number(order.shipping_fee) || 0;
  const itemsTotal = items.reduce((a, it) => a + Number(it.unit_price || 0) * Number(it.quantity || 0), 0);
  const returnedTotal = returned.reduce((a, r) => a + Number(r.unit_price || 0) * Number(r.quantity || 0), 0);

  const txt = (text, opts = {}) => blocks.push({ kind: 'text', text: String(text ?? ''), font: 'Courier', size: 8, align: 'left', gap: 1.5, ...opts });
  const row = (left, right, opts = {}) => blocks.push({ kind: 'row', left: String(left ?? ''), right: String(right ?? ''), font: 'Courier', size: 8, gap: 1.5, ...opts });
  const rule = () => blocks.push({ kind: 'rule', gap: 3 });
  const space = (h) => blocks.push({ kind: 'space', h });
  // Badge tipo "etiqueta": rectângulo preto centrado com texto branco em destaque.
  const badge = (text, opts = {}) => blocks.push({
    kind: 'badge',
    text: String(text ?? '').toUpperCase(),
    font: 'Courier-Bold',
    size: 11,
    padX: 6,
    padY: 4,
    gap: 3,
    ...opts,
  });

  // Cabeçalho
  txt(isTroca ? 'RECIBO DE TROCA' : 'EXPEDIÇÃO', { font: 'Courier-Bold', size: 11, align: 'center', gap: 2 });

  // Tipo de entrega — só recibos normais (troca não tem expedição).
  // Black bg + white text para destacar imediatamente para a equipa.
  if (!isTroca) {
    badge(delivery ? 'CTT — ENVIO AO DOMICÍLIO' : 'RECOLHA NA LOJA');
  }

  txt(isTroca ? `Troca #${order.id}` : `Pedido #${order.id}`, { font: 'Courier-Bold', size: 9, align: 'center', gap: 1 });
  if (isTroca && order.parent_order_id != null) {
    txt(`do pedido #${order.parent_order_id}`, { align: 'center', size: 7.5 });
  }
  txt(fmtPtDate(order.created_at), { align: 'center', size: 7.5 });
  txt(`${String(order.origin || '—').toUpperCase()} · ${paymentLabel(order.payment_method)}`, { align: 'center', size: 7.5 });
  txt(`Estado: ${String(order.status || '').replace('_', ' ')}`, { align: 'center', size: 7.5 });

  rule();

  // Cliente
  txt('CLIENTE', { font: 'Courier-Bold', size: 7.5 });
  txt(order.full_name || '—');
  if (order.whatsapp_number) txt(order.whatsapp_number, { size: 7.5 });
  if (order.email) txt(order.email, { size: 7.5 });

  // Envio (só fora de troca)
  if (!isTroca) {
    rule();
    txt('ENVIO', { font: 'Courier-Bold', size: 7.5 });
    txt(order.address?.trim() || '— sem morada —');
    if (order.customer_notes?.trim()) {
      txt('Notas', { font: 'Courier-Bold', size: 7 });
      txt(order.customer_notes.trim(), { size: 7.5 });
    }
  }

  // Devolvidos (troca)
  if (isTroca && returned.length) {
    rule();
    txt('DEVOLVIDOS', { font: 'Courier-Bold', size: 7.5 });
    for (const r of returned) {
      row(`${r.quantity}x ${r.sku}`, `- ${fmtMoney(Number(r.unit_price || 0) * Number(r.quantity || 0))}`, { size: 7.5 });
    }
    row('Subtotal devolvido', `- ${fmtMoney(returnedTotal)}`, { size: 7.5 });
  }

  rule();

  // Artigos
  txt(isTroca ? 'NOVOS ARTIGOS' : 'ARTIGOS', { font: 'Courier-Bold', size: 7.5 });
  for (const it of items) {
    txt(`${it.quantity}x ${it.product_name || it.sku || '—'}`, { font: 'Courier-Bold', size: 8, gap: 0.5 });
    const caption = [it.color, it.size].filter(Boolean).join(' · ') || '—';
    row(`${caption}  ${it.sku || ''}`, fmtMoney(Number(it.unit_price || 0) * Number(it.quantity || 0)), { size: 7 });
  }

  rule();

  // Totais
  if (isTroca) {
    row('Subtotal novos', fmtMoney(itemsTotal), { size: 8 });
    row('Devolvido', `- ${fmtMoney(returnedTotal)}`, { size: 8 });
    row('DIFERENÇA', fmtMoney(order.total_amount), { font: 'Courier-Bold', size: 10 });
  } else {
    row('Subtotal', fmtMoney(itemsTotal), { size: 8 });
    if (Number(order.discount_amount || 0) > 0.004) {
      row(`Desc.${order.coupon_code ? ` (${order.coupon_code})` : ''}`, `- ${fmtMoney(order.discount_amount)}`, { size: 8 });
    }
    if (ship > 0.004) row('Portes', fmtMoney(ship), { size: 8 });
    row('TOTAL', fmtMoney(order.total_amount), { font: 'Courier-Bold', size: 10 });
  }

  rule();
  txt(
    isTroca ? 'Recibo de troca — controlo interno.' : 'Controlo interno — após embalar, marcar «Enviar via CTT».',
    { align: 'center', size: 6.5, gap: 0 },
  );

  return blocks;
}

/**
 * @param {object} order  resultado de OrderService.getOrderById
 * @param {object} opts   { paperMm=80, contentMm=72 }
 * @returns {Promise<Buffer>}
 */
function generateReceiptPdf(order, opts = {}) {
  const paperMm = Number(opts.paperMm) > 0 ? Number(opts.paperMm) : 58;
  const contentMm = Number(opts.contentMm) > 0
    ? Number(opts.contentMm)
    : Math.max(40, paperMm - 10);
  // Altura de página FIXA (mm) para casar exatamente com o papel do driver
  // (ex.: POS-80 com "Printer Paper 80(72) x 210mm"). Quando definida, a página
  // tem sempre esta altura — uma só página igual à do driver, sem paginação/feed
  // infinito. Conteúdo maior do que isto faz a página crescer (nunca corta).
  const pageHeightMm = Number(opts.pageHeightMm) > 0 ? Number(opts.pageHeightMm) : 0;
  // A página PDF usa a largura ÚTIL (content), não o rolo físico inteiro —
  // evita o diálogo de impressão forçar 80×297 mm quando o conteúdo é mais estreito.
  const pageWidthMm = Math.min(contentMm, paperMm);
  const pageWidth = pageWidthMm * PT_PER_MM;
  const marginX = 3;
  const contentWidth = pageWidth - marginX * 2;
  const topPad = 4;
  const bottomPad = 6;

  const blocks = buildBlocks(order);

  // ---- PASS 1: medir altura ----
  const measureDoc = new PDFDocument({ autoFirstPage: false });
  let total = topPad;
  for (const b of blocks) {
    if (b.kind === 'space') { total += b.h; continue; }
    if (b.kind === 'rule') { total += 1 + (b.gap || 0); continue; }
    if (b.kind === 'text') {
      measureDoc.font(b.font).fontSize(b.size);
      total += measureDoc.heightOfString(b.text, { width: contentWidth, align: b.align }) + (b.gap || 0);
      continue;
    }
    if (b.kind === 'row') {
      measureDoc.font(b.font).fontSize(b.size);
      // a row ocupa a altura do lado que for mais alto (left pode quebrar linha)
      const hLeft = measureDoc.heightOfString(b.left, { width: contentWidth * 0.68 });
      const hRight = measureDoc.heightOfString(b.right, { width: contentWidth * 0.3 });
      total += Math.max(hLeft, hRight) + (b.gap || 0);
      continue;
    }
    if (b.kind === 'badge') {
      measureDoc.font(b.font).fontSize(b.size);
      const innerW = contentWidth - b.padX * 2;
      const hText = measureDoc.heightOfString(b.text, { width: innerW, align: 'center' });
      total += hText + b.padY * 2 + (b.gap || 0);
      continue;
    }
  }
  measureDoc.end();
  const contentHeight = Math.ceil(total + bottomPad);
  // Se houver altura fixa pedida, usa-a — exceto se o conteúdo for maior
  // (nesse caso cresce para não cortar nada).
  const pageHeight = pageHeightMm > 0
    ? Math.max(contentHeight, Math.ceil(pageHeightMm * PT_PER_MM))
    : contentHeight;

  // ---- PASS 2: render ----
  const doc = new PDFDocument({
    size: [pageWidth, pageHeight],
    margins: { top: topPad, bottom: bottomPad, left: marginX, right: marginX },
  });

  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  let y = topPad;
  for (const b of blocks) {
    if (b.kind === 'space') { y += b.h; continue; }
    if (b.kind === 'rule') {
      doc.save()
        .lineWidth(0.5)
        .dash(2, { space: 1.5 })
        .moveTo(marginX, y)
        .lineTo(marginX + contentWidth, y)
        .stroke('#000')
        .undash()
        .restore();
      y += 1 + (b.gap || 0);
      continue;
    }
    if (b.kind === 'text') {
      doc.font(b.font).fontSize(b.size).fillColor('#000');
      const h = doc.heightOfString(b.text, { width: contentWidth, align: b.align });
      doc.text(b.text, marginX, y, { width: contentWidth, align: b.align });
      y += h + (b.gap || 0);
      continue;
    }
    if (b.kind === 'row') {
      doc.font(b.font).fontSize(b.size).fillColor('#000');
      const leftW = contentWidth * 0.68;
      const rightW = contentWidth * 0.3;
      const hLeft = doc.heightOfString(b.left, { width: leftW });
      const hRight = doc.heightOfString(b.right, { width: rightW });
      const h = Math.max(hLeft, hRight);
      doc.text(b.left, marginX, y, { width: leftW, align: 'left' });
      doc.text(b.right, marginX + contentWidth - rightW, y, { width: rightW, align: 'right' });
      y += h + (b.gap || 0);
      continue;
    }
    if (b.kind === 'badge') {
      doc.font(b.font).fontSize(b.size);
      const innerW = contentWidth - b.padX * 2;
      const hText = doc.heightOfString(b.text, { width: innerW, align: 'center' });
      const boxH = hText + b.padY * 2;
      // Rectângulo preto cheio em toda a largura útil.
      doc.save()
        .rect(marginX, y, contentWidth, boxH)
        .fill('#000')
        .restore();
      // Texto branco centrado em cima.
      doc.fillColor('#fff')
        .text(b.text, marginX + b.padX, y + b.padY, { width: innerW, align: 'center' });
      // Reset cor para não contaminar blocos seguintes.
      doc.fillColor('#000');
      y += boxH + (b.gap || 0);
      continue;
    }
  }

  doc.end();
  return done;
}

module.exports = { generateReceiptPdf };
