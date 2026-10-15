#!/bin/bash
# Re-run rig setup -> weights -> stress test, print a compact summary.
cd "$(dirname "$0")/.."
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b -P scripts/04_rig_setup.py > /tmp/r.txt 2>&1; grep -E "^(GRIP|BALL|SAVED)|Error|Traceback" /tmp/r.txt
$B -b -P scripts/04b_weights.py > /tmp/w.txt 2>&1; grep -E "^(WEIGHTS|SAVED)|Error|Traceback" /tmp/w.txt
$B -b -P scripts/05_stress_test.py > /tmp/stress.txt 2>&1
grep -E "Error|Traceback|line [0-9]" /tmp/stress.txt
grep -E "^STRESS" /tmp/stress.txt | python3 -c "
import sys,json
for l in sys.stdin:
  _,n,j=l.split(' ',2); d=json.loads(j); b=d['Kai_Body']; s=d['Kai_Shirt']
  print(f\"{n:12s} angles={d['angles']} | body p01/p99={b['rest']['p01']}/{b['rest']['p99']} >1.6={b['rest']['edges_over_1_6']} <0.4={b['rest']['edges_under_0_4']} collapsed={b['collapsed_faces_lt25pct']} | hands p01/p99={b['hands']['p01']}/{b['hands']['p99']} | shirt p01/p99={s['rest']['p01']}/{s['rest']['p99']} >1.6={s['rest']['edges_over_1_6']} collapsed={s['collapsed_faces_lt25pct']}\")
"
