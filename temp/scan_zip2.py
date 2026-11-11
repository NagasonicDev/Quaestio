import zipfile, os, json, sys
root = r'D:\quaestio'
found = []
for dp, dirs, files in os.walk(root):
    if 'node_modules' in dp or '.git' in dp or '.opencode' in dp:
        continue
    for f in files:
        if not f.endswith(('.qb', '.qbx', '.zip')):
            continue
        p = os.path.join(dp, f)
        try:
            z = zipfile.ZipFile(p)
        except Exception:
            continue
        for n in z.namelist():
            try:
                d = z.read(n)
            except Exception:
                continue
            if 'course.json' in n or n.endswith('.json'):
                try:
                    d.decode('utf-8')
                except UnicodeDecodeError as e:
                    print('INVALID UTF8', p, n, 'errpos', e.start, 'obj_start...', e)
                    print(repr(d[max(0,e.start-120):e.start+120]))
            # also scan for jurisprudence id?
            if b'jurisprudence' in d.lower():
                print('jurisprudence in bytes', p, n)
print('---done---')
# check for any file named *juris* anywhere under D quaestio incl hidden
for dp, dirs, files in os.walk(root):
    for f in files:
        if 'juris' in f.lower():
            print('FILENAME', os.path.join(dp,f))
print('---names done---')
