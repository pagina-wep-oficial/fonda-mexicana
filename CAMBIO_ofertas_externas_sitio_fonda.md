# Cambio: ofertas externas en sitio público de Fonda Mexicana

## Objetivo
Adaptar el sitio público para que lea el tipo activo de tienda desde ITM.

## Alcance
- Comercio: conserva navegación, carrito y pedidos según su modo.
- Ofertas externas: elimina carrito, pedidos, cantidades, entrega y etiquetas de pago.
- Ofertas externas: lista productos, abre detalle, muestra aviso y dirige al enlace configurado.
- Perfil: muestra nombre y WhatsApp; ubicación y referencia no pertenecen al perfil.
- Monedas: se diseñarán por producto para comercio y ofertas externas.

## Publicación
El código se envía al remoto `github` de `pagina-wep-oficial/fonda-mexicana`.
Cloudflare Pages `itm-fonda-mexicana` no tiene integración Git; se publica manualmente desde `dist`.

## Diseño técnico aprobado

### Fuente de verdad
`dist/app.js` obtiene `settings.active_catalog_type` desde la respuesta pública de ITM.
`store-config.json` conserva datos estáticos del proyecto; no decide el tipo de tienda.

### Comercio
Con `active_catalog_type = commerce`, se conserva la navegación, carrito, pedidos y checkout actuales según el modo de tienda recibido desde ITM.

### Ofertas externas
Con `active_catalog_type = external_catalog`:
- La interfaz pública se nombra “Ofertas disponibles”.
- Se ocultan navegación de pedido, carrito y Mis pedidos.
- La tarjeta usa “Ver producto”.
- El detalle usa “Volver a ofertas”, aviso externo y CTA configurado por la tienda.
- El CTA abre la URL validada del producto en una pestaña nueva con `noopener noreferrer`.
- No se solicitan ni muestran inventario, pago, entrega, ubicación, referencia ni tipo de pedido.
- Rutas directas a carrito y pedidos redirigen a tienda con un aviso claro.

### Perfil
El perfil conserva nombre y WhatsApp.
La referencia histórica no se elimina, pero no se muestra ni se edita en Ofertas externas.
Los datos de entrega pertenecen únicamente al checkout de Comercio Completo.

### Seguridad visual
Antes de conocer la configuración pública, los controles exclusivos de Comercio permanecen ocultos.
Si la respuesta no contiene un tipo válido de catálogo, la tienda muestra un error recuperable y no habilita pedidos por error.

### Monedas
La moneda por producto no se implementa en este cambio: requiere una fase propia en ITM, Neon, Administrar tienda y los sitios publicados.

### Fase 3A — Arranque seguro y navegación

El sitio consulta ITM antes de iniciar sus pantallas públicas.

Mientras se determina el tipo activo, los controles comerciales permanecen ocultos.
Si no se puede validar el tipo de catálogo, el sitio muestra un error recuperable y no habilita compras.

Con comercio mantiene Pedir, Carrito y Mis pedidos.
Con ofertas externas muestra únicamente Ofertas y redirige rutas directas de carrito o pedidos a la tienda pública.
Un cambio de tipo recibido en vivo recarga la página para evitar una interfaz mezclada.

### Fase 3B.1 — Datos y tarjetas de ofertas

Los productos públicos conservan `currency`, `external_url` y
`external_price_visible` al llegar desde ITM.

El precio se muestra usando la moneda individual del producto.
Una oferta con precio oculto no muestra precio ni usa un valor falso de cero.

En ofertas externas las tarjetas no muestran existencia, unidad, método de pago
ni botones de carrito; muestran solamente `Ver producto`.
El catálogo comercial conserva su comportamiento previo.

### Fase 3B.2 — Detalle de oferta externa

La página de detalle conserva fotos y video del producto.

En ofertas externas elimina cantidades, inventario, métodos de pago y carrito.
Muestra el precio únicamente si el administrador lo autorizó, el aviso configurado
para la tienda y, opcionalmente, su teléfono de contacto.

El CTA toma exclusivamente `external_url`. Solo acepta HTTP o HTTPS y abre una
pestaña nueva con `noopener noreferrer`; una URL ausente o inválida nunca crea
un enlace activo.

### Fase 3C — Perfil en ofertas externas

En ofertas externas el perfil muestra únicamente Nombre y WhatsApp.

Dirección habitual y Referencia se conservan en ITM para el catálogo comercial,
pero quedan ocultas e inhabilitadas. Al guardar en ofertas externas, el navegador
envía sus valores históricos preservados: nunca los reemplaza por texto vacío.

El menú de perfil no muestra Mis pedidos en ofertas externas.
Comentarios e inicio de sesión continúan disponibles.

### Corrección — Caché separada por catálogo

La caché visual del catálogo usa versión 2.

Solo se restaura si contiene el contrato actual, tiene un tipo válido y coincide
con el tipo de catálogo confirmado por ITM. Una caché antigua o perteneciente al
otro catálogo se ignora y se solicita contenido nuevo al servidor.
