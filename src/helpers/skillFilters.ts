import { AgentBrowserIdentifier } from '@lobechat/builtin-skills';
import { isDesktop } from '@lobechat/const';
import { type BuiltinSkill } from '@lobechat/types';

export interface BuiltinSkillFilterContext {
  /**
   * Whether the current run can execute commands on a local device. Server-side
   * callers must derive this from the run's execution plan (`activeDeviceId`
   * presence) — the compile-time `isDesktop` constant is always false there.
   */
  canExecuteOnDevice: boolean;
}

const DEVICE_ONLY_BUILTIN_SKILLS = new Set([AgentBrowserIdentifier]);
// Hide market/store/onboarding builtins from end-user skill pickers (closed product)
const USER_HIDDEN_BUILTIN_SKILLS = new Set([
  'task',
  'lobe-skill-store',
  'lobe-activator',
  'lobe-web-onboarding',
  'lobe-agent',
  'group-agent-builder',
  'agent-builder',
  // 记忆工具：商业化默认不向用户暴露（依赖 embedding 管线）
  'lobe-user-memory',
]);

// Client default: the desktop app is itself the execution device.
const DEFAULT_CONTEXT: BuiltinSkillFilterContext = {
  canExecuteOnDevice: isDesktop,
};

const resolveBuiltinSkillFilterContext = (
  context: BuiltinSkillFilterContext = DEFAULT_CONTEXT,
): BuiltinSkillFilterContext => ({
  canExecuteOnDevice: context.canExecuteOnDevice ?? DEFAULT_CONTEXT.canExecuteOnDevice,
});

export const shouldEnableBuiltinSkill = (
  skillId: string,
  context: BuiltinSkillFilterContext = DEFAULT_CONTEXT,
): boolean => {
  const resolvedContext = resolveBuiltinSkillFilterContext(context);

  if (USER_HIDDEN_BUILTIN_SKILLS.has(skillId)) return false;

  if (DEVICE_ONLY_BUILTIN_SKILLS.has(skillId)) return resolvedContext.canExecuteOnDevice;

  return true;
};

export const filterBuiltinSkills = (
  skills: BuiltinSkill[],
  context: BuiltinSkillFilterContext = DEFAULT_CONTEXT,
): BuiltinSkill[] => {
  return skills.filter((skill) => shouldEnableBuiltinSkill(skill.identifier, context));
};

export { USER_HIDDEN_BUILTIN_SKILLS };
