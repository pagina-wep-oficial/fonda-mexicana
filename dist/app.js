const WHATSAPP_NUMBER = "5219996448579";
const GENERIC_IMAGE = "assets/producto-generico.svg";
const CART_KEY = "tiendaPedidosCarrito";
const HISTORY_KEY = "tiendaPedidosHistorial";
const CHECKOUT_DRAFT_KEY = "tiendaPedidosDatosCarrito";
const ORDER_SEQ_KEY = "tiendaPedidosSecuencia";
const ORDER_SEQ_START = 1000;

const ORDER_FLOWS = {
  pickup: [
    { id: "nuevo", label: "Recibido", client: "Pedido recibido" },
    { id: "aceptado", label: "Aceptado", client: "Pedido aceptado" },
    { id: "alistando", label: "Alistando", client: "Estamos alistando tu pedido" },
    { id: "listo", label: "Listo para recoger", client: "Ya puedes pasar a buscarlo" },
    { id: "retirado", label: "Retirado", client: "Pedido retirado" }
  ],
  delivery: [
    { id: "nuevo", label: "Recibido", client: "Pedido recibido" },
    { id: "aceptado", label: "Aceptado", client: "Pedido aceptado" },
    { id: "alistando", label: "Alistando", client: "Estamos alistando tu pedido" },
    { id: "listo", label: "Listo para enviar", client: "Pedido listo para enviar" },
    { id: "asignado", label: "Repartidor asignado", client: "Repartidor asignado" },
    { id: "aceptado-repartidor", label: "Aceptado por repartidor", client: "Tu repartidor va en camino a recoger el pedido" },
    { id: "recogido", label: "Pedido recogido", client: "Pedido recogido" },
    { id: "en-camino", label: "En camino", client: "Tu pedido va en camino" },
    { id: "entregado", label: "Entregado", client: "Pedido entregado" }
  ]
};

const CANCELLED_STATUS = "cancelado";
const LEGACY_STATUS_MAP = { preparando: "alistando" };
const ACTIVE_STATUS_BLOCKERS = ["entregado", "retirado", CANCELLED_STATUS];

const MAP_STYLES = {
  calle: {
    label: "Calle",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, &copy; OpenStreetMap contributors'
  },
  satelite: {
    label: "Satelite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics'
  }
};

const products = [
  {
    id: "tacos-dorados",
    name: "Tacos dorados",
    category: "Comidas",
    price: 120,
    description: "Tortilla envuelta rellena de pollo, carne o zanahoria, con lechuga, tomate, aguacate, crema, queso y salsa de la casa."
  },
  {
    id: "enchiladas-frida",
    name: "Enchiladas D. Frida",
    category: "Comidas",
    price: 125,
    description: "Tortillas rellenas de pollo deshebrado o huevo revuelto, banadas en salsa verde o roja."
  },
  {
    id: "enchiladas-empanizadas",
    name: "Enchiladas empanizadas",
    category: "Comidas",
    price: 135,
    description: "Tortillas rellenas de frijol refrito, banadas en salsa de la casa y servidas con pechuga empanizada."
  },
  {
    id: "enchiladas-suizas",
    name: "Enchiladas suizas",
    category: "Comidas",
    price: 135,
    description: "Tortillas rellenas de pollo, banadas en salsa de la casa, con queso fundido, crema y frijoles."
  },
  {
    id: "pechuga-parmesana",
    name: "Pechuga parmesana",
    category: "Comidas",
    price: 135,
    description: "Pechuga empanizada rellena de jamon y queso, servida con ensalada, arroz o espagueti y sopa del dia."
  },
  {
    id: "chilaquiles-abu",
    name: "Chilaquiles de la Abu",
    category: "Comidas",
    price: 125,
    description: "Tortillas fritas banadas en salsa casera, con queso, crema, cebolla y proteina a elegir."
  },
  {
    id: "fajitas-pollo",
    name: "Fajitas de pollo",
    category: "Comidas",
    price: 125,
    description: "Tiras de pechuga a la plancha con cebolla y pimientos, acompanadas con ensalada, arroz o espagueti."
  },
  {
    id: "chicharron-salsa",
    name: "Chicharron en salsa",
    category: "Comidas",
    price: 125,
    description: "Pedacitos de cascara de chicharron banados en salsa verde o roja, con guarniciones del dia."
  },
  {
    id: "bistec-encebollado",
    name: "Bistec encebollado",
    category: "Comidas",
    price: 130,
    description: "Tiras de carne marinadas con la receta de la casa, servidas con guarniciones."
  },
  {
    id: "pechuga-empanizada",
    name: "Pechuga empanizada",
    category: "Comidas",
    price: 125,
    description: "Pechuga empanizada frita, acompanada con ensalada, arroz o espagueti, frijoles y sopa del dia."
  },
  {
    id: "chiles-nogada",
    name: "Chiles en nogada",
    category: "Especiales",
    price: 220,
    description: "Chile poblano relleno de picadillo de frutas y carne molida, banado en salsa de nuez. Solo en temporada."
  },
  {
    id: "pozole-rojo",
    name: "Pozole rojo",
    category: "Especiales",
    price: 135,
    description: "Caldo de pollo y cerdo estilo Jalisco, con maiz pozolero y guarniciones."
  },
  {
    id: "agua-dia",
    name: "Agua del dia",
    category: "Bebidas",
    price: 35,
    description: "Agua fresca del dia."
  },
  {
    id: "refresco",
    name: "Refresco",
    category: "Bebidas",
    price: 35,
    description: "Refresco para acompanar tu pedido."
  },
  {
    id: "postre-dia",
    name: "Postre",
    category: "Postres",
    price: 35,
    description: "Postre del dia."
  },
  {
    id: "chuleta-hawaiana",
    name: "Chuleta hawaiana",
    category: "Menu de hoy",
    price: 125,
    description: "Platillo del dia con guarniciones. Consulta disponibilidad."
  },
  {
    id: "huevos-rancheros",
    name: "Huevos rancheros",
    category: "Desayunos",
    price: 125,
    description: "Desayuno clasico de la casa."
  },
  {
    id: "huevos-al-gusto",
    name: "Huevos al gusto",
    category: "Desayunos",
    price: 125,
    description: "Con jamon, tocino, salchicha, chorizo o a la mexicana."
  },
  {
    id: "tulancinguenas",
    name: "Tulancinguenas",
    category: "Desayunos",
    price: 125,
    description: "Especialidad para desayuno. Consulta guarniciones del dia."
  },
  {
    id: "sincronizadas",
    name: "Sincronizadas",
    category: "Desayunos",
    price: 125,
    description: "Sincronizadas de jamon y queso."
  },
  {
    id: "molletes",
    name: "Molletes",
    category: "Desayunos",
    price: 125,
    description: "Sencillos o con proteina: jamon, chorizo, pollo o carne asada."
  },
  {
    id: "torta-chilaquiles",
    name: "Torta de chilaquiles",
    category: "Comidas",
    price: 125,
    description: "Con pollo, huevo o carne asada; acompanada con crema, queso y cebolla."
  },
  {
    id: "quesadillas-guiso",
    name: "Quesadillas con guiso",
    category: "Antojitos",
    price: 125,
    description: "Con pollo a la plancha, pollo deshebrado, carne asada, chorizo o quesillo."
  },
  {
    id: "sopes-guiso",
    name: "Sopes",
    category: "Antojitos",
    price: 125,
    description: "Con guiso a elegir, crema, queso y lechuga."
  },
  {
    id: "huaraches-guiso",
    name: "Huaraches",
    category: "Antojitos",
    price: 125,
    description: "Con guiso a elegir, crema, queso y lechuga."
  }
];

