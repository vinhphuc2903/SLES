#!/usr/bin/env python3
"""Count COPY records from pg_restore --data-only --file=-, without logging contents."""
import json,re,sys
counts={};table=None
for line in sys.stdin:
 if table:
  if line.rstrip('\n')=='\\.':table=None
  else:counts[table]+=1
 else:
  match=re.match(r'^COPY public\.([a-z_][a-z_0-9]*) \(',line)
  if match:table=match.group(1);counts[table]=0
if not counts:raise SystemExit('No COPY tables found in trusted backup')
json.dump(counts,sys.stdout,sort_keys=True)
