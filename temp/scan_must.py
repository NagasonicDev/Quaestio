import zipfile, os, json, re
root = r'D:\quaestio'
# search all qb/qbx for MUST (case-insensitive) near also
hits = []
for dp, dirs, files in os.walk(root):
    if 'node_modules' in dp or '.git' in dp:
        continue
    for f in files:
        if not f.endswith(('.qb', '.qbx')):
            continue
        p = os.path.join(dp, f)
        try:
            z = zipfile.ZipFile(p)
        except Exception:
            continue
        for n in z.namelist():
            d = z.read(n)
            # case insensitive 'must also'
            low = d.lower()
            idx = low.find(b'must also')
            if idx >= 0:
                print('HIT', p, n, 'pos', idx, 'len', len(d))
                print(repr(d[max(0,idx-300):idx+200])[:600])
                hits.append(p)
print('done hits', len(hits))
