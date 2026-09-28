import React, { ComponentType, lazy } from 'react';

/**
 * Wraps dynamic imports with retry logic to withstand transient network failures,
 * dev server re-compilations, and CDN module fetch hiccups.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  componentImport: () => Promise<{ default: T } | T>,
  retriesLeft = 2,
  interval = 1000
): React.LazyExoticComponent<T> {
  return lazy(() =>
    new Promise<{ default: T }>((resolve, reject) => {
      const attempt = (left: number) => {
        componentImport()
          .then((module) => {
            if ('default' in module && module.default) {
              resolve({ default: module.default as T });
            } else {
              resolve({ default: module as unknown as T });
            }
          })
          .catch((error: unknown) => {
            if (left <= 0) {
              reject(error);
              return;
            }
            setTimeout(() => {
              attempt(left - 1);
            }, interval);
          });
      };
      attempt(retriesLeft);
    })
  );
}
