export interface MachineProjectFields {
  input: string;
  blankSymbol: string;
  initialState: string;
  acceptStates: string;
  rejectStates: string;
  haltStates: string;
  rules: string;
}

export function machineProjectKey(project: MachineProjectFields): string {
  return JSON.stringify([
    project.input,
    project.blankSymbol,
    project.initialState,
    project.acceptStates,
    project.rejectStates,
    project.haltStates,
    project.rules,
  ]);
}

export function shouldApplyCurrentDraft(
  machineExists: boolean,
  appliedKey: string | null,
  currentKey: string,
): boolean {
  return !machineExists || appliedKey !== currentKey;
}
