### Task 1: Extend Data Model - Schema, Types, Migrations

**Files:**
- Modify: `frontend/src/lib/db/schema.ts` - Add stimulus table, link table, update migrations
- Modify: `frontend/src/api/types.ts` - Add Stimulus types
- Modify: `frontend/src/lib/db/sqlite.ts` - Handle schema version bump if needed

**Interfaces:**
- Consumes: Existing schema structure
- Produces: Stimulus table, question_stimulus link table, Stimulus/StimulusWithContent types

- [ ] **Step 1: Write the failing test conceptually**

Review existing tests if any; add schema validation expectations. No new test files needed if following existing patterns.

- [ ] **Step 2: Update schema.ts**

Add stimulus table and linking table. Add migration for schema changes.

```sql
CREATE TABLE IF NOT EXISTS stimulus (
  stimulus_id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES course(course_id) ON DELETE CASCADE,
  title TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stimulus_block (
  block_id TEXT PRIMARY KEY,
  stimulus_id TEXT NOT NULL REFERENCES stimulus(stimulus_id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  block_type TEXT NOT NULL,
  content_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stimulus_block_stim ON stimulus_block(stimulus_id, position);

CREATE TABLE IF NOT EXISTS question_stimulus (
  question_id TEXT NOT NULL REFERENCES question(question_id) ON DELETE CASCADE,
  stimulus_id TEXT NOT NULL REFERENCES stimulus(stimulus_id) ON DELETE CASCADE,
  PRIMARY KEY (question_id, stimulus_id)
);
CREATE INDEX IF NOT EXISTS idx_qs_stim ON question_stimulus(stimulus_id);
CREATE INDEX IF NOT EXISTS idx_qs_q ON question_stimulus(question_id);
```

- [ ] **Step 3: Add migration**

Add migration in MIGRATIONS array (schema version may need bumping; check current SCHEMA_VERSION).

- [ ] **Step 4: Update types.ts**

Add Stimulus, StimulusBlock, StimulusWithContent types.

```ts
export interface StimulusBlock {
  block_id: string;
  position: number;
  block_type: BlockType;
  content: Record<string, any>;
}

export interface Stimulus {
  stimulus_id: string;
  course_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface StimulusWithContent extends Stimulus {
  blocks: StimulusBlock[];
}
```

- [ ] **Step 5: Verify schema loads**

Run dev server/typecheck to confirm no syntax errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/db/schema.ts frontend/src/api/types.ts
git commit -m "feat: add stimulus schema and types"
```

---
