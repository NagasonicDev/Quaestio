import zipfile, json, sys

path = sys.argv[1]
z = zipfile.ZipFile(path)
data = json.loads(z.read('course.json'))
qs = data['questions']
target = '84VUYK'
match = [q for q in qs if q.get('question_id') == target]
print('matches:', len(match))
q = match[0]
print(json.dumps(q, indent=2, ensure_ascii=False)[:6000])
