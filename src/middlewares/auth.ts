// src/middlewares/auth.ts
import { Request, Response, NextFunction } from "express";
import jwt, { Secret } from "jsonwebtoken";

export type JwtUser = {
  sub: string;
  store_id?: string;
  role?: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: JwtUser;
    }
  }
}

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} en .env`);
  return v;
}

/**
 * auth(): middleware JWT Bearer
 * auth(["ADMIN"]): valida roles permitidos
 */
export function auth(allowedRoles?: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const h = String(req.headers.authorization || "");
      const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";

      if (!token) {
        return res.status(401).json({ error: "Falta token" });
      }

      const secret = mustEnv("JWT_ACCESS_SECRET") as unknown as Secret;
      const payload = jwt.verify(token, secret) as any;

      req.user = {
        sub: String(payload.sub || ""),
        store_id: payload.store_id ? String(payload.store_id) : undefined,
        role: payload.role ? String(payload.role) : undefined,
      };

      if (allowedRoles && allowedRoles.length > 0) {
        const role = req.user.role || "";
        if (!allowedRoles.includes(role)) {
          return res.status(403).json({ error: "No autorizado" });
        }
      }

      return next();
    } catch (e) {
      return res.status(401).json({ error: "Token inválido o expirado" });
    }
  };
}

// ✅ default export para compatibilidad con imports antiguos
export default auth;