const FALLBACK_COORDS = { latitude: 25.6866, longitude: -100.3161 };

const STORE_LOCATION = {
  address: "Fonda Mexicana",
  latitude: 20.99977,
  longitude: -89.624164,
  hours: "Lunes a viernes de 8:00 am a 4:00 pm",
  mapsUrl: "https://www.google.com/maps?cid=15318250857817601893",
  directionsUrl: "https://www.google.com/maps/dir/?api=1&destination=20.999769979845297,-89.62416438649322&travelmode=driving"
};

let activeCategory = "Todos";
let selectedLocationMethod = "address";
let currentGpsLocation = "";
let mapLocation = "";
let mapPicker = null;
let mapMarker = null;
let mapLayer = null;
let mapStyleKey = "calle";
let pendingMapCoords = null;
let calendarCursorDate = new Date();
let selectedReportDate = localDateKey(new Date());

function money(value) {
  return value.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN"
  });
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function orderDateKey(order) {
  return localDateKey(new Date(order.createdAt));
}

function sameMonth(date, target) {
  return date.getFullYear() === target.getFullYear() && date.getMonth() === target.getMonth();
}

function startOfWeek(date) {
  const start = new Date(date);
  const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day);
  start.setHours(0, 0, 0, 0);
  return start;
}

function endOfWeek(date) {
  const end = startOfWeek(date);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function ordersTotal(orders) {
  return orders.reduce((sum, order) => sum + (order.total || 0), 0);
}

function formatShortDate(date) {
  return date.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function locationDisplay(locationText) {
  const urls = String(locationText).match(/https?:\/\/\S+/g) || [];
  const cleanLines = String(locationText)
    .split("\n")
    .map((line) => line.replace(/https?:\/\/\S+/g, "").replace(/\s+-\s*$/, "").replace(/:\s*$/, "").trim())
    .filter((line) => line.toLowerCase() !== "como llegar")
    .filter(Boolean);
  return {
    lines: cleanLines,
    url: urls[urls.length - 1] || ""
  };
}

function locationDisplayHtml(locationText) {
  const location = locationDisplay(locationText);
  const lines = location.lines.length
    ? location.lines.map((line) => `<span>${escapeHtml(line)}</span>`).join("")
    : "<span>Sin ubicacion guardada</span>";
  const link = location.url
    ? `<a href="${escapeHtml(location.url)}" target="_blank" rel="noopener">Abrir ubicacion</a>`
    : "";
  return `<div class="location-display">${lines}${link}</div>`;
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch (error) {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getCart() {
  return readJson(CART_KEY, {});
}

function setCart(cart) {
  writeJson(CART_KEY, cart);
  updateCartCount();
}

function getHistory() {
  return readJson(HISTORY_KEY, []);
}

function setHistory(history) {
  writeJson(HISTORY_KEY, history);
}

function getProduct(id) {
  return products.find((product) => product.id === id);
}

function cartItems() {
  const cart = getCart();
  return Object.entries(cart)
    .map(([id, quantity]) => ({ product: getProduct(id), quantity }))
    .filter((item) => item.product && item.quantity > 0);
}

function cartTotal(items = cartItems()) {
  return items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
}

function orderStatus(order) {
  const rawStatus = LEGACY_STATUS_MAP[order.status] || order.status || "nuevo";
  if (order.shippingType === "Pasar a buscar" && !ORDER_FLOWS.pickup.some((entry) => entry.id === rawStatus)) {
    return rawStatus === "entregado" ? "retirado" : "listo";
  }
  if (order.shippingType !== "Pasar a buscar" && rawStatus === "retirado") {
    return "entregado";
  }
  return rawStatus;
}

function isPickupOrder(order) {
  return order.shippingType === "Pasar a buscar";
}

function orderFlow(order) {
  return isPickupOrder(order) ? ORDER_FLOWS.pickup : ORDER_FLOWS.delivery;
}

function statusIndex(order, status = orderStatus(order)) {
  const flow = orderFlow(order);
  return Math.max(0, flow.findIndex((entry) => entry.id === status));
}

function statusInfo(order, status = orderStatus(order)) {
  if (status === CANCELLED_STATUS) {
    return { id: CANCELLED_STATUS, label: "Cancelado", client: "Tu pedido fue cancelado" };
  }
  const flow = orderFlow(order);
  return flow.find((entry) => entry.id === status) || flow[0];
}

function isActiveOrder(order) {
  return !ACTIVE_STATUS_BLOCKERS.includes(orderStatus(order));
}

function nextOrderStatus(order) {
  const flow = orderFlow(order);
  const index = statusIndex(order);
  return flow[Math.min(index + 1, flow.length - 1)].id;
}

function updateOrder(id, updater) {
  const history = getHistory().map((order) => {
    if (order.id !== id) return order;
    return updater(order);
  });
  setHistory(history);
}

function advanceOrder(id) {
  updateOrder(id, (order) => {
    const previous = orderStatus(order);
    const next = nextOrderStatus(order);
    return {
      ...order,
      status: next,
      updatedAt: new Date().toISOString(),
      events: [
        ...(order.events || []),
        {
          at: new Date().toISOString(),
          text: `Estado cambiado: ${statusInfo(order, previous).label} -> ${statusInfo(order, next).label}`
        }
      ]
    };
  });
}

function cartCount() {
  return cartItems().reduce((sum, item) => sum + item.quantity, 0);
}

function updateCartCount() {
  document.querySelectorAll("[data-cart-count]").forEach((node) => {
    node.textContent = cartCount();
  });
}

function appNavIcon(name) {
  const icons = {
    tienda: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16l-1.3 10H5.3L4 10Z"/><path d="M8 10V8a4 4 0 0 1 8 0v2"/></svg>',
    carrito: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h2l2 9h8l2-6H8"/><path d="M10 20h.01"/><path d="M17 20h.01"/></svg>',
    pedidos: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v16H7z"/><path d="M9.5 8h5"/><path d="M9.5 12h5"/><path d="M9.5 16h3"/></svg>'
  };
  return icons[name] || "";
}

const INTERNAL_PAGES = ["panel-local", "login", "admin", "panel-pedidos", "repartidor"];

function initAppNavigation() {
  if (document.querySelector(".app-nav")) return;
  const page = document.body.dataset.page;
  if (!page || page === "inicio" || INTERNAL_PAGES.includes(page)) return;
  const activePage = page === "carrito" || page === "mis-pedidos" ? page : "tienda";
  const links = [
    { id: "tienda", label: "Pedir", href: "tienda.html", icon: "tienda" },
    { id: "carrito", label: "Carrito", href: "carrito.html", icon: "carrito", badge: true },
    { id: "mis-pedidos", label: "En curso", href: "mis-pedidos.html", icon: "pedidos" }
  ];

  document.body.insertAdjacentHTML(
    "beforeend",
    `<nav class="app-nav" aria-label="Navegacion principal">
      ${links.map((link) => `
        <a class="${activePage === link.id ? "active" : ""}" href="${link.href}" aria-label="${link.label}">
          <span class="app-nav-icon">${appNavIcon(link.icon)}${link.badge ? '<span class="app-nav-badge" data-cart-count>0</span>' : ""}</span>
          <span>${link.label}</span>
        </a>
      `).join("")}
    </nav>`
  );
}

function showToast(message) {
  const toast = document.querySelector("[data-toast]");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 3200);
}

function addToCart(id, quantity = 1) {
  const cart = getCart();
  cart[id] = (cart[id] || 0) + quantity;
  setCart(cart);
  const product = getProduct(id);
  showToast(`${product.name} agregado al carrito`);
}

function setItemQuantity(id, quantity) {
  const cart = getCart();
  if (quantity <= 0) {
    delete cart[id];
  } else {
    cart[id] = quantity;
  }
  setCart(cart);
  renderCart();
}

function removeFromCart(id) {
  const cart = getCart();
  delete cart[id];
  setCart(cart);
  renderCart();
}

function categoryList() {
  return ["Todos", ...new Set(products.map((product) => product.category))];
}

function renderFilters() {
  const holder = document.getElementById("categoryFilters");
  if (!holder) return;
  holder.innerHTML = categoryList()
    .map((category) => `<button class="chip ${category === activeCategory ? "active" : ""}" type="button" data-category="${category}">${category}</button>`)
    .join("");

  holder.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.category;
      renderFilters();
      renderCatalog();
    });
  });
}

