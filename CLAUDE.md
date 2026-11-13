# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Cultura CCA" (institution: Colegio Centro América): a Spanish-language PWA for attendance, enrollment and cashier/solvency management of afternoon art & culture workshops. It was scaffolded in Google AI Studio (see README). The UI text, domain types and most identifiers are in Spanish (`Grupo` = workshop, `Sesion` = class session, `Asistencia` = attendance record, `Inscripcion` = enrollment in a group, `Matricula` = enrollment request, `Tutor` = guardian, `Perfil` = user profile). Keep new code consistent with that vocabulary.

## Commands

- `npm install --legacy-peer-deps` (a pre-existing esbuild/vite peer conflict makes plain `npm install` fail; a `bun.lock` is also present)
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

## Architecture

**Backend is Supabase** (Postgres + Auth + Realtime + one Edge Function), accessed directly from the browser with the anon key (`src/services/supabase.client.ts`); security is enforced by RLS. Schema, RLS policies and realtime publication live in `supabase/migrations/` (`0001_init.sql` base schema; `0002_plantilla_contrato.sql`; `0003_anecdotario.sql`; `0004_salones.sql`; `0005_corregir_fechas_sesiones.sql`, a one-off data fix; `0006_arancel.sql`; `0007_optimizar_politicas_rls.sql`; `0008_sesiones_extraordinarias.sql`; `0009_anecdotario_edicion_admin.sql`; `0010_grados.sql`). The `admin-usuarios` Edge Function (`supabase/functions/`, Deno, excluded from `tsconfig`) uses the service role. Its actions are `create`, `update` (profile plus Auth email/password), `delete`, and `grant_access` (gives a login to a legacy profile and moves its references). Every action requires an active ADMIN caller. After editing it, redeploy through the MCP `deploy_edge_function` (name `admin-usuarios`, `verify_jwt: false`, passing the full `index.ts`); `list_edge_functions` shows the deployed version. It is deployed with `verify_jwt: false` because it validates the caller's session and ADMIN role itself, which also avoids CORS-preflight issues with the `sb_publishable_` key. The service-role key must never reach the frontend or `.env.local`. `express`, `dotenv` and `@google/genai` are unused leftovers from AI Studio.

**Navigation is state-based, not routed.** `src/App.tsx` holds `currentTab: NavTab` (type defined in `modules/navigation/Sidebar.tsx`) and conditionally renders one view per tab. Cross-module navigation is done via callbacks passed down from `App` (e.g. `onSelectWorkshop` sets the selected group and switches to the `asistencia` tab). When adding a tab: update `NavTab`, `Sidebar`, `ROLE_CONFIGS` in `utils/rbac.ts`, and the render switch in `App.tsx`.

**RBAC** (`src/utils/rbac.ts`): roles `ADMIN`, `PROFESOR`, `CAJERO`, `MATRICULA`, each with an allowed-tab list and a default tab. `App` blocks disallowed tabs; views also receive `currentProfile` and filter data by role (e.g. professors see only their own groups). The UI rules must stay consistent with the RLS write policies in the SQL migrations. Reads are open to any active profile, except `anecdotario` (see below). Writes:
- ADMIN: everything; only ADMIN writes `grupos`, `perfiles`, `configuracion`, `salones` and `grados`.
- PROFESOR: `asistencias`, `sesiones`, `log_notificaciones`, and inserting its own `anecdotario` notes.
- CAJERO and MATRICULA: `matriculas`, `estudiantes`, `tutores`, `inscripciones`.

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
- Sessions are generated from a group's cycle dates and weekdays (`generarFechasSesiones`, with deterministic ids `ses-<grupoId>-<YYYY-MM-DD>`). `actualizarGrupo` runs `reconciliarSesiones` on **every** save, not only when dates or weekdays change. That also repairs a partial save, such as a group stored with its new calendar but without its sessions. It adds missing sessions and removes extra ones, except closed sessions or sessions that already have attendance, which are kept. Time and name changes only touch sessions that are not closed. `actualizarGrupo` returns `{ grupo, sesionesAgregadas, sesionesEliminadas, sesionesConservadas }`.

