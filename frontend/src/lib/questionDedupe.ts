/**
 * Removes copies left behind by repeated imports: consecutive identical body
 * blocks (including a repeated run such as [A,B,A,B]) and identical MCQ
 * options. Applied to every imported bundle and to questions as a test is
 * generated, so duplicates already in the database never reach paper.
 *
 * Option de-duplication never leaves fewer than three choices. When options
 * collapse below that the question came from a flattened table, not a
 * duplicated import; deleting would leave a two-choice question and hide the
 * source defect, so it is left unchanged.
 */
type Block = { block_type?: string; content?: unknown };
type Option = { content?: Block[]; is_correct?: boolean };
type QuestionLike = { body?: Block[]; parts?: QuestionLike[]; mcq_options?: Option[] };

function blockKey(block: Block): string {
  return JSON.stringify([block?.block_type ?? "", block?.content ?? {}]);
}

/** Collapse adjacent duplicate blocks and immediately repeated runs. */
export function dedupeBlocks<T extends Block>(blocks: T[] | undefined): T[] | undefined {
  if (!Array.isArray(blocks) || blocks.length < 2) return blocks;
  const out = [...blocks];
  let removed = 0;
  for (let i = 0; i + 1 < out.length; ) {
    let matched = 0;
    for (let run = Math.floor((out.length - i) / 2); run >= 1; run--) {
      let same = true;
      for (let k = 0; k < run; k++) {
        if (blockKey(out[i + k]) !== blockKey(out[i + run + k])) {
          same = false;
          break;
        }
      }
      if (same) {
        matched = run;
        break;
      }
    }
    if (matched) {
      out.splice(i + matched, matched);
      removed += matched;
    } else {
      i++;
    }
  }
  if (!removed) return blocks;
  return out.map((block, position) => ({ ...block, position })) as T[];
}

/** Drop identical options, keeping the first and its position in the order. */
export function dedupeOptions<T extends Option>(options: T[] | undefined): T[] | undefined {
  if (!Array.isArray(options) || options.length < 2) return options;
  const kept: T[] = [];
  const indexByKey = new Map<string, number>();
  let removed = 0;
  for (const option of options) {
    const key = JSON.stringify((option.content ?? []).map(blockKey));
    const existing = indexByKey.get(key);
    if (existing === undefined) {
      indexByKey.set(key, kept.length);
      kept.push({ ...option });
    } else {
      removed++;
      if (option.is_correct) kept[existing] = { ...kept[existing], is_correct: true };
    }
  }
  if (!removed || kept.length < 3) return options;
  return kept.map((option, position) => ({ ...option, position }));
}

/** Recursively clean one question tree without mutating the original. */
export function dedupeQuestion<T extends QuestionLike>(question: T): T {
  if (!question || typeof question !== "object") return question;
  const body = dedupeBlocks(question.body);
  const mcq_options = dedupeOptions(question.mcq_options);
  const parts = Array.isArray(question.parts)
    ? question.parts.map((part) => dedupeQuestion(part))
    : question.parts;
  if (body === question.body && mcq_options === question.mcq_options && parts === question.parts) {
    return question;
  }
  return { ...question, body, mcq_options, parts } as T;
}
