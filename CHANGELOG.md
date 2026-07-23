# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- La presentación "IA 2026: de conversar a dirigir" queda publicada en la plataforma (`/presentaciones/ia-2026`): se abre en el navegador, avanza con el teclado y funciona sin internet una vez cargada (`05ec2bf`)
- Evaluaciones ahora es una sección propia del panel admin (`/admin/evaluaciones`): creas una evaluación (quiz o nota manual) desde cero eligiendo su alcance, y la configuras en su propia pantalla; Certificados también estrena su propia sección en el menú (`e90c576`)
- Nueva pantalla de notas para el alumno (escala chilena 1-7) y panel de calificación para el profesor: además de los quizzes autocorregidos, ahora se pueden cargar notas manuales (roleplay, guión de venta, etc.) con checklist, borrador/publicación e importación desde Excel por email (`2064943`)
- Ahora puedes marcar cada lección como clase, actividad práctica o evaluación; las actividades muestran una etiqueta al alumno y, si aún no tienen contenido, ya no se ve el bloque de video vacío (`730e266`)
- Ahora puedes programar la apertura y el cierre de un quiz (por fecha y hora): se activa y se desactiva solo, sin que tengas que entrar a hacerlo manualmente (`fce1244`)
- Las repeticiones de clases en vivo ahora eligen automáticamente una miniatura atractiva del video (frame seleccionado por IA), visible en la lista de clases del admin. (`fc3ef9a`)
- En el checkout de pago ahora puedes elegir boleta o factura; al elegir factura se piden los datos de la empresa (razón social, RUT, giro, dirección y correo de contacto) y le llegan al equipo junto al aviso de pago (`d9b8c97`)
- Los archivos de la sección Recursos (y de cada lección) ahora se pueden ver directamente en la plataforma con el botón "Ver", además de descargarse (`340c947`)
- Home del alumno rediseñada: temario en acordeón, hero compacto y progreso siempre visible (`23e5d0e`)
- Correo de confirmación automático al recibir una entrega (`23e5d0e`)
- Aviso por correo cuando la grabación de una clase queda disponible (`23e5d0e`)
- Los formularios del panel administrativo, el checkout y el classroom ahora usan controles propios de marca (selector de fecha, menú desplegable, casillas, radios y selector de archivo) en vez de los del navegador; el panel de asistencia de una clase queda más compacto con búsqueda y marcado en bloque, y el popover de notificaciones ya no se corta en pantallas angostas (`43626f6`)
- El panel administrativo estrena diseño en lecciones, quizzes y entregables: el listado de lecciones ahora muestra miniatura, duración y estado del video, quizzes y entregables se presentan en una grilla con insignias de estado, y la gestión de un quiz se abre en una ventana emergente en vez de una pantalla aparte (`3c9eb40`)
- El equipo ahora puede ver PDF y archivos de Office (Word, Excel, PowerPoint) directamente dentro de la vista de clase, sin descargarlos, con botones separados para ver y descargar; además el panel "Alumnos" y "Progreso" del admin estrena un diseño de dos columnas con el detalle del alumno siempre visible en vez de una ventana emergente, y desde la tarjeta de cada clase se puede marcar asistencia o generar el QR sin entrar a editar (896bb27)
- Las secciones de los editores de lección y de sesiones de cohorte ahora se pueden colapsar, para llegar más rápido a lo que se quiere editar sin scrollear paneles largos (00de220)
- Al compartir enlaces de la plataforma en WhatsApp o LinkedIn ahora se ve una tarjeta de marca profesional: genérica del sitio, por programa en los checkouts, y el certificado verificado muestra el nombre del alumno y su programa (a3213c7)
- Los pagos de Flow cuya matrícula fallaba ahora se reintentan automáticamente y alertan al equipo, en vez de quedar cobrados sin acceso y sin aviso. (`f6dca5a`)
- Las docentes y asistentes ahora ven las cohortes donde enseñan en "Mis programas", con un distintivo "Docente" (ca61542)
- Subtítulos y selector de calidad ahora disponibles donde corresponde en el reproductor, con preferencias que se recuerdan (`3129602`)
- Ver las clases desde el teléfono es más cómodo: doble toque a la izquierda o derecha del video para retroceder o avanzar 10 segundos, controles compactos al borde que ya no tapan la imagen ni los subtítulos, y encabezado y resumen IA más livianos en pantallas chicas (`1f14926`)
- Ahora puedes retirar una nota que ya publicaste (el alumno deja de verla, con confirmación antes de hacerlo), en vez de que la única forma de despublicar fuera guardar un borrador por accidente (`12d704d`)
- El panel de notas del profesor ahora marca con una etiqueta las evaluaciones que aún están en borrador (el alumno todavía no las ve), tanto en la lista como al entrar a calificar (`7307c98`)
- el Centro de Ayuda ahora tiene una sección propia para profesores, con nueve guías que cubren su agenda de clases, el material, la asistencia por QR, las evaluaciones y las conversaciones con sus alumnos (`b5217f9`, `7f10191`)
- los alumnos ahora tienen guía de sus notas, entregables, clases en vivo, asistencia por QR y conversaciones del programa (`f2bb309`)
- el equipo ahora tiene guía de Evaluaciones, Alumnos, Entregables y asistencia por QR (`5223ae1`)
- los profesores ahora pueden descargar toda su guía de ayuda en un PDF, siempre al día porque se genera desde el mismo contenido del Centro de Ayuda (`5b656f2`)

