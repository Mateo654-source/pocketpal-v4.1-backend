# PocketPal — Backend

API REST de PocketPal Finance construida con **Node.js + Express + MySQL**. Gestiona autenticación, transacciones financieras, metas de ahorro, categorías y un agente IA conversacional.

---

## Stack

| Tecnología                     | Uso                               |
|--------------------------------|-----------------------------------|
| Node.js 20+ (ESM)              | Runtime                           |
| Express 4                      | Framework HTTP                    |
| MySQL 8 + mysql2               | Base de datos                     |
| Passport.js + Google OAuth 2.0 | Autenticación social              |
| JWT (jsonwebtoken)             | Sesiones stateless                |
| bcryptjs                       | Hash de contraseñas               |
| OpenAI SDK                     | Agente IA POKI                    |
| googleapis                     | Sincronización Gmail              |
| node-cron                      | Sync automático cada hora         |
| helmet + express-rate-limit    | Seguridad                         |

---

## Requisitos previos

- Node.js 20+
- MySQL 8.0+
- Cuenta de Google Cloud con OAuth 2.0 y Gmail API habilitados
- Clave de API de OpenAI

---

## Instalación

```bash
# 1. Instalar dependencias
npm install

# 2. Crear el archivo de entorno
cp .env.example .env   # o crear .env manualmente (ver sección Variables)

# 3. Arrancar en desarrollo
npm run dev

# 4. Arrancar en producción
npm start
```

El servidor crea las tablas automáticamente al arrancar (`db/init.js`). No es necesario ejecutar migraciones manualmente.

---

## Variables de entorno

```env
# Servidor
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5500,http://127.0.0.1:5500

# Base de datos
DB_HOST=localhost
DB_PORT=3306
DB_NAME=pocketpal
DB_USER=root
DB_PASSWORD=

# JWT
JWT_SECRET=cambia_esto_por_un_string_aleatorio_de_32_chars
JWT_EXPIRES_IN=7d

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback

# OpenAI
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o

# Frontend (para redirección OAuth)
FRONTEND_URL=http://localhost:5500
```

---

## Estructura del proyecto

```
src/
├── app.js                  # Configuración de Express (middleware, rutas)
├── config/
│   ├── db.js               # Pool de conexiones MySQL
│   └── passport.js         # Estrategia Google OAuth 2.0
├── controllers/            # Capa HTTP: recibir request, delegar al servicio
├── db/
│   └── init.js             # Creación de tablas y categorías por defecto
├── errors/
│   └── AppError.js         # Jerarquía de errores operacionales
├── jobs/
│   └── syncCron.js         # Cron de sincronización automática Gmail
├── middleware/
│   ├── authMiddleware.js   # Verificación JWT (protect)
│   ├── errorHandler.js     # Manejo centralizado de errores
│   ├── rateLimiter.js      # Rate limiting por ruta
│   └── validate.js         # Validación declarativa de request bodies
├── routes/                 # Definición de endpoints
└── services/               # Lógica de negocio y acceso a datos
    ├── aiService.js        # Agente POKI con OpenAI tool calling
    ├── authService.js      # Registro, login, OAuth helpers
    ├── bankParser/         # Parsers de correos bancarios
    │   ├── bankParser-index.js        # Detección de banco + extracción del cuerpo
    │   └── bancolombiaParser.js
    ├── category/           # Cadena de categorización automática
    │   ├── categoryCache.js
    │   ├── categoryRules.js
    │   └── categorySimilarity.js
    ├── categoryService.js
    ├── chatgpt-integration.service.js  # Clasificación por IA (fallback)
    ├── gmailService.js     # Sincronización completa desde Gmail
    ├── goalService.js
    ├── summaryService.js
    └── transactionService.js
```

---

## Endpoints principales

| Método | Ruta                        | Descripción                     |
|--------|-----------------------------|---------------------------------|
| POST   | `/api/auth/register`        | Registro con email/contraseña   |
| POST   | `/api/auth/login`           | Login con email/contraseña      |
| GET    | `/api/auth/me`              | Perfil del usuario autenticado  |
| GET    | `/api/auth/google`          | Inicio flujo OAuth Google       |
| GET    | `/api/auth/google/callback` | Callback OAuth                  |
| GET    | `/api/transactions`         | Listar con filtros y paginación |
| POST   | `/api/transactions`         | Crear transacción               |
| PUT    | `/api/transactions/:id`     | Actualizar transacción          |   
| DELETE | `/api/transactions/:id`     | Eliminar transacción            |
| GET    | `/api/categories`           | Listar categorías               |
| POST   | `/api/categories`           | Crear categoría personalizada   |
| GET    | `/api/goals`                | Listar metas                    |
| POST   | `/api/goals`                | Crear meta                      |
| POST   | `/api/goals/:id/contribute` | Abonar a una meta               |
| GET    | `/api/summary`              | Resumen financiero              |
| POST   | `/api/ai/chat`              | Chat con agente POKI            |
| POST   | `/api/gmail/sync`           | Sincronización manual Gmail     |
| GET    | `/health`                   | Health check                    |

Todas las rutas (excepto auth y health) requieren header `Authorization: Bearer <token>`.

---

## Agente IA (POKI)

El agente usa **GPT-4o con tool calling**. Puede:

- Registrar transacciones con lenguaje natural
- Consultar estadísticas por período
- Listar transacciones recientes
- Crear y abonar metas de ahorro
- Actualizar metas existentes

El contexto financiero (balance, categorías, historial) se inyecta en el system prompt en cada llamada para que POKI tenga datos actualizados.

---

## Sincronización Gmail

El sistema descarga correos de bancos colombianos (Bancolombia, Davivienda, Banco de Bogotá), los parsea con regex y los inserta como transacciones. La categorización sigue esta cadena de prioridad:

1. **Reglas de palabras clave** — instantáneo, sin costo
2. **Caché por merchant** — reutiliza clasificaciones previas
3. **Similitud de texto** — busca nombre de categoría en descripción
4. **GPT-4.1-nano** — solo si los tres métodos anteriores fallan

La sincronización automática corre cada hora via `node-cron`.

---

## Manejo de errores

Todos los errores pasan por `errorHandler.js`. Las subclases de `AppError` (`NotFoundError`, `ConflictError`, etc.) producen respuestas JSON estructuradas. Los errores inesperados devuelven 500 y solo exponen el stack trace en `NODE_ENV=development`.
