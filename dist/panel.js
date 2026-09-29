const USERS_KEY = "tiendaPedidosUsuarios";
const SESSION_KEY = "tiendaPedidosSesion";

const ROLES = {
  admin: {
    id: "admin",
    name: "Dueno / Admin",
    short: "Admin",
    home: "admin.html",
    description: "Estadisticas, historial y control de usuarios"
  },
  encargado: {
    id: "encargado",
    name: "Encargado de pedidos",
    short: "Encargado",
    home: "panel-pedidos.html",
    description: "Recibe, acepta y alista los pedidos"
  },
  repartidor: {
    id: "repartidor",
    name: "Repartidor",
    short: "Repartidor",
    home: "repartidor.html",
    description: "Toma pedidos y hace las entregas"
  }
};

const DEFAULT_USERS = [
  { id: "usr-admin", name: "Dueno", username: "admin", password: "admin123", role: "admin", active: true },
  { id: "usr-encargado", name: "Encargado", username: "encargado", password: "encargado123", role: "encargado", active: true },
  { id: "usr-repartidor", name: "Repartidor", username: "repartidor", password: "repartidor123", role: "repartidor", active: true }
];

const STATUS_TONE = {
  nuevo: "nuevo",
  aceptado: "aceptado",
  alistando: "alistando",
  listo: "listo",
  asignado: "asignado",
  "aceptado-repartidor": "en-camino",
  recogido: "recogido",
  "en-camino": "en-camino",
  entregado: "entregado",
  retirado: "entregado",
  cancelado: "cancelado"
};

function getUsers() {
  const users = readJson(USERS_KEY, null);
  if (!Array.isArray(users) || !users.length) {
    writeJson(USERS_KEY, DEFAULT_USERS);
    return [...DEFAULT_USERS];
  }
  return users;
}

function saveUsers(users) {
  writeJson(USERS_KEY, users);
}

function getSession() {
  return readJson(SESSION_KEY, null);
}

function setSession(session) {
  if (session) {
    writeJson(SESSION_KEY, session);
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

function activeUsersByRole(role) {
  return getUsers().filter((user) => user.role === role && user.active !== false);
}

function loginUser(username, password, role) {
  const user = getUsers().find(
    (entry) =>
      entry.username.toLowerCase() === String(username).trim().toLowerCase() &&
      entry.role === role &&
      entry.active !== false
  );
  if (!user || user.password !== password) return null;
  const session = { userId: user.id, name: user.name, role: user.role, since: new Date().toISOString() };
  setSession(session);
  return session;
}

function logoutUser() {
  setSession(null);
}

function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  const session = getSession();
  if (!session || !allowed.includes(session.role)) {
    window.location.replace("login.html");
    return null;
  }
  return session;
}

function allowRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  const session = getSession();
  if (!session) return false;
  if (allowed.includes(session.role)) return true;
  window.location.replace(ROLES[session.role].home);
  return false;
}

const TRANSITION_RULES = {
  encargado: {
    from: ["nuevo", "aceptado", "alistando", "listo"],
    to: ["aceptado", "alistando", "listo", "retirado"],
    labels: {
      aceptado: "Aceptar pedido",
      alistando: "Marcar alistando",
      listo: "Marcar como listo",
      retirado: "Marcar como retirado"
    }
  },
  repartidor: {
    from: ["asignado", "aceptado-repartidor", "recogido", "en-camino"],
    to: ["aceptado-repartidor", "recogido", "en-camino", "entregado"],
    labels: {
      "aceptado-repartidor": "Aceptar pedido",
      recogido: "Pedido recogido",
      "en-camino": "En camino",
      entregado: "Entregado"
    }
  },
  admin: {
    from: null,
    to: null,
    labels: {}
  }
};

function allowedTransitions(order, role) {
  const rule = TRANSITION_RULES[role];
  if (!rule) return [];
  if (role === "admin") return orderFlow(order).map((entry) => entry.id);

  const current = orderStatus(order);
  const flow = orderFlow(order);
  const nextId = flow[Math.min(statusIndex(order) + 1, flow.length - 1)].id;
  if (current === nextId) return [];

  if (!rule.to.includes(nextId)) return [];
  if (rule.from && !rule.from.includes(current)) return [];

  return [{ id: nextId, label: rule.labels[nextId] || statusInfo(order, nextId).label }];
}

