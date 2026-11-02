'use strict';
// Generic QA wrapper only. It runs the separately SHA-bound current installer;
// no source checkout, app rebuild, credentials or full acceptance is supplied here.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), cp = require('node:child_process'), assert = require('node:assert/strict');
const MARKER = 'NQ161_EVIDENCE_JSON:';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const emit = value => process.stdout.write(MARKER + JSON.stringify(value) + '\n');
const safeRelative = value => typeof value === 'string' && value.length > 0 && !value.includes('\\') && !value.includes(':') && !value.startsWith('/') && value.split('/').every(part => part && part !== '.' && part !== '..' && !/[\x00-\x1f]/.test(part));
function evidenceEmitter({write = emit, maxBytes = 24 * 1024 * 1024, maxFileBytes = 4 * 1024 * 1024} = {}) {
  let total = 0;
  const latest = new Map(), skipped = new Map();
  function file(relative, filename) {
    assert(safeRelative(relative), 'Unsafe evidence path');
    const stat = fs.lstatSync(filename);
    assert(stat.isFile() && !stat.isSymbolicLink(), 'Only regular evidence files can be logged');
    if (stat.size > maxFileBytes) { skipped.set(relative, 'file size exceeds fixed logging bound'); return; }
    const bytes = fs.readFileSync(filename), after = fs.lstatSync(filename);
    if (bytes.length !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) return;
    const digest = sha(bytes);
    if (latest.get(relative)?.sha256 === digest) return;
    if (total + bytes.length > maxBytes) { skipped.set(relative, 'total fixed logging budget exhausted'); return; }
    const row = {fileId:sha(Buffer.from(relative + '\0' + digest)).slice(0, 24), path:relative, bytes:bytes.length, sha256:digest};
    const chunks = Math.ceil(bytes.length / 3072);
    write({kind:'FILE_BEGIN', ...row, chunks});
    for (let index = 0; index < chunks; index++) write({kind:'FILE_CHUNK', fileId:row.fileId, index, base64:bytes.subarray(index * 3072, (index + 1) * 3072).toString('base64')});
    write({kind:'FILE_END', fileId:row.fileId});
    total += bytes.length; latest.set(relative, row); skipped.delete(relative);
  }
  return {file, manifest:() => ({files:[...latest.values()].sort((a,b) => a.path.localeCompare(b.path)), skipped:[...skipped].map(([path,reason]) => ({path,reason})), loggedRawBytes:total, maxRawBytes:maxBytes, maxFileBytes})};
}
async function run({runner, installer, output}) {
  assert.equal(process.platform, 'win32', 'Actual native Windows required');
  runner = path.resolve(runner); installer = path.resolve(installer); output = path.resolve(output);
  assert(!fs.existsSync(output) && !fs.existsSync(output + '.fresh-install.json'), 'Fresh output required');
  const targetPath = path.join(runner, 'Windows_Target161.json'), target = JSON.parse(fs.readFileSync(targetPath));
  assert.equal(target.release, 171); assert.equal(target.freshInstallDefault, true);
  assert.equal(fs.statSync(installer).size, target.installer.bytes); assert.equal(sha(fs.readFileSync(installer)), target.installer.sha256);
  const logs = evidenceEmitter(), deadlineMs = 42 * 60 * 1000;
  let timedOut = false, scannerBusy = false, scanError = null;
  emit({kind:'RUN_START', wrapperHostPlatform:process.platform, wrapperPid:process.pid, startedAtUtc:new Date().toISOString(),
    targetSha256:sha(fs.readFileSync(targetPath)), installerSha256:target.installer.sha256, deadlineMs, fullWindowsAcceptance:false});
  function scan(final = false) {
    if (scannerBusy) return;
    scannerBusy = true;
    try {
      const receipt = output + '.fresh-install.json';
      if (fs.existsSync(receipt)) { try { JSON.parse(fs.readFileSync(receipt, 'utf8').replace(/^\uFEFF/, '')); logs.file('installation/fresh-install.json', receipt); } catch {} }
      if (!fs.existsSync(output)) return;
      function walk(dir, prefix) {
        for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
          if (entry.isSymbolicLink()) continue;
          const local = path.join(dir, entry.name), rel = prefix + entry.name;
          if (entry.isDirectory()) {
            if (final || fs.existsSync(path.join(local, 'result.json')) || fs.existsSync(path.join(local, 'crash.json'))) walk(local, rel + '/');
          } else if (entry.isFile() && /\.(json|jsonl|log|png)$/.test(entry.name) && !entry.name.startsWith('.')) {
            if (prefix || final || ['run-owner.json', 'fresh-install.json'].includes(entry.name)) logs.file('results/' + rel, local);
          }
        }
      }
      walk(output, '');
    } catch (error) { scanError = String(error.message || error); }
    finally { scannerBusy = false; }
  }
  const child = cp.spawn('powershell.exe', ['-NoProfile', '-File', path.join(runner, 'Start_Windows_Acceptance161.ps1'),
    '-Target', targetPath, '-Installer', installer, '-Output', output, '-DedicatedDisposableWindowsUser', '-NodeExe', process.execPath],
    {cwd:runner, windowsHide:true, stdio:['ignore', 'pipe', 'pipe']});
  for (const [stream, label] of [[child.stdout, 'STDOUT'], [child.stderr, 'STDERR']]) stream.on('data', bytes => {
    // JSON string encoding keeps subprocess newlines from injecting evidence lines.
    process.stdout.write('NQ161_PROCESS_' + label + ':' + JSON.stringify(bytes.toString('utf8')) + '\n');
  });
  const poll = setInterval(() => scan(false), 2000);
  const timer = setTimeout(() => {
    timedOut = true; scan(true);
    if (child.pid) { try { cp.execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {windowsHide:true, timeout:15000}); } catch {} }
  }, deadlineMs);
  let launchError;
  const exitCode = await new Promise(resolve => { child.once('error', error => { launchError = String(error.message || error); resolve(null); }); child.once('close', resolve); });
  clearInterval(poll); clearTimeout(timer); scan(true);
  let automation;
  try { automation = JSON.parse(fs.readFileSync(path.join(output, 'Windows_Automation161.json'), 'utf8')); } catch {}
  const completed = !timedOut && !launchError && automation?.allSelectedCasesHaveTerminalRecord === true && automation?.records?.length === 78;
  const automatedAllPass = completed && automation.nativeWindowsExecuted === true && automation.records.every(row => row.status === 'PASS' && row.platform === 'win32' && row.nativeWindowsExecuted === true);
  const manifest = logs.manifest();
  emit({kind:'RUN_END', complete:completed && !manifest.skipped.length && !scanError, automationCompleted:completed,
    automatedAllPass, timedOut, launcherExitCode:exitCode, launchError:launchError || null, scanError, ...manifest,
    finishedAtUtc:new Date().toISOString(), actualWindowsAutomationExecuted:automation?.nativeWindowsExecuted === true,
    fullWindowsAcceptance:false, remainingAttendedRecords:213,
    scope:'Hosted installed-Windows synthetic functional automation only; no attended OS, corpus, Anki, remote Android, clinical or full acceptance claim.'});
  return automatedAllPass && !manifest.skipped.length && !scanError ? 0 : 2;
}
module.exports = {evidenceEmitter, safeRelative, run};
if (require.main === module) {
  const args = process.argv.slice(2), values = {};
  try { assert.equal(args.length, 6); for (let index=0; index<args.length; index+=2) { assert(['--runner','--installer','--output'].includes(args[index])); assert(!Object.hasOwn(values,args[index])); values[args[index]]=args[index+1]; } }
  catch { process.stderr.write('Usage: node Run_Exact_Windows161.cjs --runner DIR --installer EXE --output FRESH_DIR\n'); process.exit(2); }
  run({runner:values['--runner'], installer:values['--installer'], output:values['--output']}).then(code => {process.exitCode=code;}).catch(error => {
    emit({kind:'RUN_ERROR', error:String(error.message || error), fullWindowsAcceptance:false}); process.exitCode=2;
  });
}
