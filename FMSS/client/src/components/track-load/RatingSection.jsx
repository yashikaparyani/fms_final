import Card from "./Card";
import SectionHeader from "./SectionHeader";

const RatingSection = ({
  load,
  ratingScore,
  setRatingScore,
  ratingRemark,
  setRatingRemark,
  savingRating,
  onSave,
}) => (
  <Card>
    <SectionHeader label="Rate Completed Order" accent="#f59e0b" />
    <div className="p-5">
      {/* Existing rating display */}
      {load.staffRating?.score ? (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-green-50 border border-green-200 mb-4">
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((s) => (
              <span
                key={s}
                className="text-lg"
                style={{ color: s <= load.staffRating.score ? "#f59e0b" : "#d1d5db" }}
              >
                ★
              </span>
            ))}
          </div>
          <div>
            <span className="text-sm font-bold text-green-700">
              {load.staffRating.score}/5 rated
            </span>
            {load.staffRating.remark && (
              <span className="text-xs text-gray-500 ml-2">· {load.staffRating.remark}</span>
            )}
          </div>
        </div>
      ) : null}

      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
        {load.staffRating?.score ? "Update Rating" : "Submit Rating"}
      </p>

      <div className="flex flex-wrap gap-2.5 items-center">
        <select
          value={ratingScore}
          onChange={(e) => setRatingScore(e.target.value)}
          className="select min-w-[130px] w-auto"
        >
          <option value="">Select Score</option>
          {[5, 4, 3, 2, 1].map((s) => (
            <option key={s} value={s}>
              {s} / 5 {"★".repeat(s)}
            </option>
          ))}
        </select>

        <input
          value={ratingRemark}
          onChange={(e) => setRatingRemark(e.target.value)}
          placeholder="Add a remark (optional)"
          className="input flex-1 min-w-[180px]"
        />

        <button
          onClick={onSave}
          disabled={savingRating || !ratingScore}
          className={`btn ${
            savingRating || !ratingScore
              ? "btn-disabled bg-gray-200 text-gray-400 border-gray-200"
              : "bg-gray-900 text-white border-gray-900 hover:bg-gray-700"
          }`}
        >
          {savingRating ? "Saving…" : "Save Rating"}
        </button>
      </div>
    </div>
  </Card>
);

export default RatingSection;