function canAssignDriver(order) {
  if (isPickupOrder(order)) return false;
  return ["listo", "asignado", "aceptado-repartidor"].includes(orderStatus(order));
}

function canCancelOrder(order) {
  return isActiveOrder(order);
}

function canReportProblem(order) {
  if (isPickupOrder(order)) return false;
  return ["asignado", "aceptado-repartidor", "recogido", "en-camino"].includes(orderStatus(order));
}

function orderEvent(text) {
  return { at: new Date().toISOString(), text };
}

function needsDeliveryCode(order, target, actor) {
  return target === "entregado" && actor.role === "repartidor" && Boolean(order.deliveryCode);
}

function cancelOrder(id, reason, note, actor) {
  const order = getHistory().find((entry) => entry.id === id);
  if (!order) return { ok: false, message: "Pedido no encontrado" };
  if (!canCancelOrder(order)) return { ok: false, message: "Este pedido ya no se puede cancelar" };
  if (!["admin", "encargado"].includes(actor.role)) return { ok: false, message: "No tienes permiso para cancelar" };

  const cleanReason = String(reason || "").trim();
  const cleanNote = String(note || "").trim();

  if (!cleanReason) {
    return { ok: false, message: "Selecciona un motivo de cancelacion" };
  }

  const fullReason = cleanNote ? `${cleanReason}: ${cleanNote}` : cleanReason;

  updateOrder(id, (entry) => ({
    ...entry,
    status: CANCELLED_STATUS,
    cancelledAt: new Date().toISOString(),
    cancelledBy: actor.name,
    cancelReason: cleanReason,
    cancelNote: cleanNote,
    updatedAt: new Date().toISOString(),
    events: [...(entry.events || []), orderEvent(`Pedido cancelado por ${actor.name}: ${fullReason}`)]
  }));

  return { ok: true, message: `Pedido cancelado: ${cleanReason}` };
}

function moveOrder(id, target, actor, code) {
  const order = getHistory().find((entry) => entry.id === id);
  if (!order) return { ok: false, message: "Pedido no encontrado" };

  if (actor.role === "repartidor") {
    if (isPickupOrder(order)) return { ok: false, message: "Este pedido no es de reparto" };
    if (order.driverName && order.driverName !== actor.name) {
      return { ok: false, message: "Este pedido pertenece a otro repartidor" };
    }
  }

  if (target === CANCELLED_STATUS) {
    return { ok: false, message: "Usa cancelOrder para cancelar con motivo" };
  } else {
    const allowed = allowedTransitions(order, actor.role);
    const step = allowed.find((entry) => entry.id === target);
    if (!step) {
      return { ok: false, message: `No puedes pasar de ${statusInfo(order).label} a ${statusInfo(order, target).label}` };
    }
    if (needsDeliveryCode(order, target, actor) && String(code || "").trim() !== order.deliveryCode) {
      return { ok: false, message: "El codigo no coincide con el del cliente." };
    }
  }

  const previous = orderStatus(order);
  const nextLabel = statusInfo(order, target).label;
  updateOrder(id, (entry) => ({
    ...entry,
    driverName: actor.role === "repartidor" && target === "aceptado-repartidor" && !entry.driverName
      ? actor.name
      : entry.driverName,
    status: target,
    updatedAt: new Date().toISOString(),
    events: [...(entry.events || []), orderEvent(`${statusInfo(entry, previous).label} -> ${nextLabel} · por ${actor.name}`)]
  }));
  return { ok: true, message: `Pedido en ${nextLabel}` };
}

