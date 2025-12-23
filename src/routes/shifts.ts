// src/routes/shifts.ts
import { Router } from "express";
import { supabase } from "../supabase";
import { auth } from "../middlewares/auth";

const router = Router();

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
  return res.json({ shift: data?.[0] || null });
});

router.post("/start", auth(), async (req, res) => {
  const storeId = req.user!.store_id;
  const userId = Number(req.user!.sub);

  // evitar doble turno
  const { data: active } = await supabase
    .from("shifts")
    .select("id")
    .eq("store_id", storeId)
    .is("closed_at", null)
    .limit(1);

  if (active?.length) return res.status(400).json({ error: "Ya hay un turno activo" });

  const { data, error } = await supabase
    .from("shifts")
    .insert([{ store_id: storeId, opened_by: userId }])
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true, shift: data });
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
