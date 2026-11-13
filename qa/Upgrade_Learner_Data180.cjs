'use strict';
// 177 (audit-176 packages F5): learner data across a Windows upgrade, driven through a QA-only copy of the installed exe.
//   node Upgrade_Learner_Data180.cjs seed  --runner <Runner folder> --install <app folder> --state <state.json>
//   node Upgrade_Learner_Data180.cjs check --runner <Runner folder> --install <app folder> --state <state.json>
// seed (on the previous release): imports the runner's synthetic fixture book, creates a profile, answers five
//   questions of one untimed exam (single best answer, multiple answers, true/false, matching, ordering), finishes it
//   (5 / 5 correct) and records the finished session row plus the row count of every learner table.
// check (after the upgrade): the same session row is byte-identical, every learner table still holds at least the
//   seeded rows, and the result page still shows 5 / 5 correct.
// The QA copy (NeuroQuiz-QA.exe: the release exe with only the --inspect fuse byte back on, exactly like the runner's
// qaExe) is created beside NeuroQuiz.exe and ALWAYS deleted before this script exits: the installer refuses to upgrade
// a folder that holds unknown files. The release NeuroQuiz.exe itself is never modified.
// Needs the runner's own dependencies (npm ci in the Runner folder: playwright) and its NQ_Synthetic_Native115.zip.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');

const H = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const FIXTURE_SHA = '762c4beb0dcd214de1f9cdb06f648d38fa1d0232109a8761e594725e21ca5d9b';
const PROFILE = 'NQ180 upgrade learner';
const opt = name => { const i = process.argv.indexOf(name); assert(i > 0 && process.argv[i + 1], 'missing ' + name); return path.resolve(process.argv[i + 1]); };

function qaExe(exe) {
  const q = path.join(path.dirname(exe), 'NeuroQuiz-QA.exe'); const b = Buffer.from(fs.readFileSync(exe));
  const S = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'); const at = b.indexOf(S);
  assert(at >= 0 && b.indexOf(S, at + 1) < 0, 'Electron fuse wire not found exactly once');
  assert.equal(b[at + S.length], 1, 'Unsupported Electron fuse wire');
  const i = at + S.length + 2 + 3; assert([0x30, 0x31].includes(b[i])); b[i] = 0x31; fs.writeFileSync(q, b); return q;
}

// Reads every object store of the app database without creating it (same rule as the runner's read()).
function dump(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const q = indexedDB.open('neuroquiz');
    q.onupgradeneeded = () => { q.transaction.abort(); reject(Error('Expected existing database; creation forbidden')); };
    q.onerror = () => reject(Error('Readonly open failed'));
    q.onsuccess = () => {
      const d = q.result, names = [...d.objectStoreNames], out = { version: d.version, counts: {}, sessions: [] };
      const tx = d.transaction(names, 'readonly');
      for (const n of names) {
        const c = tx.objectStore(n).count(); c.onsuccess = () => { out.counts[n] = c.result; };
        if (n === 'sessions') { const g = tx.objectStore(n).getAll(undefined, 2001); g.onsuccess = () => { out.sessions = g.result; }; }
      }
      tx.oncomplete = () => { d.close(); resolve(out); };
      tx.onabort = tx.onerror = () => { d.close(); reject(Error('Readonly transaction failed')); };
    };
  }));
}

