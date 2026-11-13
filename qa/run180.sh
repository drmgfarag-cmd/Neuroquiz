#!/bin/bash
# NeuroQuiz 180 Android acceptance on a CI emulator (QA-only branch, never merge). Synthetic fixtures only.
# 178 (audit-177 scope finding 2): a fresh install is proven (both packages removed first, installed hashes read back),
# the complete raw logcat and instrumentation output are kept (uploaded by the workflow with their SHA-256), and the
# summary reports malformed rows, repeated case ids, conflicting repeats and every expected case that was not recorded.
# The job fails when the instrumentation did not finish or the evidence is incomplete; FAIL/BLOCKED cases are listed.
set -u
cd "$(dirname "$0")"
APK=NeuroQuiz-180-Android.apk; TEST=NeuroQuiz-Android-Supervisor-Emulator180.apk
echo "973fdaf63ce6515a7a4d9017435f2ae0fe4bd131266028f9ac146bbbbb04735c  $APK" | sha256sum -c - || exit 2
echo "4dc86bab453fab022f042ad11575834e8ce09c92ab1ab7ad82ee8f2854abd556  $TEST" | sha256sum -c - || exit 2
mkdir -p evidence
adb wait-for-device
SDK=$(adb shell getprop ro.build.version.sdk | tr -d '\r'); echo "sdk $SDK"
{ echo "sdk=$SDK"; echo "model=$(adb shell getprop ro.product.model | tr -d '\r')"; echo "fingerprint=$(adb shell getprop ro.build.fingerprint | tr -d '\r')"
  adb shell dumpsys package com.google.android.webview | grep -m1 versionName || true; } > evidence/device.txt
for pkg in org.neuroquiz.app org.neuroquiz.supervisor156; do adb uninstall $pkg >/dev/null 2>&1 || true; done
if adb shell pm list packages | tr -d '\r' | grep -qE '^package:org\.neuroquiz\.(app|supervisor156)$'; then echo "packages still installed before the fresh install"; exit 2; fi
echo "fresh=both packages absent before install" >> evidence/device.txt
adb install -g $APK || exit 2
adb install -g $TEST || exit 2
for pkg in org.neuroquiz.app org.neuroquiz.supervisor156; do
  path=$(adb shell pm path $pkg | tr -d '\r' | sed -n 's/^package://p' | head -1)
  echo "installed $pkg $(adb shell sha256sum "$path" | cut -d' ' -f1)" | tee -a evidence/device.txt
done
grep -q "installed org.neuroquiz.app 973fdaf63ce6515a7a4d9017435f2ae0fe4bd131266028f9ac146bbbbb04735c" evidence/device.txt || { echo "installed app differs from the pinned APK"; exit 2; }
grep -q "installed org.neuroquiz.supervisor156 4dc86bab453fab022f042ad11575834e8ce09c92ab1ab7ad82ee8f2854abd556" evidence/device.txt || { echo "installed test APK differs from the pinned one"; exit 2; }
adb logcat -c || true
adb logcat -v threadtime > evidence/logcat.txt 2>&1 &
LOG=$!
timeout 14400 adb shell am instrument -w -r org.neuroquiz.supervisor156/org.neuroquiz.supervisor156.SupervisorRunner156 > evidence/instrument.txt 2>&1
RC=$?; echo "instrument exit $RC" | tee -a evidence/device.txt
sleep 5; kill $LOG 2>/dev/null || true
( cd evidence && sha256sum logcat.txt instrument.txt device.txt > SHA256SUMS && cat SHA256SUMS )
tail -c 2000 evidence/instrument.txt
echo "=== CASES ==="
python3 - "$SDK" "$RC" <<'PY'
import json,sys,collections,re
sdk,rc=sys.argv[1],int(sys.argv[2])
expected=json.load(open('expected_cases180.json'))
rows=collections.defaultdict(list); malformed=0; lines=0; cut=0
for l in open('evidence/logcat.txt',errors='replace'):
    m=re.search(r'(?:NQDOM154|NQSUP156): CASE (\{.*)',l)
    if not m: continue
    lines+=1
    try: j=json.loads(m.group(1)); rows[j['id']].append(j)
    except Exception:
        # logcat cuts very long lines: the id and status at the start of the row are still read, and the cut is counted
        r=re.search(r'"id":"([a-z_0-9]+)","group":"[a-z_0-9-]*","status":"([A-Z_]+)"',m.group(1))
        if r: cut+=1; rows[r.group(1)].append({'id':r.group(1),'status':r.group(2),'message':'(row cut by logcat)'})
        else: malformed+=1
last={i:r[-1] for i,r in rows.items()}
c=collections.Counter(r['status'] for r in last.values())
repeated={i:[x['status'] for x in r] for i,r in rows.items() if len(r)>1}
conflicting={i:s for i,s in repeated.items() if len(set(s))>1}
want=set(expected['main'])|set(expected['supervisor'])
if sdk=='30': want-=set(expected.get('notApplicableApi30',[]))
missing=sorted(want-set(last)); extra=sorted(set(last)-want)
inst=open('evidence/instrument.txt',errors='replace').read()
finished=bool(re.search(r'INSTRUMENTATION_CODE: -?\d+',inst)) and rc==0
print('case lines',lines,'malformed',malformed,'cut by logcat',cut,'distinct',len(last),dict(c))
print('repeated ids',len(repeated),'conflicting repeats',json.dumps(conflicting))
print('expected',len(want),'unrecorded',len(missing),json.dumps(missing)); print('not in the expected list',json.dumps(extra))
print('instrumentation finished',finished,'exit',rc)
for i,r in sorted(last.items()):
    if r['status']!='PASS': print(r['status'],i,'|',str(r.get('message',''))[:3000].replace('\n',' '))
complete=finished and not malformed and not conflicting and not missing
json.dump({'sdk':sdk,'finished':finished,'instrumentExit':rc,'caseLines':lines,'malformed':malformed,'rowsCutByLogcat':cut,'distinct':len(last),'counts':dict(c),'repeated':repeated,'conflicting':conflicting,'unrecorded':missing,'unexpected':extra,'evidenceComplete':complete,
           'notPassed':{i:r['status'] for i,r in last.items() if r['status']!='PASS'}},open('evidence/summary.json','w'),indent=1)
print('EVIDENCE COMPLETE' if complete else 'EVIDENCE INCOMPLETE'); sys.exit(0 if complete else 3)
PY
E=$?
grep -a 'NQDOM154: SUMMARY\|NQSUP' evidence/logcat.txt | tail -5 | cut -c1-600
exit $E