### Fixed
- Entrar desde el enlace de asistencia ya no falla: si el enlace del correo se abre dos veces (el escáner del correo o un segundo clic lo consumían) la plataforma te deja pasar igual, y al recuperar tu contraseña ahora vuelves a la pantalla que estabas intentando abrir en vez de al inicio del classroom (`4987dc9`)
- Los mensajes de error al editar el perfil ahora se muestran en español, en vez de texto técnico en inglés (`8568b85`)
- Editar la bio del perfil ya no deja todo el texto seleccionado al abrir el campo, y ahora muestra cuántos caracteres quedan de los 3000 disponibles (`1a1ee5e`)
- las guías de quizzes, examen final y certificación ahora describen cómo funciona la plataforma hoy: las notas de los quizzes por clase se publican solas y cuentan para el promedio aunque no certifiquen, las alternativas llegan hasta la F, y los certificados viven en su propia sección (`f2bb309`, `5223ae1`)

### Changed
- El menú lateral del alumno es más simple ("Inicio", programas colapsados) (`12e3145`)
- El classroom carga más rápido en cada navegación: se eliminaron validaciones de sesión y consultas a la base de datos que se repetían en cada pantalla, y las que quedan se resuelven en paralelo (`b09a5d4`)
- La pantalla de una conversación carga más liviana y rápida: dejó de enviarse el procesador de texto al navegador y los avatares se optimizan automáticamente (`db2c32d`)
- Las fotos de perfil en todo el classroom (menú, comentarios, perfil) se sirven optimizadas y livianas en vez del archivo original, y la página del quiz carga menos código de entrada (las pantallas de resultado se traen recién al terminar) (`624b57c`)
- La pantalla de la lección se siente más fluida mientras el video reproduce: dejó de repintarse varias veces por segundo, evitando micro-tirones al hacer scroll o interactuar (`110a23e`)
- El classroom, el checkout y el panel del docente cargan más rápido: marcar asistencia de toda una clase ahora es una sola operación en vez de decenas, la pantalla de pago se sirve desde caché en vez de generarse en cada visita, y el aviso de notificaciones dejó de pedirse dos veces. Además, el panel del docente suma un código QR para el registro de asistencia y el video de cada lección genera automáticamente su glosario y capítulos al procesarse (`7d87e12`)
- La transcripción se carga al abrirla: la página de clase pesa ~200KB menos (`3129602`)
- El import de notas desde Excel ya no publica automáticamente: por defecto queda como borrador para que la profe revise antes de que el alumno la vea, y el resumen ahora distingue notas nuevas de notas sobrescritas (`7c37eea`)

### Security
- Un alumno ya no puede escribir directamente sus propios intentos de evaluación: la nota, la aprobación y el cierre solo los fija el servidor, cerrando la vía por la que se podía auto-emitir un certificado sin rendir el examen (`c5344fa`)
- Se cerró un agujero por el que un alumno podía elevar su propia cuenta a administrador y así acceder a los datos personales de todos los usuarios; ahora solo un administrador o los procesos internos pueden cambiar el rol de una cuenta (`312267c`)
- La página de registro de asistencia por QR solo muestra los datos de una clase (título y cohorte) a alumnos matriculados en ella; un usuario de otro programa ya no puede leer esa información abriendo el enlace de una sesión ajena (`0e82e7f`)
- Los datos personales sensibles de un alumno (RUT, dirección, contacto de emergencia, fecha de nacimiento) ya no son visibles para sus compañeros de programa; en el foro y los comentarios solo se comparte nombre y avatar. Además, los egresados vuelven a tener acceso a las grabaciones de sus clases en vivo (`4925e11`)
- El webhook que recibe los avisos de video de Mux ahora rechaza en producción las solicitudes sin firma válida (antes, si faltaba el secreto, procesaba igual), impidiendo que un tercero altere lecciones o dispare correos de seguimiento falsos (`8bdd6df`)

