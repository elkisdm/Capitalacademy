# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- En la página de cobro, el cliente puede elegir pagar al contado, en 6 o en 12 cuotas; las cuotas suman su recargo automáticamente, igual que en los demás checkouts (`84b124b`)
- Al confirmarse el pago del Diplomado, el comprador queda automáticamente matriculado en su classroom y recibe el correo para activar su cuenta y entrar (`6b974e6`)
- Los alumnos tienen un calendario de clases en vivo con vista de lista y vista de mes (la de mes por defecto), y ven el material asociado a cada sesión (`33a9ba4`)
- El staff gestiona el calendario de cada generación desde el panel (crear, editar y eliminar clases en lista o calendario), marca alumnos de Capital Inteligente para mostrarles clases exclusivas, y la plataforma envía recordatorios automáticos antes de cada clase (`002ca7a`)
- Entorno del Diplomado IV Generación: programa, generación y calendario de sesiones cargados, con invitación por correo a los alumnos (`6684fa2`)
- Página de inscripción y pago del Programa de Liderazgo en `/pago/liderazgo`: cuotas con precios propios y un código de lanzamiento que activa el precio con descuento ($360.000 / $384.000 / $396.000)
- Página de cobro para montos puntuales: el equipo comparte un enlace y el cliente paga el monto exacto por Flow; el monto va firmado para que no se pueda alterar (`94734f9`)
- Panel admin para generar links de cobro desde `/admin/cobros` sin usar la terminal, con monto y concepto editables (`aac2635`, `9c4da3e`)
- Validación de input (Zod), rate limiting, error boundaries, suite de 82 tests (vitest), y pipeline CI con GitHub Actions (`0e0d7b7`)
- El reproductor de lección muestra título e instructor arriba del video, capítulos clicables en el resumen, botón "Marcar completada", y acceso directo a transcripción (`1ddea94`)
- El sidebar colapsado muestra tooltips en cada opción, botón de cerrar sesión en desktop, y link a "Mi perfil" desde el avatar (`2507446`)
- Flujo de recuperación de contraseña con página /forgot-password y email branded via Resend (`b3c7ffd`)
- Los alumnos pueden subir foto de perfil y agregar su cumpleaños con autoformato DD/MM/AAAA (`255b2dc`)
- Certificados se envían por email al generarse, con QR funcional de verificación y botón de reintentar si la generación falla (`8a9b3e3`)

### Changed
- Avatares en comentarios, mejoras responsive en sidebar, selector de calidad en video player, y campo de cumpleaños en perfil (`45b7d4f`)
- Las páginas del classroom cargan más rápido con queries paralelas y skeletons de carga instantánea (`af0e71a`)
- Crear usuario ahora permite asignar cohorte y enviar invitación en un solo paso (`e982aa5`)
- El correo de invitación muestra el logo en el header y ya no duplica el nombre del programa (`65f6067`)

### Fixed
- Los enlaces de activación/invitación ahora mantienen al usuario en capitalacademy.cl al confirmar la sesión, en vez de rebotar a una URL interna de Netlify y caer en login (`2f1ef8a`)
- Asignar un alumno a una cohorte desde el panel admin ahora crea la matrícula automáticamente (`c7633b4`)
- Reenviar invitación ya no falla cuando el usuario ya existe en el sistema (`66eac91`)
- Asignar cohorte desde la lista de usuarios ahora funciona correctamente (`e93ffca`)
- El progreso de video, los comentarios y el quiz del workshop vuelven a guardarse/cargar: la validación de IDs rechazaba las clases del classroom y devolvía error (`f5b6592`)

### Security
- Sanitización de comentarios, filtrado de datos sensibles en respuestas API, políticas RLS para pagos/cupones, y corrección de contraste WCAG AA (`e7fd0a3`)
- Verificación real de firma HMAC en webhook de Mux, autorización unificada en rutas admin, y validación de enrollment en proxy de video (`1d74d35`)

### Changed
- Menú hamburguesa en landing mobile, logo de Capital Academy en todo el sistema, y mejoras responsive en admin/classroom (`1d74d35`)
- Selector de cohorte en página de progreso admin, vista mobile en tabla de progreso, y focus trapping en todos los modales (`abb853e`)

### Fixed
- Corrección de bugs en quiz timer, selector de calidad de video funcional, y ~1.5MB menos de bundle inicial vía lazy loading (`1d74d35`)
- Importación masiva de usuarios optimizada de ~200 a ~54 queries, corrección de transcripciones en batch, y quiz-manager descompuesto en 10 módulos (`abb853e`)

### Removed
- Buscador de transcripciones en el sidebar del classroom (`4170dfe`)

### Added
- Reproductor de video premium con controles custom, subtítulos CC, capítulos dinámicos, velocidad, PiP y atajos de teclado (`57ec905`)
- Subtítulos automáticos en español para todos los videos via Mux Whisper, con corrección gramatical por IA (`57ec905`)
- Transcripción interactiva sincronizada con el video en el sidebar, con búsqueda y click-to-seek (`57ec905`)
- Resúmenes de lección generados con IA: puntos clave, resumen y glosario de términos (`57ec905`)
- Búsqueda full-text en todas las transcripciones del programa con navegación directa al timestamp (`57ec905`)
- Comentarios con respuestas anidadas estilo YouTube en cada lección (`57ec905`)
- Quiz final por programa: generación automática de preguntas desde transcripciones, configurable por admin, con scoring instantáneo (`57ec905`)
- Certificación automática: PDF personalizado con verificación pública en /verificar, emitido al aprobar el quiz (`57ec905`)
- URLs legibles con slugs en el classroom reemplazando UUIDs, con compatibilidad retroactiva (`57ec905`)
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
