import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword, parseCookies, sessionCookieHeader, verifyPassword } from "../lib/auth.js";

test("hashPassword produces a salted hash that verifyPassword accepts", () => {
  const stored = hashPassword("correct horse battery staple");
  assert.ok(stored.includes(":"));
  assert.equal(verifyPassword("correct horse battery staple", stored), true);
});

test("verifyPassword rejects an incorrect password", () => {
  const stored = hashPassword("correct horse battery staple");
  assert.equal(verifyPassword("wrong password", stored), false);
});

test("hashPassword salts each hash differently", () => {
  const first = hashPassword("same-password");
  const second = hashPassword("same-password");
  assert.notEqual(first, second);
});

test("parseCookies reads a cookie header into key/value pairs", () => {
  const request = { headers: { cookie: "mccia_session=abc123; other=value%20here" } };
  assert.deepEqual(parseCookies(request), { mccia_session: "abc123", other: "value here" });
});

test("parseCookies returns an empty object when no cookie header is present", () => {
  assert.deepEqual(parseCookies({ headers: {} }), {});
});

test("sessionCookieHeader sets HttpOnly, SameSite, and an expiry", () => {
  const header = sessionCookieHeader("tok", new Date("2030-01-01T00:00:00Z"));
  assert.match(header, /^mccia_session=tok; Path=\/; HttpOnly; SameSite=Lax; Expires=/);
  assert.match(header, /Expires=Tue, 01 Jan 2030/);
});