function productCard(product) {
  return `
    <article class="product-card">
      <img src="${GENERIC_IMAGE}" alt="${product.name}" loading="lazy">
      <div class="product-body">
        <div class="product-meta">
          <span class="category">${product.category}</span>
          <span class="price">${money(product.price)}</span>
        </div>
        <h2>${product.name}</h2>
        <p>${product.description}</p>
        <div class="product-actions">
          <button class="button primary" type="button" data-add="${product.id}">Agregar</button>
          <a class="button secondary" href="detalle.html?id=${product.id}">Ver detalles</a>
        </div>
      </div>
    </article>
  `;
}

function renderCatalog() {
  const grid = document.getElementById("productGrid");
  if (!grid) return;
  const query = (document.getElementById("searchInput")?.value || "").trim().toLowerCase();
  const filtered = products.filter((product) => {
    const matchesCategory = activeCategory === "Todos" || product.category === activeCategory;
    const matchesSearch = `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  });

  grid.innerHTML = filtered.length
    ? filtered.map(productCard).join("")
    : `<div class="empty-state">No hay productos con ese filtro.</div>`;

  grid.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => addToCart(button.dataset.add));
  });
}

function initCatalog() {
  renderFilters();
  renderCatalog();
  document.getElementById("searchInput")?.addEventListener("input", renderCatalog);
}

function initDetail() {
  const holder = document.getElementById("detailView");
  if (!holder) return;
  const id = new URLSearchParams(window.location.search).get("id");
  const product = getProduct(id) || products[0];
  document.title = `${product.name} | Fonda Mexicana`;
  holder.innerHTML = `
    <div class="detail-media">
      <img src="${GENERIC_IMAGE}" alt="${product.name}">
    </div>
    <div class="detail-copy">
      <p class="section-kicker">${product.category}</p>
      <h1>${product.name}</h1>
      <p>${product.description}</p>
      <strong class="price">${money(product.price)}</strong>
      <div class="detail-quantity">
        <span>Cantidad</span>
        <div class="quantity quantity-input" aria-label="Cantidad para agregar">
          <button type="button" data-detail-minus aria-label="Quitar uno">-</button>
          <input id="detailQuantity" type="number" min="1" step="1" value="1" inputmode="numeric">
          <button type="button" data-detail-plus aria-label="Agregar uno">+</button>
        </div>
      </div>
      <div class="detail-actions">
        <button class="button primary" type="button" data-add="${product.id}">Agregar al carrito</button>
        <a class="button secondary" href="carrito.html">Ir al carrito</a>
      </div>
    </div>
  `;
  const quantityInput = holder.querySelector("#detailQuantity");
  const normalizeQuantity = () => {
    const parsed = Number.parseInt(quantityInput.value, 10);
    const quantity = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    quantityInput.value = quantity;
    return quantity;
  };

  holder.querySelector("[data-detail-minus]")?.addEventListener("click", () => {
    quantityInput.value = Math.max(1, normalizeQuantity() - 1);
  });
  holder.querySelector("[data-detail-plus]")?.addEventListener("click", () => {
    quantityInput.value = normalizeQuantity() + 1;
  });
  quantityInput?.addEventListener("change", normalizeQuantity);
  holder.querySelector("[data-add]")?.addEventListener("click", () => {
    addToCart(product.id, normalizeQuantity());
    quantityInput.value = 1;
  });
}

function renderCart() {
  const holder = document.getElementById("cartItems");
  const total = document.getElementById("cartTotal");
  if (!holder) return;
  const items = cartItems();
  if (total) total.textContent = money(cartTotal(items));

  if (!items.length) {
    holder.innerHTML = `<div class="empty-state">Tu carrito esta vacio. Agrega productos desde la tienda.</div>`;
    return;
  }

  holder.innerHTML = items
    .map(({ product, quantity }) => `
      <article class="cart-item">
        <img src="${GENERIC_IMAGE}" alt="${product.name}">
        <div class="cart-item-main">
          <h2>${product.name}</h2>
          <p>${money(product.price)} c/u</p>
        </div>
        <div class="cart-item-controls">
          <div class="quantity compact" aria-label="Cantidad de ${product.name}">
            <button type="button" data-minus="${product.id}" aria-label="Quitar uno">-</button>
            <span>${quantity}</span>
            <button type="button" data-plus="${product.id}" aria-label="Agregar uno">+</button>
          </div>
          <strong>${money(product.price * quantity)}</strong>
          <button class="remove-icon" type="button" data-remove="${product.id}" aria-label="Quitar ${product.name}">Quitar</button>
        </div>
      </article>
    `)
    .join("");

  holder.querySelectorAll("[data-minus]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = cartItems().find((entry) => entry.product.id === button.dataset.minus);
      setItemQuantity(button.dataset.minus, (item?.quantity || 1) - 1);
    });
  });

  holder.querySelectorAll("[data-plus]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = cartItems().find((entry) => entry.product.id === button.dataset.plus);
      setItemQuantity(button.dataset.plus, (item?.quantity || 0) + 1);
    });
  });

  holder.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => removeFromCart(button.dataset.remove));
  });
}

function buildWhatsAppMessage(orderId, customerName, locationText, shippingType, items, paymentLabel) {
  const location = formatLocationForMessage(locationText, shippingType);
  const productLines = items.flatMap((item) => [
    `• ${item.quantity} x ${item.product.name}`,
    `  ${money(item.product.price)} c/u = *${money(item.product.price * item.quantity)}*`
  ]);

  const lines = [
    "*FONDA MEXICANA*",
    `*Nuevo pedido ${orderId}*`,
    "",
    "━━━━━━━━━━━━━━",
    "",
    "*Cliente:*",
    customerName,
    "",
    "*Tipo de envio:*",
    shippingType,
    "",
    "━━━━━━━━━━━━━━",
    "",
    "*Productos:*",
    ...productLines,
    "",
    "━━━━━━━━━━━━━━",
    "",
    "*Total:*",
    `*${money(cartTotal(items))}*`,
    "",
    "*Pago:*",
    paymentLabel,
    "",
    "━━━━━━━━━━━━━━",
    "",
    ...location,
    "",
    "━━━━━━━━━━━━━━",
    "",
    "Pedido enviado desde la pagina web."
  ];
  return lines.join("\n");
}

function makeDeliveryCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function makeOrderId() {
  const stored = readJson(ORDER_SEQ_KEY, null);
  const current = typeof stored === "number" && stored >= ORDER_SEQ_START ? stored : ORDER_SEQ_START;
  const next = current + 1;
  writeJson(ORDER_SEQ_KEY, next);
  return `PED-${next}`;
}

function saveOrder(orderId, customerName, locationText, shippingType, items, message, paymentMethod, paymentStatus) {
  const order = {
    id: orderId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    customerName,
    locationText,
    shippingType,
    status: "nuevo",
    paymentMethod,
    paymentStatus,
    deliveryCode: makeDeliveryCode(),
    total: cartTotal(items),
    message,
    events: [
      {
        at: new Date().toISOString(),
        text: "Pedido creado por el cliente"
      }
    ],
    items: items.map((item) => ({
      id: item.product.id,
      name: item.product.name,
      price: item.product.price,
      quantity: item.quantity
    }))
  };
  setHistory([order, ...getHistory()].slice(0, 30));
}

function formatCoords(latitude, longitude) {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

function mapsLink(latitude, longitude) {
  return `https://maps.google.com/?q=${latitude},${longitude}`;
}

function splitLocationText(locationText) {
  const lines = String(locationText)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const mapsUrl = (String(locationText).match(/https?:\/\/\S+/g) || [])[0] || "";
  const cleanLines = lines
    .map((line) => line.replace(/https?:\/\/\S+/g, "").replace(/\s+-\s*$/, "").trim())
    .filter(Boolean);
  const referenceLine = cleanLines.find((line) => line.toLowerCase().startsWith("referencia:")) || "";
  const addressLines = cleanLines.filter((line) => line !== referenceLine);
  return {
    address: addressLines.join("\n"),
    reference: referenceLine.replace(/^referencia:\s*/i, "").trim(),
    mapsUrl
  };
}

function formatLocationForMessage(locationText, shippingType) {
  if (shippingType !== "Entrega a domicilio") {
    return [
      "*Recoger en:*",
      STORE_LOCATION.address,
      "",
      "*Horario:*",
      STORE_LOCATION.hours,
      "",
      "*Como llegar:*",
      STORE_LOCATION.directionsUrl
    ];
  }

  const location = splitLocationText(locationText);
  const lines = [
    "*Direccion de entrega:*",
    location.address || "Direccion no especificada"
  ];

  if (location.reference) {
    lines.push("", "*Referencia:*", location.reference);
  }

  if (location.mapsUrl) {
    lines.push("", "*Ubicacion en Google Maps:*", location.mapsUrl);
  }

  return lines;
}

function setMapPreview(coords) {
  const preview = document.getElementById("mapPreview");
  if (!coords) {
    preview.classList.remove("show");
    return;
  }
  const text = formatCoords(coords.latitude, coords.longitude);
  document.getElementById("mapPreviewText").textContent = text;
  document.getElementById("mapPreviewLink").href = mapsLink(coords.latitude, coords.longitude);
  preview.classList.add("show");
}

function setGpsPreview(coords) {
  const preview = document.getElementById("gpsPreview");
  if (!coords) {
    preview.classList.remove("show");
    return;
  }
  document.getElementById("gpsPreviewText").textContent = formatCoords(coords.latitude, coords.longitude);
  document.getElementById("gpsPreviewLink").href = mapsLink(coords.latitude, coords.longitude);
  preview.classList.add("show");
}

function clearGpsLocation() {
  currentGpsLocation = "";
  setGpsPreview(null);
}

function clearMapLocation() {
  mapLocation = "";
  setMapPreview(null);
}

function selectedLocationText() {
  const manualLocation = document.getElementById("manualLocation")?.value.trim() || "";
  if (selectedLocationMethod === "gps") return currentGpsLocation;
  if (selectedLocationMethod === "map") return mapLocation;
  return manualLocation;
}

function locationMethodLabel() {
  if (selectedLocationMethod === "gps") return "Ubicacion GPS";
  if (selectedLocationMethod === "map") return "Punto del mapa";
  return "Direccion escrita";
}

function formatLocationWithNotes(locationText, notes) {
  return notes ? `${locationText}\nReferencia: ${notes}` : locationText;
}

function updateLocationStatus() {
  const status = document.getElementById("locationStatus");
  if (!status) return;

  const locationText = selectedLocationText();
  if (locationText) {
    status.textContent = `${locationMethodLabel()} lista.`;
    return;
  }

  if (selectedLocationMethod === "gps") {
    status.textContent = "Detecta tu ubicacion para usar GPS.";
  } else if (selectedLocationMethod === "map") {
    status.textContent = "Elige un punto en el mapa.";
  } else {
    status.textContent = "";
  }
}

function updateLocationPanels() {
  document.querySelectorAll("[data-location-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.locationPanel === selectedLocationMethod);
  });
}

function setLocationMethod(method, options = {}) {
  selectedLocationMethod = method;
  document.querySelectorAll("input[name='locationMethod']").forEach((input) => {
    input.checked = input.value === method;
  });
  updateLocationPanels();

  if (method !== "gps") clearGpsLocation();
  if (method !== "map") clearMapLocation();
  if (method !== "address" && options.clearAddress) {
    const manualInput = document.getElementById("manualLocation");
    if (manualInput) manualInput.value = "";
  }

  updateLocationStatus();
}

function requestUserCoords() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

function pinIcon() {
  return L.divIcon({
    className: "map-pin",
    html: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="30" height="40"><path d="M16 41C16 41 30 24.5 30 15A14 14 0 1 0 2 15c0 9.5 14 26 14 26Z" fill="#e0413e" stroke="#fff" stroke-width="2.5"/><circle cx="16" cy="15" r="5.4" fill="#fff"/></svg>',
    iconSize: [30, 40],
    iconAnchor: [15, 40],
    popupAnchor: [0, -38]
  });
}

function buildMapLayer() {
  const style = MAP_STYLES[mapStyleKey];
  mapLayer = L.tileLayer(style.url, {
    maxZoom: 19,
    attribution: style.attribution
  });
}

function setMapStyle(key) {
  if (!MAP_STYLES[key] || key === mapStyleKey) return;
  mapStyleKey = key;
  if (!mapPicker || !mapLayer) return;

  const next = L.tileLayer(MAP_STYLES[key].url, {
    maxZoom: 19,
    attribution: MAP_STYLES[key].attribution
  });
  next.addTo(mapPicker);
  next.bringToBack();
  mapLayer.remove();
  mapLayer = next;

  document.querySelectorAll("#mapStyleSwitch button").forEach((button) => {
    button.classList.toggle("active", button.dataset.style === key);
  });
}

function openMapPicker() {
  const modal = document.getElementById("mapModal");
  if (typeof L === "undefined") {
    showToast("El mapa no se pudo cargar. Revisa tu conexion.");
    return;
  }

  modal.classList.add("open");
  const status = document.getElementById("mapModalStatus");
  status.textContent = "Buscando tu ubicacion...";

  requestUserCoords().then((userCoords) => {
    const start = userCoords || FALLBACK_COORDS;
    if (!userCoords) {
      status.textContent = "No detectamos tu ubicacion. Toca el mapa para colocar el pin.";
    }

    if (!mapPicker) {
      mapPicker = L.map("mapPicker", { zoomControl: true }).setView([start.latitude, start.longitude], 17);
      buildMapLayer();
      mapLayer.addTo(mapPicker);
    }

    mapPicker.setView([start.latitude, start.longitude], 17);
    setTimeout(() => mapPicker.invalidateSize(), 60);

    if (!mapMarker) {
      mapMarker = L.marker([start.latitude, start.longitude], { draggable: true, icon: pinIcon() }).addTo(mapPicker);
      mapMarker.on("dragend", () => {
        const { lat, lng } = mapMarker.getLatLng();
        pendingMapCoords = { latitude: lat, longitude: lng };
        status.textContent = `Punto: ${formatCoords(lat, lng)}`;
      });
      mapPicker.on("click", (event) => {
        mapMarker.setLatLng(event.latlng);
        const { lat, lng } = event.latlng;
        pendingMapCoords = { latitude: lat, longitude: lng };
        status.textContent = `Punto: ${formatCoords(lat, lng)}`;
      });
    }

    mapMarker.setLatLng([start.latitude, start.longitude]);
    pendingMapCoords = { latitude: start.latitude, longitude: start.longitude };
    status.textContent = `Punto: ${formatCoords(start.latitude, start.longitude)}`;
  });
}

function closeMapPicker() {
  document.getElementById("mapModal").classList.remove("open");
  pendingMapCoords = null;
}

function applyShippingMode() {
  const shippingType = document.querySelector("input[name='shippingType']:checked")?.value || "Entrega a domicilio";
  const isDelivery = shippingType === "Entrega a domicilio";
  document.getElementById("deliveryPanel").hidden = !isDelivery;
  document.getElementById("pickupPanel").hidden = isDelivery;
}

function checkoutDraft() {
  return {
    customerName: document.getElementById("customerName")?.value || "",
    shippingType: document.querySelector("input[name='shippingType']:checked")?.value || "Entrega a domicilio",
    locationMethod: selectedLocationMethod,
    manualLocation: document.getElementById("manualLocation")?.value || "",
    deliveryNotes: document.getElementById("deliveryNotes")?.value || "",
    currentGpsLocation,
    mapLocation
  };
}

function saveCheckoutDraft() {
  if (!document.getElementById("checkoutForm")) return;
  writeJson(CHECKOUT_DRAFT_KEY, checkoutDraft());
}

function restoreCheckoutDraft() {
  const draft = readJson(CHECKOUT_DRAFT_KEY, null);
  if (!draft) return;

  const nameInput = document.getElementById("customerName");
  const manualInput = document.getElementById("manualLocation");
  const notesInput = document.getElementById("deliveryNotes");

  if (nameInput) nameInput.value = draft.customerName || "";
  if (manualInput) manualInput.value = draft.manualLocation || "";
  if (notesInput) notesInput.value = draft.deliveryNotes || "";

  document.querySelectorAll("input[name='shippingType']").forEach((input) => {
    input.checked = input.value === (draft.shippingType || "Entrega a domicilio");
  });

  currentGpsLocation = draft.currentGpsLocation || "";
  mapLocation = draft.mapLocation || "";
  setLocationMethod(draft.locationMethod || "address");
  applyShippingMode();
}

function clearCheckoutDraft() {
  localStorage.removeItem(CHECKOUT_DRAFT_KEY);
}

function setLocationLoading(isLoading) {
  document.getElementById("locationLoading")?.classList.toggle("show", isLoading);
}

function initCart() {
  renderCart();

  document.getElementById("storeDirectionsLink").href =
    STORE_LOCATION.directionsUrl;
  applyShippingMode();
  setLocationMethod(selectedLocationMethod);
  restoreCheckoutDraft();

  document.getElementById("clearCartBtn")?.addEventListener("click", () => {
    setCart({});
    renderCart();
    showToast("Carrito limpiado");
  });

  document.getElementById("detectLocationBtn")?.addEventListener("click", () => {
    const status = document.getElementById("locationStatus");
    if (!navigator.geolocation) {
      status.textContent = "Tu navegador no permite detectar ubicacion.";
      return;
    }
    status.textContent = "Buscando ubicacion...";
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationLoading(false);
        const { latitude, longitude } = position.coords;
        currentGpsLocation = `Ubicacion precisa del cliente\n${mapsLink(latitude, longitude)}`;
        setGpsPreview({ latitude, longitude });
        setLocationMethod("gps", { clearAddress: true });
        saveCheckoutDraft();
      },
      () => {
        setLocationLoading(false);
        status.textContent = "No se pudo obtener la ubicacion. Escribe la direccion manual.";
        setLocationMethod("address");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  document.getElementById("openMapBtn")?.addEventListener("click", () => {
    openMapPicker();
  });
  document.getElementById("mapStyleSwitch")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-style]");
    if (button) setMapStyle(button.dataset.style);
  });
  document.getElementById("cancelMapBtn")?.addEventListener("click", closeMapPicker);
  document.getElementById("mapModal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeMapPicker();
  });
  document.getElementById("clearGpsBtn")?.addEventListener("click", () => {
    clearGpsLocation();
    setLocationMethod("address");
    saveCheckoutDraft();
    showToast("Ubicacion GPS eliminada");
  });
  document.getElementById("clearMapBtn")?.addEventListener("click", () => {
    clearMapLocation();
    setLocationMethod("address");
    saveCheckoutDraft();
    showToast("Punto del mapa eliminado");
  });
  document.getElementById("confirmMapBtn")?.addEventListener("click", () => {
    if (!pendingMapCoords) {
      showToast("Toca el mapa para colocar el pin");
      return;
    }
    const { latitude, longitude } = pendingMapCoords;
    mapLocation = `Punto elegido por el cliente\n${mapsLink(latitude, longitude)}`;
    setMapPreview(pendingMapCoords);
    setLocationMethod("map", { clearAddress: true });
    saveCheckoutDraft();
    closeMapPicker();
    showToast("Punto del mapa guardado");
  });

  document.getElementById("checkoutForm")?.addEventListener("change", (event) => {
    if (event.target.name === "shippingType") applyShippingMode();
    if (event.target.name === "locationMethod") setLocationMethod(event.target.value, { clearAddress: event.target.value !== "address" });
    saveCheckoutDraft();
  });
  document.getElementById("manualLocation")?.addEventListener("input", (event) => {
    if (event.target.value.trim()) {
      setLocationMethod("address");
    } else {
      updateLocationStatus();
    }
    saveCheckoutDraft();
  });
  document.getElementById("customerName")?.addEventListener("input", saveCheckoutDraft);
  document.getElementById("deliveryNotes")?.addEventListener("input", saveCheckoutDraft);
  document.getElementById("checkoutForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const items = cartItems();
    if (!items.length) {
      showToast("Agrega productos antes de pedir");
      return;
    }

    const customerName = document.getElementById("customerName").value.trim();
    const shippingType = document.querySelector("input[name='shippingType']:checked")?.value || "Entrega a domicilio";
    const paymentMethod = "whatsapp";
    const isDelivery = shippingType === "Entrega a domicilio";
    const deliveryNotes = document.getElementById("deliveryNotes").value.trim();
    const deliveryLocation = selectedLocationText();
    const locationText = isDelivery
      ? formatLocationWithNotes(deliveryLocation, deliveryNotes)
      : `Pasar a buscar en tienda: ${STORE_LOCATION.address}\nHorario: ${STORE_LOCATION.hours}\nComo llegar: ${STORE_LOCATION.directionsUrl}`;

    if (!customerName) {
      showToast("Escribe el nombre del cliente");
      return;
    }
    if (isDelivery && !deliveryLocation) {
      showToast("Agrega ubicacion o direccion");
      return;
    }
    if (isDelivery && selectedLocationMethod !== "address" && !deliveryNotes) {
      showToast("Agrega direccion o referencia para ubicarte");
      return;
    }

    const paymentStatus = "Pago por confirmar por WhatsApp";
    const paymentLabel = "Por confirmar por WhatsApp";

    const orderId = makeOrderId();
    const message = buildWhatsAppMessage(orderId, customerName, locationText, shippingType, items, paymentLabel);
    saveOrder(orderId, customerName, locationText, shippingType, items, message, paymentMethod, paymentStatus);
    setCart({});
    clearCheckoutDraft();
    renderCart();
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
  });
}

