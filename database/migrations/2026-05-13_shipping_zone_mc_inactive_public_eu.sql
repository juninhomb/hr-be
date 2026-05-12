-- Checkout público: apenas PT + zona EU no select (Mónaco coberto pela mesma lógica que «resto UE»).
-- Idempotente.

UPDATE shipping_zones
   SET is_active = false
 WHERE UPPER(country_code) = 'MC';
