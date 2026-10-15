### Task 3: Stimulus Editor/Manager UI

**Files:**
- Create: `frontend/src/components/StimulusEditor.tsx` - Editor for stimulus blocks
- Create: `frontend/src/components/StimulusManager.tsx` - Manage stimuli in a course
- Modify: `frontend/src/components/QuestionEditor.tsx` - Allow attaching/linking stimuli to questions

**Interfaces:**
- Consumes: Stimulus types, BlockEditor patterns
- Produces: UI for managing stimulus

- [ ] **Step 1: Create StimulusEditor component**

Similar to BlockEditor but for stimulus. Reuse BlockEditor for block editing.

- [ ] **Step 2: Create StimulusManager component**

List existing stimuli, create new, edit, delete. Modal or panel.

- [ ] **Step 3: Update QuestionEditor**

Add UI to link existing stimulus to question (dropdown/search) or create new stimulus. Store linkages.

- [ ] **Step 4: Test in question editor**

Create/edit question with stimulus attached.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/StimulusEditor.tsx frontend/src/components/StimulusManager.tsx frontend/src/components/QuestionEditor.tsx
git commit -m "feat: add stimulus management and question linking UI"
```

---
