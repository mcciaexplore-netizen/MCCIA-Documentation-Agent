import crypto from "node:crypto";
import { query } from "./db.js";

const SESSION_COOKIE = "mccia_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SCRYPT_KEY_LENGTH = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  return `${salt}:${derived.toString("hex")}`;
}

function verifyPassword(password, stored) {
  const [salt, hashHex] = String(stored || "").split(":");
  if (!salt || !hashHex) return false;
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  const stored_ = Buffer.from(hashHex, "hex");
  if (stored_.length !== derived.length) return false;
  return crypto.timingSafeEqual(stored_, derived);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function createUser({ email, name, password }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const trimmedName = String(name || "").trim();
  if (!isValidEmail(normalizedEmail)) {
    const error = new Error("Enter a valid email address.");
    error.status = 400;
    throw error;
  }
  if (!trimmedName) {
    const error = new Error("Enter your name.");
    error.status = 400;
    throw error;
  }
  if (String(password || "").length < 8) {
    const error = new Error("Choose a password with at least 8 characters.");
    error.status = 400;
    throw error;
  }

  const passwordHash = hashPassword(password);
  try {
    const result = await query(
      "INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name, created_at",
      [normalizedEmail, trimmedName, passwordHash],
    );
    return result.rows[0];
  } catch (error) {
    if (error?.code === "23505") {
      const duplicateError = new Error("An account with this email already exists.");
      duplicateError.status = 409;
      throw duplicateError;
    }
    throw error;
  }
}

async function authenticateUser({ email, password }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const result = await query(
    "SELECT id, email, name, password_hash, created_at FROM users WHERE email = $1",
    [normalizedEmail],
  );
  const user = result.rows[0];
  const invalidError = new Error("Incorrect email or password.");
  invalidError.status = 401;
  if (!user || !verifyPassword(password, user.password_hash)) throw invalidError;
  return user;
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await query("INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)", [token, userId, expiresAt]);
  return { token, expiresAt };
}

async function deleteSession(token) {
  if (!token) return;
  await query("DELETE FROM sessions WHERE token = $1", [token]);
}

async function getUserForToken(token) {
  if (!token) return null;
  const result = await query(
    `SELECT users.id, users.email, users.name, users.created_at
     FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE sessions.token = $1 AND sessions.expires_at > now()`,
    [token],
  );
  return result.rows[0] || null;
}

function parseCookies(request) {
  const header = request.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function sessionCookieHeader(token, expiresAt) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${secure}`;
}

function clearedSessionCookieHeader() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(0).toUTCString()}${secure}`;
}

async function getRequestUser(request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  return getUserForToken(token);
}

function requireUser(user) {
  if (!user) {
    const error = new Error("Sign in to use this feature.");
    error.status = 401;
    throw error;
  }
  return user;
}

export {
  authenticateUser,
  clearedSessionCookieHeader,
  createSession,
  createUser,
  deleteSession,
  getRequestUser,
  hashPassword,
  parseCookies,
  requireUser,
  SESSION_COOKIE,
  sessionCookieHeader,
  verifyPassword,
};
