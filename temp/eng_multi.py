import json, zipfile, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

qp = r'D:\quaestio\frontend\public\templates\hsc\engineering-studies\engineering-studies.qb'
with zipfile.ZipFile(qp) as z:
    data = json.loads(z.read('course.json').decode('utf-8'))

qs = data['questions']
def has_cls(q):
    return bool(q.get('node_ids')) or bool(q.get('node_codes')) or bool(q.get('node_names'))
un = [q for q in qs if not has_cls(q)]
mods = ["Engineering Fundamentals", "Engineered Products", "Braking Systems", "Biomedical Engineering",
        "Civil Structures", "Personal and Public Transport", "Aeronautical Engineering", "Telecommunications Engineering"]

def text_of(body):
    out = []
    if isinstance(body, list):
        for b in body:
            if isinstance(b, dict) and b.get('block_type') == 'text':
                out.append(b.get('content', {}).get('text', ''))
    return ' '.join(out)[:300]

for q in un:
    tags = q.get('tags') or []
    hits = [m for m in mods if m in tags]
    if len(hits) > 1:
        print('===', q.get('question_id'), '|', hits)
        print(text_of(q.get('body')))
        print()