A common confusion: a cycle start date that is not one of the workshop's weekdays produces no session on that day. That is correct behaviour, not a bug. The Talleres forms show `VistaPreviaSesiones` (first and last class, session count, and a warning when the start date is not a class day), computed with `previsualizarSesiones()`. Saving is blocked if the range would produce zero sessions.

**Extraordinary sessions** (`sesiones.extraordinaria = true`) are make-up or extra classes created with `agregarSesionExtraordinaria()` from Toma de Asistencia by ADMIN or the group's own PROFESOR. They take any date (one session per group per date, same deterministic id) and are **never removed by `reconciliarSesiones`**. The UI shows them with a violet "Extra" badge.
- Business rules live here, not in components: schedule conflict detection (`sonTalleresEnConflicto`), enrollment, attendance marking, `cerrarSesion` (closes a session and emails guardians of absent students), rectifications, alerts.

**Auth** (`src/services/auth.service.ts`): Supabase Auth email/password. Login also accepts a username, resolved to the Auth email by the `email_por_usuario` RPC. The `perfiles` row (id = Auth UID) holds the role; users without a profile or with `activo = false` are signed out. `AuthState.status` (`loading` → `signed_out` | `hydrating` → `ready` | `error`) drives which screen `App` renders. Creating, editing (email/password) and deleting users is async and goes through the Edge Function (`storageService.crearUsuario/actualizarPerfil/eliminarPerfil`). **Teachers are managed only in Configuración → Usuarios** with the Docente role (create, edit, deactivate). There is no separate Docentes module: its tab (`maestros`) and `TeachersView` were removed because everything they did is covered by Configuración and Talleres. The create and edit forms show "Especialidad artística" for the Docente role. `SettingsView` still accepts the optional props `crearUsuarioConRol` / `onCrearUsuarioAtendido` (open the create form pre-filled with a role), but nothing passes them now.

Legacy teacher records without a login (ids like `prof-…`) no longer exist in the database; there were 0 when the Docentes module was removed. The service code is still there but has no UI: `storageService.tieneCuentaDeAcceso()`, `darAccesoDocente()` and the Edge Function action `grant_access`, which creates the Auth user, inserts a new profile with the UID, moves `grupos.profesor_id`, `asistencias.registrado_por` and `anecdotario.autor_id` to the new id, and deletes the old profile.

Workshops are assigned to teachers from the Talleres form (`asignarTallerADocente` also exists in the service, where `''` means unassigned). `crearGrupoConSesiones`/`actualizarGrupo` call `verificarChoqueDocente`, which blocks a teacher from having two workshops with overlapping cycle dates, days and hours. The email is optional when creating users: if left empty, an internal address `<username>@usuarios.cultura-cca.local` is generated (`src/utils/correoInterno.ts`, which also defines `USERNAME_REGEX`: lowercase, digits, `._-`, 3-30 chars, no `@`). The UI shows "Sin correo" for those users. The workshop teacher selector lists **only `rol === 'PROFESOR'`** profiles. Roles, usernames and passwords are managed only in Configuración → Usuarios. Firebase (config in `firebase-applet-config.json`) is used only to get a Google OAuth token for Gmail/Calendar; it does not change the active profile.

**Integrations** use that Google access token directly from the browser:
- `notification.service.ts`: sends absence emails via the Gmail REST API with an idempotency key and exponential-backoff retry; with no token it simulates an "SMTP institucional" send. Each attempt yields a `LogNotificacion`.
- `calendar.service.ts`: creates Google Calendar events.
- `export.service.ts`: Excel export via `xlsx`.

**Institution-wide settings come from `configuracion`, never hard-coded**: use `nombreInstitucion()` and `cicloActual()` from `src/utils/institucion.ts` (emails, Excel exports, Calendar events, receipts, certificates, sidebar). The enrollment contract is a template stored in `configuracion.plantilla_contrato` (null = built-in default), edited in Configuración → Contrato (`modules/settings/ContractTemplateTab.tsx`). `src/utils/contractTemplate.ts` renders `{{variables}}`, where an UPPERCASE variable name means an uppercased value, and `VARIABLES_CONTRATO` lists the valid keys. Callers use `generateInstitutionalContractText(data)`.

