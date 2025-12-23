import { Request, Response, NextFunction } from "express";
import jwt, { Secret } from "jsonwebtoken";

export type JwtUser = {
  sub: string;
  store_id: string;
  role: "ADMIN" | "COCINA" | string;
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

export function auth(requiredRoles?: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : "";

      if (!token) {
        return res.status(401).json({ error: "No token" });
      }

      const secret = mustEnv("JWT_ACCESS_SECRET") as Secret;
      const payload = jwt.verify(token, secret) as JwtUser;

      if (!payload.store_id) {
        return res.status(401).json({ error: "Token inválido (sin store_id)" });
      }

      if (requiredRoles?.length && !requiredRoles.includes(payload.role)) {
        return res.status(403).json({ error: "No autorizado" });
      }

      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ error: "Token inválido o expirado" });
    }
  };
}
