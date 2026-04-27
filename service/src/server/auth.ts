// Google OAuth via Passport. Restricted to ALLOWED_EMAILS.

import express from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { config, googleCallbackUrl } from "./config.js";

export interface SessionUser {
  email: string;
  name: string;
  picture?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    // Augment Passport's User type with our shape.
    interface User extends SessionUser {}
  }
}

passport.use(
  new GoogleStrategy(
    {
      clientID: config.googleClientId,
      clientSecret: config.googleClientSecret,
      callbackURL: googleCallbackUrl(),
    },
    (_accessToken, _refreshToken, profile, done) => {
      const email = profile.emails?.[0]?.value?.toLowerCase();
      if (!email) return done(null, false);
      if (!config.allowedEmails.includes(email)) return done(null, false);
      const user: SessionUser = {
        email,
        name: profile.displayName,
        picture: profile.photos?.[0]?.value,
      };
      return done(null, user);
    },
  ),
);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj: SessionUser, done) => done(null, obj));

export function ensureAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  res.status(401).json({ error: "unauthenticated" });
}

export function authRoutes(prefix: string): express.Router {
  const r = express.Router();

  r.get(
    "/auth/google",
    passport.authenticate("google", { scope: ["profile", "email"] }),
  );

  r.get(
    "/auth/google/callback",
    passport.authenticate("google", {
      failureRedirect: `${prefix}/login?error=denied`,
    }),
    (_req, res) => res.redirect(`${prefix}/`),
  );

  r.post("/auth/logout", (req, res, next) => {
    req.logout(err => {
      if (err) return next(err);
      req.session.destroy(() => res.json({ ok: true }));
    });
  });

  r.get("/api/auth/me", (req, res) => {
    if (req.isAuthenticated && req.isAuthenticated()) {
      res.json({ user: req.user });
    } else {
      res.status(401).json({ user: null });
    }
  });

  return r;
}
