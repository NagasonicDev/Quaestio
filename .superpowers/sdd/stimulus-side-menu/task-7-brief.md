Task 7: Include Stimulus in Test Generation

**Files:**
- Modify: `frontend/src/lib/data.ts` - Include stimulus in test generation selection/hydration
- Modify: `frontend/src/lib/docx.ts` - Render stimulus in DOCX output
- Modify: `frontend/src/lib/pdf.ts` - Render stimulus in PDF output
- Modify: `frontend/src/lib/tests.ts` - Pass stimulus data

**Interfaces:**
- Consumes: Stimuli linked to selected questions
- Produces: Stimulus sections in generated tests

- [ ] **Step 1: Collect stimulus for generated test**

When generating test, gather all unique stimuli referenced by selected questions (deduplicate). Attach to test data structure.

- [ ] **Step 2: Update test generation to include stimulus**

In generateTest, hydrate questions with their stimuli. Consider adding stimulus section at end or before questions? User requested "at the end of the test is a stimulus section".

- [ ] **Step 3: Render stimulus in DOCX**

Add section "Stimulus Material" or similar, render each stimulus with its blocks, label them (Stimulus 1, etc.), and reference which questions use them.

- [ ] **Step 4: Render stimulus in PDF**

Same as DOCX - consistent formatting.

- [ ] **Step 5: Test test generation**

Generate test with questions that share stimulus - verify appears once in stimulus section and referenced correctly.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/data.ts frontend/src/lib/docx.ts frontend/src/lib/pdf.ts frontend/src/lib/tests.ts
git commit -m "feat: include stimulus in generated tests"
```

---
