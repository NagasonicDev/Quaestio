import zipfile, os
# scan D:\quaestio fully for capital 'MUST also'
root = r'D:\quaestio'
for dp, dirs, files in os.walk(root):
    if 'node_modules' in dp or '.git' in dp:
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
            idx = d.find(b'MUST also')
            if idx >= 0:
                print('CAP MUST', p, n, 'pos', idx, 'len', len(d))
                print(repr(d[max(0,idx-250):idx+150])[:700])
            # invalid utf8 check on json
            if n.endswith('.json'):
                try:
                    d.decode('utf-8')
                except UnicodeDecodeError as e:
                    print('INVALID UTF8', p, n, 'at', e.start)
                    print(repr(d[max(0,e.start-200):e.start+150])[:700])
print('done')
