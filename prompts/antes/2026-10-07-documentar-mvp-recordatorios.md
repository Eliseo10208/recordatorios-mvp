# Etapa antes — Documentar MVP de recordatorios

- Fecha: 7 de octubre de 2026
- Tarea: documentar-mvp-recordatorios
- Herramienta: Codex
- Etapa: antes de editar

## Prompts reales del usuario

> Eh no no, el whats nosotros lo vamos a conectar, en si y ese enviara a todos
> los usuarios en si solo consumiremos el endpoint para enviar el mensaje y el
> numero del usuario que puso para notis

> ajusta lo que haga falta ahi en el archivo md o los md que hagan falta ahi

## Redacciones

La segunda petición incluyó una captura con una ruta local. La ruta no se copia
en este registro porque contiene información del entorno personal y no es
necesaria para explicar la decisión de producto.

## Interpretación revisada

- Existe un único emisor de WhatsApp conectado por el equipo.
- Cada usuario sólo registra un número destino y consentimiento.
- El worker consume un endpoint saliente con, como mínimo, número y mensaje.
- La notificación interna permanece como fuente de verdad.
