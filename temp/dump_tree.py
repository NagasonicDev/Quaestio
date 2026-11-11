import zipfile, json, sys, os

course = sys.argv[1]
root = r'D:\quaestio\frontend\public\templates\hsc'
path = os.path.join(root, course, course + '.qb')
z = zipfile.ZipFile(path)
d = json.loads(z.read('course.json'))
nodes = d['course']['nodes']
kids = {}
for n in nodes:
    kids.setdefault(n['parent_node_id'], []).append(n)


def walk(n, ind=0):
    k = kids.get(n['node_id'], [])
    dc = sum(1 for c in k if '-D' in c['code'])
    print('  ' * ind + f"{n['code']} | {n['name']} | children={len(k)} dchildren={dc}")
    for c in sorted(k, key=lambda x: x.get('sort_order', 0)):
        walk(c, ind + 1)


for n in nodes:
    if n['level_index'] == 0:
        walk(n)
