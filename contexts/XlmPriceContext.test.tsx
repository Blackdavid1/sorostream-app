import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import { XlmPriceProvider, useXlmPrice } from "./XlmPriceContext";

// A consumer that renders the current price so we can assert on it.
function PriceConsumer({ label }: { label: string }) {
  const { price } = useXlmPrice();
  return (
    <div data-testid={`consumer-${label}`}>
      {price === null ? "loading" : String(price)}
    </div>
  );
}

describe("XlmPriceContext", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("serves a newly-mounted consumer from cache without an extra fetch", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch" as any)
      .mockResolvedValue({
        ok: true,
        json: async () => ({ price: 0.42 }),
      } as any);

    // Mount the first consumer, which triggers the initial shared fetch.
    const { rerender } = render(
      <XlmPriceProvider>
        <PriceConsumer label="first" />
      </XlmPriceProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("consumer-first")).toHaveTextContent("0.42");
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Mount a second consumer before the next scheduled one-minute tick.
    rerender(
      <XlmPriceProvider>
        <PriceConsumer label="first" />
        <PriceConsumer label="second" />
      </XlmPriceProvider>
    );

    // The second consumer should be served from the already-fetched cache.
    await waitFor(() => {
      expect(screen.getByTestId("consumer-second")).toHaveTextContent("0.42");
    });

    // No additional fetch should have occurred for the second consumer.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Both consumers receive the same price value.
    expect(screen.getByTestId("consumer-first")).toHaveTextContent("0.42");
    expect(screen.getByTestId("consumer-second")).toHaveTextContent("0.42");

    // Advancing to the next scheduled tick triggers exactly one more fetch.
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
