const {
  TITLE,
  TRANSFEROR,
  GOVERNING_LAW_STATE,
  clausesFor,
} = require("../config/streetTurnAgreement");

/**
 * Assembles the Street Turn Container and Chassis Transfer Agreement for one
 * load.
 *
 * One builder, two consumers: the emailed copy and the page the transferee
 * signs on. Building it in each place separately is how the copy someone signs
 * ends up saying something different from the copy they were sent, which on a
 * transfer-of-possession document is the whole ballgame.
 *
 * Everything here is derived from what was stored on the load at confirmation
 * time — see Load.streetTurn — so re-rendering the agreement months later
 * produces the same document, not one reflecting today's masters.
 */

const trimmed = (value) => String(value ?? "").trim();

const placeText = (stop) =>
  [stop?.company, stop?.city, stop?.state].filter(Boolean).join(", ");

const formatDate = (date) =>
  new Date(date || Date.now()).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

/**
 * A street turn moves an empty container, which is the point of the manoeuvre —
 * the box is re-used rather than returned. The load's `containerType` is a size
 * (40 HC, 20, …), so the two are combined rather than one standing in for the
 * other.
 */
const containerTypeText = (load) => {
  const size = trimmed(load.containerType);
  return size ? `${size} — Empty Container` : "Empty Container";
};

const buildStreetTurnAgreement = ({ load, streetTurn = {}, signerName, signerTitle }) => {
  const state = trimmed(streetTurn.governingLawState) || GOVERNING_LAW_STATE;

  return {
    title: TITLE,
    dateText: formatDate(streetTurn.confirmedAt),

    transferor: {
      name: TRANSFEROR.name,
      scac: TRANSFEROR.scac,
      email: TRANSFEROR.email,
      // Who confirmed the street turn on our side. Filled where we have it so
      // the transferor block is not a row of blank lines on a document we sent.
      signerName: trimmed(signerName),
      signerTitle: trimmed(signerTitle),
    },

    transferee: {
      name: trimmed(streetTurn.deliveryPartner) || "Transferee",
      scac: trimmed(streetTurn.transfereeScac),
      email: trimmed(streetTurn.deliveryPartnerEmail),
    },

    equipment: {
      containerNo: trimmed(load.containerNo),
      containerType: containerTypeText(load),
      chassisNo: trimmed(load.chassisNo),
      transferLocation:
        trimmed(streetTurn.transferLocation) ||
        placeText(load.pickup || load.pickups?.[0]),
      returnLocation:
        trimmed(streetTurn.returnLocation) ||
        trimmed(load.emptyReturn) ||
        placeText(load.drop || load.drops?.[0]),
      // "None" rather than blank: the agreement says the equipment is accepted
      // as-is *except as noted here*, so an empty value would read as an
      // unanswered question on a document about liability for damage.
      condition: trimmed(streetTurn.equipmentCondition) || "None",
    },

    shippingLine: trimmed(streetTurn.shippingLine),
    chassisCompany: trimmed(streetTurn.chassisCompany),
    governingLawState: state,
    clauses: clausesFor({ state }),
  };
};

module.exports = { buildStreetTurnAgreement };
