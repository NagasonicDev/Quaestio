Task 10: Testing and Verification

**Files:**
- Any files needing fixes from testing

**Interfaces:**
- Consumes: All changes
- Produces: Verified working feature

- [ ] **Step 1: Run typecheck**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 2: Run dev server and manual testing**

Test all flows: create stimulus, link to question, view in practice, view in quiz, generate test.

- [ ] **Step 3: Test with images/assets**

Upload image in stimulus, verify renders in side menu and in generated test.

- [ ] **Step 4: Test equations/tables**

Verify math and tables render correctly.

- [ ] **Step 5: Test reuse**

Link same stimulus to multiple questions - appears once in test generation.

- [ ] **Step 6: Run any existing tests**

```bash
cd frontend && npm test
```

- [ ] **Step 7: Commit fixes if any**

Only if issues found and fixed.

---