### Fixed
- Asignar el rol de profesor en una cohorte ya no marca automáticamente a esa persona como profesora de todos los módulos del programa (`b8b0cc1`)
- El panel del profesor ya no aparece vacío para quien dicta una clase sin tener rol de docente en la cohorte, y el acceso al panel ahora es visible en el menú del equipo (`98f9f9d`)
- En casos puntuales de notas ponderadas, un error de precisión decimal podía mostrar "reprobado" a un alumno que en realidad había aprobado por el mínimo; el promedio ya se calcula correctamente (`b699182`)
- Al reimportar notas con "Importar y publicar" ya no se pierde la fecha original de publicación (antes se reescribía con la fecha del reimport) (`b24e789`)
- Si tu nota falla en cargar por un problema real de la base de datos, la pantalla de notas ya no dice "aún no tienes notas publicadas" — muestra el error y puedes reintentar; y cuando tu profesor carga notas con distinto peso (ej. 25/50/25), tu promedio del módulo ahora se calcula ponderado en vez de desaparecer, con un ícono junto a cada nota que marca si aprobaste o no (`693fbcf`)
- Un pago cobrado por Flow ya no puede quedar sin registrar para siempre: el sistema verifica cada 15 minutos contra Flow los pagos en curso y recupera automáticamente los que el aviso de pago no alcanzó a confirmar (`df40b63`)
- La hora de tu próxima clase ahora se muestra en hora de Chile: se veía varias horas más tarde de lo real (`522cfdf`)
- Se corrigió el error "Algo salió mal" que veían los alumnos al entrar al classroom por saturación de la base de datos; la migración con el fix a producción queda pendiente de aplicar (`e523c79`)
- Si la carga de una cohorte falla por una demora transitoria de la base de datos, ahora aparece el botón "Reintentar" en vez de una pantalla en blanco; y las fechas inválidas o vacías ya no rompen la pantalla, se muestran como "—" (`dd0cd80`)
- Las fechas de inicio y término de una cohorte ya no se muestran un día antes (`33c4b81`)
- Al quitar el rol de un usuario en una cohorte, ahora sí se elimina — antes mostraba "Rol removido" sin borrar nada (`68b1acd`)
- Crear una pregunta de quiz de opción única con respuesta correcta E o F ya no falla (`77915ed`)
- La bio del perfil admite textos largos y el mensaje de error al guardar ahora dice qué falló (`4aa4428`)
- El buscador de usuarios del admin ya no se siente lento al escribir (`ad5e1ec`)
- Guardar el progreso de una lección ya no duplica la verificación de matrícula ni reintenta a ciegas: cuando la base de datos está saturada responde de inmediato en vez de sumar más carga (`0fd7705`)
- Los recordatorios de clase ya no se pierden ni se repiten cuando la cohorte es grande: se envían por lote y se reintentan solo a quien le faltó el correo (`cbfc2fa`)
- La alerta de inasistencias ya no llega a programas gratuitos o de captación que no la tienen activada; por ahora solo se envía en el Diplomado (`7b8c3f8`)
- Comprar un programa ya no le quita los permisos a un administrador o profesor que use su misma cuenta: la matrícula automática ya no pisa el rol ni el nombre de un perfil que ya existía (`af9b097`)
- El certificado ya no se puede emitir contra el examen final de un programa que quedó desactivado (`6a2876f`)
- Al quitar el rol de un usuario en una cohorte, si la operación falla ahora se avisa con un mensaje de error en vez de dejar el acceso intacto sin decir nada (`7ab7fa0`)
- El panel de notas del profesor ya no confunde cohortes: si dictas más de una cohorte del mismo programa (ej. G4 y G5), calificar la evaluación de una ya no abría por error el listado de alumnos de la otra. Además, un profesor a cargo de varias cohortes ya no recibe "No autorizado" al gestionar el checklist de una evaluación, y el requisito de asistencia del alumno se oculta temporalmente mientras se confirma el porcentaje vigente con la profe (`34641cc`)
- Notas de quiz y checklist de evaluaciones: el guardado automático de notas de quiz ya no puede pisar una nota manual o importada desde Excel, agregar un criterio nuevo tras borrar uno del medio ya no falla, y una lección con dos evaluaciones activas ya no oculta en silencio el bloque de evaluación al alumno (`73ddc45`)
- Una misma persona con dos cuentas (por ejemplo, alumna de un programa y profesora de otro) ya puede completar su perfil: antes el segundo registro fallaba con "Error al actualizar perfil" porque el RUT solo podía existir en una cuenta (`2f8e5e2`)
- El menú del classroom ahora sigue al programa que estás viendo: alumnos con varios programas llegan a los entregables y recursos correctos, y al cambiar de entorno (staff) todos los links del menú se actualizan, no solo el inicio. (cc796c7)
- Las notas ya publicadas de un alumno ya no desaparecen de su pantalla de notas cuando la profe desactiva la evaluación (por ejemplo, al cerrar el trimestre): una nota publicada es un registro académico y ya no depende de que la evaluación siga activa (`37bc866`)
- Ver y descargar recursos ya no falla cuando la página lleva horas abierta: el enlace se genera fresco en cada clic, en todas las pantallas (lección, módulo, recursos y clase en vivo). (9ded24a)
- Al agendar clases o entregables ya se puede elegir la hora: el selector no se cierra solo ni queda pegado en las 09:00. (9639895)
- Si al enviar el examen final o una evaluación falla la red o el servidor, las respuestas ya no se pierden: se muestra un aviso junto al botón para reintentar el envío, en vez de mandar de vuelta al inicio con el formulario vacío (`45e4068`)
- Los programas en vivo ya no muestran "0 lecciones": ahora cuentan sus clases en vivo (`23e5d0e`)
- Las notificaciones por correo ya no se pierden si un envío se interrumpe a la mitad; se reintentan solas (`23e5d0e`)
- Un usuario de staff/operación sin matrícula ya puede editar su perfil en el classroom: antes cualquier guardado fallaba porque el formulario reenviaba nombre, teléfono y RUT completos y esos campos estaban vacíos en su cuenta
- Un enlace largo pegado sin espacios en un comentario de clase o en un hilo del foro ya no desborda el diseño en el celular: ahora el texto envuelve dentro del contenedor.
- Los alumnos matriculados en más de un programa (por ejemplo, el Diplomado y la Capacitación Comercial CI) ahora ven una pantalla para elegir a cuál entrar al abrir "Mis programas". Antes, el classroom abría siempre el programa más reciente y dejaba los demás sin forma de volver a ellos (`777fcf1`)
- Las repeticiones de clases en vivo ya no aparecen duplicadas como lecciones sueltas en "Gestión de lecciones"; ahora se ven integradas en su clase en vivo, con estado del video y acceso directo a editarla (eb4b0c4)
- El reproductor de video ahora funciona bien en el teléfono: puedes arrastrar la barra de progreso con el dedo y el botón de pantalla completa funciona en iPhone (d03f7c1)
- Los formularios ya no hacen zoom involuntario al escribir en iPhone, y los botones e íconos pequeños ahora son fáciles de tocar en pantallas táctiles (d03f7c1)
- Se corrigieron desbordes y cortes de pantalla en móvil: pie del quiz, inicio del quiz, página de lección con títulos largos, footer de completar perfil, panel de alumnos del admin y verificación de certificados (d03f7c1)
- Las acciones que solo aparecían al pasar el mouse (editar o eliminar comentarios, copiar transcripción, remover roles) ahora son visibles en pantallas táctiles (d03f7c1)
- En los programas 100% en vivo, el avance de cada módulo ya no queda pegado en "0/N" para siempre: ahora también cuenta las clases pasadas; el error al borrar una clase se muestra dentro del mismo cuadro de confirmación, y la tecla Escape cierra el panel de transcripción (2c6c9d0)
- La barra de progreso y el control de volumen del reproductor ahora se pueden operar con el teclado (flechas, inicio/fin) y anuncian su posición a lectores de pantalla (`083bcf4`)
- Ahora se pide confirmación antes de borrar algo que no se puede deshacer (una evaluación con sus intentos, una pregunta, un comentario o una conversación) y antes de que la IA reescriba preguntas ya creadas. Además, en el panel de Usuarios los filtros, la búsqueda y la página quedan en la dirección web: puedes compartir el enlace o usar el botón "atrás" (`dafbd56`)
- Mejoras de accesibilidad y pulido en toda la interfaz: los controles del reproductor de video y los botones de ícono ahora tienen nombre para lectores de pantalla, los avisos y errores se anuncian solos, los campos de correo se comportan mejor en el teclado del móvil, y se quitaron botones que no hacían nada (campana de notificaciones, "cambiar contraseña", etc.) para que nada se sienta a medio terminar (`8af638e`)
- Al abrir el enlace directo de una lección que es la repetición de una clase en vivo, ahora se redirige a la pantalla de esa clase (con su material y quiz) en vez de mostrarla como una lección suelta (`478f45b`)
- Los correos con textos por defecto ahora usan copys neutros en vez de asumir que el destinatario es del Diplomado (`b5d9c6c`)
- Al usar "Ver como Alumno", el staff ahora ve el classroom del entorno seleccionado en el switcher. Antes, si el usuario estaba matriculado en varios programas, siempre se abría el mismo (el de su matrícula más reciente) sin importar el entorno elegido (`310ab5b`)
- Las pantallas del classroom ya no se caen por la campana de notificaciones: al montarse duplicada (menú de escritorio y móvil a la vez) rompía la conexión en tiempo real y tumbaba la página; además se quitó la campana redundante del encabezado del foro (`3b7b9bb`)
- La portada del classroom se ve bien con nombres de programa largos: el título se equilibra en varias líneas y baja de tamaño para no ocupar media pantalla, y la tarjeta de progreso ya no se estira dejando un vacío interior (`440dae3`)
- Pulido del panel admin tras la auditoría UI/UX: se quitó un botón de "más acciones" que no hacía nada en el roster de la cohorte, la tarjeta de rol del perfil de usuario dejó de anidar un botón dentro del enlace, y el editor de Lecciones agrupa mejor sus controles y muestra un estado vacío más claro (`03ae342`)
- El panel del docente ya no rechaza al profesor sin matrícula al marcar asistencia o subir material: la verificación de acceso por sesión dejó de depender de una lectura que solo veía el staff de plataforma. Además, subir o borrar un material ya no le devolvía un error al profesor (ni le duplicaba el archivo al reintentar) aunque la operación sí se hubiera guardado, porque la confirmación de vuelta también dependía de esa misma lectura (`7ff383d`)
- En el panel administrativo, al reordenar las lecciones de un módulo el número que se muestra ahora refleja el nuevo orden visual (antes quedaba pegado a la posición original), la duración no se oculta cuando una lección dura 0 minutos, y la tarjeta ya no se desborda en pantallas angostas (`40aa41f`)
- El correo de aviso por inasistencias ya no cuenta como falta una clase anterior a la fecha en que el alumno se matriculó, evitando avisos incorrectos a quienes se inscribieron después de esa sesión (`1bfcbd9`)
- El panel "Alumnos" ahora calcula la asistencia con la misma definición que el correo de alerta: no cuenta las repeticiones grabadas, las clases anteriores a la matrícula del alumno ni las de un segmento distinto al suyo; antes sobrestimaba las inasistencias en esos casos (`94a6e46`)
- El "Asistencia prom." del panel "Alumnos" ya no baja por alumnos sin clases cerradas aplicables (mostraban 0% falso); ahora se muestran como "Sin clases". Además, un docente o asistente de cohorte sin acceso de administrador ya no recibe error al subir o borrar material de una clase aunque el cambio sí se hubiera guardado (`93dfb69`)
- Se corrigió una fuga de datos de instructores entre programas (un alumno de un programa podía ver el correo y la biografía de instructores de otros programas), los cupones con cupo limitado ahora respetan su límite de usos al confirmarse el pago, y se renovó la interfaz de todo el panel administrativo y el classroom con nuevos estados de carga y mejor accesibilidad (`44c70d9`)
- Reordenar las lecciones de un módulo desde el teléfono ya no provoca toques errados: los botones de subir/bajar tienen ahora tamaño táctil adecuado y la fila de cada lección se organiza en dos líneas claras (miniatura y título arriba, acciones abajo) en vez de amontonarse (4a60114)
- El detalle de un alumno en el panel administrativo ya no recorta las tarjetas de asistencia/avance/evaluaciones ni desordena las fechas de las sesiones a las que faltó (4a60114)
- En el panel de quizzes del admin, cada clase en vivo ahora tiene su propia tarjeta para crear y gestionar su quiz (el mismo que se ve en el editor del calendario), y las repeticiones ya no aparecen como lecciones que duplicaban el quiz de la clase original (aaaf4d2)
- El botón "Agregar participante" del detalle de cohorte ya asigna profesores, ayudantes y alumnos en vez de estar deshabilitado, y al asignar un rol desde el perfil de un usuario los errores (por ejemplo, si ya tenía ese rol) ahora se muestran en pantalla en vez de fallar en silencio (`bf4c29a`)
- El calendario de clases ya no muestra la pantalla de error completa por un fallo temporal de red: si falla la carga de datos secundarios (docentes, materiales o quizzes) esos se omiten y el resto del calendario sigue visible; además la pantalla de error ahora muestra un código para soporte. (`7acbb21`)
- Los correos de apertura de entregable y de grabación/seguimiento del Ciclo CI ya no se duplican ni se pierden entre corridas — idempotencia por destinatario + tope de 10 casos por corrida. (`8a52d04`)
- Los menús desplegables (selectores y calendarios) dentro de ventanas modales ya no quedaban ocultos detrás del modal; ahora se muestran encima (464b42e)
- El avance del video ya no se pierde al pausar o cerrar la pestaña, y el reproductor se recupera de cortes de red (`3129602`)
- Las clases nuevas generan capítulos, resumen y transcripción de forma confiable al subirse (`3129602`)

