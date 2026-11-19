# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Cultura CCA" (institution: Colegio Centro América): a Spanish-language PWA for attendance, enrollment and cashier/solvency management of afternoon art & culture workshops. It was scaffolded in Google AI Studio (see README). The UI text, domain types and most identifiers are in Spanish (`Grupo` = workshop, `Sesion` = class session, `Asistencia` = attendance record, `Inscripcion` = enrollment in a group, `Matricula` = enrollment request, `Tutor` = guardian, `Perfil` = user profile). Keep new code consistent with that vocabulary.

## Commands

- `npm install` / `npm ci`: `.npmrc` sets `legacy-peer-deps=true` because of a pre-existing esbuild/vite peer conflict (needed by the Cloudflare Pages build too). npm is the only package manager (`package-lock.json`; the old `bun.lock` was removed so Cloudflare does not pick bun).
- **Deploy**: Cloudflare Pages connected to GitHub (push to `main` publishes). Build `npm run build`, output `dist`, env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `NODE_VERSION=22`. Steps and post-deploy settings (Supabase Site URL, `ALLOWED_ORIGINS`, Firebase authorized domains) are in `cloudflare/README.md`. **Status: live at https://culturacca.pages.dev** (first deploy 2026-11-17; headers verified; bundle rebuilt with the `VITE_*` vars, which only take effect after a redeploy). `ALLOWED_ORIGINS` is set (verified: preflight from the Pages origin echoes it, a foreign origin gets no `Access-Control-Allow-Origin`) and the Supabase Site URL points to Pages; login, hydration and user creation returned 200 from production. Pending: Firebase/Google OAuth authorized domain, keep-alive Worker.
- Requires `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example`); without it the app shows a "Falta configurar Supabase" screen.
- `npm run dev`: Vite dev server on port 3000, bound to `0.0.0.0`
- `npm run build` / `npm run preview`
- `npm run lint`: type-check only (`tsc --noEmit`). There is no ESLint/Prettier config.
- There is no test runner or test suite.
- `npm run clean` uses `rm -rf` and won't work in Windows PowerShell; use `Remove-Item -Recurse -Force dist`.

`DISABLE_HMR=true` turns off HMR and file watching (AI Studio sets it during agent edits; see `vite.config.ts`). The `@/*` alias resolves to the repo root, not `src/`. The build warns about chunk size (>500 kB); that is expected for now.

**Supabase MCP**: a project-scoped MCP server `supabase-cca` (local scope, pinned to project ref `dxdrdzrdtpkoxjmmccsb`, read/write) is configured for this folder. Use it to apply schema changes (`apply_migration`), run SQL, read logs and advisors, and deploy the Edge Function. **Every schema change applied through the MCP must also be saved as the next numbered file in `supabase/migrations/`** so the repo stays the source of truth. After DDL changes, run `get_advisors` (security). The known remaining warnings are expected: `email_por_usuario` is callable by `anon` on purpose (username login), `current_rol` must stay executable by `authenticated` (RLS uses it), `rls_auto_enable` is Supabase-managed, and leaked-password protection is a dashboard setting.

- **Confirmation prompts**: `execute_sql` asks for a confirmation on statements that modify data, and in this client that prompt has repeatedly expired unanswered. Read-only `select`s run without a prompt. Do not use `apply_migration` to slip real data changes past the confirmation; ask the user instead.
- **Schema changes need explicit approval**: Claude Code's permission classifier blocks `apply_migration` when the user did not explicitly ask for that database change (e.g. a fix proposed during a "validate errors" request). In that case, write the migration file, explain it, and wait for the user to say "aplica …". A migration file that exists in the repo but is not applied must be applied or deleted promptly, so the repo and the database never drift.
- **Advisors baseline**: performance should report only the INFO "unused index" notices, which are expected while the database is nearly empty. Security should report only the four expected warnings above. Anything else is new and must be investigated.
- **Testing RLS** (reversible, leaves nothing behind): wrap the test in a `do $$ … $$` block. Inside it, create any fixtures, impersonate users with `execute 'set local role authenticated'` plus `set_config('request.jwt.claims', json_build_object('sub', '<uid>', 'role', 'authenticated')::text, true)`, collect results in a text variable, and finish with `raise exception '… %', resultado`. The exception rolls everything back and returns the results in the error message. If `execute_sql` confirmation is unavailable, run it through `apply_migration`: it fails, so no migration is recorded. Afterwards, verify with a read-only `select` and `list_migrations`.
- Values from `numeric` columns (e.g. `arancel_taller`, `monto_arancel`, `costo`) may arrive as strings, so wrap them in `Number(...)` before doing arithmetic or comparisons.
- **Keep-alive (the free plan pauses after 7 idle days)**: the Cloudflare Worker in `cloudflare/keepalive/` (`worker.js`, `wrangler.toml`, deploy steps in its README) runs a Cron Trigger on Monday and Thursday at 15:00 UTC and does a `GET /rest/v1/configuracion?select=id&limit=1` with the anon key. RLS returns `[]`, but the request reaches Postgres and counts as activity. Its secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY` live only in the Worker (never the service-role key, never in the repo). Failures show in the Worker's Logs. An internal `pg_cron` does not count as activity. GitHub Actions was rejected because the repos are public. `cloudflare/` is excluded from `tsconfig`. **Status: not deployed yet**; it will be deployed together with the Cloudflare Pages setup (follow the README, then confirm with MCP `query_logs` that `GET /rest/v1/configuracion` returns 200 on cron days). Until then, nothing prevents the pause.

## Architecture

**Backend is Supabase** (Postgres + Auth + Realtime + two Edge Functions: `admin-usuarios` and `correo-matricula`), accessed directly from the browser with the anon key (`src/services/supabase.client.ts`); security is enforced by RLS. Schema, RLS policies and realtime publication live in `supabase/migrations/` (`0001_init.sql` base schema; `0002_plantilla_contrato.sql`; `0003_anecdotario.sql`; `0004_salones.sql`; `0005_corregir_fechas_sesiones.sql`, a one-off data fix; `0006_arancel.sql`; `0007_optimizar_politicas_rls.sql`; `0008_sesiones_extraordinarias.sql`; `0009_anecdotario_edicion_admin.sql`; `0010_grados.sql`; `0011_dias_no_lectivos.sql`; `0012_cortes_bimestrales.sql`; `0013_correo_matricula.sql`; `0014_cupo_talleres.sql`; `0015_eventos.sql`; `0016_eliminar_estudiantes_admin.sql`). The `admin-usuarios` Edge Function (`supabase/functions/`, Deno, excluded from `tsconfig`) uses the service role. Its actions are `create`, `update` (profile plus Auth email/password), `delete`, and `grant_access` (gives a login to a legacy profile and moves its references). Every action requires an active ADMIN caller. After editing it, redeploy through the MCP `deploy_edge_function` (name `admin-usuarios`, `verify_jwt: false`, passing the full `index.ts`); `list_edge_functions` shows the deployed version. It is deployed with `verify_jwt: false` because it validates the caller's session and ADMIN role itself, which also avoids CORS-preflight issues with the `sb_publishable_` key. The service-role key must never reach the frontend or `.env.local`. `express`, `dotenv` and `@google/genai` are unused leftovers from AI Studio.

**Navigation is state-based, not routed.** `src/App.tsx` holds `currentTab: NavTab` (type defined in `modules/navigation/Sidebar.tsx`) and conditionally renders one view per tab. Cross-module navigation is done via callbacks passed down from `App` (e.g. `onSelectWorkshop` sets the selected group and switches to the `asistencia` tab). When adding a tab: update `NavTab`, `Sidebar`, `ROLE_CONFIGS` in `utils/rbac.ts`, and the render switch in `App.tsx`.

**Mobile menu** (below `lg`):
- `Sidebar` renders `renderContenido(movil)` twice: as the desktop `<aside>` and as a drawer (`#menu-movil`).
- The drawer is always mounted, so it can animate in and out (`translate-x` plus a fading backdrop). While closed it is `inert` and `aria-hidden`.
- It is always expanded, ignoring the desktop `isCollapsed`, and has 44 px touch targets (`min-h-11`).
- It closes with ✕, Escape, a tap on the backdrop, a left swipe, choosing an item or the logo, or when the window grows to `lg`.
- While open it locks body scroll and moves focus to ✕, then restores both on close. `onCloseMobile` is kept in a ref, because `App` passes a new function on every render.
- The hamburger in `Topbar` is 44 px and has `aria-expanded`.
- The root container uses `h-dvh`, not `h-screen`, so mobile browser bars don't hide content. `index.html` sets `viewport-fit=cover`, and the drawer pads with `env(safe-area-inset-*)`.

