import sys, json
sys.path.insert(0, r"D:/quaestio/.opencode/skills/community-and-family-studies-question-import/scripts")
from qbx_lib import *

SKILL=r"D:/quaestio/.opencode/skills/community-and-family-studies-question-import"
schema=json.load(open(SKILL+"/import-schema.json",encoding="utf-8"))

def NODE(code):
    # return code,path using schema via NodeIndex
    return None

ni=NodeIndex(schema)

def cls(codes):
    return {
        "node_codes": codes,
        "node_names": [ni.code_to_path[c] for c in codes],
        "node_ids": [ni.code_to_id[c] for c in codes],
    }

questions=[]

# Q23 Harry
questions.append({
  "type_key":"extended_response",
  "difficulty":4,
  "marks":6,
  **cls(["HSC-M3-T1-D9","HSC-M3-T1-D65"]),
  "tags":["case_study"],
  "body":[text("Harry is a 17-year-old boy who has recently taken on the role of primary carer for his mother. She has become unable to care for herself due to an advancing physical disability. Recommend strategies that could assist Harry in being an effective carer for his mother while also maintaining commitments in his own life.")],
  "hint":[],
  "answer":[text("Sample answer: Harry could engage formal support services (for example an at-home care service or community nurse) so his mother's needs are met, investigate distance/online schooling options, and use informal supports so he can maintain his education and work commitments.")],
  "solution":[],
  "marking_criteria": criteria([
    "6 marks: demonstrates thorough knowledge and understanding of strategies that could assist in being an effective carer; provides a clear link between being an effective carer and maintaining personal commitments; provides relevant examples.",
    "4-5 marks: demonstrates clear understanding of strategies that could assist in being an effective carer; provides a link between being an effective carer and maintaining personal commitments; provides relevant example(s).",
    "2-3 marks: provides some information about strategies that could assist in being an effective carer; provides example(s).",
    "1 mark: provides some relevant information.",
  ]),
  "classification_confidence":"high",
  "source":{"name":"HSC","year":2020,"institution":"HSC","original_question_no":"23"},
})

# Q26 image parenting
questions.append({
  "type_key":"extended_response",
  "difficulty":5,
  "marks":6,
  **cls(["HSC-M3-T1-D4","HSC-M3-T1-D13"]),
  "tags":["case_study","action_required"],
  "body":[text("To what extent does this image reflect changing roles of parenting? (Image: 'Stay at home dad with a baby in a sling, vacuuming and waving goodbye to his wife, who is going to work'.) The image could not be reproduced in this bundle; answer in relation to the described image.")],
  "hint":[],
  "answer":[text("Sample answer: Parenting roles today have changed from the traditional breadwinner father and carer mother; the image of a stay-at-home father vacuuming and caring for a baby while his wife goes to work challenges traditional roles.")],
  "solution":[],
  "marking_criteria": criteria([
    "6 marks: demonstrates extensive knowledge and understanding of the changing roles of parents; provides a supported judgement of how the image represents the changing roles of parents; provides relevant examples.",
    "4-5 marks: demonstrates thorough knowledge and understanding of the changing roles of parents; attempts to provide a judgement of how the image represents the changing roles of parents; provides relevant example(s).",
    "2-3 marks: provides sound information about the roles of parents; provides an example(s).",
    "1 mark: provides some relevant information.",
  ]),
  "classification_confidence":"high",
  "source":{"name":"HSC","year":2020,"institution":"HSC","original_question_no":"26"},
})

spec={"course_id":schema["course_id"],"course_name":schema["course_name"],"questions":questions}
json.dump(spec, open("spec_2020.json","w",encoding="utf-8"), ensure_ascii=False, indent=2)
print("wrote spec_2020.json with", len(questions))