**Arancel (workshop fee)** is never hard-coded. Use `src/utils/arancel.ts`:
- `arancelDeGrupo(grupo)`: the group's own `grupos.costo` if set, otherwise `configuracion.arancel_taller`.
- `periodoArancel()` / `etiquetaPeriodo()`: `MENSUAL` → "/ mes", `CICLO` → "por ciclo".
- `formatearMonto()` → "C$ 1,200".
- `montoDeSolicitud(sol)`: the amount stored on the enrollment, falling back to the current fee.

The general fee and period are set in Configuración → Reglas y Parámetros; the per-workshop fee in Talleres. Enrollments and renewals store `monto_arancel` at creation time, so later fee changes do not alter them. The contract template exposes `{{arancel}}` and `{{periodo_arancel}}`.

**Salones** (table `salones`, ADMIN writes, managed in Configuración → Salones / `SalonesTab.tsx`): `grupos.aula` stores the room **name**, not an id. `actualizarSalon` propagates a rename to the groups that use it, and `eliminarSalon` refuses while a room is in use (deactivate it instead). Workshops pick rooms through `SalonSelect` (active rooms only, falling back to free text if the catalogue is empty). `crearGrupoConSesiones`/`actualizarGrupo` call `verificarChoqueSalon`, which blocks two workshops in the same catalogued room with overlapping cycle dates, days and hours (it reuses `sonTalleresEnConflicto`). Non-catalogued values such as "Taller Principal" are not checked.

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
  - **Alertas de Inasistencia** respond only to the workshop filter, because alerts are cumulative over the cycle (`calcularAlertasEstudiantes(grupoId)`).
  - **Monitoreo de Ausentismo** (`AbsenteeismMonitorCard`, right column below Próximas clases) lists students with `tiene_alerta`, sorted by absences.
    - It has its own filters, independent of the KPI filters and remembered under `cca_panel_ausentismo_filtros`: a date period (Semana / Mes / Ciclo, the default / Rango) and a workshop (all, or one).
    - It calls `calcularAlertasEstudiantes(grupoId | undefined, { desde, hasta })`. With a range, only closed sessions in those dates count, and the Configuración thresholds apply to that period.
    - Without a range, the method behaves exactly as before, so every other caller is unchanged.
    - The range is part of the cache key under the `alertas` tag.
  - Shared pieces live in `attendanceStatus.shared.tsx`. Those are `ESTADOS`, `FilaEstatus`, `FilaSesion`, `BadgeExtra`, and the UTC date helpers on `YYYY-MM-DD` strings (`sumarDias`, `lunesDe`, `inicioDeMes`, `finDeMes`, `sumarMeses`). Use them instead of `new Date('YYYY-MM-DD')`.
- **Reportes** has three tabs:
  - **Matriz de Asistencia**: ADMIN and PROFESOR.
  - **Historial de Recibos y Pagos Contables** (`ReceiptsHistoryTab`): ADMIN and CAJERO. CAJERO sees only this tab.
  - **Anecdotario** (`AnecdotarioHistoryTab`): ADMIN and PROFESOR. A full-width, alphabetical list of all students (search by name or matrícula, workshop filter, "Solo con anotaciones", "Incluir bajas") with per-type counters, total and date of the last note. Clicking a student opens `AnecdotarioAlumnoModal` (`modules/reports/`) with that student's history grouped by month.
    - The modal filters by type (chips with counts), dates (Este mes / Últimos 3 meses / Todo / Rango, on the local date of `creado_en`) and text. Its filters reset each time it opens. The shared helpers (`PERIODOS`, `rangoDePeriodo`, `mesDe`, `nombreCompleto`, `nombreTallerDe`, `TIPOS_LISTA`) are exported from that file.
    - The tab exports the notes of the listed students, and the modal exports its filtered history, both via `exportService.exportAnecdotario`. ADMIN can edit (type and text, inline) and delete notes from the modal; the note then shows "Editado por … el …".
    - A PROFESOR sees only their own groups, students and notes. It reuses `TIPOS` and `formatearFechaHora` exported from `AnecdotarioModal`.
