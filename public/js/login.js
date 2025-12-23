// ./js/login.js

// ==========================
// Elementos DOM
// ==========================
const form = document.getElementById("loginForm");
const msg = document.getElementById("msg");
const card = document.getElementById("authCard");
const btnLogin = document.getElementById("btnLogin");

// ==========================
// Helpers de modales
// ==========================
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("show");
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("show");
}

// Hacer closeModal accesible desde HTML
window.closeModal = closeModal;

// ==========================
// Mensajes debajo del formulario
// ==========================
function setMsg(text, type) {
  if (!msg) return;

  msg.textContent = text || "";
  msg.classList.remove("msg-error", "msg-success");

  if (type === "error") msg.classList.add("msg-error");
  if (type === "success") msg.classList.add("msg-success");
}

// ==========================
// Animación shake (errores)
// ==========================
function shakeCard() {
  if (!card) return;
  card.classList.remove("shake");
  void card.offsetWidth; // reflow
  card.classList.add("shake");
}

// ==========================
// LOGIN
// ==========================
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const correo = document.getElementById("correo")?.value.trim();
    const password = document.getElementById("password")?.value;

    if (!correo || !password) {
      setMsg("Por favor completa ambos campos.", "error");
      shakeCard();
      return;
    }

    try {
      setMsg("");
      openModal("modalLoading");
      if (btnLogin) btnLogin.disabled = true;

      // 🔐 LOGIN JWT
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correo, password }),
      });

      const data = await res.json().catch(() => ({}));
      closeModal("modalLoading");

      // ❌ ERROR LOGIN
      if (!res.ok) {
        const errorText =
          data?.error || "Error en el login. Verifica tus credenciales.";

        setMsg(errorText, "error");

        const modalErrorText = document.getElementById("modalErrorText");
        if (modalErrorText) modalErrorText.textContent = errorText;

        openModal("modalErrorLogin");
        shakeCard();
        if (btnLogin) btnLogin.disabled = false;
        return;
      }

      // ✅ LOGIN OK — guardar sesión
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      localStorage.setItem("usuario", JSON.stringify(data.usuario));

      setMsg("Ingreso exitoso", "success");
      openModal("modalLogin");

      // Redirigir a HOME
      setTimeout(() => {
        window.location.href = "/home.html";
      }, 800);
    } catch (err) {
      console.error("Error login:", err);
      closeModal("modalLoading");

      const text =
        "Ocurrió un error de conexión. Intenta nuevamente en unos segundos.";
      setMsg(text, "error");

      const modalErrorText = document.getElementById("modalErrorText");
      if (modalErrorText) modalErrorText.textContent = text;

      openModal("modalErrorLogin");
      shakeCard();
      if (btnLogin) btnLogin.disabled = false;
    }
  });
}
