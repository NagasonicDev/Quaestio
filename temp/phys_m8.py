import json, zipfile, shutil, sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
QP = r'D:\quaestio\frontend\public\templates\hsc\physics\physics.qb'
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
    parts, cur, seen = [], n, set()
    while cur is not None and cur['node_id'] not in seen:
        seen.add(cur['node_id']); parts.append(cur['name']); cur = by_id.get(cur.get('parent_node_id'))
    return " / ".join(reversed(parts))

def first_d(n):
    out, stack = [], list(kids.get(n['node_id'], []))
    while stack:
        c = stack.pop()
        if '-D' in c['code'] and c['code'].rsplit('-D', 1)[-1].isdigit():
            out.append(c)
        stack.extend(kids.get(c['node_id'], []))
    return sorted(out, key=lambda x: x['code'])[0]

target = first_d(by_code['HSC-M5'])
fixed = 0
for q in data['questions']:
    cs = q.get('node_codes') or []
    if 'M8' in cs and not any('-D' in c for c in cs):
        q['node_codes'].append(target['code'])
        q['node_ids'].append(target['node_id'])
        q['node_names'].append(path_of(target))
        fixed += 1
        print('fixed', q['question_id'], '->', target['code'], '|', path_of(target))

if fixed:
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
