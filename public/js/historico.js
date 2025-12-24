(function () {
  const HISTORICO_DELAY_MS = 5 * 60 * 1000;

  function $(id) {
    return document.getElementById(id);
  }

  function showLoader(on) {
    const l = $("loaderHistorico");
    if (!l) return;
    l.classList.toggle("hidden", !on);
  }

  function safeText(v) {
    return (v ?? "").toString();
  }

  function escapeHtml(s) {
    return safeText(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function parseDate(v) {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  function formatDateTime(v) {
    const d = parseDate(v);
    if (!d) return "—";
    return d.toLocaleString();
  }

  function formatDuration(ms) {
    if (ms == null) return "—";
    if (ms < 0) ms = 0;

    const totalSec = Math.floor(ms / 1000);
    const hh = Math.floor(totalSec / 3600);
    const mm = Math.floor((totalSec % 3600) / 60);
    const ss = totalSec % 60;

    const pad = (n) => String(n).padStart(2, "0");
    if (hh > 0) return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
    return `${pad(mm)}:${pad(ss)}`;
  }

  function calcDurations(p) {
    const now = new Date();

    const created = parseDate(p.created_at) || now;
    const recibido = parseDate(p.recibido_at) || created;
    const prep = parseDate(p.en_preparacion_at);
    const listo = parseDate(p.listo_at);
    const camino = parseDate(p.en_camino_at);
    const entregado = parseDate(p.entregado_at);

    const finRec = prep || listo || camino || entregado || now;
    const finPrep = listo || camino || entregado || now;
    const finListo = camino || entregado || now;
    const finCamino = entregado || now;

    const tRec = recibido ? finRec.getTime() - recibido.getTime() : null;
    const tPrep = prep ? finPrep.getTime() - prep.getTime() : null;
    const tListo = listo ? finListo.getTime() - listo.getTime() : null;
    const tCamino = camino ? finCamino.getTime() - camino.getTime() : null;

    const inicioTotal = recibido || created;
    const finTotal = entregado || now;
    const tTotal = inicioTotal ? finTotal.getTime() - inicioTotal.getTime() : null;

    return { tRec, tPrep, tListo, tCamino, tTotal };
  }

  function renderTabla(data) {
    const tbody = $("tablaHistorico");
    if (!tbody) return;

    tbody.innerHTML = "";
    const c = $("countHistorico");
    if (c) c.textContent = String(data.length);

    if (data.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="px-4 py-6 text-sm text-slate-500 dark:text-slate-400" colspan="11">
          No hay pedidos en histórico todavía (solo aparecen cuando están "Listo" y pasan 5 min).
        </td>
      `;
      tbody.appendChild(tr);
      return;
    }

    data.forEach((p) => {
      const d = calcDurations(p);

      const tr = document.createElement("tr");
      tr.className = "text-slate-800 dark:text-slate-100";

      tr.innerHTML = `
        <td class="px-4 py-3 font-extrabold">#${escapeHtml(p.id)}</td>
        <td class="px-4 py-3">${escapeHtml(p.nombre_cliente)}</td>
        <td class="px-4 py-3">${escapeHtml(p.celular_cliente)}</td>
        <td class="px-4 py-3">${escapeHtml(p.direccion_cliente)}</td>
        <td class="px-4 py-3 font-bold">${escapeHtml(p.estado)}</td>
        <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">${formatDateTime(p.created_at)}</td>
        <td class="px-4 py-3">${formatDuration(d.tRec)}</td>
        <td class="px-4 py-3">${formatDuration(d.tPrep)}</td>
        <td class="px-4 py-3">${formatDuration(d.tListo)}</td>
        <td class="px-4 py-3">${formatDuration(d.tCamino)}</td>
        <td class="px-4 py-3 font-extrabold">${formatDuration(d.tTotal)}</td>
      `;

      tbody.appendChild(tr);
    });
  }

  function applyClientFilters(list) {
    const txt = safeText($("filtroTexto")?.value).trim().toLowerCase();
    const desde = $("filtroDesde")?.value || "";
    const hasta = $("filtroHasta")?.value || "";

    let out = list.slice();

    // Estado fijo: Listo
    out = out.filter((p) => safeText(p.estado) === "Listo");

    if (desde) {
      const min = new Date(desde + "T00:00:00").getTime();
      out = out.filter((p) => (parseDate(p.created_at)?.getTime() || 0) >= min);
    }

    if (hasta) {
      const max = new Date(hasta + "T23:59:59").getTime();
      out = out.filter((p) => (parseDate(p.created_at)?.getTime() || 0) <= max);
    }

    if (txt) {
      out = out.filter((p) => {
        const id = safeText(p.id).toLowerCase();
        const nombre = safeText(p.nombre_cliente).toLowerCase();
        const cel = safeText(p.celular_cliente).toLowerCase();
        const dir = safeText(p.direccion_cliente).toLowerCase();
        return id.includes(txt) || nombre.includes(txt) || cel.includes(txt) || dir.includes(txt);
      });
    }

    return out;
  }

  // ================================
  // 🔐 AUTH HELPERS (JWT + refresh) igual que home.js
  // ================================
  function getAccessToken() {
    try {
      return localStorage.getItem("access_token") || "";
    } catch (_) {
      return "";
    }
  }

  function getRefreshToken() {
    try {
      return localStorage.getItem("refresh_token") || "";
    } catch (_) {
      return "";
    }
  }

  function getUsuario() {
    try {
      return JSON.parse(localStorage.getItem("usuario") || "null");
    } catch (_) {
      return null;
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("usuario");
    } catch (_) {}
  }

  async function tryRefreshAccessToken() {
    const refresh_token = getRefreshToken();
    if (!refresh_token) return null;

    const r = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token }),
    });

    if (!r.ok) return null;

    const data = await r.json().catch(() => ({}));
    if (!data.access_token) return null;

    try {
      localStorage.setItem("access_token", data.access_token);
    } catch (_) {}

    return data.access_token;
  }

  async function apiFetch(url, options = {}) {
    const token = getAccessToken();

    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };

    if (token) headers.Authorization = `Bearer ${token}`;

    const resp1 = await fetch(url, { ...options, headers });

    if (resp1.status !== 401) return resp1;

    const newToken = await tryRefreshAccessToken();
    if (!newToken) return resp1;

    const headers2 = {
      ...headers,
      Authorization: `Bearer ${newToken}`,
    };

    return fetch(url, { ...options, headers: headers2 });
  }

  // ================================
  // 🔵 DATA
  // ================================
  let rawData = [];

  async function fetchHistorico() {
    // Validar sesión
    const token = getAccessToken();
    const usuarioLogin = getUsuario();
    if (!token || !usuarioLogin) {
      alert("No se ha iniciado sesión.");
      window.location.href = "/login.html";
      return [];
    }

    // ✅ NUEVO: sin correo, con JWT
    const res = await apiFetch("/api/pedidos/historico", { method: "GET" });

    if (res.status === 401) {
      clearSession();
      alert("Sesión expirada. Inicia sesión de nuevo.");
      window.location.href = "/login.html";
      return [];
    }

    if (!res.ok) {
      console.error("Error histórico:", res.status);
      alert("No se pudo cargar el histórico.");
      return [];
    }

    let data = await res.json().catch(() => []);
    if (!Array.isArray(data)) data = [];

    // Seguridad extra: Listo + 5 min
    const cutoff = Date.now() - HISTORICO_DELAY_MS;
    data = data.filter((p) => {
      if (safeText(p.estado) !== "Listo") return false;
      const t = parseDate(p.listo_at);
      if (!t) return false;
      return t.getTime() < cutoff;
    });

    // Orden más reciente primero (por listo_at)
    data.sort(
      (a, b) =>
        (parseDate(b.listo_at)?.getTime() || 0) -
        (parseDate(a.listo_at)?.getTime() || 0)
    );

    return data.slice(0, 500);
  }

  async function cargar() {
    showLoader(true);
    rawData = await fetchHistorico();
    showLoader(false);
    renderTabla(applyClientFilters(rawData));
  }

  window.aplicarFiltros = function () {
    renderTabla(applyClientFilters(rawData));
  };

  window.limpiarFiltros = function () {
    if ($("filtroTexto")) $("filtroTexto").value = "";
    if ($("filtroDesde")) $("filtroDesde").value = "";
    if ($("filtroHasta")) $("filtroHasta").value = "";
    renderTabla(applyClientFilters(rawData));
  };

  window.refrescarHistorico = function () {
    cargar();
  };

  document.addEventListener("DOMContentLoaded", () => {
    // ✅ Validar sesión antes de cargar
    const token = getAccessToken();
    const u = getUsuario();
    if (!token || !u) {
      alert("No se ha iniciado sesión.");
      window.location.href = "/login.html";
      return;
    }

    cargar();

    const ft = $("filtroTexto");
    if (ft) {
      ft.addEventListener("keydown", (e) => {
        if (e.key === "Enter") renderTabla(applyClientFilters(rawData));
      });
    }
  });
})();
