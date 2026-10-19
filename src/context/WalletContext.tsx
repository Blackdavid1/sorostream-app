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
import {
  APP_NETWORK,
  checkNetworkMatch,
  createWatchWalletChanges,
  getActiveAddress,
  getFreighterAdapter,
  isSessionExpiredError,
  FRIENDLY_SESSION_EXPIRED_MESSAGE,
} from "@/src/lib/freighter";
import { ServerKeypairAdapter } from "@/src/lib/wallets";

interface WalletContextValue {
  address: string | null;
  publicKey: string | null;
  isConnecting: boolean;
  error: string | null;
  /** True when Freighter's active network differs from NEXT_PUBLIC_STELLAR_NETWORK. */
  networkMismatch: boolean;
  /** The expected network name derived from NEXT_PUBLIC_STELLAR_NETWORK. */
  expectedNetwork: string;
  connect: () => Promise<string | null>;
  /**
   * Mark a wallet as connected using an address obtained from a non-Freighter
   * adapter (e.g. Ledger over USB). Freighter account-change events are
   * ignored while such a wallet is connected.
   */
  connectWithAddress: (address: string, walletType: string) => void;
  disconnect: () => void;
  /**
   * Bumps a counter that signals consumers (e.g. NavHeader balance display)
   * to immediately re-fetch wallet data instead of waiting for the next
   * polling interval.
   */
  balanceRefreshTrigger: number;
  refetchBalance: () => void;
  /** Last fetched native (XLM) balance for the connected wallet, or null. */
  balance: string | null;
  /**
   * Fetch the wallet balance right now, independent of any polling, and
   * update the cached `balance`. Useful after a transaction completed outside
   * this app (e.g. from the wallet extension's own UI).
   */
  refreshBalance: () => Promise<string | null>;
  /** Timestamp when session will expire, or null if not set. */
  sessionExpiresAt: number | null;
  /** Time until session expires in milliseconds, or null if not set. */
  sessionTimeRemaining: number | null;
  /** Show 5-minute warning toast. */
  showSessionWarning5Min: boolean;
  /** Show 1-minute blocking modal. */
  showSessionWarning1Min: boolean;
  /** Extend the current session (refresh). */
  extendSession: () => Promise<void>;
  /** True when the Freighter session has expired and wallet was auto-disconnected. */
  sessionExpired: boolean;
  /** Clear the session expired flag (called after user acknowledges the toast). */
  clearSessionExpired: () => void;
  /** Number of active (non-ended / non-cancelled) streams for the connected wallet. */
  activeStreamCount: number;
  /** Reports the current active-stream count so UI can warn before disconnecting. */
  setActiveStreamCount: (count: number) => void;
  /**
   * Attempt to re-establish the wallet session using the persisted wallet type
   * (from localStorage) without navigating away, so the user keeps their
   * current navigation context. Returns true when reconnection succeeded.
   */
  reconnect: () => Promise<boolean>;
  /**
   * Classify an arbitrary wallet/signing error. If it looks like an expired
   * session, flags the session as expired and kicks off an auto-reconnect
   * attempt (so the user sees a re-auth prompt instead of a raw XDR error).
   * Returns the (possibly normalized) error for the caller to surface.
   */
  handleWalletError: (err: unknown) => unknown;
  /**
   * Bumps a counter that signals consumers (e.g. dashboard stream list)
   * to immediately re-fetch stream data instead of showing stale cached state.
   */
  streamRefreshTrigger: number;
  triggerStreamRefresh: () => void;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

const HORIZON_URL = process.env.NEXT_PUBLIC_RPC_URL
  ? process.env.NEXT_PUBLIC_RPC_URL.replace("/rpc/v1", "")
  : "https://horizon-testnet.stellar.org";

/** Polling interval (ms) used by WatchWalletChanges. */
const WATCH_INTERVAL = 2000;

/** Timeout for watch wallet changes operations. */
const WATCH_WALLET_CHANGES_TIMEOUT = 30000;

/** Session timeout in milliseconds (15 minutes default from Freighter). */
const SESSION_TIMEOUT_MS = 15 * 60 * 1000;

/** Warning at 5 minutes before session expiry. */
const SESSION_WARNING_5MIN_MS = 5 * 60 * 1000;

/** Blocking modal at 1 minute before session expiry. */
const SESSION_WARNING_1MIN_MS = 1 * 60 * 1000;

/** Interval for checking session expiry (in background). */
const SESSION_CHECK_INTERVAL_MS = 10 * 1000;

/** Proactive session validity poll interval (when app is focused). */
const SESSION_VALIDITY_POLL_MS = 60 * 1000;

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [networkMismatch, setNetworkMismatch] = useState(false);
  const [balanceRefreshTrigger, setBalanceRefreshTrigger] = useState(0);
  const [balance, setBalance] = useState<string | null>(null);
  const [streamRefreshTrigger, setStreamRefreshTrigger] = useState(0);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);
  const [showSessionWarning5Min, setShowSessionWarning5Min] = useState(false);
  const [showSessionWarning1Min, setShowSessionWarning1Min] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  /** The wallet type currently connected, used to scope session-validity checks. */
  const [connectedWalletType, setConnectedWalletType] = useState<string | null>(null);
  /** Mirror of connectedWalletType readable from the long-lived watcher callback. */
  const connectedWalletTypeRef = useRef<string | null>(null);
  useEffect(() => {
    connectedWalletTypeRef.current = connectedWalletType;
  }, [connectedWalletType]);
  const [activeStreamCount, setActiveStreamCount] = useState(0);
  const sessionValidityPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watcherRef = useRef<ReturnType<typeof createWatchWalletChanges> | null>(
    null,
  );
  const sessionCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warning5MinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warning1MinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Memoize the Freighter adapter to prevent re-instantiation on every render (#631)
  const freighterAdapter = useMemo(() => getFreighterAdapter(), []);
  /** Check the wallet network and update mismatch state. */
  const verifyNetwork = useCallback(async () => {
    const matches = await checkNetworkMatch();
    // null means Freighter isn't connected/available — clear any stale warning
    setNetworkMismatch(matches === false);
  }, []);

  const stopWatcher = useCallback(() => {
    watcherRef.current?.stop();
    watcherRef.current = null;
  }, []);

  /** Clear all session warning timeouts and stop checking. */
  const clearSessionWarnings = useCallback(() => {
    if (warning5MinTimeoutRef.current) {
      clearTimeout(warning5MinTimeoutRef.current);
      warning5MinTimeoutRef.current = null;
    }
    if (warning1MinTimeoutRef.current) {
      clearTimeout(warning1MinTimeoutRef.current);
      warning1MinTimeoutRef.current = null;
    }
    if (sessionCheckIntervalRef.current) {
      clearInterval(sessionCheckIntervalRef.current);
      sessionCheckIntervalRef.current = null;
    }
    setShowSessionWarning5Min(false);
    setShowSessionWarning1Min(false);
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setError(null);
    setNetworkMismatch(false);
    setSessionExpiresAt(null);
    setConnectedWalletType(null);
    connectedWalletTypeRef.current = null;
    setActiveStreamCount(0);
    clearSessionWarnings();
    // Don't stop the watcher on disconnect — keep polling so we notice when
    // the user switches back or reconnects from within Freighter.
  }, [clearSessionWarnings]);

  /** Start session timeout tracking. Called when wallet connects. */
  const startSessionTracking = useCallback(() => {
    clearSessionWarnings();
    const expiryTime = Date.now() + SESSION_TIMEOUT_MS;
    setSessionExpiresAt(expiryTime);

    // Schedule 5-minute warning
    const timeUntil5Min = expiryTime - Date.now() - SESSION_WARNING_5MIN_MS;
    if (timeUntil5Min > 0) {
      warning5MinTimeoutRef.current = setTimeout(() => {
        setShowSessionWarning5Min(true);
      }, timeUntil5Min);
    }

    // Schedule 1-minute warning
    const timeUntil1Min = expiryTime - Date.now() - SESSION_WARNING_1MIN_MS;
    if (timeUntil1Min > 0) {
      warning1MinTimeoutRef.current = setTimeout(() => {
        setShowSessionWarning1Min(true);
      }, timeUntil1Min);
    }
  }, [clearSessionWarnings]);

  /** Extend the current session by refreshing the timeout. */
  const extendSession = useCallback(async () => {
    try {
      // Refresh connection to extend session
      const connected = await freighterAdapter.isConnected();
      if (connected) {
        // Reset session tracking
        startSessionTracking();
        setShowSessionWarning5Min(false);
        setShowSessionWarning1Min(false);
      }
    } catch (err) {
      console.error("Failed to extend session:", err);
    }
  }, [freighterAdapter, startSessionTracking]);

  const triggerStreamRefresh = useCallback(() => {
    setStreamRefreshTrigger((n) => n + 1);
  }, []);

  const refetchBalance = useCallback(() => {
    setBalanceRefreshTrigger((n) => n + 1);
  }, []);

  const refreshBalance = useCallback(async (): Promise<string | null> => {
    if (!address) {
      setBalance(null);
      return null;
    }
    try {
      const res = await fetch(`${HORIZON_URL}/accounts/${address}`);
      if (!res.ok) throw new Error(`Horizon ${res.status}`);
      const data = (await res.json()) as {
        balances?: { asset_type: string; balance: string }[];
      };
      const native = data.balances?.find((b) => b.asset_type === "native");
      const next = native ? native.balance : null;
      setBalance(next);
      // Let other balance consumers (e.g. NavHeader) re-fetch as well.
      setBalanceRefreshTrigger((n) => n + 1);
      return next;
    } catch (err) {
      console.error("Failed to refresh balance:", err);
      return null;
    }
  }, [address]);


  const handleConnectionTimeout = useCallback(() => {
    setError("Connection timed out. Please check that Freighter is unlocked and try again.");
    stopWatcher();
    disconnect();
  }, [stopWatcher, disconnect]);

  /**
   * Start polling for wallet/network changes.
   * The WatchWalletChanges callback receives { publicKey, network } on every
   * poll tick — we update both address and network mismatch from it so the UI
   * stays in sync when the user switches accounts inside Freighter.
   */
  const startWatcher = useCallback(() => {
    if (watcherRef.current) return; // already watching
    const watcher = createWatchWalletChanges(WATCH_WALLET_CHANGES_TIMEOUT);
    watcherRef.current = watcher;
    watcher.watch(({ address: watchAddress, network }) => {
      // --- account change detection ---
      // Only update when address is explicitly provided; network-only ticks leave address unchanged.
      // Freighter events must not override an address from another wallet (e.g. Ledger).
      const externalWallet =
        connectedWalletTypeRef.current !== null && connectedWalletTypeRef.current !== "freighter";
      if (watchAddress !== undefined && !externalWallet) {
        setAddress((prev) => {
          if (prev !== null && prev !== watchAddress) {
            setError(null);
          }
          return watchAddress;
        });
      }

      // --- network mismatch detection ---
      if (network) {
        setNetworkMismatch(network.toLowerCase() !== APP_NETWORK);
      }
    });
  }, []);

  /**
   * On mount, start the watcher unconditionally so we detect account/network
   * changes even before the user explicitly clicks "Connect".
   * If Freighter is already connected (e.g. auto-reconnect from localStorage),
   * the first tick will pick up the current address.
   */
  useEffect(() => {
    startWatcher();
    return () => stopWatcher();
  }, [startWatcher, stopWatcher]);

  /**
   * Re-establish the wallet session using the wallet type persisted in
   * localStorage. This runs without any route change, so the user keeps their
   * current navigation context. Returns true when the session was restored.
   */
  const attemptAutoReconnect = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined") return false;
    const storedType = localStorage.getItem("sorostream_wallet_type");
    if (!storedType) return false;

    try {
      if (storedType === "freighter") {
        const publicKey = await getActiveAddress();
        if (publicKey) {
          setAddress(publicKey);
          setConnectedWalletType("freighter");
          startSessionTracking();
          return true;
        }
        return false;
      }

      if (storedType === "server-keypair") {
        const secret = localStorage.getItem("sorostream_wallet_secret") || "";
        const adapter = new ServerKeypairAdapter(secret);
        const available = await adapter.isAvailable();
        if (!available) return false;
        const key = await adapter.getPublicKey();
        if (key) {
          setAddress(key);
          setConnectedWalletType("server-keypair");
          startSessionTracking();
          return true;
        }
        return false;
      }

      // Ledger requires manual transport interaction — cannot auto-reconnect.
      return false;
    } catch {
      return false;
    }
  }, [startSessionTracking]);

  /**
   * Classify a wallet/signing error. Expired-session errors set the
   * `sessionExpired` flag and trigger an auto-reconnect attempt instead of
   * surfacing a raw XDR / SDK error to the user. Returns the error so the
   * caller can still present a friendly message.
   */
  const handleWalletError = useCallback(
    (err: unknown): unknown => {
      if (isSessionExpiredError(err)) {
        setSessionExpired(true);
        void attemptAutoReconnect().then((ok) => {
          if (ok) setSessionExpired(false);
        });
      }
      return err;
    },
    [attemptAutoReconnect],
  );

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const connected = await freighterAdapter.isConnected();

      if (!connected) {
        setError("Freighter extension not found. Please install it.");
        return null;
      }

      const publicKey = await getActiveAddress();
      setAddress(publicKey || null);
      setConnectedWalletType(publicKey ? "freighter" : null);

      // Start session timeout tracking
      if (publicKey) {
        startSessionTracking();
      }

      // Check network immediately after connecting; watcher keeps it live
      await verifyNetwork();
      // Watcher is already running from the mount effect; startWatcher() is
      // idempotent so calling it here is a safe no-op.
      startWatcher();

      // Signal consumers (e.g. dashboard stream list) to re-fetch immediately.
      // Without this, a reconnect that resolves to the SAME address as the
      // previous session leaves the list showing stale session data.
      if (publicKey) {
        triggerStreamRefresh();
      }

      return publicKey || null;
    } catch (err) {
      // Route through the session-error classifier so an expired-session /
      // XDR failure surfaces a re-auth prompt instead of a raw error.
      handleWalletError(err);
      const isExpired = isSessionExpiredError(err);
      const message = isExpired
        ? FRIENDLY_SESSION_EXPIRED_MESSAGE
        : err instanceof Error
          ? err.message
          : "Connection failed";
      // Check if it's a timeout error
      if (!isExpired && (message.includes("timeout") || message.includes("Timeout"))) {
        setError("Connection timed out. Please check that Freighter is unlocked and try again.");
      } else {
        setError(message);
      }
      return null;
    } finally {
      setIsConnecting(false);
    }
  }, [freighterAdapter, verifyNetwork, startWatcher, startSessionTracking, triggerStreamRefresh, handleWalletError]);

  const connectWithAddress = useCallback(
    (externalAddress: string, walletType: string) => {
      setError(null);
      connectedWalletTypeRef.current = walletType;
      setConnectedWalletType(walletType);
      setAddress(externalAddress);
      startSessionTracking();
      triggerStreamRefresh();
    },
    [startSessionTracking, triggerStreamRefresh],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearSessionWarnings();
    };
  }, [clearSessionWarnings]);

  const clearSessionExpired = useCallback(() => {
    setSessionExpired(false);
  }, []);

  /** Public reconnect entry point used by the re-auth prompt. */
  const reconnect = useCallback(async (): Promise<boolean> => {
    const ok = await attemptAutoReconnect();
    if (ok) {
      setSessionExpired(false);
      setError(null);
    } else {
      // Fall back to the standard connect flow (e.g. for Ledger / fresh start).
      const key = await connect();
      if (key) {
        setSessionExpired(false);
        setError(null);
        return true;
      }
    }
    return ok;
  }, [attemptAutoReconnect, connect]);

  /**
   * Classify a wallet/signing error. Expired-session errors set the
   * `sessionExpired` flag and trigger an auto-reconnect attempt instead of
   * surfacing a raw XDR / SDK error to the user. Returns the error so the
   * caller can still present a friendly message.
   */
  // When the session is flagged as expired, attempt an automatic reconnect so
  // the user is re-authenticated in place without losing navigation context.
  useEffect(() => {
    if (!sessionExpired) return;
    let active = true;
    void attemptAutoReconnect().then((ok) => {
      if (ok && active) setSessionExpired(false);
    });
    return () => {
      active = false;
    };
  }, [sessionExpired, attemptAutoReconnect]);

  /** Proactive session validity check. Called every 60s when app is focused. */
  const checkSessionValidity = useCallback(async () => {
    if (!address || !sessionExpiresAt) return;
    // If the session has passed its expiry time, auto-disconnect
    if (Date.now() >= sessionExpiresAt) {
      setSessionExpired(true);
      disconnect();
      return;
    }
    // Also check if Freighter is still available (only meaningful for Freighter).
    // Non-Freighter adapters (server-keypair) rely on the time-based check above.
    if (connectedWalletType === "freighter") {
      try {
        const connected = await freighterAdapter.isConnected();
        if (!connected && address) {
          setSessionExpired(true);
          disconnect();
        }
      } catch {
        // Silently fail — the time-based check above is the primary guard
      }
    }
  }, [address, sessionExpiresAt, disconnect, connectedWalletType, freighterAdapter]);

  /** Start/stop the 60-second session validity poll based on page visibility. */
  useEffect(() => {
    if (!address) {
      if (sessionValidityPollRef.current) {
        clearInterval(sessionValidityPollRef.current);
        sessionValidityPollRef.current = null;
      }
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // App gained focus — run an immediate check
        void checkSessionValidity();
        // Start periodic polling
        if (!sessionValidityPollRef.current) {
          sessionValidityPollRef.current = setInterval(() => {
            void checkSessionValidity();
          }, SESSION_VALIDITY_POLL_MS);
        }
      } else {
        // App lost focus — stop polling to save resources
        if (sessionValidityPollRef.current) {
          clearInterval(sessionValidityPollRef.current);
          sessionValidityPollRef.current = null;
        }
      }
    };

    // Start polling if visible on mount
    if (document.visibilityState === "visible") {
      if (!sessionValidityPollRef.current) {
        sessionValidityPollRef.current = setInterval(() => {
          void checkSessionValidity();
        }, SESSION_VALIDITY_POLL_MS);
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (sessionValidityPollRef.current) {
        clearInterval(sessionValidityPollRef.current);
        sessionValidityPollRef.current = null;
      }
    };
  }, [address, checkSessionValidity]);

  // Compute sessionTimeRemaining
  const sessionTimeRemaining = sessionExpiresAt
    ? Math.max(0, sessionExpiresAt - Date.now())
    : null;

  const value = useMemo(
    () => ({
      address,
      publicKey: address,
      isConnecting,
      error,
      networkMismatch,
      expectedNetwork: APP_NETWORK,
      connect,
      connectWithAddress,
      disconnect,
      balanceRefreshTrigger,
      refetchBalance,
      balance,
      refreshBalance,
      sessionExpiresAt,
      sessionTimeRemaining,
      showSessionWarning5Min,
      showSessionWarning1Min,
      extendSession,
      sessionExpired,
      clearSessionExpired,
      reconnect,
      handleWalletError,
      activeStreamCount,
      setActiveStreamCount,
      streamRefreshTrigger,
      triggerStreamRefresh,
    }),
    [
      address,
      connect,
      connectWithAddress,
      disconnect,
      error,
      isConnecting,
      networkMismatch,
      balanceRefreshTrigger,
      refetchBalance,
      balance,
      refreshBalance,
      sessionExpiresAt,
      sessionTimeRemaining,
      showSessionWarning5Min,
      showSessionWarning1Min,
      extendSession,
      sessionExpired,
      clearSessionExpired,
      reconnect,
      handleWalletError,
      activeStreamCount,
      setActiveStreamCount,
      streamRefreshTrigger,
      triggerStreamRefresh,
    ],
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

/**
 * Access the connected Stellar wallet.
 *
 * @returns {WalletContextValue} Wallet address/public key, connection and network state, and wallet actions.
 * @throws {Error} When called outside a `WalletProvider`.
 */
export function useWallet() {
  const context = useContext(WalletContext);

  if (!context) {
    throw new Error("useWallet must be used within WalletProvider");
  }

  return context;
}
