# Construdata API

API en Express con PostgreSQL que implementa CRUD para:
- `plans`
- `constructoras`
- `obras`
- `residentes`
- `historial_telefonos`
- `asignaciones_obra`
- `configuracion_reportes`

## Requisitos
- Node.js >= 18
- PostgreSQL >= 13

## Variables de entorno
Copiar `.env.example` a `.env` y ajustar `DATABASE_URL`.
Para Supabase usa la cadena de conexión de tu proyecto y deja `PGSSL=true`.

## Instalación
```
npm install
npm run dev
```

Servidor: `http://localhost:3000/`
Health: `http://localhost:3000/health`

## Base de datos
Ejecutar los SQL en `sql/schema.sql` y luego `sql/seed.sql` en tu base de datos.

> Nota: El esquema incluye `CREATE SCHEMA IF NOT EXISTS auth` y una tabla mínima `auth.users` para que las claves foráneas funcionen si no usas Supabase. Si ya tienes `auth.users`, puedes eliminar esa parte.

## Endpoints
Los recursos están bajo `/api/<recurso>`:
- `/api/plans`
- `/api/constructoras`
- `/api/obras`
- `/api/residentes`
- `/api/historial_telefonos`
- `/api/asignaciones_obra`
- `/api/configuracion_reportes`
 - `/api/reportes`
 - `/api/pagos`
 - `/api/user_roles`
- `/api/mensajes_whatsapp_log`

## Webhooks
- WhatsApp (Meta):
  - `GET /webhooks/whatsapp` verificación (`hub.mode`, `hub.verify_token`, `hub.challenge`)
  - `POST /webhooks/whatsapp` puente hacia n8n (`N8N_WEBHOOK_URL`)
  - Configura `META_VERIFY_TOKEN` para la verificación de Meta.

Operaciones soportadas por cada recurso:
- `GET /` listar
- `GET /:id` obtener por id
- `POST /` crear
- `PUT /:id` actualizar (parcial)
- `DELETE /:id` eliminar
 
### Autenticación e Integración con Firebase

Para mantener Firebase como proveedor de autenticación y registrar el usuario en la base de datos (Supabase/Postgres) se agregan endpoints de sincronización:

- `POST /api/auth/sync`
  - Body: `{ firebase_uid: string }`
  - Comportamiento: busca un `auth.users` por `firebase_uid`; si no existe lo crea y devuelve `{ user_id: <uuid> }`.

- `GET /api/constructoras/by-user/:userId`
  - Parámetro: `userId` es el UUID de `auth.users.id` devuelto por el sync.
  - Devuelve la última constructora asociada a ese usuario.

Estos endpoints permiten al front (Firebase) enlazar el usuario autenticado con un registro local y crear la constructora al momento de registro.

## Ejemplo de `.env`

```
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/construdata
PGSSL=true
N8N_WEBHOOK_URL=https://mi-n8n.example.com/webhook/whatsapp
META_VERIFY_TOKEN=tu_token_de_verificacion_meta
```