function assignDriver(id, driverName, actor) {
  if (!["admin", "encargado"].includes(actor.role)) return { ok: false, message: "No tienes permiso para asignar repartidores" };
  const order = getHistory().find((entry) => entry.id === id);
  if (!order) return { ok: false, message: "Pedido no encontrado" };
  if (!canAssignDriver(order)) return { ok: false, message: "El pedido todavia no se puede asignar" };

  const current = orderStatus(order);
  const changes = {
    driverName,
    status: current === "asignado" || current === "aceptado-repartidor" ? current : "asignado",
    updatedAt: new Date().toISOString(),
    events: [
      ...(order.events || []),
      orderEvent(`Repartidor asignado: ${driverName} · por ${actor.name}`)
    ]
  };
  if (current === "listo") {
    changes.events.unshift(orderEvent(`Listo para enviar -> Repartidor asignado · por ${actor.name}`));
  }

  updateOrder(id, (entry) => ({ ...entry, ...changes }));
  return { ok: true, message: driverName ? `Asignado a ${driverName}` : "Asignacion quitada" };
}

function reportOrderProblem(id, note, actor) {
  const order = getHistory().find((entry) => entry.id === id);
  if (!order) return { ok: false, message: "Pedido no encontrado" };
  if (!canReportProblem(order)) return { ok: false, message: "Este pedido no admite reportes" };
  const text = String(note || "").trim();
  if (!text) return { ok: false, message: "Escribe que paso" };

  updateOrder(id, (entry) => ({
    ...entry,
    updatedAt: new Date().toISOString(),
    problems: [...(entry.problems || []), { at: new Date().toISOString(), note: text, by: actor.name }],
    events: [...(entry.events || []), orderEvent(`Problema reportado por ${actor.name}: ${text}`)]
  }));
  return { ok: true, message: "Problema reportado" };
}

function rejectDeliveryOrder(id, reason, actor) {
  const order = getHistory().find((entry) => entry.id === id);
  if (!order) return { ok: false, message: "Pedido no encontrado" };
  if (actor.role !== "repartidor") return { ok: false, message: "Solo el repartidor puede rechazar" };
  if (isPickupOrder(order)) return { ok: false, message: "Este pedido no es de reparto" };
  if (orderStatus(order) !== "asignado") return { ok: false, message: "Solo puedes rechazar antes de aceptar" };
  if (order.driverName && order.driverName !== actor.name) return { ok: false, message: "Este pedido pertenece a otro repartidor" };

  const cleanReason = String(reason || "").trim() || "No puedo tomarlo";
  updateOrder(id, (entry) => ({
    ...entry,
    driverName: entry.driverName === actor.name ? "" : entry.driverName,
    rejections: [...(entry.rejections || []), { at: new Date().toISOString(), by: actor.name, reason: cleanReason }],
    events: [...(entry.events || []), orderEvent(`Pedido rechazado por ${actor.name}: ${cleanReason}`)]
  }));

  return { ok: true, message: "Pedido rechazado. El encargado puede asignarlo a otro repartidor." };
}

function askText(dialogId, label, placeholder) {
  const dialog = document.getElementById(dialogId);
  if (!dialog) return Promise.resolve("");
  const input = dialog.querySelector("input, textarea");
  input.value = "";
  if (placeholder) input.placeholder = placeholder;
  const labelNode = dialog.querySelector("[data-dialog-label]");
  if (labelNode) labelNode.textContent = label;
  dialog.showModal();
  input.focus();
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(input.value), { once: true });
  });
}

function orderBelongsToDriver(order, session) {
  return order.driverName === session.name;
}

function driverRejectedOrder(order, session) {
  return (order.rejections || []).some((entry) => entry.by === session.name);
}

function driverCanSeeOffer(order, session) {
  return !isPickupOrder(order) &&
    orderStatus(order) === "asignado" &&
    !order.driverName &&
    !driverRejectedOrder(order, session);
}

function statusPill(order) {
  const status = orderStatus(order);
  const label = status === CANCELLED_STATUS && order.cancelReason
    ? `Cancelado: ${order.cancelReason}`
    : statusInfo(order, status).label;

  return `<span class="status-pill tone-${STATUS_TONE[status] || "nuevo"}">${escapeHtml(label)}</span>`;
}

function orderItemsList(order) {
  return (order.items || [])
    .map((item) => `<li>${item.quantity} x ${escapeHtml(item.name)} <strong>${money(item.price * item.quantity)}</strong></li>`)
    .join("");
}

