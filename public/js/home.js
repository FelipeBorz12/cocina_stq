// public/js/home.js

// ======================================================
// ✅ Helpers DOM
// ======================================================
function $(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value ?? "—";
}

// ======================================================
// 🔵 LOADER GLOBAL
// ======================================================
function showLoader(text = "Cargando...") {
  const loader = $("loader");
  if (!loader) return;
  const p = loader.querySelector("p");
  if (p) p.textContent = text;
  loader.classList.remove("hidden");
}

function hideLoader() {
  const loader = $("loader");
  if (!loader) return;
  loader.classList.add("hidden");
}

// ======================================================
// 🔵 MODAL GLOBAL
// ======================================================
function showModal(msg) {
  const modal = $("modal");
  if (!modal) return;
  const t = $("modal-text");
  if (t) t.textContent = msg;
  modal.classList.remove("hidden");
}

function cerrarModal() {
  const modal = $("modal");
  if (!modal) return;

  // Restaurar botón "Aceptar" si se ocultó por el prompt de turno
  const box = modal.querySelector(".modal-box");
  if (box) {
    const defaultBtn = box.querySelector("button[onclick='cerrarModal()']");
    if (defaultBtn) defaultBtn.style.display = "";
    box.querySelectorAll("button[data-shift='1']").forEach((b) => b.remove());
  }

  modal.classList.add("hidden");
}

// ======================================================
// 🔒 MODAL AUTH (sesión expirada / perdida)
// ======================================================
function showAuthModal(
  msg = "Tu sesión expiró o se perdió. Inicia sesión de nuevo."
) {
  const m = $("modalAuth");
  const t = $("modalAuthText");

  if (!m || !t) {
    showModal(msg);
    setTimeout(() => (window.location.href = "/login.html"), 900);
    return;
  }

  t.textContent = msg;
  m.classList.remove("hidden");
}

function cerrarModalAuth() {
  const m = $("modalAuth");
  if (!m) return;
  m.classList.add("hidden");
}

function redirigirLogin() {
  clearSession();
  window.location.href = "/login.html";
}

// ======================================================
// 🔐 AUTH HELPERS (JWT + refresh)
// ======================================================
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

function getUsuarioNombre() {
  const u = getUsuario();
  const nombre =
    u?.administrador ||
    u?.nombre ||
    u?.Nombre ||
    u?.name ||
    u?.usuario ||
    u?.displayName ||
    u?.admin_name ||
    "";
  return (nombre || "").toString().trim() || "Usuario";
}

function getUsuarioCorreo() {
  const u = getUsuario();
  const correo = u?.correo || u?.email || u?.Correo || "";
  return (correo || "").toString().trim();
}

