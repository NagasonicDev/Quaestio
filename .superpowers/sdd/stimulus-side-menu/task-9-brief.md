Task 9: Export/Import Support

**Files:**
- Modify: `frontend/src/lib/exchange.ts` - Include stimulus in course export/import

**Interfaces:**
- Consumes: Stimulus data
- Produces: Stimulus included in .qb exports

- [ ] **Step 1: Add stimulus to export**

Include stimuli and question_stimulus links in exported course data.

- [ ] **Step 2: Add stimulus to import**

Restore stimuli on import, handling ID conflicts? Follow existing pattern for assets/questions.

- [ ] **Step 3: Test round-trip**

Export course with stimulus, import to new course - verify stimulus preserved.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/exchange.ts
git commit -m "feat: include stimulus in course export/import"
```

---