### Added
- Nuevo módulo "Entregables": el equipo crea tareas por programa con ventana de subida (fecha de apertura y fecha límite), tipos de archivo permitidos y tamaño máximo; el alumno sube su archivo desde el classroom dentro del plazo y recibe un correo apenas la ventana se abre; el equipo revisa desde el panel admin quién entregó y quién no, con descarga directa de cada archivo
- La página de registro de asistencia por QR ahora avisa antes de que el alumno haga clic si el registro todavía no abre o si ya cerró, en vez de esperar a que intente registrarse. Además, un alumno que acumula 2 inasistencias a clases en vivo recibe un correo cordial de seguimiento invitándolo a retomar el ritmo
- Nuevo "Calendario" en el panel admin (sección Configuración): muestra el mes completo de clases del entorno activo, con navegación mes a mes; cada clase enlaza directo a su editor de sesión.
- El equipo ahora puede subir una portada personalizada a cada módulo y cada clase grabada desde el editor; el classroom del alumno la muestra en la tarjeta del módulo y en la lista de lecciones, con el diseño actual como respaldo si no hay portada.
- Nuevo panel "Alumnos" para el equipo: por cada alumno matriculado en el entorno activo se ve su asistencia, avance de lecciones y evaluaciones aprobadas en una sola tabla, con búsqueda, filtro de "en riesgo" y detalle por alumno (sesiones faltadas, lecciones y evaluaciones pendientes)
- Nuevo panel para el docente (`/docente`): sin necesitar matrícula ni acceso al panel de administración, un profesor ve sus clases, marca asistencia, sube material y entra a Conversaciones de su programa
- En el editor de cada clase en vivo, el equipo ve la asistencia: quién estuvo presente (por QR o marcado a mano, con la hora) y quién faltó, más el conteo de presentes; y puede marcar o quitar la asistencia de un alumno manualmente cuando no alcanzó a escanear el QR (`7e6de27`)
- Nuevo entorno "Ciclo de Capacitación Comercial CI": un ciclo interno y gratuito para la fuerza de ventas de Capital Inteligente, con classroom propio (5 sesiones presenciales de los martes), foro y login/onboarding con marca propia. Queda listo para matricular a sus asistentes (`885323d`)
- Registro de asistencia por código QR: cada clase en vivo tiene un QR (para la presentación del docente) que el alumno escanea, inicia sesión y marca su asistencia con un tap; el equipo genera, descarga e imprime el QR desde el editor de sesiones (`0d5df46`)
- El Ciclo de Capacitación Comercial CI envía recordatorios automáticos de cada sesión (24 h y 1 h antes) y, cuando se publica la grabación, un correo de seguimiento con el enlace a la clase (`bb70bf5`)
- En Conversaciones ahora puedes reaccionar con ❤️, 👍, 🎉 o 💡 (antes solo con corazón), y la campana de notificaciones aparece en todo el classroom, no solo dentro del foro (`df0471f`)
- Conversaciones ahora avisa y se actualiza en vivo: una campana con contador te notifica cuando responden tu conversación o te mencionan (escribes @ y eliges a la persona), también te llega un correo, y los comentarios nuevos aparecen sin recargar. El feed carga más conversaciones a medida que bajas (`76ce35b`)
- En Conversaciones ahora puedes guardar una conversación y volver a ella desde el filtro "Guardados", y las direcciones web que escribes en los comentarios se vuelven enlaces clicables (`f428ea2`)
- Conversaciones ahora se organiza y se busca: al abrir una conversación eliges una categoría (General, Dudas, Recursos, Logros, Presentaciones), el feed se filtra por categoría, se puede buscar por texto y ordenar por "Sin responder" (además de Recientes y Populares). Las respuestas del equipo se marcan con una insignia, y el filtro queda en el enlace para compartirlo (`71199fd`)
- Nuevo espacio "Conversaciones" en el menú del alumno: un foro de comunidad del programa donde cualquiera abre una conversación (con título y contenido) y responde en hilos con reacciones, al estilo de Skool. El feed es compartido por todo el programa, no por generación (`2668ee1`)
- En el editor de lección, si Mux no pudo procesar el último video ahora aparece un aviso con el detalle del error y la sugerencia de volver a subirlo, en vez de quedar en un estado ambiguo (`35a3dae`)
- El selector de entorno ahora también aparece en "Ver como Alumno": el staff puede saltar entre programas mientras previsualiza el classroom, sin tener que volver a la vista de admin para cambiarlo (`8804b33`)
- El Programa de Liderazgo ya es un entorno completo con classroom propio: cuatro jornadas (una por módulo), su calendario de clases presenciales de los viernes de julio con el docente de cada una, y login/onboarding con la marca del programa. Queda listo para matricular a sus alumnos (`10575e2`)
- La subida de videos ahora es más robusta: sube por partes y reintenta sola ante cortes de red, así que las grabaciones grandes ya no fallan a medio camino. Al subir la repetición de una clase, el equipo ve el avance y un aviso automático cuando queda lista o si Mux no pudo procesarla, con opción de reintentar (`4c4b2da`)
- Los alumnos ahora pueden abrir el quiz de una clase en vivo directamente desde el calendario y la lista de clases del módulo, sin depender del enlace o código QR que enviaba el equipo (`f89761d`)
- Cada clase en vivo tiene su propia pantalla con la repetición grabada del encuentro, su material y su quiz; el equipo sube la grabación desde el editor de sesiones (`341ec05`)
- Las pantallas del classroom (lecciones, quiz, sidebar, playlists) y el login ahora tienen animaciones de entrada y microinteracciones: fade-up al cargar, transiciones de foco en formularios y respuesta visual inmediata en botones e inputs (`dfa19f0`)
- El equipo puede crear un quiz para una clase en vivo específica (además del examen final, por módulo y por lección) desde el editor de sesiones de la cohorte, y compartirlo por enlace o código QR durante la clase; los alumnos lo responden como práctica sin que afecte su avance (`8aad28b`)
- El panel de cada evaluación se reorganizó en pestañas: las preguntas se ven en una lista colapsable (antes se mostraban todas abiertas a la vez), una pestaña "Ajustes" permite configurar n.º de intentos, % para aprobar, preguntas por intento y tiempo límite, y una pestaña "Respuestas" muestra los intentos de los alumnos con el detalle de cada respuesta frente a la correcta (`8aad28b`)
- El panel de quizzes ahora gestiona todas las evaluaciones —examen final, por módulo y por lección— desde un mismo lugar (crear, agregar preguntas de los cuatro tipos, activar y borrar), y cada evaluación se puede compartir con los alumnos mediante un enlace y un código QR que los lleva directo a rendirla (`9a3937b`)
- El staff tiene en el menú un selector de "Entorno" (programa) y un interruptor "Ver como: Admin / Alumno": el entorno elegido enfoca Usuarios, Progreso y Quizzes al programa activo, y la vista de alumno permite revisar la experiencia del estudiante sin perder el acceso de administrador (`726a5c8`, `86f8111`)
- Las clases ahora pueden ser de texto/diapositiva, no solo de video: el equipo escribe el contenido con formato (títulos, listas, imágenes intercaladas) desde el editor de la lección, y el alumno lo lee dentro de la clase junto con el material y un botón para marcarla como completada (antes una clase sin video abría a una pantalla vacía) (`4d8516c`)
- Nuevo "Recursos" en el menú del alumno: una vista que reúne en un solo lugar todo el material del programa —de las clases grabadas y de las clases en vivo— para encontrarlo rápido (`7627ac2`)
- En el editor de Lecciones, cada ítem tiene un botón "Editar" directo a su edición: las lecciones grabadas a su detalle, y las clases en vivo abren esa clase específica en el calendario (fecha, docente, enlace), sin pasar por el calendario general (`85ae5ce`, `dfb7b36`)
- Nuevo "Centro de ayuda" en el menú: un índice con buscador y categorías que lleva a una página dedicada por cada tema/pantalla (paso a paso, recomendaciones, preguntas frecuentes y enlace directo a la pantalla). Dividido en vista de alumno y de equipo (esta última solo para staff), e incluye un bloque de soporte donde la persona escribe su mensaje y adjunta capturas de pantalla sin salir de la app —llega por correo al equipo y se responde directo— además de WhatsApp como acceso directo (`5b760f3`, `12346c0`, `28cfc2a`)
- En "Recursos por lección", bajo cada módulo ahora también se listan las clases en vivo del calendario (antes solo aparecían las lecciones grabadas con video), cada una con su conteo de recursos y un acceso directo al editor de calendario para cargarles material (`b4037d7`)
- En el material de cada clase del calendario, el equipo ahora puede subir un archivo (hasta 50 MB, cualquier documento o multimedia) además de pegar un enlace; los alumnos lo descargan desde su calendario con un enlace temporal seguro. Esto habilita cargar recursos a programas como el Diplomado, cuyo contenido son las clases en vivo (`f3d4a5a`)
- El editor de lecciones ahora gestiona todo el contenido de cada módulo en un solo lugar: las lecciones grabadas se pueden mover entre módulos, y debajo se ven las clases en vivo del calendario (por cohorte) que también se pueden reasignar de módulo, con enlace directo al calendario para editar fecha/docente (`7b9ce47`)
- En el panel de Usuarios, el equipo puede filtrar por entorno (Diplomado vs Workshop) y por estado (activos vs pendientes de activar su cuenta), combinables con los filtros de rol y la búsqueda, para encontrar miembros de cada programa rápidamente (`80f7486`)
- El equipo puede crear quizzes para cada clase (lección o módulo) además del examen final, con cuatro tipos de pregunta —opción única, opción múltiple, verdadero/falso y respuesta corta—; los alumnos los responden al terminar la clase como práctica (no bloquean el avance) y ven su nota y la corrección al instante (`c3d6a62`)
- En los recursos de cada lección, el equipo ahora puede subir un archivo (hasta 50 MB, cualquier documento o multimedia) además de pegar un link externo; los archivos quedan en almacenamiento privado y el alumno los descarga con un enlace temporal seguro (`df66c7d`)
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
- El panel de quizzes se simplificó: la configuración (intentos, % para aprobar, tiempo), los intentos de los alumnos y las preguntas ahora se gestionan dentro de cada evaluación —no en pestañas globales separadas—, eliminando que un mismo dato se editara desde dos lugares; la generación de preguntas con IA quedó en el examen final (`679a046`)
- La gestión de material se consolidó en el editor de Lecciones: ahora el material de las clases en vivo se sube ahí mismo (panel "Material" desplegable en cada clase) sin tener que ir al calendario, y la página separada "Recursos por lección" redirige al editor de Lecciones (`834f492`)
- El menú del panel admin se reorganizó en dos grupos más claros: "General" (Usuarios, Cobros) y "Configuración" (Lecciones, Quizzes, Progreso de cohorte), en vez de una sola lista "Operaciones" (`39e0e2f`)
- Avatares en comentarios, mejoras responsive en sidebar, selector de calidad en video player, y campo de cumpleaños en perfil (`45b7d4f`)
- Las páginas del classroom cargan más rápido con queries paralelas y skeletons de carga instantánea (`af0e71a`)
- Crear usuario ahora permite asignar cohorte y enviar invitación en un solo paso (`e982aa5`)
- El correo de invitación muestra el logo en el header y ya no duplica el nombre del programa (`65f6067`)
- El comprador del Diplomado recibe el mismo correo de bienvenida completo que los alumnos invitados, con la logística de la primera clase presencial (`8a60329`)
- La landing del Diplomado quedó actualizada con los datos de la 4ª generación (`e009abb`)

