-- Respaldo de los 14 capítulos generados por IA sobre tramos SIN transcripción real,
-- borrados de producción el 2026-07-23.
--
-- Contexto: el ASR de Mux marcó tramos largos de habla como [Música] y la generación
-- de capítulos inventó títulos y timestamps sobre esos huecos. Se conservaron solo los
-- capítulos con al menos un cue de habla transcrita en sus primeros 2 minutos.
--
-- Criterio de borrado: 0 cues de habla en [position_seconds, position_seconds + 120].
-- Excepción: el capítulo en position_seconds = 0 se conservó en las lecciones que sí
-- tienen transcripción parcial (Rentix, Educación Financiera), porque marca el inicio.
-- En "IA aplicada al rol del asesor" la transcripción es 100% marcadores, así que se
-- borraron los 7.
--
-- Para restaurar, ejecutar los INSERT de abajo.

INSERT INTO lesson_chapters (id, lesson_id, position_seconds, title, sort_order, is_generated, created_at) VALUES ('2b33b802-e3a8-43e5-b0ab-44ba23f2ea5d', '2061c651-7ad0-4049-9908-09b5098aca44', 980, 'Evolución de la empresa', 3, 't', '2026-07-20 16:58:33.499711+00');
INSERT INTO lesson_chapters (id, lesson_id, position_seconds, title, sort_order, is_generated, created_at) VALUES ('41dab2fb-e57f-40c7-a949-add23c65f144', '2061c651-7ad0-4049-9908-09b5098aca44', 1320, 'Ecosistema inmobiliario', 4, 't', '2026-07-20 16:58:33.499711+00');
INSERT INTO lesson_chapters (id, lesson_id, position_seconds, title, sort_order, is_generated, created_at) VALUES ('a09d7aea-275b-4770-bb46-0a81ee1da92c', '2061c651-7ad0-4049-9908-09b5098aca44', 1900, 'Formación y ventas', 5, 't', '2026-07-20 16:58:33.499711+00');
INSERT INTO lesson_chapters (id, lesson_id, position_seconds, title, sort_order, is_generated, created_at) VALUES ('b2e15499-27ea-4ad7-b6fb-b26595e39ff0', '84791e7f-da5e-4c52-9b68-38f8ba718c4c', 780, 'Conocimiento financiero', 1, 't', '2026-07-20 16:48:09.250263+00');
INSERT INTO lesson_chapters (id, lesson_id, position_seconds, title, sort_order, is_generated, created_at) VALUES ('6001e25c-5dad-4b6b-a682-ef51ac36cd62', '84791e7f-da5e-4c52-9b68-38f8ba718c4c', 1860, 'Actitud y comportamiento', 2, 't', '2026-07-20 16:48:09.250263+00');
INSERT INTO lesson_chapters (id, lesson_id, position_seconds, title, sort_order, is_generated, created_at) VALUES ('863518e0-78dd-4ecb-9b37-eb771241327f', '84791e7f-da5e-4c52-9b68-38f8ba718c4c', 6480, 'Plan de ahorro', 6, 't', '2026-07-20 16:48:09.250263+00');
INSERT INTO lesson_chapters (id, lesson_id, position_seconds, title, sort_order, is_generated, created_at) VALUES ('c3d35b4f-b93f-4581-8cf0-a6402d7f1936', '84791e7f-da5e-4c52-9b68-38f8ba718c4c', 7200, 'Caso práctico', 7, 't', '2026-07-20 16:48:09.250263+00');
INSERT INTO lesson_chapters (id, lesson_id, position_seconds, title, sort_order, is_generated, created_at) VALUES ('214ede29-f82a-40c8-bcc6-3271fd2b4b93', '91f085f1-8970-4d7d-b8db-e685b62e2d3b', 0, 'Introducción musical', 0, 't', '2026-07-23 15:34:58.964679+00');
INSERT INTO lesson_chapters (id, lesson_id, position_seconds, title, sort_order, is_generated, created_at) VALUES ('dbb2b205-111b-4668-82e0-b2368d576520', '91f085f1-8970-4d7d-b8db-e685b62e2d3b', 180, 'Inicio de la clase', 1, 't', '2026-07-23 15:34:58.964679+00');
INSERT INTO lesson_chapters (id, lesson_id, position_seconds, title, sort_order, is_generated, created_at) VALUES ('1f2345e6-8666-4733-9249-8ef1680f58d8', '91f085f1-8970-4d7d-b8db-e685b62e2d3b', 920, 'IA en asesoría', 2, 't', '2026-07-23 15:34:58.964679+00');
INSERT INTO lesson_chapters (id, lesson_id, position_seconds, title, sort_order, is_generated, created_at) VALUES ('0cb59a4e-b805-4cb5-83d4-45537ea9ed7e', '91f085f1-8970-4d7d-b8db-e685b62e2d3b', 2100, 'Casos de uso', 3, 't', '2026-07-23 15:34:58.964679+00');
INSERT INTO lesson_chapters (id, lesson_id, position_seconds, title, sort_order, is_generated, created_at) VALUES ('7597930b-34e4-4152-95da-45b6fb403f1a', '91f085f1-8970-4d7d-b8db-e685b62e2d3b', 3600, 'Herramientas y procesos', 4, 't', '2026-07-23 15:34:58.964679+00');
INSERT INTO lesson_chapters (id, lesson_id, position_seconds, title, sort_order, is_generated, created_at) VALUES ('295ce995-a47c-49d1-8e6b-8bbc53ae3e70', '91f085f1-8970-4d7d-b8db-e685b62e2d3b', 5400, 'Buenas prácticas', 5, 't', '2026-07-23 15:34:58.964679+00');
INSERT INTO lesson_chapters (id, lesson_id, position_seconds, title, sort_order, is_generated, created_at) VALUES ('90c6426e-ffe4-4da9-b97f-ad8754502a9b', '91f085f1-8970-4d7d-b8db-e685b62e2d3b', 7800, 'Cierre y conclusiones', 6, 't', '2026-07-23 15:34:58.964679+00');
