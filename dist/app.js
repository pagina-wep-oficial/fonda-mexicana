let activeWhatsappNumber = "";
let activeStoreLiveUrl = "";
let storeLiveSocket = null;
let storeLiveRetry = 0;
let storeLiveTimer = 0;
let storeLiveClosing = false;
let storeSettingsRefreshTimer = 0;
let storeSettingsRefreshRequest = null;
let storeMode = "whatsapp_catalog";
let enabledPaymentMethods = ["whatsapp"];
let defaultPaymentMethod = "whatsapp";
const GENERIC_IMAGE = "assets/producto-generico.svg";
const CART_KEY = "tiendaPedidosCarrito";
const HISTORY_KEY = "tiendaPedidosHistorial";
const CHECKOUT_DRAFT_KEY = "tiendaPedidosDatosCarrito";
const ORDER_SEQ_KEY = "tiendaPedidosSecuencia";
const ORDER_SEQ_START = 1000;

const ITM_PROJECT_ID = "096b6e30-cc77-4fa2-bd2f-1e2696d742f2";
const ITM_PRODUCTS_URL =
  `https://itm-void-excepcional.pages.dev/api/store-products?project_id=${encodeURIComponent(ITM_PROJECT_ID)}&public=1`;
const ITM_ORDERS_URL =
  `https://itm-void-excepcional.pages.dev/api/store-orders?project_id=${encodeURIComponent(ITM_PROJECT_ID)}&public=1`;
const ITM_PROFILE_URL =
  `https://itm-void-excepcional.pages.dev/api/store-customer-profile?project_id=${encodeURIComponent(ITM_PROJECT_ID)}`;
const STORE_CONFIG_URL = "/store-config.json";
const CATALOG_VIEW_KEY = `itm.catalog.view:${ITM_PROJECT_ID}`;

function applyStorePaymentSettings(settings = {}) {
  storeMode =
    settings.store_mode === "managed_orders"
      ? "managed_orders"
      : "whatsapp_catalog";

  const configuredMethods = Array.isArray(settings.enabled_payment_methods)
    ? settings.enabled_payment_methods.filter(
        (method) => method === "whatsapp" || method === "code"
      )
    : [];

  enabledPaymentMethods =
    storeMode === "whatsapp_catalog"
      ? ["whatsapp"]
      : configuredMethods.length
        ? [...new Set(configuredMethods)]
        : ["whatsapp"];

  defaultPaymentMethod = enabledPaymentMethods.includes(
    settings.default_payment_method
  )
    ? settings.default_payment_method
    : enabledPaymentMethods[0];
}

let customerSession = null;
let customerProfile = null;
let profileIdentityLoading = false;
let profileIdentityRequest = null;

async function loadStaticStoreConfig() {
  try {
    const response = await fetch(`${STORE_CONFIG_URL}?v=${Date.now()}`, {
      headers: {
        Accept: "application/json"
      },
      cache: "no-store"
    });

    const body = await response.json().catch(() => ({}));

    if (
      !response.ok ||
      body?.project_id !== ITM_PROJECT_ID
    ) {
      throw new Error("STORE_CONFIG_INVALID");
    }

    const configuredPhone = String(body.whatsapp_number || "")
      .replace(/\D/g, "");

    activeWhatsappNumber = configuredPhone.startsWith("52")
      ? configuredPhone
      : configuredPhone
        ? `52${configuredPhone}`
        : "";

    const liveUrl = String(body.store_live_url || "").trim();

    if (/^https?:\/\//i.test(liveUrl) && body.project_id === ITM_PROJECT_ID) {
      activeStoreLiveUrl = liveUrl;
    } else if (liveUrl) {
      console.warn("store-config.json contiene store_live_url no permitido.");
    }
  } catch (error) {
    activeWhatsappNumber = "";
    activeStoreLiveUrl = "";
    console.error(
      "No se pudo cargar la configuracion estatica de la tienda:",
      error
    );
  }
}

async function refreshStoreSettingsFromServer() {
  if (storeSettingsRefreshRequest) {
    return storeSettingsRefreshRequest;
  }

  const request = (async () => {
    const endpoint = new URL(ITM_PRODUCTS_URL);

    endpoint.searchParams.set("limit", "1");
    endpoint.searchParams.set("offset", "0");

    const response = await fetch(endpoint, {
      cache: "no-store",
      headers: {
        Accept: "application/json"
      }
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok || body?.ok !== true) {
      throw new Error(body?.code || `STORE_SETTINGS_HTTP_${response.status}`);
    }

    applyStorePaymentSettings(body.settings || {});

    if (document.body.dataset.page === "carrito") {
      renderCart();
    }

    return body.settings || {};
  })();

  storeSettingsRefreshRequest = request;

  try {
    return await request;
  } catch (error) {
    console.warn(
      "No se pudo actualizar la configuración de tienda en vivo:",
      error
    );

    return null;
  } finally {
    if (storeSettingsRefreshRequest === request) {
      storeSettingsRefreshRequest = null;
    }
  }
}

function scheduleStoreSettingsRefresh() {
  if (storeSettingsRefreshTimer) {
    return;
  }

  storeSettingsRefreshTimer = window.setTimeout(() => {
    storeSettingsRefreshTimer = 0;
    void refreshStoreSettingsFromServer();
  }, 250);
}

function buildStoreLiveUrl(base) {
  const baseClean = String(base || "")
    .trim()
    .replace(/\/+$/, "");

  if (!baseClean) return "";

  let url;

  try {
    url = new URL(baseClean);
  } catch {
    return "";
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "";
  }

  const path = url.pathname.replace(/\/+$/, "");

  url.pathname = path.endsWith("/connect") ? path : `${path}/connect`;
  url.searchParams.set("project_id", ITM_PROJECT_ID);
  url.protocol = url.protocol === "http:" ? "ws:" : "wss:";

  return url.toString();
}

function scheduleLiveCartQuote() {
  if (!cartQuotePayload().items.length) return;
  if (storeLiveTimer) return;

  storeLiveTimer = window.setTimeout(() => {
    storeLiveTimer = 0;
    if (typeof requestCartQuote === "function") {
      requestCartQuote();
    }
  }, 900);
}

function handleStoreLiveMessage(raw) {
  let event;

  try {
    event = JSON.parse(raw);
  } catch {
    return;
  }

  if (!event || event.project_id !== ITM_PROJECT_ID) return;

  if (event.type === "store_settings_changed") {
    if (document.body.dataset.page === "tienda") {
      scheduleLiveCatalogRefresh();
    } else {
      scheduleStoreSettingsRefresh();
    }

    scheduleLiveDetailRefresh();
    scheduleLiveCartQuote();
    return;
  }

  if (
    event.type === "catalog_changed" ||
    event.type === "inventory_changed"
  ) {
    scheduleLiveCatalogRefresh(event);
    scheduleLiveDetailRefresh(event);
    scheduleLiveCartQuote();
  }
}

function connectStoreLive() {
  if (
    storeLiveClosing ||
    storeLiveSocket ||
    typeof WebSocket === "undefined"
  ) {
    return;
  }

  if (!activeStoreLiveUrl) return;

  const url = buildStoreLiveUrl(activeStoreLiveUrl);

  if (!url) return;

  let socket;

  try {
    socket = new WebSocket(url);
  } catch {
    return;
  }

  storeLiveSocket = socket;

  socket.addEventListener("open", () => {
    storeLiveRetry = 0;
  });

  socket.addEventListener("message", (message) => {
    handleStoreLiveMessage(
      typeof message.data === "string" ? message.data : ""
    );
  });

  socket.addEventListener("close", () => {
    if (storeLiveSocket === socket) storeLiveSocket = null;
    if (storeLiveClosing) return;

    storeLiveRetry += 1;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(storeLiveRetry, 5));
    window.setTimeout(connectStoreLive, delay);
  });

  socket.addEventListener("error", () => {
    try {
      socket.close();
    } catch {}
  });
}