**RBAC** (`src/utils/rbac.ts`): roles `ADMIN`, `PROFESOR`, `CAJERO`, `MATRICULA`, each with an allowed-tab list and a default tab. `App` blocks disallowed tabs; views also receive `currentProfile` and filter data by role (e.g. professors see only their own groups). The UI rules must stay consistent with the RLS write policies in the SQL migrations. Reads are open to any active profile, except `anecdotario` (see below). Writes:
- ADMIN: everything; only ADMIN writes `grupos`, `perfiles`, `configuracion`, `salones` and `grados`.
- PROFESOR: `asistencias`, `sesiones`, `log_notificaciones`, inserting its own `anecdotario` notes, and `evento_participantes` of its own workshops while the event is open.
- CAJERO and MATRICULA: `matriculas`, `estudiantes`, `tutores`, `inscripciones`. Since `0016`, **deleting** `estudiantes` is ADMIN only (they keep INSERT and UPDATE).

Some rules are stricter than RLS and are enforced only in the UI and the service. The database would allow these writes, so they must be kept in both places:
- **Cambiar de taller:** ADMIN only (`cambiarDeTaller` checks `perfilActual`).
- **"Estado Pago Anual" in Estudiantes → Editar:** ADMIN and CAJERO only.
- **Solvency gate:** a student enters a workshop only once Caja has confirmed the payment.
- **Workshop capacity:** a full workshop takes no more requests or enrollments.
- **Schedule clash:** a student cannot hold two workshops that overlap.

**Policy shape** (since `0007`): every table has one `lectura_personal_activo` SELECT policy plus separate `escritura_insert` / `escritura_update` / `escritura_delete` policies. `0001` and `0004` still create the old `escritura_por_rol FOR ALL` shape, and `0007` replaces it. When adding a table, reuse the `pg_temp.reescribir_politicas(tabla, roles)` helper from `0007` instead of copying the old pattern. Never use `FOR ALL`, which overlaps the SELECT policy and triggers the "multiple permissive policies" advisor. Always wrap functions as `(select public.current_rol())` and `(select auth.uid())` so they are evaluated once per query, not per row. A rolled-back 20-case test covering ADMIN, PROFESOR, CAJERO, a user without a profile, and the anecdotario rules passed after this change. If a role gets a new write action, update the policy too, or the write is rejected and rolled back.

**Data layer** (`src/services/storage.service.ts`, singleton `storageService`) keeps a **synchronous API on top of an in-memory store hydrated from Supabase** (`src/services/supabase.sync.ts`, `syncStore`):
- After login, `storageService.hydrate()` downloads every table into memory and starts a realtime subscription. Each `aa_*` key in `STORAGE_KEYS` maps to a table in `TABLES` (with its column list and cache tags). Adding a field to a domain type means adding the column to the migration **and** to `TABLES[...].columns`, or it is silently not persisted. Missing fields are sent as `null`, so a new `NOT NULL` column also needs a value in `TABLES[...].defaults` (and ideally in the code that creates the rows). Otherwise every new row of that table fails, as happened with `sesiones.extraordinaria`.
- `read(key)` returns a deep clone from memory. `write(key, rows)` diffs against memory by `id` and upserts only changed rows through a serial queue (order matters for FKs); it **never deletes** — use `remove(key, ids)`. `update(key, id, patch)` sends a plain `UPDATE` of only the given columns; use it for `insertOnly` tables and for tables with column-level UPDATE grants, where an upsert would be ignored or rejected. On a Supabase error the queue shows a toast (`components/SyncStatus.tsx`) and re-hydrates, discarding optimistic changes. Multi-step operations are not transactional.
- New ids use `nuevoId()` (timestamp + random suffix) because several devices write concurrently.
- **`anecdotario`** (per-student notes: COMENTARIO / INDISCIPLINA / LOGRO) is written from `AnecdotarioModal` (Toma de Asistencia, Estudiantes), which is only a create form with no history. The history is consulted only in Reportes → Anecdotario (`AnecdotarioHistoryTab`). It is the only table with author-restricted reads: a PROFESOR only reads rows where `autor_id = auth.uid()`, ADMIN reads all. Inserts must be signed with the caller's own id, and only ADMIN updates or deletes. Since `0009_anecdotario_edicion_admin.sql`, ADMIN can correct a note's `tipo` and `descripcion` (column-level UPDATE grants; author, student, workshop and date cannot change), which stamps `editado_en` / `editado_por_nombre`. Because `authenticated` only holds UPDATE on those four columns, a new editable column needs its own `grant update (...)`. It is marked `insertOnly` in `TABLES`, so inserts use `ON CONFLICT DO NOTHING`, and edits go through `storageService.editarAnotacion` → `syncStore.update()` (a plain `UPDATE … WHERE id`, which throws when RLS matches 0 rows) instead of an upsert (see `supabase/migrations/0003_anecdotario.sql`). These policies were verified with a rolled-back 10-case RLS test (impersonation, edit, delete and cross-author reads), and again after `0009` with another 10-case test (ADMIN edits any note but cannot change author, student or date; PROFESOR updates 0 rows, even on its own notes; anon is denied; `ON CONFLICT DO NOTHING` inserts still work). Re-run it with the technique above if the policies change.
- Reads go through `cacheService` (`cache.service.ts`), an in-memory TTL cache with tag-based invalidation. **Every mutation must call `cacheService.invalidateByTag(...)` for each affected tag** (`grupos`, `sesiones`, `estudiantes`, `inscripciones`, `asistencias`, `alertas`, `logs`, `tutores`, `perfiles`, ...) or views will show stale data for up to 60s. Derived data (e.g. student absence alerts via `calcularAlertasEstudiantes`) is cached under `alertas`, so attendance/config changes must invalidate it too.
- `write()` calls `notifyDataChange()`; views subscribe with `subscribeToData()` in a `useEffect` and re-read from `storageService` on change. There is no global state library.
- **Dates and time zones (the app runs in UTC-6)**: never write `new Date('YYYY-MM-DD')` followed by `getDay()`/`getDate()`. That string is parsed as UTC midnight, which is the previous day locally, and it shifted every session by one day. For calendar arithmetic on `YYYY-MM-DD` strings, either stay in UTC (`Date.UTC`, `getUTCDay`, `setUTCDate`) or parse the parts into a local date (`new Date(y, m - 1, d)`). For "today", use `fechaLocalISO()` (`src/utils/fechas.ts`), never `toISOString().split('T')[0]`.
- **Future sessions are locked**: `upsertAsistencia`, `marcarTodosPresentes` and `cerrarSesion` throw if the session date is after today (local date; see `esSesionFutura`). `RollCallView` also disables marking and closing for those sessions. Taking attendance earlier on the same day is allowed.
- **The cuts define the calendar of every workshop** (Configuración → Cortes; see Cortes bimestrales). `generarFechasSesiones` takes, for each cut, the dates from `max(corte.fecha_inicio, local creation date of the group)` to `corte.fecha_fin` that fall on the group's weekdays and are not non-teaching days, with deterministic ids `ses-<grupoId>-<YYYY-MM-DD>`. A workshop created in the middle of a cut has classes only from its creation date. The workshop form has no date fields. `grupos.fecha_inicio_ciclo` / `fecha_fin_ciclo` (NOT NULL) are **derived** by `rangoCalendario()` (creation date or first cut start, until the last cut end) and rewritten by `reaplicarCalendarioATodos()`; never edit or rely on them for logic. `crearGrupoConSesiones` / `actualizarGrupo` call `asegurarCalendarioDeTaller`, which throws if there are no cuts or the weekdays give zero sessions. `actualizarGrupo` runs `reconciliarSesiones` on **every** save, not only when dates or weekdays change. That also repairs a partial save, such as a group stored with its new calendar but without its sessions. It adds missing sessions and removes extra ones, except closed sessions or sessions that already have attendance, which are kept. Time and name changes only touch sessions that are not closed. `actualizarGrupo` returns `{ grupo, sesionesAgregadas, sesionesEliminadas, sesionesConservadas }`.

**Deleting a workshop** (ADMIN, "Eliminar" button on each Talleres card): `eliminarGrupo(grupoId)` removes, child to parent, the group's `asistencias`, `sesiones`, `inscripciones` and finally the `grupos` row (the DB would cascade anyway; removing explicitly keeps memory consistent). Enrolled students are only unenrolled, so they show as *Disponible* again and their `estado` does not change. `anecdotario` and `matriculas` rows are kept (no FK). The confirmation modal uses `resumenEliminacionGrupo()` (students, sessions, closed sessions, attendance records, pending enrollments) and requires typing the workshop name when attendance would be lost.

