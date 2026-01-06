// src/routes/printers.ts
import { Router } from "express";
import net from "net";

const router = Router();

/**
 * POST /api/impresoras/test
 * body: { ip, port, text, cutter?, timeout?, copies? }
 */
router.post("/test", async (req, res) => {
  try {
    const ip = String(req.body?.ip || "").trim();
    const port = Number(req.body?.port || 9100);
    const text = String(req.body?.text || "");
    const cutter = req.body?.cutter !== undefined ? !!req.body.cutter : true;
    const timeout = Math.max(1000, Number(req.body?.timeout || 8000));
    const copies = Math.max(1, Number(req.body?.copies || 1));

    if (!ip) return res.status(400).json({ error: "Falta ip/host" });
    if (!port || !Number.isFinite(port))
      return res.status(400).json({ error: "Puerto inválido" });
    if (!text) return res.status(400).json({ error: "Falta text" });

    const cutCmd = Buffer.from([0x1d, 0x56, 0x41, 0x00]); // GS V A 0

    const payloads: Buffer[] = [];
    for (let i = 0; i < copies; i++) {
      payloads.push(Buffer.from(text + "\n", "utf8"));
      if (cutter) payloads.push(cutCmd);
    }

    await new Promise<void>((resolve, reject) => {
      const socket = new net.Socket();
      let done = false;

      const finishOk = () => {
        if (done) return;
        done = true;
        try {
          socket.destroy();
        } catch {}
        resolve();
      };

      const finishErr = (err: any) => {
        if (done) return;
        done = true;
        try {
          socket.destroy();
        } catch {}
        reject(err);
      };

      socket.setTimeout(timeout);
      socket.on("timeout", () =>
        finishErr(new Error("Timeout conectando/imprimiendo"))
      );
      socket.on("error", (err) => finishErr(err));

      socket.connect(port, ip, () => {
        try {
          for (const b of payloads) socket.write(b);
          socket.end();
        } catch (e) {
          finishErr(e);
        }
      });

      socket.on("close", () => finishOk());
    });

    return res.json({ ok: true });
  } catch (err: any) {
    console.error("Error /api/impresoras/test:", err);
    return res
      .status(500)
      .json({ error: err?.message || "Error imprimiendo prueba" });
  }
});

export default router;                                                                  