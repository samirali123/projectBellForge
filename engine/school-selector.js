// school-selector.js
//
// Shared "which school, and prove you're allowed in" prompt, used by both
// bells.js and inspect.js so the password gate can't drift between them.

const { listSchools } = require("./school-loader");
const { verifyPassword } = require("./school-auth");
const { promptMasked } = require("./masked-prompt");

const MAX_PASSWORD_ATTEMPTS = 3;

async function promptSchool(rl) {
  const schools = listSchools();
  if (schools.length === 0) {
    throw new Error(
      "No schools found in ../schools. Add a school folder (see schools/odea for the shape) first."
    );
  }

  console.log("\nChoose School\n");
  schools.forEach((s, i) => {
    const num = String(i + 1).padStart(2, " ");
    console.log(`${num}) ${s.name}`);
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

// Fail closed: a school with no password configured can't be opened at
// all, rather than silently allowing anyone in. Run set-school-password.js
// to set one.
async function promptSchoolPassword(rl, school) {
  if (!school.passwordHash || !school.passwordSalt) {
    throw new Error(
      `${school.name} has no password set. Run "node set-school-password.js" first.`
    );
  }

  for (let attempt = 1; attempt <= MAX_PASSWORD_ATTEMPTS; attempt++) {
    const password = await promptMasked(rl, `\nPassword for ${school.name}: `);
    if (verifyPassword(password, school.passwordSalt, school.passwordHash)) {
      return;
    }
    const remaining = MAX_PASSWORD_ATTEMPTS - attempt;
    console.log(
      remaining > 0
        ? `Incorrect password. ${remaining} attempt(s) left.`
        : "Incorrect password."
    );
  }

  throw new Error(`Too many incorrect attempts for ${school.name}.`);
}

// Combines both prompts and returns the verified school's metadata.
async function selectSchool(rl) {
  const schoolMeta = await promptSchool(rl);
  await promptSchoolPassword(rl, schoolMeta);
  return schoolMeta;
}

module.exports = { promptSchool, promptSchoolPassword, selectSchool };
