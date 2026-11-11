import sys, json
sys.path.insert(0, r"D:/quaestio/.opencode/skills/community-and-family-studies-question-import/scripts")
from qbx_lib import *
SKILL=r"D:/quaestio/.opencode/skills/community-and-family-studies-question-import"
schema=json.load(open(SKILL+"/import-schema.json",encoding="utf-8"))
ni=NodeIndex(schema)
def cls(codes): return {"node_codes":codes,"node_names":[ni.code_to_path[c] for c in codes],"node_ids":[ni.code_to_id[c] for c in codes]}
questions=[]

# Q27 rural and remote
questions.append({
 "type_key":"extended_response","difficulty":4,"marks":7,
 **cls(["HSC-M2-T1-D5"]),
 "tags":["case_study"],
 "body":[text("How could the characteristics of individuals living in a rural and remote location affect a family's access to services?")],
 "hint":[],"answer":[text("Sample answer: Individuals from rural and remote families may have lower socioeconomic status during drought or flood, affecting access to high-fee health services, and people with disabilities may have to travel long distances for specialised care.")],
 "solution":[],
 "marking_criteria": criteria([
  "7 marks: demonstrates a thorough understanding of how the characteristics of individuals living in a rural and remote location affect a family's access to services.",
  "6 marks: demonstrates a sound understanding of how the characteristics affect access to services.",
  "4-5 marks: demonstrates an understanding of how the characteristics of individuals living in a rural and remote location affect a family's access to services.",
  "2-3 marks: demonstrates some understanding of characteristic(s) of individuals in rural and remote families and/or their access to service(s).",
  "1 mark: provides some relevant information.",
 ]),
 "classification_confidence":"high",
 "source":{"name":"HSC","year":2024,"institution":"HSC","original_question_no":"27"},
})

# Q28 social parents health decisions
questions.append({
 "type_key":"extended_response","difficulty":5,"marks":8,
 **cls(["HSC-M3-T1-D4","HSC-M3-T1-D31"]),
 "tags":["case_study"],
 "body":[text("How can the wellbeing of social parents be affected by the responsibility of making health and medical decisions for a dependant?")],
 "hint":[],"answer":[text("Sample answer: Social parents such as foster and stepparents are often legally unable to make major health decisions, which can cause stress, frustration and helplessness affecting their emotional wellbeing.")],
 "solution":[],
 "marking_criteria": criteria([
  "8 marks: provides a thorough understanding of how the wellbeing of social parents can be affected by the responsibilities of making health and medical decisions for a dependant.",
  "6-7 marks: provides a sound understanding of how the wellbeing of social parents can be affected.",
  "4-5 marks: provides some understanding of how the wellbeing of social parent(s) can be affected.",
  "2-3 marks: demonstrates some understanding of the impact on parent(s) when making health and/or medical decisions for a dependant.",
  "1 mark: provides some relevant information.",
 ]),
 "classification_confidence":"high",
 "source":{"name":"HSC","year":2024,"institution":"HSC","original_question_no":"28"},
})

json.dump({"course_id":schema["course_id"],"course_name":schema["course_name"],"questions":questions},
 open("spec_2024.json","w",encoding="utf-8"), ensure_ascii=False, indent=2)
print("wrote", len(questions))