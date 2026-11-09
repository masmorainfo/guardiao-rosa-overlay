export const DEFAULT_SETTINGS = Object.freeze({
  blockSize: 15,
  lowDiamondValue: 1,
  likeGoal: 1_000,
  highPriorityMinDiamonds: 100,
  highPriorityPauseMs: 10_000,
  alertDurationMs: 3_000,
  alertGapMs: 4_000,
});

const asPositiveInteger = (value, fallback) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
};

const firstDefined = (...values) => values.find((value) => value !== undefined && value !== null && value !== "");

function firstHttpsImageUrl(...values) {
  for (const value of values) {
    const candidates = typeof value === "string"
      ? [value]
      : Array.isArray(value)
        ? value
        : value && typeof value === "object"
          ? [
              ...(Array.isArray(value.urlList) ? value.urlList : []),
              ...(Array.isArray(value.url_list) ? value.url_list : []),
              value.url,
          value.imageUrl,
          value.image_url,
          value.giftImage,
          value.gift_image,
          value.src,
            ]
          : [];
    const url = candidates.find((item) => typeof item === "string" && /^https:\/\//i.test(item));
    if (url) return url;
  }
  return "";
}

function giftFallbackEmoji(name) {
  if (/rose|rosa/i.test(name)) return "🌹";
  if (/corgi|dog|cachorro/i.test(name)) return "🐶";
  if (/te\s*amo|love|heart|cora[cç][aã]o/i.test(name)) return "❤️";
  return "🎁";
}

function isFinalRepeat(repeatEnd) {
  return repeatEnd === true || repeatEnd === 1 || repeatEnd === "1";
}

export function normalizeGift(envelope) {
  if (!envelope || envelope.event !== "gift" || !envelope.data || typeof envelope.data !== "object") {
    return { kind: "ignored", reason: "not-gift" };
  }

  const data = envelope.data;
  const extended = data.extendedGiftInfo ?? data.extendedGift ?? {};
  const details = data.giftDetails ?? data.gift_details ?? {};
  const gift = data.gift ?? {};
  const giftExtended = gift.extendedGiftInfo ?? gift.extendedGift ?? {};
  const giftDetails = gift.giftDetails ?? gift.gift_details ?? {};
  const giftInfo = gift.info ?? {};
  const user = data.user ?? {};

  const giftId = firstDefined(data.giftId, gift.id, gift.giftId, extended.giftId, "unknown-gift");
  const giftName = String(firstDefined(gift.name, data.giftName, data.gift_name, details.name, details.giftName, details.gift_name, extended.name, extended.giftName, giftExtended.name, giftDetails.name, giftDetails.giftName, "presente"));
  const giftIconUrl = firstHttpsImageUrl(
    gift.image,
    gift.icon,
    gift.giftImage,
    gift.gift_image,
    gift.imageUrl,
    gift.image_url,
    details.giftImage,
    details.gift_image,
    details.image,
    details.icon,
    extended.image,
    extended.icon,
    giftExtended.image,
    giftExtended.icon,
    giftDetails.giftImage,
    giftDetails.gift_image,
    giftDetails.image,
    giftDetails.icon,
    data.giftImage,
    data.gift_image,
    data.imageUrl,
    data.image_url,
    data.giftPictureUrl,
  );
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
    giftIconUrl,
    fallbackEmoji: giftFallbackEmoji(giftName),
    senderId,
    senderName,
  };
}

