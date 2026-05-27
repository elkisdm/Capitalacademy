# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Sistema de onboarding con invitación por email, creación de contraseña vía link, completación de perfil obligatorio (RUT, teléfono), importación CSV masiva, y perfil editable del alumno (`1038f7d`)
- Panel de administración de usuarios con gestión de roles por cohorte (RBAC multi-tenant), asignación de roles, y vista de detalle por cohorte (`a390f85`)
- Módulo Classroom completo: dashboard del alumno, timeline de lecciones, player de video con Mux, tracking de progreso granular, panel admin (upload, recursos, reporte por cohorte), login funcional, sidebar colapsable con vista mobile (`dbf58c6`)
- Landing page del Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria
- Sistema de pagos con Flow y Fintoc (checkout, webhooks, confirmación)
- Sistema de cupones de descuento con validación
- Planes de pago (contado, 2 cuotas, 3 cuotas) con descuento por cohorte
- Captura de leads vía API
- Login con email/password (Supabase Auth)
- Esquema SQL inicial: profiles, programs, cohorts, modules, lessons, enrollments, class_sessions
- Cliente Mux configurado para gestión de video
- Integración con Slack, Resend, Google Drive

### Fixed
- Corregidos links no clickeables, pluralización incorrecta, contadores inconsistentes y sidebar con items sin destino en el Classroom (`32d7f58`)