function getUsuarioCelular() {
  const u = getUsuario();
  const cel =
    u?.celular ||
    u?.telefono ||
    u?.phone ||
    u?.Celular ||
    u?.Telefono ||
    "";
  return (cel || "").toString().trim();
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

/**
 * apiFetch: añade Authorization automáticamente y reintenta si hay 401
 */
async function apiFetch(url, options = {}) {
  const token = getAccessToken();

  const headers = {
    ...(options.headers || {}),
  };

  // Solo poner Content-Type si NO es FormData
  const isFormData = options.body instanceof FormData;
  if (!isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (token) headers.Authorization = `Bearer ${token}`;

  const resp1 = await fetch(url, { ...options, headers });

  // Si no es 401, normal
  if (resp1.status !== 401) return resp1;

  // Intentar refresh y reintentar una vez
  const newToken = await tryRefreshAccessToken();
  if (!newToken) return resp1;

  const headers2 = {
    ...headers,
    Authorization: `Bearer ${newToken}`,
  };

  return fetch(url, { ...options, headers: headers2 });
}

// ======================================================
// ✅ Guard de sesión (para no quedar colgado tras redesplegar)
// ======================================================
async function requireValidSessionOrRedirect(contextMsg = "") {
  const token = getAccessToken();
  const refresh = getRefreshToken();
  const u = getUsuario();

  // Si no hay tokens mínimos, directo al login
  if (!token && !refresh) {
    clearSession();
    showAuthModal("No hay sesión activa. Inicia sesión para continuar.");
    return false;
  }

  // Intentar validar con /me
  try {
    const r = await apiFetch("/api/auth/me", { method: "GET" });

    if (r.status === 401) {
      clearSession();
      showAuthModal("Tu sesión expiró. Inicia sesión de nuevo.");
      return false;
    }

    // Si falla /me pero aún hay usuario local, dejamos pasar para no bloquear UI
    if (!r.ok) {
      console.warn("Validación /api/auth/me no OK:", r.status, contextMsg);
      if (!u) {
        showAuthModal("No se pudo validar tu sesión. Inicia sesión de nuevo.");
        return false;
      }
      return true;
    }

    const me = await r.json().catch(() => null);
    if (me) {
      try {
        const prev = getUsuario() || {};
        localStorage.setItem("usuario", JSON.stringify({ ...prev, ...me }));
      } catch (_) {}
    }

    return true;
  } catch (e) {
    console.warn("Error validando sesión:", e, contextMsg);
    if (!u) {
      showAuthModal("No se pudo validar tu sesión. Inicia sesión de nuevo.");
      return false;
    }
    return true;
  }
}

// ======================================================
// ✅ Chip de usuario (opcional)
// ======================================================
function renderUserChip() {
  const chip = $("chipUsuario");
  const txt = $("chipUsuarioText");
  if (!chip || !txt) return;

  const nombre = getUsuarioNombre();
  const correo = getUsuarioCorreo();

  txt.textContent = correo ? `${nombre} · ${correo}` : nombre;
  chip.classList.remove("hidden");
}

// ======================================================
// 🔵 MODAL PERFIL (correo + nombre + celular)
// ======================================================
async function abrirPerfil() {
  const modal = $("modalPerfil");
  const correoInput = $("perfilCorreo");
  const nombreInput = $("perfilNombre");
  const celInput = $("perfilCelular");
  const passInput = $("perfilPassword");
  const pass2Input = $("perfilPassword2");

  if (!modal) return;

  const ok = await requireValidSessionOrRedirect(
    "No se detectó sesión válida para abrir el perfil."
  );
  if (!ok) return;

  // Prellenar desde localStorage
  if (correoInput) correoInput.value = getUsuarioCorreo() || "";
  if (nombreInput) nombreInput.value = getUsuarioNombre() || "";
  if (celInput) celInput.value = getUsuarioCelular() || "";
  if (passInput) passInput.value = "";
  if (pass2Input) pass2Input.value = "";

  // Intentar refrescar desde backend para datos reales
  try {
    const r = await apiFetch("/api/auth/me", { method: "GET" });

    if (r.status === 401) {
      clearSession();
      showAuthModal("Sesión expirada al cargar perfil. Inicia sesión de nuevo.");
      return;
    }

    if (r.ok) {
      const me = await r.json().catch(() => null);
      if (me) {
        try {
          const prev = getUsuario() || {};
          localStorage.setItem("usuario", JSON.stringify({ ...prev, ...me }));
        } catch (_) {}

        // Normalizar nombres de campos
        const nombre = me.administrador || me.nombre || me.Nombre || "";
        const correo = me.correo || me.email || "";
        const cel = me.celular || me.telefono || me.Celular || "";

        if (correoInput && correo) correoInput.value = correo;
        if (nombreInput && nombre) nombreInput.value = nombre;
        if (celInput && cel) celInput.value = cel;

        renderUserChip();
      }
    }
  } catch (e) {
    console.warn("No se pudo refrescar /me al abrir perfil:", e);
  }

  modal.classList.remove("hidden");
}

function cerrarPerfil() {
  const modal = $("modalPerfil");
  if (!modal) return;
  modal.classList.add("hidden");
}

async function guardarPerfil() {
  const correoInput = $("perfilCorreo");
  const nombreInput = $("perfilNombre");
  const celInput = $("perfilCelular");
  const passInput = $("perfilPassword");
  const pass2Input = $("perfilPassword2");

  const correo = (correoInput ? correoInput.value : "").trim();
  const nombre = (nombreInput ? nombreInput.value : "").trim();
  const celular = (celInput ? celInput.value : "").trim();
  const password = passInput ? passInput.value : "";
  const password2 = pass2Input ? pass2Input.value : "";

  if (!correo) return showModal("Correo inválido.");
  if (!nombre) return showModal("El nombre no puede estar vacío.");
  if (!celular) return showModal("El celular no puede estar vacío.");
  if (password || password2) {
    if (password !== password2) return showModal("Las contraseñas no coinciden.");
  }

  // ✅ Si luego agregas endpoint real, aquí conectas.
  // Por ahora: guardar local para mostrar datos completos en UI.
  try {
    const prev = getUsuario() || {};
    const updated = {
      ...prev,
      correo,
      administrador: nombre,
      nombre,
      celular,
    };
    localStorage.setItem("usuario", JSON.stringify(updated));
  } catch (_) {}

  renderUserChip();
  showModal("Perfil actualizado ✅ (local)");
  cerrarPerfil();
}

// ======================================================
// Sidebar + navegación + impresora
// ======================================================
function toggleSidebar() {
  const sidebar = $("sidebar");
  const backdrop = $("sidebar-backdrop");
  if (!sidebar) return;

  const isHidden = sidebar.classList.contains("-translate-x-full");
  if (isHidden) {
    sidebar.classList.remove("-translate-x-full");
    if (backdrop) backdrop.classList.remove("hidden");
  } else {
    sidebar.classList.add("-translate-x-full");
    if (backdrop) backdrop.classList.add("hidden");
  }
}

function irHome() {
  window.location.href = "/home.html";
}
function irImpresoras() {
  window.location.href = "/impresoras.html";
}
function irHistorico() {
  window.location.href = "/historico.html";
}

function actualizarTextoImpresoraActual() {
  const span = $("impresora-actual");
  if (!span) return;

  let config = {};
  try {
    config = JSON.parse(localStorage.getItem("configImpresora") || "{}");
  } catch (_) {
    config = {};
  }

  if (config && config.nombre) {
    span.textContent =
      "Impresora: " +
      config.nombre +
      ":" +
      (config.puerto || config.port || 9100);
  } else {
    span.textContent = "Impresora no configurada";
  }
  span.classList.remove("hidden");
}

// ======================================================
// 🕒 TURNO (Modal inicial + aviso cierre + extender 30 min)
// ======================================================
const SHIFT_WARN_KEY = "shift_warn_shown";
let turnoClockTimer = null;

function formatFechaHoraCO(d = new Date()) {
  try {
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
  } catch (_) {
    return d.toLocaleString("es-CO", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  }
}

function startTurnoClock() {
  const el = $("turnoFechaHora");
  if (!el) return;

  const tick = () => {
    el.textContent = formatFechaHoraCO(new Date());
  };

  tick();

  if (turnoClockTimer) clearInterval(turnoClockTimer);
  turnoClockTimer = setInterval(tick, 1000);
}

function stopTurnoClock() {
  if (turnoClockTimer) {
    clearInterval(turnoClockTimer);
    turnoClockTimer = null;
  }
}

async function openTurnoModal() {
  const modal = $("modalTurno");
  if (!modal) {
    // Si el HTML no tiene modalTurno, al menos avisamos
    showModal("No existe el modal de turno (#modalTurno).");
    return;
  }

  const u = getUsuario();
  const adminInput = $("turnoAdminName");
  const sedeInput = $("turnoSedeName");

  const fillFromUser = (userObj) => {
    if (!userObj) return;

    const admin = (
      userObj.administrador ||
      userObj.nombre ||
      userObj.Nombre ||
      userObj.name ||
      ""
    )
      .toString()
      .trim();

    const sede = (
      userObj.PuntoVenta ||
      userObj.puntoventa ||
      userObj.puntoVenta ||
      userObj.store_id ||
      ""
    )
      .toString()
      .trim();

    if (adminInput && !adminInput.value) adminInput.value = admin;
    if (sedeInput && sede) sedeInput.value = sede;
  };

  fillFromUser(u);

  const faltaAdmin = adminInput && !adminInput.value.trim();
  const faltaSede = sedeInput && !sedeInput.value.trim();

  if (faltaAdmin || faltaSede) {
    try {
      const r = await apiFetch("/api/auth/me", { method: "GET" });
      if (r.ok) {
        const me = await r.json().catch(() => null);
        if (me) {
          try {
            const prev = getUsuario() || {};
            localStorage.setItem("usuario", JSON.stringify({ ...prev, ...me }));
          } catch (_) {}
          fillFromUser(me);
        }
      }
    } catch (e) {
      console.warn("No se pudo prellenar desde /api/auth/me:", e);
    }
  }

  modal.classList.remove("hidden");
  startTurnoClock();
}

function cerrarModalTurno() {
  $("modalTurno")?.classList.add("hidden");
  stopTurnoClock();
}

// Normaliza varias formas de respuesta del backend
function normalizeShiftResponse(data) {
  // Formas posibles:
  // { shift: {...}, meta: {...} }
  // { turno: {...} }
  // { activo: true, turno: {...} }
  // { activo: false }
  const shift =
    data?.shift ??
    data?.turno ??
    (data?.activo ? data?.turno : null) ??
    null;

  const meta = data?.meta ?? null;
  return { shift, meta };
}

async function getTurnoActivoFull() {
  try {
    const r = await apiFetch("/api/shifts/active", { method: "GET" });

    // Si el endpoint no existe, no bloqueamos: mostramos modal turno
    if (r.status === 404) return { shift: null, meta: null };

    if (!r.ok) return { shift: null, meta: null };

    const data = await r.json().catch(() => ({}));
    return normalizeShiftResponse(data);
  } catch (e) {
    console.warn("Error consultando /api/shifts/active:", e);
    return { shift: null, meta: null };
  }
}

async function checkTurnoActivo() {
  const { shift } = await getTurnoActivoFull();
  return shift || null;
}

async function iniciarTurno() {
  const btn = $("btnIniciarTurno");
  if (btn) btn.disabled = true;

  const admin_name = ($("turnoAdminName")?.value || "").trim();
  const sede_name = ($("turnoSedeName")?.value || "").trim();

  if (!admin_name) {
    if (btn) btn.disabled = false;
    showModal("Debes ingresar el nombre del administrador.");
    return;
  }

  if (!sede_name) {
    if (btn) btn.disabled = false;
    showModal(
      "No se pudo detectar la sede del usuario. Cierra sesión y vuelve a iniciar."
    );
    return;
  }

  try {
    showLoader("Iniciando turno...");

    const r = await apiFetch("/api/shifts/start", {
      method: "POST",
      body: JSON.stringify({ admin_name, sede_name }),
    });

    const data = await r.json().catch(() => ({}));

    hideLoader();
    if (btn) btn.disabled = false;

    if (!r.ok) {
      showModal(data.error || "No se pudo iniciar turno");
      return;
    }

    try {
      localStorage.removeItem(SHIFT_WARN_KEY);
    } catch (_) {}

    cerrarModalTurno();
    showModal("Turno iniciado ✅");

    startLoopsPedidos();
  } catch (e) {
    hideLoader();
    if (btn) btn.disabled = false;
    console.error(e);
    showModal("Error iniciando turno.");
  }
}

async function extenderTurno30() {
  try {
    showLoader("Extendiendo turno 30 min...");

    const r = await apiFetch("/api/shifts/extend", { method: "POST" });
    const data = await r.json().catch(() => ({}));

    hideLoader();

    if (!r.ok) {
      showModal(data.error || "No se pudo extender el turno.");
      return false;
    }

    try {
      localStorage.removeItem(SHIFT_WARN_KEY);
    } catch (_) {}

    showModal("Turno extendido 30 minutos ✅");
    return true;
  } catch (e) {
    hideLoader();
    console.error(e);
    showModal("Error extendiendo el turno.");
    return false;
  }
}

function showExtendPrompt(minutesLeft) {
  const modal = $("modal");
  const text = $("modal-text");

  if (!modal || !text) {
    const ok = confirm(
      `El turno se cerrará en ${minutesLeft} min. ¿Extender 30 min?`
    );
    if (ok) extenderTurno30();
    return;
  }

  text.textContent = `El turno se cerrará en ${minutesLeft} min. ¿Deseas extenderlo 30 min más?`;

  const box = modal.querySelector(".modal-box");
  if (!box) {
    modal.classList.remove("hidden");
    return;
  }

  const defaultBtn = box.querySelector("button[onclick='cerrarModal()']");
  if (defaultBtn) defaultBtn.style.display = "none";

  box.querySelectorAll("button[data-shift='1']").forEach((b) => b.remove());

  const btnYes = document.createElement("button");
  btnYes.textContent = "Sí, extender 30 min";
  btnYes.setAttribute("data-shift", "1");
  btnYes.className =
    "bg-primary text-white px-5 py-2 rounded-lg font-bold w-full mt-2";
  btnYes.onclick = async () => {
    await extenderTurno30();
    if (defaultBtn) defaultBtn.style.display = "";
    cerrarModal();
  };

  const btnNo = document.createElement("button");
  btnNo.textContent = "No, dejar que cierre";
  btnNo.setAttribute("data-shift", "1");
  btnNo.className =
    "px-5 py-2 rounded-lg font-bold w-full mt-2 border border-slate-300 text-slate-700 bg-white";
  btnNo.onclick = () => {
    if (defaultBtn) defaultBtn.style.display = "";
    cerrarModal();
  };

  box.appendChild(btnYes);
  box.appendChild(btnNo);

  modal.classList.remove("hidden");
}

async function turnoWatcher() {
  const { shift, meta } = await getTurnoActivoFull();

  if (!shift) {
    // ✅ Si NO hay turno, obligar modal (ingreso por turnos)
    openTurnoModal();
    return;
  }

  if (meta?.should_warn) {
    let shown = false;
    try {
      shown = localStorage.getItem(SHIFT_WARN_KEY) === "1";
    } catch (_) {
      shown = false;
    }

    if (!shown) {
      try {
        localStorage.setItem(SHIFT_WARN_KEY, "1");
      } catch (_) {}

      showExtendPrompt(meta?.minutes_left ?? 10);
    }
  }
}

// ======================================================
// 🟠 MODAL DEMORA (> 1 hora en el estado)
// ======================================================
let demoraAbierta = null; // { id, estado }
const UMBRAL_DEMORA_MS = 60 * 60 * 1000; // 1 hora
const POSPONER_MS = 10 * 60 * 1000; // 10 min

function abrirModalDemora(pedido, msEnEstado) {
  const modal = $("modalDemora");
  if (!modal) return;

  setText("demoraTitulo", `Pedido #${pedido.id}`);
  setText("demoraCliente", pedido.nombre_cliente || "—");
  setText("demoraCelular", pedido.celular_cliente || "—");
  setText("demoraDireccion", pedido.direccion_cliente || "—");
  setText("demoraEstado", pedido.estado || "—");
  setText("demoraTiempo", formatDuration(msEnEstado));

  demoraAbierta = { id: pedido.id, estado: pedido.estado };
  modal.classList.remove("hidden");
}

function cerrarModalDemora() {
  const modal = $("modalDemora");
  if (!modal) return;
  modal.classList.add("hidden");
  demoraAbierta = null;
}

function keyAvisado(id, estado) {
  return `demora_avisada_${id}_${estado}`;
}

function keyPosponer(id, estado) {
  return `demora_posponer_${id}_${estado}`;
}

function marcarDemoraComoAvisada() {
  if (!demoraAbierta) return cerrarModalDemora();

  try {
    localStorage.setItem(
      keyAvisado(demoraAbierta.id, demoraAbierta.estado),
      "1"
    );
    localStorage.removeItem(
      keyPosponer(demoraAbierta.id, demoraAbierta.estado)
    );
  } catch (_) {}

  const id = demoraAbierta.id;
  cerrarModalDemora();
  showModal(`Marcado como avisado: Pedido #${id}`);
}

function posponerDemora() {
  if (!demoraAbierta) return cerrarModalDemora();

  const until = Date.now() + POSPONER_MS;
  try {
    localStorage.setItem(
      keyPosponer(demoraAbierta.id, demoraAbierta.estado),
      String(until)
    );
  } catch (_) {}

  cerrarModalDemora();
}

// ======================================================
// ✅ HISTÓRICO: Listo -> histórico en 5 min (UI)
// ======================================================
const HISTORICO_DELAY_MS = 5 * 60 * 1000;

function keyHistWarned(id, listoAtIso) {
  return `hist_warned_${id}_${listoAtIso || "noiso"}`;
}

function showHistoricoEn5MinModal(p) {
  const listoAt = getTs(p, "listo_at");
  if (!listoAt) return;

  const k = keyHistWarned(p.id, listoAt.toISOString());
  let ya = false;
  try {
    ya = localStorage.getItem(k) === "1";
  } catch (_) {}

  if (ya) return;

  try {
    localStorage.setItem(k, "1");
  } catch (_) {}

  showModal(
    `Pedido #${p.id} está en "Listo" y pasará al histórico en 5 minutos.`
  );
}

function esHistorico(p) {
  if ((p.estado || "") !== "Listo") return false;
  const listoAt = getTs(p, "listo_at");
  if (!listoAt) return false;
  return Date.now() - listoAt.getTime() >= HISTORICO_DELAY_MS;
}

// ======================================================
// 🔵 Estado global pedidos
// ======================================================
let ultimoIdsPedidos = new Set();
let primeraCarga = true;
let pedidosCache = [];
let lastAutoRefresh = 0;

// ======================================================
// 🔵 Utilidades de tiempo
// ======================================================
function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function formatDuration(ms) {
  if (ms == null) return "—";
  if (ms < 0) ms = 0;

  const totalSec = Math.floor(ms / 1000);
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;

  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

function formatCountdown(ms) {
  if (ms == null) return "—";
  if (ms < 0) ms = 0;

  const totalSec = Math.floor(ms / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;

  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(mm)}:${pad(ss)}`;
}

// ===== timestamps fallback local =====
function keyTs(id, field) {
  return `ts_${id}_${field}`;
}

function getLocalTs(id, field) {
  try {
    return localStorage.getItem(keyTs(id, field)) || "";
  } catch (_) {
    return "";
  }
}

function setLocalTs(id, field, iso) {
  try {
    localStorage.setItem(keyTs(id, field), iso);
  } catch (_) {}
}

function getTs(p, field) {
  return parseDate(p?.[field]) || parseDate(getLocalTs(p?.id, field)) || null;
}

function applyLocalTimestamps(p) {
  const fields = [
    "recibido_at",
    "en_preparacion_at",
    "listo_at",
    "en_camino_at",
    "entregado_at",
  ];
  const out = { ...p };
  for (const f of fields) {
    if (!out[f]) {
      const v = getLocalTs(out.id, f);
      if (v) out[f] = v;
    }
  }
  return out;
}

function ensureListoAtLocal(p) {
  if ((p.estado || "") !== "Listo") return p;
  if (getTs(p, "listo_at")) return p;

  const iso = new Date().toISOString();
  setLocalTs(p.id, "listo_at", iso);
  return { ...p, listo_at: iso };
}

function getEstadoStart(p) {
  const now = new Date();

  const created = parseDate(p.created_at) || now;
  const recibido = getTs(p, "recibido_at") || created;

  const prep = getTs(p, "en_preparacion_at");
  const listo = getTs(p, "listo_at");
  const camino = getTs(p, "en_camino_at");
  const entregado = getTs(p, "entregado_at");

  const est = p.estado || "Recibido";

  if (est === "Recibido") return recibido || now;
  if (est === "En preparación") return prep || now;
  if (est === "Listo") return listo || now;
  if (est === "En camino") return camino || now;
  if (est === "Entregado") return entregado || now;

  return recibido || now;
}

function calcDuraciones(p) {
  const now = new Date();

  const created = parseDate(p.created_at) || now;
  const recibido = getTs(p, "recibido_at") || created;

  const prep = getTs(p, "en_preparacion_at");
  const listo = getTs(p, "listo_at");
  const camino = getTs(p, "en_camino_at");
  const entregado = getTs(p, "entregado_at");

  const est = p.estado || "Recibido";

  const tRec = recibido
    ? prep
      ? prep.getTime() - recibido.getTime()
      : est === "Recibido"
      ? now.getTime() - recibido.getTime()
      : null
    : null;

  const tPrep = prep
    ? listo
      ? listo.getTime() - prep.getTime()
      : est === "En preparación"
      ? now.getTime() - prep.getTime()
      : null
    : null;

  const finListo = camino || entregado;
  const tListo = listo
    ? finListo
      ? finListo.getTime() - listo.getTime()
      : est === "Listo"
      ? now.getTime() - listo.getTime()
      : null
    : null;

  const tCamino = camino
    ? entregado
      ? entregado.getTime() - camino.getTime()
      : est === "En camino"
      ? now.getTime() - camino.getTime()
      : null
    : null;

  const inicioTotal = recibido || created;
  const finTotal = entregado || now;
  const tTotal = inicioTotal ? finTotal.getTime() - inicioTotal.getTime() : null;

  const startEstado = getEstadoStart(p);
  const tEstadoActual = startEstado ? now.getTime() - startEstado.getTime() : null;

  return { tRec, tPrep, tListo, tCamino, tTotal, tEstadoActual };
}

// ======================================================
// 🔵 Cargar pedidos del backend (JWT)
// ======================================================
async function cargarPedidos() {
  try {
    if (primeraCarga) showLoader("Cargando pedidos...");

    const ok = await requireValidSessionOrRedirect(
      "Sesión inválida al cargar pedidos."
    );
    if (!ok) {
      hideLoader();
      return;
    }

    const usuarioLogin = getUsuario();

    const resPedidos = await apiFetch("/api/pedidos", { method: "GET" });

    if (resPedidos.status === 401) {
      hideLoader();
      clearSession();
      showAuthModal("Sesión expirada. Inicia sesión de nuevo.");
      return;
    }

    if (!resPedidos.ok) {
      hideLoader();
      showModal("Error al cargar pedidos.");
      console.error("Error al consultar /api/pedidos:", resPedidos.status);
      return;
    }

    let pedidos = await resPedidos.json();
    if (!Array.isArray(pedidos)) pedidos = [];

    pedidos = pedidos.map((p) => ({
      ...p,
      puntoventa: p.puntoventa ?? p.PuntoVenta ?? p.puntoVenta ?? "",
    }));

    pedidos = pedidos.map(applyLocalTimestamps).map(ensureListoAtLocal);

    pedidosCache = pedidos;

    detectarNuevosPedidos(pedidos);

    const recibido = pedidos.filter((p) => (p.estado || "") === "Recibido");
    const preparacion = pedidos.filter(
      (p) => (p.estado || "") === "En preparación"
    );

    const listoPanel = pedidos.filter((p) => {
      if ((p.estado || "") !== "Listo") return false;
      return !esHistorico(p);
    });

    listoPanel.forEach(showHistoricoEn5MinModal);

    renderColumna("recibido", recibido);
    renderColumna("preparacion", preparacion);
    renderColumna("listo", listoPanel);

    actualizarContadores(recibido.length, preparacion.length, listoPanel.length);
    mostrarNombreLocal(usuarioLogin);

    checkDemoras();

    hideLoader();
    primeraCarga = false;
  } catch (err) {
    hideLoader();
    showModal("No se pudo conectar al servidor.");
    console.error("Error conectando al backend:", err);
  }
}

// ======================================================
// 🟠 Detectar nuevos pedidos y notificar
// ======================================================
function detectarNuevosPedidos(pedidos) {
  const idsActuales = new Set(pedidos.map((p) => p.id));

  if (ultimoIdsPedidos.size > 0) {
    const nuevos = pedidos.filter((p) => !ultimoIdsPedidos.has(p.id));
    if (nuevos.length > 0) {
      reproducirSonidoNuevoPedido();
      const nums = nuevos.map((p) => `#${p.id}`).join(", ");
      showModal(`¡Nuevo pedido recibido! (${nums})`);
    }
  }

  ultimoIdsPedidos = idsActuales;
}

function reproducirSonidoNuevoPedido() {
  const audio = $("new-order-sound");
  if (!audio) return;

  try {
    audio.currentTime = 0;
    audio.play().catch((err) => {
      console.warn("No se pudo reproducir el sonido de nuevo pedido:", err);
    });
  } catch (e) {
    console.warn("Error reproduciendo sonido:", e);
  }
}

// ======================================================
// 🟠 Contadores
// ======================================================
function actualizarContadores(recibidoCount, prepCount, listoCount) {
  const cRec = $("count-recibido");
  const cPrep = $("count-preparacion");
  const cLis = $("count-listo");

  if (cRec) cRec.textContent = recibidoCount;
  if (cPrep) cPrep.textContent = prepCount;
  if (cLis) cLis.textContent = listoCount;
}

// ======================================================
// 🟠 Cambiar estado con loader (JWT)
// ======================================================
async function cambiarEstado(id, estado) {
  try {
    const actual = pedidosCache.find((x) => String(x.id) === String(id));
    const estActual = actual?.estado || "";

    if (estActual === "Listo" && estado !== "Listo") {
      showModal(`No puedes cambiar el Pedido #${id} porque ya está en "Listo".`);
      return;
    }

    showLoader("Actualizando estado...");

    const res = await apiFetch("/api/pedidos/estado", {
      method: "PUT",
      body: JSON.stringify({ id, estado }),
    });

    hideLoader();

    if (res.status === 401) {
      clearSession();
      showAuthModal("Sesión expirada. Inicia sesión de nuevo.");
      return;
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showModal(data.error || "Error al actualizar el estado.");
      console.error("Error al actualizar estado", res.status, data);
      return;
    }

    const mapField = {
      Recibido: "recibido_at",
      "En preparación": "en_preparacion_at",
      Listo: "listo_at",
      "En camino": "en_camino_at",
      Entregado: "entregado_at",
    };

    const field = mapField[estado];
    if (field) setLocalTs(id, field, new Date().toISOString());

    showModal(`Pedido #${id} ahora está en: ${estado}`);
    cargarPedidos();
  } catch (err) {
    hideLoader();
    showModal("Error desconocido al cambiar estado.");
    console.error("Error al actualizar estado:", err);
  }
}

// ======================================================
// 🟢 Render columnas + tarjetas
// ======================================================
function renderColumna(id, pedidos) {
  const cont = $(id);
  if (!cont) return;

  if (!pedidos || pedidos.length === 0) {
    cont.innerHTML = `
      <div class="flex flex-col items-center justify-center py-8 text-center text-xs text-slate-400 dark:text-slate-500">
        <span class="material-symbols-outlined mb-1 text-lg">receipt_long</span>
        <span>Sin pedidos en esta columna</span>
      </div>
    `;
    return;
  }

  cont.innerHTML = pedidos.map((p) => crearTarjeta(p)).join("");
}

function crearTarjeta(p) {
  const usuarioNombre = getUsuarioNombre();
  const d = calcDuraciones(p);

  const createdAt = p.created_at || "";
  const recibidoAt = p.recibido_at || "";
  const prepAt = p.en_preparacion_at || "";
  const listoAt = p.listo_at || "";
  const caminoAt = p.en_camino_at || "";
  const entregadoAt = p.entregado_at || "";

  let histHtml = "";
  if ((p.estado || "") === "Listo") {
    const listoDate = getTs(p, "listo_at");
    if (listoDate) {
      const ms = Date.now() - listoDate.getTime();
      const remain = HISTORICO_DELAY_MS - ms;
      histHtml = `
        <div class="mb-2 text-[11px] font-bold text-slate-600 dark:text-slate-300">
          Pasa a histórico en: <span class="hist-countdown">${formatCountdown(
            remain
          )}</span>
        </div>
      `;
    }
  }

  const permitirVolver =
    (p.estado || "") !== "Recibido" && (p.estado || "") !== "Listo";

  return `
    <div
      class="bg-white/95 dark:bg-slate-800 rounded-xl shadow-sm border border-black/5 dark:border-white/10 p-3"
      data-pedido="1"
      data-id="${p.id}"
      data-estado="${p.estado || ""}"
      data-created_at="${createdAt}"
      data-recibido_at="${recibidoAt}"
      data-prep_at="${prepAt}"
      data-listo_at="${listoAt}"
      data-camino_at="${caminoAt}"
      data-entregado_at="${entregadoAt}"
    >
      <div class="flex items-center justify-between mb-2">
        <div class="min-w-0">
          <h3 class="text-sm font-extrabold text-slate-900 dark:text-white truncate">
            Pedido #${p.id}
            <span class="text-[11px] font-bold text-slate-500 dark:text-slate-300">· ${usuarioNombre}</span>
          </h3>
        </div>
        <span class="text-[11px] px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200">
          ${p.estado || "—"}
        </span>
      </div>

      ${histHtml}

      <div class="grid grid-cols-2 gap-2 text-[11px] mb-2">
        <div class="rounded-xl bg-white/70 dark:bg-black/20 border border-black/5 dark:border-white/10 p-2">
          <span class="text-slate-500 dark:text-slate-300">En estado:</span>
          <span class="font-extrabold text-slate-900 dark:text-white block dur-estado">${formatDuration(
            d.tEstadoActual
          )}</span>
        </div>
        <div class="rounded-xl bg-white/70 dark:bg-black/20 border border-black/5 dark:border-white/10 p-2">
          <span class="text-slate-500 dark:text-slate-300">Total:</span>
          <span class="font-extrabold text-slate-900 dark:text-white block dur-total">${formatDuration(
            d.tTotal
          )}</span>
        </div>
        <div class="rounded-xl bg-white/70 dark:bg-black/20 border border-black/5 dark:border-white/10 p-2">
          <span class="text-slate-500 dark:text-slate-300">Recibido:</span>
          <span class="font-bold text-slate-900 dark:text-white block dur-rec">${formatDuration(
            d.tRec
          )}</span>
        </div>
        <div class="rounded-xl bg-white/70 dark:bg-black/20 border border-black/5 dark:border-white/10 p-2">
          <span class="text-slate-500 dark:text-slate-300">Preparación:</span>
          <span class="font-bold text-slate-900 dark:text-white block dur-prep">${formatDuration(
            d.tPrep
          )}</span>
        </div>
        <div class="rounded-xl bg-white/70 dark:bg-black/20 border border-black/5 dark:border-white/10 p-2">
          <span class="text-slate-500 dark:text-slate-300">Listo:</span>
          <span class="font-bold text-slate-900 dark:text-white block dur-listo">${formatDuration(
            d.tListo
          )}</span>
        </div>
        <div class="rounded-xl bg-white/70 dark:bg-black/20 border border-black/5 dark:border-white/10 p-2">
          <span class="text-slate-500 dark:text-slate-300">Camino:</span>
          <span class="font-bold text-slate-900 dark:text-white block dur-camino">${formatDuration(
            d.tCamino
          )}</span>
        </div>
      </div>

      <div class="flex gap-2 flex-wrap justify-end">
        <button
          onclick="abrirDetallePedido(${p.id})"
          class="px-3 py-1.5 text-xs font-extrabold rounded-full bg-indigo-600 text-white flex items-center gap-1"
          title="Ver detalle del pedido"
        >
          <span class="material-symbols-outlined text-[16px]">visibility</span>
          <span>Ver detalle</span>
        </button>

        <button
          onclick="imprimirPedido(${p.id})"
          class="px-3 py-1.5 text-xs font-extrabold rounded-full bg-sky-600 text-white flex items-center gap-1"
        >
          <span class="material-symbols-outlined text-[16px]">print</span>
          <span>Imprimir</span>
        </button>

        ${
          permitirVolver
            ? `
          <button onclick="cambiarEstado(${p.id}, 'Recibido')"
            class="px-3 py-1.5 text-xs font-extrabold rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-100">
            ← Volver
          </button>`
            : ""
        }

        ${
          (p.estado || "") === "Recibido"
            ? `
          <button onclick="cambiarEstado(${p.id}, 'En preparación')"
            class="px-3 py-1.5 text-xs font-extrabold rounded-full bg-primary text-white">
            Preparar →
          </button>`
            : ""
        }

        ${
          (p.estado || "") === "En preparación"
            ? `
          <button onclick="cambiarEstado(${p.id}, 'Listo')"
            class="px-3 py-1.5 text-xs font-extrabold rounded-full bg-emerald-600 text-white">
            Marcar listo ✓
          </button>`
            : ""
        }
      </div>
    </div>
  `;
}

// ======================================================
// ⏱️ Tick: actualiza duraciones + countdown histórico
// ======================================================
function tickTimers() {
  const cards = document.querySelectorAll('[data-pedido="1"]');
  if (!cards || cards.length === 0) return;

  let necesitaRefresh = false;

  cards.forEach((card) => {
    const p = {
      id: card.dataset.id,
      estado: card.dataset.estado,
      created_at: card.dataset.created_at,
      recibido_at: card.dataset.recibido_at,
      en_preparacion_at: card.dataset.prep_at,
      listo_at: card.dataset.listo_at,
      en_camino_at: card.dataset.camino_at,
      entregado_at: card.dataset.entregado_at,
    };

    const d = calcDuraciones(p);

    const set = (selector, val) => {
      const el = card.querySelector(selector);
      if (el) el.textContent = val;
    };

    set(".dur-estado", formatDuration(d.tEstadoActual));
    set(".dur-total", formatDuration(d.tTotal));
    set(".dur-rec", formatDuration(d.tRec));
    set(".dur-prep", formatDuration(d.tPrep));
    set(".dur-listo", formatDuration(d.tListo));
    set(".dur-camino", formatDuration(d.tCamino));

    if ((p.estado || "") === "Listo") {
      let listoAt = parseDate(p.listo_at);

      if (!listoAt) {
        const iso = new Date().toISOString();
        setLocalTs(p.id, "listo_at", iso);
        listoAt = new Date(iso);
        card.dataset.listo_at = iso;
      }

      const el = card.querySelector(".hist-countdown");
      if (el && listoAt) {
        const ms = Date.now() - listoAt.getTime();
        const remain = HISTORICO_DELAY_MS - ms;
        el.textContent = formatCountdown(remain);
        if (remain <= 0) necesitaRefresh = true;
      }
    }
  });

  if (necesitaRefresh && Date.now() - lastAutoRefresh > 3000) {
    lastAutoRefresh = Date.now();
    cargarPedidos();
  }

  checkDemoras();
}

// ======================================================
// ⚠️ Demoras
// ======================================================
function checkDemoras() {
  if (demoraAbierta) return;

  for (const p of pedidosCache) {
    if (!p || !p.id) continue;
    if (!p.estado) continue;

    const start = getEstadoStart(p);
    const ms = Date.now() - start.getTime();
    if (ms <= UMBRAL_DEMORA_MS) continue;

    let avisado = false;
    try {
      avisado = localStorage.getItem(keyAvisado(p.id, p.estado)) === "1";
    } catch (_) {}
    if (avisado) continue;

    let until = 0;
    try {
      until =
        parseInt(
          localStorage.getItem(keyPosponer(p.id, p.estado)) || "0",
          10
        ) || 0;
    } catch (_) {
      until = 0;
    }
    if (until && Date.now() < until) continue;

    abrirModalDemora(p, ms);
    return;
  }
}

// ======================================================
// 🧾 MODAL DETALLE (editable)
// (No modifiqué tu lógica, solo lo expongo a window abajo)
// ======================================================
let detalleAbierto = null; // { id, originalText }

function setupModalDetalle() {
  const modal = $("modalDetalle");
  if (!modal) return;

  modal.addEventListener("click", (e) => {
    if (e.target === modal) cerrarDetallePedido();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const m = $("modalDetalle");
      if (m && !m.classList.contains("hidden")) cerrarDetallePedido();
    }
  });

  const ta = $("detalleTexto");
  if (ta) {
    ta.addEventListener("input", () => {
      syncDetalleButtons();
    });
  }
}

function abrirDetallePedido(id) {
  const modal = $("modalDetalle");
  if (!modal) {
    showModal("No existe el modal de detalle (#modalDetalle).");
    return;
  }

  const pedido = pedidosCache.find((p) => String(p.id) === String(id));
  if (!pedido) {
    showModal(`No se encontró el pedido #${id} en memoria.`);
    return;
  }

  setText("detalleTitulo", `Pedido #${pedido.id}`);
  setText("detalleCliente", pedido.nombre_cliente || "—");
  setText("detalleCelular", pedido.celular_cliente || "—");
  setText("detalleDireccion", pedido.direccion_cliente || "—");
  setText("detalleEstado", pedido.estado || "—");

  const txt = (pedido.resumen_pedido ?? "").toString();
  const ta = $("detalleTexto");
  if (ta) ta.value = txt;

  detalleAbierto = { id: pedido.id, originalText: txt };

  syncDetalleButtons();
  modal.classList.remove("hidden");
}

function cerrarDetallePedido() {
  const modal = $("modalDetalle");
  if (!modal) return;
  modal.classList.add("hidden");
  detalleAbierto = null;
}

function cancelarCambiosDetalle() {
  if (!detalleAbierto) return cerrarDetallePedido();
  const ta = $("detalleTexto");
  if (ta) ta.value = detalleAbierto.originalText || "";
  syncDetalleButtons();
}

function syncDetalleButtons() {
  const btnGuardar = $("btnGuardarDetalle");
  const btnCancelar = $("btnCancelarDetalle");
  const ta = $("detalleTexto");

  if (!btnGuardar || !btnCancelar || !ta || !detalleAbierto) return;

  const actual = (ta.value ?? "").toString();
  const original = (detalleAbierto.originalText ?? "").toString();
  const changed = actual !== original;

  btnGuardar.disabled = !changed;
  btnGuardar.classList.toggle("opacity-50", !changed);
  btnGuardar.classList.toggle("cursor-not-allowed", !changed);

  btnCancelar.disabled = !changed;
  btnCancelar.classList.toggle("opacity-50", !changed);
  btnCancelar.classList.toggle("cursor-not-allowed", !changed);
}

async function guardarDetallePedido() {
  if (!detalleAbierto) return cerrarDetallePedido();

  const ta = $("detalleTexto");
  if (!ta) return;

  const nuevo = (ta.value ?? "").toString();
  const original = (detalleAbierto.originalText ?? "").toString();
  if (nuevo === original) return;

  try {
    showLoader("Guardando detalle...");

    const res = await apiFetch("/api/pedidos/resumen", {
      method: "PUT",
      body: JSON.stringify({ id: detalleAbierto.id, resumen_pedido: nuevo }),
    });

    hideLoader();

    if (res.status === 401) {
      clearSession();
      showAuthModal("Sesión expirada. Inicia sesión de nuevo.");
      return;
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showModal(data.error || "No se pudo guardar el detalle.");
      return;
    }

    const idx = pedidosCache.findIndex(
      (p) => String(p.id) === String(detalleAbierto.id)
    );
    if (idx >= 0)
      pedidosCache[idx] = { ...pedidosCache[idx], resumen_pedido: nuevo };

    detalleAbierto.originalText = nuevo;
    syncDetalleButtons();
    showModal(`Detalle guardado para Pedido #${detalleAbierto.id}`);
  } catch (e) {
    hideLoader();
    console.error(e);
    showModal("Error inesperado guardando el detalle.");
  }
}

// ======================================================
// 🖨 Imprimir pedido (JWT)
// ======================================================
async function imprimirPedido(id) {
  try {
    let config = {};
    try {
      config = JSON.parse(localStorage.getItem("configImpresora") || "{}");
    } catch (_) {
      config = {};
    }

    if (!config.nombre) {
      showModal(
        "No hay una impresora configurada. Ve a 'Configurar impresora' en el menú."
      );
      return;
    }

    const ip = config.nombre;
    const port = config.puerto || config.port || 9100;

    showLoader("Enviando pedido a la impresora...");

    const res = await apiFetch("/api/pedidos/imprimir", {
      method: "POST",
      body: JSON.stringify({ id, ip, port }),
    });

    hideLoader();

    if (res.status === 401) {
      clearSession();
      showAuthModal("Sesión expirada. Inicia sesión de nuevo.");
      return;
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("Error al imprimir pedido:", data);
      showModal(data.error || "No se pudo imprimir el pedido.");
      return;
    }

    showModal(`Pedido #${id} enviado a la impresora.`);
  } catch (err) {
    hideLoader();
    console.error("Error general imprimiendo pedido:", err);
    showModal("Error inesperado al intentar imprimir pedido.");
  }
}

// ======================================================
// 🔵 Mostrar nombre del local
// ======================================================
function mostrarNombreLocal(usuario) {
  const titulo = $("tituloLocal");
  if (!titulo) return;

  const puntoVenta =
    usuario?.PuntoVenta ||
    usuario?.puntoventa ||
    usuario?.puntoVenta ||
    usuario?.store_id;

  if (!puntoVenta) {
    titulo.textContent = "Panel de Pedidos";
    return;
  }
  titulo.textContent = `Panel de Pedidos – ${puntoVenta}`;
}

// ======================================================
// 🔴 Cerrar sesión (cerrar turno también)
// ======================================================
async function cerrarSesion() {
  try {
    showLoader("Cerrando sesión...");

    // Cerrar turno si existe (si tu backend lo soporta)
    try {
      const rActive = await apiFetch("/api/shifts/active", { method: "GET" });
      if (rActive.ok) {
        const data = await rActive.json().catch(() => ({}));
        const { shift } = normalizeShiftResponse(data);
        if (shift) {
          await apiFetch("/api/shifts/end", { method: "POST" });
        }
      }
    } catch (e) {
      console.warn("No se pudo cerrar turno al cerrar sesión:", e);
    }

    clearSession();

    hideLoader();
    showModal("Sesión cerrada correctamente.");

    setTimeout(() => {
      window.location.href = "/login.html";
    }, 800);
  } catch (err) {
    hideLoader();
    showModal("No se pudo cerrar la sesión.");
    console.error("Error cerrando sesión:", err);
  }
}

// ======================================================
// ✅ Loops (evitar duplicar intervalos)
// ======================================================
let pedidosInterval = null;
let timersInterval = null;
let turnoInterval = null;

function stopLoopsPedidos() {
  if (pedidosInterval) clearInterval(pedidosInterval);
  if (timersInterval) clearInterval(timersInterval);
  pedidosInterval = null;
  timersInterval = null;
}

function startLoopsPedidos() {
  stopLoopsPedidos();
  cargarPedidos();
  pedidosInterval = setInterval(cargarPedidos, 10000);
  timersInterval = setInterval(tickTimers, 1000);
  setupModalDetalle();
}

// ======================================================
// ✅ INIT
// ======================================================
document.addEventListener("DOMContentLoaded", async () => {
  actualizarTextoImpresoraActual();

  const ok = await requireValidSessionOrRedirect(
    "Sesión inválida. Inicia sesión para continuar."
  );
  if (!ok) return;

  renderUserChip();

  // ✅ Turnos: si NO hay turno activo => mostrar modal de ingreso
  const shift = await checkTurnoActivo();
  if (!shift) {
    openTurnoModal();
  } else {
    startLoopsPedidos();
  }

  // watcher turnos
  if (turnoInterval) clearInterval(turnoInterval);
  turnoInterval = setInterval(turnoWatcher, 60000);
});

// ======================================================
// ✅ Exponer funciones a window (por onclick del HTML)
// ======================================================
window.showLoader = showLoader;
window.hideLoader = hideLoader;

window.showModal = showModal;
window.cerrarModal = cerrarModal;

window.showAuthModal = showAuthModal;
window.cerrarModalAuth = cerrarModalAuth;
window.redirigirLogin = redirigirLogin;

window.toggleSidebar = toggleSidebar;
window.irHome = irHome;
window.irImpresoras = irImpresoras;
window.irHistorico = irHistorico;

window.abrirPerfil = abrirPerfil;
window.cerrarPerfil = cerrarPerfil;
window.guardarPerfil = guardarPerfil;

window.cerrarSesion = cerrarSesion;

window.cerrarModalDemora = cerrarModalDemora;
window.posponerDemora = posponerDemora;
window.marcarDemoraComoAvisada = marcarDemoraComoAvisada;

window.cambiarEstado = cambiarEstado;

window.abrirDetallePedido = abrirDetallePedido;
window.cerrarDetallePedido = cerrarDetallePedido;
window.cancelarCambiosDetalle = cancelarCambiosDetalle;
window.guardarDetallePedido = guardarDetallePedido;

window.imprimirPedido = imprimirPedido;

window.openTurnoModal = openTurnoModal;
window.cerrarModalTurno = cerrarModalTurno;
window.iniciarTurno = iniciarTurno;
