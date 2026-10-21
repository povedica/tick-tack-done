import { useFeatures } from '../settings/feature-flags';
import { useTickyFlags } from './useTickyFlags';

/** User preference ∧ server UI flag ∧ not kill-switched (TTD-AUD-63). */
export function useTickyAvailable(): {
  readonly available: boolean;
  readonly userEnabled: boolean;
  readonly serverOk: boolean;
  readonly serverDisabled: boolean;
  readonly kill: boolean;
  readonly isLoading: boolean;
} {
  const userEnabled = useFeatures((state) => state.flags.ticky);
  const server = useTickyFlags();
  const serverOk = server.isSuccess && server.data.ui && !server.data.kill;
  return {
    available: userEnabled && serverOk,
    userEnabled,
    serverOk,
    serverDisabled: server.isSuccess && !server.data.ui,
    kill: server.isSuccess && server.data.kill,
    isLoading: server.isPending,
  };
}
