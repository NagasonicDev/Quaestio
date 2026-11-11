import sys, json
sys.path.insert(0, r"D:/quaestio/.opencode/skills/community-and-family-studies-question-import/scripts")
from qbx_lib import *
SKILL=r"D:/quaestio/.opencode/skills/community-and-family-studies-question-import"
schema=json.load(open(SKILL+"/import-schema.json",encoding="utf-8"))
ni=NodeIndex(schema)
def cls(codes):
    return {"node_codes":codes,"node_names":[ni.code_to_path[c] for c in codes],"node_ids":[ni.code_to_id[c] for c in codes]}
questions=[]

# Q26 Harry research (6)
questions.append({
 "type_key":"extended_response","difficulty":4,"marks":6,
 **cls(["HSC-M1-T1-D44","HSC-M1-T1-D41"]),
 "tags":["case_study"],
 "body":[text("Harry is conducting an independent research project on student participation in organised sport during the Higher School Certificate year. Harry will need to conduct research using a range of research methods. Explain the steps involved in conducting this research, supporting each step with relevant examples.")],
 "hint":[],"answer":[text("Sample answer: Access sources of data (secondary data and literature review, then primary data such as questionnaires and interviews); collect and record data; document actions and issues; interpret findings and form conclusions.")],
 "solution":[],
 "marking_criteria": criteria([
  "6 marks: demonstrates extensive knowledge and understanding of each step involved when conducting research about participation in organised sport during the HSC year; provides a clear link between the components of the research process; provides relevant examples for all steps conducted.",
  "5 marks: demonstrates thorough knowledge and understanding of each step involved when conducting research; provides a link between the components of the research process; provides relevant example(s) for all steps conducted.",
  "4 marks: demonstrates sound knowledge and understanding of the steps involved when conducting research; attempts to link components of the research process; provides relevant example(s) for the step(s).",
  "2-3 marks: provides some information about the step(s) involved when conducting research.",
  "1 mark: provides some relevant information.",
 ]),
 "classification_confidence":"high",
 "source":{"name":"HSC","year":2021,"institution":"HSC","original_question_no":"26"},
})

# Q27 (a)/(b) Joseph and Sarah authoritarian (total 6)
questions.append({
 "type_key":"extended_response","difficulty":4,"marks":6,
 **cls(["HSC-M3-T1-D52","HSC-M3-T1-D20"]),
 "tags":["case_study"],
 "body":[text("Joseph and Sarah have chosen an authoritarian parenting style for their 3-year-old son and 16-year-old daughter.")],
 "hint":[],
 "parts":[
  {"part_label":"a","marks":2,
   "body":[text("What are the characteristics of an authoritarian parenting style?")],
   "hint":[],"answer":[text("Sample answer: Authoritarian parenting styles are rigid, inflexible and do not allow dependants to contribute to decision making; they enforce strict rules and consequences.")],
   "solution":[],
   "marking_criteria": criteria([
     "2 marks: provides characteristics of an authoritarian style of parenting.",
     "1 mark: provides relevant information.",
   ]),
   "assets":[],"parts":[]},
  {"part_label":"b","marks":4,
   "body":[text("What are the effects an authoritarian parenting style could have on this family?")],
   "hint":[],"answer":[text("Sample answer: Authoritarian parenting is inflexible with preconceived goals; it promotes clear boundaries and communication but may limit the child's independence and create fear, especially for the 3-year-old and 16-year-old.")],
   "solution":[],
   "marking_criteria": criteria([
     "4 marks: demonstrates thorough knowledge and understanding of the effects an authoritarian parenting style could have on this family; provides clear points for and/or against; provides relevant examples.",
     "3 marks: demonstrates sound knowledge and understanding of the effects; provides point(s) for and/or against; provides relevant example(s).",
     "2 marks: provides some information about the effects of an authoritarian parenting style.",
     "1 mark: provides relevant information.",
   ]),
   "assets":[],"parts":[]},
 ],
 "answer":[],"solution":[],
 "marking_criteria": criteria([
   "2 marks: part (a) identifies characteristics of an authoritarian parenting style.",
   "4 marks: part (b) explains effects of an authoritarian parenting style on this family.",
 ]),
 "classification_confidence":"high",
 "source":{"name":"HSC","year":2021,"institution":"HSC","original_question_no":"27"},
})

# Q29 Sally cares (8)
questions.append({
 "type_key":"extended_response","difficulty":5,"marks":8,
 **cls(["HSC-M3-T1-D9","HSC-M3-T1-D65"]),
 "tags":["case_study"],
 "body":[text("Sally cares for both her teenage son and her elderly mother who has a physical disability. Compare the strategies Sally would use in her roles as a parent and a carer, using relevant examples.")],
 "hint":[],"answer":[text("Sample answer: Similarities include satisfying specific needs (food, shelter, economic support) and building positive relationships; differences include home modifications and wheelchair access for the mother and educational support for the son.")],
 "solution":[],
 "marking_criteria": criteria([
  "8 marks: demonstrates extensive knowledge and understanding about parenting and caring roles; provides extensive information on how the strategies used are similar and/or different for the roles; provides relevant examples.",
  "6-7 marks: demonstrates thorough knowledge and understanding about parenting and caring roles; provides thorough information on how the strategies used are similar and/or different; provides relevant examples.",
  "4-5 marks: demonstrates sound knowledge about parenting and caring roles; provides information about strategies that can be used for both parent and carer; attempts to show similarity and/or difference; provides example(s).",
  "2-3 marks: provides some information about parenting and/or caring and/or strategies.",
  "1 mark: provides a relevant point about parenting or caring or a strategy.",
 ]),
 "classification_confidence":"high",
 "source":{"name":"HSC","year":2021,"institution":"HSC","original_question_no":"29"},
})

json.dump({"course_id":schema["course_id"],"course_name":schema["course_name"],"questions":questions},
 open("spec_2021.json","w",encoding="utf-8"), ensure_ascii=False, indent=2)
print("wrote", len(questions))