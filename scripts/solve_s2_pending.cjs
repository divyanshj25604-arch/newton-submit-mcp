#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://my.newtonschool.co';
const WAIT_MS = 1200;
const MAX_POLLS = 14;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readCodexSessionCookie() {
  const configPath = path.join(process.env.HOME || '', '.codex', 'config.toml');
  const text = fs.readFileSync(configPath, 'utf8');
  const match = text.match(/NEWTON_SESSION_COOKIE\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error('NEWTON_SESSION_COOKIE not found in ~/.codex/config.toml');
  }
  return match[1].trim();
}

function authHeaders() {
  const cookie = readCodexSessionCookie();
  const tokenMatch = cookie.match(/(?:^|;\s*)auth-token=([^;]+)/);
  const headers = {
    'Content-Type': 'application/json',
    Cookie: cookie,
  };
  if (tokenMatch && tokenMatch[1]) {
    headers.Authorization = `Bearer ${tokenMatch[1]}`;
  }
  return headers;
}

const SOLUTIONS = {
  w3f4g6vsrsud: {
    playgroundHash: 'vd9ad32zsrt5',
    lastSavedAt: 1774540737000,
    code: `const OldPerson = (name, time) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log(name);
      resolve(name);
    }, Number(time));
  });
};

const YoungPerson = (name, time) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log(name);
      resolve(name);
    }, Number(time));
  });
};

async function execution(oldPersonName, oldPersonTime, person1Name, person1Time, person2Name, person2Time) {
  await OldPerson(oldPersonName, oldPersonTime);
  await Promise.all([
    YoungPerson(person1Name, person1Time),
    YoungPerson(person2Name, person2Time),
  ]);
}`,
  },
  gsywzgfhndb4: {
    playgroundHash: 'gl6xyyzkd7rg',
    lastSavedAt: 1774540550000,
    code: `function calculateTicketPrice(age, isWeekend, hasStudentCard) {
  let price = 12;
  const visitorAge = Number(age);

  if (visitorAge < 12) {
    price -= 5;
  }
  if (isWeekend) {
    price += 3;
  }
  if (hasStudentCard) {
    price -= 2;
  }

  return price;
}`,
  },
  vbbeqviapkh7: {
    playgroundHash: 'rghrhre32c5t',
    lastSavedAt: 1774540539000,
    code: `// marks : you will receive marks in this variable
// grade : assign your calculated grade to this variable
let grade;

if (marks > 90 && marks <= 100) {
  grade = 'A';
} else if (marks >= 80 && marks <= 90) {
  grade = 'B';
} else if (marks >= 70 && marks < 80) {
  grade = 'C';
} else if (marks >= 60 && marks < 70) {
  grade = 'D';
} else {
  grade = 'F';
}`,
  },
  '6etgstzwbg4s': {
    playgroundHash: 'qqd0h6e8906g',
    lastSavedAt: 1774540525000,
    code: `// you dont need to take input
// add code here
for (let i = 1; i <= n; i++) {
  const spaces = ' '.repeat(n - i);
  const stars = '*'.repeat(2 * i - 1);
  console.log(spaces + stars);
}

for (let i = n - 1; i >= 1; i--) {
  const spaces = ' '.repeat(n - i);
  const stars = '*'.repeat(2 * i - 1);
  console.log(spaces + stars);
}`,
  },
  eamlnz4a3mrs: {
    playgroundHash: 'bqespdijxwkm',
    lastSavedAt: 1774540511000,
    code: `return function sanitizeInput(input) {
  const blocked = {
    '@': true,
    '#': true,
    '$': true,
    '%': true,
    '&': true,
    '*': true,
    '!': true,
    '<': true,
    '>': true,
    '?': true,
  };

  let result = '';
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    result += blocked[ch] ? '_' : ch;
  }
  return result;
}`,
  },
  mwna5vr7gjmx: {
    playgroundHash: 'mmg9j3ovvdgj',
    lastSavedAt: 1774540495000,
    code: `function findUnion(arr1, arr2) {
  const merged = new Set();

  for (const value of arr1) {
    merged.add(value);
  }
  for (const value of arr2) {
    merged.add(value);
  }

  const sorted = Array.from(merged).sort((a, b) => a - b);
  arr1.length = 0;
  for (const value of sorted) {
    arr1.push(value);
  }
}`,
  },
  '2wisrub1zqts': {
    playgroundHash: 'rlbilvfkknrq',
    lastSavedAt: 1774540484000,
    code: `function validateAndModifyPassword(password) {
  const allowedSpecials = "!@#$%^&*";

  if (typeof password !== 'string' || password.length < 8) {
    console.log('Invalid password');
    return;
  }

  let hasUpper = false;
  let hasLower = false;
  let hasDigit = false;
  let hasSpecial = false;

  for (const ch of password) {
    const code = ch.charCodeAt(0);
    const isUpper = code >= 65 && code <= 90;
    const isLower = code >= 97 && code <= 122;
    const isDigit = code >= 48 && code <= 57;
    const isSpecial = allowedSpecials.indexOf(ch) !== -1;

    if (!isUpper && !isLower && !isDigit && !isSpecial) {
      console.log('Invalid password');
      return;
    }

    if (isUpper) hasUpper = true;
    else if (isLower) hasLower = true;
    else if (isDigit) hasDigit = true;
    else if (isSpecial) hasSpecial = true;
  }

  if (!hasUpper || !hasLower || !hasDigit || !hasSpecial) {
    console.log('Invalid password');
    return;
  }

  let modified = '';
  for (const ch of password) {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) {
      modified += ch.toLowerCase();
    } else if (code >= 97 && code <= 122) {
      modified += ch.toUpperCase();
    } else {
      modified += ch;
    }
  }

  console.log(modified);
}`,
  },
  b7wmve8qzt10: {
    playgroundHash: 'upnywu1duudk',
    lastSavedAt: 1774540419000,
    code: `function categorizeByKey(api, key) {
  return fetch(api)
    .then((response) => response.json())
    .then((items) => {
      const grouped = {};

      for (const item of items) {
        if (Object.prototype.hasOwnProperty.call(item, key)) {
          const groupValue = item[key];
          if (!Object.prototype.hasOwnProperty.call(grouped, groupValue)) {
            grouped[groupValue] = [];
          }
          grouped[groupValue].push(item);
        }
      }

      return grouped;
    });
}`,
  },
  xynqzu1tfryv: {
    playgroundHash: 'nvz1051t69nq',
    lastSavedAt: 1774540385000,
    code: `return function createThrottle(fn, delay) {
  let lastCallTime = 0;

  return function (...args) {
    const now = Date.now();
    if (now - lastCallTime >= delay) {
      lastCallTime = now;
      return fn.apply(this, args);
    }
  };
};`,
  },
};

