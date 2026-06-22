# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- En el material de cada clase del calendario, el equipo ahora puede subir un archivo (hasta 50 MB, cualquier documento o multimedia) además de pegar un enlace; los alumnos lo descargan desde su calendario con un enlace temporal seguro. Esto habilita cargar recursos a programas como el Diplomado, cuyo contenido son las clases en vivo
- El editor de lecciones ahora gestiona todo el contenido de cada módulo en un solo lugar: las lecciones grabadas se pueden mover entre módulos, y debajo se ven las clases en vivo del calendario (por cohorte) que también se pueden reasignar de módulo, con enlace directo al calendario para editar fecha/docente
- En el panel de Usuarios, el equipo puede filtrar por entorno (Diplomado vs Workshop) y por estado (activos vs pendientes de activar su cuenta), combinables con los filtros de rol y la búsqueda, para encontrar miembros de cada programa rápidamente (`80f7486`)
- El equipo puede crear quizzes para cada clase (lección o módulo) además del examen final, con cuatro tipos de pregunta —opción única, opción múltiple, verdadero/falso y respuesta corta—; los alumnos los responden al terminar la clase como práctica (no bloquean el avance) y ven su nota y la corrección al instante (`c3d6a62`)
- En los recursos de cada lección, el equipo ahora puede subir un archivo (hasta 50 MB, cualquier documento o multimedia) además de pegar un link externo; los archivos quedan en almacenamiento privado y el alumno los descarga con un enlace temporal seguro
- El equipo puede crear, editar y eliminar módulos y lecciones desde el panel (`/admin/lessons`), con título, descripción, tipo y fecha de apertura por calendario; antes la estructura del diplomado solo se cargaba por scripts (`480df55`)
- En el editor de clases, las lecciones de cada módulo se pueden reordenar con flechas arriba/abajo (`a9709f9`)
- Los alumnos ya pueden rendir el quiz final desde la plataforma: la pantalla de evaluación (iniciar, responder, resultado y certificado) quedó conectada a la interfaz (`45b9f76`)
- Los módulos del classroom ahora muestran las clases en vivo agendadas (fecha, modalidad, instructor y materiales descargables), aunque no tengan lecciones grabadas aún; el admin puede vincular cada clase a su módulo desde el editor de calendario (`3794161`)
- El panel admin de cohortes tiene un acceso directo a la agenda de sesiones desde la vista de detalle (`493c9d8`)
- El login y el onboarding muestran la identidad de cada entorno (Diplomado, Workshop, Liderazgo) —color, nombre y textos propios— manteniendo una sola cuenta por usuario (`fbf772f`)
- En la página de cobro, el cliente puede elegir pagar al contado, en 6 o en 12 cuotas; las cuotas suman su recargo automáticamente, igual que en los demás checkouts (`84b124b`)
- Al confirmarse el pago del Diplomado, el comprador queda automáticamente matriculado en su classroom y recibe el correo para activar su cuenta y entrar (`6b974e6`)
- Los alumnos tienen un calendario de clases en vivo con vista de lista y vista de mes (la de mes por defecto), y ven el material asociado a cada sesión (`33a9ba4`)
- El staff gestiona el calendario de cada generación desde el panel (crear, editar y eliminar clases en lista o calendario), marca alumnos de Capital Inteligente para mostrarles clases exclusivas, y la plataforma envía recordatorios automáticos antes de cada clase (`002ca7a`)
- Entorno del Diplomado IV Generación: programa, generación y calendario de sesiones cargados, con invitación por correo a los alumnos (`6684fa2`)
- Página de inscripción y pago del Programa de Liderazgo en `/pago/liderazgo`: cuotas con precios propios y un código de lanzamiento que activa el precio con descuento ($360.000 / $384.000 / $396.000) (`5e3fbc8`)
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
- El comprador del Diplomado recibe el mismo correo de bienvenida completo que los alumnos invitados, con la logística de la primera clase presencial (`8a60329`)
- La landing del Diplomado quedó actualizada con los datos de la 4ª generación (`e009abb`)

### Fixed
- Los módulos del Diplomado ya muestran sus clases: las 24 sesiones del calendario quedaron asociadas a su módulo (Teórico/Práctico) y el inicio del programa cuenta las clases en vivo, no solo las lecciones grabadas; antes los módulos aparecían con "0 lecciones"
- La gestión de recursos en el panel ahora se separa por programa: con un selector arriba eliges el entorno (Diplomado, Workshop, Liderazgo) y solo ves sus módulos y lecciones; antes mezclaba los recursos de todos los programas en una sola lista
- El calendario y los módulos quedan consistentes: una clase en vivo solo puede vincularse a un módulo de su propio programa, y eliminar un módulo con clases agendadas se bloquea con un aviso claro en vez de dejarlas sin módulo en silencio (`c9c4ec6`)
- El acceso al contenido del programa ya no se pierde al cerrar la cohorte: un alumno con matrícula finalizada conserva sus clases y materiales (`45b9f76`)
- Los recordatorios de clases exclusivas de Capital Inteligente ahora llegan solo a esos alumnos, no a toda la generación; las clases grabadas dejan de generar recordatorio (`495722d`)
- Una clase cancelada en el calendario del alumno se marca como tal y ya no ofrece el botón "Entrar" a una sesión que no ocurrirá (`af96727`)
- El onboarding ya no se traba con "Validación fallida": el LinkedIn se acepta aunque se escriba sin `https://`, los campos opcionales vacíos dejan de bloquear, y si algo falla el mensaje indica qué campo revisar. Además el teléfono y el LinkedIn se autoformatean, y las pantallas de crear/recuperar contraseña y de login tienen botón para mostrar/ocultar la contraseña (`a260e9f`)
- Al entrar directamente al classroom de un programa (ej. Workshop), el sidebar ahora muestra el nombre de ese programa en vez del del último programa matriculado (`84a70b6`)
- Los administradores y staff pueden entrar a cualquier classroom sin estar matriculados; antes recibían un 404 (`b476cdf`)
- Los enlaces de activación/invitación ahora mantienen al usuario en capitalacademy.cl al confirmar la sesión, en vez de rebotar a una URL interna de Netlify y caer en login (`2f1ef8a`)
- Asignar un alumno a una cohorte desde el panel admin ahora crea la matrícula automáticamente (`c7633b4`)
- Reenviar invitación ya no falla cuando el usuario ya existe en el sistema (`66eac91`)
- Asignar cohorte desde la lista de usuarios ahora funciona correctamente (`e93ffca`)
- El progreso de video, los comentarios y el quiz del workshop vuelven a guardarse/cargar: la validación de IDs rechazaba las clases del classroom y devolvía error (`f5b6592`)

### Removed
- La pasarela Fintoc fue eliminada; el sistema procesa todos los pagos exclusivamente por Flow (`9e48c51`)

### Security
- Se cierra un hueco que permitía obtener el certificado sin completar el curso: la evaluación se puntúa íntegra en el servidor sobre las preguntas asignadas y admite un solo intento aprobado por alumno (`45b9f76`)
- Los recursos de clase ya no aceptan enlaces con esquemas peligrosos (`javascript:`/`data:`); solo se permiten URLs http(s) (`495722d`)
- Los certificados PDF ya no son públicamente accesibles; cada descarga requiere una URL firmada con expiración (1 hora en pantalla, 5 años en el correo de emisión) generada exclusivamente por el servidor (`ddb01a7`)
- La PII de cada usuario (RUT, teléfono, dirección) es ahora visible solo para el propio usuario y el equipo; el catálogo de lecciones, módulos y recursos queda aislado por programa para evitar acceso cross-tenant (`9e48c51`)
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
