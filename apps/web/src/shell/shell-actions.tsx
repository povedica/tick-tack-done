import { createContext, useContext, type ReactNode } from 'react';

interface ShellActions {
  readonly toggleNav: () => void;
  readonly navLabel: string;
  readonly navExpanded: boolean;
}

const ShellActionsContext = createContext<ShellActions | null>(null);

export function ShellActionsProvider({
  value,
  children,
}: {
  readonly value: ShellActions;
  readonly children: ReactNode;
}) {
  return <ShellActionsContext.Provider value={value}>{children}</ShellActionsContext.Provider>;
}

export function useShellActions(): ShellActions {
  const value = useContext(ShellActionsContext);
  if (value === null) {
    return { toggleNav: () => undefined, navLabel: '', navExpanded: false };
  }
  return value;
}