### Fixed
- En el editor de sesiones, el "Quiz de la clase" ahora corresponde a la sesión abierta: antes se mostraba el quiz de otra clase en todas las sesiones que no tenían uno propio, lo que además permitía editar o desactivar por error la evaluación de una clase ajena (`ba667e4`)
- Los quizzes por clase (formativos) ya no se confunden con el examen final: la certificación y el reintento de certificado solo consideran el examen final, y cada intento aprobado queda acotado a su propia evaluación (`77f971f`, `342d880`, `56491e8`, `5c66afb`, `5fe5d9e`)
- Pulido visual: las tarjetas de módulo del alumno ya no se desbordan ni quiebran el texto a anchos intermedios; se corrigieron acentos faltantes ("Gestión de Quizzes", "Configuración", "Código"), los títulos del panel quedaron consistentes, y la tabla de Usuarios muestra el nombre completo de la cohorte al pasar el cursor (`0f77439`)
- "Ayuda" ahora está siempre visible en el menú, tanto en la vista de administrador como en la de alumno (antes desaparecía en el panel admin) (`bf77b4b`)
- Para el staff, estando en el panel admin la navegación lateral ya no se mezcla con la de alumno: al volver al panel con el modo "Ver como alumno" activado, antes se mostraba contenido de administrador con el menú de estudiante y sin accesos para navegar (`8bae848`)
- Los módulos del Diplomado ya muestran sus clases: las 24 sesiones del calendario quedaron asociadas a su módulo (Teórico/Práctico) y el inicio del programa cuenta las clases en vivo, no solo las lecciones grabadas; antes los módulos aparecían con "0 lecciones" (`2b1218f`)
- La gestión de recursos en el panel ahora se separa por programa: con un selector arriba eliges el entorno (Diplomado, Workshop, Liderazgo) y solo ves sus módulos y lecciones; antes mezclaba los recursos de todos los programas en una sola lista (`da00004`)
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

