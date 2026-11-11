import sys, json
sys.path.insert(0, r"D:/quaestio/.opencode/skills/community-and-family-studies-question-import/scripts")
from qbx_lib import *
SKILL=r"D:/quaestio/.opencode/skills/community-and-family-studies-question-import"
schema=json.load(open(SKILL+"/import-schema.json",encoding="utf-8"))
ni=NodeIndex(schema)
def cls(codes): return {"node_codes":codes,"node_names":[ni.code_to_path[c] for c in codes],"node_ids":[ni.code_to_id[c] for c in codes]}
questions=[]

# Q27 social parent parts a,b
questions.append({
 "type_key":"extended_response","difficulty":5,"marks":8,
 **cls(["HSC-M3-T1-D4","HSC-M3-T1-D13"]),
 "tags":["case_study"],
 "body":[text("Answer parts (a) and (b) in relation to ONE type of social parent.")],
 "hint":[],
 "parts":[
  {"part_label":"a","marks":2,
   "body":[text("Define this type of social parent.")],
   "hint":[],"answer":[text("Sample answer: Social parent (e.g. adoption) is a permanent legal change where there is a transfer of the rights and responsibilities from the birth parent to the adoptive parent.")],
   "solution":[],
   "marking_criteria": criteria([
     "2 marks: provides a clear definition of the identified type of social parent.",
     "1 mark: provides some relevant information.",
   ]),
   "assets":[],"parts":[]},
  {"part_label":"b","marks":6,
   "body":[text("Explain the effect of legislation OR community attitudes on this type of social parent.")],
   "hint":[],"answer":[text("Sample answer: Changing community attitudes and government support can reduce the number of children available for adoption; legislation transfers rights and responsibilities and protects the arrangement.")],
   "solution":[],
   "marking_criteria": criteria([
     "6 marks: provides a thorough explanation of the effect of legislation OR community attitudes on the social parent identified.",
     "5 marks: provides a sound explanation of the effect of legislation OR community attitudes on the social parent identified.",
     "4 marks: provides an explanation of the effect of legislation OR community attitudes on the social parent identified.",
     "2-3 marks: demonstrates some understanding of legislation and/or community attitudes and/or parent(s).",
     "1 mark: provides some relevant information.",
   ]),
   "assets":[],"parts":[]},
 ],
 "answer":[],"solution":[],
 "marking_criteria": criteria([
   "2 marks: part (a) defines the social parent.",
   "6 marks: part (b) explains the effect of legislation or community attitudes on that social parent.",
 ]),
 "classification_confidence":"high",
 "source":{"name":"HSC","year":2023,"institution":"HSC","original_question_no":"27"},
})

# Q28 IRP ethics
practices=["Permission was granted prior to the interviews.",
 "Participant names were recorded on the questionnaires that were distributed.",
 "Questionnaires were given to 15 male and 3 female students.",
 "Questionnaires were discarded in a rubbish bin in the school playground.",
 "Results were amended to reflect the hypothesis.",
 "Names were removed from the analysis and discussion.",
 "A bibliography was included in the project."]
questions.append({
 "type_key":"extended_response","difficulty":5,"marks":8,
 **cls(["HSC-M1-T1-D16","HSC-M1-T1-D30"]),
 "tags":["case_study"],
 "body":[text("A student has conducted an Independent Research Project on the effects of technology on adolescents. The following practices occurred during the research process. To what extent were the practices ethical? Justify your answer."),
         ulist(practices)],
 "hint":[],"answer":[text("Sample answer: Privacy was breached when participant names were recorded and questionnaires discarded in a bin, but protected when names were removed from analysis; respect occurred when permission was granted; bias occurred through unequal gender sampling; integrity was established by crediting sources but breached when results were amended to reflect the hypothesis.")],
 "solution":[],
 "marking_criteria": criteria([
  "8 marks: provides well-informed judgements of the extent to which research practices were ethical.",
  "6-7 marks: provides judgements of the extent to which research practices were ethical.",
  "4-5 marks: provides some judgement of the extent to which research practices were ethical.",
  "2-3 marks: demonstrates some understanding of ethical practices during the research process.",
  "1 mark: provides some relevant information.",
 ]),
 "classification_confidence":"high",
 "source":{"name":"HSC","year":2023,"institution":"HSC","original_question_no":"28"},
})

json.dump({"course_id":schema["course_id"],"course_name":schema["course_name"],"questions":questions},
 open("spec_2023.json","w",encoding="utf-8"), ensure_ascii=False, indent=2)
print("wrote", len(questions))