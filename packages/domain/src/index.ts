export type {
  ActivityAction,
  CalendarSyncDirection,
  ChecklistStatus,
  DateFilterOp,
  FilterCombinator,
  FilterCondition,
  FilterGroup,
  FilterMode,
  FilterRules,
  FocusSessionType,
  HabitGoal,
  HabitPeriod,
  HabitWeekday,
  Priority,
  ProjectKind,
  ProjectViewMode,
  QuickAddContext,
  QuickAddDue,
  QuickAddParse,
  QuickAddPattern,
  QuickAddSpan,
  QuickAddSpanKind,
  ReminderChannel,
  ReminderType,
  RepeatFrom,
  SmartListKey,
  Task,
  TaskKind,
  TaskSource,
  TaskStatus,
  Theme,
  WeekStart,
} from './types';

export { nextOccurrence, occurrencesBetween } from './recurrence/index';
export type { Occurrence, RecurrenceInput, RecurrenceResult } from './recurrence/index';
export { firstAfter } from './recurrence/expand';
export {
  buildRepeatRule,
  canonicalizeRepeatRule,
  describeRepeatRule,
  excludeOccurrence,
  parseRepeatRule,
} from './recurrence/rule';
export type { ParsedRule, RepeatDraft, RuleFailure, Weekday } from './recurrence/rule';

export { instantFromWall, startOfZonedDay } from './dates/zoned';
export { parseTaskInstant } from './dates/parse-instant';
export type { ParsedTaskInstant } from './dates/parse-instant';
export { isOverdue, plannedForLater, snoozeDue } from './dates/schedule';
export type { DateSnoozePreset, ScheduleFailure, SnoozedDates } from './dates/schedule';

export {
  COUNTDOWN_COLORS,
  COUNTDOWN_DAY_MODES,
  COUNTDOWN_REPEATS,
  COUNTDOWN_TYPES,
  countdownDaysLabel,
  nextCountdownOccurrence,
} from './countdowns/countdowns';
export type {
  CountdownCalculationInput,
  CountdownDaysLabel,
  CountdownDayMode,
  CountdownKind,
  CountdownRepeat,
} from './countdowns/countdowns';

export {
  ACCOUNT_REMINDER_TRIGGERS,
  isAccountReminderTrigger,
  LIST_REMINDER_OFF,
  nextConstantFire,
  nextDailyReminder,
  parseTrigger,
  REMINDER_HORIZON_MS,
  reminderDisposition,
  reminderFireAt,
  resolveDefaultReminder,
  afternoonInstant,
  snoozeReminder,
} from './reminders/trigger';
export { formatDailyDigest } from './reminders/digest';
export type { DigestTask } from './reminders/digest';
export {
  allDayClockConflict,
  dueSignal,
  isAtDueTrigger,
  OVERDUE_GRACE_MS,
  quietUntil,
  retryDelayMs,
  skipPastEnqueue,
} from './reminders/delivery';
export type {
  AccountReminderTrigger,
  ReminderSnoozePreset,
  TriggerParse,
} from './reminders/trigger';

export {
  arrangeTasks,
  calendarDateKey,
  compileRules,
  isSmartListKey,
  matchesClause,
  matchesFilter,
  matchesSmartList,
  pageTaskGroups,
  parseFilterRules,
  requireConditions,
  parseSearchQuery,
  parseTaskView,
  RECENT_WINDOW_DAYS,
  savedFilterClause,
  shiftLocalDays,
  SMART_LIST_KEYS,
  FIXED_SMART_LIST_KEYS,
  smartListClause,
} from './filters/index';
export type {
  ArrangedTask,
  FilterClause,
  FilterClock,
  FilterParse,
  FilterSubject,
  ParsedSearch,
  SmartListInput,
  TaskGroup,
  TaskGroupBy,
  TaskSort,
  TaskViewOptions,
} from './filters/index';

export { parseQuickAdd } from './nlp/index';
export type { QuickAddLanguage } from './nlp/index';

