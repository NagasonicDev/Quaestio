### Task 5: Integrate Stimulus into Practice Flow

**Files:**
- Modify: `frontend/src/components/PracticeFlow.tsx` - Add stimulus button and side menu
- Modify: `frontend/src/pages/Practice.tsx` - Load stimuli for current question

**Interfaces:**
- Consumes: Stimuli for question, StimulusSideMenu
- Produces: Stimulus toggle in practice UI

- [ ] **Step 1: Load stimuli in Practice.tsx**

Fetch stimuli linked to current question when question loads.

- [ ] **Step 2: Add stimulus button in PracticeFlow**

Button to open side menu (e.g., "View stimulus" or icon). Show only if question has stimuli.

- [ ] **Step 3: Render StimulusSideMenu**

Open side menu showing stimulus content. Can show multiple stimuli if linked (list or tabs).

- [ ] **Step 4: Test practice with stimulus**

Verify side menu opens/closes, content renders, doesn't interfere with answering.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PracticeFlow.tsx frontend/src/pages/Practice.tsx
git commit -m "feat: integrate stimulus into practice flow"
```

---