**Deleting a student** (ADMIN, red trash button on each Estudiantes row, `EliminarEstudianteModal`). It is permanent, unlike Baja (`darDeBajaEstudiante`), which keeps the record and can be reversed.
- `eliminarEstudiante(id)` checks `perfilActual` (ADMIN). The database enforces it too: since `0016`, the `escritura_delete` policy of `estudiantes` is ADMIN only, while CAJERO and MATRICULA keep INSERT and UPDATE.
- It first logs a `BAJA_TALLER` ("Alumno eliminado") per enrollment, so the cut report closes those periods (the log keeps the denormalized name).
- Then it removes, child to parent: the student's `asistencias`, `anecdotario`, `evento_participantes`, `inscripciones`, **all** their `matriculas` (matched by `estudiante_id`, `estudiante_id_creado` or `codigo_alumno`; paid ones too, so they leave Recibos and Corte bimestral → Matrículas cobradas), the `estudiantes` row, and the tutor if no other student uses it. The FKs would cascade anyway; removing explicitly keeps memory consistent.
- `movimientos_inscripcion` (insert-only) and `log_notificaciones` (audit, no FK) are kept.
- The modal shows `resumenEliminacionEstudiante(id)` (workshops, attendance, notes, requests and how many are paid, event participations, whether the tutor is shared) and requires typing the student code when attendance, notes or paid requests would be lost.
- `0016` was verified with a rolled-back RLS test: PROFESOR, CAJERO and MATRICULA delete 0 rows, ADMIN deletes 1 (its enrollment cascades), and CAJERO still inserts and updates students.

The Talleres forms show `VistaPreviaSesiones` (props `diasSemana`, `creadoEn?`: first and last class within the cuts and the session count, or a warning when there are no cuts), computed with `previsualizarSesiones({ dias_semana, creado_en? })`. Saving is blocked if there are no cuts or zero sessions. Creating, editing or deleting a cut (and "Crear 6 bimestres") runs `reaplicarCalendarioATodos()`, and Configuración → Cortes has an "Aplicar cortes a los talleres" button that runs it on demand; the success messages use `resumenCambios()` from `src/utils/calendario.ts`, shared with Días no lectivos. On 2026-11-18 there were only 2027 cuts, so the Nov–Dec 2026 sessions (none had attendance) were removed when the cuts were applied.

**Extraordinary sessions** (`sesiones.extraordinaria = true`) are make-up or extra classes outside a workshop's weekdays, created with `agregarSesionExtraordinaria()` through the shared `SesionExtraordinariaModal` (`src/modules/attendance/`). It opens from the **"Sesión extra"** button in `renderAcciones` on every Talleres card and list row (ADMIN only), and from Toma de Asistencia (ADMIN or the group's own PROFESOR). They take any date (one session per group per date, same deterministic id) and are **never removed by `reconciliarSesiones`**. The modal shows non-blocking notices (the date is already a regular class day per `esDiaDeClaseRegular`, a non-teaching day, outside every cut per `estaEnAlgunCorte`, or in the past) and lists the workshop's extraordinary sessions. With `puedeQuitar` (ADMIN), each can be removed via `eliminarSesionExtraordinaria()`, which refuses closed sessions and sessions with attendance. The UI shows them with a violet "Extra" badge, and Talleres cards show an "N extra" chip.
- Business rules live here, not in components: schedule conflict detection (`sonTalleresEnConflicto`), enrollment, attendance marking, `cerrarSesion` (closes a session and emails guardians of absent students), rectifications, alerts.

**Auth** (`src/services/auth.service.ts`): Supabase Auth email/password. Login also accepts a username, resolved to the Auth email by the `email_por_usuario` RPC. The `perfiles` row (id = Auth UID) holds the role; users without a profile or with `activo = false` are signed out. `AuthState.status` (`loading` → `signed_out` | `hydrating` → `ready` | `error`) drives which screen `App` renders. Creating, editing (email/password) and deleting users is async and goes through the Edge Function (`storageService.crearUsuario/actualizarPerfil/eliminarPerfil`). **Teachers are managed only in Configuración → Usuarios** with the Docente role (create, edit, deactivate). There is no separate Docentes module: its tab (`maestros`) and `TeachersView` were removed because everything they did is covered by Configuración and Talleres. The create and edit forms show "Especialidad artística" for the Docente role. `SettingsView` still accepts the optional props `crearUsuarioConRol` / `onCrearUsuarioAtendido` (open the create form pre-filled with a role), but nothing passes them now.

Legacy teacher records without a login (ids like `prof-…`) no longer exist in the database; there were 0 when the Docentes module was removed. The service code is still there but has no UI: `storageService.tieneCuentaDeAcceso()`, `darAccesoDocente()` and the Edge Function action `grant_access`, which creates the Auth user, inserts a new profile with the UID, moves `grupos.profesor_id`, `asistencias.registrado_por` and `anecdotario.autor_id` to the new id, and deletes the old profile.

Workshops are assigned to teachers from the Talleres form (`asignarTallerADocente` also exists in the service, where `''` means unassigned). `crearGrupoConSesiones`/`actualizarGrupo` call `verificarChoqueDocente`, which blocks a teacher from having two workshops with overlapping days and hours (all workshops share the cut calendar, so `sonTalleresEnConflicto` no longer compares dates). The email is optional when creating users: if left empty, an internal address `<username>@usuarios.cultura-cca.local` is generated (`src/utils/correoInterno.ts`, which also defines `USERNAME_REGEX`: lowercase, digits, `._-`, 3-30 chars, no `@`). The UI shows "Sin correo" for those users. The workshop teacher selector lists **only `rol === 'PROFESOR'`** profiles. Roles, usernames and passwords are managed only in Configuración → Usuarios. Firebase (config in `firebase-applet-config.json`) is used only to get a Google OAuth token for Gmail/Calendar; it does not change the active profile.

**Enrollment email (`correo-matricula` Edge Function)** is the only real email channel. When a request is registered (end of `NewEnrollmentWizardModal`, once per request when two workshops were chosen, and a renewal in Estudiantes when a tutor email was typed), `storageService.enviarCorreoMatricula(solicitudId)` runs `syncStore.flush()` and invokes the function with **only `solicitud_id`**.
- The function (Deno, `verify_jwt: false`, same CORS and session check as `admin-usuarios`; roles ADMIN, MATRICULA, CAJERO) loads the request, its group, the teacher and `configuracion` with the service role, so the recipient and content always come from the DB and it cannot be used as a mail relay.
- It builds the HTML summary and the signed contract as a PDF (`pdf-lib`, Helvetica/WinAnsi; the `firma_digital_url` PNG is embedded) and sends it over Gmail SMTP `smtp.gmail.com:465` (`denomailer`; Supabase blocks 25/587) from an institutional account.
- Secrets: `GMAIL_USER`, `GMAIL_APP_PASSWORD` (a Google app password; the account needs 2-step verification) and optional `MAIL_FROM_NAME`. Gmail limits: about 500 messages a day (2,000 on Workspace).
- It writes `matriculas.correo_enviado_en` / `correo_error` (migration `0013`) and refuses a resend within 2 minutes. A failure never undoes the request: the wizard shows it with "Reintentar", and Matrículas has an envelope button per row (grey not sent, green sent, red error) to send or resend.
- Redeploy with MCP `deploy_edge_function` (name `correo-matricula`, `verify_jwt: false`, passing the full `index.ts`).
- **Status (2026-11-18):** migration `0013` applied and the function deployed (version 1). The `GMAIL_USER` / `GMAIL_APP_PASSWORD` secrets are **not set yet**, so every attempt fails with "Falta configurar la cuenta de envío" (recorded in `correo_error`; the request is still saved). Never put the app password in the repo or the frontend. Once the secrets exist, test a request with your own address as the tutor and check the PDF (text, signature, accents).
- **Planned:** the same institutional account will also send the absence notifications. Today they still go through `notification.service.ts` with the user's Google token, or a simulated send. Move them to a server-side function with the same pattern (recipient taken from the DB, one row in `log_notificaciones` per attempt).

**Integrations** use that Google access token directly from the browser:
- `notification.service.ts`: sends absence emails via the Gmail REST API with an idempotency key and exponential-backoff retry; with no token it simulates an "SMTP institucional" send. Each attempt yields a `LogNotificacion`.
- `calendar.service.ts`: creates Google Calendar events.
- `export.service.ts`: Excel export via `xlsx`.
  - `exportGroupToExcel(grupoId)` exports a single workshop's matrix (from Toma de Asistencia, or from Reportes → Matriz with one workshop selected). Its Matriz Asistencia and Alertas sheets include the student's **Grado** and **Aula** (`aula_regular`; "Sin grado" / "Sin aula" when empty) right after the name, rows sorted by apellido and nombre, with `!autofilter` and `!cols` via the module-level `hojaTabla()` helper shared with the consolidated export. In the Resumen sheet, the workshop's room is labelled "Salón del taller".
  - `exportConsolidatedExcel('TODOS', gruposPermitidos)` builds a workbook with **4 fixed sheets, never one tab per workshop**:
    - Resumen Institucional;
    - Resumen por Taller (one row per workshop with totals and alerts);
    - Matriz Consolidada (one row per student and workshop, with absence and justified dates and the alert level; it replaced the old "Alertas" sheet);
    - Detalle por Sesión (long format, one row per student and closed session, with status and justification reason).
  - Every table sheet has an `!autofilter` and `!cols` widths, so users filter by Taller or Fecha in Excel.
  - `ReportsView` passes the role's visible workshop ids, so a PROFESOR exports only their own.
  - The consolidated export follows the screen rules: only closed sessions count, and attendances are indexed in a `Map` (`sesion_id|estudiante_id`).

