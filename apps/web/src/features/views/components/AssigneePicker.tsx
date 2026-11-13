import { useQueries, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../../api';
import { useMessages } from '../../../i18n';
import { useAppLocale } from '../../../i18n/locale';
import { viewsApi } from '../api';
import { assigneeMessages } from '../assignee-messages';
import { MultiPicker, type PickerChoice } from './MultiPicker';

interface Person {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

/** Membership ids differ between lists; assignee rules store the user id. */
export function peopleFromMembers(responses: readonly unknown[]): Person[] {
  const people = new Map<string, Person>();
  for (const response of responses) {
    if (
      typeof response !== 'object' ||
      response === null ||
      !('items' in response) ||
      !Array.isArray(response.items)
    )
      continue;
    for (const row of response.items as unknown[]) {
      if (
        typeof row !== 'object' ||
        row === null ||
        !('user_id' in row) ||
        typeof row.user_id !== 'string' ||
        row.user_id.length === 0 ||
        !('status' in row) ||
        row.status !== 'accepted'
      )
        continue;
      const email = 'email' in row && typeof row.email === 'string' ? row.email : '';
      const name =
        'display_name' in row && typeof row.display_name === 'string'
          ? row.display_name.trim()
          : '';
      const person = { id: row.user_id, name: name || email, email };
      const previous = people.get(person.id);
      people.set(
        person.id,
        previous === undefined
          ? person
          : {
              id: person.id,
              name: previous.name || person.name,
              email: previous.email || person.email,
            },
      );
    }
  }
  return [...people.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
}

export function AssigneePicker({
  value,
  label,
  invalid,
  describedBy,
  onChange,
}: {
  readonly value: string;
  readonly label: string;
  readonly invalid: boolean;
  readonly describedBy: string | undefined;
  readonly onChange: (id: string) => void;
}) {
  const messages = useMessages();
  const locale = useAppLocale();
  const text = assigneeMessages[locale.toLowerCase().startsWith('en') ? 'en' : 'es'];
  const [open, setOpen] = useState(false);
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api.getMe(),
    enabled: open,
    staleTime: 60_000,
    retry: false,
  });
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => viewsApi.listProjects(),
    enabled: open,
    staleTime: 60_000,
    retry: false,
  });
  const shared = (projects.data?.items ?? [])
    .filter((project) => project.shared)
    .map((project) => project.id)
    .sort();
  const members = useQueries({
    queries: shared.map((id) => ({
      queryKey: ['members', id],
      queryFn: () => api.listMembers(id),
      enabled: open && projects.isSuccess,
      staleTime: 60_000,
      retry: false,
    })),
  });
  const failed = me.isError || projects.isError || members.some((query) => query.isError);
  const loading = me.isPending || projects.isPending || members.some((query) => query.isPending);
  const resolved = !failed && !loading;
  const people = peopleFromMembers(members.map((query) => query.data));
  const choices: PickerChoice[] =
    me.data === undefined
      ? []
      : [
          {
            id: me.data.id,
            label: text.me,
            detail: me.data.email,
            section: '',
            sectionOrder: -1,
          },
        ];
  choices.push(
    ...people
      .filter((person) => person.id !== me.data?.id)
      .map((person) => ({
        id: person.id,
        label: person.name || text.unavailable,
        detail: person.email,
        section: '',
        sectionOrder: 0,
      })),
  );
  const unavailable = value.length > 0 && !choices.some((choice) => choice.id === value);
  if (unavailable)
    choices.push({
      id: value,
      label: resolved ? text.unavailable : text.selected,
      section: '',
      sectionOrder: 1,
      unavailable: true,
    });

  function retry(): void {
    if (me.isError) me.refetch().catch(() => undefined);
    if (projects.isError) projects.refetch().catch(() => undefined);
    for (const query of members) if (query.isError) query.refetch().catch(() => undefined);
  }

  return (
    <div className="filter-assignee">
      <MultiPicker
        single
        label={label}
        placeholder={text.choose}
        searchLabel={messages.filterSearch}
        doneLabel={messages.filterPickerDone}
        clearLabel={messages.filterPickerClear}
        selectedLabel={messages.filterPickerSelected}
        selectedOneLabel={messages.filterPickerOne}
        removeLabel={messages.filterRemoveValue}
        choices={choices}
        selected={value.length > 0 ? [value] : []}
        invalid={invalid}
        describedBy={describedBy}
        onOpenChange={setOpen}
        onChange={(ids) => {
          onChange(ids[0] ?? '');
        }}
        status={
          failed ? (
            <p className="filter-person-status" role="alert">
              {text.error}{' '}
              <button type="button" className="filter-person-retry" onClick={retry}>
                {text.retry}
              </button>
            </p>
          ) : loading ? (
            <p className="filter-person-status" role="status">
              {text.loading}
            </p>
          ) : shared.length === 0 ? (
            <p className="filter-person-status" role="status">
              {text.empty}
            </p>
          ) : null
        }
      />
      {resolved && unavailable ? (
        <p className="filter-person-warning" role="status">
          {text.unavailable}
        </p>
      ) : null}
    </div>
  );
}
