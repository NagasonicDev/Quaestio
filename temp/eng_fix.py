import json, zipfile, shutil, sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

QP = r'D:\quaestio\frontend\public\templates\hsc\engineering-studies\engineering-studies.qb'
DRY = '--apply' not in sys.argv

MODULES = {
    "Engineering Fundamentals": "PRE-M1",
    "Engineered Products": "PRE-M2",
    "Braking Systems": "PRE-M3",
    "Biomedical Engineering": "PRE-M4",
    "Civil Structures": "HSC-M1",
    "Personal and Public Transport": "HSC-M2",
    "Aeronautical Engineering": "HSC-M3",
    "Telecommunications Engineering": "HSC-M4",
}
TOPICS = {
    "Engineering Mechanics": "PRE-M1-T1",
    "Engineering Materials": "PRE-M1-T2",
    "Technical Communication": "PRE-M1-T3",
    "Engineering Report": "PRE-M1-T3",
    "Engineering Design": "PRE-M1-T3",
    "Engineering Profession": "PRE-M1-T3",
    "Electricity and Electronics": "PRE-M2-T1",
}

def has_cls(q):
    return bool(q.get('node_ids')) or bool(q.get('node_codes')) or bool(q.get('node_names'))

with zipfile.ZipFile(QP) as z:
    data = json.loads(z.read('course.json').decode('utf-8'))
    entries = [(i, z.read(i.filename)) for i in z.infolist()]

nodes = data['course']['nodes']
by_code = {n['code']: n for n in nodes}
by_id = {n['node_id']: n for n in nodes}
kids = {}
for n in nodes:
    kids.setdefault(n.get('parent_node_id'), []).append(n)

def path_of(n):
    parts = []
    cur = n
    seen = set()
    while cur is not None and cur['node_id'] not in seen:
        seen.add(cur['node_id'])
        parts.append(cur['name'])
        cur = by_id.get(cur.get('parent_node_id'))
    return " / ".join(reversed(parts))

def desc_d(n):
    out = []
    stack = list(kids.get(n['node_id'], []))
    while stack:
        c = stack.pop()
        if '-D' in c['code'] and c['code'].rsplit('-D', 1)[-1].isdigit():
            out.append(c)
        stack.extend(kids.get(c['node_id'], []))
    return sorted(out, key=lambda x: x['code'])

fixed = 0
skip = 0
counts = {}
for q in data['questions']:
    if has_cls(q):
        continue
    tags = q.get('tags') or []
    target = None
    for t in tags:
        if t in MODULES:
            target = by_code.get(MODULES[t]); break
    if target is None:
        for t in tags:
            if t in TOPICS:
                target = by_code.get(TOPICS[t]); break
    if target is None:
        skip += 1
        continue
    ds = desc_d(target)
    if not ds:
        skip += 1
        continue
    d = ds[0]
    q.setdefault('node_codes', [])
    q.setdefault('node_ids', [])
    q.setdefault('node_names', [])
    if q['node_codes'] is None: q['node_codes'] = []
    if q['node_ids'] is None: q['node_ids'] = []
    if q['node_names'] is None: q['node_names'] = []
    q['node_codes'].append(d['code'])
    q['node_ids'].append(d['node_id'])
    q['node_names'].append(path_of(d))
    fixed += 1
    counts[d['code']] = counts.get(d['code'], 0) + 1

print('DRY' if DRY else 'APPLY', 'fixed', fixed, 'skip', skip)
for k, v in sorted(counts.items(), key=lambda x: -x[1]):
    print(f'  {k} x{v}')

if not DRY and fixed:
    payload = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode('utf-8')
    tmp = QP + '.tmp'
    with zipfile.ZipFile(tmp, 'w') as z:
        for info, raw in entries:
            content = payload if info.filename == 'course.json' else raw
            ni = zipfile.ZipInfo(info.filename, date_time=info.date_time)
            ni.compress_type = info.compress_type
            ni.external_attr = info.external_attr
            ni.create_system = info.create_system
            z.writestr(ni, content)
    shutil.move(tmp, QP)
    print('written', os.path.getsize(QP))
