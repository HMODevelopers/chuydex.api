# ChuyDex API

Backend REST de ChuyDex, la tienda de snacks de oficina de Chuyito. Está construido con NestJS, TypeORM y MySQL 8, con JWT, refresh-token rotativo, RBAC, bitácora y operaciones de inventario/venta transaccionales.

## Inicio rápido

1. Copia `.env.example` a `.env` y define secretos JWT de 32+ caracteres, credenciales MySQL y `SEED_ADMIN_PASSWORD`.
2. Instala dependencias: `npm install`.
3. Crea la base `chuydex_db` y ejecuta `npm run migration:run`.
4. Carga el administrador, permisos, categorías y configuración: `npm run seed`.
5. Inicia: `npm run start:dev`.

Swagger queda disponible en `http://localhost:3000/api/docs`; health en `/api/health`.

## Docker

Define `DB_PASSWORD`, `MYSQL_ROOT_PASSWORD`, secretos JWT y `SEED_ADMIN_PASSWORD` en `.env`, después ejecuta `docker compose up --build`. Cuando MySQL esté saludable: `docker compose exec chuydex_api npm run migration:run` y `docker compose exec chuydex_api npm run seed`.

## Arquitectura

Los controllers delegan en servicios. `InventoryService` es el único punto para cambiar stock y registra cada movimiento. `SalesService` usa una transacción, bloquea productos, guarda detalle/precios históricos y revierte stock en cancelación. Los refresh tokens están hasheados con bcrypt en `sesiones` y se rotan al refrescar.

Módulos: `auth`, `users`, `roles`, `catalog`, `inventory`, `sales`, `promotions`, `dashboard`, `settings`, `audit`, `public` y `database`.

## Comandos

`npm run build` · `npm run lint` · `npm test` · `npm run migration:run` · `npm run migration:revert` · `npm run seed`.

## Endpoints principales

- Auth: `POST /api/auth/login`, `/refresh`, `/logout`, `/change-password`; `GET /profile`.
- Administración: CRUD de `/api/categorias`, `/api/productos`, `/api/clientes`, `/api/usuarios`; `/api/roles`, `/api/permisos`.
- Inventario: `/api/inventario`, `/entrada`, `/ajuste`, `/movimientos`.
- Ventas: `GET|POST /api/ventas`, `POST /api/ventas/:id/cancelar`.
- Promociones: `GET|POST /api/promociones`, `PUT /api/promociones/:id`.
- Públicos: `/api/catalogo`, `/api/compartir/catalogo`; operaciones: `/api/dashboard/resumen`, `/api/configuracion`, `/api/bitacora`.

Todas las respuestas exitosas se envuelven como `{ success: true, data }`; los listados incluyen `meta`.
