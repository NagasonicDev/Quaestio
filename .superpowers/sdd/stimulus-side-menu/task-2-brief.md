### Task 2: Data Layer - CRUD Operations for Stimulus

**Files:**
- Modify: `frontend/src/lib/data.ts` - Add functions to create/read/update/delete stimulus, link/unlink to questions
- Modify: `frontend/src/api/client.ts` - Expose stimulus API methods

**Interfaces:**
- Consumes: Stimulus types, schema tables
- Produces: Functions to manage stimulus

- [ ] **Step 1: Add stimulus operations in data.ts**

Add functions: createStimulus, updateStimulus, deleteStimulus, getStimulus, listStimuliForCourse, getStimuliForQuestion, linkStimulusToQuestion, unlinkStimulusFromQuestion

- [ ] **Step 2: Add API methods in client.ts**

Expose stimulus operations through api object.

- [ ] **Step 3: Test basic CRUD**

Manual check via editor - create/read/delete stimulus.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/data.ts frontend/src/api/client.ts
git commit -m "feat: add stimulus CRUD operations"
```

---