export function normalizeLike(envelope) {
  if (!envelope || envelope.event !== "like" || !envelope.data || typeof envelope.data !== "object") {
    return { kind: "ignored", reason: "not-like" };
  }

  const data = envelope.data;
  const user = data.user ?? {};
  const senderId = String(firstDefined(user.uniqueId, user.unique_id, user.displayId, user.id, data.uniqueId, data.userId, "")).trim();
  const senderName = String(firstDefined(user.nickname, user.displayName, user.display_name, user.uniqueId, user.displayId, data.nickname, data.uniqueId, "")).trim();
  const countValue = Number(firstDefined(data.likeCount, data.like_count, data.count, data.likeMessage?.count, data.like_message?.count, 0));
  const totalValue = Number(firstDefined(data.totalLikeCount, data.total_like_count, data.total, data.likeMessage?.total, data.like_message?.total));

  return {
    kind: "like",
    senderId,
    senderName,
    count: Number.isSafeInteger(countValue) && countValue > 0 ? countValue : 0,
    total: Number.isSafeInteger(totalValue) && totalValue >= 0 ? totalValue : null,
  };
}

export class RoseQueueController {
  constructor(settings = {}, clock = () => Date.now()) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.settings.blockSize = asPositiveInteger(this.settings.blockSize, DEFAULT_SETTINGS.blockSize);
    this.settings.lowDiamondValue = asPositiveInteger(this.settings.lowDiamondValue, DEFAULT_SETTINGS.lowDiamondValue);
    this.settings.likeGoal = asPositiveInteger(this.settings.likeGoal, DEFAULT_SETTINGS.likeGoal);
    this.settings.highPriorityMinDiamonds = asPositiveInteger(this.settings.highPriorityMinDiamonds, DEFAULT_SETTINGS.highPriorityMinDiamonds);
    this.settings.highPriorityPauseMs = asPositiveInteger(this.settings.highPriorityPauseMs, DEFAULT_SETTINGS.highPriorityPauseMs);
    this.settings.alertDurationMs = asPositiveInteger(this.settings.alertDurationMs, DEFAULT_SETTINGS.alertDurationMs);
    this.settings.alertGapMs = asPositiveInteger(this.settings.alertGapMs, DEFAULT_SETTINGS.alertGapMs);
    this.clock = clock;
    this.carryByDonor = new Map();
    this.lastLikeTotals = new Map();
    this.totalLikes = 0;
    this.pendingByDonor = new Map();
    this.roundRobin = [];
    this.current = null;
    this.nextAlertId = 1;
    this.pausedUntil = 0;
    this.nextAlertAt = 0;
    this.lastResult = null;
  }

  handleEnvelope(envelope, at = this.clock()) {
    if (envelope?.event === "like") return this.handleLikeEnvelope(envelope, at);

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
      for (let i = 0; i < blocks; i += 1) {
        this.enqueueAlert(normalized.senderId, {
          mode: "gift",
          senderName: normalized.senderName,
          count: this.settings.blockSize,
          text: `${this.settings.blockSize} presentes de ${this.settings.lowDiamondValue} diamante`,
          queueLabel: `${this.settings.blockSize} presentes`,
          giftName: normalized.giftName,
          giftIconUrl: normalized.giftIconUrl,
          fallbackEmoji: normalized.fallbackEmoji,
        });
      }
    }

    this.lastResult = { kind: "low-value", senderId: normalized.senderId, accumulated: remainder, blocksAdded: blocks };
    this.advance(at);
    return this.lastResult;
  }

  handleLikeEnvelope(envelope, at = this.clock()) {
    const normalized = normalizeLike(envelope);
    if (normalized.kind !== "like") {
      this.lastResult = normalized;
      return normalized;
    }

    let delta = normalized.count;
    if (normalized.total !== null) {
      const key = normalized.senderId || "__room__";
      const previous = this.lastLikeTotals.get(key);
      if (previous !== undefined && delta <= 0) delta = Math.max(0, normalized.total - previous);
      this.lastLikeTotals.set(key, normalized.total);
    }

    if (delta <= 0) {
      this.lastResult = { kind: "ignored", reason: "like-count-unavailable" };
      return this.lastResult;
    }

    const previousTotal = this.totalLikes;
    this.totalLikes += delta;
    const milestonesBefore = Math.floor(previousTotal / this.settings.likeGoal);
    const milestonesAfter = Math.floor(this.totalLikes / this.settings.likeGoal);
    const alertsAdded = milestonesAfter - milestonesBefore;

    for (let i = 0; i < alertsAdded; i += 1) {
      this.enqueueAlert(normalized.senderId || `__like-${this.nextAlertId}`, {
        mode: "likes",
        senderName: normalized.senderName || "quem curtiu",
        count: this.settings.likeGoal,
        text: `Meta de ${this.settings.likeGoal.toLocaleString("pt-BR")} curtidas alcançada`,
        queueLabel: `${this.settings.likeGoal.toLocaleString("pt-BR")} curtidas`,
        fallbackEmoji: "💛",
      });
    }

    this.lastResult = { kind: "like-progress", added: delta, total: this.totalLikes, alertsAdded };
    this.advance(at);
    return this.lastResult;
  }

  enqueueAlert(senderId, alert) {
    const donor = this.pendingByDonor.get(senderId);
    if (donor) {
      donor.blocks.push(alert);
      donor.senderName = alert.senderName;
      return;
    }

    this.pendingByDonor.set(senderId, { blocks: [alert], senderName: alert.senderName });
    const currentDonorIndex = this.current ? this.roundRobin.indexOf(this.current.senderId) : -1;
    if (currentDonorIndex >= 0) this.roundRobin.splice(currentDonorIndex, 0, senderId);
    else this.roundRobin.push(senderId);
  }

  pause(at = this.clock()) {
    this.pausedUntil = Math.max(this.pausedUntil, at + this.settings.highPriorityPauseMs);
    this.nextAlertAt = Math.max(this.nextAlertAt, this.pausedUntil + this.settings.alertGapMs);
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
    if (this.current) {
      const alertEndedAt = this.current.displayUntil;
      this.current = null;
      this.nextAlertAt = Math.max(this.nextAlertAt, alertEndedAt + this.settings.alertGapMs);
    }
    if (at < this.nextAlertAt) return;

    while (this.roundRobin.length > 0) {
      const senderId = this.roundRobin.shift();
      const donor = this.pendingByDonor.get(senderId);
      if (!donor || donor.blocks.length <= 0) continue;

      const alert = donor.blocks.shift();
      if (donor.blocks.length > 0) this.roundRobin.push(senderId);
      else this.pendingByDonor.delete(senderId);

      this.current = {
        id: this.nextAlertId++,
        senderId,
        ...alert,
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
    for (const donor of this.pendingByDonor.values()) pendingBlocks += donor.blocks.length;
    const nextAlerts = [];
    if (this.current && !this.current.visible) {
      nextAlerts.push({
        senderId: this.current.senderId,
        senderName: this.current.senderName,
        count: this.current.count,
        mode: this.current.mode,
        queueLabel: this.current.queueLabel,
        resumesAfterPriority: true,
      });
    }
    const donorIds = [...this.roundRobin];
    const blocksByDonor = new Map(
      [...this.pendingByDonor].map(([senderId, donor]) => [senderId, donor.blocks.length]),
    );
    while (donorIds.length > 0 && nextAlerts.length < 5) {
      const senderId = donorIds.shift();
      const donor = this.pendingByDonor.get(senderId);
      const blocks = blocksByDonor.get(senderId) ?? 0;
      if (!donor || blocks <= 0) continue;
      const alertIndex = donor.blocks.length - blocks;
      nextAlerts.push({ senderId, ...donor.blocks[alertIndex], resumesAfterPriority: false });
      if (blocks > 1) {
        blocksByDonor.set(senderId, blocks - 1);
        donorIds.push(senderId);
      } else {
        blocksByDonor.delete(senderId);
      }
    }
    return {
      connected: false,
      paused: at < this.pausedUntil,
      current: this.current?.visible ? { ...this.current } : null,
      pendingBlocks,
      donorsWaiting: this.pendingByDonor.size,
      nextAlerts,
      lastResult: this.lastResult,
    };
  }
}

