import { resolveFederationAddress } from './federation';

describe('federation sessionStorage cache', () => {
  beforeEach(() => {
    sessionStorage.clear();
    jest.restoreAllMocks();
  });

  it('shares a single network lookup across concurrent requests for the same address', async () => {
    const address = 'alice*example.com';
    const resolved = { accountId: 'GABC123', memo: '12345' };

    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => resolved,
                } as Response),
              10,
            ),
          ),
      );

    const [first, second] = await Promise.all([
      resolveFederationAddress(address),
      resolveFederationAddress(address),
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(first).toEqual(resolved);
    expect(second).toEqual(resolved);
  });
});
