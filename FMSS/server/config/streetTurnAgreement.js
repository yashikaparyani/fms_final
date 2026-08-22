/**
 * The Street Turn Container and Chassis Transfer Agreement.
 *
 * A street turn hands a container and chassis from our driver to another
 * carrier. That is a transfer of possession, not a delivery, so the notice that
 * goes out is a contract rather than an FYI: it names both parties and their
 * SCACs, identifies the equipment, and is signed by the transferee before the
 * box changes hands.
 *
 * The clause text lives here rather than in the email template because it is
 * legal wording — it is reviewed and revised on its own schedule, and the
 * template should render whatever this file says without knowing what it means.
 * The same array fills the emailed copy and the page the transferee signs on,
 * so the two can never drift apart.
 *
 * Anything install-specific is overridable by environment variable, because
 * this file is code and a company's own name, SCAC and notice address are not.
 */

const TRANSFEROR = {
  name: process.env.STREET_TURN_TRANSFEROR_NAME || "S Line Transportation Inc",
  scac: process.env.STREET_TURN_TRANSFEROR_SCAC || "SLNY",
  email: process.env.STREET_TURN_TRANSFEROR_EMAIL || "ravi@slinettransport.com",
};

/** The state whose law governs, unless a load names another. */
const GOVERNING_LAW_STATE = process.env.STREET_TURN_GOVERNING_LAW || "California";

/**
 * The body of the agreement. `{{transferee}}` is the only substitution — every
 * other particular (equipment, locations, condition) is rendered as a labelled
 * table above these clauses, where a reader can actually find it.
 */
const CLAUSES = [
  {
    heading: "Purpose",
    body:
      "This Agreement governs the temporary transfer of possession and use of the " +
      "equipment identified above for a street turn move.",
  },
  {
    heading: "Use of Equipment",
    body:
      "Transferee may use the equipment only for lawful transportation and in " +
      "compliance with all applicable laws, port rules, terminal rules, and carrier " +
      "requirements.",
  },
  {
    heading: "Condition of Equipment",
    body:
      "The equipment is accepted in its current condition except as noted in " +
      "“Exceptions noted” above.",
  },
  {
    heading: "Responsibility",
    body:
      "Transferee is responsible for the equipment while in its possession, including " +
      "loss, damage, citations, fines, detention, and related charges, except for " +
      "pre-existing conditions caused by Transferor.",
  },
  {
    heading: "No Transfer of Ownership",
    body:
      "This Agreement transfers only possession and use rights, not ownership.",
  },
  {
    heading: "Insurance",
    body:
      "Each party represents that it maintains valid insurance as required by law.",
  },
  {
    heading: "Indemnity",
    body:
      "Transferee agrees to indemnify and hold harmless Transferor from claims arising " +
      "from Transferee’s possession or use of the equipment, except where caused by " +
      "Transferor’s negligence or pre-existing defects.",
  },
  {
    heading: "Governing Law",
    body: "This Agreement shall be governed by the laws of the State of {{state}}.",
  },
  {
    heading: "Entire Agreement",
    body:
      "This document contains the full agreement between the parties regarding this " +
      "equipment transfer.",
  },
];

const TITLE = "Street Turn Container and Chassis Transfer Agreement";

/** Fills the placeholders a clause may carry. */
const renderClause = (clause, { state }) => ({
  heading: clause.heading,
  body: clause.body.replace(/\{\{state\}\}/g, state || GOVERNING_LAW_STATE),
});

const clausesFor = ({ state } = {}) =>
  CLAUSES.map((clause) => renderClause(clause, { state }));

module.exports = {
  TITLE,
  TRANSFEROR,
  GOVERNING_LAW_STATE,
  CLAUSES,
  clausesFor,
};