export {
  rebalancedSortOrders,
  SORT_ORDER_GAP,
  sortOrderAtEnd,
  sortOrderBetween,
} from './ordering/sort-order';
export type { SortPlacement } from './ordering/sort-order';

export {
  comparePriority,
  isPriority,
  priorityFromTickTick,
  priorityToTickTick,
  PRIORITIES,
} from './priority/priority';
export type { TickTickPriority } from './priority/priority';

export { extractMarkdownChecklist } from './checklist/markdown';
export type { ExtractedChecklist, ExtractedChecklistItem } from './checklist/markdown';
export { checklistProgress } from './checklist/progress';
export type { ChecklistProgress } from './checklist/progress';

export { decideParentCompletion } from './tasks/completion';
export type {
  CompleteChildrenChoice,
  CompleteChildrenPolicy,
  ParentCompletionDecision,
} from './tasks/completion';
export { deriveDurationMinutes, endFromDuration } from './tasks/duration';
export type { DurationDerivation } from './tasks/duration';
export { normalizeTaskTitle, resolveSubtaskProject } from './tasks/subtask';
export type { SubtaskProject, TaskTitle } from './tasks/subtask';
export { isIanaTimeZone } from './tasks/time-zone';

export { mergeFieldClocks } from './sync/merge';
export type { MergeFieldClocksInput, MergeFieldClocksResult } from './sync/merge';
export {
  isTombstoneType,
  SYNC_PAGE_DEFAULT,
  SYNC_PAGE_MAX,
  syncLimit,
  TOMBSTONE_RETENTION_DAYS,
  tombstoneCutoff,
} from './sync/page';

export { createsTagCycle, normalizeTagName, tagDescendantIds, tagNameKey } from './tags/tags';

export {
  aggregateHeatmap,
  assessCheckIn,
  calendarDate,
  HABIT_WEEKDAYS,
  habitStats,
  habitAvailabilityHistory,
  habitRangeSummary,
  nextHabitReminder,
  normalizeHabitDraft,
  readStoredHabit,
  streakBreakOn,
} from './habits/habits';
export type {
  AggregateHeatCell,
  CheckInAssessment,
  CheckInFailure,
  HabitDraftFailure,
  HabitHeatCell,
  HabitLogEntry,
  HabitStats,
  NormalizedHabit,
} from './habits/habits';

