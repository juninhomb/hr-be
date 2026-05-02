const db = require('../config/db');

function normCode(raw) {
  return String(raw ?? '').trim().toUpperCase().slice(0, 48);
}

function assertKind(kind) {
  if (kind !== 'percent' && kind !== 'fixed') {
    const err = new Error('Tipo inválido (use percent ou fixed).');
    err.status = 400;
    throw err;
  }
}

function parseValue(raw) {
  const n = Number.parseFloat(String(raw ?? '').replace(',', '.'));
  if (!Number.isFinite(n)) {
    const err = new Error('Valor inválido.');
    err.status = 400;
    throw err;
  }
  return n;
}

function rowOut(r) {
  if (!r) return null;
  return {
    id: r.id,
    code: r.code,
    kind: r.kind,
    value: Number(r.value),
    is_active: Boolean(r.is_active),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

class DiscountCouponService {
  async list() {
    const { rows } = await db.query(
      `SELECT id, code, kind, value, is_active, created_at, updated_at
         FROM discount_coupons
        ORDER BY UPPER(code) ASC`,
    );
    return rows.map(rowOut);
  }

  async create(body) {
    const code = normCode(body.code);
    if (code.length < 2) {
      const err = new Error('Código do cupão é obrigatório (mín. 2 caracteres).');
      err.status = 400;
      throw err;
    }
    assertKind(body.kind);
    const value = parseValue(body.value);
    if (body.kind === 'percent' && (value <= 0 || value > 100)) {
      const err = new Error('Percentagem deve estar entre 0 e 100.');
      err.status = 400;
      throw err;
    }
    if (body.kind === 'fixed' && value <= 0) {
      const err = new Error('Valor fixo deve ser maior que zero.');
      err.status = 400;
      throw err;
    }
    const isActive = body.is_active !== false;

    try {
      const { rows } = await db.query(
        `INSERT INTO discount_coupons (code, kind, value, is_active)
         VALUES ($1, $2, $3, $4)
         RETURNING id, code, kind, value, is_active, created_at, updated_at`,
        [code, body.kind, value, isActive],
      );
      return rowOut(rows[0]);
    } catch (e) {
      if (e.code === '23505') {
        const err = new Error('Já existe um cupão com este código.');
        err.status = 409;
        throw err;
      }
      throw e;
    }
  }

  async update(id, body) {
    const couponId = parseInt(id, 10);
    if (!Number.isFinite(couponId)) {
      const err = new Error('ID inválido.');
      err.status = 400;
      throw err;
    }

    const { rows: existing } = await db.query(
      `SELECT id, is_active FROM discount_coupons WHERE id = $1`,
      [couponId],
    );
    if (!existing[0]) {
      const err = new Error('Cupão não encontrado.');
      err.status = 404;
      throw err;
    }

    const code = normCode(body.code);
    if (code.length < 2) {
      const err = new Error('Código do cupão é obrigatório (mín. 2 caracteres).');
      err.status = 400;
      throw err;
    }
    assertKind(body.kind);
    const value = parseValue(body.value);
    if (body.kind === 'percent' && (value <= 0 || value > 100)) {
      const err = new Error('Percentagem deve estar entre 0 e 100.');
      err.status = 400;
      throw err;
    }
    if (body.kind === 'fixed' && value <= 0) {
      const err = new Error('Valor fixo deve ser maior que zero.');
      err.status = 400;
      throw err;
    }
    const isActive =
      typeof body.is_active === 'boolean' ? body.is_active : Boolean(existing[0].is_active);

    try {
      const { rows } = await db.query(
        `UPDATE discount_coupons
            SET code = $1,
                kind = $2,
                value = $3,
                is_active = $4,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $5
        RETURNING id, code, kind, value, is_active, created_at, updated_at`,
        [code, body.kind, value, isActive, couponId],
      );
      return rowOut(rows[0]);
    } catch (e) {
      if (e.code === '23505') {
        const err = new Error('Já existe um cupão com este código.');
        err.status = 409;
        throw err;
      }
      throw e;
    }
  }

  async remove(id) {
    const couponId = parseInt(id, 10);
    if (!Number.isFinite(couponId)) {
      const err = new Error('ID inválido.');
      err.status = 400;
      throw err;
    }
    const { rowCount } = await db.query(
      `DELETE FROM discount_coupons WHERE id = $1`,
      [couponId],
    );
    if (!rowCount) {
      const err = new Error('Cupão não encontrado.');
      err.status = 404;
      throw err;
    }
    return { ok: true };
  }
}

module.exports = new DiscountCouponService();
