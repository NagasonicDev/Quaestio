# SDD ledger — plan: C:\Users\adamq\.opencode\plan\stimulus-side-menu.md
Task 1: complete (commits BASE:ef8094c..HEAD:ef8094c, review clean)\nTask 2: complete (commits BASE:ef8094c..HEAD:ef8094c, review clean)\nTask 3: complete (commits BASE:ef8094c..HEAD:221ec09, review clean)\nTask 4: complete (commits BASE:ef8094c..HEAD:c70e890, review clean)\nRuling: earlier task reports verified with 	sc --noEmit, which is a no-op in this solution-style tsconfig; real check is 	sc -b. Task 5 fixed the resulting type errors in types.ts, data.ts, StimulusEditor.tsx — cost if wrong: none, build now passes.
Ruling: unwound commits 221ec09 and c70e890 via git reset --soft ef8094c so all stimulus work accumulates into one final commit per git-commit-style skill — cost if wrong: commit hashes in earlier ledger lines are stale, work is intact in tree.
Task 6: complete (review clean, no commits)
Task 7: complete (review clean, no commits)
Task 8: complete (review clean, no commits)
Task 9: complete (review clean, no commits)
Final: Ruling: QuestionEditor save logic only adds links, never unlinks removed stimuli - sync-on-save missing; immediate unlink API calls partially mitigate but leave divergence possible. Fix: compute toAdd/toRemove vs existing DB links - cost if wrong: stale links persist.
Final: Ruling: No index on stimulus.course_id; listStimuliForCourse will full-table scan as course grows. Fix: add idx_stimulus_course. - cost if wrong: degraded query performance.
