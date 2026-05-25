# Nginx — API HR Store (produção)

## Problema: upload de várias imagens falha com 413 / “erro CORS”

| Camada | Limite | Multi-imagem (até ~60 MB) |
|--------|--------|---------------------------|
| Admin (FormData) | — | Envia tudo num POST |
| Express `json` | 2 MB | Não aplica a `multipart` |
| Multer | 5 MB × 12 ficheiros | OK |
| **nginx (default)** | **1 MB** | **Rejeita → 413** |

Quando o nginx responde **413** antes do Node, **não há** `Access-Control-Allow-Origin` → o browser mostra também erro CORS (secundário).

## Fix mínimo (só uma linha)

No `server { }` de `api.hrstorept.com`:

```nginx
client_max_body_size 80M;
```

Recomendado: usar o snippet completo com timeouts:

```bash
sudo cp deploy/nginx/snippets/hrstore-upload-limits.conf /etc/nginx/snippets/
```

Dentro do bloco `server` do site API:

```nginx
include /etc/nginx/snippets/hrstore-upload-limits.conf;
```

Ou copiar o exemplo completo:

```bash
sudo cp deploy/nginx/api.hrstorept.com.conf.example /etc/nginx/sites-available/api.hrstorept.com
# Rever SSL paths e upstream (127.0.0.1:3001)
sudo ln -sf /etc/nginx/sites-available/api.hrstorept.com /etc/nginx/sites-enabled/
```

## Aplicar

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Não é necessário reiniciar o backend Node nem o frontend.

## Verificar (nginx deixa passar o body)

```bash
# Deve NOT ser 413 (401/400 sem token é esperado — pedido chegou ao upstream)
curl -sI -X POST -H "Content-Length: 30000000" \
  https://api.hrstorept.com/api/orders/products/1/images
```

Se ainda vires `413`, confirma que editaste o **server block correcto** (`server_name api.hrstorept.com`) e que não há outro `client_max_body_size 1m` no `http { }` global a sobrepor (o do `server` ganha para esse host).

## Checklist pós-deploy código (admin + API)

- [ ] Migração `2026-05-22_product_variant_images.sql` aplicada na base de produção
- [ ] Backend com fix `collectGalleryFiles` + `Content-Type` / FormData no admin
- [ ] Este fix nginx (`client_max_body_size 80M`)