export {
  DEFAULT_QUADRANT_EFFECTS,
  defaultQuadrant,
  isImportant,
  isUrgent,
  MATRIX_QUADRANTS,
  minimalQuadrantPatch,
  quadrantOf,
} from './views/matrix';
export type {
  DueEffect,
  MatrixQuadrant,
  MatrixTask,
  MinimalQuadrantPatch,
  MinimalQuadrantTask,
  QuadrantEffect,
  QuadrantPatch,
  QuadrantRule,
} from './views/matrix';
export { acceptsColumnDrop, columnLoad } from './views/wip';
export type { ColumnLoad } from './views/wip';
export { moveTimelineBlock, resizeTimelineBlock, slotTask, timelineRange } from './views/timeline';
export type { MovedBlock, TimelineBlock, TimelineRange, TimelineZoom } from './views/timeline';
export { parseIcal, tasksToIcal } from './calendar/ical';
export type { IcalEvent, IcalTask } from './calendar/ical';
export { mapGoogleEvent } from './calendar/google-events';
export type {
  GoogleEventSource,
  GoogleEventStatus,
  MappedGoogleEvent,
} from './calendar/google-events';
export { mapCsv, parseCsv, tasksToCsv } from './transfer/csv';
export type {
  CsvColumnMap,
  CsvExportTask,
  CsvFailure,
  CsvParse,
  CsvTaskDraft,
} from './transfer/csv';
export {
  dashboardSnapshot,
  habitPercent,
  isReportTone,
  productivityPanel,
  weeklyNarrative,
} from './dashboard/kpis';
export type {
  DashboardHabit,
  DashboardSnapshot,
  DashboardTask,
  ProductivityInput,
  ReportTone,
  WeeklyNarrative,
} from './dashboard/kpis';
export {
  dayLoad,
  formatDayLoadLine,
  formatMinutes,
  civilDateKey,
  shiftCivilDate,
  isBusinessDay,
  loadStatus,
} from './planning/day-load';
export type {
  DayLoadEvent,
  DayLoadResult,
  DayLoadSettings,
  DayLoadStatus,
  DayLoadTask,
} from './planning/day-load';
export { FEATURE_FLAG_KEYS, featureEnabled, sanitizeFeatureFlags } from './planning/features';
export type { FeatureFlagKey } from './planning/features';
export { proposeReplan } from './planning/replan';
export type { DayOccupancy, ReplanCandidate, ReplanSuggestion } from './planning/replan';
export { planQueue, previewPlan, staleTaskIds } from './planning/day-plan';
export type {
  PlanCard,
  PlanDecisionInput,
  PlanDecisionKind,
  PlanEffect,
  PlanPreview,
  PlanQueue,
  PlanReason,
  PlanSection,
  PlanSources,
  PlanTaskInput,
} from './planning/day-plan';
export { proposeDaily, proposeWeekly } from './review/propose';
export type { DailyProposal, HabitRisk, ReviewCandidate, WeeklyReview } from './review/propose';
export {
  signWebhookBody,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_WINDOW_MS,
  webhookRetryDelayMs,
  webhookStillOpen,
} from './webhooks/sign';
export { automationMatches, parseAutomationAction, renderTemplate } from './automations/rule';
export type { AutomationAction, AutomationRule } from './automations/rule';
export { distanceMeters, insideGeofence, readGeofence } from './reminders/geofence';
export type { Geofence, GeoPoint } from './reminders/geofence';
export { randomBase32, recoveryCodes, sha256Hex, totpCode, verifyTotp } from './auth/totp';
export { fromOpenTask, toOpenProject, toOpenTask } from './open/ticktick';
export type {
  OpenChecklist,
  OpenProjectInput,
  OpenTaskInput,
  OpenTaskWrite,
} from './open/ticktick';
export {
  focusElapsedSeconds,
  cappedFocusSeconds,
  DEFAULT_FOCUS_SETTINGS,
  focusSessionStatus,
  focusStats,
  nextFocusPhase,
  remainingSeconds,
} from './focus/cycle';
export type {
  FocusListStatus,
  FocusPhase,
  FocusSettings,
  FocusStatSession,
  FocusStats,
} from './focus/cycle';
export { controlScore, FOCUS_WEEKLY_TARGET } from './achievements/score';
export type { ControlInput, ControlScore, ControlDeductionReason } from './achievements/score';
export {
  ageOnComplete,
  buildDayBuckets,
  completionRate,
  countCompletedCreated,
  dayKey,
  distributionBy,
  focusHeatmap,
  focusMinutesTotal,
  focusPomodoros,
  habitRangePercent,
  averageHabitPercent,
  weakestHabitWeekday,
  controlScoreAt,
  usageStreak,
  achievementHistory,
  taskSeries,
  focusSeries,
  hourInTz,
  overdueStockSeries,
  parseDayBounds,
  productiveStreak,
  punctualityStats,
  weekdayInTz,
  addCalendarDays,
} from './stats/aggregate';
export type { DayBucket, StatsFocusRow, StatsHabitRow, StatsTaskRow } from './stats/aggregate';
export { parsePluginManifest, PLUGIN_PERMISSIONS, pluginMay } from './plugins/manifest';
export type {
  ManifestFailure,
  ManifestParse,
  PluginManifest,
  PluginPermission,
} from './plugins/manifest';
export { allows, parseMentions } from './collaboration/access';
export type { ShareAction, SharePermission } from './collaboration/access';
export { isRasterImage } from './attachments/image';
export { formatCaptureReply } from './integrations/capture-reply';
export type { CaptureReply } from './integrations/capture-reply';
export { matchTaskByTitle, parseTelegramCommand } from './integrations/telegram';
export type { TelegramCommand, TelegramTaskRef, TitleMatch } from './integrations/telegram';
export { canonicalJson } from './ticky/canonical-json';
export { buildContextSnapshot } from './ticky/context-snapshot';
export type { ContextSnapshot } from './ticky/context-snapshot';
export { occupiedIntervals, unionIntervals } from './ticky/free-busy';
export type { BusyInterval, CalendarFact, SubscriptionFact } from './ticky/free-busy';
export {
  actionBlocked,
  approvalMatches,
  APP_TITLE_MAX,
  normalizeProposal,
  proposalDigest,
  ProposalError,
  titleNeedsEdit,
  validateProposal,
} from './ticky/proposal';
export type {
  ProposalBody,
  ProposalItem,
  TaskChanges,
  TickyReason,
  TickyTool,
} from './ticky/proposal';
export {
  intersectOwnedLists,
  legacyGrantsTickyScope,
  listVisible,
  projectConstraint,
  readCapabilities,
  TICKY_FINE_SCOPES,
  TICKY_READ_SCOPES,
} from './ticky/read-policy';
export type { ReadCapabilities } from './ticky/read-policy';
export {
  NAVIGATION_MODULES,
  navigationOrder,
  moveNavigationModule,
  type NavigationModule,
} from './navigation';
export { humanDate } from './dates/presentation';
export { gardenProjectContext, type GardenProjectInput } from './dashboard/projects';
export {
  PROJECT_STALE_DAYS,
  actionDateChip,
  activityLabel,
  nextAction,
  orderBoardItems,
  projectAttention,
  projectDayLabel,
  projectProgress,
} from './projects/overview';
export type {
  ActionChip,
  BoardOrderItem,
  NextAction,
  ProjectAttention,
  ProjectBoardState,
  ProjectProgress,
  ProjectTask,
} from './projects/overview';
export { overdueAgeGroups } from './dashboard/kpis';