function orderProblems(order) {
  const problems = order.problems || [];
  const rejections = order.rejections || [];
  const cancellation = order.cancelReason ? [{ reason: order.cancelReason, note: order.cancelNote || "", by: order.cancelledBy || "Sistema" }] : [];
  if (!problems.length && !rejections.length && !cancellation.length) return "";

  return `
    <div class="problem-box">
      ${problems.length ? `
        <strong>Problemas reportados</strong>
        <ul>${problems.map((entry) => `<li>${escapeHtml(entry.note)} <span>· ${escapeHtml(entry.by)}</span></li>`).join("")}</ul>
      ` : ""}
      ${rejections.length ? `
        <strong>Rechazos de repartidor</strong>
        <ul>${rejections.map((entry) => `<li>${escapeHtml(entry.reason)} <span>· ${escapeHtml(entry.by)}</span></li>`).join("")}</ul>
      ` : ""}
      ${cancellation.length ? `
        <strong>Cancelacion</strong>
        <ul>${cancellation.map((entry) => `<li>${escapeHtml(entry.reason)}${entry.note ? `: ${escapeHtml(entry.note)}` : ""} <span>· ${escapeHtml(entry.by)}</span></li>`).join("")}</ul>
      ` : ""}
    </div>
  `;
}

function internalTopbar(session, current) {
  const links = {
    admin: [{ href: "admin.html", label: "Panel del dueno" }],
    encargado: [{ href: "panel-pedidos.html", label: "Pedidos activos" }],
    repartidor: [{ href: "repartidor.html", label: "Mis entregas" }]
  };
  const role = ROLES[session.role];
  return `
    <header class="topbar internal-topbar">
      <a class="brand" href="index.html" aria-label="Inicio">
        <img class="brand-mark" src="assets/fonda-mexicana-logo.png" alt="" aria-hidden="true">
        <span>Fonda Mexicana</span>
      </a>
      <nav class="nav" aria-label="Interna">
        ${links[session.role].map((link) => `<a class="${current === link.href ? "active" : ""}" href="${link.href}">${link.label}</a>`).join("")}
        <a href="#" data-logout>Cerrar sesion</a>
      </nav>
      <div class="session-chip">
        <strong>${escapeHtml(session.name)}</strong>
        <span>${escapeHtml(role.short)}</span>
      </div>
    </header>
  `;
}

function mountInternalShell(session, current) {
  const body = document.body;
  body.insertAdjacentHTML("afterbegin", internalTopbar(session, current));
  const logout = document.querySelector("[data-logout]");
  if (logout) {
    logout.addEventListener("click", (event) => {
      event.preventDefault();
      logoutUser();
      window.location.replace("login.html");
    });
  }
}

function renderLoginPage() {
  const holder = document.getElementById("rolePicker");
  const selected = { role: "encargado" };
  holder.innerHTML = Object.values(ROLES)
    .map(
      (role) => `
      <button class="role-card ${role.id === selected.role ? "active" : ""}" type="button" data-role="${role.id}">
        <strong>${escapeHtml(role.name)}</strong>
        <span>${escapeHtml(role.description)}</span>
      </button>
    `
    )
    .join("");

  holder.addEventListener("click", (event) => {
    const button = event.target.closest("[data-role]");
    if (!button) return;
    selected.role = button.dataset.role;
    holder.querySelectorAll("[data-role]").forEach((node) => node.classList.toggle("active", node === button));
  });

  document.getElementById("loginForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const username = document.getElementById("loginUser").value.trim();
    const password = document.getElementById("loginPassword").value;
    const session = loginUser(username, password, selected.role);
    if (!session) {
      document.getElementById("loginError").textContent = "Usuario o contrasena incorrectos para ese perfil.";
      return;
    }
    window.location.href = ROLES[session.role].home;
  });

  const session = getSession();
  if (session) {
    document.getElementById("loginHint").textContent = `Sesion abierta: ${session.name} (${ROLES[session.role].short})`;
  }
}

