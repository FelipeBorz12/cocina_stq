// src/server.ts
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";

import authRoutes from "./routes/auth";
import pedidosRoutes from "./routes/pedidos";
import shiftsRoutes from "./routes/shifts";
import apiRoutes from "./index";

const app = express();

// ================================
// Middlewares base
// ================================
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// Logger simple (solo 4xx/5xx)
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    if (res.statusCode >= 400) {
      console.warn(
        `[${res.statusCode}] ${req.method} ${req.originalUrl} (${ms}ms)`
      );
    }
  });
  next();
});

// JSON parser
app.use(express.json({ limit: "2mb" }));

// JSON inválido -> mensaje claro
app.use((err: any, req: any, res: any, next: any) => {
  if (err instanceof SyntaxError && err?.type === "entity.parse.failed") {
    return res
      .status(400)
      .json({ error: "JSON inválido (revisa el body del request)" });
  }
  return next(err);
});

// ================================
// Fix: favicon
// ================================
app.get("/favicon.ico", (req, res) => res.status(204).end());

// ================================
// Static (public)
// ================================
app.use(express.static(path.join(__dirname, "../public")));

// Root: login
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/login.html"));
});

// Rutas “bonitas” opcionales
app.get("/home", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/home.html"));
});
app.get("/impresoras", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/impresoras.html"));
});
app.get("/historico", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/historico.html"));
});

// ================================
// API Routes (IMPORTANTE: montar antes del 404 de /api)
// ================================
app.use("/api/auth", authRoutes);
app.use("/api/pedidos", pedidosRoutes);
app.use("/api/shifts", shiftsRoutes);
app.use("/api", apiRoutes);

// ================================
// 404 solo para /api (para que el front vea JSON)
// ================================
app.use("/api", (req, res) => {
  return res.status(404).json({ error: "Endpoint no encontrado" });
});

// ================================
// Error handler final
// ================================
app.use((err: any, req: any, res: any, next: any) => {
  console.error("🔥 Error no manejado:", err);
  return res.status(500).json({ error: err?.message || "Error interno" });
});

// ================================
// Start
// ================================
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
