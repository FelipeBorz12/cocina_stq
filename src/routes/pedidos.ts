// src/routes/pedidos.ts
import { Router } from "express";
import { supabase } from "../supabase";
import { imprimirTextoEnIp } from "../printer";
import { auth } from "../middlewares/auth";

const router = Router();

// ==========================
// Config
// ==========================
const HISTORICO_DELAY_MS = 5 * 60 * 1000;

// ==========================
// Helpers
// ==========================
function nowIso() {
  return new Date().toISOString();
}

function mapEstadoToTimestampField(estado: string) {
  // tabla: recibido_at, en_preparacion_at, listo_at, en_camino_at, entregado_at
  switch (estado) {
    case "Recibido":
      return "recibido_at";
    case "En preparación":
      return "en_preparacion_at";
    case "Listo":
      return "listo_at";
    case "En camino":
      return "en_camino_at";
    case "Entregado":
      return "entregado_at";
    default:
      return null;
  }
}

// Máquina de estados (evita saltos raros)
const allowedTransitions: Record<string, string[]> = {
  Recibido: ["En preparación"],
  "En preparación": ["Listo"],
  Listo: ["En camino", "Entregado"],
  "En camino": ["Entregado"],
  Entregado: [],
};

function canMove(from: string, to: string) {
  return (allowedTransitions[from] || []).includes(to);
}

async function getPedidoBasico(id: number | string) {
  // NOTA: evitamos maybeSingle() por compatibilidad
  const { data, error } = await supabase
    .from("pedidos")
    .select("id, estado, puntoventa, resumen_pedido, listo_at")
    .eq("id", id)
    .limit(1);

  if (error) throw new Error(error.message);
  return data?.[0] || null;
}

function assertPedidoDeTienda(pedido: any, storeId: string) {
  if (!pedido) return { ok: false, status: 404, msg: "Pedido no encontrado" };
  if (String(pedido.puntoventa) !== String(storeId)) {
    return { ok: false, status: 403, msg: "No autorizado para este pedido" };
  }
  return { ok: true as const };
}

// ==========================
// Routes
// ==========================

/*
 |------------------------------
 |  GET /api/pedidos
 |  ✅ HOME: pedidos de la tienda del token
 |     excluye Listo >= 5 min (se van al histórico)
 |------------------------------
*/
router.get("/", auth(), async (req, res) => {
  try {
    const storeId = req.user!.store_id;

    const { data, error } = await supabase
      .from("pedidos")
      .select("*")
      .eq("puntoventa", storeId)
      .order("id", { ascending: true });

    if (error) {
      console.error("Error cargando pedidos:", error);
      return res.status(500).json({ error: error.message });
    }

    const cutoff = Date.now() - HISTORICO_DELAY_MS;

    const dashboard = (data || []).filter((p: any) => {
      if (p.estado !== "Listo") return true;
      if (!p.listo_at) return true;
      return new Date(p.listo_at).getTime() >= cutoff;
    });

    return res.json(dashboard);
  } catch (err: any) {
    console.error("Error general cargando pedidos:", err);
    return res.status(500).json({ error: err?.message || "Error general cargando pedidos" });
  }
});

/*
 |------------------------------
 |  GET /api/pedidos/historico
 |  ✅ HISTÓRICO: SOLO Listo >= 5 min (de la tienda del token)
 |------------------------------
*/
router.get("/historico", auth(), async (req, res) => {
  try {
    const storeId = req.user!.store_id;

    const { data, error } = await supabase
      .from("pedidos")
      .select("*")
      .eq("puntoventa", storeId)
      .eq("estado", "Listo")
      .order("listo_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("Error cargando historico:", error);
      return res.status(500).json({ error: error.message });
    }

    const cutoff = Date.now() - HISTORICO_DELAY_MS;

    const historico = (data || []).filter((p: any) => {
      if (!p.listo_at) return false;
      return new Date(p.listo_at).getTime() < cutoff;
    });

    return res.json(historico);
  } catch (err: any) {
    console.error("Error general histórico:", err);
    return res.status(500).json({ error: err?.message || "Error general histórico" });
  }
});

