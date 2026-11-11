import zipfile, json, os
base = r'D:\quaestio\frontend\public\templates\hsc'
for name in sorted(os.listdir(base)):
    d = os.path.join(base, name)
    if not os.path.isdir(d): continue
    for f in os.listdir(d):
        if not f.endswith('.qb'): continue
        p = os.path.join(d, f)
        try:
            z = zipfile.ZipFile(p)
            j = json.loads(z.read('course.json').decode('utf-8'))
            c = j.get('course', {})
            print(name, '|', c.get('id'), '|', (c.get('name') or '')[:60], '|', c.get('course_id'), '|', len(j.get('questions',[])), 'qs')
        except Exception as e:
            print(name, f, 'ERR', e)
