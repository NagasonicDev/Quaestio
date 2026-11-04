export interface StimulusLink {
  question_id?: string;
  stimulus_id?: string;
}

/**
 * Map authored question/stimulus ids onto their imported ids, dropping links
 * whose ids were not imported and collapsing duplicate pairs.
 */
export function resolveStimulusLinks(
  links: StimulusLink[] | undefined,
  questionMap: Map<string, string>,
  stimulusMap: Map<string, string>
): { links: Array<[string, string]>; skipped: number } {
  const resolved: Array<[string, string]> = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const link of Array.isArray(links) ? links : []) {
    const authoredQuestion = String(link?.question_id ?? "").trim();
    const authoredStimulus = String(link?.stimulus_id ?? "").trim();
    const questionId = authoredQuestion ? questionMap.get(authoredQuestion) : undefined;
    const stimulusId = authoredStimulus ? stimulusMap.get(authoredStimulus) : undefined;
    if (!questionId || !stimulusId) {
      skipped++;
      continue;
    }
    const key = `${questionId}\u0000${stimulusId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push([questionId, stimulusId]);
  }
  return { links: resolved, skipped };
}
