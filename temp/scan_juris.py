import zipfile, os, re
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
            except Exception as e:
                print('read err', p, n, e)
                continue
            if b'MUST also' in d or b'jurisprudence' in d.lower() or (b'Jurisprudence' in d):
                print('MATCH', p, '|', n, '| MUSTpos', d.find(b'MUST also'), '| len', len(d))
                # check invalid utf8
                try:
                    d.decode('utf-8')
                    print('  utf8 ok')
                except UnicodeDecodeError as e:
                    print('  utf8 err', e)
                # print context
                idx = d.find(b'MUST also')
                if idx >= 0:
                    print(repr(d[max(0,idx-200):idx+200]))
