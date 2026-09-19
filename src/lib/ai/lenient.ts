import { z } from "zod";

/**
 * A list as models actually return it: sometimes a single object where a list
 * was asked for, sometimes null, sometimes a few items over the limit. None of
 * that is worth failing a whole chapter or paper over, so it is repaired before
 * validation. Items that are themselves malformed are dropped, not fatal.
 */
export function lenientList<T extends z.ZodTypeAny>(item: T, max: number) {
  return z.preprocess((value) => {
    const items = value == null ? [] : Array.isArray(value) ? value : [value];
    return items.filter((entry) => item.safeParse(entry).success).slice(0, max);
  }, z.array(item));
}