function disconnectStoreLive() {
  storeLiveClosing = true;
  if (storeLiveTimer) {
    window.clearTimeout(storeLiveTimer);
    storeLiveTimer = 0;
  }

  if (storeLiveSocket) {
    try {
      storeLiveSocket.close();
    } catch {}
    storeLiveSocket = null;
  }
}

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

let products = [
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

const catalogState = {
  items: [],
  categories: ["Todos"],
  nextOffset: 0,
  hasMore: true,
  loading: false,
  query: "",
  configLoaded: false
};

const cartQuoteState = {
  items: new Map(),
  revision: "",
  inFlight: null
};

let catalogSearchTimer = null;
let catalogRequestController = null;
let catalogSlotObserver = null;
let catalogPageObserver = null;
let catalogLiveRefreshTimer = 0;
let catalogLiveNeedsFullRefresh = false;
const catalogLiveProductIds = new Set();
let catalogLiveApplying = false;
let detailLiveRefreshTimer = 0;
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

function readSessionJson(key, fallback) {
  try {
    return JSON.parse(sessionStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function writeSessionJson(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Si el navegador bloquea sessionStorage, la tienda sigue funcionando.
  }
}

function catalogViewportAnchor() {
  const viewportHeight = window.innerHeight || 0;

  const visible = [...document.querySelectorAll("[data-catalog-slot]")]
    .map((slot) => {
      const index = Number(slot.dataset.catalogIndex);
      const product = catalogState.items[index];

      if (!product) return null;

      const rect = slot.getBoundingClientRect();

      if (rect.bottom <= 0 || rect.top >= viewportHeight) {
        return null;
      }

      return {
        product_id: String(product.id),
        top: Math.round(rect.top)
      };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(a.top) - Math.abs(b.top));

  return visible[0] || null;
}

function saveCatalogViewState() {
  if (document.body.dataset.page !== "tienda") return;
  if (!catalogState.items.length) return;

  const anchor = catalogViewportAnchor();

  writeSessionJson(CATALOG_VIEW_KEY, {
    version: 1,
    category: activeCategory,
    query: catalogState.query,
    loaded_count: catalogState.items.length,
    next_offset: catalogState.nextOffset,
    scroll_y: Math.max(0, Math.round(window.scrollY || 0)),
    anchor_product_id: anchor?.product_id || "",
    anchor_top: anchor?.top || 0,
    saved_at: Date.now()
  });
}

function getCatalogViewState() {
  const saved = readSessionJson(CATALOG_VIEW_KEY, null);

  if (!saved || saved.version !== 1) {
    return null;
  }

  return {
    category: String(saved.category || "Todos"),
    query: String(saved.query || ""),
    loaded_count: Math.max(
      0,
      Number.parseInt(saved.loaded_count, 10) || 0
    ),
    scroll_y: Math.max(
      0,
      Number.parseInt(saved.scroll_y, 10) || 0
    ),
    anchor_product_id: String(saved.anchor_product_id || ""),
    anchor_top: Number(saved.anchor_top) || 0
  };
}

function clearCatalogViewState() {
  try {
    sessionStorage.removeItem(CATALOG_VIEW_KEY);
  } catch {
    // No bloquea la navegación si el navegador limita sessionStorage.
  }
}

function restoreCatalogScroll(saved) {
  const anchorIndex = catalogState.items.findIndex(
    (product) => String(product.id) === saved.anchor_product_id
  );

  const anchorSlot =
    anchorIndex >= 0
      ? document.querySelector(
          `[data-catalog-slot][data-catalog-index="${anchorIndex}"]`
        )
      : null;

  if (anchorSlot) {
    const currentTop = anchorSlot.getBoundingClientRect().top;

    window.scrollTo(
      0,
      Math.max(
        0,
        Math.round(
          window.scrollY + currentTop - saved.anchor_top
        )
      )
    );

    return;
  }

  window.scrollTo(0, saved.scroll_y);
}

async function restoreCatalogViewState(onInitialCatalogReady = null) {
  const saved = getCatalogViewState();

  if (saved) {
    activeCategory = saved.category;
    catalogState.query = saved.query;

    const searchInput = document.getElementById("searchInput");

    if (searchInput) {
      searchInput.value = saved.query;
    }
  }

  await loadCatalogProducts();

  if (typeof onInitialCatalogReady === "function") {
    onInitialCatalogReady();
  }

  await finishCatalogViewRestore(saved);
}

async function finishCatalogViewRestore(saved) {
  if (!saved) {
    return;
  }

  while (
    catalogState.hasMore &&
    catalogState.items.length < saved.loaded_count
  ) {
    await loadCatalogProducts({ reset: false });
  }

  await new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });

  restoreCatalogScroll(saved);
  clearCatalogViewState();
}

async function refreshCatalogKeepingView() {
  if (document.body.dataset.page !== "tienda") {
    return;
  }

  saveCatalogViewState();

  const saved = getCatalogViewState();

  await loadCatalogProducts({ reset: true });
  await finishCatalogViewRestore(saved);
}

function armLiveCatalogRefresh() {
  if (catalogLiveRefreshTimer) {
    return;
  }

  catalogLiveRefreshTimer = window.setTimeout(() => {
    void flushLiveCatalogRefresh();
  }, 350);
}

function scheduleLiveCatalogRefresh(event = null) {
  if (document.body.dataset.page !== "tienda") {
    return;
  }

  const productIds = Array.isArray(event?.product_ids)
    ? [
        ...new Set(
          event.product_ids
            .map((id) => String(id || "").trim())
            .filter(Boolean)
        )
      ]
    : [];

  const canPatchOnlyAffectedProducts =
    productIds.length > 0 &&
    (
      event?.type === "inventory_changed" ||
      (
        event?.type === "catalog_changed" &&
        event?.scope === "product_patch"
      )
    );

  if (
    canPatchOnlyAffectedProducts &&
    !catalogLiveNeedsFullRefresh
  ) {
    productIds.forEach((productId) => {
      catalogLiveProductIds.add(productId);
    });
  } else {
    catalogLiveNeedsFullRefresh = true;
    catalogLiveProductIds.clear();
  }

  armLiveCatalogRefresh();
}

async function flushLiveCatalogRefresh() {
  if (document.body.dataset.page !== "tienda") {
    catalogLiveRefreshTimer = 0;
    catalogLiveNeedsFullRefresh = false;
    catalogLiveProductIds.clear();
    return;
  }

  if (catalogState.loading || catalogLiveApplying) {
    catalogLiveRefreshTimer = window.setTimeout(() => {
      void flushLiveCatalogRefresh();
    }, 350);
    return;
  }

  catalogLiveRefreshTimer = 0;

  const needsFullRefresh = catalogLiveNeedsFullRefresh;
  const productIds = [...catalogLiveProductIds];

  catalogLiveNeedsFullRefresh = false;
  catalogLiveProductIds.clear();
  catalogLiveApplying = true;

  try {
    if (needsFullRefresh) {
      await refreshCatalogKeepingView();
      return;
    }

    let mustRecoverWithFullRefresh = false;

    for (const productId of productIds) {
      const patched = await patchLiveCatalogProduct(productId);

      if (!patched) {
        mustRecoverWithFullRefresh = true;
      }
    }

    if (mustRecoverWithFullRefresh) {
      await refreshCatalogKeepingView();
    }
  } catch (error) {
    console.error(
      "No se pudo actualizar un producto en tiempo real:",
      error
    );

    await refreshCatalogKeepingView();
  } finally {
    catalogLiveApplying = false;

    if (
      (catalogLiveNeedsFullRefresh ||
        catalogLiveProductIds.size > 0) &&
      !catalogLiveRefreshTimer
    ) {
      armLiveCatalogRefresh();
    }
  }
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
  const catalogProduct = products.find(
    (product) => product.id === id
  );

  const quotedProduct = cartQuoteState.items.get(id);

  if (!quotedProduct) {
    return catalogProduct;
  }

  return {
    ...(catalogProduct || {}),
    ...quotedProduct,
    id
  };
}

function cartItems() {
  const cart = getCart();

  return Object.entries(cart)
    .map(([id, quantity]) => ({
      product: getProduct(id),
      quantity
    }))
    .filter((item) => item.product && item.quantity > 0);
}

function cartTotal(items = cartItems()) {
  return items
    .filter((item) => item.product.cart_quote_available !== false)
    .reduce(
      (sum, item) => sum + item.product.price * item.quantity,
      0
    );
}
function cartQuotePayload() {
  return {
    items: Object.entries(getCart()).map(([product_id, quantity]) => ({
      product_id,
      quantity: Math.max(1, Number(quantity) || 1)
    }))
  };
}

function quotedCartProduct(line) {
  return {
    id: line.product_id,
    name: line.name || "Producto",
    price: Number(line.unit_price) || 0,
    currency: line.currency || "MXN",
    inventory_enabled: line.inventory_enabled === true,
    available_quantity:
      line.inventory_enabled === true
        ? Math.max(0, Number(line.stock_available) || 0)
        : 0,
    payment_methods: line.payment_method
      ? [line.payment_method]
      : [],
    default_payment_method: line.payment_method || "whatsapp",
    cart_quote_available: line.available === true,
    cart_quote_reason: line.reason || "",
    cart_quote_version: line.version || ""
  };
}

function applyCartQuote(quote, { quiet = true } = {}) {
  if (!quote || !Array.isArray(quote.items)) {
    return false;
  }

  const cart = getCart();
  const previousQuoteItems = cartQuoteState.items;
  const nextQuoteItems = new Map();
  const notices = [];
  let cartChanged = false;

  for (const line of quote.items) {
    if (!line?.product_id) continue;

    const previousProduct =
      previousQuoteItems.get(line.product_id) ||
      products.find((product) => product.id === line.product_id);

    const nextProduct = quotedCartProduct(line);

    nextQuoteItems.set(line.product_id, nextProduct);

    if (
      previousProduct &&
      Number(previousProduct.price) !== Number(nextProduct.price)
    ) {
      notices.push(
        `Actualizamos el precio de ${nextProduct.name}.`
      );
    }

    if (line.available !== true) {
      notices.push(
        `${nextProduct.name} ya no está disponible.`
      );
      continue;
    }

    if (
      line.quantity_adjusted === true &&
      Number(cart[line.product_id]) !== Number(line.quantity)
    ) {
      cart[line.product_id] = Number(line.quantity);
      cartChanged = true;

      notices.push(
        `Ajustamos la cantidad de ${nextProduct.name} a ${line.quantity}.`
      );
    }
  }

  cartQuoteState.items = nextQuoteItems;
  cartQuoteState.revision = String(quote.revision || "");

  if (cartChanged) {
    setCart(cart);
  }

  renderCart();

  if (!quiet && notices.length) {
    showToast(notices[0]);
  }

  return true;
}

async function requestCartQuote({ quiet = true } = {}) {
  const payload = cartQuotePayload();

  if (!payload.items.length) {
    cartQuoteState.items = new Map();
    cartQuoteState.revision = "";
    return null;
  }

  if (cartQuoteState.inFlight) {
    return cartQuoteState.inFlight;
  }

  const request = (async () => {
    try {
      const response = await fetch(
        `${ITM_ORDERS_URL}&quote=1`,
        {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify(payload)
        }
      );

      const body = await response.json().catch(() => ({}));

      if (
        !response.ok ||
        body?.ok !== true ||
        !body?.quote
      ) {
        throw new Error(
          body?.code || `QUOTE_HTTP_${response.status}`
        );
      }

      applyCartQuote(body.quote, { quiet });

      return body.quote;
    } catch (error) {
      if (!quiet) {
        throw error;
      }

      console.warn(
        "No se pudo actualizar el carrito desde el servidor:",
        error
      );

      return null;
    }
  })();

  cartQuoteState.inFlight = request;

  try {
    return await request;
  } finally {
    if (cartQuoteState.inFlight === request) {
      cartQuoteState.inFlight = null;
    }
  }
}

function productPaymentMethods(product) {
  if (storeMode === "whatsapp_catalog") {
    return ["whatsapp"];
  }

  const methods =
    Array.isArray(product?.payment_methods) &&
    product.payment_methods.length
      ? product.payment_methods
      : [defaultPaymentMethod];

  const allowedMethods = methods.filter((method) =>
    enabledPaymentMethods.includes(method)
  );

  return allowedMethods.length
    ? [...new Set(allowedMethods)]
    : [defaultPaymentMethod];
}

function productPrimaryPaymentMethod(product) {
  const methods = productPaymentMethods(product);

  if (
    methods.includes(product?.default_payment_method) &&
    enabledPaymentMethods.includes(product.default_payment_method)
  ) {
    return product.default_payment_method;
  }

  if (methods.includes(defaultPaymentMethod)) {
    return defaultPaymentMethod;
  }

  return methods[0] || defaultPaymentMethod || "whatsapp";
}

function cartPaymentMethod(items = cartItems()) {
  if (storeMode === "whatsapp_catalog") {
    return "whatsapp";
  }

  if (!items.length) {
    return defaultPaymentMethod || "whatsapp";
  }

  return productPrimaryPaymentMethod(items[0].product);
}

function cartPaymentMethods(items = cartItems()) {
  return [cartPaymentMethod(items)];
}

function renderCheckoutPaymentOptions() {
  const form = document.getElementById("checkoutForm");
  if (!form) return;

  const codeOption = document.getElementById("code-payment-option");
  const codePanel = document.getElementById("payment-code-panel");
  const submitButton = document.getElementById("checkoutSubmitButton");

  const cartMethod = cartPaymentMethod();
  const codeAllowed =
    storeMode === "managed_orders" &&
    cartMethod === "code";

  const whatsappAllowed = cartMethod === "whatsapp";

  const whatsappInput = form.querySelector(
    "input[name='paymentMethod'][value='whatsapp']"
  );

  const codeInput = form.querySelector(
    "input[name='paymentMethod'][value='code']"
  );

  const whatsappOption = whatsappInput?.closest(".radio-row");

  if (whatsappOption) {
    whatsappOption.hidden = !whatsappAllowed;
  }

  if (codeOption) {
    codeOption.hidden = !codeAllowed;
  }

  if (codeAllowed && codeInput) {
    codeInput.checked = true;
  }

  if (whatsappAllowed && whatsappInput) {
    whatsappInput.checked = true;
  }

  if (codePanel) {
    codePanel.hidden = !codeAllowed;
  }

  if (submitButton) {
    submitButton.textContent = codeAllowed
      ? "Confirmar con código"
      : "Hacer pedido por WhatsApp";
  }
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
  return Object.values(getCart()).reduce(
    (sum, quantity) => sum + Math.max(0, Number(quantity) || 0),
    0
  );
}

function updateCartCount() {
  const count = String(cartCount());

  document.querySelectorAll("[data-cart-count]").forEach((node) => {
    const changed = node.textContent !== count;

    node.textContent = count;

    if (changed) {
      node.classList.remove("cart-count-bump");
      void node.offsetWidth;
      node.classList.add("cart-count-bump");
    }
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

function profileInitials(name){
  const value=String(name||"").trim();

  if(!value)return "";

  const parts=value.split(/\s+/).filter(Boolean);

  if(parts.length>1){
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return value.slice(0,2).toUpperCase();
}

function profileAvatarMarkup(initials, loggedIn){
  if(loggedIn)return initials;

  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.4"></circle><path d="M5.5 19c.8-3.2 3-4.8 6.5-4.8s5.7 1.6 6.5 4.8"></path></svg>';
}

function profileName(){
  return String(
    customerProfile?.display_name ||
    customerSession?.user?.displayName ||
    ""
  ).trim();
}

function renderProfileMenu(){
  const button=document.querySelector("[data-profile-corner]");
  const overlay=document.querySelector("[data-profile-overlay]");
if(!button||!overlay)return;

overlay.classList.toggle("is-loading", profileIdentityLoading);

const loggedIn=Boolean(
    customerSession?.user &&
    customerSession?.idToken
  );

  const avatar=button.querySelector("[data-profile-avatar]");
  const menuAvatar=overlay.querySelector("[data-profile-menu-avatar]");
  const menuName=overlay.querySelector("[data-profile-name]");
  const menuEmail=overlay.querySelector("[data-profile-email]");
  const message=overlay.querySelector("[data-profile-message]");
  const status=overlay.querySelector("[data-profile-status]");
  const loginButton=overlay.querySelector("[data-profile-login]");
  const profileLink=overlay.querySelector("[data-profile-config]");
  const ordersLink=overlay.querySelector("[data-profile-orders]");
  const logoutButton=overlay.querySelector("[data-profile-logout]");

if(profileIdentityLoading){
  if(menuName)menuName.textContent="Cargando perfil...";
  if(menuEmail)menuEmail.textContent="";
  if(message)message.textContent="Cargando tus datos...";
  if(status)status.textContent="Espera un momento";
  if(loginButton)loginButton.hidden=true;
  if(profileLink)profileLink.hidden=true;
  if(ordersLink)ordersLink.hidden=true;
  if(logoutButton)logoutButton.hidden=true;
  return;
}

  const name=profileName();
  const initials=profileInitials(name);
  const avatarMarkup=profileAvatarMarkup(initials, loggedIn);

  if(avatar)avatar.innerHTML=avatarMarkup;
  if(menuAvatar)menuAvatar.innerHTML=avatarMarkup;

  if(menuName){
    menuName.textContent=loggedIn
      ? name||"Cliente"
      : "Iniciar sesión";
  }

  if(menuEmail){
    menuEmail.textContent=loggedIn
      ? customerSession.user.email||""
      : "";
  }

  if(message){
    message.textContent=loggedIn
      ? "Administra tus datos y consulta tus pedidos."
      : "Inicia sesión para guardar tus datos y facilitar tus pedidos.";
  }

  if(loginButton)loginButton.hidden=loggedIn;
  if(profileLink)profileLink.hidden=!loggedIn;
  if(ordersLink)ordersLink.hidden=!loggedIn;
  if(logoutButton)logoutButton.hidden=!loggedIn;
}

async function loadProfileIdentity(){
  if (profileIdentityRequest) return profileIdentityRequest;

  profileIdentityRequest = (async () => {
    profileIdentityLoading = true;
    renderProfileMenu();

    try {
      const auth = await ensureCustomerAuth();
      customerSession = await auth.getSession();
      customerProfile = null;

      if (!customerSession?.idToken) return;

      try {
        const response = await fetch(ITM_PROFILE_URL, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${customerSession.idToken}`
          }
        });

        const result = await response.json().catch(() => ({}));

        if (response.ok && result?.ok === true) {
          customerProfile = result.profile || null;
        } else {
          console.warn("No se pudo cargar el perfil del cliente.", result);
        }
      } catch (error) {
        console.warn("No se pudo cargar el perfil del cliente.", error);
      }
    } catch (error) {
      customerSession = null;
      customerProfile = null;
      console.warn("No se pudo restaurar la sesión del cliente.", error);
    } finally {
      profileIdentityLoading = false;
      renderProfileMenu();
    }
  })();

  try {
    await profileIdentityRequest;
  } finally {
    profileIdentityRequest = null;
  }
}

function initProfileMenu(){
  const button=document.querySelector("[data-profile-corner]");
  if(!button||document.querySelector("[data-profile-overlay]"))return;

  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="profile-overlay" data-profile-overlay hidden>
      <div class="profile-popover" role="dialog" aria-modal="true" aria-labelledby="profile-popover-title">
        <button class="profile-close" type="button" data-profile-close aria-label="Cerrar">×</button>

        <div class="profile-identity">
          <span class="profile-menu-avatar" data-profile-menu-avatar>?</span>
          <div>
            <strong id="profile-popover-title" data-profile-name>Iniciar sesión</strong>
            <small data-profile-email></small>
          </div>
        </div>

        <p class="profile-message" data-profile-message>
          Inicia sesión para guardar tus datos y facilitar tus pedidos.
        </p>

        <div class="profile-actions">
          <button class="button primary" type="button" data-profile-login>
            Iniciar sesión con Google
          </button>

          <a class="button secondary" href="perfil-de-usuario.html" data-profile-config hidden>
            Configurar perfil
          </a>

          <a class="button secondary" href="mis-pedidos.html" data-profile-orders hidden>
            Mis pedidos
          </a>

          <button class="button light" type="button" data-profile-logout hidden>
            Cerrar sesión
          </button>
        </div>

        <p class="profile-status" data-profile-status></p>
      </div>
    </div>`
  );

  const overlay=document.querySelector("[data-profile-overlay]");
  const close=()=>{overlay.hidden=true};

button.addEventListener("click",async()=>{
  profileIdentityLoading=true;
  overlay.hidden=false;
  renderProfileMenu();
  await loadProfileIdentity();
});

  overlay.querySelector("[data-profile-close]")?.addEventListener("click",close);

  overlay.addEventListener("click",event=>{
    if(event.target===overlay)close();
  });

  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"&&!overlay.hidden)close();
  });

  overlay.querySelector("[data-profile-login]")?.addEventListener("click",async()=>{
    const status=overlay.querySelector("[data-profile-status]");
    const auth=await ensureCustomerAuth();

    try{
      if(status)status.textContent="Abriendo inicio de sesión...";
      await auth.signInWithGoogle();
      await loadProfileIdentity();
      if(status)status.textContent="Sesión iniciada.";
    }catch(error){
      if(status)status.textContent="No se pudo iniciar sesión.";
    }
  });

  overlay.querySelector("[data-profile-logout]")?.addEventListener("click",async()=>{
    await logoutCustomer();
    close();
    renderProfileMenu();
  });

  renderProfileMenu();
  void loadProfileIdentity();
}

function initAppNavigation() {
  if (document.querySelector(".app-nav")) return;

  const page = document.body.dataset.page;
  if (!page || INTERNAL_PAGES.includes(page)) return;

  const topbar = document.querySelector(".topbar");

  if (topbar && !topbar.querySelector("[data-profile-corner]")) {
    const profileActive = page === "perfil" ? " active" : "";

    topbar.insertAdjacentHTML(
      "beforeend",
      `<button class="profile-corner${profileActive}" data-profile-corner type="button" aria-label="Abrir perfil">
        <span class="profile-avatar" data-profile-avatar aria-hidden="true"></span>
      </button>`
    );
  }

  if (page === "inicio") {
    initProfileMenu();
    return;
  }

  const activePage =
    page === "carrito" || page === "mis-pedidos"
      ? page
      : "tienda";

  const links = [
    { id: "tienda", label: "Pedir", href: "tienda.html", icon: "tienda" },
    { id: "carrito", label: "Carrito", href: "carrito.html", icon: "carrito", badge: true },
    { id: "mis-pedidos", label: "Mis pedidos", href: "mis-pedidos.html", icon: "pedidos" }
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

  initProfileMenu();
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
  const product = getProduct(id);

  if (!product) return;

  const currentItems = cartItems();
  const productMethod = productPrimaryPaymentMethod(product);
  const cartMethod = currentItems.length
    ? cartPaymentMethod(currentItems)
    : productMethod;

  if (currentItems.length && productMethod !== cartMethod) {
    showToast("Este producto usa otro método de compra. Termina o vacía tu carrito para agregarlo.");
    return;
  }

  const currentQuantity = Math.max(0, Number(cart[id]) || 0);
  let nextQuantity = Math.max(1, Number(quantity) || 1);

  if (product.inventory_enabled) {
    const available = Math.max(0, Number(product.available_quantity) || 0);

    if (available <= 0) {
      showToast("Producto agotado");
      return;
    }

    if (currentQuantity >= available) {
      showToast(`Solo hay ${available} disponibles`);
      return;
    }

    nextQuantity = Math.min(nextQuantity, available - currentQuantity);
  }

  cart[id] = currentQuantity + nextQuantity;
  setCart(cart);

  showToast(`${product.name} agregado al carrito`);
}

function setItemQuantity(id, quantity) {
  const cart = getCart();
  const product = getProduct(id);
  let nextQuantity = Math.max(0, Number(quantity) || 0);

  if (product?.inventory_enabled) {
    const available = Math.max(
      0,
      Number(product.available_quantity) || 0
    );

    if (available <= 0 && nextQuantity > 0) {
      showToast("Ya no quedan unidades disponibles");
      return;
    }

    if (nextQuantity > available) {
      nextQuantity = available;
      showToast(`Solo hay ${available} disponibles`);
    }
  }

  if (nextQuantity <= 0) {
    delete cart[id];
  } else {
    cart[id] = nextQuantity;
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
  return [
    ...new Set(
      catalogState.categories?.length
        ? catalogState.categories
        : ["Todos", "Destacados"]
    )
  ];
}

function renderFilters() {
  const holder = document.getElementById("categoryFilters");
  if (!holder) return;

  const categories = categoryList();

  if (categories.length <= 1) {
    holder.innerHTML = "";
    holder.hidden = true;
    return;
  }

  holder.hidden = false;

  holder.innerHTML = categories
    .map(
      (category) =>
        `<button class="chip ${category === activeCategory ? "active" : ""}" type="button" data-category="${category}">${category}</button>`
    )
    .join("");

  holder.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.category;
      renderFilters();
      loadCatalogProducts({ reset: true });
    });
  });
}

function renderProductPrice(product) {
  const currentPrice = Number(product.price) || 0;
  const previousPrice = Number(product.compare_at_price) || 0;

  if (previousPrice > currentPrice) {
    return `
      <span class="price">
        <del>${money(previousPrice)}</del>
        ${money(currentPrice)}
      </span>
    `;
  }

  return `<span class="price">${money(currentPrice)}</span>`;
}

function productUnitText(product) {
  const unit = String(product.unit_label || "").trim();
  return unit ? `por ${unit}` : "";
}

function productPaymentLabel(product) {
  const method = productPrimaryPaymentMethod(product);

  return method === "code"
    ? {
        id: "code",
        label: "Pago con código de confirmación"
      }
    : {
        id: "whatsapp",
        label: "Pedido por WhatsApp"
      };
}

function productCard(product) {
  const outOfStock =
    product.inventory_enabled &&
    product.available_quantity <= 0;

  const stockLabel = product.inventory_enabled
    ? outOfStock
      ? "Agotado"
      : `Disponibles: ${product.available_quantity}`
    : "";

const featuredLabel = product.featured
  ? `<span class="category">★ Destacado</span>`
  : "";

const payment = productPaymentLabel(product);

  return `
    <article class="product-card">
      <img src="${product.image_url || GENERIC_IMAGE}" alt="${product.name}" loading="lazy">

      <div class="product-body">
        <div class="product-meta">
          <span class="category">${product.category}</span>
          ${renderProductPrice(product)}
          ${productUnitText(product) ? `<small class="product-unit">${productUnitText(product)}</small>` : ""}
        </div>

        ${featuredLabel}

        <h2>${product.name}</h2>
        <p>${product.description}</p>
${stockLabel ? `<p class="product-stock">${stockLabel}</p>` : ""}

<p
  class="product-payment-method"
  data-payment-method="${payment.id}"
>
  ${payment.label}
</p>

<div class="product-actions">
          <button
            class="button primary"
            type="button"
            data-add="${product.id}"
            ${outOfStock ? "disabled aria-disabled=\"true\"" : ""}
          >
            ${outOfStock ? "Agotado" : "Agregar"}
          </button>

          <a class="button secondary" href="detalle.html?id=${product.id}">
            Ver detalles
          </a>
        </div>
      </div>
    </article>
  `;
}

function hydrateCatalogSlot(slot) {
  const index = Number(slot.dataset.catalogIndex);
  const product = products[index];

  if (!product || slot.dataset.hydrated === "true") {
    return;
  }

  slot.innerHTML = productCard(product);
  slot.dataset.hydrated = "true";

  slot.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => {
      addToCart(button.dataset.add);
    });
  });
}

function setupVirtualCatalog() {
  const grid = document.getElementById("productGrid");
  if (!grid) return;

  catalogSlotObserver?.disconnect();
  catalogPageObserver?.disconnect();

  catalogSlotObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const slot = entry.target;

        if (entry.isIntersecting) {
          hydrateCatalogSlot(slot);
          return;
        }

        const distance = Math.abs(
          entry.boundingClientRect.top - window.innerHeight / 2
        );

        if (distance > 1400 && slot.dataset.hydrated === "true") {
          slot.innerHTML = "";
          delete slot.dataset.hydrated;
        }
      });
    },
    {
      rootMargin: "800px 0px"
    }
  );

  grid
    .querySelectorAll("[data-catalog-slot]")
    .forEach((slot) => {
      catalogSlotObserver.observe(slot);
    });

  const sentinel = document.getElementById("catalog-sentinel");

  if (sentinel) {
    catalogPageObserver = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((entry) => entry.isIntersecting) &&
          catalogState.hasMore &&
          !catalogState.loading
        ) {
          loadCatalogProducts({ reset: false });
        }
      },
      {
        rootMargin: "700px 0px"
      }
    );

    catalogPageObserver.observe(sentinel);
  }
}

