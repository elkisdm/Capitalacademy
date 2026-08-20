# Respaldo en vivo de la grabación: RTMP directo a Mux

> **DIFERIDO — decisión del 2026-08-20.** No se implementa por ahora. El costo real
> (~US$62/mes de encoding que hoy es $0, porque el live de Mux no admite calidad `basic`)
> no se justifica contra la brecha que quedaba abierta: la causa de la pérdida del 19-ago
> —el techo de 50 MB en Storage— ya está corregida y verificada, y la caída del egress ya
> la cubren los segmentos HLS. La spec queda escrita y con los números verificados para
> retomarla si vuelve a perderse una clase o si el volumen cambia.
>
> **Brecha aceptada a sabiendas:** Storage caído por completo durante la subida, y que
> reconstruir una clase desde los segmentos es un rescate manual (el playlist queda sin
> `#EXT-X-ENDLIST` y hay que concatenar los `.ts` a mano).

**Classification**: feat · large · **high risk** (contrato externo + dinero) · unknown → explorado · toca `lib/livekit/`, `lib/mux/`, `lib/classroom/`, `app/api/webhooks/mux/`, `db/migrations/`
**Tier**: 3 — Full

## Goal

Que una clase en vivo quede grabada en Mux **mientras ocurre**, sin pasar por nuestro bucket
ni por la ingesta. Hoy toda la cadena depende de dos pasos que ya fallaron: el MP4 vive en un
disco temporal del contenedor de Egress hasta que la clase termina, y después tiene que subir
entero a Storage — que es exactamente donde se perdió la clase del 19-ago (413 al subir 1,5 GB).
Con RTMP, Mux recibe el video cuadro a cuadro y arma el asset solo.

## Hallazgo que cambia la premisa (leer antes de decidir)

**El streaming en vivo NO está cubierto por la suscripción: se cobra por minuto, y hoy pagamos
$0 por ese mismo minuto.**

La ingesta actual crea los assets con `video_quality: "basic"`
(`lib/classroom/ingest-recording.ts:163`), y en basic **el encoding de Mux es gratis** — solo se
paga almacenamiento. Pero Mux **no permite basic en live streams**: el mínimo es `plus`.

| | Hoy (MP4 → asset basic) | Respaldo RTMP (live → asset plus) |
|---|---|---|
| Encoding, hasta 720p | **$0** | **$0,025 / min** |
| Almacenamiento 720p | $0,0024 / min / mes | $0,0024 / min / mes |
| Entrega | 100.000 min/mes gratis | igual (el respaldo casi no se entrega) |

Volumen real de la plataforma (consulta a `class_sessions`, últimos 4 meses): **13–17 clases y
~2.250–2.820 min al mes**.

- Costo del respaldo en vivo: **~US$56–70 al mes** de encoding que hoy no existe.
- Almacenamiento del asset duplicado: ~US$6 al mes, acumulativo por cada mes que se conserve.
- **~US$62/mes en régimen** para el escenario "segundo respaldo, se conservan los dos".

No es un bloqueo — es una cifra que tienes que aprobar tú, porque contradice el supuesto de
"aprovechemos la suscripción que ya pagamos".

## Qué pasa si el RTMP se corta (lo otro que pediste verificar)

`reconnect_window` de Mux: **60 s por defecto, hasta 1.800 s (30 min)**.

- Reconecta **dentro** de la ventana → sigue el **mismo asset**, sin corte.
- Expira la ventana → Mux **cierra el asset**; una reconexión posterior abre **un asset nuevo**.
  La clase quedaría partida en dos.

Mitigación: `reconnect_window: 1800`. Con eso solo se parte si el corte dura más de media hora,
y en ese caso la clase ya se cayó de verdad. Contrapartida: al terminar la clase, Mux esperaría
esos 30 min antes de cerrar el asset, así que el cierre se pide **explícitamente** con
`POST /live-streams/{id}/complete` cuando la sala se vacía.

## Exploration findings

- **Una sola llamada de egress, tres salidas.** `StartRoomCompositeEgress` acepta `file_outputs`,
  `segment_outputs` y `stream_outputs` a la vez. Se agrega la tercera al request que ya existe
  (`lib/livekit/egress.ts:225`) en vez de lanzar un segundo trabajo: un segundo egress duplicaría
  el render compuesto y la CPU del servidor de Railway, que es el recurso escaso.
- **Independencia real del respaldo** (lo que importa): si el contenedor de egress muere en el
  minuto 100, el MP4 se pierde entero, los segmentos HLS llegan hasta el minuto 100 en el bucket,
  y **Mux ya tiene los 100 minutos transcodificados y listos**, sin subida pendiente. Cubre las
  dos fallas que nos mordieron: la subida final y el disco efímero.
- **La cadena posterior no se toca.** `new_asset_settings` acepta `playback_policies`,
  `generated_subtitles` y `static_renditions`, o sea el asset del respaldo puede nacer
  configurado igual que el de la ingesta. La transcripción, el resumen, los capítulos y el aviso
  al alumno cuelgan de `video.asset.ready`, que llega igual.
