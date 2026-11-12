# Reporte: ofertas externas en sitio público de Fonda Mexicana

## Objetivo
Adaptar el sitio público para que soporte el catálogo de ofertas externas administrado desde ITM, sin alterar el flujo existente de Comercio.

## Archivos modificados
- `dist/app.js`
- `dist/index.html`
- `dist/tienda.html`
- `dist/detalle.html`
- `dist/carrito.html`
- `dist/mis-pedidos.html`
- `dist/perfil-de-usuario.html`
- `dist/styles.css`

## Comportamiento nuevo
- El sitio consulta `settings.active_catalog_type` desde ITM.
- Comercio conserva pedido, carrito, pedidos y checkout.
- Ofertas externas muestra “Ofertas disponibles”.
- Ofertas externas oculta carrito, pedidos, inventario, métodos de pago, unidades y cantidades.
- Las tarjetas externas usan “Ver producto”.
- El detalle muestra aviso, contacto opcional y CTA externo seguro.
- El CTA acepta únicamente enlaces HTTP/HTTPS y abre con `noopener noreferrer`.
- Las rutas directas a carrito o pedidos redirigen a ofertas cuando el catálogo externo está activo.
- El perfil externo conserva Nombre y WhatsApp; Dirección y Referencia se ocultan sin borrar datos históricos.
- La caché pública se valida por tipo de catálogo para impedir mezclar Comercio y Ofertas externas.
- La moneda se toma de cada producto y se muestra únicamente si el precio es visible.

## Validaciones realizadas
- `node --check dist/app.js`
- `git diff --check`
- Validación de los seis HTML con arranque seguro.
- Validación de enlaces comerciales aislados.
- Validación de CTA externo seguro.
- Validación de caché por catálogo.
- Validación de conservación del perfil.
- Contrato público de ITM confirmado: `active_catalog_type` y `external_catalog`.

## No realizado
- No se modificó Neon, Supabase ni ITM: el contrato necesario ya estaba publicado.
- No se agregó una moneda configurable desde Administrar tienda; el sitio ya soporta la moneda enviada por cada producto.
- No se hizo commit, push ni despliegue de este cambio todavía.