function renderOrdersPanel(session) {
  const filterHolder = document.getElementById("orderFilters");
  const listHolder = document.getElementById("ordersList");
  const filter = { mode: "todos" };
  const drivers = activeUsersByRole("repartidor");

  filterHolder.innerHTML = `
    <button class="chip active" type="button" data-mode="todos">Todos</button>
    <button class="chip" type="button" data-mode="domicilio">Domicilio</button>
    <button class="chip" type="button" data-mode="buscar">Pasar a buscar</button>
  `;

  function visibleOrders() {
    const active = getHistory().filter(isActiveOrder);
    if (filter.mode === "domicilio") return active.filter((order) => !isPickupOrder(order));
    if (filter.mode === "buscar") return active.filter(isPickupOrder);
    return active;
  }

  function card(order) {
    const steps = allowedTransitions(order, session.role);
    const driverField = canAssignDriver(order)
      ? `
        <label class="inline-field">
          <span>Repartidor</span>
          <select data-driver="${escapeHtml(order.id)}">
            <option value="">Sin asignar</option>
            ${drivers.map((driver) => `<option value="${escapeHtml(driver.name)}" ${order.driverName === driver.name ? "selected" : ""}>${escapeHtml(driver.name)}</option>`).join("")}
          </select>
        </label>
      `
      : "";
    return `
      <article class="internal-order" data-order="${escapeHtml(order.id)}">
        <header>
          <div>
            <small>${escapeHtml(order.id)}</small>
            <h3>${escapeHtml(order.customerName)}</h3>
            <p>${escapeHtml(order.shippingType)} · ${escapeHtml(order.paymentStatus || "Pago por confirmar")}</p>
          </div>
          <strong class="order-total">${money(order.total)}</strong>
        </header>
        <div class="internal-order-status">
          ${statusPill(order)}
          ${order.driverName ? `<span class="driver-tag">${escapeHtml(order.driverName)}</span>` : ""}
          ${(order.problems || []).length ? `<span class="status-pill tone-cancelado">Problema</span>` : ""}
          ${(order.rejections || []).length ? `<span class="status-pill tone-cancelado">Rechazos: ${order.rejections.length}</span>` : ""}
        </div>
        <ul class="internal-items">${orderItemsList(order)}</ul>
        <div class="location-display-wrap">
          <strong>Ubicacion</strong>
          ${locationDisplayHtml(order.locationText)}
        </div>
        ${orderProblems(order)}
        ${driverField}
        <div class="internal-order-actions">
          ${steps.map((step) => `<button class="button primary small" type="button" data-move="${escapeHtml(step.id)}" data-id="${escapeHtml(order.id)}">${escapeHtml(step.label)}</button>`).join("")}
          ${canCancelOrder(order) ? `<button class="button remove small" type="button" data-cancel="${escapeHtml(order.id)}">Cancelar pedido</button>` : ""}
        </div>
      </article>
    `;
  }

  function paint() {
    const orders = visibleOrders();
    document.getElementById("ordersCount").textContent = orders.length;
    listHolder.innerHTML = orders.length
      ? orders.map(card).join("")
      : `<p class="empty-state">No hay pedidos activos en este filtro.</p>`;
  }

  filterHolder.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mode]");
    if (!button) return;
    filter.mode = button.dataset.mode;
    filterHolder.querySelectorAll("[data-mode]").forEach((node) => node.classList.toggle("active", node === button));
    paint();
  });

  listHolder.addEventListener("click", (event) => {
    const move = event.target.closest("[data-move]");
    if (move) {
      const result = moveOrder(move.dataset.id, move.dataset.move, session);
      showToast(result.message);
      paint();
      return;
    }
    const cancel = event.target.closest("[data-cancel]");
    if (cancel) {
      const dialog = document.getElementById("cancelDialog");
      const reasonInput = document.getElementById("cancelReason");
      const noteInput = document.getElementById("cancelNote");

      reasonInput.value = "";
      noteInput.value = "";
      dialog.showModal();

      dialog.addEventListener("close", () => {
        if (dialog.returnValue !== "ok") return;

        const result = cancelOrder(
          cancel.dataset.cancel,
          reasonInput.value,
          noteInput.value,
          session
        );

        showToast(result.message);
        paint();
      }, { once: true });
    }
  });

  listHolder.addEventListener("change", (event) => {
    const select = event.target.closest("[data-driver]");
    if (!select) return;
    const result = assignDriver(select.dataset.driver, select.value, session);
    showToast(result.message);
    paint();
  });

  paint();
}

