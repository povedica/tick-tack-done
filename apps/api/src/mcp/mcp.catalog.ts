import { planningTools } from './tools/planning-tools.js';
import { missingScopes } from '../auth/scopes.js';

export interface McpTool {
  readonly name: string;
  readonly description: string;
  readonly scopes: readonly string[];
  readonly inputSchema: {
    readonly type: 'object';
    readonly properties: Readonly<Record<string, unknown>>;
    readonly required?: readonly string[];
    readonly additionalProperties: false;
  };
}

const objectSchema = (
  properties: Readonly<Record<string, unknown>>,
  required?: readonly string[],
): McpTool['inputSchema'] => ({
  type: 'object',
  properties,
  ...(required === undefined ? {} : { required }),
  additionalProperties: false,
});

const id = { type: 'string', format: 'uuid' };
const limit = { type: 'integer', minimum: 1, maximum: 100 };
const cursor = { type: 'string', minLength: 1 };
const name = { type: 'string', minLength: 1 };
const tagIds = {
  type: 'array',
  items: id,
  maxItems: 50,
  description: 'Tag UUIDs to assign (replaces the whole set when used on update_task).',
};
const tagNames = {
  type: 'array',
  items: { type: 'string', minLength: 1, maxLength: 100 },
  maxItems: 50,
  description: 'Tag names to assign; missing names are created (same as quick add).',
};

const weekdayEnum = {
  type: 'string',
  enum: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'],
} as const;

/** RF-2007. Structured recurrence; the server builds an RRULE via buildRepeatRule. */
const recurrenceSchema = {
  type: 'object',
  properties: {
    freq: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly'] },
    interval: { type: 'integer', minimum: 1, maximum: 999 },
    weekdays: {
      type: 'array',
      items: weekdayEnum,
      description: 'Only with freq=weekly.',
    },
    month_day: {
      type: 'integer',
      minimum: -31,
      maximum: 31,
      description:
        'Only with freq=monthly/yearly. Positive day of month, or negative from month end (-1 = last day).',
    },
    month_week: {
      type: 'object',
      properties: {
        setpos: {
          type: 'integer',
          enum: [1, 2, 3, 4, -1],
          description: '-1 = last.',
        },
        weekday: weekdayEnum,
      },
      required: ['setpos', 'weekday'],
      additionalProperties: false,
      description: "Only with freq=monthly: last Friday of the month = {setpos:-1, weekday:'FR'}.",
    },
    until: {
      type: 'string',
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      description: 'End of the series (civil date in the task time zone).',
    },
    count: { type: 'integer', minimum: 1, description: 'End after N occurrences.' },
  },
  required: ['freq'],
  additionalProperties: false,
} as const;

const repeatFromSchema = {
  type: 'string',
  enum: ['due_date', 'completion_date'],
  description:
    "due_date (default): next from the rule grid. completion_date: from when you completed it (habits like 'water every 3 days').",
} as const;

/**
 * Single catalog of MCP tools. A tool is visible only when the caller holds
 * every scope it declares (RF-2001). Listings that return next_cursor accept
 * the same cursor string as API v1.
 */
