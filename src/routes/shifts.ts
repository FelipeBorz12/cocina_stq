// src/routes/shifts.ts
import { Router } from "express";
import { supabase } from "../supabase";
import { auth } from "../middlewares/auth";

const router = Router();

const SHIFT_HOURS = 10;
const WARN_MINUTES = 10;
const EXTEND_MINUTES = 30;

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

router.get("/active", auth(), async (req, res) => {
  const storeId = req.user!.store_id;

  const { data, error } = await supabase
    .from("shifts")
    .select("*")
    .eq("store_id", storeId)
    .is("closed_at", null)
    .order("opened_at", { ascending: false })
    .limit(1);

  if (error) return res.status(500).json({ error: error.message });

  const shift = data?.[0] || null;
  if (!shift) return res.json({ shift: null });

  const now = new Date();

  // expires_at puede no existir en turnos viejos: fallback = opened_at + 10h
  const openedAt = shift.opened_at ? new Date(shift.opened_at) : null;
  const fallbackExpires = openedAt ? addHours(openedAt, SHIFT_HOURS) : null;

  const expiresAt = shift.expires_at ? new Date(shift.expires_at) : fallbackExpires;

  // Si por algún motivo no hay opened_at/expires_at, devuelvo lo que haya sin lógica extra
  if (!expiresAt) return res.json({ shift });

  // Auto-cierre si ya venció
  if (now >= expiresAt) {
    const { error: closeErr } = await supabase
      .from("shifts")
      .update({ closed_at: now.toISOString() })
      .eq("id", shift.id);

    if (closeErr) return res.status(500).json({ error: closeErr.message });
    return res.json({ shift: null, auto_closed: true });
  }

  // Aviso previo (10 min antes)
  const msLeft = expiresAt.getTime() - now.getTime();
  const minutesLeft = Math.ceil(msLeft / 60000);
  const shouldWarn = minutesLeft <= WARN_MINUTES;

  // Guardar warning_sent_at una sola vez (opcional, evita "spam" de aviso)
  if (shouldWarn && !shift.warning_sent_at) {
    await supabase
      .from("shifts")
      .update({ warning_sent_at: now.toISOString() })
      .eq("id", shift.id);
  }

  return res.json({
    shift: { ...shift, expires_at: expiresAt.toISOString() },
    meta: {
      minutes_left: minutesLeft,
      should_warn: shouldWarn,
      warn_minutes: WARN_MINUTES,
      close_at: expiresAt.toISOString(),
    },
  });
});

router.post("/start", auth(), async (req, res) => {
  const storeId = req.user!.store_id;
  const userId = Number(req.user!.sub);

  const { admin_name, sede_name } = req.body as {
    admin_name?: string;
    sede_name?: string;
  };

  if (!admin_name || !sede_name) {
    return res.status(400).json({ error: "Faltan admin_name o sede_name" });
  }

  // evitar doble turno
  const { data: active, error: activeErr } = await supabase
    .from("shifts")
    .select("id")
    .eq("store_id", storeId)
    .is("closed_at", null)
    .limit(1);

  if (activeErr) return res.status(500).json({ error: activeErr.message });
  if (active?.length) return res.status(400).json({ error: "Ya hay un turno activo" });

  const now = new Date();
  const expiresAt = addHours(now, SHIFT_HOURS);

  const { data, error } = await supabase
    .from("shifts")
    .insert([
      {
        store_id: storeId,
        opened_by: userId,
        opened_at: now.toISOString(),
        admin_name,
        sede_name,
        expires_at: expiresAt.toISOString(),
        extended_minutes: 0,
        warning_sent_at: null,
      },
    ])
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true, shift: data });
});

router.post("/extend", auth(), async (req, res) => {
  const storeId = req.user!.store_id;

  const { data: rows, error: qErr } = await supabase
    .from("shifts")
    .select("*")
    .eq("store_id", storeId)
    .is("closed_at", null)
    .order("opened_at", { ascending: false })
    .limit(1);

  if (qErr) return res.status(500).json({ error: qErr.message });

  const shift = rows?.[0];
  if (!shift) return res.status(400).json({ error: "No hay turno activo" });

  const now = new Date();
  const openedAt = shift.opened_at ? new Date(shift.opened_at) : null;
  const baseExpires = openedAt ? addHours(openedAt, SHIFT_HOURS) : null;
  const currentExpires = shift.expires_at ? new Date(shift.expires_at) : baseExpires;

  if (!currentExpires) return res.status(500).json({ error: "No se pudo calcular expires_at" });
  if (now >= currentExpires) return res.status(400).json({ error: "El turno ya venció" });

  const newExpires = addMinutes(currentExpires, EXTEND_MINUTES);
  const newExtended = (shift.extended_minutes || 0) + EXTEND_MINUTES;

  const { data: updated, error } = await supabase
    .from("shifts")
    .update({
      expires_at: newExpires.toISOString(),
      extended_minutes: newExtended,
      warning_sent_at: null, // permite volver a avisar cerca del nuevo cierre
    })
    .eq("id", shift.id)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true, shift: updated });
});

router.post("/end", auth(), async (req, res) => {
  const storeId = req.user!.store_id;

  const { data: rows, error: qErr } = await supabase
    .from("shifts")
    .select("id")
    .eq("store_id", storeId)
    .is("closed_at", null)
    .order("opened_at", { ascending: false })
    .limit(1);

  if (qErr) return res.status(500).json({ error: qErr.message });
  const shift = rows?.[0];
  if (!shift) return res.status(400).json({ error: "No hay turno activo" });

  const { data, error } = await supabase
    .from("shifts")
    .update({ closed_at: new Date().toISOString() })
    .eq("id", shift.id)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true, shift: data });
});

export default router;