- **Cuenta lista**: `GET /video/v1/live-streams` responde 200 con las credenciales de producción
  y hay 0 streams creados. No hay que habilitar nada.
- **El asset del respaldo NO debe publicarse solo.** El webhook de Mux ubica la lección por
  `mux_asset_id` (`app/api/webhooks/mux/route.ts:122`). Si el asset del live entra por ahí sin
  distinguirse, la clase tendría dos repeticiones o la del respaldo pisaría a la buena. El
  respaldo nace desacoplado de la lección y solo se promueve a mano cuando el camino principal
  falla.

## Assumptions made (corrígeme si me equivoco)

- El respaldo es **respaldo**: el camino que publica la repetición sigue siendo el MP4 → ingesta.
  El asset del live queda guardado y se promueve solo si el principal falla.
- 720p, `latency_mode: "standard"`. Nadie mira el RTMP en vivo: es para grabar, no para difundir.
- Va detrás de un interruptor propio (`MUX_LIVE_BACKUP_ENABLED`), separado de
  `LIVEKIT_EGRESS_ENABLED`, para poder apagar el gasto sin apagar la grabación.
- El asset del respaldo se borra cuando la repetición principal queda `ready`, igual que el cron
  ya borra el MP4 y los segmentos. Sin eso el almacenamiento crece para siempre.

## Acceptance criteria

- [ ] Con el interruptor encendido, al arrancar la grabación de una clase se crea un live stream
      en Mux y el egress emite hacia él además de escribir el MP4 y los segmentos.
- [ ] Matar el contenedor del egress a mitad de clase deja en Mux un asset reproducible con todo
      lo transmitido hasta ese momento.
- [ ] Un corte de RTMP menor a 30 min se reanuda en el MISMO asset.
- [ ] Al vaciarse la sala, el live stream se cierra explícitamente y el asset queda disponible sin
      esperar la ventana de reconexión.
- [ ] El asset del respaldo NUNCA se publica solo como repetición de la clase.
- [ ] Con el interruptor apagado, el request al egress es byte por byte el de hoy.
- [ ] Cuando la repetición principal queda `ready`, el asset del respaldo se elimina de Mux.

## Files & routes to touch  (verificado contra el código: sí)

- `lib/mux/live-stream.ts` — **nuevo** — crear / completar / borrar el live stream y su asset;
  devuelve la URL RTMP y la clave.
- `lib/livekit/egress.ts` — modificar — `stream_outputs` opcional en `startRoomComposite`; la
  clave RTMP nunca se registra en un log.
- `lib/classroom/iniciar-grabacion.ts` — modificar — crear el live stream antes del egress y
  guardar sus ids en la fila. Si Mux falla, la grabación arranca IGUAL sin respaldo.
- `db/migrations/0102_respaldo_rtmp.sql` — **nuevo** — `mux_live_stream_id`,
  `mux_live_asset_id`, `live_backup_error` en `session_recordings`.
- `app/api/webhooks/mux/route.ts` — modificar — `video.live_stream.*` y el asset del live, que se
  enlaza a `session_recordings` y NO a `lessons`.
- `app/api/cron/grabaciones/route.ts` — modificar — cerrar streams huérfanos y borrar el asset del
  respaldo cuando la repetición principal está `ready`.
- `lib/livekit/egress-estado.ts` — modificar — estado del respaldo, separado del principal.

## Tests

- `lib/mux/__tests__/live-stream.test.ts` — **nuevo** — creación con `reconnect_window: 1800`,
  cierre explícito, borrado; la clave RTMP no aparece en errores.
- `lib/livekit/__tests__/egress.test.ts` — el payload lleva `stream_outputs` con el interruptor
  encendido y es idéntico al actual con el interruptor apagado.
- `lib/classroom/__tests__/iniciar-grabacion.test.ts` — un fallo de Mux no impide grabar.
- `app/api/webhooks/mux/__tests__/route.test.ts` — el asset del live no se enlaza a una lección.
- `app/api/cron/grabaciones/__tests__/route.test.ts` — limpieza del respaldo al quedar `ready`.
- Cobertura: no baja.
- **Prueba de campo obligatoria** (la lección del 19-ago): una clase real de 2 h con corte
  provocado del egress. Nada de escenarios cortos ni sustitutos locales.

## Out of scope

- Reemplazar la cadena MP4 → ingesta. Esto suma un respaldo, no cambia el camino principal.
- Difundir la clase en vivo a alumnos por Mux (sería otro producto y otro costo de entrega).
- Firmar el playback: sigue vigente la decisión de playback público.

## Tasks

1. Verificar el costo con el usuario y fijar la forma final (bloqueante).
2. `lib/mux/live-stream.ts` + tests.
3. Migración 0102 y estado del respaldo.
4. `stream_outputs` en el cliente de egress + tests.
5. Enlazar el arranque en `iniciar-grabacion.ts`, degradando si Mux falla.
6. Webhook de Mux: aislar el asset del respaldo de la publicación.
7. Cron: cierre y limpieza.
8. Prueba de campo de 2 h con corte provocado.
9. ADR de la enmienda al 0034 + codemap + changelog.
