import sys, json
sys.path.insert(0, r"D:/quaestio/.opencode/skills/community-and-family-studies-question-import/scripts")
from qbx_lib import *
SKILL=r"D:/quaestio/.opencode/skills/community-and-family-studies-question-import"
schema=json.load(open(SKILL+"/import-schema.json",encoding="utf-8"))
ni=NodeIndex(schema)
def cls(codes): return {"node_codes":codes,"node_names":[ni.code_to_path[c] for c in codes],"node_ids":[ni.code_to_id[c] for c in codes]}
questions=[]

# Q22 carers graph
questions.append({
 "type_key":"extended_response","difficulty":4,"marks":5,
 **cls(["HSC-M3-T1-D9"]),
 "tags":["case_study","action_required"],
 "body":[text("The graph shows data from the 2024 NSW Carers Survey giving the age and gender of primary carers in NSW in 2024. Account for the age and gender of primary carers. Support your answer with reference to the graph provided. (The original graph cannot be reproduced in this bundle.)")],
 "hint":[],"answer":[text("Sample answer: The graph shows a significant number of female carers aged 50-70 years, likely due to traditional caring roles and part-time/retired status; male carers increase over 60 with retirement; very few non-binary/gender diverse individuals identify as carers.")],
 "solution":[],
 "marking_criteria": criteria([
  "5 marks: thoroughly accounts for the age and gender of carers, with detailed reference to the graph provided.",
  "4 marks: soundly accounts for the age and gender of carers, with reference to the graph provided.",
  "3 marks: attempts to account for the age and/or gender of carers.",
  "2 marks: provides some information on age and/or gender and/or carers.",
  "1 mark: provides some relevant information.",
 ]),
 "classification_confidence":"high",
 "source":{"name":"HSC","year":2025,"institution":"HSC","original_question_no":"22"},
})

# Q24 diary
diary=["A questionnaire was created for the IRP hypothesis 'Artificial intelligence can better prepare school students for future careers'.",
 "It was organised to hand out a paper questionnaire to our Year 12 cohort during a year meeting.",
 "We ran out of copies.",
 "The verbal instructions were unclear, and students were talking.",
 "The disorganisation meant that some students didn't finish the questionnaire or were really rushed. Also, the hospitality class was on an excursion."]
questions.append({
 "type_key":"extended_response","difficulty":4,"marks":5,
 **cls(["HSC-M1-T1-D54","HSC-M1-T1-D46"]),
 "tags":["case_study"],
 "body":[text("A diary entry from a student's Independent Research Project is shown:"),
         ulist(diary),
         text("Justify steps that would address the research issue presented in the diary.")],
 "hint":[],"answer":[text("Sample answer: The research method was unreliable because the whole target sample could not answer under the same conditions; steps include setting a new time for the whole group, delivering clear instructions, stating confidentiality, and allowing enough time to respond.")],
 "solution":[],
 "marking_criteria": criteria([
  "5 marks: justifies steps to address the research issue presented in the diary.",
  "4 marks: justifies some steps to address the research issue.",
  "3 marks: provides some steps to address the research issue.",
  "2 marks: demonstrates a basic understanding of the issue and/or solutions.",
  "1 mark: provides some relevant information.",
 ]),
 "classification_confidence":"high",
 "source":{"name":"HSC","year":2025,"institution":"HSC","original_question_no":"24"},
})

json.dump({"course_id":schema["course_id"],"course_name":schema["course_name"],"questions":questions},
 open("spec_2025.json","w",encoding="utf-8"), ensure_ascii=False, indent=2)
print("wrote", len(questions))