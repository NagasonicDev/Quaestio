### Task 4: Stimulus Side Menu Component

**Files:**
- Create: `frontend/src/components/StimulusSideMenu.tsx` - Side drawer showing stimulus content
- Modify: `frontend/src/components/QuestionReader.tsx` or create shared rendering - Reuse BlockList

**Interfaces:**
- Consumes: StimulusWithContent, BlockList
- Produces: Side menu UI component

- [ ] **Step 1: Create StimulusSideMenu component**

Side panel/drawer that slides in. Should be scrollable. Use existing UI patterns (shadcn/ui Sheet or custom). Include close button, title if present.

- [ ] **Step 2: Reuse BlockList rendering**

Render stimulus blocks same as question body - ensure all block types work (text, equations, images, tables, etc.)

- [ ] **Step 3: Make responsive**

Works on mobile - overlay or slide from side. Keyboard accessible (Esc to close, focus trap).

- [ ] **Step 4: Style consistently**

Match existing design system.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/StimulusSideMenu.tsx
git commit -m "feat: add stimulus side menu component"
```

---