**Institution-wide settings come from `configuracion`, never hard-coded**: use `nombreInstitucion()` and `cicloActual()` from `src/utils/institucion.ts` (emails, Excel exports, Calendar events, receipts, certificates, sidebar). The enrollment contract is a template stored in `configuracion.plantilla_contrato` (null = built-in default), edited in Configuración → Contrato (`modules/settings/ContractTemplateTab.tsx`). `src/utils/contractTemplate.ts` renders `{{variables}}`, where an UPPERCASE variable name means an uppercased value, and `VARIABLES_CONTRATO` lists the valid keys. Callers use `generateInstitutionalContractText(data)`.

**Arancel (workshop fee)** is never hard-coded. Use `src/utils/arancel.ts`:
- `arancelDeGrupo(grupo)`: the group's own `grupos.costo` if set, otherwise `configuracion.arancel_taller`.
- `periodoArancel()` / `etiquetaPeriodo()`: `MENSUAL` → "/ mes", `CICLO` → "por ciclo".
- `formatearMonto()` → "C$ 1,200".
- `montoDeSolicitud(sol)`: the amount stored on the enrollment, falling back to the current fee.

The general fee and period are set in Configuración → Reglas y Parámetros; the per-workshop fee in Talleres. Enrollments and renewals store `monto_arancel` at creation time, so later fee changes do not alter them. The contract template exposes `{{arancel}}` and `{{periodo_arancel}}`.

**Salones** (table `salones`, ADMIN writes, managed in Configuración → Salones / `SalonesTab.tsx`): `grupos.aula` stores the room **name**, not an id. `actualizarSalon` propagates a rename to the groups that use it, and `eliminarSalon` refuses while a room is in use (deactivate it instead). Workshops pick rooms through `SalonSelect` (active rooms only, falling back to free text if the catalogue is empty). `crearGrupoConSesiones`/`actualizarGrupo` call `verificarChoqueSalon`, which blocks two workshops in the same catalogued room with overlapping days and hours (it reuses `sonTalleresEnConflicto`). Non-catalogued values such as "Taller Principal" are not checked.

