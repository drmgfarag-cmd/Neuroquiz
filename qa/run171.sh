#!/bin/bash
# NeuroQuiz 171 Android acceptance on a CI emulator (QA-only branch, never merge). Synthetic fixtures only.
set -u
cd "$(dirname "$0")"
echo "d83473004f32ad61499be70bc36f5ef44eb7e4ead20877cecf57aaf832a70214  NeuroQuiz-171-Android.apk" | sha256sum -c - || exit 2
echo "ad404703d7b45940dcafac83538f8f3693ffd58dff8ba57301325f4f29820423  NeuroQuiz-Android-Supervisor-Emulator171.apk" | sha256sum -c - || exit 2
adb wait-for-device
adb shell getprop ro.build.version.sdk; adb shell dumpsys package com.google.android.webview | grep -m1 versionName || true
adb install -r -g NeuroQuiz-171-Android.apk
adb install -r -g NeuroQuiz-Android-Supervisor-Emulator171.apk
adb logcat -c || true
adb logcat -v threadtime > logcat.txt 2>&1 &
LOG=$!
timeout 6900 adb shell am instrument -w -r org.neuroquiz.supervisor156/org.neuroquiz.supervisor156.SupervisorRunner156 > instrument.txt 2>&1
echo "instrument exit $?"
sleep 5; kill $LOG 2>/dev/null || true
tail -c 3000 instrument.txt
echo "=== CASES ==="
grep -a 'NQDOM154: CASE ' logcat.txt | sed 's/.*NQDOM154: CASE //' | python3 -c '
import json,sys,collections
rows={}
for l in sys.stdin:
    try: j=json.loads(l)
    except Exception: continue
    rows[j["id"]]=j
c=collections.Counter(r["status"] for r in rows.values())
print("distinct",len(rows),dict(c))
for i,r in sorted(rows.items()):
    if r["status"]!="PASS": print(r["status"],i,"|",str(r.get("message",""))[:400].replace("\n"," "))
'
grep -a 'NQDOM154: SUMMARY\|NQSUP' logcat.txt | tail -5 | cut -c1-600
