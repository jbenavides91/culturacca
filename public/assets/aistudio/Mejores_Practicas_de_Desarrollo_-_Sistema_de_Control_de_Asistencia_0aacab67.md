# **Mejores Practicas de Desarrollo \- Sistema de Control de Asistencia**

## **1\. Arquitectura de Software y Estructura del Proyecto**

Para garantizar la mantenibilidad, escalabilidad y limpieza del codigo en el frontend (Cloudflare Pages) y backend (Supabase), se debe seguir una arquitectura modular basada en separacion de responsabilidades.

> * **Estructura por Caracteristicas (Feature-based):** Organizar el codigo por modulos de negocio (ej. *asistencia*, *grupos*, *reportes*, *alertas*) en lugar de organizarlo por tipo de archivo.  
> * **Tipado Estricto (TypeScript):** Prohibir el uso de any. Generar automaticamente los tipos de la base de datos utilizando el CLI de Supabase (supabase gen types typescript).  
> * **Abstraccion de Servicios:** Aislar las llamadas al SDK de Supabase dentro de capas de servicio o repositorios para facilitar pruebas unitarias y desvincular la UI de la logica de acceso a datos.

## **2\. Seguridad y Base de Datos (Supabase PostgreSQL)**

La seguridad de la informacion institucional descansa en el correcto diseño de la base de datos y la aplicacion rigurosa de Row Level Security (RLS).

| Practica | Descripcion | Impacto |
| :---- | :---- | :---- |
| **Principio de Minimo Privilegio (RLS)** | Todas las tablas deben tener RLS habilitado por defecto. Las politicas deben validar explicitamente el rol (ADMIN o PROFESOR) mediante auth.uid(). | Evita fuga de datos y accesos no autorizados entre profesores o usuarios externos. |
| **Indexacion Estrategica** | Crear indices B-Tree en llaves foraneas (estudiante\_id, grupo\_id, sesion\_id) y campos de filtrado recurrente (fecha, estatus). | Optimiza las consultas de reportes y agregacion de inasistencias a nivel milisegundo. |
| **Manejo de Transacciones** | Operaciones compuestas (como cerrar sesion y registrar multiples asistencias) deben ejecutarse mediante Funciones RPC en PL/pgSQL para garantizar atomicidad. | Garantiza inconsistencia cero en caso de fallos de red durante el registro. |

## **3\. Performance y Experiencia de Usuario (Cloudflare Pages)**

Dado que la aplicacion se utilizara principalmente desde dispositivos moviles por los docentes durante sus clases, la experiencia e interfaz de usuario deben priorizar la rapidez y capacidad de respuesta.

> * **Diseño Mobile-First Touch Friendly:** Los botones de estatus (Presente, Ausente, Justificado) deben tener una zona tactil minima de 48px x 48px para facilitar el marcaje agil con una sola mano.  
> * **Gestion de Estado y Caching:** Utilizar herramientas de gestion de estado asincrono (como React Query o TanStack Query) con politicas de stale-time adecuadas para minimizar consultas repetitivas a la base de datos.  
> * **Optimizacion de Bundle:** Mantener el tamaño del paquete JavaScript inicial por debajo de los 150KB mediante code-splitting y lazy-loading de modulos pesados (como los generadores de PDF y Excel).

## **4\. Edge Functions y Notificaciones por Correo**

El motor de envio de correos automaticos debe ejecutarse en el Edge para evitar latencia y desacoplar el frontend de tareas intensivas I/O.

> * **Idempotencia en Envios:** Implementar un identificador unico por notificacion antes de enviar el correo a la pasarela (Resend/SMTP), evitando envios duplicados por reintentos accidentales.  
> * **Manejo de Errores y Retries:** Configurar reintentos con retraso exponencial (Exponential Backoff) para mitigar caidas temporales del servidor de correo.  
> * **Registro de Auditoria (Logging):** Registrar cada intento de envio en la tabla log\_notificaciones con marca de tiempo, correo destino, tipo de correo (Inicial o Rectificacion) y estatus final.  
> * **Gestion de Secretos:** Nunca exponer llaves privadas de API o credenciales SMTP en el cliente. Almacenar todas las llaves en las variables de entorno de Supabase Edge Functions.

## **5\. Calidad de Codigo, CI/CD y Control de Versiones**

> * **Control de Versiones (Gitflow):** Mantener ramas protegidas main (produccion) y develop. Requerir Pull Requests con revision de codigo antes de integrar cambios.  
> * **Migraciones Versionadas:** Toda alteracion a la base de datos debe documentarse mediante archivos de migracion SQL gestionados con Supabase CLI (supabase migration new). Evitar modificaciones manuales en el dashboard de produccion.  
> * **Integracion Continua (CI/CD):** Configurar despliegues automaticos a Cloudflare Pages al hacer merge en main, incluyendo etapas de linter (ESLint), formateo (Prettier) y validacion de tipos TypeScript.