const WHATSAPP_NUMBER = "5219996448579";
const GENERIC_IMAGE = "assets/producto-generico.svg";
const CART_KEY = "tiendaPedidosCarrito";
const HISTORY_KEY = "tiendaPedidosHistorial";

const products = [
  {
    id: "agua-natural",
    name: "Agua natural",
    category: "Bebidas",
    price: 18,
    description: "Botella fria lista para acompanar el pedido."
  },
  {
    id: "refresco-lata",
    name: "Refresco en lata",
    category: "Bebidas",
    price: 25,
    description: "Refresco individual servido frio."
  },
  {
    id: "cafe-americano",
    name: "Cafe americano",
    category: "Bebidas",
    price: 35,
    description: "Cafe caliente de sabor intenso."
  },
  {
    id: "hamburguesa-clasica",
    name: "Hamburguesa clasica",
    category: "Comidas",
    price: 115,
    description: "Hamburguesa con carne, queso y vegetales frescos."
  },
  {
    id: "sandwich-pollo",
    name: "Sandwich de pollo",
    category: "Comidas",
    price: 88,
    description: "Pan tostado con pollo preparado y aderezo de la casa."
  },
  {
    id: "papas-gajo",
    name: "Papas gajo",
    category: "Comidas",
    price: 55,
    description: "Papas doradas por fuera y suaves por dentro."
  },
  {
    id: "brownie-chocolate",
    name: "Brownie de chocolate",
    category: "Postres",
    price: 48,
    description: "Porcion de brownie con centro suave."
  },
  {
    id: "cheesecake-fresa",
    name: "Cheesecake de fresa",
    category: "Postres",
    price: 62,
    description: "Rebanada cremosa con cubierta de fresa."
  },
  {
    id: "flan-casero",
    name: "Flan casero",
    category: "Postres",
    price: 42,
    description: "Flan suave con caramelo."
  }
];

let activeCategory = "Todos";
let currentGpsLocation = "";

function money(value) {
  return value.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN"
  });
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

function cartCount() {
  return cartItems().reduce((sum, item) => sum + item.quantity, 0);
}

function updateCartCount() {
  document.querySelectorAll("[data-cart-count]").forEach((node) => {
    node.textContent = cartCount();
  });
}

function showToast(message) {
  const toast = document.querySelector("[data-toast]");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2200);
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
  document.title = `${product.name} | Tienda de Pedidos`;
  holder.innerHTML = `
    <div class="detail-media">
      <img src="${GENERIC_IMAGE}" alt="${product.name}">
    </div>
    <div class="detail-copy">
      <p class="section-kicker">${product.category}</p>
      <h1>${product.name}</h1>
      <p>${product.description}</p>
      <strong class="price">${money(product.price)}</strong>
      <div class="detail-actions">
        <button class="button primary" type="button" data-add="${product.id}">Agregar al carrito</button>
        <a class="button secondary" href="carrito.html">Ir al carrito</a>
      </div>
    </div>
  `;
  holder.querySelector("[data-add]")?.addEventListener("click", () => addToCart(product.id));
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
        <div>
          <h2>${product.name}</h2>
          <p>${money(product.price)} c/u</p>
          <div class="cart-actions">
            <div class="quantity" aria-label="Cantidad de ${product.name}">
              <button type="button" data-minus="${product.id}" aria-label="Quitar uno">-</button>
              <span>${quantity}</span>
              <button type="button" data-plus="${product.id}" aria-label="Agregar uno">+</button>
            </div>
            <button class="button danger" type="button" data-remove="${product.id}">Quitar</button>
          </div>
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

function buildWhatsAppMessage(customerName, locationText, shippingType, items) {
  const lines = [
    "Hola, quiero hacer este pedido:",
    "",
    ...items.map((item) => `- ${item.quantity} x ${item.product.name} (${money(item.product.price)} c/u) = ${money(item.product.price * item.quantity)}`),
    "",
    `Total: ${money(cartTotal(items))}`,
    "",
    `Nombre: ${customerName}`,
    `Ubicacion: ${locationText}`,
    `Tipo de envio: ${shippingType}`
  ];
  return lines.join("\n");
}

function saveOrder(customerName, locationText, shippingType, items, message) {
  const order = {
    id: `PED-${Date.now()}`,
    createdAt: new Date().toISOString(),
    customerName,
    locationText,
    shippingType,
    total: cartTotal(items),
    message,
    items: items.map((item) => ({
      id: item.product.id,
      name: item.product.name,
      price: item.product.price,
      quantity: item.quantity
    }))
  };
  setHistory([order, ...getHistory()].slice(0, 30));
}

function initCart() {
  renderCart();

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
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        currentGpsLocation = `GPS: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} - https://maps.google.com/?q=${latitude},${longitude}`;
        status.textContent = currentGpsLocation;
      },
      () => {
        status.textContent = "No se pudo obtener la ubicacion. Escribe la direccion manual.";
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  document.getElementById("checkoutForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const items = cartItems();
    if (!items.length) {
      showToast("Agrega productos antes de pedir");
      return;
    }

    const customerName = document.getElementById("customerName").value.trim();
    const manualLocation = document.getElementById("manualLocation").value.trim();
    const locationText = manualLocation || currentGpsLocation;
    const shippingType = document.querySelector("input[name='shippingType']:checked")?.value || "Entrega a domicilio";

    if (!customerName) {
      showToast("Escribe el nombre del cliente");
      return;
    }
    if (shippingType === "Entrega a domicilio" && !locationText) {
      showToast("Agrega ubicacion o direccion");
      return;
    }

    const message = buildWhatsAppMessage(customerName, locationText || "Pasar a buscar", shippingType, items);
    saveOrder(customerName, locationText || "Pasar a buscar", shippingType, items, message);
    setCart({});
    renderCart();
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
  });
}

function renderHistory() {
  const holder = document.getElementById("historyList");
  if (!holder) return;
  const history = getHistory();
  if (!history.length) {
    holder.innerHTML = `<div class="empty-state">Aun no hay pedidos guardados en este navegador.</div>`;
    return;
  }

  holder.innerHTML = history
    .map((order) => {
      const created = new Date(order.createdAt).toLocaleString("es-MX");
      const items = order.items.map((item) => `<li>${item.quantity} x ${item.name} - ${money(item.price * item.quantity)}</li>`).join("");
      return `
        <article class="history-card">
          <p class="section-kicker">${order.id}</p>
          <h2>${created}</h2>
          <p>${order.customerName} - ${order.shippingType}</p>
          <ul>${items}</ul>
          <p><strong>Total:</strong> ${money(order.total)}</p>
          <p><strong>Ubicacion:</strong> ${order.locationText}</p>
        </article>
      `;
    })
    .join("");
}

function initHistory() {
  renderHistory();
  document.getElementById("clearHistoryBtn")?.addEventListener("click", () => {
    setHistory([]);
    renderHistory();
  });
}

updateCartCount();

const page = document.body.dataset.page;
if (page === "tienda") initCatalog();
if (page === "detalle") initDetail();
if (page === "carrito") initCart();
if (page === "historial") initHistory();