async function main() {
  const mode = process.argv[2]; assert(['seed', 'check'].includes(mode), 'mode must be seed or check');
  const runner = opt('--runner'), install = opt('--install'), statePath = opt('--state');
  const { _electron } = require(require.resolve('playwright', { paths: [runner] }));
  const cases = require(path.join(runner, 'Windows_Cases161.cjs'));
  const { TITLE, STEMS, route, text, button } = cases;
  const exe = path.join(install, 'NeuroQuiz.exe'); assert(fs.existsSync(exe), 'NeuroQuiz.exe not installed');
  // 177 (builder): the stock Electron exe can be byte-identical across releases (branding needs resedit), so the upgrade
  // is proven by the app files' own version (resources/app/package.json), not by the exe hash.
  const appPkg = path.join(install, 'resources', 'app', 'package.json');
  const exeSha = fs.existsSync(appPkg) ? 'app:' + JSON.parse(fs.readFileSync(appPkg, 'utf8')).version + ':' + H(appPkg) : H(exe);
  const qa = qaExe(exe);
  const drop = () => { try { fs.unlinkSync(qa); } catch {} };
  process.once('exit', drop);
  let app;
  try {
    app = await _electron.launch({ executablePath: qa, timeout: 30000 });
    const page = await app.firstWindow({ timeout: 30000 }); page.setDefaultTimeout(20000);
    await page.locator('main h1').waitFor({ state: 'visible' });
    const version = await app.evaluate(({ app }) => app.getVersion());
    const c = { page };
    const check = async (name, wanted) => page.locator('main label').filter({ hasText: name }).first().locator('input[type=checkbox]').setChecked(wanted);
    const choose = async key => {
      const rows = page.locator('[data-media-role=question] .option[role=radio],[data-media-role=question] .option[role=checkbox]');
      const keys = await rows.locator('.key').allTextContents(); const i = keys.findIndex(t => t.trim() === key);
      assert(i >= 0, 'Exact fixture key missing: ' + key); await rows.nth(i).click();
    };
    if (mode === 'seed') {
      assert(!fs.existsSync(statePath), 'state file already exists');
      // Fixture book (same steps as the runner's ensureFixture).
      await page.goto('app://neuroquiz/index.html#/import');
      await page.locator('main h1', { hasText: 'Import books' }).waitFor({ state: 'visible' });
      const f = path.join(runner, 'NQ_Synthetic_Native115.zip'); assert.equal(H(f), FIXTURE_SHA);
      await page.locator('main input[type=file]:not([webkitdirectory])').first().setInputFiles(f);
      await page.getByRole('button', { name: 'Import 1 book', exact: true }).click();
      await text(c, 'Import complete');
      // Named profile.
      await page.goto('app://neuroquiz/index.html#/settings');
      await page.getByLabel('New profile name', { exact: true }).fill(PROFILE);
      await page.getByRole('button', { name: 'Create profile', exact: true }).click();
      await page.waitForFunction(n => [...document.querySelectorAll('main p')].some(e => e.textContent.includes('Current:') && e.textContent.includes(n)), PROFILE);
      // One untimed exam of five questions, answered correctly (same answers as the runner's response()).
      await route(c, '/quiz'); await text(c, 'Create a test'); await check(TITLE, true); await button(c, 'Untimed exam');
      const count = page.locator('main').getByLabel('Number of questions', { exact: true }); await count.fill('5');
      for (const s of ['Random order', 'Recall mode', 'Rate my confidence', 'Shuffle answer options']) await check(s, false);
      await page.getByRole('button', { name: 'Start', exact: true }).click();
      await text(c, STEMS[0]);
      const hash = new URL(page.url()).hash; assert(hash.startsWith('#/quiz/'));
      for (let n = 1; n <= 5; n++) {
        await text(c, STEMS[n - 1]);
        if (n === 1) await choose('A');
        if (n === 2) { await choose('A'); await choose('B'); }
        if (n === 3) {
          await page.getByRole('radiogroup', { name: 'Statement A', exact: true }).getByRole('radio', { name: 'True', exact: true }).click();
          await page.getByRole('radiogroup', { name: 'Statement B', exact: true }).getByRole('radio', { name: 'False', exact: true }).click();
        }
        if (n === 4) {
          await page.getByLabel('Answer for item 1', { exact: true }).selectOption('A');
          await page.getByLabel('Answer for item 2', { exact: true }).selectOption('B');
        }
        if (n === 5) {
          for (const [pos, token] of ['Alpha', 'Bravo', 'Charlie'].entries()) {
            const rows = await page.locator('.ordering .order-item .opt-body').allTextContents();
            let i = rows.findIndex(s => s.trim() === token); assert(i >= pos);
            while (i > pos) { await page.getByRole('button', { name: `Move item ${i + 1} up`, exact: true }).click(); i--; }
          }
          const confirm = page.getByRole('button', { name: 'This order is my answer', exact: true });
          if (await confirm.count()) await confirm.click();
        }
        if (n < 5) await button(c, 'Next →');
      }
      await button(c, 'Finish test'); await text(c, '5 / 5 correct');
      const resultHash = new URL(page.url()).hash;
      const db = await dump(page);
      const id = hash.split('/')[2]; const session = db.sessions.find(s => s.id === id);
      assert(session && session.finishedAt, 'finished session must be stored');
      const state = { format: 'neuroquiz-upgrade-learner-data180-v1', seededWith: { appVersion: version, releaseExeSha256: exeSha },
        profile: PROFILE, sessionId: id, resultHash, session, dbVersion: db.version, counts: db.counts, answered: 5, correct: 5 };
      fs.writeFileSync(statePath, JSON.stringify(state, null, 1) + '\n', { flag: 'wx' });
      console.log(JSON.stringify({ seeded: { appVersion: version, sessionId: id, counts: db.counts } }));
    } else {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      assert.notEqual(state.seededWith.releaseExeSha256, exeSha, 'the installed app did not change: no upgrade happened');
      const db = await dump(page);
      const session = db.sessions.find(s => s.id === state.sessionId);
      // The seeded row was saved as JSON (properties holding undefined are dropped); compare in the same form.
      assert.deepEqual(session && JSON.parse(JSON.stringify(session)), state.session, 'the finished test changed across the upgrade');
      const lost = Object.entries(state.counts).filter(([n, k]) => (db.counts[n] ?? 0) < k);
      assert.deepEqual(lost, [], 'learner tables lost rows: ' + JSON.stringify(lost));
      assert(db.version >= state.dbVersion, 'database version went backwards');
      await page.goto('app://neuroquiz/index.html' + state.resultHash); await text(c, '5 / 5 correct');
      console.log(JSON.stringify({ kept: { from: state.seededWith.appVersion, to: version, sessionId: state.sessionId, counts: db.counts } }));
    }
  } finally {
    if (app) await app.close().catch(() => {});
    drop();
  }
  assert(!fs.existsSync(qa), 'QA copy left behind');
}

main().then(() => process.exit(0), e => { console.error(String(e && e.stack || e)); process.exit(1); });