/*
 |------------------------------
 |  PUT /api/pedidos/estado
 |  Body: { id, estado }
 |  ✅ valida tienda del token
 |  ✅ valida transición
 |  ✅ guarda timestamp
 |------------------------------
*/
router.put("/estado", auth(), async (req, res) => {
  try {
    const { id, estado } = req.body as { id?: number | string; estado?: string };

    if (!id || !estado) {
      return res.status(400).json({ error: "Faltan datos: id y estado" });
    }

    const storeId = req.user!.store_id;

    const pedido = await getPedidoBasico(id);
    const check = assertPedidoDeTienda(pedido, storeId);
    if (!check.ok) return res.status(check.status).json({ error: check.msg });

    const estadoActual = String((pedido as any).estado || "");
    if (!canMove(estadoActual, estado)) {
      return res.status(400).json({ error: `Transición inválida: ${estadoActual} -> ${estado}` });
    }

    const patch: any = { estado };
    const field = mapEstadoToTimestampField(estado);
    if (field) patch[field] = nowIso();

    const { error: errUpd } = await supabase.from("pedidos").update(patch).eq("id", id);
    if (errUpd) {
      console.error("Error actualizando estado:", errUpd);
      return res.status(500).json({ error: errUpd.message });
    }

    return res.json({ message: "Estado actualizado", patch });
  } catch (err: any) {
    console.error("Error general actualizando estado:", err);
    return res.status(500).json({ error: err?.message || "Error general actualizando estado" });
  }
});

/*
 |------------------------------
 |  PUT /api/pedidos/resumen
 |  Body: { id, resumen_pedido }
 |  ✅ solo permite editar pedidos de su tienda
 |------------------------------
*/
router.put("/resumen", auth(), async (req, res) => {
  try {
    const { id, resumen_pedido } = req.body as { id?: number | string; resumen_pedido?: string };
    if (!id) return res.status(400).json({ error: "Falta id" });

    const storeId = req.user!.store_id;

    const pedido = await getPedidoBasico(id);
    const check = assertPedidoDeTienda(pedido, storeId);
    if (!check.ok) return res.status(check.status).json({ error: check.msg });

    const txt = String(resumen_pedido ?? "");

    const { data, error } = await supabase
      .from("pedidos")
      .update({ resumen_pedido: txt })
      .eq("id", id)
      .select("*")
      .single(); // aquí sí vale porque update+select debe devolver uno

    if (error) {
      console.error("Error guardando resumen:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.json({ ok: true, pedido: data });
  } catch (err: any) {
    console.error("Error general guardando resumen:", err);
    return res.status(500).json({ error: err?.message || "Error general guardando resumen" });
  }
});

/*
 |------------------------------
 |  POST /api/pedidos/imprimir
 |  Body: { id, ip, port? }
 |  ✅ valida tienda del token
 |  ⚠️ Aceptar ip del cliente NO es seguro (SSRF)
 |------------------------------
*/
router.post("/imprimir", auth(), async (req, res) => {
  try {
    const { id, ip, port } = req.body as { id?: number; ip?: string; port?: number };

    if (!id || !ip) {
      return res.status(400).json({ error: "Faltan datos: id e ip de la impresora" });
    }

    const storeId = req.user!.store_id;

    const pedido = await getPedidoBasico(id);
    const check = assertPedidoDeTienda(pedido, storeId);
    if (!check.ok) return res.status(check.status).json({ error: check.msg });

    const texto = String((pedido as any).resumen_pedido ?? "");
    await imprimirTextoEnIp(ip, texto, port || 9100);

    return res.json({ message: "Ticket enviado a la impresora" });
  } catch (err: any) {
    console.error("Error imprimiendo pedido:", err);
    return res.status(500).json({ error: err?.message || "No se pudo imprimir" });
  }
});

export default router;
