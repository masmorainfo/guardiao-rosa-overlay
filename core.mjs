export const DEFAULT_SETTINGS = Object.freeze({
  blockSize: 15,
  likeGoal: 1_000,
  highPriorityMinDiamonds: 100,
  alertDurationMs: 3_000,
  alertGapMs: 4_000,
  priorityGifts: [],
});

const asPositiveInteger = (value, fallback) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
};

const firstDefined = (...values) => values.find((value) => value !== undefined && value !== null && value !== "");

function normalizedGiftName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

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
    data.giftImageUrl,
    data.gift_image_url,
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
    data.coins,
    data.diamondValue,
    data.diamond_value,
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
    this.settings.likeGoal = asPositiveInteger(this.settings.likeGoal, DEFAULT_SETTINGS.likeGoal);
    this.settings.highPriorityMinDiamonds = asPositiveInteger(this.settings.highPriorityMinDiamonds, DEFAULT_SETTINGS.highPriorityMinDiamonds);
    this.settings.alertDurationMs = asPositiveInteger(this.settings.alertDurationMs, DEFAULT_SETTINGS.alertDurationMs);
    this.settings.alertGapMs = asPositiveInteger(this.settings.alertGapMs, DEFAULT_SETTINGS.alertGapMs);
    this.settings.priorityGifts = Array.isArray(this.settings.priorityGifts) ? this.settings.priorityGifts : [];
    this.clock = clock;
    this.carryByDonor = new Map();
    this.lastLikeTotals = new Map();
    this.totalLikes = 0;
    this.pendingByDonor = new Map();
    this.roundRobin = [];
    this.current = null;
    this.priorityQueue = [];
    this.priorityLocks = new Map();
    this.currentPriority = null;
    this.nextAlertId = 1;
    this.nextPriorityId = 1;
    this.nextAlertAt = 0;
    this.lastResult = null;
  }

  handleEnvelope(envelope, at = this.clock()) {
    if (envelope?.event === "like") return this.handleLikeEnvelope(envelope, at);
    if (envelope?.event === "priorityEnd") {
      return this.completePriority(envelope.data?.tokenId, at);
    }

    const normalized = normalizeGift(envelope);
    if (normalized.kind !== "gift") {
      this.lastResult = normalized;
      return normalized;
    }

    const profile = this.findPriorityProfile(normalized);
    if (profile) {
      const tokenId = globalThis.crypto?.randomUUID?.()
        ? `gf-${globalThis.crypto.randomUUID()}`
        : `gf-${at.toString(36)}-${this.nextPriorityId++}`;
      const job = {
        tokenId,
        giftId: normalized.giftId,
        giftName: normalized.giftName,
        senderId: normalized.senderId,
        senderName: normalized.senderName,
        videoSrc: profile.videoSrc,
        nativeDurationMs: asPositiveInteger(profile.nativeDurationMs, 0),
        nativeReadyAt: at + asPositiveInteger(profile.nativeDurationMs, 0),
        receivedAt: at,
      };
      this.priorityQueue.push(job);
      this.priorityLocks.set(tokenId, job);
      this.lastResult = { kind: "priority-queued", tokenId, giftName: normalized.giftName, senderName: normalized.senderName };
      this.advance(at);
      return this.lastResult;
    }

    if (normalized.diamondValue >= this.settings.highPriorityMinDiamonds) {
      this.lastResult = { kind: "unmapped-high-priority", giftName: normalized.giftName, diamondValue: normalized.diamondValue };
      return this.lastResult;
    }

    const contributedDiamonds = normalized.diamondValue * normalized.repeatCount;
    const previousCarry = this.carryByDonor.get(normalized.senderId) ?? 0;
    const total = previousCarry + contributedDiamonds;
    const blocks = Math.floor(total / this.settings.blockSize);
    const remainder = total % this.settings.blockSize;
    this.carryByDonor.set(normalized.senderId, remainder);

    if (blocks > 0) {
      for (let i = 0; i < blocks; i += 1) {
        this.enqueueAlert(normalized.senderId, {
          mode: "gift",
          senderName: normalized.senderName,
          count: this.settings.blockSize,
          text: `${this.settings.blockSize} diamantes acumulados`,
          queueLabel: `${this.settings.blockSize} diamantes`,
          giftName: normalized.giftName,
          giftIconUrl: normalized.giftIconUrl,
          fallbackEmoji: normalized.fallbackEmoji,
        });
      }
    }

    this.lastResult = {
      kind: "diamond-progress",
      senderId: normalized.senderId,
      contributedDiamonds,
      accumulatedDiamonds: remainder,
      blocksAdded: blocks,
    };
    this.advance(at);
    return this.lastResult;
  }

  findPriorityProfile(gift) {
    const giftName = normalizedGiftName(gift.giftName);
    return this.settings.priorityGifts.find((profile) => {
      const giftIds = (profile.giftIds ?? []).map(String);
      if (giftIds.includes(String(gift.giftId))) return true;
      return (profile.aliases ?? []).some((alias) => normalizedGiftName(alias) === giftName);
    }) ?? null;
  }

  completePriority(tokenId, at = this.clock()) {
    const key = String(tokenId ?? "");
    const job = this.priorityLocks.get(key);
    if (!job) {
      this.lastResult = { kind: "priority-end-ignored", tokenId: key, reason: "unknown-token" };
      return this.lastResult;
    }

    this.priorityLocks.delete(key);
    this.priorityQueue = this.priorityQueue.filter((pending) => pending.tokenId !== key);
    if (this.currentPriority?.tokenId === key) this.currentPriority = null;
    if (this.priorityLocks.size === 0) {
      this.nextAlertAt = Math.max(this.nextAlertAt, at + this.settings.alertGapMs);
    }
    this.lastResult = { kind: "priority-ended", tokenId: key, giftName: job.giftName };
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

  advance(at = this.clock()) {
    if (this.current && at >= this.current.displayUntil) {
      const alertEndedAt = this.current.displayUntil;
      this.current = null;
      this.nextAlertAt = Math.max(this.nextAlertAt, alertEndedAt + this.settings.alertGapMs);
    }

    if (this.current) return;

    if (!this.currentPriority && this.priorityQueue.length > 0) {
      const nextPriority = this.priorityQueue[0];
      if (at >= nextPriority.nativeReadyAt) this.currentPriority = this.priorityQueue.shift();
    }

    if (this.priorityLocks.size > 0) return;
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
      paused: this.priorityLocks.size > 0,
      priorityPending: this.priorityQueue.length,
      priorityActive: this.currentPriority ? { ...this.currentPriority } : null,
      current: this.current?.visible ? { ...this.current } : null,
      pendingBlocks,
      donorsWaiting: this.pendingByDonor.size,
      nextAlerts,
      lastResult: this.lastResult,
    };
  }
}