function renderDriverPanel(session) {
  const listHolder = document.getElementById("driverList");
  const openHolder = document.getElementById("driverOfferList");

  function mine() {
    return getHistory().filter((order) => !isPickupOrder(order) && isActiveOrder(order) && orderBelongsToDriver(order, session));
  }

  function done() {
    return getHistory().filter((order) => !isPickupOrder(order) && !isActiveOrder(order) && order.driverName === session.name);
  }

  function card(order, isOffer) {
    const steps = allowedTransitions(order, session.role);
    const location = locationDisplayHtml(order.locationText);
    return `
      <article class="internal-order driver-order" data-order="${escapeHtml(order.id)}">
        <header>
          <div>
            <small>${escapeHtml(order.id)}</small>
            <h3>${escapeHtml(order.customerName)}</h3>
          </div>
          <strong class="order-total">${money(order.total)}</strong>
        </header>
        <div class="internal-order-status">${statusPill(order)}</div>
        <div class="route-box">
          <p><strong>Recoger en</strong><br>${escapeHtml(STORE_LOCATION.address)}</p>
          <p><strong>Entregar en</strong><br>${location}</p>
        </div>
        ${order.deliveryCode ? `<p class="code-hint">Pide el codigo de entrega al cliente cuando llegues.</p>` : ""}
        ${orderProblems(order)}
        <div class="internal-order-actions">
          ${isOffer ? `<button class="button remove small" type="button" data-reject="${escapeHtml(order.id)}">Rechazar</button>` : ""}
          ${steps.map((step) => `<button class="button primary small" type="button" data-move="${escapeHtml(step.id)}" data-id="${escapeHtml(order.id)}">${escapeHtml(step.label)}</button>`).join("")}
          ${!isOffer && canReportProblem(order) ? `<button class="button secondary small" type="button" data-problem="${escapeHtml(order.id)}">Reportar problema</button>` : ""}
        </div>
      </article>
    `;
  }

  function paint() {
    const offers = getHistory().filter((order) => driverCanSeeOffer(order, session));
    openHolder.innerHTML = offers.length ? offers.map((order) => card(order, true)).join("") : "";
    document.getElementById("driverOfferWrap").hidden = !offers.length;

    const active = mine();
    listHolder.innerHTML = active.length
      ? active.map((order) => card(order, false)).join("")
      : `<p class="empty-state">No tienes entregas activas.</p>`;
    const todayKey = localDateKey(new Date());
    const doneToday = done().filter((order) => orderDateKey(order) === todayKey);
    document.getElementById("driverCount").textContent = active.length;
    document.getElementById("driverDoneCount").textContent = doneToday.length;
  }

  listHolder.addEventListener("click", onDriverClick);
  openHolder.addEventListener("click", onDriverClick);

  function onDriverClick(event) {
    const move = event.target.closest("[data-move]");
    if (move) {
      const order = getHistory().find((entry) => entry.id === move.dataset.id);
      if (order && needsDeliveryCode(order, move.dataset.move, session)) {
        askText("codeDialog", "Escribe el codigo de 4 digitos que te dio el cliente", "0000").then((code) => {
          const result = moveOrder(move.dataset.id, move.dataset.move, session, code);
          showToast(result.message);
          paint();
        });
        return;
      }
      const result = moveOrder(move.dataset.id, move.dataset.move, session);
      showToast(result.message);
      paint();
      return;
    }
    const problem = event.target.closest("[data-problem]");
    if (problem) {
      askText("problemDialog", "Que paso con este pedido?", "Ej: el cliente no contesta").then((note) => {
        const result = reportOrderProblem(problem.dataset.problem, note, session);
        showToast(result.message);
        paint();
      });
      return;
    }
    const reject = event.target.closest("[data-reject]");
    if (reject) {
      askText("problemDialog", "Por que no puedes tomar este pedido?", "Ej: estoy ocupado, problema con vehiculo").then((reason) => {
        const result = rejectDeliveryOrder(reject.dataset.reject, reason, session);
        showToast(result.message);
        paint();
      });
    }
  }

  paint();
}

