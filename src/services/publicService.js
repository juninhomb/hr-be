const db = require('../config/db');
const ShippingService = require('./shippingService');
const stripeCheckoutService = require('./stripeCheckoutService');
const { assertValidWhatsappOrThrow, canonicalWhatsappNumber } = require('../utils/whatsappNormalize');
const { upsertCustomerAddress } = require('./customerAddressService');

/**
 * Serviços de leitura/escrita públicos para o site de vendas (hrstore-site).
 *
 * Princípios:
 *  - Apenas devolve produtos ATIVOS (`products.is_active = true`).
 *  - Agrupa variantes por produto (em vez de devolver linha por SKU).
 *  - Nunca confia em preços vindos do cliente — recalcula sempre a partir da DB.
 *  - O fluxo de checkout cria SEMPRE pedidos `aguardando_pagamento` com
 *    `origin = 'website'`, deixando a confirmação para o admin (mesmo modelo
 *    usado para pedidos vindos do bot WhatsApp via n8n).
 */
class PublicService {
  // -------------------------------------------------------------
  // Catálogo
  // -------------------------------------------------------------

  async listProducts({ search = '', categoryId = null, featured = null } = {}) {
    const params = [];
    const where = ['p.is_active = true'];

    if (search) {
      params.push(`%${search}%`);
      where.push(`(p.name ILIKE $${params.length} OR v.sku ILIKE $${params.length} OR v.color ILIKE $${params.length})`);
    }
    if (categoryId) {
      params.push(parseInt(categoryId, 10));
      where.push(`p.category_id = $${params.length}`);
    }
    if (featured === true) {
      where.push(`p.is_featured = true`);
    } else if (featured === false) {
      where.push(`p.is_featured = false`);
    }

    const sql = `
      SELECT
        p.id              AS product_id,
        p.name,
        p.description,
        p.base_price,
        p.image_placeholder_url,
        p.is_featured,
        p.category_id,
        c.name            AS category_name,
        v.id              AS variant_id,
        v.sku,
        v.color,
        v.size,
        v.stock_quantity,
        v.image_url       AS variant_image_url
      FROM products p
      LEFT JOIN product_variants v ON v.product_id = p.id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.is_featured DESC, p.name ASC, v.id ASC
    `;

    const { rows } = await db.query(sql, params);
    return groupProductRows(rows);
  }

  async getProductById(id) {
    const productId = parseInt(id, 10);
    if (!Number.isFinite(productId)) return null;

    const { rows } = await db.query(
      `
      SELECT
        p.id              AS product_id,
        p.name,
        p.description,
        p.base_price,
        p.image_placeholder_url,
        p.is_featured,
        p.category_id,
        c.name            AS category_name,
        v.id              AS variant_id,
        v.sku,
        v.color,
        v.size,
        v.stock_quantity,
        v.image_url       AS variant_image_url
      FROM products p
      LEFT JOIN product_variants v ON v.product_id = p.id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.id = $1 AND p.is_active = true
      ORDER BY v.id ASC
      `,
      [productId]
    );

    const grouped = groupProductRows(rows);
    return grouped[0] || null;
  }

  /**
   * Checkout: conferência por número (chave interna do cliente) + moradas usadas antes.
   * POST `{ whatsapp_number }` — dados já associados a esse registo no backoffice.
   */
  async getCheckoutHints(rawWhatsapp) {
    const wa = canonicalWhatsappNumber(rawWhatsapp);
    if (!wa) {
      throw publicError(400, 'WhatsApp inválido.');
    }

    const { rows: cust } = await db.query(
      `SELECT id, full_name, email FROM customers WHERE whatsapp_number = $1`,
      [wa],
    );
    if (!cust[0]) {
      return {
        whatsapp_number: wa,
        customer_found: false,
        full_name: null,
        email: null,
        saved_addresses: [],
      };
    }

    const { rows } = await db.query(
      `
      SELECT id, label, street_name, street_number, apartment, address_obs,
             postal_code, city, district, country, updated_at
        FROM customer_addresses
       WHERE customer_id = $1
       ORDER BY updated_at DESC
       LIMIT 12
      `,
      [cust[0].id],
    );

    const saved_addresses = rows.map((r) => {
      const line1 = [r.street_name, r.street_number].filter(Boolean).join(', ');
      const line2 = [r.postal_code, r.city].filter(Boolean).join(' ');
      return {
        id: r.id,
        label: r.label,
        street_name: r.street_name,
        street_number: r.street_number,
        apartment: r.apartment,
        address_obs: r.address_obs,
        postal_code: r.postal_code,
        city: r.city,
        district: r.district,
        country: r.country,
        summary: [line1, line2].filter(Boolean).join(' · '),
      };
    });

    return {
      whatsapp_number: wa,
      customer_found: true,
      full_name: cust[0].full_name,
      email: cust[0].email,
      saved_addresses,
    };
  }

