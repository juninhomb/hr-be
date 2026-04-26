# 🏪 HR Store Backend API

Sistema de gestão de pedidos, inventário e CRM para loja online integrada com IA e WhatsApp (via Evolution API).

**Versão**: 1.0.0  
**Status**: Em Desenvolvimento  
**Autor**: Tim  
**Last Updated**: Abril 2026

---

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura](#arquitetura)
3. [Requisitos](#requisitos)
4. [Instalação](#instalação)
5. [Configuração](#configuração)
6. [Endpoints da API](#endpoints-da-api)
7. [Exemplos de Uso](#exemplos-de-uso)
8. [Estrutura do Projeto](#estrutura-do-projeto)
9. [Banco de Dados](#banco-de-dados)
10. [Autenticação JWT](#autenticação-jwt)
11. [Tratamento de Erros](#tratamento-de-erros)
12. [Logs e Auditoria](#logs-e-auditoria)
13. [Troubleshooting](#troubleshooting)
14. [Roadmap](#roadmap)

---

## 🎯 Visão Geral

O **HR Store Backend** é uma API REST que gerencia:

- **📦 Inventário**: 78 variantes de produtos (cores × tamanhos)
- **👥 CRM**: Registro automático de clientes via WhatsApp
- **💳 Pedidos**: Fluxo completo de pedido → confirmação → entrega
- **📊 Auditoria**: Logs de todas as ações críticas
- **🔐 Segurança**: Autenticação JWT para todas as operações sensíveis

**Casos de Uso**:
- Admin verifica pedidos pendentes após mensagens do WhatsApp (via N8N)
- Atualiza stock quando os pedidos são confirmados
- Consulta histórico de compras por cliente
- Rastreia mudanças de preço/stock

---

## 🏛️ Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT (N8N/APP)                      │
└─────────────────────────────────────────────────────────────┘
                              ↓ (HTTP REST)
┌─────────────────────────────────────────────────────────────┐
│                    EXPRESS API SERVER                        │
│  (main.js - Port 3001)                                       │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  Controllers │→ │   Services   │→ │  Database    │       │
│  │              │  │              │  │  (PostgreSQL)│       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
├─────────────────────────────────────────────────────────────┤
│  MIDDELWARES                                                 │
│  ✓ CORS        ✓ JSON Parser    ✓ JWT Auth   ✓ Error Handler│
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              PostgreSQL Database (Evolution DB)             │
│  Tables: products, product_variants, customers, orders,     │
│          audit_logs                                          │
└─────────────────────────────────────────────────────────────┘
```

**Padrão**: MVC (Model-View-Controller adaptado)
- **Controllers**: Recebem requests HTTP e delegam
- **Services**: Contêm lógica de negócio e queries
- **Config**: Conexão DB, middleware, tratamento de erros

---

## 📦 Requisitos

- **Node.js**: v16+ 
- **npm**: v8+
- **PostgreSQL**: v13+ (em contentor via docker-compose)
- **Docker** (opcional, recomendado)

### Versões de Dependências

```json
{
  "express": "^5.2.1",
  "pg": "^8.20.0",
  "jsonwebtoken": "^9.0.3",
  "bcryptjs": "^3.0.3",
  "cors": "^2.8.6",
  "dotenv": "^17.4.2"
}
```

---

## 🚀 Instalação

### Opção 1: Instalação Local (Recomendado com Docker)

#### Passo 1: Clonar/Preparar Repositório

```bash
cd /root/hrstore-backend
```

#### Passo 2: Instalar Dependências

```bash
npm install
```

#### Passo 3: Iniciar PostgreSQL (via Docker)

Ensure Docker é executed from `/root/evolution` (where `docker-compose.yml` exists):

```bash
cd /root/evolution
docker-compose up -d postgres
```

Verifica se o PostgreSQL está rodando:

```bash
docker ps | grep postgres
```

#### Passo 4: Criar Arquivo `.env`

Cria `.env` na raiz de `hrstore-backend`:

```bash
touch .env
```

E adiciona as variáveis (ver [Configuração](#configuração)):

```env
PORT=3001
DATABASE_URL=postgresql://evolution:suasenha_segura@localhost:5432/evolution_db
JWT_SECRET=heitor321
ADMIN_USER=admin
ADMIN_PASS=rafa321
API_KEY=heitor321
```

#### Passo 5: Criar Tabelas (Schema)

Executa o script de migração (ver [Banco de Dados](#banco-de-dados)):

```bash
psql -U evolution -d evolution_db -h localhost -f database/schema.sql
```

#### Passo 6: Iniciar o Servidor

```bash
npm start
# ou modo desenvolvimento com nodemon:
npm install --save-dev nodemon
npx nodemon src/main.js
```

Deverá ver:

```
==============================================
🚀 HR STORE BACKEND - MODO JWT ATIVO
📡 Porta: 3001
🔑 Admin User: admin
🔗 Endpoints protegidos em: /api/orders/*
==============================================
```

#### Passo 7: Verificar Saúde

```bash
curl http://localhost:3001/health
```

Resposta esperada:

```json
{
  "status": "online",
  "uptime": 12.345,
  "message": "HR Store API protegida por JWT está ativa! 🛡️"
}
```

---

## ⚙️ Configuração

### Variáveis de Ambiente (`.env`)

```env
# SERVIDOR
PORT=3001                    # Porta do servidor Express

# BANCO DE DADOS
DATABASE_URL=postgresql://evolution:suasenha_segura@localhost:5432/evolution_db
# Formato: postgresql://USER:PASS@HOST:PORT/DATABASE

# AUTENTICAÇÃO
JWT_SECRET=heitor321         # Secret para assinar tokens (MUDAR EM PRODUÇÃO)
ADMIN_USER=admin             # Username do admin
ADMIN_PASS=rafa321           # Password do admin (MUDAR EM PRODUÇÃO)

# API KEYS
API_KEY=heitor321            # Para futuras integrações
```

### Variáveis de Produção (⚠️ Importante)

Em produção, **NUNCA**:
1. Commitar `.env` no Git (adicionar a `.gitignore`)
2. Usar credenciais hardcoded
3. Expor `JWT_SECRET` ou senhas

**Usar**: Secrets Manager (AWS Secrets, Vault, K8s Secrets)

---

## 🔌 Endpoints da API

### Base URL

```
http://localhost:3001/api/orders
```

### 1️⃣ Autenticação

#### `POST /login`

Gera um token JWT para acesso protegido.

**Acesso**: Público

**Body**:
```json
{
  "username": "admin",
  "password": "rafa321"
}
```

**Response** (200):
```json
{
  "auth": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response** (401):
```json
{
  "error": "Credenciais inválidas"
}
```

**Expiração**: 8 horas

---

### 2️⃣ Pedidos (Orders)

#### `GET /pending`

Lista todos os pedidos com status "pendente".

**Autenticação**: ✅ Requerida (Header: `Authorization: Bearer <token>`)

**Query Parameters**: Nenhum

**Response** (200):
```json
[
  {
    "id": "ord-001",
    "customer_id": "cust-001",
    "customer_name": "Maria Silva",
    "whatsapp": "351912345678",
    "sku": "SHIRT-RED-M",
    "quantity": 2,
    "total_price": 45.50,
    "status": "pendente",
    "created_at": "2026-04-26T10:30:00Z"
  },
  {
    "id": "ord-002",
    "customer_id": "cust-002",
    "customer_name": "João Santos",
    "whatsapp": "351922334455",
    "sku": "PANTS-BLUE-L",
    "quantity": 1,
    "total_price": 78.00,
    "status": "pendente",
    "created_at": "2026-04-26T11:15:00Z"
  }
]
```

**Erros**:
- `401`: Token inválido ou não fornecido
- `500`: Erro ao procurar pedidos

---

#### `POST /confirm`

Confirma o pagamento de um pedido e reduz o stock da variante.

**Autenticação**: ✅ Requerida

**Body**:
```json
{
  "orderId": "ord-001",
  "sku": "SHIRT-RED-M"
}
```

**Response** (200):
```json
{
  "success": true,
  "message": "Pagamento confirmado e stock abatido",
  "order_id": "ord-001",
  "new_status": "pago"
}
```

**Response** (400):
```json
{
  "error": "orderId e sku são obrigatórios."
}
```

**Response** (500):
```json
{
  "error": "Stock insuficiente."
}
```

**Lógica**:
1. Inicia transação (BEGIN)
2. Atualiza status do pedido para "pago"
3. Reduz stock da variante em 1
4. Regista log de auditoria
5. Confirma transação (COMMIT)
6. Se erro, desfaz (ROLLBACK)

---

### 3️⃣ Inventário (Products)

#### `GET /products`

Lista todos os produtos com variantes (cores, tamanhos) e stock.

**Autenticação**: ✅ Requerida

**Response** (200):
```json
[
  {
    "id": 1,
    "name": "T-Shirt Básica",
    "category": "tops",
    "sku": "SHIRT-RED-S",
    "color": "Vermelho",
    "size": "S",
    "price": 19.99,
    "stock_quantity": 45
  },
  {
    "id": 1,
    "name": "T-Shirt Básica",
    "category": "tops",
    "sku": "SHIRT-RED-M",
    "color": "Vermelho",
    "size": "M",
    "price": 19.99,
    "stock_quantity": 32
  },
  {
    "id": 1,
    "name": "T-Shirt Básica",
    "category": "tops",
    "sku": "SHIRT-BLUE-M",
    "color": "Azul",
    "size": "M",
    "price": 19.99,
    "stock_quantity": 18
  }
]
```

**Total**: ~78 variantes (7-8 produtos × 10-12 variantes cada)

---

#### `PUT /products/:sku`

Atualiza preço e/ou stock de uma variante específica.

**Autenticação**: ✅ Requerida

**Parameters**:
- `sku` (string): SKU do produto (ex: `SHIRT-RED-M`)

**Body** (um ou ambos):
```json
{
  "price": 24.99,
  "stock_quantity": 50
}
```

**Response** (200):
```json
{
  "sku": "SHIRT-RED-M",
  "color": "Vermelho",
  "size": "M",
  "price": 24.99,
  "stock_quantity": 50,
  "updated_at": "2026-04-26T15:45:00Z"
}
```

**Erros**:
- `404`: SKU não encontrado
- `500`: Erro ao atualizar

---

### 4️⃣ CRM (Customers)

#### `GET /customers`

Lista todas as clientes registadas.

**Autenticação**: ✅ Requerida

**Response** (200):
```json
[
  {
    "id": "cust-001",
    "name": "Maria Silva",
    "whatsapp_number": "351912345678",
    "email": "maria@example.com",
    "total_purchases": 5,
    "lifetime_value": 250.00,
    "last_purchase": "2026-04-25T18:00:00Z",
    "created_at": "2026-03-15T10:00:00Z"
  },
  {
    "id": "cust-002",
    "name": "João Santos",
    "whatsapp_number": "351922334455",
    "email": "joao@example.com",
    "total_purchases": 2,
    "lifetime_value": 95.50,
    "last_purchase": "2026-04-20T14:30:00Z",
    "created_at": "2026-04-01T09:15:00Z"
  }
]
```

---

#### `GET /customers/:whatsapp`

Retorna detalhes de uma cliente específica pelo número de WhatsApp.

**Autenticação**: ✅ Requerida

**Parameters**:
- `whatsapp` (string): Número de WhatsApp (ex: `351912345678`)

**Response** (200):
```json
{
  "id": "cust-001",
  "name": "Maria Silva",
  "whatsapp_number": "351912345678",
  "email": "maria@example.com",
  "total_purchases": 5,
  "lifetime_value": 250.00,
  "last_purchase": "2026-04-25T18:00:00Z",
  "created_at": "2026-03-15T10:00:00Z",
  "purchase_history": [
    {
      "order_id": "ord-001",
      "sku": "SHIRT-RED-M",
      "quantity": 2,
      "total": 39.98,
      "date": "2026-04-25T18:00:00Z",
      "status": "entregue"
    }
  ]
}
```

**Response** (404):
```json
{
  "error": "Cliente não encontrada."
}
```

---

### 5️⃣ Health Check

#### `GET /health`

Verifica o status da API (sem autenticação).

**Autenticação**: ❌ Pública

**Response** (200):
```json
{
  "status": "online",
  "uptime": 1234.56,
  "message": "HR Store API protegida por JWT está ativa! 🛡️"
}
```

---

## 💡 Exemplos de Uso

### Usando cURL

#### 1. Login e Obter Token

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/orders/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "rafa321"}' \
  | jq -r '.token')

echo "Token: $TOKEN"
```

#### 2. Listar Pedidos Pendentes

```bash
curl -X GET http://localhost:3001/api/orders/pending \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | jq
```

#### 3. Confirmar Pagamento

```bash
curl -X POST http://localhost:3001/api/orders/confirm \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ord-001",
    "sku": "SHIRT-RED-M"
  }' | jq
```

#### 4. Listar Produtos

```bash
curl -X GET http://localhost:3001/api/orders/products \
  -H "Authorization: Bearer $TOKEN" | jq
```

#### 5. Atualizar Stock

```bash
curl -X PUT http://localhost:3001/api/orders/products/SHIRT-RED-M \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "stock_quantity": 100,
    "price": 22.99
  }' | jq
```

#### 6. Buscar Cliente por WhatsApp

```bash
curl -X GET http://localhost:3001/api/orders/customers/351912345678 \
  -H "Authorization: Bearer $TOKEN" | jq
```

---

### Usando JavaScript (Fetch API)

```javascript
// 1. Login
const loginRes = await fetch('http://localhost:3001/api/orders/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'rafa321' })
});
const { token } = await loginRes.json();

// 2. Listar Pedidos Pendentes
const pendingRes = await fetch('http://localhost:3001/api/orders/pending', {
  method: 'GET',
  headers: { 'Authorization': `Bearer ${token}` }
});
const pendingOrders = await pendingRes.json();
console.log(pendingOrders);

// 3. Confirmar Pagamento
const confirmRes = await fetch('http://localhost:3001/api/orders/confirm', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    orderId: 'ord-001',
    sku: 'SHIRT-RED-M'
  })
});
const result = await confirmRes.json();
console.log(result);
```

---

### Usando Python (requests)

```python
import requests
import json

BASE_URL = 'http://localhost:3001/api/orders'

# 1. Login
login_res = requests.post(f'{BASE_URL}/login', json={
    'username': 'admin',
    'password': 'rafa321'
})
token = login_res.json()['token']
headers = {'Authorization': f'Bearer {token}'}

# 2. Listar Pedidos
pending = requests.get(f'{BASE_URL}/pending', headers=headers)
print(json.dumps(pending.json(), indent=2))

# 3. Confirmar Pagamento
confirm = requests.post(f'{BASE_URL}/confirm', 
    headers=headers,
    json={'orderId': 'ord-001', 'sku': 'SHIRT-RED-M'}
)
print(confirm.json())
```

---

## 📁 Estrutura do Projeto

```
hrstore-backend/
│
├── src/
│   ├── main.js                      # Ponto de entrada do servidor
│   │
│   ├── config/
│   │   ├── db.js                    # Pool de conexão PostgreSQL
│   │   ├── authMiddleware.js        # Middleware de verificação JWT
│   │   └── errorHandler.js          # Handler global de erros
│   │
│   ├── controllers/
│   │   ├── authController.js        # Login e geração de tokens
│   │   ├── orderController.js       # Lógica de pedidos (HTTP layer)
│   │   ├── productController.js     # Lógica de produtos (HTTP layer)
│   │   └── customerController.js    # Lógica de CRM (HTTP layer)
│   │
│   ├── services/
│   │   ├── orderService.js          # Queries e lógica de negócio
│   │   ├── productService.js        # Queries e lógica de inventário
│   │   ├── customerService.js       # Queries e lógica de CRM
│   │   └── logService.js            # Queries de auditoria
│   │
│   └── routes/
│       └── orderRoutes.js           # Centraliza todas as rotas
│
├── database/
│   └── schema.sql                   # Definição de tabelas (TODO)
│
├── .env                             # Variáveis de ambiente (NÃO COMMITAR)
├── .env.example                     # Template de .env
├── .gitignore                       # Arquivos a ignorar no Git
├── package.json                     # Dependências do projeto
├── package-lock.json                # Lock de versões (gerado)
└── README.md                        # Este arquivo
```

---

## 🗄️ Banco de Dados

### Schema (PostgreSQL)

#### Tabela: `products`

```sql
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Exemplos**:
- T-Shirt Básica (tops)
- Calças Jeans (bottoms)
- Vestido Casual (dresses)

---

#### Tabela: `product_variants`

```sql
CREATE TABLE product_variants (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL,
  sku VARCHAR(50) UNIQUE NOT NULL,
  color VARCHAR(50),
  size VARCHAR(10), -- XS, S, M, L, XL, XXL
  price DECIMAL(10, 2) NOT NULL,
  stock_quantity INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
```

**SKU Format**: `{PRODUCT_NAME}-{COLOR}-{SIZE}`
Exemplo: `SHIRT-RED-M`, `PANTS-BLUE-L`

---

#### Tabela: `customers`

```sql
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  whatsapp_number VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  address TEXT,
  city VARCHAR(100),
  postal_code VARCHAR(10),
  total_purchases INTEGER DEFAULT 0,
  lifetime_value DECIMAL(12, 2) DEFAULT 0,
  last_purchase TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Note**: `whatsapp_number` é único e utilizado como identificador na API

---

#### Tabela: `orders`

```sql
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  order_number VARCHAR(50) UNIQUE, -- ord-001, ord-002, etc
  customer_id INTEGER NOT NULL,
  product_variant_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  total_price DECIMAL(10, 2),
  status VARCHAR(50) DEFAULT 'pendente', -- pendente, pago, entregue
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (product_variant_id) REFERENCES product_variants(id)
);
```

---

#### Tabela: `audit_logs`

```sql
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  admin_user VARCHAR(255) NOT NULL,
  action VARCHAR(100), -- LOGIN, CONFIRM_PAYMENT, UPDATE_PRODUCT, etc
  details JSONB,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Exemplos de Details**:
```json
{
  "orderId": "ord-001",
  "sku": "SHIRT-RED-M",
  "old_stock": 45,
  "new_stock": 44,
  "ip_address": "192.168.1.100"
}
```

---

### Migrations

Para criar as tabelas, execute:

```bash
psql -U evolution -d evolution_db -h localhost < database/schema.sql
```

Ou crie manualmente conectando ao PostgreSQL:

```sql
\c evolution_db

-- Copiar as queries CREATE TABLE de cima

\dt -- Listar tabelas criadas
```

---

## 🔐 Autenticação JWT

### Fluxo de Autenticação

```
1. Cliente faz POST /login com credenciais
   ↓
2. Server valida (admin:rafa321)
   ↓
3. Server gera JWT token com expiração de 8h
   ↓
4. Cliente recebe: { auth: true, token: "eyJ..." }
   ↓
5. Cliente inclui Header: "Authorization: Bearer eyJ..."
   ↓
6. Middleware verifica assinatura e expiração
   ↓
7. Request prossegue ou rejeita com 401
```

### Estrutura do Token JWT

```
Header:
{
  "alg": "HS256",
  "typ": "JWT"
}

Payload:
{
  "user": "admin",
  "iat": 1682505600,
  "exp": 1682541600  // 8 horas depois
}

Signature:
HMACSHA256(
  base64UrlEncode(header) + "." + base64UrlEncode(payload),
  "heitor321" // JWT_SECRET
)
```

### Teste de Token Inválido

```bash
# Token expirado ou mal-formado
curl -X GET http://localhost:3001/api/orders/pending \
  -H "Authorization: Bearer invalid_token"

# Resposta:
# {"error": "Token inválido ou expirado"}
```

---

## ⚠️ Tratamento de Erros

### HTTP Status Codes

| Code | Situação | Exemplo |
|------|----------|---------|
| **200** | OK - Sucesso | Dados retornados com sucesso |
| **201** | Created | Recurso criado |
| **400** | Bad Request | Parâmetros obrigatórios faltam |
| **401** | Unauthorized | Token inválido/expirado |
| **404** | Not Found | Recurso não existe |
| **500** | Server Error | Erro interno do servidor |

### Formato de Erro

Todos os erros devolvem:

```json
{
  "error": "Descrição do erro"
}
```

### Exemplos de Erros

**1. Token não fornecido**
```json
{
  "error": "Token não fornecido"
}
```

**2. Credenciais inválidas**
```json
{
  "error": "Credenciais inválidas"
}
```

**3. Stock insuficiente**
```json
{
  "error": "Stock insuficiente."
}
```

**4. Parâmetros faltam**
```json
{
  "error": "orderId e sku são obrigatórios."
}
```

---

## 📊 Logs e Auditoria

### Registos de Servidor

O servidor regista todas as ações no console:

```
[2026-04-26T15:30:45.123Z] INFO: POST /api/orders/login - 200 OK
[2026-04-26T15:31:02.456Z] DEBUG: JWT token generated for user: admin
[2026-04-26T15:31:15.789Z] INFO: GET /api/orders/pending - 200 OK (5 orders)
[2026-04-26T15:32:10.012Z] INFO: POST /api/orders/confirm - 200 OK
[2026-04-26T15:32:10.012Z] DEBUG: Stock updated: SHIRT-RED-M (45 → 44)
[2026-04-26T15:32:10.012Z] DEBUG: Audit log registered: CONFIRM_PAYMENT
```

### Auditoria no Banco de Dados

Todas as ações críticas são registadas em `audit_logs`:

```sql
SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 10;
```

Resultado exemplo:

```
id | admin_user | action           | details                        | timestamp
---+------------+------------------+--------------------------------+-------------------
 1 | admin      | CONFIRM_PAYMENT  | {...}                          | 2026-04-26 15:32:10
 2 | admin      | UPDATE_PRODUCT   | {"sku": "SHIRT-RED-M",...}   | 2026-04-26 15:31:00
 3 | admin      | LOGIN            | {"ip": "192.168.1.1"}         | 2026-04-26 15:30:45
```

---

## 🔧 Troubleshooting

### Problema: "Connection refused" ao PostgreSQL

**Causa**: PostgreSQL não está rodando

**Solução**:
```bash
# Verificar se o contentor está ativo
docker ps | grep postgres

# Se não estiver, iniciar
cd /root/evolution
docker-compose up -d postgres

# Verificar logs
docker logs evolution-postgres-1
```

---

### Problema: "Token inválido ou expirado"

**Causa**: Token expirou (8h) ou `JWT_SECRET` está incorreto

**Solução**:
```bash
# Obter novo token
curl -X POST http://localhost:3001/api/orders/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "rafa321"}'

# Verificar JWT_SECRET no .env coincide com uma parte do erro
grep JWT_SECRET .env
```

---

### Problema: "Stock insuficiente"

**Causa**: Produto com `stock_quantity = 0`

**Solução**:
```bash
# Verificar stock
TOKEN=$(curl -s -X POST http://localhost:3001/api/orders/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "rafa321"}' \
  | jq -r '.token')

curl -X GET http://localhost:3001/api/orders/products \
  -H "Authorization: Bearer $TOKEN" | jq '.[] | select(.sku == "SHIRT-RED-M")'

# Atualizar stock
curl -X PUT http://localhost:3001/api/orders/products/SHIRT-RED-M \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"stock_quantity": 50}'
```

---

### Problema: Porta 3001 já em uso

**Causa**: Outro processo está a usar a porta

**Solução**:
```bash
# Encontrar processo
lsof -i :3001

# Matar processo (PID = process ID)
kill -9 <PID>

# Ou usar porta diferente
PORT=3002 npm start
```

---

### Problema: `.env` não é carregado

**Causa**: `require('dotenv').config()` não foi chamado antes

**Solução**: Verificar que cada arquivo começa com:
```javascript
require('dotenv').config();
```

---

## 🚧 Roadmap

### Phase 1 (Atual)
- ✅ API REST básica com Express
- ✅ Autenticação JWT
- ✅ CRUD de Produtos/Pedidos/Clientes
- ✅ Auditoria

### Phase 2 (Próximas Semanas)
- 🔄 **Completar `orderService.js`**:
  - Implementar `getPendingOrders()`
  - Adicionar busca por data/cliente
  - Filtros avançados
  
- 🔄 **Webhook do N8N**:
  - Endpoint para criar pedidos via WhatsApp
  - Notificações de confirmação

- 🔄 **Integração com Evolution API**:
  - Enviar confirmações via WhatsApp Bot
  - Notificações de entrega

### Phase 3 (Futuro)
- 📧 **Sistema de Email**:
  - Confirmação de pedido
  - Atualização de status
  - Lembretes de pagamento

- 💳 **Integração com Gateway de Pagamento**:
  - Stripe / PayPal / MBWay
  - Webhook de confirmação

- 📱 **Aplicação Mobile**:
  - React Native
  - App nativa (iOS/Android)

- 📊 **Dashboard Admin**:
  - React + Recharts
  - Gráficos de vendas
  - Relatórios

- 🤖 **Machine Learning**:
  - Previsão de stock
  - Recomendações de produtos
  - Análise de padrões de compra

---

## 📞 Suporte

### Contactos

- **Email**: support@hrstore.dev
- **WhatsApp**: +351 912 345 678
- **Issues**: GitHub Issues

### Contribuições

Para contribuir:

1. Fork o repositório
2. Cria branch: `git checkout -b feature/MinhaFeature`
3. Commit: `git commit -m 'Add: MinhaFeature'`
4. Push: `git push origin feature/MinhaFeature`
5. Abre Pull Request

---

## 📄 Licença

Este projeto está sob licença **MIT**. Ver [LICENSE](LICENSE) para detalhes.

---

## 🎉 Agradecimentos

Desenvolvido com ❤️ por Tim  
Integrado com Evolution API, N8N e PostgreSQL

**Última Atualização**: 26 de Abril de 2026
