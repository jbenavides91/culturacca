# **Especificaciones Tecnicas \- MVP Sistema de Control de Asistencia**

## **1\. Resumen Ejecutivo y Alcance**

Este documento detalla las especificaciones tecnicas completas para el desarrollo del Producto Minimo Viable (MVP) del Sistema de Control de Asistencia destinado a los cursos vespertinos de arte y cultura de la institucion.

### **Objetivos Clave del Sistema**

> * **Gestion de Asistencia Responsiva:** Permitir a los docentes registrar la asistencia diaria desde cualquier dispositivo movil o de escritorio de forma rapida.  
> * **Notificaciones por Correo:** Informar de forma automatica y transaccional a los tutores cuando un estudiante sea marcado como ausente al finalizar la lista.  
> * **Gestion de Rectificaciones:** Notificar al tutor si una falta previa es corregida a presente o justificada.  
> * **Alertas de Inasistencia:** Mostrar indicadores visuales en pantalla cuando un estudiante supere el umbral parametrizado de faltas o porcentaje de inasistencia.  
> * **Exportacion de Reportes:** Generar reportes consolidados en formatos PDF y Excel para la administracion.

## **2\. Arquitectura General del Sistema**

El sistema se estructura bajo una arquitectura serverless moderna y de alta disponibilidad:

| Componente | Tecnologia | Responsabilidad |
| :---- | :---- | :---- |
| Frontend | Cloudflare Pages (React / Next.js) | Aplicacion web responsiva desplegada en red global Edge. |
| Base de Datos y Auth | Supabase PostgreSQL | Gestion de usuarios, roles, seguridad RLS y datos relacionales. |
| Backend / Serverless | Supabase Edge Functions (Deno) | Procesamiento de notificaciones por correo y rectificaciones. |
| Servicio de Correo | SMTP / Resend / SendGrid | Envio de correos transaccionales no-reply desde el dominio institucional. |

## **3\. Modelo de Datos Relacional (PostgreSQL SQL DDL)**

Script completo de definicion de tablas para Supabase:  
**1\. Tipos ENUM:**  
CREATE TYPE public.user\_role AS ENUM ('ADMIN', 'PROFESOR');  
CREATE TYPE public.estatus\_asistencia AS ENUM ('PRESENTE', 'AUSENTE', 'JUSTIFICADO');  
CREATE TYPE public.tipo\_notificacion AS ENUM ('INICIAL', 'RECTIFICACION');  
**2\. Tabla Perfiles:**  
CREATE TABLE public.perfiles (  
id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,  
nombre TEXT NOT NULL,  
apellido TEXT NOT NULL,  
rol public.user\_role NOT NULL DEFAULT 'PROFESOR',  
creado\_en TIMESTAMPTZ DEFAULT NOW()  
);  
**3\. Tablas Tutores y Estudiantes:**  
CREATE TABLE public.tutores (  
id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
nombre TEXT NOT NULL,  
email TEXT NOT NULL,  
telefono TEXT,  
creado\_en TIMESTAMPTZ DEFAULT NOW()  
);

CREATE TABLE public.estudiantes (  
id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
matricula TEXT UNIQUE NOT NULL,  
nombre TEXT NOT NULL,  
apellido TEXT NOT NULL,  
tutor\_id UUID NOT NULL REFERENCES public.tutores(id) ON DELETE RESTRICT,  
creado\_en TIMESTAMPTZ DEFAULT NOW()  
);  
**4\. Tablas Grupos e Inscripciones:**  
CREATE TABLE public.grupos (  
id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
nombre TEXT NOT NULL,  
profesor\_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE RESTRICT,  
dias\_semana INT\[\] NOT NULL,  
hora\_inicio TIME NOT NULL,  
hora\_fin TIME NOT NULL,  
fecha\_inicio\_ciclo DATE NOT NULL,  
fecha\_fin\_ciclo DATE NOT NULL,  
creado\_en TIMESTAMPTZ DEFAULT NOW()  
);

