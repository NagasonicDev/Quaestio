import json, zipfile, sys, io
from collections import Counter

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

qp = r'D:\quaestio\frontend\public\templates\hsc\engineering-studies\engineering-studies.qb'
with zipfile.ZipFile(qp) as z:
    data = json.loads(z.read('course.json').decode('utf-8'))

qs = data['questions']
def has_cls(q):
    return bool(q.get('node_ids')) or bool(q.get('node_codes')) or bool(q.get('node_names'))
deep = [q for q in qs if has_cls(q)]
cnt = Counter()
for q in deep:
    for c in (q.get('node_codes') or []):
        cnt[c] += 1
print('classified', len(deep))
for c, n in cnt.most_common(30):
    print(n, c)
print()
for q in deep[:4]:
    print(q.get('question_id'), q.get('node_codes'), '|', q.get('tags'))
