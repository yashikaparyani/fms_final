import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import SignaturePad from "../components/onboarding/SignaturePad";
import StreetTurnAgreementDocument, {
  Section,
} from "../components/street-turn/StreetTurnAgreementDocument";
import api from "../api";

/**
 * The street turn partner's acknowledgement page.
 *
 * Reached from a one-off link in the confirmation email. The partner has no
 * account here — the token in the URL is the whole authorisation — so this page
 * is deliberately outside every layout and guard, and shows only what the
 * partner needs to identify the container they are accepting. No customer, no
 * rate.
 *
 * Their IP and user agent are recorded server-side when they sign, because a
 * street turn moves a container out of our driver's custody and "we emailed
 * them" is not something anyone wants to rely on in a dispute.
 */

const labelClass = "block text-sm font-semibold text-ink-700 mb-1.5";
const inputClass =
  "w-full px-3 py-2.5 border border-ink-300 rounded-lg text-sm bg-surface placeholder:text-ink-400 transition-colors focus:outline-none focus:ring-2 focus:ring-accent-600/30 focus:border-accent-600";

const StreetTurnSign = () => {
  const { token } = useParams();

  const [detail, setDetail] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  const [signedName, setSignedName] = useState("");
  const [signedTitle, setSignedTitle] = useState("");
  const [company, setCompany] = useState("");
  const [note, setNote] = useState("");
  const [signatureData, setSignatureData] = useState("");

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    api
      .get(`/street-turn/public/${token}`)
      .then(({ data }) => {
        if (cancelled) return;
        setDetail(data);
        // Pre-filled from the agreement's transferee block — the partner should
        // not have to retype the company we already named on the document.
        setCompany(data.agreement?.transferee?.name || "");
        if (data.alreadySigned) setDone(true);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(
            err.response?.data?.message ||
              "This link could not be opened. Ask the office to send a new one.",
          );
        }
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = async () => {
    setError("");

    if (!signedName.trim() || !signedTitle.trim()) {
      return setError("Your name and title are both required.");
    }
    if (!signatureData) {
      return setError("Please sign in the box above.");
    }

    try {
      setSaving(true);
      const { data } = await api.post(`/street-turn/public/${token}/sign`, {
        signedName,
        signedTitle,
        company,
        note,
        signatureData,
      });
      setDetail(data);
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.message || "Could not record your signature.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Shell>
        <p className="text-center text-sm text-ink-500 py-10">Opening your link…</p>
      </Shell>
    );
  }

  if (loadError) {
    return (
      <Shell>
        <div className="text-center py-6">
          <ErrorOutlineIcon style={{ fontSize: 56 }} className="text-bad-500" />
          <h2 className="text-lg font-extrabold text-ink-900 mt-3">Link unavailable</h2>
          <p className="text-sm text-ink-500 mt-2">{loadError}</p>
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div className="text-center py-6">
          <CheckCircleOutlineIcon style={{ fontSize: 56 }} className="text-good-600" />
          <h2 className="text-lg font-extrabold text-ink-900 mt-3">
            Acknowledgement recorded
          </h2>
          <p className="text-sm text-ink-500 mt-2 leading-relaxed">
            Thank you. Load <strong className="text-ink-800">{detail?.loadId}</strong> is
            recorded as accepted by {detail?.signedName || "you"}
            {detail?.signedAt
              ? ` on ${new Date(detail.signedAt).toLocaleString()}`
              : ""}
            .
          </p>
          <p className="text-xs text-ink-400 mt-3">
            You can close this page. A copy has been sent to our office.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* Shared with the office's copy of this load, so the transferee and the
          admin reading it back are looking at the same document. */}
      <StreetTurnAgreementDocument
        agreement={detail?.agreement || {}}
        loadId={detail?.loadId}
        note={detail?.note}
      />

      <Section title="E-signature — Transferee">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>
            Your name <span className="text-bad-600">*</span>
          </label>
          <input
            className={inputClass}
            value={signedName}
            onChange={(e) => setSignedName(e.target.value)}
            placeholder="Jane Doe"
            disabled={saving}
          />
        </div>
        <div>
          <label className={labelClass}>
            Title <span className="text-bad-600">*</span>
          </label>
          <input
            className={inputClass}
            value={signedTitle}
            onChange={(e) => setSignedTitle(e.target.value)}
            placeholder="Dispatch Manager"
            disabled={saving}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Company</label>
          <input
            className={inputClass}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            disabled={saving}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Anything to note? (optional)</label>
          <textarea
            rows={2}
            className={inputClass}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Seal number, condition on arrival…"
            disabled={saving}
          />
        </div>
      </div>

      <div className="mt-5">
        <label className={labelClass}>
          Signature <span className="text-bad-600">*</span>
        </label>
        <SignaturePad onChange={setSignatureData} disabled={saving} />
      </div>
      </Section>

      {error && (
        <p className="mt-4 rounded-lg bg-bad-50 border border-bad-100 px-3 py-2 text-sm font-semibold text-bad-700 text-center">
          {error}
        </p>
      )}

      <button
        onClick={submit}
        disabled={saving}
        className={`mt-6 w-full px-4 py-3 rounded-lg text-sm font-bold text-white bg-accent-600 shadow-lg transition-all hover:bg-accent-700 active:translate-y-px ${
          saving ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        {saving ? "Recording…" : "Sign and confirm"}
      </button>

      <p className="mt-3 text-center text-xs text-ink-400 leading-relaxed">
        By signing you confirm you are authorised to accept this container. The date,
        time and your IP address are recorded with your signature.
      </p>
    </Shell>
  );
};

const Shell = ({ children }) => (
  <div className="min-h-screen brand-gradient flex items-center justify-center p-4">
    <div className="w-full max-w-2xl py-8">
      <div className="mb-6 flex flex-col items-center gap-2">
        <div className="p-3 rounded-2xl bg-accent-600 shadow-lg">
          <LocalShippingOutlinedIcon className="text-white" style={{ width: 32, height: 32 }} />
        </div>
        <h1 className="text-2xl font-extrabold tracking-wide text-white">
          S&nbsp;LINE&nbsp;<span className="text-accent-500">TRANSPORT</span>
        </h1>
        <p className="text-xs font-medium tracking-wide text-white/60">
          Street turn acknowledgement
        </p>
      </div>

      <div className="bg-surface rounded-2xl shadow-2xl p-6 sm:p-8">{children}</div>
    </div>
  </div>
);

export default StreetTurnSign;