function renderHistory() {
  const holder = document.getElementById("historyList");
  const currentHolder = document.getElementById("currentOrders");
  if (!holder && !currentHolder) return;
  const history = getHistory();
  const activeOrders = history.filter(isActiveOrder);

  if (currentHolder) {
    currentHolder.innerHTML = activeOrders.length
      ? activeOrders.map(currentOrderCard).join("")
      : `<div class="empty-state">No hay pedidos en curso en este navegador.</div>`;
  }

  if (!holder) return;
  if (!history.length) {
    holder.innerHTML = `<div class="empty-state">Aun no hay pedidos guardados en este navegador.</div>`;
    return;
  }

  holder.innerHTML = history
    .map((order) => {
      const created = new Date(order.createdAt).toLocaleString("es-MX");
      const items = order.items.map((item) => `<li>${item.quantity} x ${escapeHtml(item.name)} <strong>${money(item.price * item.quantity)}</strong></li>`).join("");
      const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
      const status = statusInfo(order);
      return `
        <details class="history-card">
          <summary>
            <span>
              <small>${order.id}</small>
              <strong>${escapeHtml(order.customerName)}</strong>
              <em>${created} · ${status.label}</em>
            </span>
            <span class="history-total">${money(order.total)}</span>
          </summary>
          <div class="history-detail">
            <p>${escapeHtml(order.shippingType)} · ${itemCount} producto${itemCount === 1 ? "" : "s"}</p>
            <p><strong>Pago:</strong> ${escapeHtml(order.paymentStatus || "Pago por confirmar")}</p>
            <ul>${items}</ul>
            <div>
              <strong>Ubicacion</strong>
              ${locationDisplayHtml(order.locationText)}
            </div>
          </div>
        </details>
      `;
    })
    .join("");
}

