// Cloudflare Worker que evita que el proyecto de Supabase (plan gratis) se
// pause tras 7 días sin actividad, por ejemplo durante las vacaciones.
//
// Un Cron Trigger (ver wrangler.toml) ejecuta `scheduled` lunes y jueves. Hace
// una consulta mínima a la API REST con la anon key: con RLS devuelve [], pero
// llega a Postgres y cuenta como actividad. Un pg_cron interno no sirve, porque
// Supabase no lo cuenta como actividad.
//
// Secretos del Worker (nunca en el código ni en el repo):
//   SUPABASE_URL       = el mismo VITE_SUPABASE_URL de .env.local
//   SUPABASE_ANON_KEY  = el mismo VITE_SUPABASE_ANON_KEY (nunca la service-role key)

const INTENTOS = 3;
const ESPERA_MS = 10_000;

async function pingSupabase(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error('Faltan los secretos SUPABASE_URL o SUPABASE_ANON_KEY');
  }
  const url = `${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/configuracion?select=id&limit=1`;
  let ultimoError = '';
  for (let intento = 1; intento <= INTENTOS; intento++) {
    try {
      const res = await fetch(url, {
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        },
      });
      await res.body?.cancel();
      if (res.ok) {
        console.log(`Supabase respondió HTTP ${res.status} (intento ${intento})`);
        return res.status;
      }
      ultimoError = `HTTP ${res.status}`;
    } catch (err) {
      ultimoError = String(err);
    }
    console.warn(`Intento ${intento} falló: ${ultimoError}`);
    if (intento < INTENTOS) await new Promise((r) => setTimeout(r, ESPERA_MS));
  }
  // Lanzar el error marca la ejecución como fallida en los logs del Worker.
  throw new Error(`Supabase no respondió bien (${ultimoError}). ¿Proyecto pausado?`);
}

export default {
  async scheduled(event, env, ctx) {
    await pingSupabase(env);
  },

  // El Worker no atiende peticiones HTTP.
  async fetch() {
    return new Response('Not found', { status: 404 });
  },
};
