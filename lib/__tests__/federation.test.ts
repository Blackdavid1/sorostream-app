import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the Stellar federation module so we can count underlying network lookups.
const resolveStellarAddressMock = vi.fn();

vi.mock('@stellar/freighter-api', () => ({
  default: {},
}));

vi.mock('@stellar/stellar-sdk', async () => {
  const actual = await vi.importActual<typeof import('@stellar/stellar-sdk')>(
    '@stellar/stellar-sdk',
  );
  return {
    ...actual,
    Federation: {
      ...(actual as any).Federation,
      Server: vi.fn().mockImplementation(() => ({
        resolve: resolveStellarAddressMock,
      })),
    },
  };
});

import { resolveFederationAddress } from '../federation';

describe('federation sessionStorage cache', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resolveStellarAddressMock.mockReset();
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('shares a single in-flight lookup across concurrent calls for the same address', async () => {
    const address = 'alice*example.com';
    const resolved = { account_id: 'GABC123', memo_type: undefined };

    // Simulate a slow network lookup so both callers overlap.
    resolveStellarAddressMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(resolved), 25);
        }),
    );

    const [first, second] = await Promise.all([
      resolveFederationAddress(address),
      resolveFederationAddress(address),
    ]);

    // Only one underlying network lookup should occur for the shared address.
    expect(resolveStellarAddressMock).toHaveBeenCalledTimes(1);
    expect(resolveStellarAddressMock).toHaveBeenCalledWith(address);

    // Both callers receive the correct resolved result.
    expect(first).toEqual(resolved);
    expect(second).toEqual(resolved);
  });
});
