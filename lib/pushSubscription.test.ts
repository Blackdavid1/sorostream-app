import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { subscribeToPush, unsubscribeFromPush, SW_PATH } from './pushSubscription';

describe('pushSubscription', () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
    });
  });

  describe('unsubscribeFromPush', () => {
    it('completes without throwing when no service worker registration exists', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          serviceWorker: {
            getRegistration: vi.fn().mockResolvedValue(undefined),
          },
        },
        configurable: true,
      });

      await expect(unsubscribeFromPush()).resolves.not.toThrow();
    });

    it('leaves localStorage clean with no stale subscription entry when registration is missing', async () => {
      localStorage.setItem('push-subscription', JSON.stringify({ endpoint: 'https://example.com/stale' }));

      Object.defineProperty(globalThis, 'navigator', {
        value: {
          serviceWorker: {
            getRegistration: vi.fn().mockResolvedValue(undefined),
          },
        },
        configurable: true,
      });

      await unsubscribeFromPush();

      expect(localStorage.getItem('push-subscription')).toBeNull();
    });

    it('allows a subsequent normal subscribe flow to work after a missing-registration unsubscribe', async () => {
      const mockSubscription = {
        endpoint: 'https://example.com/new',
        toJSON: () => ({ endpoint: 'https://example.com/new' }),
        unsubscribe: vi.fn().mockResolvedValue(true),
      };

      const mockRegistration = {
        pushManager: {
          subscribe: vi.fn().mockResolvedValue(mockSubscription),
          getSubscription: vi.fn().mockResolvedValue(null),
        },
      };

      Object.defineProperty(globalThis, 'navigator', {
        value: {
          serviceWorker: {
            getRegistration: vi.fn().mockResolvedValue(undefined),
            register: vi.fn().mockResolvedValue(mockRegistration),
            ready: Promise.resolve(mockRegistration),
          },
        },
        configurable: true,
      });

      await unsubscribeFromPush();
      expect(localStorage.getItem('push-subscription')).toBeNull();

      await subscribeToPush();

      expect(mockRegistration.pushManager.subscribe).toHaveBeenCalled();
      expect(localStorage.getItem('push-subscription')).not.toBeNull();
    });
  });
});
