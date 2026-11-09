export const DEFAULT_SETTINGS = Object.freeze({
  blockSize: 15,
  lowDiamondValue: 1,
  highPriorityMinDiamonds: 100,
  highPriorityPauseMs: 10_000,
  alertDurationMs: 3_000,
});

const asPositiveInteger = (value, fallback) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
};

const firstDefined = (...values) => values.find((value) => value !== undefined && value !== null && value !== "");

function isFinalRepeat(repeatEnd) {
  return repeatEnd === true || repeatEnd === 1 || repeatEnd === "1";
}

export function normalizeGift(envelope) {
  if (!envelope || envelope.event !== "gift" || !envelope.data || typeof envelope.data !== "object") {
    return { kind: "ignored", reason: "not-gift" };
  }

  const data = envelope.data;
  const extended = data.extendedGiftInfo ?? data.extendedGift ?? {};
  const gift = data.gift ?? {};
  const giftInfo = gift.info ?? {};
  const user = data.user ?? {};

  const giftId = firstDefined(data.giftId, gift.id, gift.giftId, extended.giftId, "unknown-gift");
  const giftName = String(firstDefined(gift.name, data.giftName, data.gift_name, extended.name, extended.giftName, "presente"));
  const diamondValue = Number(firstDefined(
    gift.diamondCount,
    gift.diamond_count,
    giftInfo.diamondCount,
    giftInfo.diamond_count,
    data.diamondCount,
    data.diamond_count,
    extended.diamondCount,
    extended.diamond_count,
    extended.cost,
  ));
  const giftType = Number(firstDefined(gift.type, data.giftType, data.gift_type));
  const repeatEnd = firstDefined(data.repeatEnd, data.repeat_end);
  const streakable = giftType === 1;
  const repeatCount = asPositiveInteger(firstDefined(data.repeatCount, data.repeat_count), 1);
  const senderId = String(firstDefined(
    user.uniqueId,
    user.unique_id,
    user.displayId,
    user.id,
    user.userId,
    user.user_id,
    data.uniqueId,
    data.userId,
    data.nickname,
    "",
  )).trim();
  const senderName = String(firstDefined(
    user.nickname,
    user.displayName,
    user.display_name,
    user.uniqueId,
    user.displayId,
    data.nickname,
    data.uniqueId,
    "Pessoa da floresta",
  )).trim();

  if (!senderId) return { kind: "ignored", reason: "missing-sender" };
  if (!Number.isFinite(diamondValue) || diamondValue <= 0) {
    return { kind: "ignored", reason: "missing-gift-value", giftId, giftName };
  }
  if (streakable && !isFinalRepeat(repeatEnd)) {
    return { kind: "ignored", reason: "streak-in-progress", giftId, giftName, senderId };
  }

  return {
    kind: "gift",
    giftId: String(giftId),
    giftName,
    diamondValue,
    giftType,
    repeatCount,
    senderId,
    senderName,
  };
}

export class RoseQueueController {
  constructor(settings = {}, clock = () => Date.now()) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.settings.blockSize = asPositiveInteger(this.settings.blockSize, DEFAULT_SETTINGS.blockSize);
    this.settings.lowDiamondValue = asPositiveInteger(this.settings.lowDiamondValue, DEFAULT_SETTINGS.lowDiamondValue);
    this.settings.highPriorityMinDiamonds = asPositiveInteger(this.settings.highPriorityMinDiamonds, DEFAULT_SETTINGS.highPriorityMinDiamonds);
    this.settings.highPriorityPauseMs = asPositiveInteger(this.settings.highPriorityPauseMs, DEFAULT_SETTINGS.highPriorityPauseMs);
    this.settings.alertDurationMs = asPositiveInteger(this.settings.alertDurationMs, DEFAULT_SETTINGS.alertDurationMs);
    this.clock = clock;
    this.carryByDonor = new Map();
    this.pendingByDonor = new Map();
    this.roundRobin = [];
    this.current = null;
    this.nextAlertId = 1;
    this.pausedUntil = 0;
    this.lastResult = null;
  }

  handleEnvelope(envelope, at = this.clock()) {
    const normalized = normalizeGift(envelope);
    if (normalized.kind !== "gift") {
      this.lastResult = normalized;
      return normalized;
    }

    if (normalized.diamondValue >= this.settings.highPriorityMinDiamonds) {
      this.pause(at);
      this.lastResult = { kind: "high-priority", giftName: normalized.giftName, diamondValue: normalized.diamondValue };
      return this.lastResult;
    }

    if (normalized.diamondValue !== this.settings.lowDiamondValue) {
      this.lastResult = { kind: "ignored", reason: "not-low-value", giftName: normalized.giftName, diamondValue: normalized.diamondValue };
      return this.lastResult;
    }

    const previousCarry = this.carryByDonor.get(normalized.senderId) ?? 0;
    const total = previousCarry + normalized.repeatCount;
    const blocks = Math.floor(total / this.settings.blockSize);
    const remainder = total % this.settings.blockSize;
    this.carryByDonor.set(normalized.senderId, remainder);

    if (blocks > 0) {
      const existing = this.pendingByDonor.get(normalized.senderId);
      if (existing) {
        existing.blocks += blocks;
        existing.senderName = normalized.senderName;
      } else {
        this.pendingByDonor.set(normalized.senderId, { blocks, senderName: normalized.senderName });
        this.roundRobin.push(normalized.senderId);
      }
    }

    this.lastResult = { kind: "low-value", senderId: normalized.senderId, accumulated: remainder, blocksAdded: blocks };
    this.advance(at);
    return this.lastResult;
  }

  pause(at = this.clock()) {
    this.pausedUntil = Math.max(this.pausedUntil, at + this.settings.highPriorityPauseMs);
    if (this.current?.visible) {
      this.current.remainingMs = Math.max(0, this.current.displayUntil - at);
      this.current.visible = false;
      this.current.displayUntil = 0;
    }
  }

  advance(at = this.clock()) {
    if (at < this.pausedUntil) return;

    if (this.current && !this.current.visible) {
      this.current.visible = true;
      this.current.displayUntil = at + this.current.remainingMs;
      return;
    }

    if (this.current && at < this.current.displayUntil) return;
    this.current = null;

    while (this.roundRobin.length > 0) {
      const senderId = this.roundRobin.shift();
      const donor = this.pendingByDonor.get(senderId);
      if (!donor || donor.blocks <= 0) continue;

      donor.blocks -= 1;
      if (donor.blocks > 0) this.roundRobin.push(senderId);
      else this.pendingByDonor.delete(senderId);

      this.current = {
        id: this.nextAlertId++,
        senderId,
        senderName: donor.senderName,
        count: this.settings.blockSize,
        text: `${this.settings.blockSize} presentes de ${this.settings.lowDiamondValue} diamante`,
        visible: true,
        displayUntil: at + this.settings.alertDurationMs,
        remainingMs: this.settings.alertDurationMs,
      };
      return;
    }
  }

  snapshot(at = this.clock()) {
    this.advance(at);
    let pendingBlocks = 0;
    for (const donor of this.pendingByDonor.values()) pendingBlocks += donor.blocks;
    return {
      connected: false,
      paused: at < this.pausedUntil,
      current: this.current?.visible ? { ...this.current } : null,
      pendingBlocks,
      donorsWaiting: this.pendingByDonor.size,
      lastResult: this.lastResult,
    };
  }
}