function normalizeStatus(raw) {
  const statusId = Number(raw?.status_id ?? raw?.current_status ?? -1);
  const statusText = String(raw?.status ?? raw?.build_status ?? raw?.result ?? '').toUpperCase();

  if (statusId === 3 || statusText.includes('ACCEPT')) return 'Accepted';
  if (statusId === 4 || statusText.includes('WRONG')) return 'Wrong Answer';
  if (statusId === 5 || statusText.includes('TIME_LIMIT') || statusText.includes('TLE')) return 'TLE';
  if (statusId === 13 || statusText.includes('COMPIL')) return 'Compilation Error';
  if ([6, 7, 8, 10, 11, 12].includes(statusId) || statusText.includes('RUNTIME')) return 'Runtime Error';
  if (statusText.includes('PENDING') || statusText.includes('RUNNING') || statusText.includes('PROCESSING')) return 'Pending';
  return statusText || 'Pending';
}

async function submitOne(questionHash, def, headers) {
  const patchUrl = `${BASE_URL}/api/v1/playground/coding/h/${encodeURIComponent(def.playgroundHash)}/?run_hidden_test_cases=true`;
  const latestUrl = `${BASE_URL}/api/v1/playground/coding/h/${encodeURIComponent(def.playgroundHash)}/latest_submission/`;

  const payload = {
    hash: def.playgroundHash,
    language_id: 1999,
    source_code: def.code,
    run_hidden_test: true,
    showSubmissionTab: true,
    is_force_save: true,
    last_saved_at: String(def.lastSavedAt),
  };

  const patchRes = await fetch(patchUrl, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload),
  });

  if (!patchRes.ok) {
    const body = await patchRes.text();
    throw new Error(`PATCH failed (${patchRes.status}) for ${questionHash}: ${body.slice(0, 250)}`);
  }

  let latest = null;
  for (let i = 0; i < MAX_POLLS; i++) {
    const latestRes = await fetch(latestUrl, { headers });
    if (!latestRes.ok) {
      const body = await latestRes.text();
      throw new Error(`latest_submission failed (${latestRes.status}) for ${questionHash}: ${body.slice(0, 250)}`);
    }

    latest = await latestRes.json();
    const status = normalizeStatus(latest);
    if (status !== 'Pending') {
      return {
        status,
        raw: latest,
      };
    }

    await sleep(WAIT_MS);
  }

  return {
    status: normalizeStatus(latest || {}),
    raw: latest,
  };
}

async function main() {
  const headers = authHeaders();
  const entries = Object.entries(SOLUTIONS);
  const results = [];

  for (const [questionHash, def] of entries) {
    process.stdout.write(`Submitting ${questionHash}... `);
    try {
      const result = await submitOne(questionHash, def, headers);
      results.push({ questionHash, playgroundHash: def.playgroundHash, ...result });
      process.stdout.write(`${result.status}\n`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      results.push({ questionHash, playgroundHash: def.playgroundHash, status: 'Error', error: msg });
      process.stdout.write(`Error\n`);
      console.error(msg);
    }
  }

  const accepted = results.filter((r) => r.status === 'Accepted').length;
  const nonAccepted = results.filter((r) => r.status !== 'Accepted');

  console.log('\nSummary');
  console.log(`Accepted: ${accepted}/${results.length}`);
  for (const r of nonAccepted) {
    console.log(`- ${r.questionHash} (${r.playgroundHash}): ${r.status}${r.error ? ` | ${r.error}` : ''}`);
  }

  fs.writeFileSync('/private/tmp/s2_coding_submit_results.json', JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