function renderCatalog() {
  const grid = document.getElementById("productGrid");
  if (!grid) return;

  if (!products.length) {
    const emptyMessage = catalogState.query
      ? "No hay productos que coincidan con tu búsqueda."
      : activeCategory !== "Todos"
        ? "No hay productos en este catálogo."
        : "No hay productos disponibles.";

    grid.innerHTML = `<div class="empty-state">${emptyMessage}</div>`;
    return;
  }

  grid.innerHTML = products
    .map(
      (_, index) => `
        <div
          class="catalog-slot"
          data-catalog-slot
          data-catalog-index="${index}"
          aria-label="Producto"
        ></div>
      `
    )
    .join("");

  if (catalogState.hasMore) {
    grid.insertAdjacentHTML(
      "beforeend",
      `<div id="catalog-sentinel" class="catalog-sentinel">Cargando más productos...</div>`
    );
  }

  setupVirtualCatalog();
}

function mapPublicCatalogProduct(product) {
  return {
    id: String(product.id),
    name: String(product.name || "Producto"),
    category: String(product.category || "Otros"),
    featured: product.featured === true,
    price: Number(product.price) || 0,
    compare_at_price: Number(product.compare_at_price) || 0,
    unit_label: String(product.unit_label || "").trim(),
    description: String(product.description || ""),
    image_url: String(
      product.image_url ||
        product.media?.find(
          (media) => media.media_type === "image"
        )?.source_url ||
        ""
    ),
    inventory_enabled: product.inventory_enabled === true,
    stock_quantity: Number(product.stock_quantity) || 0,
    reserved_quantity: Number(product.reserved_quantity) || 0,
    available_quantity: Number(product.available_quantity) || 0,
    payment_methods:
      Array.isArray(product.payment_methods) &&
      product.payment_methods.length
        ? product.payment_methods
        : [defaultPaymentMethod],
    default_payment_method:
      product.default_payment_method || defaultPaymentMethod
  };
}

