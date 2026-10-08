/**
 * Event filtering utilities — re-exported from @project-flame/lib.
 *
 * This file exists for backward compatibility so existing web component imports
 * (e.g. `import { separateEventsByDate } from "../../lib/utils/event-filters"`)
 * continue to work without changes.
 *
 * The canonical implementation lives in packages/lib/src/utils/event-filters.ts.
 * Import from "@project-flame/lib" in all new code.
 */
export type { ActiveEvent } from "@project-flame/lib";
export {
  isEventActive,
  filterActiveEvents,
  filterPastEvents,
  separateEventsByDate,
} from "@project-flame/lib";
