#!/usr/bin/env node
// set-school-password.js
//
// Sets or changes one school's password. Run this yourself when adding a
// new school or rotating an existing one — it writes only a salted hash
// into that school's school.json, never the plaintext password.
//
// Usage: node set-school-password.js

const fs = require("fs");
const path = require("path");
const { createInterface } = require("./readline-compat");
const { stdin, stdout } = require("process");
const { listSchools } = require("./school-loader");
const { hashPassword } = require("./school-auth");
const { promptMasked } = require("./masked-prompt");

async function promptSchool(rl) {
  const schools = listSchools();
  if (schools.length === 0) {
    throw new Error(
      "No schools found in ../schools. Add a school folder (see schools/odea for the shape) first."
    );
  }

  console.log("\nSet password for which school?\n");
  schools.forEach((s, i) => {
    const num = String(i + 1).padStart(2, " ");
    const status = s.passwordHash ? "(password set)" : "(no password set)";
    console.log(`${num}) ${s.name} ${status}`);
  });

  while (true) {
    const answer = (await rl.question("\nSelection: ")).trim();
    const idx = Number(answer) - 1;
    if (Number.isInteger(idx) && idx >= 0 && idx < schools.length) {
      return schools[idx];
    }
    console.log(`Please enter a number between 1 and ${schools.length}.`);
  }
}

async function run() {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    const school = await promptSchool(rl);

    let password;
    while (true) {
      password = await promptMasked(rl, "\nNew password: ");
      if (password.length < 4) {
        console.log("Password must be at least 4 characters.");
        continue;
      }
      const confirm = await promptMasked(rl, "Confirm password: ");
      if (confirm !== password) {
        console.log("Passwords didn't match — try again.");
        continue;
      }
      break;
    }

    const { salt, hash } = hashPassword(password);

    const schoolJsonPath = path.join(school.dir, "school.json");
    const meta = JSON.parse(fs.readFileSync(schoolJsonPath, "utf8"));
    meta.passwordSalt = salt;
    meta.passwordHash = hash;
    fs.writeFileSync(schoolJsonPath, JSON.stringify(meta, null, 2) + "\n");

    console.log(`\nPassword set for ${school.name}.`);
  } finally {
    rl.close();
  }
}

run().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exitCode = 1;
});
