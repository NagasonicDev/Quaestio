import zipfile, json, sys

path = sys.argv[1]
z = zipfile.ZipFile(path)
data = json.loads(z.read('course.json'))
qs = data['questions']


def sig(b):
    return json.dumps([b.get('block_type'), b.get('content')], sort_keys=True, ensure_ascii=False)


def walk(q, label=''):
    hits = []
    def check(obj, where):
        body = obj.get('body') or []
        prev = None
        for i, b in enumerate(body):
            s = sig(b)
            if s == prev:
                hits.append((where, i, b.get('block_type')))
            prev = s
    check(q, label or q.get('question_id'))
    for p in q.get('parts') or []:
        check(p, (label or q.get('question_id')) + '/' + str(p.get('part_label')))
        for pp in p.get('parts') or []:
            check(pp, (label or q.get('question_id')) + '/' + str(p.get('part_label')) + '/' + str(pp.get('part_label')))
    # duplicate mcq options
    opts = q.get('mcq_options') or []
    seen = {}
    for i, o in enumerate(opts):
        key = json.dumps([[b.get('block_type'), b.get('content')] for b in o.get('content') or []], sort_keys=True, ensure_ascii=False) + '|' + str(o.get('is_correct'))
        if key in seen:
            hits.append((label or q.get('question_id'), 'mcq', f'{seen[key]}~{i}'))
        else:
            seen[key] = i
    return hits

total = 0
examples = []
for q in qs:
    h = walk(q)
    if h:
        total += 1
        if len(examples) < 20:
            examples.append((q.get('question_id'), h))
print('questions with consecutive-dup body or dup mcq options:', total, '/', len(qs))
for e in examples:
    print(e)
