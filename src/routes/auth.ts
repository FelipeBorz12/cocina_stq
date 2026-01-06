// src/routes/auth.ts
import { Router } from "express";
import { supabase } from "../supabase";
import bcrypt from "bcrypt";
import jwt, { Secret, SignOptions } from "jsonwebtoken";
import { sha256 } from "../utils/crypto";
import { auth } from "../middlewares/auth";

const router = Router();

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} en .env`);
  return v;
}

function signAccessToken(payload: object) {
  const secret = mustEnv("JWT_ACCESS_SECRET") as unknown as Secret;

  const options: SignOptions = {
    expiresIn: (process.env.JWT_ACCESS_TTL || "20m") as any,
  };

  return jwt.sign(payload, secret, options);
}

function signRefreshToken(payload: object) {
  const secret = mustEnv("JWT_REFRESH_SECRET") as unknown as Secret;

  const options: SignOptions = {
    expiresIn: (process.env.JWT_REFRESH_TTL || "12h") as any,
  };

  return jwt.sign(payload, secret, options);
}

// ================= REGISTER =================
router.post("/register", async (req, res) => {
  const { administrador, correo, password, puntoVenta, celular } = req.body;

  if (
    typeof administrador === "undefined" ||
    !correo ||
    !password ||
    !puntoVenta
  ) {
    return res.status(400).json({ error: "Faltan datos" });
  }

  const { data: rows, error: existsErr } = await supabase
    .from("usercocina")
    .select("id")
    .eq("correo", correo)
    .limit(1);

  if (existsErr) return res.status(500).json({ error: existsErr.message });
  if (rows && rows.length > 0)
    return res.status(400).json({ error: "Correo ya registrado" });

  const hashed = await bcrypt.hash(password, 10);

  const { error } = await supabase.from("usercocina").insert([
    {
      administrador,
      correo,
      contraseña: hashed,
      PuntoVenta: puntoVenta,
      celular: celular || null,
    },
  ]);

  if (error) return res.status(500).json({ error: error.message });

  return res.json({ ok: true });
});

// ================= LOGIN =================
router.post("/login", async (req, res) => {
  const { correo, password } = req.body;

  if (!correo || !password) {
    return res.status(400).json({ error: "Credenciales requeridas" });
  }

  const { data: rows, error } = await supabase
    .from("usercocina")
    .select("*")
    .eq("correo", correo)
    .limit(1);

  if (error) return res.status(500).json({ error: error.message });

  const usuario = rows?.[0];
  if (!usuario) return res.status(401).json({ error: "Credenciales inválidas" });

  const ok = await bcrypt.compare(password, (usuario as any)["contraseña"]);
  if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });

  const role = (usuario as any).administrador ? "ADMIN" : "COCINA";
  const store_id = String((usuario as any).PuntoVenta);

  const access_token = signAccessToken({
    sub: String((usuario as any).id),
    store_id,
    role,
  });

  const refresh_token = signRefreshToken({
    sub: String((usuario as any).id),
  });

  const { error: rtErr } = await supabase.from("refresh_tokens").insert([
    {
      user_id: (usuario as any).id,
      token_hash: sha256(refresh_token),
      expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    },
  ]);

  if (rtErr) return res.status(500).json({ error: rtErr.message });

  // ✅ Importante: devolver datos para el modal (correo/nombre/celular/PuntoVenta)
  return res.json({
    access_token,
    refresh_token,
    usuario: {
      id: (usuario as any).id,
      role,
      store_id,
      administrador: (usuario as any).administrador,
      correo: (usuario as any).correo,
      PuntoVenta: (usuario as any).PuntoVenta,
      celular: (usuario as any).celular ?? null,
    },
  });
});

// ================= REFRESH =================
router.post("/refresh", async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token)
      return res.status(400).json({ error: "Falta refresh_token" });

    const refreshSecret = mustEnv("JWT_REFRESH_SECRET") as unknown as Secret;
    const payload = jwt.verify(refresh_token, refreshSecret) as any;

    const token_hash = sha256(refresh_token);

    const { data: rows, error } = await supabase
      .from("refresh_tokens")
      .select("*")
      .eq("token_hash", token_hash)
      .limit(1);

    if (error) return res.status(500).json({ error: error.message });

    const rt = rows?.[0];
    if (!rt || (rt as any).revoked_at)
      return res.status(401).json({ error: "Refresh inválido" });

    const { data: users, error: uerr } = await supabase
      .from("usercocina")
      .select('id, administrador, correo, celular, "PuntoVenta"')
      .eq("id", payload.sub)
      .limit(1);

    if (uerr) return res.status(500).json({ error: uerr.message });

    const u = users?.[0];
    if (!u) return res.status(401).json({ error: "Usuario inválido" });

    const role = (u as any).administrador ? "ADMIN" : "COCINA";
    const store_id = String((u as any).PuntoVenta);

    const access_token = signAccessToken({
      sub: String((u as any).id),
      store_id,
      role,
    });

    return res.json({ access_token });
  } catch {
    return res.status(401).json({ error: "No se pudo refrescar" });
  }
});

// ================= ME =================
router.get("/me", auth(), async (req, res) => {
  try {
    const userId = Number(req.user!.sub);

    const { data, error } = await supabase
      .from("usercocina")
      .select('id, administrador, correo, celular, "PuntoVenta"')
      .eq("id", userId)
      .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Usuario no encontrado" });

    return res.json({
      id: data.id,
      administrador: (data as any).administrador,
      correo: (data as any).correo,
      celular: (data as any).celular ?? null,
      PuntoVenta: (data as any).PuntoVenta,
      store_id: String((data as any).PuntoVenta),
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Error en /auth/me" });
  }
});

export default router;