### Added
- Ahora puedes editar tus propios comentarios, tanto en una lección como en el foro de Conversaciones (36d95ad)
- Nuevas notificaciones (campana y correo) cuando alguien responde o comenta en una lección, además de las que ya existían en el foro (36d95ad)
- Los minutos y segundos que aparecen en un comentario de clase (por ejemplo "12:30") ahora son clicables y saltan directo a ese momento del video (36d95ad)
- La búsqueda del foro ahora encuentra hilos en todas las páginas, no solo en las ya cargadas (36d95ad)
- El equipo docente ahora puede moderar comentarios ajenos (eliminarlos) tanto en el foro como en los comentarios de una lección (36d95ad)

### Fixed
- Los docentes ya pueden ver y responder los comentarios de sus propias lecciones; antes quedaban bloqueados si no tenían matrícula (36d95ad)
- Cambiar la reacción a un comentario o hilo del foro ahora se guarda de verdad: antes se veía el cambio en pantalla pero se perdía al recargar (36d95ad)
- Los enlaces de notificaciones (campana y correo) ya no dan error 404 en programas con más de una cohorte (36d95ad)
- Los errores al publicar, editar o borrar un comentario ahora se muestran en pantalla en vez de fallar en silencio (36d95ad)

### Security
- Se cerraron agujeros de RLS en el foro de Conversaciones: un usuario ya no puede mover su propio hilo a otro programa ni fijarlo/bloquearlo sin ser parte del equipo (36d95ad)
- Se agregó un tope de menciones por comentario para evitar el envío masivo de notificaciones y correos (36d95ad)
