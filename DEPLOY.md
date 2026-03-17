# 🚀 Guía de Deploy — PocketPal Finance v3

Esta guía cubre tres plataformas: **Railway** (recomendada, más fácil), **Render**, y **VPS con PM2**.  
La base de datos MySQL ya está en Aiven — no necesitas cambiarla.

---

## Antes de empezar — Lista de verificación

Necesitas tener listo:

- [ ] Repositorio en GitHub (el código fuente del proyecto)
- [ ] Cuenta en la plataforma de deploy elegida
- [ ] Las credenciales del `.env` a mano
- [ ] La URL final de tu app (la obtienes después de crear el servicio)

---

## Paso 0 — Subir el código a GitHub

Si no tienes el repo, créalo ahora. Desde la raíz del proyecto:

```bash
# Inicializar git (si no está inicializado)
git init

# Crear .gitignore en la raíz
echo "node_modules/\n.env\n*.log\n.DS_Store" > .gitignore

# Subir todo
git add .
git commit -m "feat: pocketpal v3 initial deploy"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/pocketpal.git
git push -u origin main
```

> **Importante:** el archivo `backend/.env` ya está en el `.gitignore` del backend.
> Nunca debe subirse a GitHub — las variables se configuran directamente en la plataforma.

---

## Opción A — Railway ⭐ (Recomendada)

Railway detecta automáticamente que es Node.js, instala dependencias y corre `npm start`.

### 1. Crear el proyecto

