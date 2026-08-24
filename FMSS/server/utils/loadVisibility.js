/**
 * What a carrier is allowed to see of an instant-dispatch load's money.
 *
 * The broker takes a percentage of what the customer pays and the carrier is
 * paid the rest. The carrier is shown their payout and nothing else — what the
 * customer pays is not their business, and putting it in front of them turns
 * every load into a negotiation about the split.
 *
 * Applied at the response boundary rather than by not storing the figure: the
 * office and the customer both need the full picture, and the load is one
 * document. So `amount` is rewritten to the payout on the way out, and the
 * fields that would give the gross away are removed.
 *
 * Only touches instant-dispatch loads. A load that came through bidding already
 * has its own answer to this — carriers see `vendorRate` and bid against it —
 * and nothing here should second-guess it.
 */

const CARRIER_ROLES = new Set(["fleetOwner", "driver"]);

/**
 * Anything that states, or lets somebody derive, the customer's price.
 *
 * `commissionPercent` is on the list because the payout plus the rate is the
 * gross — leaving the rate in would hand over the number by arithmetic.
 * `accounting` carries the receivables breakdown the amount was built from, and
 * the bid-flow rates have no meaning on an instant load anyway.
 */
const GROSS_BEARING_FIELDS = ["accounting", "targetRate", "margin", "vendorRate"];

/**
 * @param {object} load a lean load document
 * @param {string} role the viewer's role
 */
const maskLoadForViewer = (load, role) => {
  if (!load || !CARRIER_ROLES.has(role)) return load;
  if (load.dispatchMode !== "INSTANT") return load;

  const payout = load.commission?.carrierAmount;
  if (payout === undefined || payout === null) return load;

  const masked = { ...load };

  // The headline figure every carrier screen already reads. Rewritten rather
  // than removed so nothing downstream has to learn that this kind of load
  // keeps its money somewhere else.
  masked.amount = payout;

  masked.commission = { carrierAmount: payout };

  GROSS_BEARING_FIELDS.forEach((field) => {
    delete masked[field];
  });

  // Other carriers' offers are none of this carrier's business either — the
  // distances say who else is competing for the load.
  if (masked.instantDispatch) {
    masked.instantDispatch = {
      status: masked.instantDispatch.status,
      expiresAt: masked.instantDispatch.expiresAt,
      acceptedBy: masked.instantDispatch.acceptedBy,
      offers: (masked.instantDispatch.offers || []).filter((offer) =>
        sameCarrier(offer, load, role),
      ),
    };
  }

  return masked;
};

/**
 * Whether an offer row belongs to the carrier doing the looking.
 *
 * The load does not carry the viewer's carrier id, so this cannot resolve it
 * here without a lookup per load. The accepted carrier is the one case that can
 * be answered from the document, and it is the one that matters after
 * acceptance; before that, a carrier reads their offers from
 * /api/instant-dispatch/offers, which is scoped to them by the controller.
 */
const sameCarrier = (offer, load) =>
  String(offer.fleetOwnerId) === String(load.instantDispatch?.acceptedBy?.fleetOwnerId);

/** The list form. */
const maskLoadsForViewer = (loads, role) =>
  (loads || []).map((load) => maskLoadForViewer(load, role));

module.exports = { maskLoadForViewer, maskLoadsForViewer };
