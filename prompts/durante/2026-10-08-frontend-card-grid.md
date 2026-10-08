# Implementación visual del dashboard

Fecha: 2026-10-08. Referencia: `codex/frontend-card-grid`. Herramienta: Codex.
No se redactó información: el prompt no contiene secretos ni datos personales.

## Prompt recibido

PLEASE IMPLEMENT THIS PLAN:
# Mejora visual del dashboard de recordatorios

## Resumen

Ajustar las pantallas de recordatorios y WhatsApp mostradas en las capturas. El trabajo será solo de frontend: tarjetas de tonos pastel, señales claras de urgencia y correcciones de alineación y espaciado.

## Cambios

- Refinar las tarjetas de recordatorios con una estructura consistente para fecha, mensaje, estado, WhatsApp y acción. En **Próximos**, usar rojo pastel si vence en menos de 1 hora, amarillo pastel entre 1 y 24 horas, y verde pastel después de 24 horas. **Disparados** y **Cancelados** tendrán un estilo neutro, sin indicador de urgencia.
- Sustituir “Ver detalle” por un botón con **lápiz** en recordatorios programados. Abrirá directamente el formulario de edición tras consultar la versión actual del recordatorio. Los elementos en proceso, disparados o cancelados mostrarán un ícono de consulta que abrirá el detalle. Cada ícono tendrá nombre accesible y estado de foco visible.
- Corregir la composición de la pantalla de WhatsApp: colocar “Guardar número”, “Desactivar WhatsApp” y “Volver” en una misma zona de acciones que se adapte a móvil. Limitar los estilos de botones al componente correspondiente para evitar márgenes y alineaciones accidentales.
- Ajustar pestañas, tarjetas, paneles y espacios en tamaños de escritorio y móvil, conservando los flujos y contratos existentes.

## Verificación

- Probar los límites de color: menos de 1 hora, exactamente 1 hora, menos de 24 horas y 24 horas o más; comprobar que el color se actualice mientras la lista permanezca abierta.
- Probar que el lápiz abre edición solo si el recordatorio sigue programado y que los demás estados permiten consultar el detalle.
- Revisar visualmente las dos pantallas en escritorio y móvil: acciones alineadas, sin solapamientos ni desplazamiento horizontal. Ejecutar las pruebas web pertinentes y la comprobación de accesibilidad existente.

## Supuestos

- Los colores acordados son **rojo, amarillo y verde**; los umbrales acordados son **1 y 24 horas**.
- El alcance visual se centra en las pantallas de las capturas: lista y detalle de recordatorios y configuración de WhatsApp.