1. Ir a [railway.app](https://railway.app) → **New Project**
2. Seleccionar **Deploy from GitHub repo**
3. Autorizar Railway y elegir el repositorio de PocketPal
4. Railway crea el servicio automáticamente

### 2. Configurar el directorio raíz

El `server.js` está dentro de `backend/`, no en la raíz del repo.  
En Railway → Settings → **Root Directory** → escribir: `backend`

### 3. Agregar las variables de entorno

En Railway → tu servicio → pestaña **Variables** → **Raw Editor** → pegar esto y rellenar los valores:

```

```

Las siguientes las completas DESPUÉS de conocer la URL de Railway (paso 4):

```
FRONTEND_URL=https://TU-APP.up.railway.app
CORS_ORIGIN=https://TU-APP.up.railway.app
GOOGLE_CALLBACK_URL=https://TU-APP.up.railway.app/api/auth/google/callback
```

### 4. Obtener la URL pública

Railway → tu servicio → pestaña **Settings** → **Domains** → **Generate Domain**  
Copia la URL (ej: `https://pocketpal-production.up.railway.app`) y úsala para rellenar las tres variables del paso anterior.

### 5. Actualizar Google Cloud Console

Para que el login con Google funcione en producción hay que autorizar la nueva URL:

1. Ir a [console.cloud.google.com](https://console.cloud.google.com)
2. **APIs y servicios** → **Credenciales** → tu cliente OAuth
3. En **URIs de redireccionamiento autorizados** → **Agregar URI**:
   ```
   https://TU-APP.up.railway.app/api/auth/google/callback
   ```
4. En **Orígenes de JavaScript autorizados** → **Agregar URI**:
   ```
   https://TU-APP.up.railway.app
   ```
5. Guardar cambios

### 6. Verificar el deploy

```
https://TU-APP.up.railway.app/health
```

Debe responder:
```json
{ "status": "ok", "timestamp": "...", "env": "production" }
```

La app principal:
```
https://TU-APP.up.railway.app/frontend/index.html
```

---

## Opción B — Render

### 1. Crear el Web Service

1. [render.com](https://render.com) → **New** → **Web Service**
2. Conectar tu repositorio de GitHub
3. Configurar:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Environment:** `Node`

### 2. Variables de entorno

Render → tu servicio → **Environment** → **Add Environment Variable**  
Agregar las mismas variables que en Railway (sección anterior).

La URL de Render tiene formato: `https://pocketpal.onrender.com`

> **Nota Render free tier:** los servicios se "duermen" después de 15 minutos de inactividad.  
> El primer request tras el sueño puede tardar 30–60 segundos. Para evitarlo, usa el plan pago o configura un ping externo (ej: UptimeRobot).

### 3. Google Cloud Console

Mismo proceso que en Railway — agregar la URL de Render como URI autorizado.

---

## Opción C — VPS (Ubuntu) con PM2

Para servidores propios (DigitalOcean, Hetzner, AWS EC2, etc.).

### 1. Preparar el servidor

```bash
# Conectar al servidor
ssh usuario@IP_DEL_SERVIDOR

# Instalar Node.js 20 (si no está instalado)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar PM2 globalmente
sudo npm install -g pm2

# Instalar git si no está
sudo apt-get install -y git
```

### 2. Clonar el proyecto

```bash
cd /var/www
git clone https://github.com/TU_USUARIO/pocketpal.git
cd pocketpal/backend
npm install --production
```

### 3. Crear el archivo `.env`

```bash
nano /var/www/pocketpal/backend/.env
```

Pegar y rellenar el contenido del bloque de variables de entorno (igual que Railway).  
Guardar con `Ctrl+O`, salir con `Ctrl+X`.

### 4. Iniciar con PM2

```bash
cd /var/www/pocketpal/backend

# Iniciar la aplicación
pm2 start server.js --name pocketpal

# Guardar la configuración para que reinicie al rebotar el servidor
pm2 save
pm2 startup   # ejecutar el comando que PM2 te indique

# Ver logs en tiempo real
pm2 logs pocketpal

# Ver estado
pm2 status
```

### 5. Configurar Nginx como proxy reverso

```bash
sudo apt-get install -y nginx

sudo nano /etc/nginx/sites-available/pocketpal
```

Pegar esta configuración (reemplazar `tudominio.com`):

```nginx
server {
    listen 80;
    server_name tudominio.com www.tudominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Activar el sitio
sudo ln -s /etc/nginx/sites-available/pocketpal /etc/nginx/sites-enabled/
sudo nginx -t          # verificar configuración
sudo systemctl reload nginx
```

### 6. HTTPS con Let's Encrypt (recomendado)

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tudominio.com -d www.tudominio.com
# Seguir las instrucciones en pantalla — certbot actualiza Nginx automáticamente
```

---

## Variables de entorno — referencia rápida

| Variable | Desarrollo | Producción |
|---|---|---|
| `NODE_ENV` | `development` | `production` |
| `PORT` | `3000` | `3000` (Railway/Render lo ignoran y asignan el suyo) |
| `FRONTEND_URL` | `http://localhost:3000` | `https://TU-APP.dominio.com` |
| `CORS_ORIGIN` | `http://localhost:3000` | `https://TU-APP.dominio.com` |
| `GOOGLE_CALLBACK_URL` | `http://localhost:3000/api/auth/google/callback` | `https://TU-APP.dominio.com/api/auth/google/callback` |
| `DB_HOST` | Sin cambios | Sin cambios (Aiven ya es producción) |
| `JWT_SECRET` | Cualquier string | **Generar uno nuevo y seguro** |
| `OPENAI_API_KEY` | Sin cambios | Sin cambios |

### Generar un JWT_SECRET seguro

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Solución de problemas comunes

### La app abre pero no carga el frontend

Verificar que la ruta estática esté sirviendo correctamente:
```
https://TU-APP.com/frontend/index.html  ← debe cargar la pantalla de login
```
Si devuelve 404, el problema es que `ROOT_DIRECTORY` no apunta a `backend/` o la ruta del frontend en `app.js` es incorrecta.

---

### El login con Google falla con "redirect_uri_mismatch"

La URL del callback en Google Cloud Console no coincide exactamente con `GOOGLE_CALLBACK_URL`.  
Verificar que no haya una barra final (`/`) o diferencia de protocolo (`http` vs `https`).

---

### Error de conexión a MySQL

Verificar que Aiven tenga habilitado el acceso desde la IP del servidor de deploy.  
En Aiven → tu servicio MySQL → **Allowed IP Addresses** → agregar `0.0.0.0/0` (todos) o la IP específica del servidor.

---

### Las transacciones o categorías no cargan (401 Unauthorized)

El token JWT está expirado o el `JWT_SECRET` cambió entre deploys.  
Hacer logout y login nuevamente en el navegador.

---

### PM2 no inicia después de reiniciar el servidor

```bash
pm2 resurrect       # restaurar los procesos guardados
pm2 logs pocketpal  # ver el error
```

---

## Checklist final pre-lanzamiento

- [ ] `https://TU-APP.com/health` responde `{ "status": "ok" }`
- [ ] Login con email/contraseña funciona
- [ ] Login con Google funciona (sin `redirect_uri_mismatch`)
- [ ] Se pueden crear transacciones
- [ ] Las gráficas cargan
- [ ] El agente NOVA responde (verificar OPENAI_API_KEY)
- [ ] El chat con NOVA registra una transacción de prueba
- [ ] `NODE_ENV=production` está configurado