async function fetchPublicCatalogProduct(productId) {
  const endpoint = new URL(ITM_PRODUCTS_URL);

  endpoint.searchParams.set("limit", "1");
  endpoint.searchParams.set("offset", "0");
  endpoint.searchParams.set("id", String(productId));

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });

  const body = await response.json();

  if (
    !response.ok ||
    body?.ok !== true ||
    !Array.isArray(body.products)
  ) {
    throw new Error(
      body?.code || `CATALOG_PRODUCT_HTTP_${response.status}`
    );
  }

  applyStorePaymentSettings(body.settings || {});

  return body.products[0]
    ? mapPublicCatalogProduct(body.products[0])
    : null;
}

function refreshCatalogSlot(productIndex) {
  const slot = document.querySelector(
    `[data-catalog-slot][data-catalog-index="${productIndex}"]`
  );

  if (!slot) {
    return;
  }

  const wasHydrated = slot.dataset.hydrated === "true";

  slot.innerHTML = "";
  delete slot.dataset.hydrated;

  if (wasHydrated) {
    hydrateCatalogSlot(slot);
  }
}

async function patchLiveCatalogProduct(productId) {
  const productIndex = catalogState.items.findIndex(
    (product) => String(product.id) === String(productId)
  );

  if (productIndex < 0) {
    return true;
  }

  const nextProduct = await fetchPublicCatalogProduct(productId);

  if (!nextProduct) {
    return false;
  }

  catalogState.items[productIndex] = nextProduct;
  products = catalogState.items;

  refreshCatalogSlot(productIndex);

  return true;
}

