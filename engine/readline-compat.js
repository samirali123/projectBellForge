// readline-compat.js
//
// `readline/promises`'s Interface no longer exposes `_writeToOutput` (it's
// a thin wrapper around the classic Interface in current Node) — confirmed
// by testing, not assumed — which broke the standard masked-password-input
// trick in masked-prompt.js. The classic `readline` module's Interface
// still exposes it. This wraps a classic Interface so `.question()`
// returns a Promise like the newer API's does, so every other call site in
// the app (`await rl.question(...)`) doesn't need to change — only the
// interface construction does.

const readline = require("readline");

function createInterface(options) {
  const rl = readline.createInterface(options);
  const rawQuestion = rl.question.bind(rl);
  rl.question = (query) => new Promise((resolve) => rawQuestion(query, resolve));
  return rl;
}

module.exports = { createInterface };
