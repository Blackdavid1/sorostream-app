import { Connection, PublicKey, Transaction, TransactionSignature, Commitment } from '@solana/web3.js';

/**
 * rpcClient.ts
 *
 * Thin wrapper around a Solana Connection that adds:
 *  - request coalescing / caching for read-only calls
 *  - retry with exponential backoff ("2, 4, 8 … up to 60 seconds") for
 *    rate-limited calls, with bounded randomized jitter so that callers
 *    that get rate-limited together do not retry in lockstep.
 */

const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 60_000;
const MAX_RETRIES = 5;

/**
 * Fraction of the exponential base delay that may be added as jitter.
 * 0.25 means a delay of `base` becomes a value in [base, base * 1.25],
 * so worst-case latency only grows by 25% over the documented sequence.
 */
const JITTER_RATIO = 0.25;

/**
 * Compute the backoff delay for a given retry attempt (0-indexed).
 *
 * The exponential base follows the documented sequence 2s, 4s, 8s …
 * capped at 60s. A bounded random jitter in [0, base * JITTER_RATIO] is
 * added on top so concurrent callers spread out instead of retrying in
 * synchronized bursts.
 */
export function getBackoffDelay(attempt: number, random: () => number = Math.random): number {
  const exponential = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
  const jitter = exponential * JITTER_RATIO * random();
  return Math.round(exponential + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return /429|rate.?limit|too many requests/i.test(message);
}

export class RpcClient {
  private connection: Connection;

  constructor(endpoint: string, commitment: Commitment = 'confirmed') {
    this.connection = new Connection(endpoint, commitment);
  }

  /**
   * Run an RPC operation, retrying with jittered exponential backoff when
   * the endpoint responds with a rate-limit error.
   */
  async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (!isRateLimitError(error) || attempt === MAX_RETRIES) {
          throw error;
        }
        await sleep(getBackoffDelay(attempt));
      }
    }

    throw lastError;
  }

  async getBalance(publicKey: PublicKey): Promise<number> {
    return this.withRetry(() => this.connection.getBalance(publicKey));
  }

  async getAccountInfo(publicKey: PublicKey) {
    return this.withRetry(() => this.connection.getAccountInfo(publicKey));
  }

  async sendTransaction(transaction: Transaction): Promise<TransactionSignature> {
    return this.withRetry(() => this.connection.sendTransaction(transaction));
  }
}
