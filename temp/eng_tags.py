import json, zipfile, sys, io
from collections import Counter

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

qp = r'D:\quaestio\frontend\public\templates\hsc\engineering-studies\engineering-studies.qb'
with zipfile.ZipFile(qp) as z:
    data = json.loads(z.read('course.json').decode('utf-8'))

qs = data['questions']

def has_cls(q):
    return bool(q.get('node_ids')) or bool(q.get('node_codes')) or bool(q.get('node_names'))

un = [q for q in qs if not has_cls(q)]

mods = ["Engineering Fundamentals", "Engineered Products", "Braking Systems", "Biomedical Engineering",
        "Civil Structures", "Personal and Public Transport", "Aeronautical Engineering", "Telecommunications Engineering"]

cnt = Counter()
combo = Counter()
none = 0
multi = 0
for q in un:
    tags = q.get('tags') or []
    hits = [m for m in mods if m in tags]
    for h in hits:
        cnt[h] += 1
    combo[tuple(sorted(hits))] += 1
    if len(hits) == 0:
        none += 1
    elif len(hits) > 1:
        multi += 1

print('unclassified', len(un))
print('module tag counts:', dict(cnt))
print('none:', none, 'multi:', multi)
print()
print('combos:')
for k, v in combo.most_common():
    print(' ', v, k)