async function loadCatalogProducts({ reset = true, productId = null } = {}) {
  if (!reset && (!catalogState.hasMore || catalogState.loading)) {
    return;
  }

  if (reset) {
    catalogRequestController?.abort();
    catalogState.items = [];
    catalogState.nextOffset = 0;
    catalogState.hasMore = true;

    const grid = document.getElementById("productGrid");
    if (grid) {
      grid.innerHTML = `<div class="empty-state">Cargando productos...</div>`;
    }
  }

  catalogState.loading = true;
  catalogRequestController = new AbortController();

  try {
    if (!catalogState.configLoaded) {
      await loadStaticStoreConfig();
      catalogState.configLoaded = true;
    }

    const endpoint = new URL(ITM_PRODUCTS_URL);

    endpoint.searchParams.set("limit", "24");
    endpoint.searchParams.set(
      "offset",
      String(catalogState.nextOffset || 0)
    );

    if (productId) {
      endpoint.searchParams.set("id", productId);
    }

    if (catalogState.query) {
      endpoint.searchParams.set("q", catalogState.query);
    }

    if (activeCategory && activeCategory !== "Todos") {
      endpoint.searchParams.set("category", activeCategory);
    }

    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json"
      },
      signal: catalogRequestController.signal
    });

    const body = await response.json();

    if (
      !response.ok ||
      body?.ok !== true ||
      !Array.isArray(body.products)
    ) {
      throw new Error(
        body?.code || `CATALOG_HTTP_${response.status}`
      );
    }

    applyStorePaymentSettings(body.settings || {});

    const mappedProducts = body.products.map(
      mapPublicCatalogProduct
    );

    catalogState.items = reset
      ? mappedProducts
      : [...catalogState.items, ...mappedProducts];

    products = catalogState.items;

    const serverCategories = Array.isArray(body.categories)
      ? body.categories.filter(Boolean)
      : [];

    catalogState.categories = [
      "Todos",
      ...(body.has_featured ? ["Destacados"] : []),
      ...new Set(
        serverCategories.filter(
          (category) =>
            String(category).toLowerCase() !== "destacados"
        )
      )
    ];

    if (
      activeCategory === "Destacados" &&
      body.has_featured !== true
    ) {
      activeCategory = "Todos";
    }

    catalogState.nextOffset =
      Number.isInteger(body.pagination?.next_offset)
        ? body.pagination.next_offset
        : null;

    catalogState.hasMore =
      body.pagination?.has_more === true;

    renderFilters();
    renderCatalog();
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.error(
        "No se pudo cargar el catálogo ITM:",
        error
      );

      const grid = document.getElementById("productGrid");

      if (grid && reset) {
        grid.innerHTML =
          `<div class="empty-state">No se pudieron cargar los productos.</div>`;
      }
    }
  } finally {
    catalogState.loading = false;
  }
}

