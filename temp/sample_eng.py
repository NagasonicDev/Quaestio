import json, zipfile, sys, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

qp = r'D:\quaestio\frontend\public\templates\hsc\engineering-studies\engineering-studies.qb'
with zipfile.ZipFile(qp) as z:
    data = json.loads(z.read('course.json').decode('utf-8'))

qs = data['questions']

def has_cls(q):
    return bool(q.get('node_ids')) or bool(q.get('node_codes')) or bool(q.get('node_names'))

un = [q for q in qs if not has_cls(q)]
print('unclassified:', len(un))
print()

for q in un[:6]:
    print('---', q.get('question_id'), '| marks', q.get('marks'), '| tags', q.get('tags'))
    print('keys:', sorted(q.keys()))
    src = q.get('source')
    print('source:', json.dumps(src, ensure_ascii=False)[:400] if src else None)
    body = q.get('body')
    # print text blocks only
    texts = []
    if isinstance(body, dict):
        for b in body.get('blocks', []) if isinstance(body.get('blocks'), list) else []:
            pass
    print('body:', json.dumps(body, ensure_ascii=False)[:600])
    print('notes:', json.dumps(q.get('notes'), ensure_ascii=False)[:200])
    print()