**Días no lectivos** (table `dias_no_lectivos`: `fecha_inicio`, `fecha_fin`, `motivo`, `tipo` FERIADO / VACACIONES / OTRO; ADMIN writes; managed in Configuración → Días no lectivos / `DiasNoLectivosTab.tsx`) are holidays, vacations and other days without class. Each row is a date range; a single day has `fecha_inicio = fecha_fin`.
- `generarFechasSesiones` skips every date covered by a range, so `previsualizarSesiones` / `VistaPreviaSesiones` and `reconciliarSesiones` follow it automatically. Use `storageService.diaNoLectivoDe(fecha)` / `esDiaNoLectivo(fecha)` to check a `YYYY-MM-DD` date.
- `crearDiaNoLectivo`, `actualizarDiaNoLectivo` and `eliminarDiaNoLectivo` call `reaplicarCalendarioATodos()`, which runs `reconciliarSesiones` for every group and returns the totals. Sessions on those dates are removed, except closed ones, ones with attendance and extraordinary ones; deleting a range brings its sessions back. A class on a non-teaching day is created as an extraordinary session.
- `cargarFeriadosNicaragua(anio)` (button "Cargar feriados de Nicaragua") adds the year's holidays that are not covered yet, with ids `dnl-YYYY-MM-DD`: 1 ene, Jueves and Viernes Santo (computed from Easter), 1 may, 30 may, 19 jul, 1 and 10 ago (Santo Domingo, Managua), 14 and 15 sep, 7 dic (Gritería), 8 dic and 25 dic. The migration seeded the rest of 2026 and all of 2027 and removed the sessions already generated on those dates; load each new year from the button. The load selector covers the previous year up to five years ahead and shows how many of each year's holidays are already registered; the list filters by Próximos, Todos or a year (a select with the catalogue's years plus that range).
- Toma de Asistencia tags a kept session on a non-teaching day with a "No lectivo" badge.

**Cortes bimestrales (payments context)**: the enrollment fee is paid once a year and equals one monthly fee (it covers the student's first month); families then pay the same amount every month per workshop, and every two months there is a cut, with no new enrollment. **Monthly payments are never recorded**; only the enrollment payment is (`matriculas`, Caja).
- Table `cortes_bimestrales` (`nombre`, `fecha_inicio`, `fecha_fin`; ADMIN writes) is managed in Configuración → Cortes (`CortesBimestralesTab.tsx`): cuts cannot overlap, and "Crear 6 bimestres" creates Ene–Feb … Nov–Dic of a year (`proponerBimestresDelAnio` / `crearBimestresDelAnio`), skipping overlaps. **The cuts are also the class calendar of every workshop**: `crearCorte`, `actualizarCorte`, `eliminarCorte` and `crearBimestresDelAnio` (once, at the end) run `reaplicarCalendarioATodos()` and return its totals; the private `insertarCorte` inserts without recalculating. Deleting a cut removes its sessions except closed, attended or extraordinary ones.
- Table `movimientos_inscripcion` is an insert-only log (`insertOnly`; INSERT for ADMIN, CAJERO and MATRICULA; no UPDATE or DELETE; no FKs, with denormalized names) of `ALTA_TALLER`, `BAJA_TALLER`, `BAJA_ALUMNO` and `REACTIVACION_ALUMNO`. The private `registrarMovimiento()` writes it from `inscribirEstudianteEnGrupo`, `agregarEstudiante` (with a group), `desinscribirEstudianteDeGrupo`, `eliminarGrupo` (reason "Taller eliminado"), `eliminarEstudiante` (reason "Alumno eliminado"), `darDeBajaEstudiante`, `reactivarEstudiante` and the enrollment acceptance that reactivates a student. It is skipped for other roles (RLS would reject it). `registrado_por` comes from `storageService.setPerfilActual()`, set by `auth.service`. The migration backfilled one ALTA per existing enrollment and one BAJA per student already on BAJA; unenrollments before 2026-11-18 are lost, because `inscripciones` rows are deleted.
- `calcularCorteBimestral(corteId, gruposPermitidos?)` (cached under `cortes`, `movimientos`, `inscripciones`, `estudiantes`, `matriculas`, ...) builds intervals per student and workshop from the log (fallback `fecha_inscripcion`; a BAJA closes it, exclusive) minus student-level BAJA → REACTIVACION gaps. The months are the calendar months the cut touches. A month is **billable** if the student was active at least one day in it (whole monthly fee). A paid enrollment (`solvente`, local month of `fechaPagoLocal()` in `src/utils/fechas.ts`, shared with Recibos) covers the first active month from its payment month onward, which is marked `MATRICULA` and not billed. The monthly fee is the group's `costo` or `configuracion.arancel_taller` (`mensualidadDe`, same rule as `arancelDeGrupo`, which is not imported to avoid a circular import). Attendance uses `calcularAlertasEstudiantes(undefined, { desde, hasta })`.

**Per-cut counters (absences and indiscipline reset at every cut).**

- **Current cut:** `storageService.corteVigente(fecha = hoy)` returns the cut that contains the date. When the date falls between cuts (vacations), it returns the last cut that has already started. It returns `null` when there are no cuts or the date is before the first one. `rangoCorteVigente()` gives that cut's `{ desde, hasta }`.
- **`calcularAlertasEstudiantes(grupoId?, rango?)`:**
  - With **no `rango`**, it uses the current cut. When there is none, it uses the whole cycle, so attendance taken before the first cut is not hidden.
  - Pass `{}` explicitly for the whole cycle, or `{ desde?, hasta? }` for any range.
  - Every caller with no range follows the current cut: Panel alerts, Toma de Asistencia "En Riesgo" and its badges, Estudiantes "Con Alertas", the exports and the printable data.
  - The cache key always includes the resolved range, and the cache is tagged `alertas`, `asistencias`, `anecdotario` and `cortes`.
- **`AlertaEstudiante.total_indisciplina`** counts the visible `INDISCIPLINA` notes for that student and workshop whose local `creado_en` date falls in the range. A PROFESOR only downloads their own notes, so they only see their own. The count is informational: there is no indiscipline threshold, and the alert levels use only absences (`limite_ausencias_alerta`, `porcentaje_inasistencia_alerta`, and the fixed 2 absences / 15 % warning).
- **Exports:** `exportGroupToExcel(grupoId, periodo?)` and `exportConsolidatedExcel(grupoId, permitidos, periodo?)` take a `PeriodoInforme` `{ desde?, hasta?, etiqueta? }`; without it they use the current cut (`resolverPeriodo`). They filter the sessions to that range, add an Indisciplina column, and write the period in the Resumen sheet.
- Reportes → **Corte bimestral** (`CorteBimestralTab.tsx`, ADMIN and CAJERO) has a cut selector (default: the cut containing today), KPIs, an expandable per-workshop table with per-student month chips (✓ / M / —), Altas y bajas and Matrículas cobradas, and `exportService.exportCorteBimestral()` (sheets Resumen, Cobro por Taller, Detalle por Alumno, Altas y Bajas, Matrículas).

**Solvency gate (only students paid in Caja join workshops)**: `storageService.estadoSolvencia(est)` returns `{ solvente, motivo }`.
- Not solvent: `estado = 'PENDIENTE_RENOVACION'` ("Renovación pendiente de pago en Caja"), or `estado_pago_anual = 'PENDIENTE'` / `solvente = false` ("Pendiente de pago en Caja").
- Solvent: `AL_DIA` and `EXENTO` (scholarship).

How it is enforced:
- `inscribirEstudianteEnGrupo` (and `agregarEstudiante` with a group) refuse non-solvent students, so a new matrícula only enters a workshop when Caja runs `procesarPagoYFormalizarMatricula` / `aceptarMatriculaFinal`. Both mark the student ACTIVO, AL_DIA and solvent before enrolling.
- In Talleres → Alumnos (`EnrollStudentsModal`), non-solvent students who are not enrolled are disabled ("Sin pago", excluded from "Marcar disponibles"). Already-enrolled ones can be unchecked but not re-checked.
- Students with a pending renewal keep their current workshops, and Toma de Asistencia shows an amber "Pago pendiente" badge on them.
- In Estudiantes → Editar, only ADMIN and CAJERO can change "Estado Pago Anual". For other roles, the select is disabled, a pending renewal's `estado` is kept, and the current payment values are preserved on save.
- This is enforced in the UI and service only: RLS still lets MATRICULA write `estudiantes`.

**Several workshops per student, no schedule clash**: a student may be in any number of workshops as long as they do not overlap in weekdays and hours (`sonTalleresEnConflicto`).

`verificarConflictoHorario(estudianteId | null, grupo, { codigoAlumno?, excluirGrupoIds? })` compares the target workshop with the student's **commitments**:
- the workshops they are enrolled in;
- the workshops of their requests in `PENDIENTE_CAJA` / `SOLVENTE`, matched by `codigo_alumno`. Pass `codigoAlumno` for a student who does not exist yet.

It skips the target and `excluirGrupoIds`. It returns `enCaja: true` when the clash is with a pending request.

Callers:
- `inscribirEstudianteEnGrupo`, Talleres → Alumnos (shows "Ocupado" with the reason) and the enrollment wizard. The wizard's cards also block a workshop the student is already enrolled in or already has a pending request for. The wizard accepts up to 2 workshops in one process, blocks a second one that clashes with the first (`sonTalleresEnConflicto`), and creates one request per workshop.
- `crearSolicitudMatricula` rejects clashes for new and existing students, plus **duplicates** (already enrolled, or already pending in Caja, in the same workshop).

**Cambiar de taller** (ADMIN only; the `ArrowRightLeft` button in Estudiantes, shown when the student has at least one workshop):
- `CambiarTallerModal` lists `opcionesCambioDeTaller(estudianteId, origenId)`: every other workshop with its `CupoBadge`, and when unavailable, the reason (already enrolled, full, or a clash that ignores the source workshop).
- `cambiarDeTaller(estudianteId, origenId, destinoId)` checks the `perfilActual` role, solvency, the destination's capacity and the clash, then:
  - removes the source enrollment and inserts the destination one;
  - logs `BAJA_TALLER` ("Cambio a …") and `ALTA_TALLER` ("Cambio desde …") in `movimientos_inscripcion`, so the cut report counts it.
- The source workshop's attendance and notes are kept.

**Workshop capacity (cupo)**:
- `grupos.cupo_maximo` (migration `0014`; integer > 0, nullable) is **required** in the Talleres create and edit forms. Choosing a catalogued room with `capacidad` pre-fills it when it is empty.
- `crearGrupoConSesiones` validates the capacity. `actualizarGrupo` validates it only when `cupo_maximo` is in the patch, so `asignarTallerADocente` keeps working for legacy workshops. Editing refuses a capacity lower than the students already enrolled.
- Workshops created before `0014` have `null` and show a neutral "Sin cupo" chip, with no limit, until they are edited.

**Occupancy** (`storageService.ocupacionTaller(grupoId, { excluirEstudianteId?, seleccion? })` → `OcupacionTaller`):
- Occupied = enrolled students who are not on BAJA + requests in `PENDIENTE_CAJA` / `SOLVENTE` of students who are not enrolled yet. Pending requests **reserve a spot**. Requests are matched to students by `codigo_alumno` = `estudiantes.matricula`.
- `excluirEstudianteId` leaves out that student's own enrollment and request, so their reservation never blocks them.
- `seleccion` replaces the current enrollments; Talleres → Alumnos uses it for a live preview.
- Levels: `SIN_CUPO`, `LLENO` (occupied ≥ cupo), `ALERTA` (% ≥ threshold), `DISPONIBLE`.

**Where it is enforced**:
- `crearSolicitudMatricula` throws when the workshop is full.
- `inscribirEstudianteEnGrupo` refuses when occupancy, excluding that student, is already ≥ cupo. Caja's formalization therefore always fits a request that reserved its spot, and Talleres → Alumnos cannot go over the capacity.
- Renewals keep the student's workshop and do not change occupancy.

**Color levels** (Configuración → **Cupos**, `CuposTab.tsx`, ADMIN):
- They live in `configuracion.alertas_cupo` (jsonb: `umbral` % plus `color`/`texto` for `disponible`, `alerta`, `lleno`).
- Read them with `storageService.alertasCupo()`, which fills in missing or invalid values from `ALERTAS_CUPO_PREDETERMINADAS`.
- The tab edits the threshold, the colors and the labels, shows a live preview, and lists every workshop's occupancy.

**Shared UI** (`src/components/CupoIndicador.tsx`):
- `CupoBadge` ("12/15 · Por llenarse"; `compacto` shows only "12/15") and `BarraCupo` (bar plus libres and en Caja).
- Colors come from inline `style`: the text uses the color, and the background and border use the same color with hex alpha `1A` / `55`.
- Shown in:
  - Talleres cards and list (via `datosTaller().ocupacion`);
  - the enrollment wizard: full workshops are disabled, ALERTA says "Quedan N lugares", and step 3 shows one bar per chosen workshop;
  - Talleres → Alumnos: a header bar counting the selection; "Cupo completo" blocks checking more, and "Marcar disponibles" stops at the free spots;
  - Caja, on pending requests.

**Eventos** (nav tab `eventos`, `src/modules/events/`; ADMIN and PROFESOR): participant lists for school activities such as Día del Libro, Fiestas Patrias or Día de las Madres, which the principals request.
- **Tables** (migration `0015`):
  - `eventos` (`nombre`, `fecha`, `lugar`, `descripcion`, `estado` ABIERTO/CERRADO, `creado_por`);
  - `evento_talleres` (`evento_id`, `grupo_id`, unique);
  - `evento_participantes` (`evento_id`, `grupo_id`, `estudiante_id`, `registrado_por`, unique per event, workshop and student; a student in two workshops can appear once per workshop).
  - All FKs use `on delete cascade`.
  - The two child tables are `insertOnly` (rows are added and removed, never updated).
- **RLS:**
  - Any active profile reads.
  - `eventos` and `evento_talleres`: only ADMIN writes.
  - `evento_participantes`: ADMIN always inserts and deletes. A PROFESOR only does so when the workshop is theirs (`grupos.profesor_id = auth.uid()`), the workshop is assigned to the event (insert), and the event is `ABIERTO`.
  - This is the first **ownership-based** write policy outside `anecdotario`.
  - Verified with a rolled-back 17-case RLS test:
    - ADMIN creates, edits, closes and deletes (with cascade).
    - PROFESOR: adding to their own assigned, open workshop works. Adding to another teacher's workshop, to an unassigned workshop or to a closed event is denied, as are creating events and assigning workshops. Closing an event and deleting someone else's participant affect 0 rows; deleting their own participant works.
    - CAJERO is denied and deletes 0 rows.
    - anon reads 0 rows.
- **Service:**
  - `crearEvento` / `actualizarEvento` (ADMIN, with the list of workshops; removing a workshop also removes its participants, and `participantesAfectados` warns first);
  - `cambiarEstadoEvento` (close or reopen);
  - `eliminarEvento`;
  - `puedeElegirParticipantes`;
  - `guardarParticipantes(eventoId, grupoId, ids)`: a diff that accepts only active students enrolled in that workshop.
  - `filasEvento(eventoId, gruposPermitidos?)` sorts by grade (catalogue order, with the `GRADOS_ESCOLARES` fallback), then section (`aula_regular`), surname and first name. It computes the grade order itself rather than using `utils/grados.ts`, which imports `storageService` (circular import).
- **UI:**
  - `EventosView` lists event cards (Próximos / Pasados / Todos, search). A PROFESOR only sees events where one of their workshops takes part.
  - The detail has one `ParticipantesTaller` per assigned workshop (a teacher only sees their own), with checkboxes, Marcar todos and Guardar. It is read-only when closed, except for ADMIN.
  - Next to it is the consolidated list, grouped by grade with subtotals.
  - `EventoFormModal` (ADMIN) edits the details and the workshop checkboxes.
- **Excel:** `exportService.exportEvento(eventoId, gruposPermitidos?)` writes the sheets "Participantes" (event header, then N°, Grado, Sección, Apellidos, Nombres, Matrícula, Taller, Docente, with an autofilter) and "Resumen" (by workshop, and by grade and section). A teacher exports only their own workshops.

**Grados** (table `grados` with `nombre`, `orden`, `activo`; ADMIN writes; managed in Configuración → Grados / `GradosTab.tsx`) are never hard-coded. `estudiantes.grado` and `matriculas.grado` store the grade **name**, not an id.
- To list grades, use `gradosDisponibles(actual?)` from `src/utils/grados.ts`: active grades in `orden`. Pass the current value when editing so an inactive or legacy grade is not lost. Use `indiceGrado()` to sort by grade.
- `GRADOS_ESCOLARES` (1er–11mo) is only the fallback used when the catalogue is empty.
- `actualizarGrado` propagates a rename to students and enrollments.
- `moverGrado` renumbers `orden`.
- `eliminarGrado` refuses while a grade is in use (deactivate it instead).
- The table was seeded with the 11 former grades (`grd-01`…`grd-11`).
- Its policies passed a rolled-back 12-case RLS test. ADMIN can insert, update and delete, and duplicate names are rejected case-insensitively. PROFESOR and CAJERO can read but get "denied" on insert and update or delete 0 rows. anon reads 0 rows.

**Notable views**:
- **Panel** (`modules/dashboard/`): `AttendanceStatusPanel` derives a per-session status (Cerrada / Tomada / Parcial / Pendiente / Programada / Sin alumnos), using **local** dates (not UTC) and counting only active enrolled students. Every "Pasar lista" action calls `onSelectWorkshop(grupoId, sesionId)`, which opens `RollCallView` on that exact session via `initialSesionId`. The panel computes the status and the filters (docente, estado, búsqueda), then renders one of three views. They are built for 20+ workshops, and the chosen view is remembered in `localStorage` under `cca_panel_vista_asistencia`. The KPI cards always reflect the visible range.
  - **Talleres** (`AttendanceWorkshopList`, internal id `'lista'`) uses the period selector (Hoy / Ayer / Semana / Mes / Ciclo / Rango) and shows one row per workshop, not per session. Each row has a compliance bar, ✓ ◐ ✕ ○ counters and a button for the oldest pending or partial session (or "Cerrar sesión" for a taken but unclosed one). Rows are sorted most-overdue first and expand to show their sessions. When the period has no sessions, it shows only a short notice that points to the Próximas clases card.
  - **Semana** (`AttendanceWeekGrid`) is a grid with workshops as rows and days as columns. It shows color chips per session and daily totals, and hides Saturday and Sunday when they have no sessions.
  - **Mes** (`AttendanceMonthCalendar`) is a month calendar with per-day status counters. Clicking a day lists its sessions with `FilaSesion`.
  - Semana and Mes navigate with ◀ ▶ and ignore the period selector.
  - **Próximas clases** (`UpcomingClassesCard`) is a separate card, not part of the status panel. It sits in the Panel's right column above Monitoreo de Ausentismo and is always visible, independent of the status filters. It lists sessions that are not closed and have not started yet (later today or future dates) as a day-grouped agenda ("Hoy" / "Mañana" / date, start and end time, Extra badge, workshop, teacher, room). It has its own date filter: **Próximos 7 días** (default; the next 7 days, or at least the first day with classes, and "Ver más clases" extends it 7 days at a time), **Este mes** (today to month end), and **Rango** (Desde/Hasta, both optional, `min` = today, with "Limpiar fechas" and a warning when Hasta < Desde). Past or already-started classes are never listed, whatever the range.
  - **Indicadores** (`DashboardKpis`) are the 4 KPI cards at the top of the Panel. They have their own filters, independent of the rest of the Panel and remembered in `localStorage` under `cca_panel_kpi_filtros`:
    - Período: Hoy / Esta semana / Este mes / Todo el ciclo (default) / Rango.
    - Taller: all workshops or one.
  - The cards are computed from the sessions in the range and the selected workshop:
    - Tasa de Asistencia: records of those sessions.
    - Sesiones Concluidas: closed sessions out of those sessions.
    - Talleres & Comunidad: workshops with classes in the period, plus their distinct active enrolled students and tutors.
  - With no filters, Talleres & Comunidad keeps the global totals.
  - **Alertas de Inasistencia** respond only to the workshop filter. They count the **current cut** (`calcularAlertasEstudiantes(grupoId)` with no range), and the footer names that cut.
  - **Monitoreo de Ausentismo** (`AbsenteeismMonitorCard`, right column below Próximas clases) lists students with `tiene_alerta`, sorted by absences.
    - It has its own filters, independent of the KPI filters and remembered under `cca_panel_ausentismo_filtros`: a period and a workshop (all, or one).
    - The periods are Semana / Mes / **Bimestre** (the default: the current cut, or the whole cycle if none has started) / Ciclo (`{}`) / Rango. A saved `'ciclo'` from before the per-cut reset is read as `'bimestre'`.
    - It calls `calcularAlertasEstudiantes(grupoId | undefined, rango)`. Only closed sessions in those dates count, and the Configuración thresholds apply to that period.
  - Shared pieces live in `attendanceStatus.shared.tsx`. Those are `ESTADOS`, `FilaEstatus`, `FilaSesion`, `BadgeExtra`, and the UTC date helpers on `YYYY-MM-DD` strings (`sumarDias`, `lunesDe`, `inicioDeMes`, `finDeMes`, `sumarMeses`). Use them instead of `new Date('YYYY-MM-DD')`.
- **Talleres** (`WorkshopsView`) toggles between **Tarjetas** (the default grid) and **Lista** (a table from `md` up, compact rows on phones). The choice is remembered in `localStorage` under `cca_talleres_vista`. Both views share `datosTaller()` (including `ocupacion` for the `CupoBadge`), `renderAcciones(grupo, compacto)` (Editar / Eliminar / Alumnos / Sesión extra for ADMIN, plus Asistencia; icon-only in the list) and `BarraAvance`, so a new action or field goes in one place. The create and edit forms have no date fields (the cuts define the calendar). They require "Cupo máximo (alumnos)", which is pre-filled from the room's `capacidad`. A search bar (not persisted) filters both views after the role filter, case- and accent-insensitive, requiring every typed word to match the workshop name, teacher, room, hours or weekdays (short "Mié" or full "miércoles"); it shows "N de M talleres" and its own empty state with "Limpiar búsqueda".
- **Reportes** has four tabs (Corte bimestral is described under Cortes bimestrales):
  - **Matriz de Asistencia** (`MatrizAsistenciaTab.tsx`; `ReportsView` only holds the header and tabs): ADMIN and PROFESOR, organized **by two-month cut** (see "Per-cut counters").
    - Filters:
      - **Período**: one option per cut, with "(actual)" on `corteVigente()`, which is the default; "Todo el ciclo"; "Rango personalizado…" with Desde/Hasta and a warning when Hasta < Desde. The default is "Todo el ciclo" when no cut has started.
      - **Taller**.
      - The order selector, with "Más faltas".
      - **Vista**: Detalle | Por bimestres.
      - The Imprimible and Excel buttons live in this bar.
    - **Detalle**:
      - One row per student and workshop from `calcularAlertasEstudiantes(undefined, rango)`. Only rows with closed sessions or indiscipline notes in the period are shown.
      - 5 KPIs for the period: attendance rate, critical, warnings, regular, and with indiscipline.
      - Columns: Faltas (with "N justif."), % Inasistencia, **Indisciplina** (violet chip; the tooltip shows the dates of the notes), and Fechas de inasistencia.
      - The "Fechas de inasistencia" column shows red "A" and amber "J" chips (the reason is in the tooltip), up to 4 plus "+N más". Clicking the row expands every date. `incidenciasPorFila` only takes closed sessions in the range, so the count of "A" chips matches Faltas. Extra sessions are tagged "Extra".
    - **Por bimestres**:
      - One row per student and workshop, and one column per cut. The columns are the selected period's year, or every cut with "Todo el ciclo"; the current cut is highlighted.
      - Each cell shows faltas/sesiones, "+NJ", the indiscipline count, and a color for the level. "—" means no closed sessions and no notes.
    - The print view prints the active view with the period's name. Excel calls `exportConsolidatedExcel(grupo, permitidos, { desde, hasta, etiqueta })`.
    - Dates are parsed from `YYYY-MM-DD` as local dates.
  - **Historial de Recibos y Pagos Contables** (`ReceiptsHistoryTab`): ADMIN and CAJERO. CAJERO sees only this tab and Corte bimestral.
    - It filters by payment date: Todo (default), Hoy, Esta semana, Este mes, or Rango (Desde/Hasta, both optional).
    - The date is the local date of `fecha_pago`, falling back to `fecha_aceptacion`, the same rule as Caja. Records without either date appear only under "Todo".
    - Text search applies on top of the date filter.
    - The KPI cards (Recaudación, Recibos) reflect the chosen period, not the text search. Recaudación sums `Number(monto_arancel)` and is shown with `formatearMonto`.
  - **Anecdotario** (`AnecdotarioHistoryTab`): ADMIN and PROFESOR. A full-width, alphabetical list of all students (search by name or matrícula, workshop filter, "Solo con anotaciones", "Incluir bajas") with per-type counters, total and date of the last note. Clicking a student opens `AnecdotarioAlumnoModal` (`modules/reports/`) with that student's history grouped by month.
    - The modal filters by type (chips with counts), dates (Este mes / Últimos 3 meses / Todo / Rango, on the local date of `creado_en`) and text. Its filters reset each time it opens. The shared helpers (`PERIODOS`, `rangoDePeriodo`, `mesDe`, `nombreCompleto`, `nombreTallerDe`, `TIPOS_LISTA`) are exported from that file.
    - The tab exports the notes of the listed students, and the modal exports its filtered history, both via `exportService.exportAnecdotario`. ADMIN can edit (type and text, inline) and delete notes from the modal; the note then shows "Editado por … el …".
    - A PROFESOR sees only their own groups, students and notes. It reuses `TIPOS` and `formatearFechaHora` exported from `AnecdotarioModal`.
- **Caja y Solvencia** (`CashierView`):
  - It opens on **Por Cobrar** (`filterEstado = 'PENDIENTE_CAJA'`). The status buttons are ordered Por Cobrar → Formalizadas → Todas.
  - A date filter offers any date, a single day, or a range, with Hoy / Esta semana / Este mes shortcuts.
  - Pending requests are filtered by `fecha_solicitud`; collected or formalized ones by `fecha_pago` (falling back to `fecha_aceptacion`). The comparison uses local dates via `fechaLocalISO(new Date(iso))`.
  - Status-button counts come from `solicitudesBase` (search + date), so they match the list. The top metric cards stay global.
  - Pending requests show their workshop's `CupoBadge`, for information only. Their reservation is already counted, so "Procesar Pago y Formalizar" always fits.
  - Formalizing (`procesarPagoYFormalizarMatricula`) is the only way a new student enters a workshop. It marks the student ACTIVO, AL_DIA and solvent, then enrolls them.
- **Matrículas** (`MatriculasView`): the list of requests plus `NewEnrollmentWizardModal`.
  - Step 2 of the wizard lets the user pick **up to 2 workshops** (`MAX_TALLERES`) that do not overlap in weekdays and hours. Cards show their `CupoBadge`; it disables those that are full, that clash with the code's enrollments or pending requests, that clash with the other workshop already picked (`sonTalleresEnConflicto`), or where the student is already enrolled or pending. A summary shows "N de 2" and the total fee.
  - Step 3 shows one `BarraCupo` and one contract per workshop, with a single signature and acceptance.
  - Submitting creates **one request per workshop** (`crearSolicitudMatricula` in sequence, each with its own `contrato_texto` and `monto_arancel`, same signature); Caja charges and formalizes each separately. The second call sees the first as pending, so the service re-checks clash, duplicates and capacity. If the second fails, the first is kept and step 4 shows the error. `onEnrollmentCreated` receives the array.
  - Step 4 lists every request code and the total, and emails the tutor once per request (`enviarCorreoMatricula`, in sequence, each with its own "Reintentar").
  - Each row has an envelope button to send or resend that email.
- **Estudiantes** (`StudentsView`): row actions are Anecdotario (ADMIN), **Cambiar de taller** (ADMIN, `CambiarTallerModal`), Editar, Renovar, Baja/Reactivar, and **Eliminar** (ADMIN, `EliminarEstudianteModal`).
  - Eliminar is permanent (see **Deleting a student**); Baja is the reversible pause.
  - In Editar, "Estado Pago Anual" is editable only by ADMIN and CAJERO. Other roles keep the current payment values and any pending renewal.
  - The "Con Alertas" filter counts the current cut.
  - A renewal sends the email only when a tutor address was typed. The form fills in a placeholder address when it is left empty, and that placeholder never receives mail.
- **Toma de Asistencia** (`RollCallView`): the session picker labels each session with `estadoSesion` (Cerrada / Hoy / Pendiente / Programada) using local date and time. The default session is today's, else the latest past session that is not closed, else the next one, else the last. When the workshop has no class today, an info banner says so (naming the non-teaching day, if any). Past sessions are never locked; only future ones are. Each student row has an Anecdotario column.
  - The alert badges and the "En Riesgo" filter count the **current cut**.
  - An amber **"Pago pendiente"** badge marks enrolled students who are not solvent (`estadoSolvencia`), such as a pending renewal. Their attendance can still be taken.
  - ADMIN and the group's PROFESOR can add an extraordinary session.

  Below `sm`/`md` the view has its own mobile layout:
  - The header puts the workshop select (truncated) and an icon-only Excel button on one row.
  - The session stepper is full width, with 40 px or larger arrows.
  - The rail with every session node is replaced by the full date plus a thin cycle-progress bar.
  - Metrics are a single row of 4 counters (P / A / J / %). "Matriculados" is hidden there because the header already shows it.
  - Filter chips scroll horizontally.
  - Each student card shows initials, a truncated name and tutor, alert badges, the **Anecdotario button**, compact 40 px P / A / J buttons (`h-10`, reduced from 48 px at the user's request) and a compact Rectificar.
  - The "Cerrar lista" action lives in a **sticky bottom bar** (`md:hidden`, safe-area padded, only for open, non-future sessions) with live P / A / J counts. The header and footer close buttons are `hidden md:…` on mobile.
  - The anecdotario type buttons (Comentario / Indisciplina / Logro) follow the same pattern on mobile: a 3-column grid of `h-10` buttons with `text-[11px]`. This applies both in `AnecdotarioModal` (new note) and in the edit form of `AnecdotarioAlumnoModal`; from `sm` up they keep the original wrapping layout.
- **Configuración** tabs: Usuarios y Roles, Reglas y Parámetros (absence thresholds, institution name, cycle, fee), Salones, Grados, Días no lectivos, Cortes, Cupos, Contrato.

**Offline/PWA**: `vite-plugin-pwa` (auto-update) plus `hooks/useOnlineStatus`, `components/OfflineIndicator`, `hooks/usePWAInstall`. The service worker is **disabled in dev** (`devOptions.enabled: false`), because a dev service worker kept serving stale bundles after frequent changes. There is no offline write queue: saving requires a connection.

**Security headers.** Hosting is Cloudflare Pages, and its headers come from `public/_headers`, which Vite copies to `dist/`. That file is the single source of truth.
- The `/*` block sets:
  - a strict CSP (`default-src 'self'`, `script-src 'self' https://apis.google.com`, `object-src 'none'`, `frame-ancestors 'none'`, `upgrade-insecure-requests`);
  - HSTS, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy` and `Permissions-Policy`;
  - `Cross-Origin-Opener-Policy: same-origin-allow-popups`. It must not be `same-origin`, or Firebase's Google sign-in popup breaks.
- Other rules: `index.html`, `sw.js` and the manifest are `no-cache`, and `/assets/*` is immutable.
- The CSP allows, by origin:
  - Supabase: `https://` and `wss://` for the project ref;
  - Google Fonts;
  - `*.googleapis.com` for Gmail, Calendar and Firebase token APIs;
  - the Firebase auth iframe (`<project>.firebaseapp.com`) and `accounts.google.com`;
  - `*.googleusercontent.com` avatars and `data:`/`blob:` images.
- `style-src` needs `'unsafe-inline'` because of React `style={}`. Scripts must stay external: the build has no inline scripts and no `eval` or `new Function`. **Any new external service, or a change of Supabase or Firebase project, must be added to the CSP**, or the browser blocks it.
- `vite.config.ts` parses the `/*` block (`cabecerasDePreview`) into `preview.headers`, so `npm run build && npm run preview` reproduces the production CSP. It drops HSTS and `upgrade-insecure-requests` on http localhost.
- The dev server (`npm run dev`) sends no CSP, because HMR would break.
- The `admin-usuarios` Edge Function (version 3) builds its CORS headers per request through `corsPara()`, a wrapper around `manejar()`. `ALLOWED_ORIGINS` is set to `https://culturacca.pages.dev,http://localhost:3000,http://localhost:4173`; add any new domain there.
  - It allows the origins listed in the secret `ALLOWED_ORIGINS` (comma-separated), with `Vary: Origin`.
  - While that secret is unset it answers `*`, as before.
  - Once the Pages domain exists, set it with `create_edge_function_secret`, adding `http://localhost:3000` and `http://localhost:4173` for local testing.

**App icons** use the Colegio Centro América emblem (the shark and shield only, without the text, which is unreadable at icon sizes) on a white background. They live in `public/`:
- `pwa-192x192.png` and `pwa-512x512.png`;
- `pwa-maskable-512x512.png`, with extra padding for Android's circular crop;
- `apple-touch-icon.png` (180 px);
- `favicon-32x32.png` and `favicon-64x64.png`, linked from `index.html` and listed in `includeAssets`.

Two more files come from the same source:
- `logo-emblema-96.png` (96 px), the 36 px badge in the sidebar and the login top bar;
- `logo-cca.png` (720×354), the full horizontal logo with the name, shown in the login card.

All of them are **palette PNGs (64 colors, about 70 KB in total)**. The logo is essentially navy on white, so the palette is visually lossless, and the earlier true-color versions weighed about 405 KB. Every file is precached by the service worker.

To change or regenerate them:
- Start from the original logo SVG, which embeds a 2884×1417 PNG; the emblem is its left part (x 0–1250).
- Never re-encode the already-reduced files.
- Use `sharp` installed in a temporary folder (`npm install sharp` there), not as a project dependency: `flatten` on white → `resize` with `lanczos3` → `extend` to a square → `png({ palette: true, colors: 64, compressionLevel: 9, effort: 10 })`.
- Keep the same sizes and file names, so no code changes are needed.
- ImageMagick and Python are not installed on this machine.

The sidebar header (`Sidebar.tsx`, expanded and collapsed) and the login top bar show the emblem on a white rounded badge, so it stays visible in dark mode. The login screen (`LoginView.tsx`) has a full-width top bar: the brand on the left edge and the theme toggle on the right, not a centered `max-w` container. In dark mode the card's full logo sits on a white plate, because its navy text is invisible on the dark card. Browsers and installed PWAs cache icons aggressively, so a hard reload or reinstall may be needed to see a change.

**List ordering**: every list has an `OrdenSelector` (`src/components/OrdenSelector.tsx`, a compact "A → Z / Z → A" select plus optional list-specific options) and sorts with `ordenarAlfabetico(lista, x => [claves], dir)` from `src/utils/orden.ts` (`compararTexto` = `localeCompare('es', { sensitivity: 'base', numeric: true })`: ignores case and accents, "Aula 2" before "Aula 10"). Lists always open in **A → Z** (state is not persisted). People sort by **apellido, then nombre**; `AlertaEstudiante` has only `estudiante_nombre`, so look the student up by `estudiante_id` to get the surname. Extra options keep the old order where it meant something: Matrículas and Caja "Más recientes", Recibos "Pago más reciente", Matriz and Monitoreo de Ausentismo "Más faltas", Anecdotario "Más anotaciones", Panel → Talleres "Más atrasados". Covered: Talleres, Estudiantes, Matrículas, Caja, Usuarios, Salones, Toma de Asistencia (and its workshop picker), the enrollment modal, Matriz (and its print), Recibos, Anecdotario, Panel → Talleres and Monitoreo. Workshop `<select>`s in filters are A → Z without a control. **Grados is excluded** (its `orden` is the school order). A new list should use the same two pieces.

**Styling**: Tailwind v4 via `@tailwindcss/vite`, configured in `src/index.css` (no tailwind.config). Dark mode is class-based (`@custom-variant dark`) toggled by `context/ThemeContext.tsx`. Components use many hard-coded hex colors (e.g. `#4F46E5` primary, `#1B222D` dark surface) alongside Tailwind palette classes. Icons from `lucide-react`, animation from `motion`.

**Mobile-first spacing convention.** The base class is the compact phone value and the desktop value goes under `sm:`, so phones stay compact and tablet or desktop look unchanged. New code must follow these patterns, which are already applied across all views and modals:
- View root: `p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6`.
- Page `<h1>`: `text-lg sm:text-2xl` (the Panel and Reportes add `lg:text-3xl`). Its description is `text-[11px] sm:text-xs`, and the header uses `pb-3 sm:pb-4`.
- Cards: `p-3.5 sm:p-5` or `p-4 sm:p-6`.
- Dark card and modal header bands: `px-4 sm:px-6 py-3 sm:py-4`.
- Modal overlay: `fixed inset-0 … p-2 sm:p-4`.
- Gaps: `gap-4 sm:gap-6`.
- KPI and metric strips use 2 columns on phones (`grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4`). They have `p-3 sm:p-4` cards, `w-8 h-8 sm:w-10 sm:h-10` icons and `text-xl sm:text-2xl` numbers.
- Avoid an unprefixed `p-6`, `p-8`, `px-6`, `text-2xl` or `space-y-6` in layout code.

## Troubleshooting (issues already diagnosed)

Check the server side first with the MCP. `query_logs` on `auth_logs` / `edge_logs` shows whether login (`/auth/v1/token`) and hydration (`/rest/v1/*`) returned 200. If they did, the problem is in the browser, not in Supabase.
- **Login works server-side but the app returns to the login screen with no message**: a stale cached bundle. Hard-reload (Ctrl+Shift+R), or unregister the service worker in DevTools → Application → Service Workers, and restart `npm run dev`.
- **"Today there is no session" / Toma de Asistencia locked on a future date**: today is outside every cut, a non-teaching day, before the workshop was created, or not one of its weekdays. This is correct behaviour; for a one-off class, create a "Sesión extraordinaria". If cuts were changed elsewhere, use Configuración → Cortes → "Aplicar cortes a los talleres".
- **Sessions shifted by one day**: a timezone bug from parsing `YYYY-MM-DD` with `new Date()` and then calling `getDay()`. See the dates rule in the data layer section.
- **A teacher no longer appears in the Talleres teacher selector but still owns a workshop**: their role was changed away from PROFESOR in Configuración. The selector lists only `PROFESOR`, while `grupos.profesor_id` keeps pointing to them. Restore the role or reassign the workshop.
- **MCP `execute_sql` confirmation expires**: see the Supabase MCP notes above (read-only queries and the rolled-back RLS test technique).
- **Every save of a table fails right after a code change** ("column … does not exist" toast, then a re-hydrate): the frontend already sends a new column, for example one added to `TABLES[...].columns`, but its migration is not applied yet. Apply the migration before running the new code locally or deploying it.
- **A student cannot be added to a workshop** (Talleres → Alumnos, Caja, or a move). Read the reason shown:
  - "Pendiente de pago en Caja" / "Renovación pendiente": the solvency gate.
  - "Taller lleno": occupancy counts the requests in Caja too. Check Configuración → Cupos.
  - A schedule clash, possibly with a **pending request** rather than an enrolled workshop.
  - All of these are intended rules.
- **The "Aplicar cortes" recalculation never ran** (old sessions are still there): the edge logs show no `DELETE` on `sesiones`. The cuts were created with an older bundle. Hard-reload, then press Configuración → Cortes → "Aplicar cortes a los talleres".
- **The enrollment email shows "Falta configurar la cuenta de envío"**: the `GMAIL_USER` / `GMAIL_APP_PASSWORD` secrets of `correo-matricula` are not set. For other failures, read `matriculas.correo_error` and the edge-function logs.
- **A receipt disappeared from Recibos, or the collected total dropped**: an ADMIN deleted that student (Estudiantes → Eliminar removes all their requests, paid ones included). `movimientos_inscripcion` still holds a `BAJA_TALLER` row with reason "Alumno eliminado" and the student's name. To pause a student without losing anything, use Baja instead.
- **Caja or Matrícula gets an error deleting a student**: expected; since `0016` only ADMIN can delete `estudiantes`.

## Specification docs

`public/assets/aistudio/` holds the original MVP technical spec and development best-practices docs (Spanish). They describe a target architecture (Supabase Postgres with RLS, Edge Functions, Cloudflare Pages, TanStack Query) that is only partly implemented (Supabase yes; TanStack Query and Cloudflare no); treat them as product/requirements context (e.g. 48px touch targets for attendance buttons on mobile, idempotent notifications with audit logs, no `any` in TypeScript), not as a description of the current code.
