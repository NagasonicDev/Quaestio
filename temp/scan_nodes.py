import zipfile, json, re
for label, p in [
    ('LS09', r'D:\quaestio\frontend\public\templates\hsc\legal-studies-2009\legal-studies-2009.qb'),
    ('LS', r'D:\quaestio\frontend\public\templates\hsc\legal-studies\legal-studies.qb'),
]:
    z = zipfile.ZipFile(p)
    d = z.read('course.json').decode('utf-8')
    print(label, 'jurisprudence occurrences:', d.lower().count('jurisprudence'))
    for m in re.finditer(r'.{0,60}jurisprudence.{0,60}', d, flags=re.I):
        print('  ', repr(m.group(0))[:160])
        if m.start() > 0:
            pass
    # MUST also:
    print(label, "MUSTcolon:", d.count('MUST also:'), "MUSTalso:", d.count('MUST also'))
    for m in re.finditer(r'.{0,80}MUST also.{0,80}', d):
        print('  MUST:', repr(m.group(0))[:200])
    # check invalid utf8 theory: file size
    print(label, 'course.json len', len(d))
