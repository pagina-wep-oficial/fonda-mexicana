let activeWhatsappNumber = "";
let activeStoreLiveUrl = "";
let storeLiveSocket = null;
let storeLiveRetry = 0;
let storeLiveTimer = 0;
let storeLiveClosing = false;
let storeSettingsRefreshTimer = 0;
let storeSettingsRefreshRequest = null;
let customerOrdersRefreshTimer = 0;
let homeFeaturedRefreshTimer = 0;
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
const ITM_COMMENTS_URL =
  `https://itm-void-excepcional.pages.dev/api/comments?project_id=${encodeURIComponent(ITM_PROJECT_ID)}&store_profile=1`;
const ITM_MY_ORDERS_URL = `${ITM_ORDERS_URL}&mine=1`;
const ITM_DELIVERY_LOCATION_URL =
  "https://itm-void-excepcional.pages.dev/api/store-delivery-location";
const STORE_CONFIG_URL = "/store-config.json";
const CATALOG_VIEW_KEY = `itm.catalog.view:${ITM_PROJECT_ID}`;
const CATALOG_CACHE_KEY = `itm.catalog.cache:${ITM_PROJECT_ID}`;
const CATALOG_CACHE_MAX_AGE_MS = 90 * 1000;
const CATALOG_REQUEST_TIMEOUT_MS = 8 * 1000;
const CATALOG_REQUEST_RETRIES = 1;
const OPINIONS_INTENT_KEY = `itm.opinions.intent:${ITM_PROJECT_ID}`;

function waitForCatalogRetry(delay = 350) {
  return new Promise((resolve) => window.setTimeout(resolve, delay));
}

async function fetchCatalogResponse(url, { signal } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= CATALOG_REQUEST_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, CATALOG_REQUEST_TIMEOUT_MS);

    signal?.addEventListener("abort", abortFromCaller, { once: true });

    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
        cache: "no-store"
      });

      if (!response.ok) return response;
      return response;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = timedOut
        ? new Error("CATALOG_TIMEOUT")
        : error;

      if (attempt === CATALOG_REQUEST_RETRIES) throw lastError;
      await waitForCatalogRetry();
    } finally {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  throw lastError || new Error("CATALOG_UNAVAILABLE");
}

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
function applyStorePickupSettings(pickup = {}) {
  const name = String(pickup.name || '').trim();
  const phone = String(pickup.phone || '').trim();
  const address = String(pickup.address || '').trim();
  const notes = String(pickup.notes || '').trim();
  const lat = Number(pickup.latitude);
  const lon = Number(pickup.longitude);
  if (name) STORE_LOCATION.name = name;
  if (phone) STORE_LOCATION.phone = phone;
  if (notes) STORE_LOCATION.notes = notes;

  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    STORE_LOCATION.address = name || "Ubicación exacta configurada";
    STORE_LOCATION.latitude = lat;
    STORE_LOCATION.longitude = lon;
    STORE_LOCATION.directionsUrl =
      "https://www.google.com/maps/dir/?api=1&destination=" +
      lat +
      "," +
      lon +
      "&travelmode=driving";
  } else if (address) {
    STORE_LOCATION.address = address;
    STORE_LOCATION.directionsUrl =
      "https://www.google.com/maps/dir/?api=1&destination=" +
      encodeURIComponent(address) +
      "&travelmode=driving";
  }
  renderStorePickupUi();
}

let customerSession = null;
let customerProfile = null;
let customerProfileBaseline = "";
let profileIdentityLoading = false;
let profileIdentityRequest = null;
let profileIdentityLoaded = false;
let profileActionIntent = "";
let opinionsComments = [];
let opinionsExpanded = false;
let selectedOpinionScore = 0;

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

function scheduleHomeFeaturedRefresh() {
  if (document.body.dataset.page !== "inicio" || homeFeaturedRefreshTimer) return;

  homeFeaturedRefreshTimer = window.setTimeout(() => {
    homeFeaturedRefreshTimer = 0;
    void loadHomeFeaturedProducts({ keepVisible: true });
  }, 350);
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
    scheduleHomeFeaturedRefresh();
    return;
  }

  if (
    event.type === "catalog_changed" ||
    event.type === "inventory_changed"
  ) {
    scheduleLiveCatalogRefresh(event);
    scheduleLiveDetailRefresh(event);
    scheduleLiveCartQuote();
    scheduleHomeFeaturedRefresh();
    return;
  }

  // Cambio de estado o entrega: solo afecta la vista de pedidos del cliente.
  if (event.type === "order_changed") {
    scheduleCustomerOrdersRefresh();
  }
}

function scheduleCustomerOrdersRefresh() {
  if (document.body.dataset.page !== "mis-pedidos") return;
  if (typeof refreshHistoryView !== "function") return;

  window.clearTimeout(customerOrdersRefreshTimer);
  customerOrdersRefreshTimer = window.setTimeout(() => {
    void refreshHistoryView();
  }, 250);
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
    {
      id: "nuevo",
      label: "Pedido recibido",
      client: "Pedido recibido · Esperando confirmación de pago"
    },
    {
      id: "pagado",
      label: "Pago confirmado",
      client: "Pago confirmado · Esperando atención de la tienda"
    },
    {
      id: "aceptado",
      label: "Pedido confirmado",
      client: "Pedido confirmado por la tienda"
    },
    {
      id: "alistando",
      label: "En preparación",
      client: "Tu pedido está en preparación"
    },
    {
      id: "listo",
      label: "Listo para recoger",
      client: "Ya puedes pasar a buscarlo"
    },
    {
      id: "retirado",
      label: "Retirado",
      client: "Pedido retirado"
    }
  ],
  delivery: [
    {
      id: "nuevo",
      label: "Pedido recibido",
      client: "Pedido recibido · Esperando confirmación de pago"
    },
    {
      id: "pagado",
      label: "Pago confirmado",
      client: "Pago confirmado · Esperando atención de la tienda"
    },
    {
      id: "aceptado",
      label: "Pedido confirmado",
      client: "Pedido confirmado por la tienda"
    },
    {
      id: "alistando",
      label: "En preparación",
      client: "Tu pedido está en preparación"
    },
    {
      id: "listo",
      label: "Listo para entrega",
      client: "Pedido listo para entrega"
    },
    {
      id: "asignado",
      label: "Repartidor asignado",
      client: "Repartidor asignado"
    },
    {
      id: "aceptado-repartidor",
      label: "Repartidor asignado",
      client: "Tu repartidor ya fue asignado"
    },
    {
      id: "recogido",
      label: "Pedido recogido",
      client: "Pedido recogido"
    },
    {
      id: "en-camino",
      label: "En camino",
      client: "Tu pedido va en camino"
    },
    {
      id: "entregado",
      label: "Entregado",
      client: "Pedido entregado"
    }
  ]
};

const MANAGED_DELIVERY_FLOW = ORDER_FLOWS.delivery.filter(
  (step) => !["asignado", "recogido"].includes(step.id)
);

const CANCELLED_STATUS = "cancelado";
const LEGACY_STATUS_MAP = { preparando: "alistando" };
// Estados de Neon traducidos al flujo que ya entiende la linea de tiempo.
const SERVER_STATUS_MAP = {
  pending: "nuevo",
  paid: "pagado",
  accepted: "aceptado",
  preparing: "alistando",
  ready_for_delivery: "listo",
  shipping: "en-camino",
  delivered: "entregado",
  cancelled: CANCELLED_STATUS,
  rejected: CANCELLED_STATUS
};
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
  configLoaded: false,
  settings: null
};

const cartQuoteState = {
  items: new Map(),
  revision: "",
  inFlight: null
};

