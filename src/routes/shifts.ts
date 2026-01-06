// src/routes/shifts.ts
import { Router } from "express";
import { supabase } from "../supabase";
import { auth } from "../middlewares/auth";

const router = Router();

// Duraciones
const SHIFT_MINUTES_DEFAULT = 8 * 60; // 8 horas
const EXTEND_MINUTES = 30;
const WARN_BEFORE_MINUTES = 10;

function addMinutes(d: Date, minutes: number) {
  return new Date(d.getTime() + minutes * 60 * 1000);
}

function minutesLeft(expiresAtIso?: string | null) {
  if (!expiresAtIso) return null;
  const expiresMs = new Date(expiresAtIso).getTime();
  if (Number.isNaN(expiresMs)) return null;
  const left = expiresMs - Date.now();
  return Math.floor(left / (60 * 1000));
}

function supabaseErr(error: any, fallback: string) {
  return {
    error: error?.message || fallback,
    code: error?.code || null,
    hint: error?.hint || null,
    details: error?.details || null,
  };
}

/**
 * Cierra automáticamente un turno si:
 * - está activo (closed_at IS NULL)
 * - y ya venció (expires_at <= now)
 *
 * Devuelve:
 * - shift: el turno activo vigente, o null si no hay.
 */
async function getActiveShiftOrCloseIfExpired(store_id: string) {
  const { data, error } = await supabase
    .from("shifts")
    .select("*")
    .eq("store_id", store_id)
    .is("closed_at", null)
    .order("opened_at", { ascending: false })
    .limit(1);

  if (error) throw error;

  const shift = data?.[0] || null;
  if (!shift) return null;

  const expiresAt = (shift as any).expires_at as string | null;
  if (expiresAt) {
    const expMs = new Date(expiresAt).getTime();
    if (!Number.isNaN(expMs) && Date.now() >= expMs) {
      // Turno vencido: cerrarlo
      await supabase
        .from("shifts")
        .update({ closed_at: new Date().toISOString() })
        .eq("id", (shift as any).id);

      return null;
    }
  }

  return shift;
}

/**
 * GET /api/shifts/active
 * -> { shift: {...} | null, meta: { minutes_left, should_warn } | null }
 */
router.get("/active", auth(), async (req, res) => {
  try {
    const store_id = String(req.user?.store_id || "").trim();
    if (!store_id) return res.status(400).json({ error: "store_id inválido" });

    const shift = await getActiveShiftOrCloseIfExpired(store_id);

    if (!shift) return res.json({ shift: null, meta: null });

    const ml = minutesLeft((shift as any).expires_at);

    const should_warn =
      ml !== null &&
      ml <= WARN_BEFORE_MINUTES &&
      ml > 0; // si está vencido, ya lo cerramos arriba

    return res.json({
      shift,
      meta: {
        minutes_left: ml ?? null,
        should_warn,
      },
    });
  } catch (e: any) {
    console.error("Error /api/shifts/active:", e);
    return res.status(500).json(supabaseErr(e, "Error consultando shift activo"));
  }
});

/**
 * POST /api/shifts/start
 * body: { admin_name, sede_name }
 */
router.post("/start", auth(), async (req, res) => {
  try {
    const store_id = String(req.user?.store_id || "").trim();
    const opened_by =
      req.user?.sub !== undefined && req.user?.sub !== null
        ? Number(req.user.sub)
        : null;

    const admin_name = String(req.body?.admin_name || "").trim();
    const sede_name = String(req.body?.sede_name || "").trim();

    if (!store_id) return res.status(400).json({ error: "store_id inválido" });
    if (!admin_name) return res.status(400).json({ error: "Falta admin_name" });
    if (!sede_name) return res.status(400).json({ error: "Falta sede_name" });

    // Si hay turno activo vigente, devolverlo (no duplicar)
    const active = await getActiveShiftOrCloseIfExpired(store_id);
    if (active) {
      const ml = minutesLeft((active as any).expires_at);
      const should_warn =
        ml !== null && ml <= WARN_BEFORE_MINUTES && ml > 0;

      return res.json({
        ok: true,
        shift: active,
        meta: { minutes_left: ml ?? null, should_warn },
      });
    }

    const now = new Date();
    const shiftMinutes = Number(process.env.SHIFT_MINUTES || SHIFT_MINUTES_DEFAULT);
    const expires = addMinutes(now, shiftMinutes);

    const payload: any = {
      store_id,
      opened_by: Number.isFinite(opened_by as any) ? opened_by : null,
      opened_at: now.toISOString(),        // tu tabla tiene default now(), pero lo enviamos igual
      closed_at: null,
      admin_name,
      sede_name,
      expires_at: expires.toISOString(),
      warning_sent_at: null,
      extended_minutes: 0,
      notes: null,
    };

    const { data: created, error } = await supabase
      .from("shifts")
      .insert([payload])
      .select("*")
      .single();

    if (error) return res.status(500).json(supabaseErr(error, "No se pudo iniciar turno"));

    return res.json({ ok: true, shift: created });
  } catch (e: any) {
    console.error("Error /api/shifts/start:", e);
    return res.status(500).json(supabaseErr(e, "Error iniciando turno"));
  }
});

/**
 * POST /api/shifts/extend
 * -> extiende 30 min el turno activo del store_id
 */
router.post("/extend", auth(), async (req, res) => {
  try {
    const store_id = String(req.user?.store_id || "").trim();
    if (!store_id) return res.status(400).json({ error: "store_id inválido" });

    const active = await getActiveShiftOrCloseIfExpired(store_id);
    if (!active) return res.status(404).json({ error: "No hay turno activo para extender" });

    const expiresAt = (active as any).expires_at as string | null;
    const base = expiresAt ? new Date(expiresAt) : new Date();
    const newExpires = addMinutes(base, EXTEND_MINUTES);

    const prevExt = Number((active as any).extended_minutes || 0) || 0;
    const nextExt = prevExt + EXTEND_MINUTES;

    const { data: upd, error } = await supabase
      .from("shifts")
      .update({
        expires_at: newExpires.toISOString(),
        extended_minutes: nextExt,
        warning_sent_at: null, // opcional: al extender, “reiniciamos” el aviso
      })
      .eq("id", (active as any).id)
      .select("*")
      .single();

    if (error) return res.status(500).json(supabaseErr(error, "No se pudo extender turno"));

    return res.json({ ok: true, shift: upd });
  } catch (e: any) {
    console.error("Error /api/shifts/extend:", e);
    return res.status(500).json(supabaseErr(e, "Error extendiendo turno"));
  }
});

/**
 * POST /api/shifts/end
 * -> cierra turno activo del store_id
 */
router.post("/end", auth(), async (req, res) => {
  try {
    const store_id = String(req.user?.store_id || "").trim();
    if (!store_id) return res.status(400).json({ error: "store_id inválido" });

    const active = await getActiveShiftOrCloseIfExpired(store_id);
    if (!active) return res.status(404).json({ error: "No hay turno activo" });

    const { data: upd, error } = await supabase
      .from("shifts")
      .update({ closed_at: new Date().toISOString() })
      .eq("id", (active as any).id)
      .select("*")
      .single();

    if (error) return res.status(500).json(supabaseErr(error, "No se pudo cerrar turno"));

    return res.json({ ok: true, shift: upd });
  } catch (e: any) {
    console.error("Error /api/shifts/end:", e);
    return res.status(500).json(supabaseErr(e, "Error cerrando turno"));
  }
});

export default router;
