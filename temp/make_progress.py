import glob
import os
import re
from collections import defaultdict

groups = defaultdict(list)
for path in glob.glob("temp/llm/*.task.json") + glob.glob("temp/llm/*.part*.json"):
    name = os.path.basename(path)
    course = re.sub(r"\.(task|part\d+)\.json$", "", name)
    groups[course].append(name)

lines = ["# LLM classification progress", "", "| course | files | status |", "|---|---|---|"]
for course in sorted(groups):
    status = "running" if course == "biology" else "pending"
    lines.append(f"| {course} | {', '.join(sorted(groups[course]))} | {status} |")
open("temp/llm/progress.md", "w", encoding="utf-8").write("\n".join(lines) + "\n")
print(len(groups), "courses")
