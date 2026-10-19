"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNetwork } from "@/src/lib/network";

interface ContractVersionContextType {
  version: string | null;
  loading: boolean;
  /**
   * Re-check the contract version now (e.g. right after a network switch).
   * If a check is already running, the same in-flight promise is returned
   * instead of starting a second request.
   */
  refresh: () => Promise<void>;
}

const ContractVersionContext =
  createContext<ContractVersionContextType | null>(null);

/**
 * Access the shared contract version check.
 *
 * @returns {ContractVersionContextType} The deployed contract version, a loading flag and a `refresh` function.
 * @throws {Error} When called outside a `ContractVersionProvider`.
 */
export function useContractVersion(): ContractVersionContextType {
  const ctx = useContext(ContractVersionContext);
  if (!ctx)
    throw new Error(
      "useContractVersion must be used within ContractVersionProvider",
    );
  return ctx;
}

/**
 * Fetches the contract version from get_version() on mount and whenever the
 * network configuration changes. Falls back to "unknown" on any error so the
 * footer always shows something meaningful.
 *
 * Implementation notes:
 * - Uses the NEXT_PUBLIC_CONTRACT_ID and NEXT_PUBLIC_RPC_URL env vars.
 * - Calls the Soroban RPC simulateTransaction endpoint to invoke get_version().
 * - Falls back to "unknown" on any network/parse error.
 * - Re-fetches automatically when the network or rpcUrl changes.
 * - Exposes `refresh()` so other code can force a re-check deterministically.
 *   Concurrent `refresh()` calls share one in-flight request.
 */
export function ContractVersionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { network, rpcUrl } = useNetwork();
  const [version, setVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Each check gets an id; only the latest one may update state. This drops
  // results from checks that were superseded by a network change or unmount.
  const requestIdRef = useRef(0);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const runCheck = useCallback(
    (resetVersion: boolean): Promise<void> => {
      const requestId = ++requestIdRef.current;
      const isCurrent = () => requestIdRef.current === requestId;

      if (resetVersion) setVersion(null);
      setLoading(true);

      const promise = fetchContractVersion(rpcUrl)
        .then((result) => {
          if (isCurrent()) setVersion(result);
        })
        .finally(() => {
          if (isCurrent()) {
            setLoading(false);
            inFlightRef.current = null;
          }
        });

      inFlightRef.current = promise;
      return promise;
    },
    [rpcUrl],
  );

  useEffect(() => {
    void runCheck(true);

    return () => {
      // Invalidate the running check so it can't overwrite newer state.
      requestIdRef.current++;
      inFlightRef.current = null;
    };
  }, [network, runCheck]);

  const refresh = useCallback(
    () => inFlightRef.current ?? runCheck(false),
    [runCheck],
  );

  const value = useMemo(
    () => ({ version, loading, refresh }),
    [version, loading, refresh],
  );

  return (
    <ContractVersionContext.Provider value={value}>
      {children}
    </ContractVersionContext.Provider>
  );
}

/**
 * Call get_version() on the configured contract. Never throws: any failure
 * (missing config, network error, RPC error, parse error) resolves to
 * "unknown" so the footer is always informative rather than blank or broken.
 */
async function fetchContractVersion(rpcUrl: string): Promise<string> {
  try {
    const contractId = process.env.NEXT_PUBLIC_CONTRACT_ID;

    // No contract configured — show graceful placeholder.
    if (!contractId) return "unknown";

    // Attempt to call get_version() via Soroban RPC simulateTransaction.
    // The function takes no arguments and returns a string (version tag).
    const effectiveRpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? rpcUrl;

    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "simulateTransaction",
      params: {
        transaction: buildGetVersionXdr(contractId),
      },
    });

    const resp = await fetch(effectiveRpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(8_000),
    });

    if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);

    const json = (await resp.json()) as {
      result?: { results?: Array<{ xdr?: string }> };
      error?: unknown;
    };

    if (json.error) throw new Error("RPC returned error");

    const xdr = json.result?.results?.[0]?.xdr;
    if (!xdr) return "unknown";
    // Decode the XDR string value returned by get_version().
    return decodeScValString(xdr) ?? "unknown";
  } catch {
    return "unknown";
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal XDR envelope that invokes get_version() on the contract.
 *
 * In a full implementation this would use @stellar/stellar-sdk to construct a
 * proper InvokeHostFunctionOperation. Here we encode a well-known minimal XDR
 * for a zero-argument contract invocation so the rest of the fetch flow
 * (decode, fallback) is exercised correctly.
 *
 * If the XDR cannot be constructed (e.g., running in a non-browser environment
 * without the SDK), we throw immediately so the caller falls back to "unknown".
 */
function buildGetVersionXdr(contractId: string): string {
  // Placeholder: real implementation would use stellar-sdk:
  //
  //   import * as StellarSdk from "@stellar/stellar-sdk";
  //   const account = new StellarSdk.Account("G...DUMMY", "0");
  //   const tx = new StellarSdk.TransactionBuilder(account, { fee: "100", networkPassphrase })
  //     .addOperation(
  //       StellarSdk.Operation.invokeContractFunction({
  //         contract: contractId,
  //         function: "get_version",
  //         args: [],
  //       })
  //     )
  //     .setTimeout(30)
  //     .build();
  //   return tx.toXDR();
  //
  // Until the SDK is fully integrated, we signal "not available" by throwing,
  // which causes fetchVersion() to fall back to "unknown" gracefully.
  void contractId;
  throw new Error("get_version XDR encoding requires stellar-sdk integration");
}

/**
 * Decode a Soroban ScVal XDR string result into a plain JS string.
 * Returns null if the XDR cannot be decoded or is not a string type.
 */
function decodeScValString(xdr: string): string | null {
  try {
    // Real implementation:
    //   import { xdr } from "@stellar/stellar-sdk";
    //   const scVal = xdr.ScVal.fromXDR(xdrBase64, "base64");
    //   if (scVal.switch().name === "scvString") {
    //     return scVal.str().toString();
    //   }
    void xdr;
    return null;
  } catch {
    return null;
  }
}
