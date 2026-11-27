export interface LifeExpression { id: number; value?: number; defaultValue?: number; op?: "AND" | "OR" | "NOT"; args?: LifeExpression[]; delayId?: string }
export interface LifeCircuit { inputs: Array<{ label: string; value: number; expression: LifeExpression }>; outputs: Array<{ label: string; expression: LifeExpression; delayId?: string; initialValue?: number }>; registers: LifeExpression[] }
export function build(circuit: LifeCircuit): {
  cells: Array<[number, number]>; period: number; generation: number;
  registerPorts: Array<{ id: string; x: number; y: number }>;
};