  async listCategories() {
    // Inclui contagem de produtos ativos por categoria + metadados
    // (image_url, description, sort_order) usados pela home do site.
    //
    // A migration `2026-04-30_featured_and_category_images.sql` garante
    // que estas colunas existem em todos os ambientes — ver pasta
    // `database/migrations/` para detalhes.
    const { rows } = await db.query(`
      SELECT
        c.id,
        c.name,
        c.description,
        c.image_url,
        c.sort_order,
        COUNT(p.id) FILTER (WHERE p.is_active = true)::int AS product_count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id
      GROUP BY c.id
      ORDER BY c.sort_order ASC, c.name ASC
    `);
    return rows;
  }

  // -------------------------------------------------------------
  // Checkout
  // -------------------------------------------------------------

  /**
   * Cria pedido vindo do site público.
   *
   * - Faz upsert do cliente pela chave natural `whatsapp_number` (número usado como ID de negócio).
   * - Recalcula o total a partir dos preços da DB (NUNCA confia no cliente).
   * - Deduz stock na criação (regra "Opção B" usada em todo o sistema —
   *   ver `orderService.createManualOrder`).
   * - Gera pedido com `origin = 'website'` e `status = 'aguardando_pagamento'`,
   *   ficando visível em /pendentes do dashboard admin.
   */
  async createWebsiteOrder({ customer, items, delivery, idempotencyKey = null }) {
    if (!customer?.whatsapp_number) {
      throw publicError(400, 'whatsapp_number é obrigatório.');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw publicError(400, 'O carrinho está vazio.');
    }

    // Idempotency: se a key já foi usada, devolve o pedido existente em vez
    // de criar duplicado. Defesa contra retries do navegador.
    if (idempotencyKey) {
      const existing = await db.query(
        `SELECT id, customer_id, total_amount, shipping_fee, shipping_zone_id, status
           FROM orders WHERE idempotency_key = $1`,
        [idempotencyKey]
      );
      if (existing.rows[0]) {
        const o = existing.rows[0];
        return {
          order_id: o.id,
          customer_id: o.customer_id,
          items_total: Number(o.total_amount) - Number(o.shipping_fee || 0),
          shipping_fee: Number(o.shipping_fee || 0),
          shipping_zone: null,
          total_amount: Number(o.total_amount),
          status: o.status,
          idempotent_replay: true,
        };
      }
    }

    const cleanWhatsapp = assertValidWhatsappOrThrow(customer.whatsapp_number);

    const isDelivery = Boolean(delivery?.is_delivery);

    // -------- Morada / contactos extra (site) --------
    // O storefront passa `street`, `postal_code`, `city`, `country`, `phone`.
    // Mantemos `address` legado (free-form) — quando não for enviado, montamos
    // um a partir dos campos estruturados para compatibilidade com WhatsApp.
    const country = (customer.country || 'PT').trim().toUpperCase().slice(0, 2);
    const postalCode = (customer.postal_code || '').trim().slice(0, 20) || null;
    const city = (customer.city || '').trim().slice(0, 150) || null;
    const district = (customer.district || '').trim().slice(0, 120) || null;
    const phone = (customer.phone || '').replace(/\s/g, '').slice(0, 20) || null;
    if (phone && !/^\+?[0-9]{7,15}$/.test(phone)) {
      throw publicError(400, 'Telefone inválido.');
    }
    const street = (customer.street || '').trim();
    const composedAddress = customer.address
      ? String(customer.address).trim()
      : [street, postalCode, city].filter(Boolean).join(', ') || null;

    if (!(customer.full_name || '').trim() || customer.full_name.trim().length < 3) {
      throw publicError(400, 'Nome completo é obrigatório.');
    }
    const emailTrimmed = customer.email?.trim();
    if (!emailTrimmed || !isValidPublicEmail(emailTrimmed)) {
      throw publicError(400, 'Indica um e-mail válido.');
    }

    if (isDelivery) {
      if (!street && !customer.address) {
        throw publicError(400, 'Para entrega, a morada é obrigatória.');
      }
      if (!postalCode) {
        throw publicError(400, 'Código postal é obrigatório para entrega.');
      }
      if (!city?.trim()) {
        throw publicError(400, 'Localidade é obrigatória.');
      }
    } else {
      if (!street && !customer.address) {
        throw publicError(400, 'Indica a tua morada (rua e número).');
      }
      if (!postalCode) {
        throw publicError(400, 'Código postal é obrigatório.');
      }
      if (!city?.trim()) {
        throw publicError(400, 'Localidade é obrigatória.');
      }
    }

    // -------- Frete: SEMPRE calculado pelo servidor --------
    let shippingFee = 0;
    let shippingZone = null;
    if (isDelivery) {
      const subtotalPreview = previewSubtotal(items);
      const quote = await ShippingService.computeFee({
        country,
        postal_code: postalCode,
        subtotal: subtotalPreview,
      });
      if (!quote.zone) {
        throw publicError(
          400,
          'Não fazemos entrega para este destino ainda. Fala connosco pelo WhatsApp.'
        );
      }
      // Zonas marcadas como WhatsApp-only não podem ser fechadas no site:
      // a logística (alfândega, multi-pacotes, taxas variáveis) é tratada
      // caso a caso pela equipa em conversa direta.
      if (quote.zone.requires_whatsapp_checkout) {
        throw publicError(
          409,
          `Para entregas em ${quote.zone.label}, o pedido é finalizado pelo WhatsApp. Vamos abrir a conversa para combinarmos tudo.`
        );
      }
      shippingFee = quote.fee;
      shippingZone = quote.zone;
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // 1) Upsert do cliente (whatsapp_number UNIQUE = chave natural; merge conservador via COALESCE)
      const customerRes = await client.query(
        `INSERT INTO customers
            (full_name, whatsapp_number, email, address,
             postal_code, city, district, country, phone)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (whatsapp_number)
         DO UPDATE SET full_name   = COALESCE(EXCLUDED.full_name, customers.full_name),
                       email       = COALESCE(EXCLUDED.email,     customers.email),
                       address     = COALESCE(EXCLUDED.address,   customers.address),
                       postal_code = COALESCE(EXCLUDED.postal_code, customers.postal_code),
                       city        = COALESCE(EXCLUDED.city,        customers.city),
                       district    = COALESCE(EXCLUDED.district,    customers.district),
                       country     = COALESCE(EXCLUDED.country,     customers.country),
                       phone       = COALESCE(EXCLUDED.phone,       customers.phone)
         RETURNING id`,
        [
          customer.full_name?.trim() || null,
          cleanWhatsapp,
          emailTrimmed,
          composedAddress,
          postalCode,
          city,
          district,
          country,
          phone,
        ]
      );
      const customerId = customerRes.rows[0].id;

      /** Snapshot no pedido também em levantamento (morada de contacto / referência). */
      const deliverySnapshot = composedAddress || null;

      // Morada estruturada na agenda — várias por cliente (entrega ou levantamento)
      const streetNameBk = String(customer.street_name || '').trim().slice(0, 512);
      if (streetNameBk.length >= 2 && postalCode) {
        await upsertCustomerAddress(client, customerId, {
          street_name: streetNameBk,
          street_number: String(customer.street_number ?? '').trim().slice(0, 48),
          apartment: customer.apartment?.trim() || null,
          address_obs: customer.address_obs?.trim() || null,
          postal_code: postalCode,
          city,
          district,
          country,
          label: customer.address_label?.trim()?.slice(0, 80) || null,
        });
      }

      // 2) Re-puxa preços e stock dos SKUs pedidos (uma única query)
      const skus = items.map((i) => String(i.sku).trim()).filter(Boolean);
      if (!skus.length) throw publicError(400, 'Itens inválidos.');

      const variantsRes = await client.query(
        `SELECT v.id, v.sku, v.stock_quantity, p.base_price, p.name
           FROM product_variants v
           INNER JOIN products p ON p.id = v.product_id
          WHERE v.sku = ANY($1::text[]) AND p.is_active = true`,
        [skus]
      );
      const bySku = new Map(variantsRes.rows.map((r) => [r.sku, r]));

      // 3) Cria order header com total temporário (vai ser actualizado)
      const orderRes = await client.query(
        `INSERT INTO orders
            (customer_id, total_amount, status, origin, payment_method,
             is_delivery, shipping_fee, shipping_zone_id, delivery_address,
             idempotency_key)
         VALUES ($1, 0, 'aguardando_pagamento', 'website', $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          customerId,
          customer.payment_method || 'a_definir',
          isDelivery,
          shippingFee,
          shippingZone?.id || null,
          deliverySnapshot,
          idempotencyKey,
        ]
      );
      const orderId = orderRes.rows[0].id;

      // 4) Insere line items + deduz stock atómico
      let itemsTotal = 0;
      for (const it of items) {
        const sku = String(it.sku).trim();
        const qty = parseInt(it.quantity, 10);
        if (!qty || qty <= 0) {
          throw publicError(400, `Quantidade inválida para ${sku}.`);
        }
        const variant = bySku.get(sku);
        if (!variant) {
          throw publicError(400, `SKU inválido: ${sku}.`);
        }

        const stockUpd = await client.query(
          `UPDATE product_variants
              SET stock_quantity = stock_quantity - $1
            WHERE sku = $2 AND stock_quantity >= $1
            RETURNING id`,
          [qty, sku]
        );
        if (stockUpd.rowCount === 0) {
          throw publicError(409, `Stock insuficiente para "${variant.name}" (${sku}).`);
        }

        const unitPrice = Number(variant.base_price);
        await client.query(
          `INSERT INTO order_items (order_id, variant_id, sku, quantity, unit_price)
           VALUES ($1, $2, $3, $4, $5)`,
          [orderId, stockUpd.rows[0].id, sku, qty, unitPrice]
        );
        itemsTotal += unitPrice * qty;
      }

      const finalTotal = itemsTotal + shippingFee;
      await client.query(
        `UPDATE orders SET total_amount = $1 WHERE id = $2`,
        [finalTotal, orderId]
      );

      await client.query('COMMIT');

      // Auditoria — sem bloquear caso falhe
      try {
        await db.query(
          `INSERT INTO audit_logs (admin_user, action, details) VALUES ($1, $2, $3)`,
          ['website', 'website_order_created', JSON.stringify({
            orderId, customerId, total: finalTotal, items: items.length,
            is_delivery: isDelivery, shipping_fee: shippingFee,
            shipping_zone_id: shippingZone?.id || null,
            country, postal_code: postalCode,
          })]
        );
      } catch (e) { /* noop */ }

      return {
        success: true,
        order_id: orderId,
        customer_id: customerId,
        items_total: itemsTotal,
        shipping_fee: shippingFee,
        shipping_zone: shippingZone
          ? { id: shippingZone.id, label: shippingZone.label, region: shippingZone.region }
          : null,
        total_amount: finalTotal,
        status: 'aguardando_pagamento',
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Checkout Stripe: grava pedido (como no fluxo WhatsApp) e abre sessão Stripe.
   * Falha na sessão → reverte stock e apaga o pedido.
   */
  async createWebsiteOrderStripeCheckout({ customer, items, delivery, success_url, cancel_url, idempotencyKey = null }) {
    stripeCheckoutService.getStripeOrThrow();
    assertStripeCheckoutRedirects(success_url, cancel_url);

    const orderPayload = await this.createWebsiteOrder({
      customer: { ...(customer || {}), payment_method: 'stripe' },
      items,
      delivery,
      idempotencyKey,
    });

    try {
      const session = await stripeCheckoutService.createSessionForOrder({
        orderId: orderPayload.order_id,
        customerEmail: customer?.email,
        successUrl: success_url,
        cancelUrl: cancel_url,
      });
      if (!session.url) {
        throw new Error('Stripe não devolveu URL de checkout.');
      }
      return {
        checkout_url: session.url,
        stripe_session_id: session.id,
        order_id: orderPayload.order_id,
        customer_id: orderPayload.customer_id,
        items_total: orderPayload.items_total,
        shipping_fee: orderPayload.shipping_fee,
        shipping_zone: orderPayload.shipping_zone,
        total_amount: orderPayload.total_amount,
        status: orderPayload.status,
      };
    } catch (err) {
      await stripeCheckoutService.cleanupFailedCheckoutOrder(orderPayload.order_id);
      if (err.status) throw err;
      const wrap = new Error(
        err?.message || 'Não foi possível iniciar o pagamento Stripe. Tenta novamente.',
      );
      wrap.status = 502;
      throw wrap;
    }
  }
}

// -------------------------------------------------------------
// Helpers locais
// -------------------------------------------------------------

function groupProductRows(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.product_id)) {
      map.set(r.product_id, {
        id: r.product_id,
        name: r.name,
        description: r.description,
        base_price: Number(r.base_price),
        image_placeholder_url: r.image_placeholder_url,
        is_featured: Boolean(r.is_featured),
        category_id: r.category_id,
        category_name: r.category_name,
        variants: [],
        total_stock: 0,
        colors: new Set(),
        sizes: new Set(),
      });
    }
    const p = map.get(r.product_id);
    if (r.variant_id) {
      const stock = Number(r.stock_quantity || 0);
      p.variants.push({
        id: r.variant_id,
        sku: r.sku,
        color: r.color,
        size: r.size,
        stock_quantity: stock,
        // Imagem específica desta variante (override). Cliente faz fallback
        // para `product.image_placeholder_url` quando esta vier null.
        image_url: r.variant_image_url || null,
      });
      p.total_stock += stock;
      if (r.color) p.colors.add(r.color);
      if (r.size) p.sizes.add(r.size);
    }
  }
  // Set → Array (JSON-friendly)
  return Array.from(map.values()).map((p) => ({
    ...p,
    colors: Array.from(p.colors),
    sizes: Array.from(p.sizes),
  }));
}

/**
 * Estimativa de subtotal apenas para passar ao `ShippingService.computeFee`
 * (decide se aplica `free_above_eur`). Os preços reais são revalidados
 * dentro da transação a partir da DB.
 */
function previewSubtotal(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, it) => {
    const qty = parseInt(it?.quantity, 10) || 0;
    const unit = Number(it?.unit_price);
    if (qty > 0 && Number.isFinite(unit) && unit > 0) return sum + unit * qty;
    return sum;
  }, 0);
}

function publicError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function isValidPublicEmail(s) {
  if (!s || typeof s !== 'string') return false;
  const t = s.trim();
  if (t.length < 5 || t.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

/** valida success/cancel URL para Stripe Checkout (anti open-redirect). */
function assertStripeCheckoutRedirects(successUrl, cancelUrl) {
  if (!successUrl || !cancelUrl) {
    throw publicError(400, 'success_url e cancel_url são obrigatórios.');
  }
  if (!String(successUrl).includes('{CHECKOUT_SESSION_ID}')) {
    throw publicError(
      400,
      'success_url deve incluir o placeholder {CHECKOUT_SESSION_ID} (exigência Stripe).',
    );
  }

  const raw = process.env.STRIPE_CHECKOUT_ALLOWED_ORIGINS?.trim();
  const allowed = raw
    ? raw.split(',').map((s) => s.trim()).filter(Boolean)
    : ['http://localhost:3002', 'http://127.0.0.1:3002'];

  if (process.env.STRIPE_SECRET_KEY?.trim() && !raw) {
    throw publicError(
      500,
      'STRIPE_CHECKOUT_ALLOWED_ORIGINS é obrigatório quando Stripe está configurado (lista de origens do site público).',
    );
  }

  for (const [name, rawVal] of [['success_url', successUrl], ['cancel_url', cancelUrl]]) {
    const u = String(rawVal);
    const safe = u.includes('{CHECKOUT_SESSION_ID}')
      ? u.split('{CHECKOUT_SESSION_ID}').join('cs_placeholder_123')
      : u;
    let origin;
    try {
      origin = new URL(safe).origin;
    } catch {
      throw publicError(400, `${name} inválido.`);
    }
    if (!allowed.includes(origin)) {
      throw publicError(400, `${name}: origem não autorizada (${origin}).`);
    }
  }
}

module.exports = new PublicService();
