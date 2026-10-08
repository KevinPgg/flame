/**
 * Debug utility for environment-gated logging
 * Only logs in development mode
 */

import { isDevelopment } from "./environment";

export function debug(...args: any[]) {
  if (isDevelopment()) {
    console.log(...args);
  }
}

export function debugWarn(...args: any[]) {
  if (isDevelopment()) {
    console.warn(...args);
  }
}

export function debugTable(data: any) {
  if (isDevelopment()) {
    console.table(data);
  }
}