function timelineHtml(order) {
  const flow = orderFlow(order);
  const current = statusIndex(order);
  return `
    <ol class="status-timeline">
      ${flow.map((step, index) => `
        <li class="${index < current ? "done" : ""} ${index === current ? "current" : ""}">
          <span></span>
          <small>${step.label}</small>
        </li>
      `).join("")}
    </ol>
  `;
}

function isWhatsappOrder(order) {
  return order.paymentMethod === "whatsapp";
}

function whatsappChatUrl(order) {
  const text = `Hola, ¿cómo va mi pedido? (${order.id})`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

function whatsappOrderCard(order) {
  const created = new Date(order.createdAt).toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const items = order.items
    .map((item) => `<li>${item.quantity} x ${escapeHtml(item.name)} <strong>${money(item.price * item.quantity)}</strong></li>`)
    .join("");

  return `
    <article class="current-order-card whatsapp-order">
      <div class="current-order-head">
        <div>
          <p class="section-kicker">Pedido hecho</p>
          <h2>Enviado por WhatsApp</h2>
          <p>${escapeHtml(order.customerName)} · ${created}</p>
        </div>
        <strong>${money(order.total)}</strong>
      </div>

      <p class="whatsapp-order-note">
        Ahi te confirmamos precio, tiempo y entrega. Si cambias de opinion, escríbenos.
      </p>

      <ul class="whatsapp-order-items">${items}</ul>

      <div class="whatsapp-order-foot">
        <a class="button whatsapp full" href="${escapeHtml(whatsappChatUrl(order))}" target="_blank" rel="noopener">
          Abrir chat de WhatsApp
        </a>
        <p class="muted">${itemCount} producto${itemCount === 1 ? "" : "s"} · ${escapeHtml(order.shippingType)}</p>
      </div>
    </article>
  `;
}

function currentOrderCard(order) {
  if (isWhatsappOrder(order)) return whatsappOrderCard(order);

  const created = new Date(order.createdAt).toLocaleString("es-MX");
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const status = statusInfo(order);
  return `
    <article class="current-order-card">
      <div class="current-order-head">
        <div>
          <p class="section-kicker">${escapeHtml(order.id)}</p>
          <h2>${escapeHtml(status.client)}</h2>
          <p>${escapeHtml(order.customerName)} · ${created}</p>
        </div>
        <strong>${money(order.total)}</strong>
      </div>
      ${timelineHtml(order)}
      ${!isPickupOrder(order) && order.deliveryCode && isActiveOrder(order) ? `
        <div class="client-code">
          <span>Codigo de entrega</span>
          <strong>${escapeHtml(order.deliveryCode)}</strong>
          <small>Muestraselo al repartidor cuando te lo pida.</small>
        </div>
      ` : ""}
      <div class="current-order-grid">
        <span>${itemCount} producto${itemCount === 1 ? "" : "s"}</span>
        <span>${escapeHtml(order.shippingType)}</span>
        <span>${escapeHtml(order.paymentStatus || "Pago por confirmar")}</span>
      </div>
    </article>
  `;
}

function initHistory() {
  renderHistory();
  document.getElementById("clearHistoryBtn")?.addEventListener("click", () => {
    setHistory([]);
    renderHistory();
  });
}

function localOrderCard(order) {
  const items = order.items.map((item) => `<li>${item.quantity} x ${escapeHtml(item.name)}</li>`).join("");
  const status = statusInfo(order);
  const canAdvance = isActiveOrder(order);
  return `
    <article class="local-order-card">
      <div class="local-order-head">
        <div>
          <small>${escapeHtml(order.id)}</small>
          <h3>${escapeHtml(order.customerName)}</h3>
          <p>${escapeHtml(order.shippingType)} · ${escapeHtml(order.paymentStatus || "Pago por confirmar")}</p>
        </div>
        <strong>${money(order.total)}</strong>
      </div>
      <ul>${items}</ul>
      <div>
        <strong>Ubicacion</strong>
        ${locationDisplayHtml(order.locationText)}
      </div>
      <div class="local-order-actions">
        <span>${escapeHtml(status.label)}</span>
        ${canAdvance ? `<button class="button primary" type="button" data-advance-order="${escapeHtml(order.id)}">Avanzar</button>` : ""}
      </div>
    </article>
  `;
}

function compactWorkCard(order) {
  const status = statusInfo(order);
  const next = canAdvanceLabel(order);
  return `
    <article class="work-card">
      <div>
        <small>${escapeHtml(order.id)} · ${escapeHtml(order.shippingType)}</small>
        <h3>${escapeHtml(order.customerName)}</h3>
        <p>${escapeHtml(status.label)} · ${money(order.total)}</p>
      </div>
      ${next ? `<button class="button primary small" type="button" data-advance-order="${escapeHtml(order.id)}">${next}</button>` : ""}
    </article>
  `;
}

function canAdvanceLabel(order) {
  if (!isActiveOrder(order)) return "";
  const next = statusInfo({ ...order, status: nextOrderStatus(order) });
  return `Pasar a ${next.label}`;
}

function renderLocalStats(history) {
  const holder = document.getElementById("localStats");
  if (!holder) return;
  const todayKey = localDateKey(new Date());
  const todayOrders = history.filter((order) => orderDateKey(order) === todayKey);
  const activeOrders = history.filter(isActiveOrder);
  const deliveryActive = activeOrders.filter((order) => !isPickupOrder(order));
  const pickupActive = activeOrders.filter(isPickupOrder);

  holder.innerHTML = `
    <article>
      <span>Pedidos hoy</span>
      <strong>${todayOrders.length}</strong>
      <small>${money(ordersTotal(todayOrders))}</small>
    </article>
    <article>
      <span>Activos</span>
      <strong>${activeOrders.length}</strong>
      <small>${money(ordersTotal(activeOrders))}</small>
    </article>
    <article>
      <span>Domicilio activo</span>
      <strong>${deliveryActive.length}</strong>
      <small>${money(ordersTotal(deliveryActive))}</small>
    </article>
    <article>
      <span>Por recoger</span>
      <strong>${pickupActive.length}</strong>
      <small>${money(ordersTotal(pickupActive))}</small>
    </article>
  `;
}

function renderWorkQueue(history) {
  const holder = document.getElementById("workQueue");
  if (!holder) return;
  const activeOrders = history
    .filter(isActiveOrder)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  holder.innerHTML = `
    <div class="panel-section-title">
      <div>
        <p class="section-kicker">Fila de trabajo</p>
        <h2>Todo lo activo</h2>
      </div>
      <span>${activeOrders.length}</span>
    </div>
    <div class="work-list">
      ${activeOrders.length ? activeOrders.map(compactWorkCard).join("") : `<div class="empty-state">No hay pedidos activos.</div>`}
    </div>
  `;
}

function periodStats(history, selectedDate) {
  const selectedKey = localDateKey(selectedDate);
  const weekStart = startOfWeek(selectedDate);
  const weekEnd = endOfWeek(selectedDate);
  const dayOrders = history.filter((order) => orderDateKey(order) === selectedKey);
  const weekOrders = history.filter((order) => {
    const created = new Date(order.createdAt);
    return created >= weekStart && created <= weekEnd;
  });
  const monthOrders = history.filter((order) => sameMonth(new Date(order.createdAt), selectedDate));
  return { dayOrders, weekOrders, monthOrders, weekStart, weekEnd };
}

function renderCalendar(history) {
  const grid = document.getElementById("calendarGrid");
  const title = document.getElementById("calendarTitle");
  if (!grid || !title) return;

  const year = calendarCursorDate.getFullYear();
  const month = calendarCursorDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const monthOrders = history.filter((order) => sameMonth(new Date(order.createdAt), firstDay));
  const ordersByDay = monthOrders.reduce((days, order) => {
    const key = orderDateKey(order);
    days[key] = [...(days[key] || []), order];
    return days;
  }, {});

  title.textContent = firstDay.toLocaleDateString("es-MX", {
    month: "long",
    year: "numeric"
  });

  const headers = ["L", "M", "M", "J", "V", "S", "D"].map((day) => `<strong>${day}</strong>`);
  const blanks = Array.from({ length: startOffset }, () => `<span class="calendar-empty"></span>`);
  const days = Array.from({ length: lastDay.getDate() }, (_, index) => {
    const date = new Date(year, month, index + 1);
    const key = localDateKey(date);
    const orders = ordersByDay[key] || [];
    return `
      <button class="${key === selectedReportDate ? "selected" : ""} ${orders.length ? "has-orders" : ""}" type="button" data-select-day="${key}">
        <span>${index + 1}</span>
        <small>${orders.length ? `${orders.length} · ${money(ordersTotal(orders))}` : ""}</small>
      </button>
    `;
  });

  grid.innerHTML = [...headers, ...blanks, ...days].join("");
  grid.querySelectorAll("[data-select-day]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedReportDate = button.dataset.selectDay;
      renderCalendar(history);
      renderDayReport(history);
    });
  });
}

