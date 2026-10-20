export interface TickyFlags {
  readonly ui: boolean;
  readonly read: boolean;
  readonly model: boolean;
  readonly execution: boolean;
  readonly routines: boolean;
  readonly telegram: boolean;
  readonly kill: boolean;
}

function enabled(name: string): boolean {
  return process.env[name] === 'true';
}

/** Every effect defaults off. A kill switch overrides the rest. */
export function tickyFlags(): TickyFlags {
  const kill = enabled('TICKY_KILL_SWITCH');
  return {
    ui: enabled('TICKY_UI_ENABLED') && !kill,
    read: enabled('TICKY_READ_ENABLED') && !kill,
    model: enabled('TICKY_MODEL_ENABLED') && !kill,
    execution: enabled('TICKY_EXECUTION_ENABLED') && !kill,
    routines: enabled('TICKY_ROUTINES_ENABLED') && !kill,
    telegram: enabled('TICKY_TELEGRAM_ENABLED') && !kill,
    kill,
  };
}
