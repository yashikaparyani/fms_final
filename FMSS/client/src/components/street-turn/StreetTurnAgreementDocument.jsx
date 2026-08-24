/**
 * The Street Turn Container and Chassis Transfer Agreement, rendered.
 *
 * The server builds the agreement once (services/streetTurnAgreementService.js)
 * so the emailed copy and the signed copy cannot say different things. This is
 * the same idea one level up: the partner's signing page and the office's copy
 * render from this one component, so what an admin reads is laid out exactly as
 * what the transferee signed.
 *
 * Purely presentational — it takes a built agreement and shows it. Fetching,
 * signing and permissions all belong to the screens that use it.
 */

/** A titled block, the way each part of the paper agreement is separated. */
export const Section = ({ title, children, className = "" }) => (
  <section className={`mt-6 ${className}`}>
    <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-400 mb-3 pb-2 border-b border-hairline">
      {title}
    </h3>
    {children}
  </section>
);

/** One party's identity block — company, SCAC and notice address. */
export const Party = ({ title, party }) => (
  <div className="rounded-xl border border-hairline bg-ink-50 p-4">
    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-400">
      {title}
    </p>
    <p className="text-sm font-extrabold text-ink-900 mt-1">{party?.name || "—"}</p>
    {party?.scac ? (
      <p className="text-xs text-ink-500 mt-0.5">SCAC: {party.scac}</p>
    ) : null}
    {party?.email ? (
      <p className="text-xs text-ink-500 break-all">{party.email}</p>
    ) : null}
    {/* Who executed it on that side, where the document names someone. */}
    {party?.signerName ? (
      <p className="text-xs text-ink-500 mt-1">
        {party.signerName}
        {party.signerTitle ? `, ${party.signerTitle}` : ""}
      </p>
    ) : null}
  </div>
);

/** A labelled particular. Hides itself when there is nothing to state. */
export const Detail = ({ label, value, className = "" }) =>
  value ? (
    <div className={className}>
      <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">
        {label}
      </dt>
      <dd className="text-sm font-semibold text-ink-800 break-words">{value}</dd>
    </div>
  ) : null;

const StreetTurnAgreementDocument = ({ agreement = {}, loadId, note, showTitle = true }) => {
  const { transferor = {}, transferee = {}, equipment = {}, clauses = [] } = agreement;

  return (
    <div>
      {showTitle && (
        <>
          <h2 className="text-xl font-extrabold text-ink-900 text-center">
            {agreement.title || "Street Turn Transfer Agreement"}
          </h2>
          <p className="text-sm text-ink-500 text-center mt-1 mb-6">
            Load {loadId}
            {agreement.dateText ? ` · entered into as of ${agreement.dateText}` : ""}
          </p>
        </>
      )}

      {/* The two parties, side by side as they appear on the paper form. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Party title="Transferor" party={transferor} />
        <Party title="Transferee" party={transferee} />
      </div>

      <Section title="Equipment">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Detail label="Container number" value={equipment.containerNo} />
          <Detail label="Container type" value={equipment.containerType} />
          <Detail label="Chassis number" value={equipment.chassisNo} />
          <Detail label="Shipping line" value={agreement.shippingLine} />
          <Detail label="Pickup / transfer location" value={equipment.transferLocation} />
          <Detail label="Delivery / return location" value={equipment.returnLocation} />
          <Detail label="Chassis company" value={agreement.chassisCompany} />
          <Detail label="Exceptions noted" value={equipment.condition} />
        </dl>
      </Section>

      {note ? (
        <p className="mt-4 rounded-lg bg-ink-50 border border-hairline p-3 text-sm text-ink-600">
          <span className="font-bold text-ink-800">Note from dispatch:</span> {note}
        </p>
      ) : null}

      {/* The terms in full. Asking someone to execute a document they were
          never shown is not a signature anybody would want to rely on — and
          the office reading it back is entitled to the same complete text. */}
      <Section title="Agreement terms">
        <ol className="list-decimal pl-5 space-y-3 text-sm text-ink-600 leading-relaxed">
          {clauses.map((clause) => (
            <li key={clause.heading}>
              <span className="font-bold text-ink-800">{clause.heading}. </span>
              {clause.body}
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
};

export default StreetTurnAgreementDocument;