function reportOrderRow(order) {
  const status = statusInfo(order);
  const items = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return `
    <article class="report-order-row">
      <div>
        <strong>${escapeHtml(order.customerName)}</strong>
        <span>${escapeHtml(order.id)} · ${escapeHtml(order.shippingType)} · ${escapeHtml(status.label)}</span>
      </div>
      <small>${items} producto${items === 1 ? "" : "s"}</small>
      <b>${money(order.total)}</b>
    </article>
  `;
}

function renderDayReport(history) {
  const holder = document.getElementById("dayReport");
  if (!holder) return;
  const selectedDate = dateFromKey(selectedReportDate);
  const { dayOrders, weekOrders, monthOrders, weekStart, weekEnd } = periodStats(history, selectedDate);
  const dayCount = document.getElementById("selectedDayCount");
  if (dayCount) dayCount.textContent = dayOrders.length;

  holder.innerHTML = `
    <div class="day-report-head">
      <p class="section-kicker">Dia seleccionado</p>
      <h3>${formatShortDate(selectedDate)}</h3>
    </div>
    <div class="report-stats">
      <article>
        <span>Dia</span>
        <strong>${dayOrders.length}</strong>
        <small>${money(ordersTotal(dayOrders))}</small>
      </article>
      <article>
        <span>Semana</span>
        <strong>${weekOrders.length}</strong>
        <small>${formatShortDate(weekStart)} - ${formatShortDate(weekEnd)}</small>
        <small>${money(ordersTotal(weekOrders))}</small>
      </article>
      <article>
        <span>Mes</span>
        <strong>${monthOrders.length}</strong>
        <small>${money(ordersTotal(monthOrders))}</small>
      </article>
    </div>
    <div class="report-orders">
      ${dayOrders.length ? dayOrders.map(reportOrderRow).join("") : `<div class="empty-state">No hay pedidos este dia.</div>`}
    </div>
  `;
}

