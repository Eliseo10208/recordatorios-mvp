# Recordatorios

Aplicación web para programar recordatorios personales. Cada recordatorio crea
un aviso dentro de la app y, de forma opcional, puede generar una notificación
Web Push y una copia por WhatsApp.

WhatsApp funciona con un único emisor conectado y administrado por el equipo.
Los usuarios no conectan sus cuentas: sólo registran el número donde quieren
recibir avisos y aceptan ese canal. Al vencer un recordatorio, el worker envía
al servicio central el número y el mensaje correspondientes.

## Estado

El repositorio se encuentra en fase de especificación y preparación. No se debe
interpretar la presencia de documentación como funcionalidad ya implementada o
desplegada.

## Flujo del MVP

```text
crear recordatorio
  → guardarlo en PostgreSQL
  → worker reclama el vencimiento
  → crear notificación interna
  → intentar Web Push si existe permiso
  → enviar { phone, message } al servicio WhatsApp si el usuario lo activó
```

La notificación interna es la fuente de verdad. Un fallo de Push o WhatsApp no
elimina el recordatorio ni la notificación de la app.

## Stack previsto

- Next.js, React y TypeScript para frontend y BFF.
- FastAPI, Pydantic y Python para API y reglas de negocio.
- PostgreSQL, SQLAlchemy y Alembic para persistencia y migraciones.
- Worker Python durable para programación y entregas.
- Servicio TypeScript/Node.js con Baileys como emisor central de WhatsApp.
- Vercel, Render y Neon como destinos de despliegue.

La aplicación desplegada no utiliza IA, RAG, embeddings ni agentes. La IA se
usa únicamente para apoyar el proceso de desarrollo.

## Documentación

- [Especificación del MVP](docs/specs/MVP_RECORDATORIOS.md)
- [ADR: WhatsApp centralizado](docs/adr/ADR-0001-whatsapp-centralizado.md)
- [Reglas para desarrollo asistido por IA](CLAUDE.md)
- [Registro de prompts y tiempos](prompts/README.md)

## Desarrollo local

Los comandos de instalación y ejecución se añadirán cuando existan los paquetes
web/, api/ y whatsapp/. Hasta entonces no hay una aplicación ejecutable y
no se deben inventar comandos o resultados de pruebas.