CREATE TABLE public.inscripciones (  
id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
grupo\_id UUID NOT NULL REFERENCES public.grupos(id) ON DELETE CASCADE,  
estudiante\_id UUID NOT NULL REFERENCES public.estudiantes(id) ON DELETE CASCADE,  
UNIQUE(grupo\_id, estudiante\_id)  
);  
**5\. Tablas Sesiones y Asistencias:**  
CREATE TABLE public.sesiones (  
id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
grupo\_id UUID NOT NULL REFERENCES public.grupos(id) ON DELETE CASCADE,  
fecha DATE NOT NULL,  
hora\_inicio TIME NOT NULL,  
hora\_fin TIME NOT NULL,  
cerrada BOOLEAN NOT NULL DEFAULT FALSE,  
fecha\_cierre TIMESTAMPTZ,  
UNIQUE(grupo\_id, fecha)  
);

CREATE TABLE public.asistencias (  
id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
sesion\_id UUID NOT NULL REFERENCES public.sesiones(id) ON DELETE CASCADE,  
estudiante\_id UUID NOT NULL REFERENCES public.estudiantes(id) ON DELETE CASCADE,  
estatus public.estatus\_asistencia NOT NULL DEFAULT 'PRESENTE',  
motivo\_justificacion TEXT,  
registrado\_por UUID REFERENCES public.perfiles(id),  
actualizado\_en TIMESTAMPTZ DEFAULT NOW(),  
UNIQUE(sesion\_id, estudiante\_id)  
);  
**6\. Tablas Log Notificaciones y Configuracion:**  
CREATE TABLE public.log\_notificaciones (  
id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
asistencia\_id UUID NOT NULL REFERENCES public.asistencias(id) ON DELETE CASCADE,  
estudiante\_id UUID NOT NULL REFERENCES public.estudiantes(id),  
tutor\_email TEXT NOT NULL,  
tipo public.tipo\_notificacion NOT NULL,  
enviado\_en TIMESTAMPTZ DEFAULT NOW()  
);

CREATE TABLE public.configuracion\_sistema (  
id INT PRIMARY KEY DEFAULT 1,  
limite\_ausencias\_alerta INT NOT NULL DEFAULT 3,  
porcentaje\_inasistencia\_alerta NUMERIC(5,2) NOT NULL DEFAULT 20.00,  
updated\_at TIMESTAMPTZ DEFAULT NOW(),  
CONSTRAINT chk\_single\_row CHECK (id \= 1\)  
);

## **4\. Automatizacion y Vistas de Alertas**

### **Trigger para Pre-generacion de Sesiones**

Al crear un grupo con rango de fechas y dias de imparticion, el sistema pre-genera las sesiones correspondientes mediante una funcion en PL/pgSQL disparada despues del INSERT en la tabla grupos.

### **Vista Calculada de Alertas**

La vista vista\_alerta\_estudiantes calcula el total de sesiones impartidas cerradas, total de ausencias, total de faltas justificadas y el porcentaje de inasistencia, comparando estos datos contra los parametros definidos en la tabla configuracion\_sistema.

## **5\. Flujo de Notificaciones y Negocio**

> 1. El profesor toma la asistencia y presiona "Cerrar / Finalizar Lista".  
> 2. Se actualiza la sesion a cerrada=true y se dispara la Edge Function.  
> 3. Se envia un correo institucional no-reply a cada tutor con alumno ausente.  
> 4. En caso de rectificacion posterior, se envia un correo informativo de correccion de falta.

## **6\. Pantallas y Modulos del Sistema**

> * **Inicio de Sesion:** Autenticacion segura con credenciales institucionales.  
> * **Panel Administrador:** Alta de docentes, alumnos, tutores, grupos, configuracion de alertas y exportaciones.  
> * **Panel Profesor:** Seleccion de talleres a cargo y acceso a sesiones.  
> * **Toma de Asistencia:** Grid interactivo responsivo para movil y escritorio.  
> * **Modulo de Ajustes:** Formulario para definir parametros globales de alerta.  
> * **Reportes:** Generacion de listados en Excel y PDF.