async function initCatalog() {
  renderFilters();
  renderCatalog();

  document
    .getElementById("searchInput")
    ?.addEventListener("input", (event) => {
      clearTimeout(catalogSearchTimer);

      catalogSearchTimer = setTimeout(() => {
        catalogState.query = event.target.value
          .trim()
          .toLowerCase();

        loadCatalogProducts({ reset: true });
      }, 250);
    });

  const persistCatalogView = () => {
    saveCatalogViewState();
  };

  window.addEventListener("pagehide", persistCatalogView);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      persistCatalogView();
    }
  });

  await restoreCatalogViewState(() => {
    connectStoreLive();
  });
}

async function initDetail({ preferredQuantity = null } = {}) {
  const holder = document.getElementById("detailView");
  if (!holder) return;

  const id = new URLSearchParams(window.location.search).get("id");

  await loadCatalogProducts({
    reset: true,
    productId: id
  });

  connectStoreLive();

  const product = getProduct(id);

  if (!product) {
    holder.innerHTML = `
      <div class="empty-state">
        Este producto ya no está disponible.
      </div>
    `;
    return;
  }

  document.title = `${product.name} | Fonda Mexicana`;

  const detailOutOfStock =
    product.inventory_enabled &&
    product.available_quantity <= 0;

  const detailMaxQuantity =
    product.inventory_enabled
      ? Math.max(1, product.available_quantity)
      : "";

  const requestedQuantity = Number.parseInt(
    preferredQuantity,
    10
  );

  const safeRequestedQuantity =
    Number.isFinite(requestedQuantity) && requestedQuantity > 0
      ? requestedQuantity
      : 1;

  const initialDetailQuantity = detailOutOfStock
    ? 1
    : detailMaxQuantity
      ? Math.min(safeRequestedQuantity, detailMaxQuantity)
      : safeRequestedQuantity;

  const detailPayment = productPaymentLabel(product);

  holder.innerHTML = `
    <div class="detail-media">
      <img
        src="${product.image_url || GENERIC_IMAGE}"
        alt="${product.name}"
      >
    </div>

    <div class="detail-copy">
      <p class="section-kicker">${product.category}</p>
      <h1>${product.name}</h1>
      <p>${product.description}</p>
      ${renderProductPrice(product)}
      ${productUnitText(product) ? `<p class="product-unit">${productUnitText(product)}</p>` : ""}

      <p
        class="product-payment-method"
        data-payment-method="${detailPayment.id}"
      >
        ${detailPayment.label}
      </p>

      ${product.inventory_enabled
        ? `<p class="product-stock">${
            product.available_quantity > 0
              ? `Disponibles: ${product.available_quantity}`
              : "Agotado"
          }</p>`
        : ""}

      <div class="detail-quantity">
        <span>Cantidad</span>

        <div class="quantity quantity-input" aria-label="Cantidad para agregar">
          <button type="button" data-detail-minus aria-label="Quitar uno">-</button>
          <input
            id="detailQuantity"
            type="number"
            min="1"
            step="1"
            value="${initialDetailQuantity}"
            inputmode="numeric"
            ${detailMaxQuantity ? `max="${detailMaxQuantity}"` : ""}
            ${detailOutOfStock ? "disabled" : ""}
          >
          <button type="button" data-detail-plus aria-label="Agregar uno">+</button>
        </div>
      </div>

      <div class="detail-actions">
        <button class="button primary" type="button" data-add="${product.id}" ${detailOutOfStock ? "disabled aria-disabled=\"true\"" : ""}>
          Agregar al carrito
        </button>

        <a class="button secondary" href="carrito.html">
          Ir al carrito
        </a>
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
    const current = normalizeQuantity();

    if (product.inventory_enabled && current >= product.available_quantity) {
      showToast(`Solo hay ${product.available_quantity} disponibles`);
      return;
    }

    quantityInput.value = current + 1;
  });

  quantityInput?.addEventListener("change", normalizeQuantity);

  holder.querySelector("[data-add]")?.addEventListener("click", () => {
    addToCart(product.id, normalizeQuantity());
    quantityInput.value = 1;
  });
}

function currentDetailProductId() {
  return String(
    new URLSearchParams(window.location.search).get("id") || ""
  ).trim();
}

function scheduleLiveDetailRefresh(event = null) {
  if (document.body.dataset.page !== "detalle") {
    return;
  }

  const productId = currentDetailProductId();

  if (!productId) {
    return;
  }

  const affectedIds = Array.isArray(event?.product_ids)
    ? event.product_ids.map((id) => String(id))
    : [];

  if (
    affectedIds.length &&
    !affectedIds.includes(productId)
  ) {
    return;
  }

  if (detailLiveRefreshTimer) {
    return;
  }

  detailLiveRefreshTimer = window.setTimeout(() => {
    detailLiveRefreshTimer = 0;

    const currentQuantity = Number.parseInt(
      document.getElementById("detailQuantity")?.value,
      10
    );

    void initDetail({
      preferredQuantity:
        Number.isFinite(currentQuantity) && currentQuantity > 0
          ? currentQuantity
          : 1
    });
  }, 350);
}

function renderCart() {
  renderCheckoutPaymentOptions();

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
    .map(({ product, quantity }) => {
      const unavailable =
        product.cart_quote_available === false;

      const unavailableMessage =
        product.cart_quote_reason === "OUT_OF_STOCK"
          ? "Agotado temporalmente"
          : "Este producto ya no está disponible";

      return `
        <article class="cart-item${unavailable ? " is-unavailable" : ""}">
          <img src="${product.image_url || GENERIC_IMAGE}" alt="${product.name}">
          <div class="cart-item-main">
            <h2>${product.name}</h2>
            <p>${money(product.price)}${productUnitText(product) ? ` ${productUnitText(product)}` : ""}</p>
            ${unavailable ? `
              <p class="cart-unavailable-note" role="status">
                ${unavailableMessage}
              </p>
            ` : ""}

            <a
              class="button secondary cart-product-link"
              href="detalle.html?id=${encodeURIComponent(product.id)}"
            >
              Ver producto
            </a>
          </div>
          <div class="cart-item-controls">
            <div class="quantity compact" aria-label="Cantidad de ${product.name}">
              <button type="button" data-minus="${product.id}" aria-label="Quitar uno">-</button>
              <span>${quantity}</span>
              <button
                type="button"
                data-plus="${product.id}"
                aria-label="Agregar uno"
                ${unavailable ? "disabled" : ""}
              >+</button>
            </div>
            <strong>${unavailable ? "No disponible" : money(product.price * quantity)}</strong>
            <button class="remove-icon" type="button" data-remove="${product.id}" aria-label="Quitar ${product.name}">Quitar</button>
          </div>
        </article>
      `;
    })
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
    `  ${money(item.product.price)}${productUnitText(item.product) ? ` ${productUnitText(item.product)}` : ""} = *${money(item.product.price * item.quantity)}*`
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
    whatsappNumber: activeWhatsappNumber,
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

function loadCustomerScript(src) {
  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find(script => script.src === src);

    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }

      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error("No se pudo cargar el login."));
    document.head.appendChild(script);
  });
}

async function ensureCustomerAuth() {
  if (window.ITMFirebase?.configured) {
    return window.ITMFirebase;
  }

  await loadCustomerScript(
    "https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js"
  );

  await loadCustomerScript(
    "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth-compat.js"
  );

  await loadCustomerScript(
    "https://itm-void-excepcional.pages.dev/firebase-config.js"
  );

  await loadCustomerScript(
    "https://itm-void-excepcional.pages.dev/firebase-client.js"
  );

  if (!window.ITMFirebase?.configured) {
    throw new Error("El inicio de sesión no está disponible.");
  }

  return window.ITMFirebase;
}

function renderCustomerAuth() {
  const status = document.getElementById("customer-account-status");
  const loginButton = document.getElementById("customer-login-btn");
  const logoutButton = document.getElementById("customer-logout-btn");
  const saveButton = document.getElementById("save-customer-profile-btn");

  const loggedIn = Boolean(customerSession?.user);

  if (loginButton) loginButton.hidden = loggedIn;
  if (logoutButton) logoutButton.hidden = !loggedIn;
  if (saveButton) saveButton.hidden = !loggedIn;

  renderProfileMenu();

  if (!status) return;

  status.textContent = loggedIn
    ? `Sesión iniciada como ${customerSession.user.displayName || "cliente"}.`
    : "Inicia sesión para guardar tus datos.";
}

async function loadCustomerProfile() {
  const status = document.getElementById("customer-account-status");

  try {
    const auth = await ensureCustomerAuth();
    customerSession = await auth.getSession();

    if (!customerSession?.idToken) {
      renderCustomerAuth();
      return;
    }

    const response = await fetch(ITM_PROFILE_URL, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${customerSession.idToken}`
      }
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || result?.ok !== true) {
      throw new Error(result?.code || "PROFILE_LOAD_FAILED");
    }

    customerProfile = result.profile || null;

    const nameInput = document.getElementById("customerName");
    const phoneInput = document.getElementById("customerPhone");
    const addressInput = document.getElementById("manualLocation");
    const referenceInput = document.getElementById("customerReference");

    if (customerProfile) {
      if (nameInput) nameInput.value = customerProfile.display_name || "";
      if (phoneInput) phoneInput.value = customerProfile.phone || "";
      if (addressInput) addressInput.value = customerProfile.address || "";
      if (referenceInput) referenceInput.value = customerProfile.reference || "";
    } else if (nameInput && !nameInput.value.trim()) {
      nameInput.value = customerSession.user.displayName || "";
    }

    renderCustomerAuth();
  } catch (error) {
    if (status) {
      status.textContent = "Puedes continuar como invitado.";
    }

    console.warn("Perfil de cliente no disponible:", error);
  }
}