export { gardenHabits, uniqueGardenEvents, gardenTagActivity } from './dashboard/executive';

export { bucketWeek, type WeekDayMetric } from './reports/week-metrics';

export { calendarDragPatch, DRAG_SNAP_MINUTES, type CalendarDragTarget } from './calendar/drag';

export { calendarRepeatedHour, calendarAxisMinute, calendarAxisTarget } from './calendar/drag';

export { recurrenceAnchorWarning } from './recurrence/anchor';
export type { RecurrenceAnchorWarning } from './recurrence/anchor';

export { listNameKey } from './lists/name';

export { normalizeReminderTrigger } from './reminders/trigger';

export { repairAllDayUtc } from './tasks/repair-allday';

export { extractUrls, normalizeTaskUrl } from './links/extract';

export { autoStartNextPhase } from './focus/cycle';

export {
  NOTIFICATION_KINDS,
  NOTIFICATION_CHANNELS,
  notificationDefault,
  notificationQuietUntil,
} from './reminders/preferences';

export { isWorkTask, isWorkTime, nextWorkStart, workHiddenNow } from './work/context';
export type { WorkHideProfile, WorkMembership, WorkSchedule, WorkTaskRef } from './work/context';
export { WEEKDAY_CODES, weekdayCodes, weekdayNumbers } from './work/weekdays';
export type { WeekdayCode } from './work/weekdays';
export type { NotificationKind, NotificationChannel } from './reminders/preferences';

export { DEFAULT_CAPTURE_SETTINGS, captureSettings, parseCapture } from './nlp/capture-settings';
export type { CaptureSettings } from './nlp/capture-settings';

export {
  PLAN_ACTIONS,
  actionDate,
  alignDueToStart,
  effectOf,
  storedDecision,
  legacyAction,
  type PlanAction,
  type PlanningAction,
  type PlanningPatch,
} from './planning/actions';

export { freeSlots, snap15, type PlanBusyInterval } from './planning/slots';

export { wallClock } from './dates/zoned';