- **Caja y Solvencia** (`CashierView`):
  - It opens on **Por Cobrar** (`filterEstado = 'PENDIENTE_CAJA'`). The status buttons are ordered Por Cobrar → Formalizadas → Todas.
  - A date filter offers any date, a single day, or a range, with Hoy / Esta semana / Este mes shortcuts.
  - Pending requests are filtered by `fecha_solicitud`; collected or formalized ones by `fecha_pago` (falling back to `fecha_aceptacion`). The comparison uses local dates via `fechaLocalISO(new Date(iso))`.
  - Status-button counts come from `solicitudesBase` (search + date), so they match the list. The top metric cards stay global.
- **Toma de Asistencia** (`RollCallView`): the session picker labels each session with `estadoSesion` (Cerrada / Hoy / Pendiente / Programada) using local date and time. The default session is today's, else the next one, else the last. Each student row has an Anecdotario column.
- **Configuración** tabs: Usuarios y Roles, Reglas y Parámetros (absence thresholds, institution name, cycle, fee), Salones, Grados, Contrato.

**Offline/PWA**: `vite-plugin-pwa` (auto-update) plus `hooks/useOnlineStatus`, `components/OfflineIndicator`, `hooks/usePWAInstall`. The service worker is **disabled in dev** (`devOptions.enabled: false`), because a dev service worker kept serving stale bundles after frequent changes. There is no offline write queue: saving requires a connection.

**App icons** use the Colegio Centro América emblem (the shark and shield only, without the text, which is unreadable at icon sizes) on a white background. They live in `public/`:
- `pwa-192x192.png` and `pwa-512x512.png`;
- `pwa-maskable-512x512.png`, with extra padding for Android's circular crop;
- `apple-touch-icon.png` (180 px);
- `favicon-32x32.png` and `favicon-64x64.png`, linked from `index.html` and listed in `includeAssets`.

They were generated from the full logo SVG, which embeds a 2884×1417 PNG: the emblem was cropped from its left part and resized with PowerShell/.NET `System.Drawing`. ImageMagick and Python are not installed on this machine. To change the icons, regenerate them all at the same sizes and file names. Browsers and installed PWAs cache icons aggressively, so a hard reload or reinstall may be needed to see the change.

**Styling**: Tailwind v4 via `@tailwindcss/vite`, configured in `src/index.css` (no tailwind.config). Dark mode is class-based (`@custom-variant dark`) toggled by `context/ThemeContext.tsx`. Components use many hard-coded hex colors (e.g. `#4F46E5` primary, `#1B222D` dark surface) alongside Tailwind palette classes. Icons from `lucide-react`, animation from `motion`.

## Troubleshooting (issues already diagnosed)

Check the server side first with the MCP. `query_logs` on `auth_logs` / `edge_logs` shows whether login (`/auth/v1/token`) and hydration (`/rest/v1/*`) returned 200. If they did, the problem is in the browser, not in Supabase.
- **Login works server-side but the app returns to the login screen with no message**: a stale cached bundle. Hard-reload (Ctrl+Shift+R), or unregister the service worker in DevTools → Application → Service Workers, and restart `npm run dev`.
- **"Today there is no session" / Toma de Asistencia locked on a future date**: the cycle start date is not one of the workshop's weekdays. This is correct behaviour; for a one-off class, create a "Sesión extraordinaria".
- **Sessions shifted by one day**: a timezone bug from parsing `YYYY-MM-DD` with `new Date()` and then calling `getDay()`. See the dates rule in the data layer section.
- **A teacher no longer appears in the Talleres teacher selector but still owns a workshop**: their role was changed away from PROFESOR in Configuración. The selector lists only `PROFESOR`, while `grupos.profesor_id` keeps pointing to them. Restore the role or reassign the workshop.
- **MCP `execute_sql` confirmation expires**: see the Supabase MCP notes above (read-only queries and the rolled-back RLS test technique).

## Specification docs

`public/assets/aistudio/` holds the original MVP technical spec and development best-practices docs (Spanish). They describe a target architecture (Supabase Postgres with RLS, Edge Functions, Cloudflare Pages, TanStack Query) that is only partly implemented (Supabase yes; TanStack Query and Cloudflare no); treat them as product/requirements context (e.g. 48px touch targets for attendance buttons on mobile, idempotent notifications with audit logs, no `any` in TypeScript), not as a description of the current code.
