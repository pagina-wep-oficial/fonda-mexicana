# Cambio: presentación pública de monedas por producto

## Objetivo
Mostrar precios de productos usando la moneda y etiqueta pública definida para cada producto desde ITM.

## Reglas
- Comercio muestra Precio actual y Precio anterior cuando exista.
- Ofertas externas solo muestra precios cuando el dueño eligió “Mostrar precio al cliente”.
- El formato público es `importe + etiqueta pública`.
- Ejemplos: `150 MX`, `250 pesos mexicanos`.
- Si una oferta no muestra precio, el sitio no muestra importe, descuento ni moneda.
- El sitio no convierte importes ni inventa símbolos monetarios.

### Fase 2F.1 — Precio público por producto

Las tarjetas, destacados y detalle usan `currency_display_label` del producto y muestran el importe como texto público, por ejemplo `150 MXN` o `250 pesos mexicanos`.

El formateador general de pedidos permanece sin cambios en esta fase. El siguiente bloque adaptará carrito, WhatsApp e historial para usar el snapshot de moneda del pedido.

### Fase 2F.2 — Carrito de una sola moneda

El navegador impide agregar a un carrito un producto con otra moneda. Un carrito histórico que ya contenga mezcla queda visible para permitir retirar productos, pero no puede confirmar checkout y su total se muestra como `—`.

La cotización del servidor conserva identidad, código y etiqueta de cada moneda. WhatsApp y el historial local guardan y muestran el snapshot de la única moneda del carrito.

### Fase 2F.3 — Pedidos y reportes por moneda

Cada pedido conserva el código y la etiqueta pública de su moneda al crearse. Las tarjetas de pedido muestran ese snapshot, incluso si después se cambia la etiqueta de la moneda en Administración.

Los resúmenes operativos no suman divisas distintas: cuando el período contiene varias monedas, muestra un subtotal independiente por cada una, separado por `·`.
