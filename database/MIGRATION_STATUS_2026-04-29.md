# ✅ Migração 2026-04-29 - Status

## 🎯 Objetivo
Adicionar suporte a entrega com taxa de 5€ em pedidos e refletir no frontend.

---

## 📊 Alterações Implementadas

### Backend (`hrstore-backend`)

| Alteração | Status | Detalhe |
|-----------|--------|---------|
| **Coluna `is_delivery` em `orders`** | ✅ Implementada | Campo BOOLEAN (default false) para marcar se pedido tem entrega |
| **Coluna `shipping_fee` em `orders`** | ✅ Implementada | Campo NUMERIC para armazenar taxa de envio (5€ quando é_delivery=true) |
| **Query `getPendingOrders`** | ✅ Atualizada | Agora retorna is_delivery e shipping_fee |
| **Query `getOrderHistory`** | ✅ Atualizada | Agora retorna is_delivery e shipping_fee |
| **Query `getOrderById`** | ✅ OK | Já retorna todos os campos (SELECT o.*) |
| **Logic em `createManualOrder`** | ✅ OK | Já calcula shipping_fee = is_delivery ? 5 : 0 |

### Frontend (`hrstore-frontend`)

| Alteração | Status | Detalhe |
|-----------|--------|---------|
| **Tipo `Order`** | ✅ Atualizado | Adicionados campos `is_delivery` e `shipping_fee` |
| **OrderDetailsModal** | ✅ Melhorado | Novo breakdown: Subtotal + Taxa de Entrega = Total |
| **Badge de Entrega** | ✅ Adicionado | Exibido no topo do modal (verde com ícone Package) |
| **Tabela de Pedidos** | ✅ Melhorada | Badge de "Entrega" em verde mostrado na coluna de origem |
| **Painel Pendentes** | ✅ Melhorado | Badge de "Entrega" mostrado junto a payment_method |
| **Cálculo de Totais** | ✅ Implementado | Exibe breakdown com validação (items + entrega = total) |

---

## 🗄️ Estrutura Final

### Tabela `orders` (adicionadas 2 colunas)
```
- id (integer, PK)
- customer_id (integer, FK)
- total_amount (numeric)
- payment_method (varchar)
- status (varchar)
- origin (varchar)
- stripe_link_id (varchar)
- created_at (timestamp)
+ is_delivery (boolean, default=false) ← NOVO
+ shipping_fee (numeric, default=0) ← NOVO
```

---

## 🎨 Apresentação no Frontend

### OrderDetailsModal
```
Status | Origin | Payment Method | [Entrega]  ← Badge verde

Subtotal (itens)              € XX.XX
Taxa de entrega              € 5.00     ← Mostrado se is_delivery=true
─────────────────────────────────────
Total do pedido               € XX.XX
```

### Tabela de Pedidos
```
| #ID | Cliente | Origem | [Entrega] [CTT] | ... |
```

### Painel Pendentes
```
#123 | whatsapp | dinheiro | [Entrega] | sem items
```

---

## 📋 Regras de Negócio

- **Entrega**: Quando `is_delivery = true`, cobra-se automaticamente `shipping_fee = 5€`
- **Total**: `total_amount = soma_itens + shipping_fee`
- **Validação**: Frontend exibe aviso se soma não bater com total
- **Badge Visual**: Pedido com entrega exibe badge verde em todos os painéis

---

## 🔄 Próximos Passos (Optional)

1. Adicionar checkbox "Marcar como Entrega" no PDV
2. Permitir edição de taxa de entrega por pedido
3. Integração com CTT para rastreamento automático
4. Emails de confirmação de entrega

---

## ✅ Checklist Implementação

- [x] Migration criada (idempotente)
- [x] Backend queries atualizadas
- [x] Frontend types atualizados
- [x] UI com breakdown de totais
- [x] Badges visuais de entrega
- [x] Validação de cálculo de totais
