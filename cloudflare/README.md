# Deploy en Cloudflare Pages

La app se publica en **Cloudflare Pages** conectada a GitHub: cada push a `main` compila y publica sola.
El proyecto de Pages es independiente de cualquier otra app que ya exista en la misma cuenta.

## 1. Crear el proyecto (una sola vez)

1. Cloudflare → **Workers & Pages** → **Create** → pestaña **Pages** → **Connect to Git**.
2. Autoriza GitHub y elige el repo `culturacca`, rama de producción `main`.
3. Configuración de build:

   | Campo                  | Valor           |
   | ---------------------- | --------------- |
   | Framework preset       | `None` (o Vite) |
   | Build command          | `npm run build` |
   | Build output directory | `dist`          |
   | Root directory         | `/`             |

4. **Environment variables** (Production y Preview), los mismos valores de `.env.local`:

   | Variable                 | Valor                                  |
   | ------------------------ | -------------------------------------- |
   | `VITE_SUPABASE_URL`      | URL del proyecto Supabase              |
   | `VITE_SUPABASE_ANON_KEY` | clave anon/publishable                 |
   | `NODE_VERSION`           | `22`                                   |

   Nunca la service-role key. Las `VITE_*` se incrustan en el bundle durante el build, así que
   si cambian hay que volver a desplegar (Deployments → Retry deployment).
5. Nombre del proyecto, p. ej. `cultura-cca` → URL `https://cultura-cca.pages.dev`.
6. **Save and Deploy**. El `.npmrc` del repo (`legacy-peer-deps=true`) permite que `npm ci` funcione.
7. (Recomendado, el repo es público) Settings → Builds → **Preview deployments**: desactivarlos o
   limitarlos a ramas concretas.

Las cabeceras de seguridad y caché salen de `public/_headers` (Vite lo copia a `dist/`).

## 2. Ajustes después del primer deploy

Sustituye `https://cultura-cca.pages.dev` por la URL real.

- **Supabase** → Authentication → URL Configuration: *Site URL* = la URL de Pages; agrégala también
  en *Redirect URLs*.
- **Edge Function `admin-usuarios`** (CORS): secreto
  `ALLOWED_ORIGINS=https://cultura-cca.pages.dev,http://localhost:3000,http://localhost:4173`
  (dashboard de Supabase → Edge Functions → Secrets, o MCP `create_edge_function_secret`).
- **Firebase** (login de Google para Gmail/Calendar): Authentication → Settings → *Authorized domains*
  → agregar `cultura-cca.pages.dev`. En Google Cloud Console → APIs & Services → Credentials → cliente
  OAuth web → *Authorized JavaScript origins* → agregar la URL.
- **CSP**: no cambia mientras se usen los mismos proyectos de Supabase y Firebase.
- **Keep-alive**: desplegar el Worker de `keepalive/` siguiendo su README.

## 3. Verificar

- Abrir la URL, iniciar sesión (con usuario y con correo), hidratar datos, Toma de Asistencia.
- Crear un usuario de prueba en Configuración → Usuarios (prueba la Edge Function y CORS).
- Conectar Google y enviar una notificación de prueba.
- DevTools → Console sin errores de CSP; Network → cabeceras `Content-Security-Policy` presentes.

## 4. Probar el build en local antes de publicar

```sh
npm ci
npm run build
npm run preview   # http://localhost:4173, con la misma CSP que producción
```

## MCP de Cloudflare (opcional)

Cloudflare publica servidores MCP remotos (OAuth con la cuenta). Para Claude Code:

```sh
claude mcp add --transport http cloudflare-builds https://builds.mcp.cloudflare.com/mcp
claude mcp add --transport http cloudflare-observability https://observability.mcp.cloudflare.com/mcp
claude mcp add --transport http cloudflare-bindings https://bindings.mcp.cloudflare.com/mcp
claude mcp add --transport http cloudflare-docs https://docs.mcp.cloudflare.com/mcp
```

Luego `/mcp` dentro de Claude Code para autenticar. *Observability* sirve para leer los logs del Worker
keep-alive; *Builds* para el estado de los builds.
