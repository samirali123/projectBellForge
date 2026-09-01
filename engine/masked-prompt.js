// masked-prompt.js
//
// Password input for readline that doesn't echo what's typed. Node has no
// first-class masked-input API; this uses the well-known workaround of
// temporarily overriding the readline Interface's internal
// `_writeToOutput` (undocumented, but stable across Node versions and the
// standard community pattern for this — readline funnels every
// keystroke's re-render through it when running against a real TTY, which
// is what makes suppressing it here actually hide the input). Against a
// non-TTY stream (e.g. piped input in tests) readline doesn't echo
// per-keystroke at all, so this is a no-op there — nothing to mask.

async function promptMasked(rl, promptText) {
  const originalWriteToOutput = rl._writeToOutput.bind(rl);
  let masking = false;

  rl._writeToOutput = (str) => {
    if (masking && str !== "\r\n" && str !== "\n") return; // swallow echoed keystrokes
    originalWriteToOutput(str);
  };

  try {
    masking = true;
    return await rl.question(promptText);
  } finally {
    rl._writeToOutput = originalWriteToOutput;
  }
}

module.exports = { promptMasked };
