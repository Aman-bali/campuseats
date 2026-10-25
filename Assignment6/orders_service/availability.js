class StaticAvailability {
  constructor(unavailable = null) {
    if (unavailable === null) {
      const raw = process.env.UNAVAILABLE_ITEMS || "";
      this.unavailable = new Set(
        raw.split(",").map((x) => x.trim()).filter(Boolean)
      );
    } else {
      this.unavailable = new Set(unavailable);
    }
  }

  unavailable_among(itemIds) {
    return itemIds.filter((i) => this.unavailable.has(i));
  }
}

module.exports = {
  StaticAvailability,
};
