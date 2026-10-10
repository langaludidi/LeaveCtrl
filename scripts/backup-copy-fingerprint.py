"""Extract COPY row counts without exposing any backed-up records or credentials."""
import json
import re
import sys

counts = {}
table = None
with open(sys.argv[1], encoding="utf-8") as source:
    for line in source:
        match = re.match(r'^COPY "([^"]+)"\."([^"]+)" .* FROM stdin;', line)
        if match:
            table = ".".join(match.groups())
            counts[table] = 0
        elif table and line.rstrip("\n") == r"\.":
            table = None
        elif table:
            counts[table] += 1
if not counts or "public.organisations" not in counts or "auth.users" not in counts:
    raise SystemExit("Incomplete recovery data: required COPY tables absent")
json.dump(counts, sys.stdout, sort_keys=True)
