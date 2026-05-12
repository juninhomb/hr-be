-- =====================================================
-- shipping_zones.requires_whatsapp_checkout
-- =====================================================
-- Marca zonas em que o pedido NÃO pode ser fechado direto no site
-- (logística mais complexa, IVA/alfândega, multi-pacotes…). O site
-- apresenta um CTA "continuar pelo WhatsApp" para o cliente em vez
-- do botão de confirmar pedido.
--
-- Por defeito ficam apenas as zonas internacionais com a flag a true.
-- Idempotente.
-- =====================================================

BEGIN;

ALTER TABLE shipping_zones
  ADD COLUMN IF NOT EXISTS requires_whatsapp_checkout BOOLEAN DEFAULT false;

-- Marca todas as zonas não-PT como WhatsApp-only (apenas onde nunca
-- foi explicitamente configurado — não sobrescreve decisões manuais
-- futuras).
DO $$
BEGIN
  UPDATE shipping_zones
     SET requires_whatsapp_checkout = true
   WHERE country_code <> 'PT'
     AND requires_whatsapp_checkout = false;

  RAISE NOTICE '✓ Zonas não-PT marcadas como checkout via WhatsApp.';
END $$;

COMMIT;