function rangeStats(orders, from, to) {
  const inRange = orders.filter((order) => {
    const at = new Date(order.createdAt);
    return at >= from && at <= to;
  });
  const completed = inRange.filter((order) => !isActiveOrder(order) && orderStatus(order) !== CANCELLED_STATUS);
  const cancelled = inRange.filter((order) => orderStatus(order) === CANCELLED_STATUS);
  return {
    orders: inRange.length,
    sales: ordersTotal(completed),
    completed: completed.length,
    cancelled: cancelled.length
  };
}

function renderAdminPanel(session) {
  const history = getHistory();
  const now = new Date();
  const today = rangeStats(history, new Date(now.getFullYear(), now.getMonth(), now.getDate()), new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999));
  const week = rangeStats(history, startOfWeek(now), endOfWeek(now));
  const month = rangeStats(history, new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999));

  document.getElementById("adminStats").innerHTML = [
    { label: "Hoy", data: today },
    { label: "Semana", data: week },
    { label: "Mes", data: month }
  ]
    .map(
      (block) => `
      <article class="kpi">
        <span>${block.label}</span>
        <strong>${money(block.data.sales)}</strong>
        <small>${block.data.orders} pedidos · ${block.data.completed} entregados · ${block.data.cancelled} cancelados</small>
      </article>
    `
    )
    .join("");

  const todayKey = localDateKey(new Date());
  const drivers = activeUsersByRole("repartidor");
  document.getElementById("adminDrivers").innerHTML = drivers.length
    ? drivers
        .map((driver) => {
          const total = history.filter((order) => order.driverName === driver.name);
          const todayDone = total.filter((order) => orderDateKey(order) === todayKey && orderStatus(order) === "entregado");
          const active = total.filter(isActiveOrder);
          const problems = total.reduce((sum, order) => sum + (order.problems || []).filter((problem) => problem.by === driver.name).length, 0);
          return `
            <li>
              <strong>${escapeHtml(driver.name)}</strong>
              <span>${todayDone.length} entregas hoy · ${active.length} activas · ${problems} problemas · ${money(ordersTotal(todayDone))}</span>
            </li>
          `;
        })
        .join("")
    : `<li class="muted">Sin repartidores registrados.</li>`;

  const staff = getUsers().filter((user) => user.role !== "repartidor");
  document.getElementById("adminUsers").innerHTML = staff
    .map((user) => `<li><strong>${escapeHtml(user.name)}</strong><span>${escapeHtml(user.username)} · ${escapeHtml(ROLES[user.role].short)}</span></li>`)
    .join("");

  document.getElementById("adminRecent").innerHTML = history.slice(0, 8).length
    ? history
        .slice(0, 8)
        .map(
          (order) => `
          <li>
            <div>
              <strong>${escapeHtml(order.id)} · ${escapeHtml(order.customerName)}</strong>
              <span>${escapeHtml(order.shippingType)} · ${money(order.total)}</span>
            </div>
            ${statusPill(order)}
          </li>
        `
        )
        .join("")
    : `<li class="muted">Todavia no hay pedidos.</li>`;
}

const internalPage = document.body.dataset.page;
if (internalPage === "login") {
  renderLoginPage();
} else if (internalPage === "panel-pedidos") {
  const session = requireRole(["encargado", "admin"]);
  if (session) {
    mountInternalShell(session, "panel-pedidos.html");
    renderOrdersPanel(session);
  }
} else if (internalPage === "repartidor") {
  const session = requireRole("repartidor");
  if (session) {
    mountInternalShell(session, "repartidor.html");
    renderDriverPanel(session);
  }
} else if (internalPage === "admin") {
  const session = requireRole("admin");
  if (session) {
    mountInternalShell(session, "admin.html");
    renderAdminPanel(session);
  }
}
