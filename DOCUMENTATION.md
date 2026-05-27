# Documentación — Capital Academy

> Sistema de documentación viva del proyecto. Gestionado con `docs-bootstrap`.

## Estructura

```
docs/
├── adr/          # Architecture Decision Records
│   └── 0000-template.md
├── devlog/       # Entradas automáticas por sesión de desarrollo
CHANGELOG.md      # Historial de cambios orientado al usuario
DOCUMENTATION.md  # Este archivo
```

## ADRs (Architecture Decision Records)

Cada decisión que afecta arquitectura, dependencias core, modelo de datos, contratos externos o convenciones se documenta en `docs/adr/NNNN-titulo.md` usando el template `0000-template.md`.

### Estados válidos

| Estado | Significado |
|---|---|
| `proposed` | En discusión, aún no implementado |
| `accepted` | Aprobado e implementado (o en implementación) |
| `deprecated` | Reemplazado por otro ADR |
| `superseded` | Otra decisión lo invalida (referencia al nuevo ADR) |

### Convenciones

- Numeración secuencial: `0001`, `0002`, etc.
- Título en kebab-case: `0001-mux-como-video-provider.md`
- Status inicial: `proposed` hasta que se implemente.
- Si un ADR se reemplaza, actualizar status a `superseded by ADR-NNNN`.

## Devlog

Entradas automáticas generadas al cierre de sesión de desarrollo vía hook `SessionEnd`. No escribir manualmente salvo instrucción explícita.

## CHANGELOG

Sigue el formato [Keep a Changelog](https://keepachangelog.com/). Las entradas se proponen por commit y requieren aprobación explícita antes de escribirse.

## Reglas

1. **ADRs antes de código** — si la decisión afecta arquitectura, se documenta primero.
2. **CHANGELOG orientado al lector** — describe impacto, no el commit.
3. **Devlog es automático** — no editarlo manualmente.
4. **Nunca inventar ADRs** — verificar con `ls docs/adr/` antes de citar.
