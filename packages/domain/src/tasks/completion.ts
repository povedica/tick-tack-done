export type CompleteChildrenPolicy = 'ask' | 'complete' | 'leave';
export type CompleteChildrenChoice = 'complete' | 'leave';

export type ParentCompletionDecision =
  | { readonly action: 'complete_self' }
  | { readonly action: 'complete_with_children' }
  | { readonly action: 'needs_choice'; readonly activeChildCount: number };

/**
 * RF-206: completing a parent with active children asks, unless the caller or
 * the user's policy already chose to complete them or leave them.
 */
export function decideParentCompletion(input: {
  readonly activeChildCount: number;
  readonly choice: CompleteChildrenChoice | null;
  readonly policy: CompleteChildrenPolicy;
}): ParentCompletionDecision {
  if (input.activeChildCount <= 0) {
    return { action: 'complete_self' };
  }
  const choice = input.choice ?? (input.policy === 'ask' ? null : input.policy);
  if (choice === null) {
    return { action: 'needs_choice', activeChildCount: input.activeChildCount };
  }
  if (choice === 'complete') {
    return { action: 'complete_with_children' };
  }
  return { action: 'complete_self' };
}
