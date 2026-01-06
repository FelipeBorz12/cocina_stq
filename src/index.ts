// src/index.ts
import { Router } from "express";

const router = Router();

// health-check
router.get("/health", (req, res) => {
  res.json({ ok: true });
});

export default router;
