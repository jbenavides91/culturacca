# Keep-alive de Supabase (Cloudflare Worker)

El plan gratis de Supabase pausa el proyecto después de 7 días sin actividad. Este Worker hace una consulta mínima a Supabase **lunes y jueves a las 9:00 (hora de Nicaragua)** para que eso no ocurra durante las vacaciones. Es gratis en el plan Workers Free.

Necesita dos **secretos** (los mismos valores de `.env.local`):

| Secreto             | Valor                                              |
| ------------------- | -------------------------------------------------- |
| `SUPABASE_URL`      | `VITE_SUPABASE_URL`                                |
| `SUPABASE_ANON_KEY` | `VITE_SUPABASE_ANON_KEY` (nunca la service-role key) |

## Opción A: desde el dashboard (sin instalar nada)

1. Cloudflare → **Workers & Pages** → **Create** → **Create Worker** (plantilla "Hello World"), nombre `cca-supabase-keepalive` → **Deploy**.
2. **Edit code**: reemplaza todo por el contenido de `worker.js` → **Deploy**.
3. **Settings → Variables and Secrets** → **Add** → tipo *Secret*: `SUPABASE_URL` y `SUPABASE_ANON_KEY`.
4. **Settings → Trigger events** → **Add** → *Cron Triggers* → `0 15 * * 1,4`.
5. (Opcional) **Settings → Domains & Routes**: desactiva la ruta `workers.dev`; el Worker no necesita URL pública.

## Opción B: con la línea de comandos

Desde esta carpeta (`cloudflare/keepalive`):

```sh
npx wrangler@4 login
npx wrangler@4 secret put SUPABASE_URL
npx wrangler@4 secret put SUPABASE_ANON_KEY
npx wrangler@4 deploy
```

`wrangler.toml` ya define el nombre y el cron.

## Probar

- Local: crea `.dev.vars` aquí (está en `.gitignore`) con `SUPABASE_URL=...` y `SUPABASE_ANON_KEY=...`, ejecuta `npx wrangler@4 dev --test-scheduled` y abre `http://localhost:8787/__scheduled?cron=0+15+*+*+1,4`. La consola debe mostrar `Supabase respondió HTTP 200`.
- En producción: Worker → **Logs** (Observability) muestra cada ejecución del cron; un fallo aparece como error con el código HTTP.