const CATALOG: readonly McpTool[] = [
  {
    name: 'get_capture_settings',
    description:
      'Read the owned defaults applied to task captures, including MCP quick_add and create_task. Explicit task fields override these defaults.',
    scopes: ['profile:read'],
    inputSchema: objectSchema({}, []),
  },
  {
    name: 'update_capture_settings',
    description:
      'Configure owned task capture defaults. Read current settings first and submit the complete settings object. Uses PATCH /me with profile:write and owner checks.',
    scopes: ['profile:write'],
    inputSchema: objectSchema(
      {
        settings: {
          type: 'object',
          properties: {
            recognize_dates: {
              type: 'boolean',
            },
            remove_date_text: {
              type: 'boolean',
            },
            recognize_tags: {
              type: 'boolean',
            },
            remove_tag_text: {
              type: 'boolean',
            },
            parse_url_title: {
              type: 'boolean',
            },
            default_date: {
              type: 'string',
              enum: ['none', 'today', 'tomorrow'],
            },
            default_date_mode: {
              type: 'string',
              enum: ['date', 'date_time'],
            },
            default_time: {
              type: 'string',
              pattern: '^([01]\\d|2[0-3]):[0-5]\\d$',
            },
            default_duration_minutes: {
              type: ['integer', 'null'],
              minimum: 1,
              maximum: 1440,
            },
            default_priority: {
              type: 'string',
              enum: ['none', 'low', 'medium', 'high'],
            },
            default_tag_id: {
              type: ['string', 'null'],
              format: 'uuid',
            },
            default_list_id: {
              type: ['string', 'null'],
              format: 'uuid',
            },
            timed_reminder: {
              type: 'string',
              enum: ['inherit', 'none', '-PT0M', '-PT5M', '-PT15M', '-PT30M', '-PT1H', '-P1D'],
            },
            all_day_reminder: {
              type: 'string',
              enum: ['inherit', 'none', '-PT0M', '-PT5M', '-PT15M', '-PT30M', '-PT1H', '-P1D'],
            },
            new_task_position: {
              type: 'string',
              enum: ['top', 'bottom'],
            },
            overdue_position: {
              type: 'string',
              enum: ['top', 'bottom'],
            },
          },
          required: [
            'recognize_dates',
            'remove_date_text',
            'recognize_tags',
            'remove_tag_text',
            'parse_url_title',
            'default_date',
            'default_date_mode',
            'default_time',
            'default_duration_minutes',
            'default_priority',
            'default_tag_id',
            'default_list_id',
            'timed_reminder',
            'all_day_reminder',
            'new_task_position',
            'overdue_position',
          ],
          additionalProperties: false,
        },
      },
      ['settings'],
    ),
  },
  {
    name: 'api_catalog',
    description:
      'Discover every public API operation and its request schema. Filter by path or summary. Use api_request for operations without a dedicated tool.',
    scopes: [],
    inputSchema: objectSchema({
      search: { type: 'string' },
      details: { type: 'boolean' },
      limit,
      cursor,
    }),
  },
  {
    name: 'api_request',
    description:
      'Execute any public API v1 operation with the same bearer token, scopes, owner/list restrictions and validation as REST/UI. Use api_catalog first. For task syntax use quick_add/raw_text. Browser-session-only security operations still require a browser session. Binary responses are base64.',
    scopes: [],
    inputSchema: objectSchema(
      {
        method: { type: 'string', enum: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] },
        path: { type: 'string', pattern: '^/api/v1/' },
        body: { type: 'object', additionalProperties: true },
        idempotency_key: { type: 'string', maxLength: 200 },
        files: {
          type: 'array',
          maxItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['field', 'filename', 'base64'],
            properties: {
              field: { type: 'string', minLength: 1 },
              filename: { type: 'string', minLength: 1 },
              content_type: { type: 'string' },
              base64: { type: 'string', maxLength: 34952536 },
            },
          },
        },
      },
      ['method', 'path'],
    ),
  },
  {
    name: 'list_tasks',
    description:
      'List tasks. Default status is active. Pass status=completed|cancelled|archived|all to include others. Optional filters: tag_id, priority, from/to ([from,to), inclusive start and exclusive end in the user time zone); range_field=due|start|any (default any, including overlapping intervals). someday=true lists Someday; the default excludes them. Workflow columns (pending/in progress) are list board columns via column_id (TTD-AUD-53).',
    scopes: ['tasks:read'],
    inputSchema: objectSchema({
      limit,
      cursor,
      project_id: id,
      tag_id: id,
      from: {
        type: 'string',
        description: 'Inclusive lower bound. Civil dates use the user time zone.',
      },
      range_field: { type: 'string', enum: ['due', 'start', 'any'] },
      to: {
        type: 'string',
        description: 'Exclusive upper bound. Civil dates use the user time zone.',
      },
      priority: { type: 'string', enum: ['none', 'low', 'medium', 'high'] },
      someday: { type: 'boolean' },
      status: {
        type: 'string',
        enum: ['active', 'completed', 'archived', 'cancelled', 'all'],
      },
    }),
  },
  {
    name: 'get_task',
    description: 'Read one task.',
    scopes: ['tasks:read'],
    inputSchema: objectSchema({ id }, ['id']),
  },
  {
    name: 'create_task',
    description:
      "Create a task. project_id defaults to the inbox. start_date is when you plan to do it; due_date is the deadline. someday parks it out of Today; evening_only reserves it for this evening. Pass tag_ids or tags (names; missing names are created). content is the description. parse=true runs the same quick-add parser as the app on title (#tag, ^list, !priority, natural dates). To make it REPEAT, pass `recurrence` (structured) — the task needs a due_date, which anchors the series. Examples: 'cada día' = {freq:'daily'}; 'cada lunes y jueves' = {freq:'weekly', weekdays:['MO','TH']}; 'cada 19 de mes' = {freq:'monthly', month_day:19}; 'el último viernes del mes' = {freq:'monthly', month_week:{setpos:-1, weekday:'FR'}}; 'cada día laborable' = {freq:'weekly', weekdays:['MO','TU','WE','TH','FR']}. Default interval is 1; 'cada 3 días' = {freq:'daily', interval:3}. End with until (date) or count (N times). repeat_from:'completion_date' repeats from when it was completed ('regar cada 3 días desde que lo hice'). Advanced: pass a raw RRULE string as repeat_rule instead. One occurrence exists at a time; the next one appears after completing the current (see complete_task).",
    scopes: ['tasks:write'],
    inputSchema: objectSchema(
      {
        title: { type: 'string', minLength: 1, maxLength: 500 },
        project_id: id,
        parent_id: {
          ...id,
          description: 'Parent task id to create a one-level subtask (TTD-AUD-52).',
        },
        column_id: {
          ...id,
          description:
            'Board column id for workflow (pending / in progress). Prefer this over inventing workflow_state (TTD-AUD-53).',
        },
        content: {
          type: 'string',
          maxLength: 100_000,
          description: 'Task description (Markdown). Distinct from comments and sticky notes.',
        },
        tag_ids: tagIds,
        tags: tagNames,
        parse: {
          type: 'boolean',
          description:
            'If true, parse title with the quick-add parser (same as the capture box). Explicit fields win over the parse.',
        },
        due_date: {
          type: 'string',
          description:
            'YYYY-MM-DD = all-day in the task time zone; YYYY-MM-DDTHH:mm±hh:mm = timed instant.',
        },
        start_date: {
          type: 'string',
          description:
            'YYYY-MM-DD = all-day in the task time zone; YYYY-MM-DDTHH:mm±hh:mm = timed instant.',
        },
        is_all_day: { type: 'boolean' },
        duration_minutes: {
          type: ['integer', 'null'],
          minimum: 0,
          maximum: 1440,
          description:
            'Kept as given. If start_date and due_date are both set within 24h, must match their span.',
        },
        priority: { type: 'string', enum: ['none', 'low', 'medium', 'high'] },
        someday: { type: 'boolean' },
        evening_only: { type: 'boolean' },
        recurrence: recurrenceSchema,
        repeat_rule: {
          type: 'string',
          maxLength: 500,
          description:
            'Advanced raw RRULE (optionally with DTSTART/EXDATE lines). Mutually exclusive with recurrence.',
        },
        repeat_from: repeatFromSchema,
      },
      ['title'],
    ),
  },
  {
    name: 'quick_add',
    description:
      'Capture a task from natural language (same parser as the in-app capture box): #tags, ^list, !priority, dates like «mañana 09:00-09:30».',
    scopes: ['tasks:write'],
    inputSchema: objectSchema(
      {
        text: { type: 'string', minLength: 1, maxLength: 2000 },
        project_id: id,
      },
      ['text'],
    ),
  },
  {
    name: 'complete_task',
    description:
      "Mark a task complete. On a repeating task the next occurrence is created by a scheduler within ~60 s unless materialize_next=true. advance controls the next date: 'one_period' (default, one period after the current due date — an overdue task may repeat in the past) or 'next_future' (first future occurrence; skipped occurrences are gone for good). Use get_task_occurrences to preview.",
    scopes: ['tasks:write'],
    inputSchema: objectSchema(
      {
        id,
        complete_children: { type: 'string', enum: ['complete', 'leave'] },
        advance: {
          type: 'string',
          enum: ['one_period', 'next_future'],
          description: "How to pick the next due date for a repeating task. Default 'one_period'.",
        },
        materialize_next: {
          type: 'boolean',
          description:
            'If true, create the next occurrence in this same call instead of waiting for the scheduler (~60 s).',
        },
      },
      ['id'],
    ),
  },
  {
    name: 'reopen_task',
    description:
      'Reopen a completed or cancelled task (409 not_reopenable if already active). Workflow columns are separate from status — use column_id when available (TTD-AUD-53).',
    scopes: ['tasks:write'],
    inputSchema: objectSchema({ id }, ['id']),
  },
  {
    name: 'cancel_task',
    description:
      'Cancel a task (status=cancelled; hidden from lists, kept in history). Undo with reopen_task. Soft-delete is delete_task; restore with restore_task.',
    scopes: ['tasks:write'],
    inputSchema: objectSchema({ id }, ['id']),
  },
  {
    name: 'delete_task',
    description:
      'Soft-delete a task into trash (30-day retention). Requires tasks:trash. Use restore_task to bring it back.',
    scopes: ['tasks:trash'],
    inputSchema: objectSchema({ id }, ['id']),
  },
  {
    name: 'restore_task',
    description: 'Restore a soft-deleted task from trash.',
    scopes: ['tasks:trash'],
    inputSchema: objectSchema({ id }, ['id']),
  },
  {
    name: 'list_task_comments',
    description: 'List comments on a task (oldest first).',
    scopes: ['tasks:read'],
    inputSchema: objectSchema({ task_id: id }, ['task_id']),
  },
  {
    name: 'add_task_comment',
    description: 'Add a Markdown comment on a task.',
    scopes: ['tasks:write'],
    inputSchema: objectSchema(
      {
        task_id: id,
        body: { type: 'string', minLength: 1, maxLength: 100_000 },
      },
      ['task_id', 'body'],
    ),
  },
  {
    name: 'list_task_links',
    description: 'List automatic and manual task links, independent of Google Drive.',
    scopes: ['tasks:read'],
    inputSchema: objectSchema({ task_id: id }, ['task_id']),
  },
  {
    name: 'add_task_link',
    description:
      'Add a manual http/https/mailto task link. Private URLs are stored without fetching; optional public HTML title only.',
    scopes: ['tasks:write'],
    inputSchema: objectSchema(
      {
        task_id: id,
        url: { type: 'string', maxLength: 4096 },
        title: { type: 'string', maxLength: 200 },
      },
      ['task_id', 'url'],
    ),
  },
  {
    name: 'remove_task_link',
    description: 'Remove a link from its owning task.',
    scopes: ['tasks:write'],
    inputSchema: objectSchema({ task_id: id, link_id: id }, ['task_id', 'link_id']),
  },
  {
    name: 'list_task_attachments',
    description:
      'List Drive metadata including web_view_link, icon_link, source and drive_state (ok/missing/unknown). Requires Google Drive connected for uploads; files go to the connected Google Drive account; ttd stores metadata only. REST multipart streams to Drive (25 MiB/file, 50/task); direct web uploads allow 100 MiB.',
    scopes: ['tasks:read'],
    inputSchema: objectSchema({ task_id: id }, ['task_id']),
  },
  {
    name: 'upload_task_attachment',
    description:
      'Upload an attachment directly to the owner Drive without temporary disk files. Requires connected Drive; maximum 25 MiB, 50 attachments per task. MIME type is verified from bytes; HTML is rejected.',
    scopes: ['tasks:write'],
    inputSchema: objectSchema(
      {
        task_id: id,
        filename: { type: 'string', minLength: 1, maxLength: 240 },
        base64: { type: 'string' },
        content_type: { type: 'string', maxLength: 200 },
      },
      ['task_id', 'filename', 'base64'],
    ),
  },
  {
    name: 'link_drive_file',
    description:
      'Link an existing Google Picker-authorized file to a task without copying it. Requires Google Drive connected; ttd stores metadata only (50 attachments/task).',
    scopes: ['tasks:write'],
    inputSchema: objectSchema(
      { task_id: id, drive_file_id: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,200}$' } },
      ['task_id', 'drive_file_id'],
    ),
  },
  {
    name: 'remove_task_attachment',
    description:
      'Remove Drive attachment metadata. By default the file stays in Drive. trash_in_drive:true moves it to Drive trash first; an upstream failure preserves the attachment.',
    scopes: ['tasks:write'],
    inputSchema: objectSchema(
      { task_id: id, attachment_id: id, trash_in_drive: { type: 'boolean', default: false } },
      ['task_id', 'attachment_id'],
    ),
  },
  {
    name: 'move_task',
    description: 'Move a task to another list (and optionally a board column).',
    scopes: ['tasks:write'],
    inputSchema: objectSchema(
      {
        id,
        project_id: id,
        column_id: { type: ['string', 'null'], format: 'uuid' },
      },
      ['id', 'project_id'],
    ),
  },
  {
    name: 'add_checklist_item',
    description: 'Add a checklist item on a task.',
    scopes: ['tasks:write'],
    inputSchema: objectSchema(
      {
        task_id: id,
        title: { type: 'string', minLength: 1, maxLength: 500 },
      },
      ['task_id', 'title'],
    ),
  },
  {
    name: 'update_checklist_item',
    description: 'Rename a checklist item.',
    scopes: ['tasks:write'],
    inputSchema: objectSchema(
      {
        task_id: id,
        item_id: id,
        title: { type: 'string', minLength: 1, maxLength: 500 },
      },
      ['task_id', 'item_id', 'title'],
    ),
  },
  {
    name: 'complete_checklist_item',
    description: 'Mark a checklist item complete.',
    scopes: ['tasks:write'],
    inputSchema: objectSchema({ task_id: id, item_id: id }, ['task_id', 'item_id']),
  },
  {
    name: 'uncomplete_checklist_item',
    description: 'Reopen a checklist item.',
    scopes: ['tasks:write'],
    inputSchema: objectSchema({ task_id: id, item_id: id }, ['task_id', 'item_id']),
  },
  {
    name: 'list_task_reminders',
    description: 'List reminders on a task (TTD-AUD-52).',
    scopes: ['tasks:read'],
    inputSchema: objectSchema({ task_id: id }, ['task_id']),
  },
  {
    name: 'add_task_reminder',
    description:
      'Add a reminder. Relative example: type=relative, trigger=-PT15M (TRIGGER:-PT15M is also accepted; stored canonically as -PT15M) (15 minutes before due). Absolute: type=absolute, trigger=TRIGGER, absolute_at=ISO datetime.',
    scopes: ['reminders:write'],
    inputSchema: objectSchema(
      {
        task_id: id,
        trigger: { type: 'string', minLength: 1, maxLength: 200 },
        type: { type: 'string', enum: ['relative', 'absolute', 'location', 'daily_digest'] },
        absolute_at: { type: ['string', 'null'] },
        channel: {
          type: 'string',
          enum: ['push', 'email', 'both'],
          description: 'Defaults to configured push, otherwise configured email, otherwise push.',
        },
      },
      ['task_id', 'trigger', 'type'],
    ),
  },
  {
    name: 'delete_task_reminder',
    description: 'Delete a reminder from a task.',
    scopes: ['reminders:write'],
    inputSchema: objectSchema({ task_id: id, reminder_id: id }, ['task_id', 'reminder_id']),
  },
  {
    name: 'assign_task',
    description:
      'Assign or unassign a task (assignee_id=null clears). Prefer one account per person plus shared lists for authorship (TTD-AUD-57).',
    scopes: ['tasks:write'],
    inputSchema: objectSchema(
      {
        id,
        assignee_id: { type: ['string', 'null'], format: 'uuid' },
      },
      ['id', 'assignee_id'],
    ),
  },
  {
    name: 'update_task',
    description:
      'Update a task. start_date is when you plan to do it; due_date is the deadline and may be cleared without changing when. someday=true clears when and keeps the deadline. tag_ids/tags replace the set; add_tag_ids/add_tags and remove_tag_ids/remove_tags adjust it. content updates the description. column_id sets the board workflow column. parse=true parses the new title like quick add. To change repetition pass recurrence or repeat_rule (same rules as create_task). recurrence:null (or repeat_rule:null) removes the series; changing the rule does not regenerate past occurrences or the series_id unless you clear it. To change list use move_task.',
    scopes: ['tasks:write'],
    inputSchema: objectSchema(
      {
        id,
        parent_id: { type: ['string', 'null'], format: 'uuid' },
        title: { type: 'string', minLength: 1, maxLength: 500 },
        content: { type: ['string', 'null'], maxLength: 100_000 },
        column_id: { type: ['string', 'null'], format: 'uuid' },
        tag_ids: tagIds,
        tags: tagNames,
        add_tag_ids: tagIds,
        add_tags: tagNames,
        remove_tag_ids: tagIds,
        remove_tags: tagNames,
        parse: {
          type: 'boolean',
          description: 'If true, parse title with the quick-add parser. Explicit fields win.',
        },
        due_date: {
          type: ['string', 'null'],
          description:
            'YYYY-MM-DD = all-day in the task time zone; YYYY-MM-DDTHH:mm±hh:mm = timed instant; null clears.',
        },
        start_date: {
          type: ['string', 'null'],
          description:
            'YYYY-MM-DD = all-day in the task time zone; YYYY-MM-DDTHH:mm±hh:mm = timed instant; null clears.',
        },
        is_all_day: { type: 'boolean' },
        duration_minutes: {
          type: ['integer', 'null'],
          minimum: 0,
          maximum: 1440,
          description:
            'Kept as given. If start_date and due_date are both set within 24h, must match their span.',
        },
        priority: { type: 'string', enum: ['none', 'low', 'medium', 'high'] },
        someday: { type: 'boolean' },
        evening_only: { type: 'boolean' },
        recurrence: {
          type: ['object', 'null'],
          properties: recurrenceSchema.properties,
          required: ['freq'],
          additionalProperties: false,
          description: 'Structured recurrence, or null to remove the series.',
        },
        repeat_rule: {
          type: ['string', 'null'],
          maxLength: 500,
          description: 'Raw RRULE, or null to clear. Mutually exclusive with recurrence.',
        },
        repeat_from: repeatFromSchema,
      },
      ['id'],
    ),
  },
  {
    name: 'get_task_occurrences',
    description:
      'List the theoretical occurrences of a repeating task in a range. Nothing is stored: only the current occurrence exists as a row.',
    scopes: ['tasks:read'],
    inputSchema: objectSchema(
      {
        id,
        from: { type: 'string', format: 'date-time' },
        to: { type: 'string', format: 'date-time' },
      },
      ['id', 'from', 'to'],
    ),
  },
  {
    name: 'detach_occurrence',
    description:
      'Edit or skip ONE occurrence without breaking the series: it is excluded with an EXDATE and becomes (or stops being) its own task.',
    scopes: ['tasks:write'],
    inputSchema: objectSchema(
      {
        id,
        due_date: { type: 'string', format: 'date-time' },
        title: { type: 'string', minLength: 1, maxLength: 500 },
      },
      ['id', 'due_date'],
    ),
  },
  ...planningTools,
  {
    name: 'get_day_load',
    description:
      'Day load in the profile time zone. days=1..14 returns the day rail, agenda and free slots. Multi-day tasks count only their daily overlap; overdue work counts today. Evening and Someday tasks do not count.',
    scopes: ['tasks:read'],
    inputSchema: objectSchema({
      date: { type: 'string' },
      days: { type: 'integer', minimum: 1, maximum: 14 },
      time_zone: { type: 'string' },
    }),
  },
  {
    name: 'start_day_shutdown',
    description:
      'Open a shutdown session for today or yesterday. Returns what was finished and the pending queue. Nothing changes until apply_day_shutdown.',
    scopes: ['tasks:write'],
    inputSchema: objectSchema({
      local_date: { type: 'string' },
      time_zone: { type: 'string' },
    }),
  },
  {
    name: 'record_shutdown_decision',
    description:
      'Record one shutdown decision: done, plan_day, later, someday, cancel, trash, or skip. plan_day and later take target_date.',
    scopes: ['tasks:write'],
    inputSchema: objectSchema(
      {
        session_id: id,
        task_id: id,
        decision: {
          type: 'string',
          enum: ['done', 'plan_day', 'later', 'someday', 'cancel', 'trash', 'skip'],
        },
        target_date: { type: 'string' },
        evening: { type: 'boolean' },
      },
      ['session_id', 'task_id', 'decision'],
    ),
  },
  {
    name: 'apply_day_shutdown',
    description:
      'Apply a shutdown session. Same idempotency key returns the same result. A stale expected_revision returns revision_conflict.',
    scopes: ['tasks:write'],
    inputSchema: objectSchema(
      {
        session_id: id,
        expected_revision: { type: 'integer', minimum: 1 },
        idempotency_key: { type: 'string' },
      },
      ['session_id', 'expected_revision', 'idempotency_key'],
    ),
  },
  {
    name: 'discard_replan',
    description:
      'Discard an owned draft replan without changing tasks. Applied sessions cannot be discarded.',
    scopes: ['tasks:write'],
    inputSchema: objectSchema({ session_id: id }, ['session_id']),
  },
  {
    name: 'replan_day',
    description:
      'Alias of start_day_plan: review pending tasks in the same triage. Nothing changes until apply_day_plan. Record explicit actions with record_plan_decision.',
    scopes: ['tasks:write'],
    inputSchema: objectSchema({
      date: { type: 'string' },
      auto_apply: { type: 'boolean' },
      idempotency_key: { type: 'string' },
      decisions: { type: 'array' },
    }),
  },
  {
    name: 'list_projects',
    description: 'List task lists.',
    scopes: ['lists:read'],
    inputSchema: objectSchema({ limit, cursor }),
  },
  {
    name: 'create_project',
    description: 'Create a task list.',
    scopes: ['lists:write'],
    inputSchema: objectSchema({ name }, ['name']),
  },
  {
    name: 'list_tags',
    description: 'List tags.',
    scopes: ['tags:read'],
    inputSchema: objectSchema({ limit, cursor }),
  },
  {
    name: 'create_tag',
    description: 'Create a tag.',
    scopes: ['tags:write'],
    inputSchema: objectSchema({ name }, ['name']),
  },
  {
    name: 'list_filters',
    description: 'List saved filters.',
    scopes: ['filters:read'],
    inputSchema: objectSchema({ limit, cursor }),
  },
  {
    name: 'create_filter',
    description: 'Save a normal filter that matches a keyword.',
    scopes: ['filters:write'],
    inputSchema: objectSchema({ name, keyword: { type: 'string', minLength: 1 } }, [
      'name',
      'keyword',
    ]),
  },
  {
    name: 'list_smart_lists',
    description: 'List system smart lists.',
    scopes: ['filters:read'],
    inputSchema: objectSchema({}),
  },
  {
    name: 'list_smart_list_tasks',
    description: 'List tasks in one smart list.',
    scopes: ['filters:read'],
    inputSchema: objectSchema({ key: { type: 'string', minLength: 1 }, limit, cursor }, ['key']),
  },
  {
    name: 'list_habits',
    description: 'List habits.',
    scopes: ['habits:read'],
    inputSchema: objectSchema({ limit, cursor }),
  },
  {
    name: 'create_habit',
    description: 'Create a daily habit.',
    scopes: ['habits:write'],
    inputSchema: objectSchema({ name }, ['name']),
  },
  {
    name: 'check_in_habit',
    description: 'Record a habit check-in for a date.',
    scopes: ['habits:write'],
    inputSchema: objectSchema(
      { id, date: { type: 'string' }, count: { type: 'integer', minimum: 0 } },
      ['id', 'date'],
    ),
  },
  {
    name: 'list_countdowns',
    description:
      'List countdowns. days and effective_date are already calculated in the user timezone.',
    scopes: ['countdowns:read'],
    inputSchema: objectSchema({
      archived: { type: 'boolean' },
      limit,
      cursor,
      due_within_days: { type: 'integer', minimum: 0 },
    }),
  },
  {
    name: 'get_countdown',
    description: 'Read one countdown with days calculated in the user timezone.',
    scopes: ['countdowns:read'],
    inputSchema: objectSchema({ id }, ['id']),
  },
  {
    name: 'create_countdown',
    description: 'Create a countdown. Returned days are calculated in the user timezone.',
    scopes: ['countdowns:write'],
    inputSchema: objectSchema(
      {
        title: name,
        target_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        type: { type: 'string' },
        emoji: { type: 'string' },
        color: { type: 'string' },
        repeat: { type: 'string' },
        day_mode: { type: 'string' },
        reminders: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 365 } },
        notes: { type: 'string' },
        show_in_sidebar: { type: 'boolean' },
        show_in_smart_list: { type: 'boolean' },
      },
      ['title', 'target_date'],
    ),
  },
  {
    name: 'update_countdown',
    description: 'Update a countdown.',
    scopes: ['countdowns:write'],
    inputSchema: objectSchema(
      {
        id,
        title: name,
        target_date: { type: 'string' },
        pinned: { type: 'boolean' },
        archived: { type: 'boolean' },
      },
      ['id'],
    ),
  },
  {
    name: 'delete_countdown',
    description: 'Soft-delete a countdown.',
    scopes: ['countdowns:write'],
    inputSchema: objectSchema({ id }, ['id']),
  },
  {
    name: 'archive_countdown',
    description: 'Archive a countdown and stop its reminders.',
    scopes: ['countdowns:write'],
    inputSchema: objectSchema({ id }, ['id']),
  },
  {
    name: 'unarchive_countdown',
    description: 'Unarchive a countdown.',
    scopes: ['countdowns:write'],
    inputSchema: objectSchema({ id }, ['id']),
  },
  {
    name: 'search',
    description:
      'Search tasks, lists and tags. Each group is capped by limit (default 20, max 50).',
    scopes: ['tasks:read'],
    inputSchema: objectSchema({ q: { type: 'string', maxLength: 200 }, limit, cursor }, ['q']),
  },
  {
    name: 'list_notes',
    description: 'List notes.',
    scopes: ['notes:read'],
    inputSchema: objectSchema({ limit }),
  },
  {
    name: 'pin_sticky_note',
    description: 'Pin a sticky note.',
    scopes: ['notes:write'],
    inputSchema: objectSchema({ text: { type: 'string', minLength: 1, maxLength: 4000 } }, [
      'text',
    ]),
  },
  {
    name: 'dashboard_snapshot',
    description: 'Read the dashboard KPIs.',
    scopes: ['tasks:read'],
    inputSchema: objectSchema({}),
  },
  {
    name: 'start_focus',
    description: 'Start an owned focus session linked to a task. Rejects another running session.',
    scopes: ['focus:write'],
    inputSchema: objectSchema({
      task_id: id,
      type: { type: 'string', enum: ['pomodoro', 'stopwatch'] },
      minutes: { type: 'integer', minimum: 1, maximum: 180 },
    }),
  },
  ...(['pause', 'resume', 'finish', 'abort'] as const).map((action) => ({
    name: `${action}_focus`,
    description: `${action.charAt(0).toUpperCase()}${action.slice(1)} the current owned focus session, or the supplied session id.`,
    scopes: ['focus:write'],
    inputSchema: objectSchema({
      id,
      ...(action === 'finish' ? { note: { type: 'string', maxLength: 2000 } } : {}),
    }),
  })),
  {
    name: 'get_notification_settings',
    description:
      'Read the owned notification matrix, channel availability and civil quiet hours. There is no MCP tool to change account notification preferences.',
    scopes: ['profile:read'],
    inputSchema: objectSchema({}, []),
  },
  {
    name: 'send_test_notification',
    description:
      'Send a real test notification only to the authenticated owner through push, email or linked Telegram; reports precise channel errors.',
    scopes: ['profile:read'],
    inputSchema: objectSchema(
      { channel: { type: 'string', enum: ['push', 'email', 'telegram'] } },
      ['channel'],
    ),
  },
  {
    name: 'update_focus_settings',
    description:
      'Update owned Pomodoro settings, durations, auto-start, local sound, volume and daily goal.',
    scopes: ['focus:write'],
    inputSchema: objectSchema(
      {
        pomodoro_minutes: { type: 'integer', minimum: 5, maximum: 180, multipleOf: 5 },
        short_break_minutes: { type: 'integer', minimum: 1, maximum: 60 },
        long_break_minutes: { type: 'integer', minimum: 5, maximum: 90 },
        cycles_before_long_break: { type: 'integer', minimum: 1, maximum: 12 },
        auto_start_breaks: { type: 'boolean' },
        auto_start_focus: { type: 'boolean' },
        alarm_sound: { type: 'string', enum: ['none', 'bell', 'chime', 'digital'] },
        volume: { type: 'integer', minimum: 0, maximum: 100 },
        ambient_sound: { type: 'string', enum: ['none', 'tick', 'rain', 'white_noise'] },
        daily_goal: { type: 'integer', minimum: 1, maximum: 20 },
      },
      [],
    ),
  },
  {
    name: 'get_focus_state',
    description: 'Read the current owned session, focus settings and today totals.',
    scopes: ['focus:write'],
    inputSchema: objectSchema({}),
  },
  {
    name: 'review_daily',
    description: 'Propose a daily review. The tool does not apply it.',
    scopes: ['tasks:read'],
    inputSchema: objectSchema({}),
  },
  {
    name: 'list_external_calendars',
    description:
      'List read-only external calendars. Events cannot be edited. With include_available, also list Google calendars that can be added. Times elsewhere are ISO 8601 with an offset.',
    scopes: ['calendar:read'],
    inputSchema: objectSchema({ include_available: { type: 'boolean' } }),
  },
  {
    name: 'list_calendar_events',
    description:
      'List tasks and read-only external events in a range. External events cannot be edited. Times are ISO 8601 with an offset, in the user time zone when the event is all-day.',
    scopes: ['calendar:read'],
    inputSchema: objectSchema(
      {
        from: { type: 'string', format: 'date-time' },
        to: { type: 'string', format: 'date-time' },
        include_external: { type: 'boolean' },
        subscription_id: id,
      },
      ['from', 'to'],
    ),
  },
  {
    name: 'add_external_calendar',
    description:
      'Subscribe to a Google calendar or an iCal URL and run the initial read-only sync. External events cannot be edited.',
    scopes: ['calendar:write'],
    inputSchema: objectSchema(
      {
        provider: { type: 'string', enum: ['google', 'ical'] },
        calendar_id: { type: 'string', minLength: 1, maxLength: 1024 },
        url: { type: 'string', minLength: 1, maxLength: 2000 },
        color: { type: 'string' },
        visible: { type: 'boolean' },
      },
      ['provider'],
    ),
  },
  {
    name: 'sync_calendar',
    description:
      'Sync one external calendar, or every external calendar when subscription_id is omitted. Read-only for Google events.',
    scopes: ['calendar:write'],
    inputSchema: objectSchema({ subscription_id: id }),
  },
  {
    name: 'update_external_calendar',
    description: 'Rename, recolor or hide an external calendar. Hiding keeps the events stored.',
    scopes: ['calendar:write'],
    inputSchema: objectSchema(
      {
        id,
        summary: { type: 'string', minLength: 1, maxLength: 200 },
        color: { type: 'string' },
        visible: { type: 'boolean' },
      },
      ['id'],
    ),
  },
  {
    name: 'remove_external_calendar',
    description: 'Soft-delete an external calendar and its events.',
    scopes: ['calendar:write'],
    inputSchema: objectSchema({ id }, ['id']),
  },
];

/** Every listing shares paging inputs; task activity defaults to a compact summary. */
const ACTIVITY_TOOLS = new Set([
  'get_task',
  'create_task',
  'update_task',
  'quick_add',
  'complete_task',
  'reopen_task',
  'cancel_task',
  'restore_task',
  'detach_occurrence',
]);
export const MCP_TOOLS: readonly McpTool[] = CATALOG.map((tool) => ({
  ...tool,
  inputSchema: {
    ...tool.inputSchema,
    properties: {
      ...(tool.name.startsWith('list_') ? { limit, cursor } : {}),
      ...(ACTIVITY_TOOLS.has(tool.name)
        ? {
            include_activity: {
              type: 'string',
              enum: ['summary', 'full'],
              description: 'Default summary; full includes stored task snapshots.',
            },
          }
        : {}),
      ...tool.inputSchema.properties,
    },
  },
}));

export function findTool(name: string): McpTool | undefined {
  return MCP_TOOLS.find((tool) => tool.name === name);
}

export function visibleTools(scopes: readonly string[]): readonly McpTool[] {
  return MCP_TOOLS.filter((tool) => missingScopes(scopes, tool.scopes).length === 0);
}