async function loginCustomer() {
  const status = document.getElementById("customer-account-status");

  try {
    const auth = await ensureCustomerAuth();
    await auth.signInWithGoogle();
    await loadCustomerProfile();
  } catch (error) {
    if (status) {
      status.textContent = "No se pudo iniciar sesión.";
    }
  }
}

async function logoutCustomer() {
  try {
    const auth = await ensureCustomerAuth();
    await auth.signOut();

    customerSession = null;
    customerProfile = null;
    renderCustomerAuth();
  } catch (error) {
    console.warn("No se pudo cerrar sesión:", error);
  }
}

async function saveCustomerProfile() {
  const status = document.getElementById("customer-account-status");
  const nameInput = document.getElementById("customerName");
  const phoneInput = document.getElementById("customerPhone");
  const addressInput = document.getElementById("manualLocation");
  const referenceInput = document.getElementById("customerReference");

  if (!customerSession?.idToken) {
    if (status) status.textContent = "Inicia sesión primero.";
    return;
  }

  const displayName = nameInput?.value.trim() || "";

  if (!displayName) {
    if (status) status.textContent = "Escribe tu nombre.";
    return;
  }

  try {
    if (status) status.textContent = "Guardando datos...";

    const response = await fetch(ITM_PROFILE_URL, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${customerSession.idToken}`
      },
      body: JSON.stringify({
        display_name: displayName,
        phone: phoneInput?.value.trim() || "",
        address: addressInput?.value.trim() || "",
        reference: referenceInput?.value.trim() || ""
      })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || result?.ok !== true) {
      throw new Error(result?.code || "PROFILE_SAVE_FAILED");
    }

    customerProfile = result.profile || null;

    if (status) {
      status.textContent = "Datos guardados para próximos pedidos.";
    }
  } catch (error) {
    if (status) {
      status.textContent = "No se pudieron guardar tus datos.";
    }
  }
}

async function initCustomerProfilePage() {
  document
    .getElementById("customer-login-btn")
    ?.addEventListener("click", loginCustomer);

  document
    .getElementById("customer-logout-btn")
    ?.addEventListener("click", logoutCustomer);

  document
    .getElementById("customer-profile-form")
    ?.addEventListener("submit", event => {
      event.preventDefault();
      saveCustomerProfile();
    });

  await loadCustomerProfile();
}

async function initCart() {
  await loadCatalogProducts();
  await requestCartQuote({ quiet: true });
  renderCart();
  connectStoreLive();

  document.getElementById("storeDirectionsLink").href =
    STORE_LOCATION.directionsUrl;
  applyShippingMode();
  setLocationMethod(selectedLocationMethod);
  restoreCheckoutDraft();

  const syncVisibleCart = () => {
    if (document.visibilityState !== "visible") {
      return;
    }

    void requestCartQuote({ quiet: false });
  };

  window.addEventListener("focus", syncVisibleCart);

  document.addEventListener(
    "visibilitychange",
    syncVisibleCart
  );

  window.setInterval(() => {
    if (document.visibilityState === "visible") {
      void requestCartQuote({ quiet: false });
    }
  }, 30000);

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
    if (event.target.name === "shippingType") {
      applyShippingMode();
    }

    if (event.target.name === "locationMethod") {
      setLocationMethod(event.target.value, {
        clearAddress: event.target.value !== "address"
      });
    }

    if (event.target.name === "paymentMethod") {
      renderCheckoutPaymentOptions();
    }

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
  document.getElementById("checkoutForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const submitButton = form.querySelector("button[type='submit']");
    let items = cartItems();
    let checkoutQuoteRevision = "";

    if (!items.length) {
      showToast("Agrega productos antes de pedir");
      return;
    }

    const unavailableItem = items.find(
      (item) => item.product.cart_quote_available === false
    );

    if (unavailableItem) {
      showToast(
        `Quita ${unavailableItem.product.name} para continuar.`
      );
      return;
    }

    const customerName =
      document.getElementById("customerName")?.value.trim() || "";

    const shippingType =
      form.querySelector("input[name='shippingType']:checked")?.value ||
      "Entrega a domicilio";

    const paymentMethod =
      cartPaymentMethod(items) ||
      form.querySelector("input[name='paymentMethod']:checked")?.value ||
      "whatsapp";

    const paymentCode =
      document.getElementById("paymentCode")?.value.trim() || "";

    const isCodePayment = paymentMethod === "code";
    const allowedMethods = cartPaymentMethods(items);

    if (!allowedMethods.includes(paymentMethod)) {
      showToast("Este método no está disponible para todos los productos.");
      renderCheckoutPaymentOptions();
      return;
    }

    if (isCodePayment && storeMode !== "managed_orders") {
      showToast("El pago con código de confirmación no está disponible.");
      return;
    }

    if (isCodePayment && paymentCode !== "01") {
      showToast("Escribe un código de confirmación válido.");
      document.getElementById("paymentCode")?.focus();
      return;
    }

    const isDelivery = shippingType === "Entrega a domicilio";
    const deliveryNotes =
      document.getElementById("deliveryNotes")?.value.trim() || "";

    const deliveryLocation = selectedLocationText();

    const locationText = isDelivery
      ? formatLocationWithNotes(deliveryLocation, deliveryNotes)
      : `Pasar a buscar en tienda: ${STORE_LOCATION.address}
Horario: ${STORE_LOCATION.hours}
Como llegar: ${STORE_LOCATION.directionsUrl}`;

    if (!customerName) {
      showToast("Escribe el nombre del cliente");
      return;
    }

    if (isDelivery && !deliveryLocation) {
      showToast("Agrega ubicacion o direccion");
      return;
    }

    if (
      isDelivery &&
      selectedLocationMethod !== "address" &&
      !deliveryNotes
    ) {
      showToast("Agrega direccion o referencia para ubicarte");
      return;
    }

    if (!isCodePayment && !activeWhatsappNumber) {
      showToast("Pedidos por WhatsApp en configuración");
      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = isCodePayment
        ? "Validando pago..."
        : "Preparando WhatsApp...";
    }

    const whatsappLoading =
      document.getElementById("whatsappLoading");

    try {
      const revisionBeforeCheckout = cartQuoteState.revision;

      const quote = await requestCartQuote({
        quiet: false
      });

      items = cartItems();

      if (!quote || quote.valid !== true) {
        showToast(
          "Actualizamos tu carrito. Revisa los cambios antes de confirmar."
        );
        return;
      }

      const currentPaymentMethod = cartPaymentMethod(items);

      if (
        quote.revision !== revisionBeforeCheckout ||
        currentPaymentMethod !== paymentMethod
      ) {
        renderCheckoutPaymentOptions();

        showToast(
          "Actualizamos tu carrito. Revisa el total y confirma nuevamente."
        );

        return;
      }

      checkoutQuoteRevision = quote.revision;

      if (isCodePayment) {
        const orderResponse = await fetch(ITM_ORDERS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({
            payment_method: "code",
            customer_name: customerName,
            customer_phone: "",
            customer_note: locationText,
            quote_revision: checkoutQuoteRevision,
            items: items.map(({ product, quantity }) => ({
              product_id: product.id,
              quantity
            }))
          })
        });

        const orderResult = await orderResponse
          .json()
          .catch(() => ({}));

        if (
          !orderResponse.ok ||
          orderResult?.ok !== true ||
          !orderResult?.order?.id
        ) {
          throw new Error(
            orderResult?.code ||
              `ORDER_HTTP_${orderResponse.status}`
          );
        }

        const paymentResponse = await fetch(
          `${ITM_ORDERS_URL}&pay=1`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json"
            },
            body: JSON.stringify({
              order_id: orderResult.order.id,
              code: paymentCode
            })
          }
        );

        const paymentResult = await paymentResponse
          .json()
          .catch(() => ({}));

        if (
          !paymentResponse.ok ||
          paymentResult?.ok !== true
        ) {
          throw new Error(
            paymentResult?.code ||
              `PAYMENT_HTTP_${paymentResponse.status}`
          );
        }

        saveOrder(
          orderResult.order.id,
          customerName,
          locationText,
          shippingType,
          items,
          "",
          "code",
          "Pago confirmado con código de confirmación"
        );

        setCart({});
        clearCheckoutDraft();
        renderCart();

        showToast("Pago confirmado. Pedido registrado.");
        return;
      }

      const orderId = makeOrderId();
      const paymentLabel = "Por confirmar por WhatsApp";
      const paymentStatus = "Enviado por WhatsApp";

      const directMessage = buildWhatsAppMessage(
        orderId,
        customerName,
        locationText,
        shippingType,
        items,
        paymentLabel
      );

      const whatsappUrl =
        `https://wa.me/${activeWhatsappNumber}?text=${encodeURIComponent(
          directMessage
        )}`;

      const mobileWhatsappUrl =
        `whatsapp://send?phone=${activeWhatsappNumber}&text=${encodeURIComponent(
          directMessage
        )}`;

      saveOrder(
        orderId,
        customerName,
        locationText,
        shippingType,
        items,
        directMessage,
        "whatsapp",
        paymentStatus
      );

      setCart({});
      clearCheckoutDraft();
      renderCart();

      whatsappLoading?.classList.add("show");

      const isMobileDevice =
        /Android|iPhone|iPad|iPod/i.test(
          navigator.userAgent
        );

      if (isMobileDevice) {
        let appOpened = false;

        const markAppOpened = () => {
          if (document.visibilityState === "hidden") {
            appOpened = true;
          }
        };

        document.addEventListener(
          "visibilitychange",
          markAppOpened
        );

        window.location.href = mobileWhatsappUrl;

        window.setTimeout(() => {
          document.removeEventListener(
            "visibilitychange",
            markAppOpened
          );

          if (
            !appOpened &&
            document.visibilityState === "visible"
          ) {
            showToast(
              "No se pudo abrir WhatsApp. Abre la aplicación e inténtalo nuevamente."
            );
          }
        }, 2500);
      } else {
        window.open(whatsappUrl, "_blank", "noopener");
      }
    } catch (error) {
      const errorCode = String(error?.message || "");

      if (errorCode === "CART_CHANGED") {
        await requestCartQuote({
          quiet: true
        });

        showToast(
          "El catálogo cambió. Revisa tu carrito y confirma nuevamente."
        );
      } else {
        showToast(
          error?.message ||
            "No se pudo completar el pedido."
        );
      }
    } finally {
      whatsappLoading?.classList.remove("show");

      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent =
          paymentMethod === "code"
            ? "Confirmar con código"
            : "Hacer pedido por WhatsApp";
      }

      renderCheckoutPaymentOptions();
    }
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
  const number = order.whatsappNumber || activeWhatsappNumber;
  if (!number) return "#";
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
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
if (page === "perfil") initCustomerProfilePage();
