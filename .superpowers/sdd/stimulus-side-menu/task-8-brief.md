Task 8: Update Question Display for Parts

**Files:**
- Modify: `frontend/src/components/QuestionReader.tsx` - Handle parts that might need stimulus? Check if parts can have their own stimulus

**Interfaces:**
- Consumes: Existing question structure
- Produces: Ensure stimulus works with multi-part questions

- [ ] **Step 1: Check if parts need stimulus**

Review types - question has parts array. Does stimulus belong to parent or can parts have stimulus? Current design: link stimulus to question (parent). Parts inherit context.

- [ ] **Step 2: Ensure UI shows stimulus for questions with parts**

When viewing question with parts, stimulus is still accessible.

- [ ] **Step 3: Update if needed**

Minimal changes if required.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/QuestionReader.tsx
git commit -m "feat: ensure stimulus works with multi-part questions"
```

---
