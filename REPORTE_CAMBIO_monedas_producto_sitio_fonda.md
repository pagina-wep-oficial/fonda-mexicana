# Reporte: presentación de monedas por producto

## Resultado

El sitio público muestra cada precio con la etiqueta pública definida en ITM y no convierte importes.

## Implementación

- Tarjetas, destacados y detalle muestran `importe + etiqueta pública`.
- Las ofertas externas sin precio visible no muestran importe, descuento ni moneda.
- El carrito solo admite productos de una moneda.
- Un carrito histórico mezclado se conserva para retirar productos, pero no permite checkout y muestra total `—`.
- WhatsApp e historial local guardan código y etiqueta como snapshot del pedido.
- Los pedidos de Neon conservan ese snapshot al volver a cargarse en la cuenta del cliente.
- Los reportes muestran subtotales separados por moneda en vez de sumar divisas distintas.

## Validación local

- `node --check dist/app.js`
- `git -c core.whitespace=cr-at-eol diff --check`

## Pendiente al emitir este reporte

Desplegar después de aplicar las migraciones de ITM y realizar la prueba funcional publicada.