function bindPanelControls() {
  document.querySelectorAll("[data-advance-order]").forEach((button) => {
    button.addEventListener("click", () => {
      advanceOrder(button.dataset.advanceOrder);
      renderLocalPanel();
      showToast("Estado actualizado");
    });
  });
}

function initLocalPanel() {
  document.getElementById("prevMonthBtn")?.addEventListener("click", () => {
    calendarCursorDate = new Date(calendarCursorDate.getFullYear(), calendarCursorDate.getMonth() - 1, 1);
    renderLocalPanel();
  });
  document.getElementById("nextMonthBtn")?.addEventListener("click", () => {
    calendarCursorDate = new Date(calendarCursorDate.getFullYear(), calendarCursorDate.getMonth() + 1, 1);
    renderLocalPanel();
  });
  renderLocalPanel();
}

function renderLocalPanel() {
  const holder = document.getElementById("localOrdersBoard");
  const history = getHistory();
  renderLocalStats(history);
  renderWorkQueue(history);
  renderCalendar(history);
  renderDayReport(history);
  if (!holder) return;

  const sections = [
    { title: "Entrega a domicilio", flow: ORDER_FLOWS.delivery.slice(0, -1), orders: history.filter((order) => !isPickupOrder(order) && isActiveOrder(order)) },
    { title: "Pasar a buscar", flow: ORDER_FLOWS.pickup.slice(0, -1), orders: history.filter((order) => isPickupOrder(order) && isActiveOrder(order)) }
  ];

  holder.innerHTML = sections.map((section) => `
    <section class="panel-section">
      <div class="panel-section-title">
        <h2>${section.title}</h2>
        <span>${section.orders.length}</span>
      </div>
      <div class="panel-columns">
        ${section.flow.map((status) => {
          const orders = section.orders.filter((order) => orderStatus(order) === status.id);
          return `
            <section class="panel-column">
              <div class="panel-column-title">
                <h2>${status.label}</h2>
                <span>${orders.length}</span>
              </div>
              ${orders.length ? orders.map(localOrderCard).join("") : `<p class="muted">Sin pedidos.</p>`}
            </section>
          `;
        }).join("")}
      </div>
    </section>
  `).join("");

  bindPanelControls();
}

const page = document.body.dataset.page;
initAppNavigation();
updateCartCount();
if (page === "tienda") initCatalog();
if (page === "detalle") initDetail();
if (page === "carrito") initCart();
if (page === "mis-pedidos") initHistory();
if (page === "panel-local") initLocalPanel();
