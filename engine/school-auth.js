// school-auth.js
//
// Per-school password hashing/verification. A school's password is never
// stored as plaintext — school.json holds a passwordSalt + passwordHash
// pair (scrypt, Node's built-in crypto — no extra dependency needed).
//
// This is a LOCAL gate, not a real auth system: there's no server, so
// anyone with sufficient access to the app's own files could eventually
// get past it. It exists to stop one school's staff from casually picking
// a different school out of the list and touching its schedule, not to
// withstand a determined attacker. Keep that threat model in mind before
// treating this as stronger than it is.

const crypto = require("crypto");

const KEY_LENGTH = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, KEY_LENGTH).toString("hex");
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { hashPassword, verifyPassword };
