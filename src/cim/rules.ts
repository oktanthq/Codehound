export const RULE_NAME = /^(validate|assert|ensure|check|guard)/i;

export function isRuleName(name: string): boolean {
  return RULE_NAME.test(name);
}
