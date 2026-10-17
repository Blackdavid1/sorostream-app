import { describe, it, expect } from 'vitest';
import { streamDryRun } from './streamDryRun';
import { calculateVestingSchedule } from './vesting';
import { calcWithdrawBreakdown } from './withdrawBreakdown';

describe('streamDryRun net-received with non-zero cliff', () => {
  const totalAmount = 1_000_000n;
  const startTime = 1_000_000;
  const duration = 1_000;
  const cliffDuration = 200;
  const feeBps = 100n; // 1%

  const stream = {
    totalAmount,
    startTime,
    duration,
    cliffDuration,
    feeBps,
  };

  const expectedNet = (claimable: bigint): bigint => {
    const fee = (claimable * feeBps) / 10_000n;
    return claimable - fee;
  };

  it('returns zero net-received at a checkpoint before the cliff', () => {
    const now = startTime + cliffDuration - 1;
    const result = streamDryRun(stream, now);

    const schedule = calculateVestingSchedule({
      totalAmount,
      startTime,
      duration,
      cliffDuration,
    });
    const claimable = schedule.claimableAt(now);
    expect(claimable).toBe(0n);

    const breakdown = calcWithdrawBreakdown(claimable, feeBps);
    expect(breakdown.fee).toBe(0n);
    expect(breakdown.net).toBe(0n);

    expect(result.claimable).toBe(0n);
    expect(result.fee).toBe(0n);
    expect(result.netReceived).toBe(0n);
  });

  it('returns the correct net-received at the cliff boundary checkpoint', () => {
    const now = startTime + cliffDuration;
    const result = streamDryRun(stream, now);

    const schedule = calculateVestingSchedule({
      totalAmount,
      startTime,
      duration,
      cliffDuration,
    });
    const claimable = schedule.claimableAt(now);
    expect(claimable).toBeGreaterThan(0n);

    const breakdown = calcWithdrawBreakdown(claimable, feeBps);
    expect(breakdown.net).toBe(expectedNet(claimable));

    expect(result.claimable).toBe(claimable);
    expect(result.fee).toBe(breakdown.fee);
    expect(result.netReceived).toBe(expectedNet(claimable));
  });

  it('applies the fee exactly once at checkpoints after the cliff', () => {
    const checkpoints = [
      startTime + cliffDuration + 1,
      startTime + cliffDuration + duration / 4,
      startTime + duration,
    ];

    const schedule = calculateVestingSchedule({
      totalAmount,
      startTime,
      duration,
      cliffDuration,
    });

    for (const now of checkpoints) {
      const result = streamDryRun(stream, now);
      const claimable = schedule.claimableAt(now);
      expect(claimable).toBeGreaterThan(0n);

      const breakdown = calcWithdrawBreakdown(claimable, feeBps);
      const expectedFee = (claimable * feeBps) / 10_000n;

      expect(breakdown.fee).toBe(expectedFee);
      expect(result.claimable).toBe(claimable);
      expect(result.fee).toBe(expectedFee);
      expect(result.netReceived).toBe(claimable - expectedFee);
      expect(result.netReceived).toBe(expectedNet(claimable));
    }
  });
});
