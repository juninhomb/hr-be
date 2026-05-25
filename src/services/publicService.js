const db = require('../config/db');
const ProductImageService = require('./productImageService');
const ShippingService = require('./shippingService');
const stripeCheckoutService = require('./stripeCheckoutService');
const emailService = require('./emailService');
const { assertValidWhatsappOrThrow, canonicalWhatsappNumber } = require('../utils/whatsappNormalize');
const { upsertCustomerAddress } = require('./customerAddressService');
const { resolveCoupon } = require('../utils/discountCoupons');
const { assertStripeCheckoutRedirects } = require('../utils/stripeCheckoutRedirects');

/**
 * Serviços de leitura/escrita públicos para o site de vendas (hrstore-site).
 *
 * Visibilidade na loja só depende das variantes (`product_variants.is_active`).
 * Sem variantes activas o produto não aparece — para remover um modelo inteiro,
 * desactiva todas as variantes no backoffice (`products.is_active` não influencia aqui).
 *
 * Sem migração da coluna `is_active` nas variantes: modo legado (todas contadas como activas).
 * Queries agrupam variantes por produto no JS.
 * Checkout devolve pedidos `aguardando_pagamento`, `origin = 'website'`.
 */

function isMissingIsActiveColumn(err) {
  return Boolean(
    err &&
      err.code === '42703' &&
      /is_active/i.test(String(err.message || '')),
  );
}

async function safeEnrichProductImages(products) {
  try {
    return await ProductImageService.enrichProductsWithImages(products);
  } catch (err) {
    if (err && err.code === '42P01') {
      console.warn(
        '[PublicService] Tabelas product_images/variant_images em falta — corre '
        + 'database/migrations/2026-05-22_product_variant_images.sql',
      );
      return products;
    }
    throw err;
  }
}

/**
 * Um produto entra nas listagens quando existe pelo menos uma variante elegível:
 * (`is_active` na variante quando a coluna existir.)
 */
function catalogFragments(useVariantIsActive) {
  const v0Active = useVariantIsActive ? ' AND COALESCE(v0.is_active, true)' : '';
  const joinVActive = useVariantIsActive ? ' AND COALESCE(v.is_active, true)' : '';

  const sqlCatalogProductBasics = () =>
    `EXISTS (
      SELECT 1 FROM product_variants v0
      WHERE v0.product_id = p.id${v0Active}
    )`;

  return { sqlCatalogProductBasics, joinVActive };
}

function buildCheckoutVariantsSql(useVariantIsActive) {
  const vLine = useVariantIsActive ? '\n            AND COALESCE(v.is_active, true)' : '';
  return `SELECT v.id, v.sku, v.stock_quantity, p.base_price, p.name
           FROM product_variants v
           INNER JOIN products p ON p.id = v.product_id
          WHERE v.sku = ANY($1::text[])${vLine}`;
}
class PublicService {
  // -------------------------------------------------------------
  // Catálogo
  // -------------------------------------------------------------

