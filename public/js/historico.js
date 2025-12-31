(function () {
  console.log("[Historico] historico.js cargado ✅");

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(msg) {
    const el = $("statusHistorico");
    if (el) el.textContent = msg || "—";
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
    return d.toLocaleString("es-CO", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
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
    const tTotal = inicioTotal
      ? finTotal.getTime() - inicioTotal.getTime()
      : null;

    return { tRec, tPrep, tListo, tCamino, tTotal };
  }

  function estadoBadgeHtml(estadoRaw) {
    const estado = safeText(estadoRaw).trim();
    let cls = "bg-slate-100 text-slate-800 dark:bg-white/10 dark:text-slate-100";

    if (estado === "Recibido")
      cls = "bg-yellow-100 text-yellow-900 dark:bg-yellow-500/20 dark:text-yellow-200";
    if (estado === "En preparación")
      cls = "bg-orange-100 text-orange-900 dark:bg-orange-500/20 dark:text-orange-200";
    if (estado === "Listo")
      cls = "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200";
    if (estado === "En camino")
      cls = "bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-200";
    if (estado === "Entregado")
      cls = "bg-indigo-100 text-indigo-900 dark:bg-indigo-500/20 dark:text-indigo-200";

    return `<span class="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-extrabold ${cls}">${escapeHtml(
      estado || "—"
    )}</span>`;
  }

  function renderErrorRow(msg) {
    const tbody = $("tablaHistorico");
    if (!tbody) return;
    tbody.innerHTML = `
      <tr>
        <td class="px-4 py-6 text-sm text-red-600 dark:text-red-300" colspan="11">
          ${escapeHtml(msg)}
        </td>
      </tr>
    `;
    const c = $("countHistorico");
    if (c) c.textContent = "0";
  }

  function renderTabla(data) {
    const tbody = $("tablaHistorico");
    if (!tbody) return;

    tbody.innerHTML = "";

    const c = $("countHistorico");
    if (c) c.textContent = String(data.length);

    if (data.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td class="px-4 py-6 text-sm text-slate-500 dark:text-slate-400" colspan="11">
            No hay pedidos con los filtros actuales (o el endpoint devuelve vacío).
          </td>
        </tr>
      `;
      return;
    }

    data.forEach((p, idx) => {
      const d = calcDurations(p);

      const tr = document.createElement("tr");
      tr.className =
        "text-slate-800 dark:text-slate-100 hover:bg-slate-50/80 dark:hover:bg-white/5 transition-colors";
      if (idx % 2 === 1) tr.classList.add("bg-white/40", "dark:bg-black/10");

      tr.innerHTML = `
        <td class="px-4 py-3 font-extrabold">#${escapeHtml(p.id)}</td>
        <td class="px-4 py-3">${escapeHtml(p.nombre_cliente)}</td>
        <td class="px-4 py-3">${escapeHtml(p.celular_cliente)}</td>
        <td class="px-4 py-3">${escapeHtml(p.direccion_cliente)}</td>
        <td class="px-4 py-3">${estadoBadgeHtml(p.estado)}</td>
        <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">${formatDateTime(
          p.created_at
        )}</td>
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
    const estadoSel = safeText($("filtroEstado")?.value).trim();
    const desde = $("filtroDesde")?.value || "";
    const hasta = $("filtroHasta")?.value || "";

    let out = list.slice();

    if (estadoSel) {
      out = out.filter((p) => safeText(p.estado).trim() === estadoSel);
    }

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
        return (
          id.includes(txt) ||
          nombre.includes(txt) ||
          cel.includes(txt) ||
          dir.includes(txt)
        );
      });
    }

    return out;
  }

  // ================================
  // AUTH
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

    const headers2 = { ...headers, Authorization: `Bearer ${newToken}` };
    return fetch(url, { ...options, headers: headers2 });
  }

  // ================================
  // DATA
  // ================================
  let rawData = [];

  async function fetchHistorico() {
    // sesión mínima
    const token = getAccessToken();
    const u = getUsuario();

    if (!token || !u) {
      setStatus("Sin sesión (no hay token/usuario).");
      renderErrorRow("No se ha iniciado sesión. Debes iniciar sesión primero.");
      return [];
    }

    setStatus("Consultando /api/pedidos/historico ...");

    const res = await apiFetch("/api/pedidos/historico", { method: "GET" });

    if (res.status === 401) {
      clearSession();
      setStatus("401: sesión expirada.");
      renderErrorRow("401: Sesión expirada. Inicia sesión de nuevo.");
      setTimeout(() => (window.location.href = "/login.html"), 800);
      return [];
    }

    const textBody = await res.text().catch(() => "");
    if (!res.ok) {
      console.error("[Historico] HTTP", res.status, textBody);
      setStatus(`Error HTTP ${res.status}`);
      renderErrorRow(`Error cargando histórico. HTTP ${res.status}. Respuesta: ${textBody || "(vacía)"}`);
      return [];
    }

    let data;
    try {
      data = JSON.parse(textBody || "null");
    } catch (e) {
      console.error("[Historico] JSON inválido:", textBody);
      setStatus("Respuesta inválida (no JSON).");
      renderErrorRow("El servidor devolvió una respuesta no-JSON.");
      return [];
    }

    // ✅ Normalizar: a veces backend responde { data: [...] } o { pedidos: [...] }
    if (Array.isArray(data)) {
      // ok
    } else if (Array.isArray(data?.data)) {
      data = data.data;
    } else if (Array.isArray(data?.pedidos)) {
      data = data.pedidos;
    } else {
      console.warn("[Historico] No vino array:", data);
      data = [];
    }

    setStatus(`OK: ${data.length} registros recibidos.`);
    return data.slice(0, 500);
  }

  async function cargar() {
    showLoader(true);
    rawData = await fetchHistorico();
    showLoader(false);
    renderTabla(applyClientFilters(rawData));
  }

  function aplicarFiltros() {
    renderTabla(applyClientFilters(rawData));
  }

  function limpiarFiltros() {
    if ($("filtroTexto")) $("filtroTexto").value = "";
    if ($("filtroEstado")) $("filtroEstado").value = "";
    if ($("filtroDesde")) $("filtroDesde").value = "";
    if ($("filtroHasta")) $("filtroHasta").value = "";
    renderTabla(applyClientFilters(rawData));
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const btnAplicar = $("btnAplicar");
    const btnLimpiar = $("btnLimpiar");
    const btnRefrescar = $("btnRefrescar");

    if (btnAplicar) btnAplicar.addEventListener("click", aplicarFiltros);
    if (btnLimpiar) btnLimpiar.addEventListener("click", limpiarFiltros);
    if (btnRefrescar) btnRefrescar.addEventListener("click", cargar);

    // filtros en vivo
    const run = () => renderTabla(applyClientFilters(rawData));
    $("filtroTexto")?.addEventListener("input", run);
    $("filtroEstado")?.addEventListener("change", run);
    $("filtroDesde")?.addEventListener("change", run);
    $("filtroHasta")?.addEventListener("change", run);

    await cargar();
  });
})();