const cartViewState = {
  resolving: false
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
let currentGpsCoords = null;
let selectedMapCoords = null;
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
    ? `<a href="${escapeHtml(location.url)}" target="_blank" rel="noopener">Cómo llegar</a>`
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

  writeSessionJson(CATALOG_CACHE_KEY, {
    version: 1,
    saved_at: Date.now(),
    category: activeCategory,
    query: catalogState.query,
    items: catalogState.items,
    categories: catalogState.categories,
    next_offset: catalogState.nextOffset,
    has_more: catalogState.hasMore,
    settings: catalogState.settings || {}
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

function getCatalogCache(saved) {
  const cached = readSessionJson(CATALOG_CACHE_KEY, null);

  if (
    !cached ||
    cached.version !== 1 ||
    Date.now() - Number(cached.saved_at || 0) > CATALOG_CACHE_MAX_AGE_MS ||
    String(cached.category || "Todos") !== String(saved?.category || "Todos") ||
    String(cached.query || "") !== String(saved?.query || "") ||
    !Array.isArray(cached.items) ||
    !cached.items.length
  ) {
    return null;
  }

  return {
    items: cached.items.map(mapPublicCatalogProduct),
    categories: Array.isArray(cached.categories)
      ? cached.categories.map(String).filter(Boolean)
      : ["Todos"],
    nextOffset: Number.isInteger(cached.next_offset)
      ? cached.next_offset
      : null,
    hasMore: cached.has_more === true,
    settings:
      cached.settings && typeof cached.settings === "object"
        ? cached.settings
        : {}
  };
}

function restoreCatalogCache(cached) {
  applyStorePaymentSettings(cached.settings);
  catalogState.items = cached.items;
  catalogState.categories = cached.categories.includes("Todos")
    ? cached.categories
    : ["Todos", ...cached.categories];
  catalogState.nextOffset = cached.nextOffset;
  catalogState.hasMore = cached.hasMore;
  catalogState.settings = cached.settings;
  products = catalogState.items;

  document.body.classList.add("catalog-view-restoring");
  renderFilters();
  renderCatalog();
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

  const cached = getCatalogCache(saved);

  if (cached) {
    restoreCatalogCache(cached);

    const staticConfig = loadStaticStoreConfig().finally(() => {
      catalogState.configLoaded = true;
    });

    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });

    restoreCatalogScroll(saved);
    document.body.classList.remove("catalog-view-restoring");
    clearCatalogViewState();

    await staticConfig;

    if (typeof onInitialCatalogReady === "function") {
      onInitialCatalogReady();
    }

    await loadCatalogProducts({ reset: true, keepVisible: true });
    await finishCatalogViewRestore(saved);
    return;
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

function usesInventoryControl(product) {
  return (
    storeMode === "managed_orders" &&
    product?.inventory_enabled === true
  );
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

  if (
    order?.fromServer === true &&
    !isPickupOrder(order) &&
    rawStatus === "listo" &&
    hasDeliveryClaim(order)
  ) {
    return "aceptado-repartidor";
  }

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
  if (order?.fromServer === true && !isPickupOrder(order)) {
    return MANAGED_DELIVERY_FLOW;
  }

  return isPickupOrder(order)
    ? ORDER_FLOWS.pickup
    : ORDER_FLOWS.delivery;
}

function hasDeliveryClaim(order) {
  if (Array.isArray(order?.timeline)) {
    return order.timeline.some((entry) => entry?.type === "claim");
  }

  return order?.deliveryClaimed === true;
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

function customerProfileIsConfigured() {
  return Boolean(String(customerProfile?.display_name || "").trim());
}

async function createInitialCustomerProfile() {
  const displayName = String(
    customerSession?.user?.displayName || ""
  ).trim();

  if (!customerSession?.idToken || !displayName) {
    return false;
  }

  try {
    const response = await fetch(ITM_PROFILE_URL, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${customerSession.idToken}`
      },
      body: JSON.stringify({
        display_name: displayName,
        phone: "",
        address: "",
        reference: ""
      })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || result?.ok !== true) {
      throw new Error(result?.code || "PROFILE_INITIAL_SAVE_FAILED");
    }

    customerProfile = result.profile || null;
    return true;
  } catch (error) {
    console.warn("No se pudo crear el perfil inicial.", error);
    return false;
  }
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
      : profileActionIntent === "comment"
        ? "Inicia sesión para comentar y facilitar tus pedidos."
        : profileActionIntent === "rating"
          ? "Inicia sesión para calificar y facilitar tus pedidos."
          : "Inicia sesión para guardar tus datos y facilitar tus pedidos.";
  }

  if(loginButton)loginButton.hidden=loggedIn;
  if(profileLink)profileLink.hidden=!loggedIn;
  if(ordersLink)ordersLink.hidden=!loggedIn;
  if(logoutButton)logoutButton.hidden=!loggedIn;
}

async function loadProfileIdentity({ force = false } = {}){
  if (profileIdentityRequest) {
    await profileIdentityRequest;
    if (!force) return;
  }

  if (profileIdentityLoaded && !force) return;

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
      profileIdentityLoaded = true;
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
  profileActionIntent="";
  await loadProfileIdentity();
  overlay.hidden=false;
  renderProfileMenu();
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
      await loadProfileIdentity({ force: true });

      const firstProfile = !customerProfileIsConfigured();

      if (firstProfile) {
        const returnTo = profileActionIntent
          ? "&return=index.html%23opiniones"
          : "";
        if (!profileActionIntent) {
          await createInitialCustomerProfile();
        }
        window.location.assign(`perfil-de-usuario.html?setup=1${returnTo}`);
        return;
      }

      close();
      window.dispatchEvent(new CustomEvent("itm:customer-ready", {
        detail: { intent: profileActionIntent }
      }));
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

  if (usesInventoryControl(product)) {
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

  if (usesInventoryControl(product)) {
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
    usesInventoryControl(product) &&
    product.available_quantity <= 0;

  const stockLabel = usesInventoryControl(product)
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
      ${productImageMarkup(product)}

      <div class="product-body">
        <div class="product-meta">
          <span class="category">${
            String(product.category || "").toLowerCase() === "destacados"
              ? "Destacados"
              : product.category
          }</span>
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
  const allMedia = Array.isArray(product.media)
    ? product.media
    : [];
  const media = allMedia
    .filter((item) => item?.media_type === "image" && item.source_url)
    .sort((left, right) => Number(right.is_primary) - Number(left.is_primary) || Number(left.sort_order) - Number(right.sort_order));
  const video = allMedia.find((item) => item?.media_type === "video" && item.source_url) || null;

  return {
    id: String(product.id),
    name: String(product.name || "Producto"),
    category: String(product.category || "Otros"),
    featured: product.featured === true,
    price: Number(product.price) || 0,
    compare_at_price: Number(product.compare_at_price) || 0,
    unit_label: String(product.unit_label || "").trim(),
    description: String(product.description || ""),
    image_url: String(product.image_url || media[0]?.source_url || ""),
    media,
    video,
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

function productGallery(product) {
  const media = Array.isArray(product?.media)
    ? product.media.filter((item) => item?.source_url && item.media_type !== "video")
    : [];

  return media.length
    ? media
    : product?.image_url
      ? [{ source_url: product.image_url, fit_mode: "cover", focal_x: 50, focal_y: 50, zoom: 1, rotation: 0 }]
      : [];
}

function productVideo(product) {
  return product?.video?.source_url ? product.video : null;
}

function productDetailMedia(product) {
  const images = productGallery(product);
  const media = images.length ? images : [productPrimaryMedia(product)];
  const video = productVideo(product);
  return video ? [...media, { ...video, media_type: "video" }] : media;
}

function productPrimaryMedia(product) {
  return productGallery(product).find((item) => item.is_primary) ||
    productGallery(product)[0] ||
    { source_url: GENERIC_IMAGE, fit_mode: "cover", focal_x: 50, focal_y: 50, zoom: 1, rotation: 0 };
}

function productImageStyle(media) {
  const fit = media?.fit_mode === "contain" ? "contain" : "cover";
  const x = Math.max(0, Math.min(100, Number(media?.focal_x ?? 50)));
  const y = Math.max(0, Math.min(100, Number(media?.focal_y ?? 50)));
  const zoom = Math.max(1, Math.min(3, Number(media?.zoom ?? 1)));
  const rotation = Math.max(-180, Math.min(180, Number(media?.rotation ?? 0)));

  return `object-fit:${fit};object-position:${x}% ${y}%;transform:scale(${zoom}) rotate(${rotation}deg)`;
}

function productImageMarkup(product, className = "", loading = "lazy") {
  const media = productPrimaryMedia(product);

  return `<img${className ? ` class="${className}"` : ""} src="${escapeHtml(media.source_url || GENERIC_IMAGE)}" alt="${escapeHtml(product.name)}" loading="${loading}" style="${productImageStyle(media)}">`;
}

function detailMediaMarkup(media, product) {
  if (media?.media_type === "video") {
    return `<video class="detail-main-video" controls preload="metadata" playsinline src="${escapeHtml(media.source_url)}">Tu navegador no puede reproducir este video.</video>`;
  }
  return `<img class="detail-main-image" src="${escapeHtml(media?.source_url || GENERIC_IMAGE)}" alt="${escapeHtml(product.name)}" loading="eager" style="${productImageStyle(media)}">`;
}

function detailThumbnailMarkup(media, product, index, active) {
  if (media?.media_type === "video") {
    return `<button type="button" class="detail-thumbnail detail-thumbnail-video${active ? " active" : ""}" data-detail-media="${index}" aria-label="Ver video del producto"><span aria-hidden="true">▶</span><small>Video</small></button>`;
  }
  return `<button type="button" class="detail-thumbnail${active ? " active" : ""}" data-detail-media="${index}" aria-label="Ver foto ${index + 1}"><img src="${escapeHtml(media.source_url)}" alt="${escapeHtml(product.name)}" style="${productImageStyle(media)}"></button>`;
}

async function fetchPublicCatalogProduct(productId) {
  const endpoint = new URL(ITM_PRODUCTS_URL);

  endpoint.searchParams.set("limit", "1");
  endpoint.searchParams.set("offset", "0");
  endpoint.searchParams.set("id", String(productId));

  const response = await fetchCatalogResponse(endpoint);

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

async function loadCatalogProducts({ reset = true, productId = null, keepVisible = false } = {}) {
  if (!reset && (!catalogState.hasMore || catalogState.loading)) {
    return;
  }

  if (reset) {
    catalogRequestController?.abort();
    catalogState.items = [];
    catalogState.nextOffset = 0;
    catalogState.hasMore = true;

    const grid = document.getElementById("productGrid");
    if (grid && !keepVisible) {
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

    const response = await fetchCatalogResponse(endpoint, {
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
    catalogState.settings = body.settings || {};

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
    return true;
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.error(
        "No se pudo cargar el catálogo ITM:",
        error
      );

      const grid = document.getElementById("productGrid");

      if (grid && reset) {
        grid.innerHTML =
          `<div class="empty-state"><strong>No pudimos cargar los productos.</strong><button type="button" class="button secondary" data-retry-catalog>Reintentar</button></div>`;
        grid.querySelector("[data-retry-catalog]")?.addEventListener("click", () => {
          void loadCatalogProducts({ reset: true });
        });
      }
    }
    return false;
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

  window.addEventListener("pagehide", () => {
    stopCustomerTracking();
    persistCatalogView();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      persistCatalogView();
    }
  });

  await restoreCatalogViewState(() => {
    connectStoreLive();
  });
}

function homeFeaturedProductCard(product) {
  const productName = escapeHtml(product.name);
  const productCategory = escapeHtml(product.category || "Producto");
  const productDescription = escapeHtml(product.description || "");
  const productUrl = `detalle.html?id=${encodeURIComponent(product.id)}`;

  return `
    <article class="home-featured-card">
      <a class="home-featured-image" href="${productUrl}">
      <div class="product-media-frame">${productImageMarkup(product)}</div>
      </a>

      <div class="home-featured-body">
        <p class="home-featured-category">${productCategory}</p>
        <h3><a href="${productUrl}">${productName}</a></h3>

        ${
          productDescription
            ? `<p class="home-featured-description">${productDescription}</p>`
            : ""
        }

        <div class="home-featured-bottom">
          <div>
            ${renderProductPrice(product)}
            ${
              productUnitText(product)
                ? `<small>${escapeHtml(productUnitText(product))}</small>`
                : ""
            }
          </div>

          <a class="button primary small" href="${productUrl}">
            Ver producto
          </a>
        </div>
      </div>
    </article>
  `;
}

async function loadHomeFeaturedProducts({ keepVisible = false } = {}) {
  const holder = document.getElementById("homeFeaturedProducts");

  if (!holder) return false;

  try {
    const endpoint = new URL(ITM_PRODUCTS_URL);

    endpoint.searchParams.set("limit", "24");
    endpoint.searchParams.set("offset", "0");

    const response = await fetchCatalogResponse(endpoint);

    const body = await response.json().catch(() => ({}));

    if (
      !response.ok ||
      body?.ok !== true ||
      !Array.isArray(body.products)
    ) {
      throw new Error(
        body?.code || `HOME_PRODUCTS_HTTP_${response.status}`
      );
    }

    applyStorePaymentSettings(body.settings || {});

    const catalogProducts = body.products.map(
      mapPublicCatalogProduct
    );

    products = catalogProducts;

    const featuredProducts = catalogProducts
      .filter((product) => product.featured === true)
      .slice(0, 3);

    if (!featuredProducts.length) {
      holder.innerHTML = `
        <div class="home-products-empty">
          <strong>Pronto habrá productos destacados aquí.</strong>
          <a class="button secondary" href="tienda.html">
            Explorar productos
          </a>
        </div>
      `;
      return true;
    }

    holder.innerHTML = featuredProducts
      .map(homeFeaturedProductCard)
      .join("");
    return true;

  } catch (error) {
    console.warn(
      "No se pudieron cargar los productos destacados:",
      error
    );

    if (!keepVisible) {
      holder.innerHTML = `
        <div class="home-products-empty">
          <strong>No pudimos cargar los productos ahora.</strong>
          <button type="button" class="button secondary" data-retry-home-products>Reintentar</button>
        </div>
      `;
      holder.querySelector("[data-retry-home-products]")?.addEventListener("click", () => {
        void loadHomeFeaturedProducts();
      });
    }
    return false;
  }
}

async function initHome() {
  await loadStaticStoreConfig();
  connectStoreLive();
  await loadHomeFeaturedProducts();
}

function opinionIntent() {
  try {
    const value = sessionStorage.getItem(OPINIONS_INTENT_KEY);
    return value === "comment" || value === "rating" ? value : "";
  } catch {
    return "";
  }
}

function setOpinionIntent(intent = "") {
  profileActionIntent = intent === "comment" || intent === "rating" ? intent : "";
  try {
    if (profileActionIntent) sessionStorage.setItem(OPINIONS_INTENT_KEY, profileActionIntent);
    else sessionStorage.removeItem(OPINIONS_INTENT_KEY);
  } catch {
    // El sitio sigue funcionando aunque el navegador no permita sessionStorage.
  }
}

function opinionDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
}

function renderOpinionsComments(comments = []) {
  const list = document.querySelector("[data-opinions-list]");
  const toggle = document.querySelector("[data-opinions-toggle]");
  if (!list) return;

  opinionsComments = Array.isArray(comments) ? comments : [];

  if (!opinionsComments.length) {
    list.innerHTML = `
      <p class="fonda-comments-empty">
        Aún no hay comentarios. Sé la primera persona en compartir su experiencia.
      </p>
    `;
    if (toggle) toggle.hidden = true;
    return;
  }

  const visibleComments = opinionsExpanded ? opinionsComments : opinionsComments.slice(0, 5);
  list.innerHTML = visibleComments.map((comment, index) => {
    const commentId = String(comment.id || "");
    const isOwnComment = opinionBelongsToCurrentCustomer(comment);

    return `
    <article class="fonda-comment-card" style="--comment-index:${index}">
      <header>
        <strong>${escapeHtml(comment.author_name || "Cliente")}</strong>
        <time>${escapeHtml(opinionDate(comment.created_at))}</time>
      </header>
      <p>${escapeHtml(comment.content || "")}</p>
      ${isOwnComment ? `
        <div class="fonda-comment-actions" aria-label="Opciones de tu comentario">
          <button class="fonda-comment-action-link" type="button" data-opinion-edit="${escapeHtml(commentId)}">Editar</button>
          <button class="fonda-comment-action-link is-danger" type="button" data-opinion-delete="${escapeHtml(commentId)}">Eliminar</button>
        </div>
      ` : ""}
    </article>
  `;
  }).join("");

  bindOpinionCommentActions(list);

  if (toggle) {
    const remaining = Math.max(0, opinionsComments.length - 5);
    toggle.hidden = remaining === 0;
    toggle.textContent = opinionsExpanded ? "Ver menos comentarios" : "Ver más comentarios";
  }
}

function opinionBelongsToCurrentCustomer(comment) {
  const customerUid = String(customerSession?.user?.uid || "");
  return Boolean(
    customerUid &&
    String(comment?.firebase_uid || "") === customerUid
  );
}

function closeOpinionCommentModal() {
  document.querySelector("[data-opinion-comment-modal]")?.remove();
}

function showOpinionCommentModal(kind, commentId) {
  const comment = opinionsComments.find((item) => String(item?.id || "") === String(commentId || ""));
  if (!comment || !opinionBelongsToCurrentCustomer(comment)) return;

  closeOpinionCommentModal();
  const isDelete = kind === "delete";
  const modal = document.createElement("div");
  modal.className = "fonda-comment-modal";
  modal.dataset.opinionCommentModal = "";
  modal.tabIndex = -1;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "opinion-comment-modal-title");
  modal.innerHTML = isDelete ? `
    <section class="fonda-comment-modal-card">
      <button class="fonda-comment-modal-close" type="button" data-opinion-modal-close aria-label="Cerrar">×</button>
      <p class="fonda-modal-eyebrow">TU COMENTARIO</p>
      <h2 id="opinion-comment-modal-title">¿Eliminar comentario?</h2>
      <p>Dejará de aparecer para las personas que visiten la página. Esta acción no se puede deshacer.</p>
      <div class="fonda-comment-modal-actions">
        <button class="button secondary" type="button" data-opinion-modal-close>Conservar comentario</button>
        <button class="button primary fonda-modal-danger" type="button" data-opinion-delete-confirm>Eliminar</button>
      </div>
      <p class="fonda-comment-modal-status" data-opinion-modal-status role="status"></p>
    </section>
  ` : `
    <section class="fonda-comment-modal-card">
      <button class="fonda-comment-modal-close" type="button" data-opinion-modal-close aria-label="Cerrar">×</button>
      <p class="fonda-modal-eyebrow">TU COMENTARIO</p>
      <h2 id="opinion-comment-modal-title">Editar comentario</h2>
      <form data-opinion-modal-edit-form>
        <label for="opinion-modal-edit-input">Tu comentario</label>
        <textarea id="opinion-modal-edit-input" data-opinion-modal-edit-input maxlength="2000">${escapeHtml(comment.content || "")}</textarea>
        <div class="fonda-comment-modal-actions">
          <button class="button secondary" type="button" data-opinion-modal-close>Cancelar</button>
          <button class="button primary" type="submit">Guardar cambios</button>
        </div>
        <p class="fonda-comment-modal-status" data-opinion-modal-status role="status"></p>
      </form>
    </section>
  `;

  document.body.append(modal);
  modal.querySelectorAll("[data-opinion-modal-close]").forEach((button) => {
    button.addEventListener("click", closeOpinionCommentModal);
  });
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeOpinionCommentModal();
  });
  modal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeOpinionCommentModal();
  });

  if (isDelete) {
    modal.querySelector("[data-opinion-delete-confirm]")?.addEventListener("click", () => {
      void deleteOpinionComment(comment.id, modal);
    });
    window.requestAnimationFrame(() => modal.querySelector("[data-opinion-delete-confirm]")?.focus());
  } else {
    modal.querySelector("[data-opinion-modal-edit-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const content = modal.querySelector("[data-opinion-modal-edit-input]")?.value.trim() || "";
      void saveOpinionEdit(comment.id, content, modal);
    });
    window.requestAnimationFrame(() => modal.querySelector("[data-opinion-modal-edit-input]")?.focus());
  }
}

async function saveOpinionEdit(commentId, content, modal) {
  const status = document.querySelector("[data-opinions-status]");
  const modalStatus = modal?.querySelector("[data-opinion-modal-status]");

  if (!content) {
    if (modalStatus) modalStatus.textContent = "Tu comentario no puede quedar vacío.";
    return;
  }

  await loadProfileIdentity();
  if (!customerSession?.idToken) {
    if (status) status.textContent = "Inicia sesión para editar tu comentario.";
    return;
  }

  try {
    if (modalStatus) modalStatus.textContent = "Guardando cambios…";
    const response = await fetch(ITM_COMMENTS_URL, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${customerSession.idToken}`
      },
      body: JSON.stringify({
        project_id: ITM_PROJECT_ID,
        comment_id: commentId,
        content
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok !== true) throw new Error(body?.code || "COMMENT_UPDATE_FAILED");

    closeOpinionCommentModal();
    if (status) status.textContent = "Tu comentario fue actualizado.";
    await loadOpinions();
  } catch (error) {
    if (modalStatus) modalStatus.textContent = "No se pudo guardar tu comentario. Inténtalo de nuevo.";
  }
}

async function deleteOpinionComment(commentId, modal) {
  const status = document.querySelector("[data-opinions-status]");
  const modalStatus = modal?.querySelector("[data-opinion-modal-status]");

  await loadProfileIdentity();
  if (!customerSession?.idToken) {
    if (status) status.textContent = "Inicia sesión para eliminar tu comentario.";
    return;
  }

  try {
    if (modalStatus) modalStatus.textContent = "Eliminando comentario…";
    const response = await fetch(ITM_COMMENTS_URL, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${customerSession.idToken}`
      },
      body: JSON.stringify({
        project_id: ITM_PROJECT_ID,
        comment_id: String(commentId || "")
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok !== true) throw new Error(body?.code || "COMMENT_DELETE_FAILED");

    closeOpinionCommentModal();
    if (status) status.textContent = "Tu comentario fue eliminado.";
    await loadOpinions();
  } catch (error) {
    if (modalStatus) modalStatus.textContent = "No se pudo eliminar tu comentario. Inténtalo de nuevo.";
  }
}

function bindOpinionCommentActions(list) {
  list.querySelectorAll("[data-opinion-edit]").forEach((button) => {
    button.addEventListener("click", () => showOpinionCommentModal("edit", button.dataset.opinionEdit));
  });

  list.querySelectorAll("[data-opinion-delete]").forEach((button) => {
    button.addEventListener("click", () => showOpinionCommentModal("delete", button.dataset.opinionDelete));
  });
}

function updateOpinionStars(previewScore = 0) {
  const activeScore = previewScore || selectedOpinionScore;
  document.querySelectorAll("[data-opinions-score]").forEach((button) => {
    const score = Number(button.dataset.opinionsScore);
    button.classList.toggle("is-preview", Boolean(previewScore) && score <= previewScore);
    button.classList.toggle("is-selected", !previewScore && score <= selectedOpinionScore);
    button.setAttribute("aria-pressed", String(score === activeScore));
  });
}

function renderOpinionsRating({ average = 0, count = 0 } = {}) {
  const averageNode = document.querySelector("[data-opinions-average]");
  const countNode = document.querySelector("[data-opinions-count]");
  if (averageNode) averageNode.textContent = count ? Number(average).toFixed(1) : "—";
  if (countNode) {
    countNode.textContent = count
      ? `${count} ${Number(count) === 1 ? "reseña" : "reseñas"}`
      : "Aún no hay reseñas";
  }
}

async function loadOpinions() {
  const status = document.querySelector("[data-opinions-status]");
  try {
    const ratingUrl = new URL(ITM_COMMENTS_URL);
    ratingUrl.searchParams.set("mode", "rating");
    const [commentsResponse, ratingResponse] = await Promise.all([
      fetch(ITM_COMMENTS_URL, { headers: { Accept: "application/json" }, cache: "no-store" }),
      fetch(ratingUrl, { headers: { Accept: "application/json" }, cache: "no-store" })
    ]);
    const commentsBody = await commentsResponse.json().catch(() => ({}));
    const ratingBody = await ratingResponse.json().catch(() => ({}));
    if (!commentsResponse.ok || commentsBody?.ok !== true) throw new Error(commentsBody?.code || "COMMENTS_LOAD_FAILED");

    renderOpinionsComments(Array.isArray(commentsBody.comments) ? commentsBody.comments : []);
    renderOpinionsRating(ratingBody?.ok === true ? ratingBody : {});
    if (status) status.textContent = "";
  } catch (error) {
    console.warn("No se pudieron cargar las opiniones.", error);
    renderOpinionsComments([]);
    if (status) status.textContent = "No pudimos cargar las opiniones ahora.";
  }
}

function showOpinionForm(intent) {
  const composer = document.querySelector("[data-opinions-composer]");
  const rating = document.querySelector("[data-opinions-rating]");
  const status = document.querySelector("[data-opinions-status]");
  if (!composer || !rating) return;

  composer.hidden = intent !== "comment";
  rating.hidden = intent !== "rating";
  if (intent === "rating") {
    selectedOpinionScore = 0;
    updateOpinionStars();
  }
  if (status) status.textContent = "";
  if (intent === "comment") composer.querySelector("textarea")?.focus();
}

async function openOpinionAction(intent) {
  setOpinionIntent(intent);
  await loadProfileIdentity();

  if (!customerSession?.idToken) {
    const overlay = document.querySelector("[data-profile-overlay]");
    if (overlay) {
      overlay.hidden = false;
      renderProfileMenu();
    }
    return;
  }

  if (!customerProfileIsConfigured()) {
    window.location.assign("perfil-de-usuario.html?setup=1&return=index.html%23opiniones");
    return;
  }

  showOpinionForm(intent);
}

async function submitOpinionComment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const textarea = form.querySelector("textarea");
  const status = document.querySelector("[data-opinions-status]");
  const content = textarea?.value.trim() || "";
  if (!content) {
    if (status) status.textContent = "Escribe tu comentario antes de publicarlo.";
    return;
  }

  await loadProfileIdentity();
  if (!customerSession?.idToken || !customerProfileIsConfigured()) {
    await openOpinionAction("comment");
    return;
  }

  try {
    if (status) status.textContent = "Publicando comentario…";
    const response = await fetch(ITM_COMMENTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${customerSession.idToken}`
      },
      body: JSON.stringify({ project_id: ITM_PROJECT_ID, content })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok !== true) throw new Error(body?.code || "COMMENT_SAVE_FAILED");
    textarea.value = "";
    form.hidden = true;
    setOpinionIntent("");
    if (status) status.textContent = "Tu comentario ya está publicado.";
    await loadOpinions();
  } catch (error) {
    if (status) status.textContent = "No se pudo publicar tu comentario. Inténtalo de nuevo.";
  }
}

async function submitOpinionRating(score) {
  const status = document.querySelector("[data-opinions-status]");
  selectedOpinionScore = score;
  updateOpinionStars();
  document.querySelector(".fonda-rating-options")?.classList.add("is-celebrating");
  await loadProfileIdentity();
  if (!customerSession?.idToken || !customerProfileIsConfigured()) {
    document.querySelector(".fonda-rating-options")?.classList.remove("is-celebrating");
    await openOpinionAction("rating");
    return;
  }

  try {
    if (status) status.textContent = "Guardando tu calificación…";
    const response = await fetch(`${ITM_COMMENTS_URL}&mode=rating`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${customerSession.idToken}`
      },
      body: JSON.stringify({ project_id: ITM_PROJECT_ID, rating: score })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok !== true) throw new Error(body?.code || "RATING_SAVE_FAILED");
    document.querySelector("[data-opinions-rating]").hidden = true;
    document.querySelector(".fonda-rating-options")?.classList.remove("is-celebrating");
    setOpinionIntent("");
    if (status) status.textContent = "Tu calificación ya está publicada.";
    renderOpinionsRating(body);
  } catch (error) {
    document.querySelector(".fonda-rating-options")?.classList.remove("is-celebrating");
    if (status) status.textContent = "No se pudo guardar tu calificación. Inténtalo de nuevo.";
  }
}

function initOpinions() {
  if (!document.querySelector("[data-opinions-list]")) return;

  document.querySelector("[data-opinions-open-comment]")?.addEventListener("click", () => openOpinionAction("comment"));
  document.querySelector("[data-opinions-open-rating]")?.addEventListener("click", () => openOpinionAction("rating"));
  document.querySelector("[data-opinions-composer]")?.addEventListener("submit", submitOpinionComment);
  document.querySelectorAll("[data-opinions-score]").forEach((button) => {
    button.addEventListener("pointerenter", () => updateOpinionStars(Number(button.dataset.opinionsScore)));
    button.addEventListener("focus", () => updateOpinionStars(Number(button.dataset.opinionsScore)));
    button.addEventListener("click", () => submitOpinionRating(Number(button.dataset.opinionsScore)));
  });
  document.querySelector(".fonda-rating-options")?.addEventListener("pointerleave", () => updateOpinionStars());
  document.querySelector(".fonda-rating-options")?.addEventListener("focusout", (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) updateOpinionStars();
  });
  document.querySelector("[data-opinions-toggle]")?.addEventListener("click", () => {
    opinionsExpanded = !opinionsExpanded;
    renderOpinionsComments(opinionsComments);
  });
  document.querySelectorAll("[data-opinions-cancel]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector("[data-opinions-composer]").hidden = true;
      document.querySelector("[data-opinions-rating]").hidden = true;
      setOpinionIntent("");
    });
  });
  window.addEventListener("itm:customer-ready", (event) => {
    renderOpinionsComments(opinionsComments);
    const intent = event.detail?.intent || opinionIntent();
    if (intent) showOpinionForm(intent);
  });

  void loadOpinions();
  void loadProfileIdentity().then(() => renderOpinionsComments(opinionsComments));
  const pendingIntent = opinionIntent();
  if (pendingIntent) {
    void openOpinionAction(pendingIntent);
  }
}

async function initDetail({ preferredQuantity = null } = {}) {
  const holder = document.getElementById("detailView");
  if (!holder) return;

  const id = new URLSearchParams(window.location.search).get("id");

  const catalogLoaded = await loadCatalogProducts({
    reset: true,
    productId: id
  });

  connectStoreLive();

  if (!catalogLoaded) {
    holder.innerHTML = `
      <div class="empty-state">
        <strong>No pudimos cargar este producto.</strong>
        <button type="button" class="button secondary" data-retry-detail-product>Reintentar</button>
      </div>
    `;
    holder.querySelector("[data-retry-detail-product]")?.addEventListener("click", () => {
      void initDetail({ preferredQuantity });
    });
    return;
  }

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
    usesInventoryControl(product) &&
    product.available_quantity <= 0;

  const detailMaxQuantity =
    usesInventoryControl(product)
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
  const detailMedia = productDetailMedia(product);
  const selectedDetailMedia = detailMedia[0];

  holder.innerHTML = `
    <div class="detail-gallery" data-detail-gallery>
      <div class="detail-media">
        ${detailMediaMarkup(selectedDetailMedia, product)}
      </div>
      ${detailMedia.length > 1 ? `<div class="detail-thumbnails">${detailMedia.map((media, index) => detailThumbnailMarkup(media, product, index, index === 0)).join("")}</div>` : ""}
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

      ${usesInventoryControl(product)
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

  holder.querySelectorAll("[data-detail-media]").forEach((button) => {
    button.addEventListener("click", () => {
      const media = detailMedia[Number(button.dataset.detailMedia)];
      const frame = holder.querySelector(".detail-media");
      if (!media || !frame) return;
      frame.innerHTML = detailMediaMarkup(media, product);
      holder.querySelectorAll("[data-detail-media]").forEach((item) => item.classList.toggle("active", item === button));
    });
  });

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

    if (usesInventoryControl(product) && current >= product.available_quantity) {
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
  const hasItems = items.length > 0;
  const checkoutForm = document.getElementById("checkoutForm");
  const clearCartButton = document.getElementById("clearCartBtn");
  const continueShoppingLink = document.getElementById(
    "continueShoppingLink"
  );
  const layout = holder.closest(".cart-layout");

  checkoutForm?.toggleAttribute("hidden", !hasItems);
  clearCartButton?.toggleAttribute("hidden", !hasItems);
  continueShoppingLink?.toggleAttribute("hidden", !hasItems);
  layout?.classList.toggle("is-empty", !hasItems);
  layout?.setAttribute("aria-busy", String(cartViewState.resolving));

  if (cartViewState.resolving) {
    if (total) total.textContent = "—";

    holder.innerHTML = `
      <div class="empty-state cart-loading-state" role="status" aria-live="polite">
        <span class="cart-loading-spinner" aria-hidden="true"></span>
        Preparando tu carrito…
      </div>
    `;
    return;
  }

  // El formulario empieza oculto desde el propio HTML para evitar que aparezca
  // antes de saber si el carrito tiene productos.
  checkoutForm?.style.removeProperty("display");

  if (total) total.textContent = money(cartTotal(items));

  if (!hasItems) {
    holder.innerHTML = `
      <div class="empty-state">
        <strong>Tu carrito está vacío</strong>
        <span>Cuando agregues productos, aquí podrás revisar tu pedido y elegir cómo obtenerlo.</span>
        <a class="button secondary" href="tienda.html">Explorar productos</a>
      </div>
    `;
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
    "━━━━━━━━━━━━━━"
  ];
  return lines.join("\n");
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
    // Los pedidos de WhatsApp se confirman en el chat: no llevan codigo de
    // entrega. El codigo solo existe para pedidos gestionados en Neon.
    deliveryCode: "",
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
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;
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
  currentGpsCoords = null;
  setGpsPreview(null);
}

function clearMapLocation() {
  mapLocation = "";
  selectedMapCoords = null;
  setMapPreview(null);
}

function selectedLocationCoords() {
  if (selectedLocationMethod === "gps") return currentGpsCoords;
  if (selectedLocationMethod === "map") return selectedMapCoords;
  return null;
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
  const profileForm = document.getElementById("customer-profile-form");

  const loggedIn = Boolean(customerSession?.user);

  if (loginButton) loginButton.hidden = loggedIn;
  if (logoutButton) logoutButton.hidden = !loggedIn;
  if (profileForm) profileForm.hidden = !loggedIn;

  if (!loggedIn && saveButton) {
    saveButton.hidden = true;
    saveButton.disabled = true;
  }

  renderProfileMenu();

  if (!status) return;

  if (!loggedIn) {
    status.hidden = true;
    return;
  }

  if (customerProfile) {
    status.hidden = false;
    status.textContent = "✓ Tus datos están guardados para tus próximos pedidos.";
  } else {
    status.hidden = true;
  }

  updateCustomerProfileSaveState();
}

function customerProfileFormSignature() {
  return JSON.stringify({
    display_name: document.getElementById("customerName")?.value.trim() || "",
    phone: document.getElementById("customerPhone")?.value.trim() || "",
    address: document.getElementById("manualLocation")?.value.trim() || "",
    reference: document.getElementById("customerReference")?.value.trim() || ""
  });
}

function updateCustomerProfileSaveState() {
  const saveButton = document.getElementById("save-customer-profile-btn");

  if (!saveButton) return;

  const loggedIn = Boolean(customerSession?.user && customerSession?.idToken);
  const changed = loggedIn && customerProfileFormSignature() !== customerProfileBaseline;

  saveButton.textContent = customerProfile
    ? "Guardar cambios"
    : "Guardar mis datos";
  saveButton.hidden = !changed;
  saveButton.disabled = !changed;
}

async function loadCustomerProfile() {
  const status = document.getElementById("customer-account-status");

  try {
    const auth = await ensureCustomerAuth();
    customerSession = await auth.getSession();

    if (!customerSession?.idToken) {
      window.location.replace("tienda.html");
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

    customerProfileBaseline = customerProfile
      ? customerProfileFormSignature()
      : "";
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
    customerProfileBaseline = "";
    profileIdentityLoaded = false;
    document.getElementById("customer-profile-form")?.reset();

    if (document.body.dataset.page === "perfil") {
      window.location.replace("tienda.html");
      return;
    }

    renderCustomerAuth();
    if (document.querySelector("[data-opinions-list]")) {
      closeOpinionCommentModal();
      renderOpinionsComments(opinionsComments);
    }
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
    customerProfileBaseline = customerProfileFormSignature();
    renderCustomerAuth();

    const returnTo = new URLSearchParams(window.location.search).get("return");
    if (returnTo && /^index\.html(?:#opiniones)?$/.test(returnTo)) {
      window.location.assign(returnTo);
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

  document
    .getElementById("customer-profile-form")
    ?.addEventListener("input", updateCustomerProfileSaveState);

  await loadCustomerProfile();
}

async function applyCustomerProfileToCart() {
  await loadProfileIdentity();

  if (!customerSession?.idToken || !customerProfile) return;

  const nameInput = document.getElementById("customerName");
  const savedName = String(customerProfile.display_name || "").trim();

  // Nunca reemplaza un nombre que el cliente ya escribió.
  if (savedName && nameInput && !nameInput.value.trim()) {
    nameInput.value = savedName;
    saveCheckoutDraft();
  }
}

async function initCart() {
  cartViewState.resolving = true;

  document.getElementById("storeDirectionsLink").href =
    STORE_LOCATION.directionsUrl;

  restoreCheckoutDraft();
  applyShippingMode();
  setLocationMethod(selectedLocationMethod);
  renderCart();

  // Se carga en segundo plano: no bloquea ni modifica la ubicación elegida.
  void applyCustomerProfileToCart();

  const hasStoredItems = Object.keys(getCart()).length > 0;

  if (hasStoredItems) {
    try {
      await loadCatalogProducts();
      await requestCartQuote({ quiet: true });
    } finally {
      cartViewState.resolving = false;
      renderCart();
    }
  } else {
    cartViewState.resolving = false;
    renderCart();
  }

  connectStoreLive();

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
        currentGpsCoords = { latitude, longitude };
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
    selectedMapCoords = { latitude, longitude };
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

    let checkoutPhone = String(customerProfile?.phone || "").trim();

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
    const deliveryCoords = isDelivery ? selectedLocationCoords() : null;

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
      if (isCodePayment) {
        const auth = await ensureCustomerAuth();
        customerSession = await auth.getSession();

        if (!customerSession?.idToken) {
          showToast(
            "Inicia sesión con Google para pagar y seguir este pedido."
          );
          return;
        }

        await loadProfileIdentity();
        checkoutPhone = String(
          customerProfile?.phone || checkoutPhone
        ).trim();
      }

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
            Accept: "application/json",
            Authorization: `Bearer ${customerSession.idToken}`
          },
          body: JSON.stringify({
            payment_method: "code",
            customer_name: customerName,
            customer_phone: checkoutPhone,
            customer_note: locationText,
            fulfillment_type: isDelivery ? "delivery" : "pickup",
            // En recogida la direccion y la referencia se mandan en null: el
            // pedido se entrega en el local, no en un domicilio. La direccion
            // del tienda viaja solo en customer_note, que el cliente ve.
            delivery_address: isDelivery ? deliveryLocation : null,
            delivery_reference: isDelivery ? deliveryNotes : null,
            delivery_latitude: deliveryCoords?.latitude ?? null,
            delivery_longitude: deliveryCoords?.longitude ?? null,
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
              Accept: "application/json",
              Authorization: `Bearer ${customerSession.idToken}`
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

// El pedido con codigo vive en Neon: no se copia al historial local.
        // El codigo de entrega lo emite la tienda cuando el pedido queda
        // listo y se lee desde la vista autenticada de Mis pedidos.
        setCart({});
        clearCheckoutDraft();
        renderCart();
        void refreshHistoryView();

        showToast(
          customerSession?.idToken
            ? "Pago confirmado. Sigue tu pedido en Mis pedidos."
            : "Pago confirmado. Inicia sesion para seguir tu pedido."
        );
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
let selectedManagedOrderId = "";
let customerTrackingMap = null;
let customerTrackingMarker = null;
let customerTrackingTimer = null;
let customerTrackingAbort = null;
let customerTrackingOrderId = "";

function orderShortId(order) {
  return String(order?.id || "")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 8)
    .toUpperCase();
}

function orderCompactDate(order) {
  return new Date(order.createdAt).toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function managedOrderQueueCard(order, selectedOrderId) {
  const status = statusInfo(order);
  const isSelected = order.id === selectedOrderId;

  return `
    <button
      class="order-queue-card${isSelected ? " is-selected" : ""}"
      type="button"
      data-order-select="${escapeHtml(order.id)}"
      aria-pressed="${isSelected ? "true" : "false"}"
    >
      <span class="order-queue-status">
        ${escapeHtml(status.label)}
      </span>

      <span class="order-queue-main">
        <strong>Pedido #${escapeHtml(orderShortId(order))}</strong>
        <small>${escapeHtml(orderCompactDate(order))}</small>
      </span>

      <span class="order-queue-total">
        ${money(order.total)}
      </span>
    </button>
  `;
}

function completedOrderCard(order) {
  const created = orderCompactDate(order);
  const items = Array.isArray(order.items) ? order.items : [];
  const itemCount = items.reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0
  );
  const status = statusInfo(order);

  return `
    <details class="history-card">
      <summary>
        <span>
          <small>Pedido #${escapeHtml(orderShortId(order))}</small>
          <strong>${escapeHtml(status.label)}</strong>
          <em>${created} · ${itemCount} producto${itemCount === 1 ? "" : "s"}</em>
        </span>
        <span class="history-total">${money(order.total)}</span>
      </summary>

      <div class="history-detail">
        <p>
          ${escapeHtml(order.shippingType)}
        </p>

        <p>
          <strong>Pago:</strong>
          ${escapeHtml(order.paymentStatus || "Pago por confirmar")}
        </p>

        <ul>
          ${items.map((item) => `
            <li>
              ${item.quantity} x ${escapeHtml(item.name)}
              <strong>${money(item.price * item.quantity)}</strong>
            </li>
          `).join("")}
        </ul>

        <div>
          <strong>Ubicación</strong>
          ${locationDisplayHtml(order.locationText)}
        </div>
      </div>
    </details>
  `;
}

function renderHistory(historyInput) {
  const workspace = document.getElementById("ordersWorkspace");
  const currentHolder = document.getElementById("currentOrders");
  const detailHolder = document.getElementById("currentOrderDetail");
  const completedHolder = document.getElementById("completedOrders");
  const whatsappHolder = document.getElementById("whatsappOrders");

  const completedHeading = document.getElementById(
    "completedOrdersHeading"
  );
  const whatsappHeading = document.getElementById(
    "whatsappOrdersHeading"
  );
  const clearWhatsappButton = document.getElementById(
    "clearWhatsappHistoryBtn"
  );

  const history = Array.isArray(historyInput)
    ? historyInput
    : getHistory();

  // Cambiar el modo solo afecta compras nuevas. Los pedidos ya pagados
  // siguen visibles y pueden terminar su seguimiento sin interrupciones.
  const managedOrders = history.filter(
    (order) => !isWhatsappOrder(order)
  );

  const currentOrders = managedOrders.filter(isActiveOrder);

  const completedOrders =
    storeMode === "managed_orders"
      ? managedOrders.filter((order) => !isActiveOrder(order))
      : [];

  const whatsappOrders = history.filter(isWhatsappOrder);

  const desktopLayout = window.matchMedia(
    "(min-width: 861px)"
  ).matches;

  if (workspace) {
    workspace.hidden = currentOrders.length === 0;
  }

  if (
    selectedManagedOrderId &&
    !currentOrders.some(
      (order) => order.id === selectedManagedOrderId
    )
  ) {
    selectedManagedOrderId = "";
  }

  if (!selectedManagedOrderId && currentOrders.length) {
    selectedManagedOrderId = currentOrders[0].id;
  }

  if (currentHolder) {
    if (desktopLayout) {
      currentHolder.innerHTML = currentOrders
        .map((order) =>
          managedOrderQueueCard(
            order,
            selectedManagedOrderId
          )
        )
        .join("");
    } else {
      currentHolder.innerHTML = currentOrders
        .map(currentOrderCard)
        .join("");
    }
  }

  if (detailHolder) {
    const selectedOrder = currentOrders.find(
      (order) => order.id === selectedManagedOrderId
    );

    detailHolder.hidden = !desktopLayout || !selectedOrder;

    detailHolder.innerHTML =
      desktopLayout && selectedOrder
        ? currentOrderCard(selectedOrder)
        : "";
  }

  if (desktopLayout && currentHolder) {
    currentHolder
      .querySelectorAll("[data-order-select]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          selectedManagedOrderId =
            button.dataset.orderSelect || "";

          renderHistory(history);
        });
      });
  }

  if (completedHeading) {
    completedHeading.hidden = completedOrders.length === 0;
  }

  if (completedHolder) {
    completedHolder.hidden = completedOrders.length === 0;
    completedHolder.innerHTML = completedOrders
      .map(completedOrderCard)
      .join("");
  }

  if (whatsappHeading) {
    whatsappHeading.hidden = whatsappOrders.length === 0;
  }

  if (whatsappHolder) {
    whatsappHolder.hidden = whatsappOrders.length === 0;
    whatsappHolder.innerHTML = whatsappOrders
      .map(whatsappOrderCard)
      .join("");
  }

  if (clearWhatsappButton) {
    clearWhatsappButton.hidden = whatsappOrders.length === 0;
  }

  document.querySelectorAll("[data-track-delivery]").forEach((button) => {
    button.addEventListener("click", () => {
      openCustomerTracking(button.getAttribute("data-track-delivery"));
    });
  });
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



async function stopCustomerTracking() {
  customerTrackingOrderId = "";

  if (customerTrackingTimer) {
    clearTimeout(customerTrackingTimer);
    customerTrackingTimer = null;
  }

  if (customerTrackingAbort) {
    customerTrackingAbort.abort();
    customerTrackingAbort = null;
  }

  if (customerTrackingMap) {
    customerTrackingMap.remove();
    customerTrackingMap = null;
  }

  customerTrackingMarker = null;

  document
    .querySelectorAll("[data-live-order]")
    .forEach((node) => {
      const status = node.querySelector("[data-live-status]");

      if (status) status.textContent = "";

      const map = node.querySelector(".customer-live-tracking__map");

      if (map) {
        map.hidden = true;
        map.innerHTML = "";
      }

      const button = node.querySelector("[data-track-delivery]");

      if (button) button.hidden = false;
    });
}

async function openCustomerTracking(orderId) {
  if (!window.L || !customerSession?.idToken) return;

  await stopCustomerTracking();

  customerTrackingOrderId = orderId;

  const holder = document.querySelector(
    `[data-live-order="${window.CSS?.escape ? CSS.escape(orderId) : orderId}"]`
  );

  if (!holder) {
    customerTrackingOrderId = "";

    return;
  }

  const statusEl = holder.querySelector("[data-live-status]");
  const button = holder.querySelector("[data-track-delivery]");
  const mapEl = holder.querySelector(".customer-live-tracking__map");

  if (!mapEl) return;

  mapEl.hidden = false;

  if (button) button.hidden = true;

  if (!customerTrackingMap) {
    customerTrackingMap = L.map(mapEl, {
      zoomControl: true,
      attributionControl: true
    }).setView([19.4326, -99.1332], 13);
  }

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(customerTrackingMap);

  const markerIcon = L.divIcon({
    className: "customer-live-marker",
    html: '<span></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });

  customerTrackingMarker = L.marker([19.4326, -99.1332], {
    icon: markerIcon
  }).addTo(customerTrackingMap);

  let keepPolling = true;

  async function poll() {
    if (
      document.hidden ||
      customerTrackingOrderId !== orderId ||
      !keepPolling
    ) {
      return;
    }

    customerTrackingAbort = new AbortController();

    try {
      const query = new URLSearchParams({
        project_id: String(ITM_PROJECT_ID),
        order_id: orderId
      });
      const response = await fetch(
        `${ITM_DELIVERY_LOCATION_URL}?${query.toString()}`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${customerSession.idToken}`
          },
          cache: "no-store",
          signal: customerTrackingAbort.signal
        }
      );

      const body = await response.json().catch(() => ({}));

      if (response.status === 401 || response.status === 409) {
        keepPolling = false;

        if (statusEl) {
          statusEl.textContent =
            "El seguimiento terminó porque el pedido ya no está en camino.";
        }

        return;
      }

      if (!response.ok) throw new Error("HTTP");

      if (!body.ok) throw new Error(body.code || "TRACKING");

      if (customerTrackingOrderId !== orderId) return;

      if (!body.available || !body.location) {
        if (statusEl) {
          statusEl.textContent = body.stale
            ? "Ubicación no disponible. Tu repartidor aún no la ha compartido."
            : "Esperando la ubicación de tu repartidor…";
        }

        return;
      }

      const { latitude, longitude, updated_at: updatedAt } = body.location;
      const position = [Number(latitude), Number(longitude)];

      if (statusEl) {
        statusEl.textContent = `Actualizado ${new Date(
          updatedAt || Date.now()
        ).toLocaleTimeString("es-MX")}`;
      }

      if (customerTrackingMarker) {
        customerTrackingMarker.setLatLng(position);
      }

      customerTrackingMap.setView(position, customerTrackingMap.getZoom());
      setTimeout(() => customerTrackingMap?.invalidateSize(), 60);
    } catch (error) {
      if (error.name === "AbortError") return;

      if (statusEl) {
        statusEl.textContent = "No se pudo actualizar la ubicación.";
      }
    } finally {
      customerTrackingAbort = null;
    }
  }

  async function scheduleNext() {
    if (
      !keepPolling ||
      document.hidden ||
      customerTrackingOrderId !== orderId
    ) {
      return;
    }

    customerTrackingTimer = setTimeout(async () => {
      await poll();
      await scheduleNext();
    }, 20_000);
  }

  await poll();
  await scheduleNext();
}

document.addEventListener("visibilitychange", function () {
  if (document.hidden) {
    if (customerTrackingTimer) {
      clearTimeout(customerTrackingTimer);
      customerTrackingTimer = null;
    }

    if (customerTrackingAbort) {
      customerTrackingAbort.abort();
      customerTrackingAbort = null;
    }

    return;
  }

  if (customerTrackingOrderId) {
    void openCustomerTracking(customerTrackingOrderId);
  }
});
function currentOrderCard(order) {
  if (isWhatsappOrder(order)) return whatsappOrderCard(order);

  const created = new Date(order.createdAt).toLocaleString("es-MX");
  const items = Array.isArray(order.items) ? order.items : [];
  const itemCount = items.reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0
  );
  const status = statusInfo(order);
  const canTrack =
    order.serverStatus === "shipping" &&
    !isPickupOrder(order) &&
    isActiveOrder(order) &&
    Number.isFinite(Number(order.deliveryLatitude)) &&
    Number.isFinite(Number(order.deliveryLongitude));

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

      <div class="current-order-grid">
        <span>${itemCount} producto${itemCount === 1 ? "" : "s"}</span>
        <span>${escapeHtml(order.shippingType)}</span>
        <span>${escapeHtml(order.paymentStatus || "Pago por confirmar")}</span>
      </div>

      <details class="history-card order-tracking">
        <summary>Ver seguimiento</summary>
        ${timelineHtml(order)}
      </details>

      ${canTrack ? `
        <div class="customer-live-tracking" data-live-order="${escapeHtml(order.id)}">
          <div class="customer-live-tracking__head">
            <div>
              <strong>Ubicación de tu repartidor</strong>
              <small data-live-status>Cargando…</small>
            </div>
            <button type="button" data-track-delivery="${escapeHtml(order.id)}">
              Ver en el mapa
            </button>
          </div>
          <div class="customer-live-tracking__map" hidden></div>
        </div>
      ` : ""}

      ${!isPickupOrder(order) && order.deliveryCode && isActiveOrder(order) ? `
        <div class="client-code">
          <span>Codigo de entrega</span>
          <strong>${escapeHtml(order.deliveryCode)}</strong>
          <small>Muestraselo al repartidor cuando te lo pida.</small>
        </div>
      ` : ""}
    </article>
  `;
}
/**
 * Pedidos que viven en Neon. Solo se muestran si el cliente tiene sesion: el
 * endpoint exige el token de Firebase y nunca devuelve pedidos de otra cuenta.
 * Los pedidos de WhatsApp se quedan en el historial local del navegador.
 */
async function loadCustomerServerOrders() {
  if (!customerSession?.idToken) return [];

  try {
    const response = await fetch(ITM_MY_ORDERS_URL, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${customerSession.idToken}`
      },
      cache: "no-store"
    });

    if (!response.ok) return [];

    const result = await response.json().catch(() => ({}));
    if (result?.ok !== true || !Array.isArray(result.orders)) return [];

    return result.orders.map(serverOrderToLocal);
  } catch {
    return [];
  }
}

function serverOrderToLocal(order) {
  const items = (order.items || []).map((item) => ({
    id: item.product_id,
    name: item.name,
    price: Number(item.price) || 0,
    quantity: Number(item.quantity) || 0
  }));

  const locationLines = [];

  if (order.fulfillment_type === "pickup") {
    locationLines.push(`Pasar a buscar en tienda: ${STORE_LOCATION.address}`);
  } else if (order.delivery_address) {
    locationLines.push(order.delivery_address);
    if (order.delivery_latitude !== null && order.delivery_longitude !== null) {
      locationLines.push(mapsLink(order.delivery_latitude, order.delivery_longitude));
    }
    if (order.delivery_reference) {
      locationLines.push(`Referencia: ${order.delivery_reference}`);
    }
  }

  return {
    id: order.id,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    customerName: order.customer_name || "",
    locationText: locationLines.join("\n"),
    shippingType: order.fulfillment_type === "pickup" ? "Pasar a buscar" : "Entrega a domicilio",
    status: SERVER_STATUS_MAP[order.status] || "nuevo",
    serverStatus: order.status || "nuevo",
    fulfillmentType: order.fulfillment_type || "delivery",
    deliveryLatitude: order.delivery_latitude === null
      ? null
      : Number(order.delivery_latitude),
    deliveryLongitude: order.delivery_longitude === null
      ? null
      : Number(order.delivery_longitude),
    paymentMethod: order.payment_method,
    paymentStatus:
      order.payment_status === "paid" ? "Pago confirmado con codigo" : "Pago por confirmar",
    deliveryCode: order.delivery_code || "",
    deliveryClaimed: hasDeliveryClaim(order),
    total: Number(order.subtotal) || 0,
    message: "",
    fromServer: true,
    events: serverTimelineToLocal(order),
    items
  };
}

/**
 * El endpoint "mine" ya devuelve un timeline recortado (sin actor, sin notas
 * internas y sin datos del personal). Aqui solo se traduce a texto legible.
 */
function serverTimelineToLocal(order) {
  const timeline = Array.isArray(order.timeline) ? order.timeline : [];

  const labels = {
    paid: "Pago confirmado",
    accepted: "Pedido confirmado por la tienda",
    preparing: "Pedido en preparación",
    ready_for_delivery: "Pedido listo para entrega",
    shipping: "Tu pedido va en camino",
    delivered: "Pedido entregado",
    cancelled: "Pedido cancelado",
    rejected: "Pedido rechazado"
  };

  const events = timeline
    .filter(
      (entry) =>
        entry &&
        entry.type !== "assignment" &&
        (entry.type === "claim" || labels[entry.status])
    )
    .map((entry) => ({
      at: entry.at || order.created_at,
      text:
        entry.type === "claim"
          ? "Repartidor asignado"
          : labels[entry.status]
    }))
    .sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));

  return events.length
    ? events
    : [
        {
          at: order.created_at,
          text: "Pedido recibido"
        }
      ];
}

/**
 * Fusiona historial local y pedidos de Neon. Si un id aparece en ambos, gana
 * el de Neon: es la fuente de verdad del estado y del codigo de entrega.
 */
function mergeOrderSources(localHistory, serverOrders) {
  const serverIds = new Set(serverOrders.map((order) => order.id));
  const localOnly = localHistory.filter((order) => !serverIds.has(order.id));

  return [...serverOrders, ...localOnly].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
}

async function refreshHistoryView() {
  const localHistory = getHistory();
  const serverOrders = await loadCustomerServerOrders();

  renderHistory(mergeOrderSources(localHistory, serverOrders));
  renderCustomerOrderNotice(serverOrders, localHistory);
}

function renderCustomerOrderNotice(serverOrdersInput, localHistoryInput) {
  const holder = document.getElementById("historyNotice");
  if (!holder) return;

  const serverOrders = Array.isArray(serverOrdersInput)
    ? serverOrdersInput
    : [];
  const localHistory = Array.isArray(localHistoryInput)
    ? localHistoryInput
    : [];
  const localCount = localHistory.filter(isWhatsappOrder).length;
  const activeManagedCount = serverOrders.filter(isActiveOrder).length;

  if (storeMode === "whatsapp_catalog") {
    const messages = [];

    if (activeManagedCount) {
      messages.push(
        `${activeManagedCount} pedido${activeManagedCount === 1 ? "" : "s"} en proceso. Consulta su seguimiento aquí.`
      );
    }

    if (localCount) {
      messages.push(
        `${localCount} pedido${localCount === 1 ? "" : "s"} enviado${localCount === 1 ? "" : "s"} por WhatsApp desde este dispositivo.`
      );
    }

    holder.innerHTML = `
      <p class="muted">
        ${messages.length
          ? messages.join(" · ")
          : "Aquí aparecerán los pedidos que envíes por WhatsApp desde este dispositivo."
        }
      </p>
    `;
    return;
  }

  if (!customerSession?.idToken) {
    holder.innerHTML = `
      <p class="muted">
        Inicia sesión para consultar tus pedidos y su seguimiento.
      </p>
    `;
    return;
  }

  if (!serverOrders.length && !localCount) {
    holder.innerHTML = `
      <p class="muted">
        Aún no tienes pedidos registrados.
      </p>
    `;
    return;
  }

  holder.innerHTML = `
    <p class="muted">
      ${serverOrders.length
        ? `${serverOrders.length} pedido${serverOrders.length === 1 ? "" : "s"} de tu cuenta`
        : "Sin pedidos de tu cuenta"
      }${localCount
        ? ` · ${localCount} pedido${localCount === 1 ? "" : "s"} enviado${localCount === 1 ? "" : "s"} por WhatsApp`
        : "."
      }
    </p>
  `;
}

function initHistory() {
  renderHistory();

  renderCustomerOrderNotice([], getHistory());

  void (async () => {
    await refreshStoreSettingsFromServer();
    await loadProfileIdentity();
    await refreshHistoryView();
  })();

  document
    .getElementById("clearWhatsappHistoryBtn")
    ?.addEventListener("click", () => {
      setHistory(
        getHistory().filter(
          (order) => !isWhatsappOrder(order)
        )
      );

      void refreshHistoryView();
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
if (page === "inicio") initHome();
if (page === "inicio") initOpinions();
if (page === "tienda") initCatalog();
if (page === "detalle") initDetail();
if (page === "carrito") initCart();
if (page === "mis-pedidos") initHistory();
if (page === "panel-local") initLocalPanel();
if (page === "perfil") initCustomerProfilePage();
