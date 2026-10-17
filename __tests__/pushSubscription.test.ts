import { pushSubscription } from '../pushSubscription';

const SW_PATH = '/sw.js';

describe('pushSubscription', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  describe('unsubscribe when no service worker registration is present', () => {
    it('completes without throwing when navigator.serviceWorker has no registration', async () => {
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
          getRegistration: jest.fn().mockResolvedValue(undefined),
          getRegistrations: jest.fn().mockResolvedValue([]),
          register: jest.fn(),
          ready: Promise.resolve(undefined),
        },
      });

      await expect(pushSubscription.unsubscribe()).resolves.not.toThrow();
    });

    it('leaves localStorage clean with no stale subscription entry', async () => {
      localStorage.setItem('pushSubscription', JSON.stringify({ endpoint: 'https://example.com/stale' }));

      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
          getRegistration: jest.fn().mockResolvedValue(undefined),
          getRegistrations: jest.fn().mockResolvedValue([]),
          register: jest.fn(),
          ready: Promise.resolve(undefined),
        },
      });

      await pushSubscription.unsubscribe();

      expect(localStorage.getItem('pushSubscription')).toBeNull();
    });

    it('allows a subsequent normal subscribe flow to work correctly afterward', async () => {
      const mockRegistration = {
        pushManager: {
          subscribe: jest.fn().mockResolvedValue({
            endpoint: 'https://example.com/new',
            toJSON: () => ({ endpoint: 'https://example.com/new' }),
          }),
          getSubscription: jest.fn().mockResolvedValue(null),
        },
      };

      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
          getRegistration: jest.fn().mockResolvedValue(undefined),
          getRegistrations: jest.fn().mockResolvedValue([]),
          register: jest.fn().mockResolvedValue(mockRegistration),
          ready: Promise.resolve(mockRegistration),
        },
      });

      await pushSubscription.unsubscribe();
      expect(localStorage.getItem('pushSubscription')).toBeNull();

      await pushSubscription.subscribe();

      expect(navigator.serviceWorker.register).toHaveBeenCalledWith(SW_PATH);
      expect(mockRegistration.pushManager.subscribe).toHaveBeenCalled();
      expect(localStorage.getItem('pushSubscription')).not.toBeNull();
    });
  });
});