  async listProducts({ search = '', categoryId = null, featured = null } = {}) {
    const exec = async (useVa) => {
      const frag = catalogFragments(useVa);
      const params = [];
      const where = [frag.sqlCatalogProductBasics()];

      if (search) {
        params.push(`%${search}%`);
        where.push(
          `(p.name ILIKE $${params.length} OR v.sku ILIKE $${params.length} OR COALESCE(cc.name, v.color) ILIKE $${params.length})`,
        );
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
        p.characteristics,
        p.base_price,
        p.image_placeholder_url,
        p.is_featured,
        p.category_id,
        c.name            AS category_name,
        v.id              AS variant_id,
        v.sku,
        COALESCE(cc.name, v.color) AS color,
        v.size,
        v.stock_quantity,
        v.image_url       AS variant_image_url
      FROM products p
      LEFT JOIN product_variants v ON v.product_id = p.id${frag.joinVActive}
      LEFT JOIN catalog_colors cc ON cc.id = v.color_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.is_featured DESC, p.name ASC, v.id ASC
    `;

      const { rows } = await db.query(sql, params);
      return rows;
    };

    try {
      const rows = await exec(true);
      return safeEnrichProductImages(groupProductRows(rows));
    } catch (err) {
      if (!isMissingIsActiveColumn(err)) throw err;
      console.warn(
        '[PublicService.listProducts] Coluna product_variants.is_active em falta — corre '
        + 'database/migrations/2026-05-01_variant_is_active.sql. A usar listagem legada.',
      );
      const rows = await exec(false);
      return safeEnrichProductImages(groupProductRows(rows));
    }
  }

  async getProductById(id) {
    const productId = parseInt(id, 10);
    if (!Number.isFinite(productId)) return null;

    const exec = async (useVa) => {
      const frag = catalogFragments(useVa);
      const { rows } = await db.query(
        `
      SELECT
        p.id              AS product_id,
        p.name,
        p.description,
        p.characteristics,
        p.base_price,
        p.image_placeholder_url,
        p.is_featured,
        p.category_id,
        c.name            AS category_name,
        v.id              AS variant_id,
        v.sku,
        COALESCE(cc.name, v.color) AS color,
        v.size,
        v.stock_quantity,
        v.image_url       AS variant_image_url
      FROM products p
      LEFT JOIN product_variants v ON v.product_id = p.id${frag.joinVActive}
      LEFT JOIN catalog_colors cc ON cc.id = v.color_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.id = $1 AND ${frag.sqlCatalogProductBasics()}
      ORDER BY v.id ASC
      `,
        [productId],
      );
      return rows;
    };

    let rows;
    try {
      rows = await exec(true);
    } catch (err) {
      if (!isMissingIsActiveColumn(err)) throw err;
      console.warn(
        '[PublicService.getProductById] product_variants.is_active em falta — modo legado.',
      );
      rows = await exec(false);
    }

    const grouped = groupProductRows(rows);
    const enriched = await safeEnrichProductImages(grouped);
    const p = enriched[0];
    if (!p || !p.variants?.length) return null;
    return p;
  }

  /**
   * Checkout: conferência por número (chave interna do cliente) + moradas usadas antes.
   * POST `{ whatsapp_number, default_country? }` — `default_country` ISO2 para parse (defeito PT).
   */
  async getCheckoutHints(rawWhatsapp, defaultCountry = 'PT') {
    const dc = String(defaultCountry || 'PT')
      .trim()
      .toUpperCase()
      .slice(0, 2) || 'PT';
    const wa = canonicalWhatsappNumber(rawWhatsapp, dc);
    if (!wa) {
      throw publicError(400, 'WhatsApp inválido.');
    }

    const { rows: cust } = await db.query(
      `SELECT id, full_name, email, postal_code, city, district, country
         FROM customers WHERE whatsapp_number = $1`,
      [wa],
    );
    if (!cust[0]) {
      return {
        whatsapp_number: wa,
        customer_found: false,
        full_name: null,
        email: null,
        saved_addresses: [],
        customer_profile: null,
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

    const c0 = cust[0];
    const hasProfileLoc =
      (c0.postal_code && String(c0.postal_code).trim()) || (c0.city && String(c0.city).trim());
    const customer_profile = hasProfileLoc
      ? {
          postal_code: c0.postal_code ? String(c0.postal_code).trim() : null,
          city: c0.city ? String(c0.city).trim() : null,
          district: c0.district ? String(c0.district).trim() : null,
          country: (c0.country && String(c0.country).trim().toUpperCase().slice(0, 2)) || 'PT',
        }
      : null;

    return {
      whatsapp_number: wa,
      customer_found: true,
      full_name: cust[0].full_name,
      email: cust[0].email,
      saved_addresses,
      customer_profile,
    };
  }

  /**
   * Pré-visualização de cupão (mesmos preços que no checkout; só leitura).
   * POST `/api/public/coupon-quote`
   */
  async couponQuote({ code, items }) {
    if (!String(code || '').trim()) {
      throw publicError(400, 'Indica o código do cupão.');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw publicError(400, 'O carrinho está vazio.');
    }
    const skus = items.map((i) => String(i.sku).trim()).filter(Boolean);
    if (!skus.length) throw publicError(400, 'Itens inválidos.');

    let variantsRes;
    try {
      variantsRes = await db.query(buildCheckoutVariantsSql(true), [skus]);
    } catch (vqErr) {
      if (!isMissingIsActiveColumn(vqErr)) throw vqErr;
      variantsRes = await db.query(buildCheckoutVariantsSql(false), [skus]);
    }
    const bySku = new Map(variantsRes.rows.map((r) => [r.sku, r]));

    let itemsSubtotal = 0;
    for (const it of items) {
      const sku = String(it.sku).trim();
      const qty = parseInt(it.quantity, 10);
      if (!sku || !qty || qty <= 0) throw publicError(400, 'Itens inválidos.');
      const variant = bySku.get(sku);
      if (!variant) throw publicError(400, `SKU inválido: ${sku}.`);
      itemsSubtotal += Number(variant.base_price) * qty;
    }

    const resolved = await resolveCoupon(db, code, itemsSubtotal);
    if (!resolved) {
      throw publicError(400, 'Cupão inválido ou indisponível.');
    }
    return {
      ok: true,
      items_subtotal: Math.round(itemsSubtotal * 100) / 100,
      discount_amount: resolved.discountAmount,
      coupon_code: resolved.code,
    };
  }

  async listCategories() {
    const exec = async (useVa) => {
      const v0Tail = useVa ? ' AND COALESCE(v0.is_active, true)' : '';

      const { rows } = await db.query(
        `
      SELECT
        c.id,
        c.name,
        c.description,
        c.image_url,
        c.sort_order,
        COUNT(p.id) FILTER (WHERE
          EXISTS (
            SELECT 1 FROM product_variants v0
            WHERE v0.product_id = p.id${v0Tail}
          )
        )::int AS product_count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id
      GROUP BY c.id
      ORDER BY c.sort_order ASC, c.name ASC
    `,
      );
      return rows;
    };

    try {
      return await exec(true);
    } catch (err) {
      if (!isMissingIsActiveColumn(err)) throw err;
      console.warn(
        '[PublicService.listCategories] product_variants.is_active em falta — modo legado.',
      );
      return exec(false);
    }
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
  async createWebsiteOrder({
    customer, items, delivery, notes = null, idempotencyKey = null, coupon_code: rawCoupon = null,
  }) {
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
        `SELECT id, customer_id, total_amount, shipping_fee, shipping_zone_id, status,
                COALESCE(discount_amount, 0) AS discount_amount, coupon_code
           FROM orders WHERE idempotency_key = $1`,
        [idempotencyKey]
      );
      if (existing.rows[0]) {
        const o = existing.rows[0];
        const ship = Number(o.shipping_fee || 0);
        const disc = Number(o.discount_amount || 0);
        const itemsGross = Number(o.total_amount) - ship + disc;
        return {
          order_id: o.id,
          customer_id: o.customer_id,
          items_total: Math.round(itemsGross * 100) / 100,
          discount_amount: Math.round(disc * 100) / 100,
          coupon_code: o.coupon_code || null,
          shipping_fee: ship,
          shipping_zone: null,
          total_amount: Number(o.total_amount),
          status: o.status,
          idempotent_replay: true,
        };
      }
    }

    const customerNotes = sanitizeCustomerNotes(notes);

    const isDelivery = Boolean(delivery?.is_delivery);

    // -------- Morada / contactos extra (site) --------
    // O storefront passa `street`, `postal_code`, `city`, `country`, `phone`.
    // Mantemos `address` legado (free-form) — quando não for enviado, montamos
    // um a partir dos campos estruturados para compatibilidade com WhatsApp.
    const country = (customer.country || 'PT').trim().toUpperCase().slice(0, 2);
    const cleanWhatsapp = assertValidWhatsappOrThrow(
      customer.whatsapp_number,
      'WhatsApp inválido',
      country,
    );
    let postalCode = (customer.postal_code || '').trim().slice(0, 20) || null;
    if (country === 'ES' && postalCode) {
      const es = postalCode.replace(/\D/g, '').slice(0, 5);
      if (es.length === 5) postalCode = es;
    }
    if (country === 'MC' && postalCode) {
      const mc = postalCode.replace(/\D/g, '').slice(0, 5);
      if (mc.length === 5) postalCode = mc;
    }
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
      // Zonas UE (`requires_whatsapp_checkout`): regista `shipping_zone_id` mas
      // `shipping_fee = 0` até a equipa acordar portes no WhatsApp e usar PATCH /shipping-fee no admin.
      shippingFee = quote.fee;
      shippingZone = quote.zone;
      if (quote.zone.requires_whatsapp_checkout) {
        shippingFee = 0;
      }
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
         DO UPDATE SET
           full_name   = COALESCE(NULLIF(TRIM(EXCLUDED.full_name), ''),   customers.full_name),
           email       = COALESCE(NULLIF(TRIM(EXCLUDED.email), ''),       customers.email),
           address     = COALESCE(NULLIF(TRIM(EXCLUDED.address), ''),     customers.address),
           postal_code = COALESCE(NULLIF(TRIM(EXCLUDED.postal_code), ''), customers.postal_code),
           city        = COALESCE(NULLIF(TRIM(EXCLUDED.city), ''),         customers.city),
           district    = COALESCE(NULLIF(TRIM(EXCLUDED.district), ''),     customers.district),
           country     = COALESCE(NULLIF(TRIM(EXCLUDED.country), ''),     customers.country),
           phone       = COALESCE(NULLIF(TRIM(EXCLUDED.phone), ''),       customers.phone)
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

      let variantsRes;
      try {
        variantsRes = await client.query(buildCheckoutVariantsSql(true), [skus]);
      } catch (vqErr) {
        if (!isMissingIsActiveColumn(vqErr)) throw vqErr;
        console.warn(
          '[createWebsiteOrder] product_variants.is_active em falta — validação SKU legada.',
        );
        variantsRes = await client.query(buildCheckoutVariantsSql(false), [skus]);
      }
      const bySku = new Map(variantsRes.rows.map((r) => [r.sku, r]));

      // 3) Cria order header com total temporário (vai ser actualizado)
      const insertOrderBaseParams = [
        customerId,
        customer.payment_method || 'a_definir',
        isDelivery,
        shippingFee,
        shippingZone?.id || null,
        deliverySnapshot,
        idempotencyKey,
      ];
      let orderRes;
      try {
        orderRes = await client.query(
          `INSERT INTO orders
              (customer_id, total_amount, status, origin, payment_method,
               is_delivery, shipping_fee, shipping_zone_id, delivery_address,
               idempotency_key, customer_notes)
           VALUES ($1, 0, 'aguardando_pagamento', 'website', $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          [...insertOrderBaseParams, customerNotes],
        );
      } catch (insertErr) {
        const imsg = String(insertErr?.message || '');
        if (insertErr?.code === '42703' && imsg.includes('customer_notes')) {
          // DB sem migração — pedido continua válido; notas não persistem até ALTER TABLE.
          console.warn(
            '[createWebsiteOrder] Coluna orders.customer_notes ausente — corre migração '
            + 'database/migrations/2026-05-01_orders_customer_notes.sql ; notas ignoradas.',
          );
          orderRes = await client.query(
            `INSERT INTO orders
                (customer_id, total_amount, status, origin, payment_method,
                 is_delivery, shipping_fee, shipping_zone_id, delivery_address,
                 idempotency_key)
             VALUES ($1, 0, 'aguardando_pagamento', 'website', $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            insertOrderBaseParams,
          );
        } else {
          throw insertErr;
        }
      }
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

      let discountAmount = 0;
      let couponStored = null;
      const couponTrim = String(rawCoupon ?? '').trim();
      if (couponTrim) {
        const resolved = await resolveCoupon(client, couponTrim, itemsTotal);
        if (!resolved) {
          throw publicError(400, 'Cupão inválido ou indisponível.');
        }
        discountAmount = resolved.discountAmount;
        couponStored = resolved.code;
      }

      const itemsNet = Math.round((itemsTotal - discountAmount) * 100) / 100;
      if (itemsNet < 0.01) {
        throw publicError(400, 'O desconto não pode anular o valor dos artigos.');
      }
      const finalTotal = Math.round((itemsNet + shippingFee) * 100) / 100;

      try {
        await client.query(
          `UPDATE orders
              SET total_amount = $1,
                  coupon_code = $2,
                  discount_amount = $3
            WHERE id = $4`,
          [finalTotal, couponStored, discountAmount, orderId],
        );
      } catch (updErr) {
        const msg = String(updErr?.message || '');
        if (updErr?.code === '42703' && /coupon_code|discount_amount/i.test(msg)) {
          if (discountAmount > 0) {
            throw publicError(
              500,
              'Cupões não estão activos na base de dados. Corre a migração '
              + '`database/migrations/2026-05-02_orders_discount_coupon.sql`.',
            );
          }
          await client.query(`UPDATE orders SET total_amount = $1 WHERE id = $2`, [finalTotal, orderId]);
        } else {
          throw updErr;
        }
      }

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
            has_customer_notes: Boolean(customerNotes),
            coupon_code: couponStored,
            discount_amount: discountAmount,
          })]
        );
      } catch (e) { /* noop */ }

      // Aviso à equipa: pagamento manual (MB Way / transferência) — pedido
      // fica em `aguardando_pagamento` e exige monitorização manual.
      // Excluímos Stripe porque esse fluxo confirma sozinho pelo webhook e
      // já envia email ao cliente.
      const pmNorm = String(customer.payment_method || '').trim().toLowerCase();
      if (pmNorm !== 'stripe') {
        try {
          emailService.scheduleNotifyAdminOrderAwaitingPayment(orderId);
        } catch (e) {
          console.warn('[publicService] notify admin awaiting payment falhou (não-fatal):', e?.message || e);
        }
      }

      return {
        success: true,
        order_id: orderId,
        customer_id: customerId,
        items_total: itemsTotal,
        discount_amount: discountAmount,
        coupon_code: couponStored,
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
  async createWebsiteOrderStripeCheckout({
    customer,
    items,
    delivery,
    notes = null,
    success_url,
    cancel_url,
    idempotencyKey = null,
    coupon_code = null,
  }) {
    stripeCheckoutService.getStripeOrThrow();
    assertStripeCheckoutRedirects(success_url, cancel_url);

    const orderPayload = await this.createWebsiteOrder({
      customer: { ...(customer || {}), payment_method: 'stripe' },
      items,
      delivery,
      notes,
      idempotencyKey,
      coupon_code,
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
        discount_amount: orderPayload.discount_amount,
        coupon_code: orderPayload.coupon_code,
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

  /**
   * Confirma pagamento via API Stripe (backup ao webhook).
   * Chamado em /checkout/sucesso com `session_id` devolvido pelo redirect.
   */
  async verifyStripeCheckoutSession(sessionId) {
    stripeCheckoutService.getStripeOrThrow();
    return stripeCheckoutService.verifyCheckoutSessionAndMarkPaid(sessionId);
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
        characteristics: r.characteristics,
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
        image_url:
          r.variant_image_url != null && String(r.variant_image_url).trim() !== ''
            ? String(r.variant_image_url).trim()
            : null,
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

const MAX_CUSTOMER_NOTES_LEN = 2000;

/** Notas opcionais do checkout — texto curto, sem null bytes. */
function sanitizeCustomerNotes(raw) {
  if (raw == null) return null;
  let s = String(raw).replace(/\0/g, '').trim().replace(/\r\n/g, '\n');
  if (!s) return null;
  if (s.length > MAX_CUSTOMER_NOTES_LEN) s = s.slice(0, MAX_CUSTOMER_NOTES_LEN);
  return s;
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

module.exports = new PublicService();
