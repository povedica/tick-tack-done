import { useQueryClient } from '@tanstack/react-query';
import { BriefcaseBusiness } from 'lucide-react';
import { api } from '../../api';
import { runAction } from '../../components/run-action';
import { useAppLocale } from '../../i18n/locale';
import { refreshTaskSurfaces } from '../tasks/refresh';
import { outsideHoursLine, workCopy } from './work-text';
import './work-hours.css';
import { useQuery } from '@tanstack/react-query';

export function WorkHoursLine() {
  const locale = useAppLocale();
  const copy = workCopy(locale);
  const queryClient = useQueryClient();
  const context = useQuery({ queryKey: ['work-context'], queryFn: () => api.getWorkContext() });
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const data = context.data;
  if (data === undefined || !data.hide_work_outside_hours || data.is_work_time_now) {
    return null;
  }
  const hidden = data.work_hidden_now;
  const timeZone = me.data?.time_zone ?? 'Europe/Madrid';
  return (
    <p className="work-hours-line">
      <span>{outsideHoursLine(new Date(), timeZone, locale)}</span>
      <button
        type="button"
        className="work-hours-toggle"
        onClick={() => {
          runAction(
            api.updateWorkContext({ show_work: hidden }).then(async () => {
              await queryClient.invalidateQueries({ queryKey: ['work-context'] });
              await queryClient.invalidateQueries({ queryKey: ['me'] });
              await refreshTaskSurfaces(queryClient);
            }),
          );
        }}
      >
        <BriefcaseBusiness size={16} aria-hidden="true" />
        {hidden ? copy.showWork : copy.hideWork}
      </button>
    </p>
  );
}
