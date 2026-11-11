import json, zipfile, glob, os, re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

root = r'D:\quaestio\frontend\public\templates\hsc'
for qb in sorted(glob.glob(os.path.join(root, '*', '*.qb'))):
    with zipfile.ZipFile(qb) as z:
        data = json.loads(z.read('course.json').decode('utf-8'))
    nodes = data['course']['nodes']
    by_id = {n['node_id']: n for n in nodes}
    by_code = {n['code']: n for n in nodes if n.get('code')}
    kids = {}
    for n in nodes:
        kids.setdefault(n.get('parent_node_id'), []).append(n)
    def path(n):
        out = []
        while n:
            out.append(n['name'])
            n = by_id.get(n.get('parent_node_id'))
        return ' / '.join(reversed(out))
    def has_dchild(n):
        stack = list(kids.get(n['node_id'], []))
        while stack:
            c = stack.pop()
            if re.search(r'-D\d+$', c.get('code') or ''):
                return True
            stack.extend(kids.get(c['node_id'], []))
        return False
    # count top-level questions per code (unresolved-safe: only resolvable)
    counts = {}
    for q in data.get('questions', []):
        for c in (q.get('node_codes') or []):
            if c in by_code:
                counts[c] = counts.get(c, 0) + 1
    gaps = [(c, by_code[c]) for c in counts if not re.search(r'-D\d+$', c) and not has_dchild(by_code[c])]
    if not gaps:
        continue
    print(f'\n### {os.path.basename(qb)}')
    for c, n in sorted(gaps, key=lambda x: -counts[x[0]]):
        print(f'  {c} x{counts[c]} | L{n["level_index"]} | {path(n)}')
