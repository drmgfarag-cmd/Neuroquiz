#!/bin/bash
# NeuroQuiz 172 Android acceptance on a CI emulator (QA-only branch, never merge). Synthetic fixtures only.
set -u
cd "$(dirname "$0")"
echo "b7e3de5ab2c1b587556d58929843209a62d3e1030ef67c7f1b1f035def93c847  NeuroQuiz-172-Android.apk" | sha256sum -c - || exit 2
echo "eb5f2f3f868a4d1c4c84dd024677fd209921c6b934b45dd4f75f46e68f0857b7  NeuroQuiz-Android-Supervisor-Emulator172.apk" | sha256sum -c - || exit 2
adb wait-for-device
adb shell getprop ro.build.version.sdk; adb shell dumpsys package com.google.android.webview | grep -m1 versionName || true
adb install -r -g NeuroQuiz-172-Android.apk
adb install -r -g NeuroQuiz-Android-Supervisor-Emulator172.apk
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
