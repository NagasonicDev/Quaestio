import json, zipfile, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
qp = r'D:\quaestio\frontend\public\templates\hsc\physics\physics.qb'
with zipfile.ZipFile(qp) as z:
    data = json.loads(z.read('course.json').decode('utf-8'))
for q in data['questions']:
    cs = q.get('node_codes') or []
    if any(c == 'M8' for c in cs):
        print(q.get('question_id'), '|', q.get('tags'), '|', cs, '|', q.get('node_names'))
        body = q.get('body')
        out = []
        if isinstance(body, list):
            for b in body:
                if isinstance(b, dict) and b.get('block_type') == 'text':
                    out.append(b.get('content', {}).get('text', ''))
        print(' '.join(out)[:400])
        print()
