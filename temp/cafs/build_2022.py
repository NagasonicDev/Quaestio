import sys, json
sys.path.insert(0, r"D:/quaestio/.opencode/skills/community-and-family-studies-question-import/scripts")
from qbx_lib import *
SKILL=r"D:/quaestio/.opencode/skills/community-and-family-studies-question-import"
schema=json.load(open(SKILL+"/import-schema.json",encoding="utf-8"))
ni=NodeIndex(schema)
def cls(codes): return {"node_codes":codes,"node_names":[ni.code_to_path[c] for c in codes],"node_ids":[ni.code_to_id[c] for c in codes]}
questions=[]

# Q24 (a)(b)
questions.append({
 "type_key":"extended_response","difficulty":4,"marks":10,
 **cls(["HSC-M2-T1-D38","HSC-M1-T1-D46"]),
 "tags":["case_study"],
 "body":[text("Answer parts (a) and (b) in relation to a student accessing support and resources.")],
 "hint":[],
 "parts":[
  {"part_label":"a","marks":5,
   "body":[text("Explain the characteristics that may affect a student's access to counselling services.")],
   "hint":[],"answer":[text("Sample answer: Characteristics such as age, socioeconomic status and level of education may affect a student's access to counselling; older students may drive themselves and not need parental consent, while cost and study/work commitments can limit access.")],
   "solution":[],
   "marking_criteria": criteria([
     "5 marks: demonstrates thorough understanding of a student's characteristics that may affect their access to counselling services; provides relevant examples.",
     "4 marks: demonstrates sound understanding of a student's characteristics that may affect access; provides example(s).",
     "2-3 marks: provides some information about a student's characteristics that may affect access to counselling services.",
     "1 mark: provides relevant information.",
   ]),
   "assets":[],"parts":[]},
  {"part_label":"b","marks":5,
   "body":[text("How would a student use resources to enhance their education?")],
   "hint":[],"answer":[text("Sample answer: A student may use time, money and knowledge resources by balancing study, employment and leisure; hiring tutors; buying textbooks, computers or online resources; and drawing on teachers' knowledge.")],
   "solution":[],
   "marking_criteria": criteria([
     "5 marks: demonstrates thorough knowledge and understanding about resources used to enhance education; provides an explanation about the resources and how they enhance a student's education; provides relevant examples.",
     "4 marks: demonstrates sound knowledge and understanding about resources used to enhance education; attempts to provide an explanation; provides examples.",
     "2-3 marks: provides some information about resources and how they enhance education.",
     "1 mark: provides relevant information.",
   ]),
   "assets":[],"parts":[]},
 ],
 "answer":[],"solution":[],
 "marking_criteria": criteria([
   "5 marks: part (a) explains characteristics affecting access to counselling services.",
   "5 marks: part (b) explains how a student uses resources to enhance education.",
 ]),
 "classification_confidence":"high",
 "source":{"name":"HSC","year":2022,"institution":"HSC","original_question_no":"24"},
})

# Q29 young carer
questions.append({
 "type_key":"extended_response","difficulty":5,"marks":8,
 **cls(["HSC-M3-T1-D9","HSC-M3-T1-D65"]),
 "tags":["case_study"],
 "body":[text("A 16-year-old has recently begun caring for their father who has had a stroke. Assess the formal support services available to this person in preparing to become a young carer.")],
 "hint":[],"answer":[text("Sample answer: The 16-year-old may access Centrelink Carer Allowance for finances, a community nurse for medical and education support, and respite care through Carer Gateway, alongside modifying the physical environment.")],
 "solution":[],
 "marking_criteria": criteria([
  "8 marks: provides an extensive assessment of the formal support services available to a young person preparing to become a carer; provides relevant examples.",
  "6-7 marks: provides a thorough assessment of the formal support services available; provides examples.",
  "4-5 marks: provides an understanding of the formal support services available; provides example(s).",
  "2-3 marks: provides some information about preparations for becoming a young carer and/or support services available.",
  "1 mark: provides relevant information.",
 ]),
 "classification_confidence":"high",
 "source":{"name":"HSC","year":2022,"institution":"HSC","original_question_no":"29"},
})

json.dump({"course_id":schema["course_id"],"course_name":schema["course_name"],"questions":questions},
 open("spec_2022.json","w",encoding="utf-8"), ensure_ascii=False, indent=2)
print("wrote", len(questions))