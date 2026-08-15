import { useEffect, useMemo, useState } from "react";
import PlaceIcon from "@mui/icons-material/Place";
import TuneIcon from "@mui/icons-material/Tune";
import SaveIcon from "@mui/icons-material/Save";
import UndoIcon from "@mui/icons-material/Undo";
import LockIcon from "@mui/icons-material/Lock";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import api from "../../api";
import { uiStyles } from "../../style/uiStyles";
import { notify } from "../../utils/swal";

// ─── Permissions ──────────────────────────────────────────────────────────────
// Admin-only. Two questions, two views:
//
//   Locations — who sees what location. A grid of staff against locations,
//               because the question an admin actually asks is "who can see
//               Chicago?", and a per-person form makes that unanswerable without
//               opening every person in turn.
//
//   Modules   — what one person may do. Per-person rather than a grid: there are
//               thirty-odd permissions and putting them on a second axis of the
//               same table produces something nobody can read.
//
// Edits are held as a draft and saved together. The alternative — a request per
// checkbox — turns a normal "move three people to the new branch" into ten
// silent writes with no way to review before committing, and no way to undo.
// ─────────────────────────────────────────────────────────────────────────────

const sameSet = (a = [], b = []) => {
  if (a.length !== b.length) return false;
  const setB = new Set(b.map(String));
  return a.every((value) => setB.has(String(value)));
};

const Permissions = () => {
  const [tab, setTab] = useState("locations");

  const [staff, setStaff] = useState([]);
  const [locations, setLocations] = useState([]);
  const [modules, setModules] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");

  // userId → { locations, defaultLocation, permissions }. Only the keys actually
  // edited are present, so an untouched row is never sent.
  const [draft, setDraft] = useState({});

  const load = async () => {
    try {
      const [staffRes, catalogRes] = await Promise.all([
        api.get("/staff"),
        api.get("/staff/permission-catalog"),
      ]);
      setStaff(staffRes.data);
      setLocations(catalogRes.data.locations || []);
      setModules(catalogRes.data.modules || []);
      setTemplates(catalogRes.data.templates || []);

      const firstStaff = staffRes.data.find((s) => s.role === "staff");
      setSelectedId((current) => current || firstStaff?._id || "");
    } catch (err) {
      notify.error(err.response?.data?.message || "Failed to load permissions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  /** The effective value for a user — their draft edit if there is one, else saved. */
  const valueFor = (member, key) => {
    const edited = draft[member._id];
    if (edited && edited[key] !== undefined) return edited[key];

    if (key === "locations") return member.locations.map((l) => l._id || l);
    if (key === "defaultLocation")
      return member.defaultLocation ? String(member.defaultLocation) : "";
    return member.permissions || [];
  };

  const editDraft = (memberId, patch) =>
    setDraft((current) => ({
      ...current,
      [memberId]: { ...current[memberId], ...patch },
    }));

  const dirtyIds = useMemo(
    () =>
      Object.keys(draft).filter((id) => {
        const member = staff.find((s) => s._id === id);
        if (!member) return false;
        const edit = draft[id];

        if (
          edit.locations !== undefined &&
          !sameSet(
            edit.locations,
            member.locations.map((l) => l._id || l),
          )
        )
          return true;

        if (
          edit.defaultLocation !== undefined &&
          String(edit.defaultLocation || "") !==
            String(member.defaultLocation || "")
        )
          return true;

        if (
          edit.permissions !== undefined &&
          !sameSet(edit.permissions, member.permissions || [])
        )
          return true;

        return false;
      }),
    [draft, staff],
  );

  const toggleLocation = (member, locationId) => {
    const current = valueFor(member, "locations").map(String);
    const next = current.includes(String(locationId))
      ? current.filter((id) => id !== String(locationId))
      : [...current, String(locationId)];

    const currentDefault = String(valueFor(member, "defaultLocation") || "");
    const patch = { locations: next };

    // The sign-in location must stay inside the set — the server would silently
    // re-point it otherwise, and the grid would then disagree with the truth.
    if (!next.includes(currentDefault)) patch.defaultLocation = next[0] || "";

    editDraft(member._id, patch);
  };

  const togglePermission = (member, key) => {
    const current = valueFor(member, "permissions");
    const next = current.includes(key)
      ? current.filter((k) => k !== key)
      : [...current, key];
    editDraft(member._id, { permissions: next });
  };

  const toggleModule = (member, module) => {
    const current = valueFor(member, "permissions");
    const keys = module.actions.map((a) => a.key);
    const hasAll = keys.every((key) => current.includes(key));

    // Whole-module toggle: ticking a module grants every action in it, which is
    // what "give them Loads" means to the person asking for it.
    const next = hasAll
      ? current.filter((key) => !keys.includes(key))
      : [...new Set([...current, ...keys])];

    editDraft(member._id, { permissions: next });
  };

  const applyTemplate = (member, templateKey) => {
    const template = templates.find((t) => t.key === templateKey);
    editDraft(member._id, { permissions: template ? [...template.permissions] : [] });
  };

  const discard = () => setDraft({});

  const save = async () => {
    if (!dirtyIds.length) return;

    try {
      setSaving(true);

      const assignments = dirtyIds.map((id) => ({
        userId: id,
        ...draft[id],
      }));

      const { data } = await api.put("/staff/access", { assignments });

      if (data.failedCount) {
        notify.warning(data.message);
        data.failed.forEach((failure) => notify.error(failure.message));

        // Keep the rows that failed so they can be corrected; drop the rest,
        // which are now saved.
        const stillFailing = new Set(data.failed.map((f) => f.userId));
        setDraft((current) =>
          Object.fromEntries(
            Object.entries(current).filter(([id]) => stillFailing.has(id)),
          ),
        );
      } else {
        notify.success(data.message);
        setDraft({});
      }

      // Re-read rather than patching local state: the server normalises the
      // default location, so what it stored is the only trustworthy answer.
      const staffRes = await api.get("/staff");
      setStaff(staffRes.data);
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not save access");
    } finally {
      setSaving(false);
    }
  };

  const filtered = staff.filter((member) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [member.firstName, member.lastName, member.email]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(needle));
  });

  const selected = staff.find((s) => s._id === selectedId);

  const nameOf = (member) =>
    [member.firstName, member.lastName].filter(Boolean).join(" ") || member.email;

  return (
    <div className={uiStyles.page}>
      <div className={`${uiStyles.cardHeader} flex-col md:flex-row gap-3`}>
        <div>
          <h1 className="page-title">Permissions</h1>
          <p className="page-subtitle">
            Decide which locations each staff member can see, and which parts of
            the system they can use.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {dirtyIds.length > 0 && (
            <>
              <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 whitespace-nowrap">
                {dirtyIds.length} unsaved
              </span>
              <button onClick={discard} className="btn-secondary" disabled={saving}>
                <UndoIcon fontSize="small" /> Discard
              </button>
            </>
          )}
          <button
            onClick={save}
            disabled={saving || !dirtyIds.length}
            className="btn-primary whitespace-nowrap disabled:opacity-40"
          >
            <SaveIcon fontSize="small" /> {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {[
          { key: "locations", label: "Who sees what location", icon: PlaceIcon },
          { key: "modules", label: "What each person can do", icon: TuneIcon },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            <Icon fontSize="small" /> {label}
          </button>
        ))}
      </div>

      <input
        type="text"
        placeholder="Search staff…"
        className={`${uiStyles.input} md:max-w-xs`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <p className="text-center text-gray-400 py-16 text-sm">Loading…</p>
      ) : tab === "locations" ? (
        /* ══ Location matrix ══════════════════════════════════════════════ */
        locations.length === 0 ? (
          <div className={uiStyles.card}>
            <p className="text-sm text-gray-600">
              There are no active locations yet. Create one from the Locations
              screen and it will appear here as a column.
            </p>
          </div>
        ) : (
          <div className="border border-gray-300 rounded-lg overflow-x-auto bg-white shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-slate-700 to-slate-800 text-white">
                  <th
                    className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider sticky left-0 bg-slate-800 z-10"
                    style={{ minWidth: "220px" }}
                  >
                    Staff member
                  </th>
                  {locations.map((loc) => (
                    <th
                      key={loc._id}
                      className="px-3 py-2.5 text-center text-xs font-semibold border-l border-slate-600 whitespace-nowrap"
                      style={{ minWidth: "110px" }}
                      title={loc.name}
                    >
                      <div>{loc.code}</div>
                      <div className="text-[10px] font-normal text-slate-300 normal-case">
                        {loc.name}
                      </div>
                    </th>
                  ))}
                  <th
                    className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider border-l border-slate-600"
                    style={{ minWidth: "160px" }}
                  >
                    Opens on sign-in
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((member) => {
                  const isAdmin = member.role === "admin";
                  const assigned = valueFor(member, "locations").map(String);
                  const isDirty = dirtyIds.includes(member._id);

                  return (
                    <tr
                      key={member._id}
                      className={`border-b border-gray-200 last:border-b-0 ${
                        isDirty ? "bg-amber-50" : "hover:bg-gray-50"
                      }`}
                    >
                      <td
                        className={`px-3 py-2.5 sticky left-0 z-10 ${
                          isDirty ? "bg-amber-50" : "bg-white"
                        }`}
                      >
                        <p className="font-medium text-sm text-gray-900">
                          {nameOf(member)}
                        </p>
                        <p className="text-xs text-gray-500">{member.email}</p>
                        {isAdmin && (
                          <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
                            <LockIcon style={{ fontSize: 11 }} /> ADMIN
                          </span>
                        )}
                        {!isAdmin && assigned.length === 0 && (
                          <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
                            <WarningAmberIcon style={{ fontSize: 11 }} /> NO
                            ACCESS
                          </span>
                        )}
                      </td>

                      {locations.map((loc) => (
                        <td
                          key={loc._id}
                          className="px-3 py-2.5 text-center border-l border-gray-200"
                        >
                          {isAdmin ? (
                            /* An admin reaches every active location by role, so
                               a per-location tick would be a lie the server
                               rejects anyway. */
                            <span
                              className="text-gray-400"
                              title="Administrators reach every location"
                            >
                              ✓
                            </span>
                          ) : (
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-indigo-600 cursor-pointer"
                              checked={assigned.includes(String(loc._id))}
                              onChange={() => toggleLocation(member, loc._id)}
                              aria-label={`${nameOf(member)} — ${loc.name}`}
                            />
                          )}
                        </td>
                      ))}

                      <td className="px-3 py-2.5 border-l border-gray-200">
                        {isAdmin ? (
                          <span className="text-xs text-gray-400 italic">
                            All locations
                          </span>
                        ) : assigned.length > 1 ? (
                          <select
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                            value={String(valueFor(member, "defaultLocation") || "")}
                            onChange={(e) =>
                              editDraft(member._id, {
                                defaultLocation: e.target.value,
                              })
                            }
                          >
                            {assigned.map((id) => {
                              const loc = locations.find(
                                (l) => String(l._id) === id,
                              );
                              return (
                                <option key={id} value={id}>
                                  {loc?.name || id}
                                </option>
                              );
                            })}
                          </select>
                        ) : assigned.length === 1 ? (
                          <span className="text-xs text-gray-600">
                            {locations.find((l) => String(l._id) === assigned[0])
                              ?.name || "—"}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filtered.length === 0 && (
              <p className="text-center text-gray-400 py-12 text-sm">
                No staff match that search.
              </p>
            )}
          </div>
        )
      ) : (
        /* ══ Module permissions ═══════════════════════════════════════════ */
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
          {/* Person picker */}
          <div className="border border-gray-200 rounded-lg bg-white overflow-hidden max-h-[32rem] overflow-y-auto">
            {filtered.map((member) => {
              const isDirty = dirtyIds.includes(member._id);
              const count = valueFor(member, "permissions").length;

              return (
                <button
                  key={member._id}
                  onClick={() => setSelectedId(member._id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-gray-100 last:border-b-0 transition-colors ${
                    member._id === selectedId
                      ? "bg-indigo-50 border-l-4 border-l-indigo-600"
                      : "hover:bg-gray-50 border-l-4 border-l-transparent"
                  }`}
                >
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {nameOf(member)}
                    {isDirty && (
                      <span className="ml-1 text-amber-600" title="Unsaved changes">
                        •
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-gray-500 truncate">
                    {member.role === "admin"
                      ? "Administrator — everything"
                      : `${count} permission${count === 1 ? "" : "s"}`}
                  </p>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-center text-gray-400 py-8 text-sm">
                No staff match that search.
              </p>
            )}
          </div>

          {/* Module grid for the selected person */}
          <div className={uiStyles.card}>
            {!selected ? (
              <p className="text-sm text-gray-500">
                Pick someone on the left to edit what they can do.
              </p>
            ) : selected.role === "admin" ? (
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  {nameOf(selected)}
                </h2>
                <p className="text-sm text-gray-600 mt-2">
                  Administrators can reach every module and every location — that
                  is what the role means, so there is nothing to tick here. To
                  scope this person, change their role to staff on the Staff
                  screen first.
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">
                      {nameOf(selected)}
                    </h2>
                    <p className="text-xs text-gray-500">{selected.email}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500">Start from</label>
                    <select
                      className="px-2 py-1.5 border border-gray-300 rounded text-sm"
                      value=""
                      onChange={(e) => {
                        if (e.target.value !== "") {
                          applyTemplate(selected, e.target.value);
                        }
                      }}
                    >
                      <option value="">Choose a template…</option>
                      {templates.map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.label}
                        </option>
                      ))}
                      <option value="__none">Clear everything</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  {[...new Set(modules.map((m) => m.group))].map((group) => (
                    <div key={group}>
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                        {group}
                      </h3>

                      <div className="space-y-1">
                        {modules
                          .filter((m) => m.group === group)
                          .map((module) => {
                            const current = valueFor(selected, "permissions");
                            const keys = module.actions.map((a) => a.key);
                            const granted = keys.filter((k) =>
                              current.includes(k),
                            ).length;

                            return (
                              <div
                                key={module.key}
                                className="border border-gray-200 rounded-lg px-3 py-2"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <label className="flex items-start gap-2 cursor-pointer flex-1 min-w-[12rem]">
                                    <input
                                      type="checkbox"
                                      className="mt-0.5 h-4 w-4 accent-indigo-600"
                                      checked={granted === keys.length}
                                      // Partly-granted reads as neither on nor
                                      // off, which is exactly what it is.
                                      ref={(el) => {
                                        if (el)
                                          el.indeterminate =
                                            granted > 0 && granted < keys.length;
                                      }}
                                      onChange={() =>
                                        toggleModule(selected, module)
                                      }
                                    />
                                    <span>
                                      <span className="text-sm font-medium text-gray-800">
                                        {module.label}
                                      </span>
                                      <span className="block text-[11px] text-gray-500">
                                        {module.description}
                                      </span>
                                    </span>
                                  </label>

                                  <div className="flex flex-wrap gap-3">
                                    {module.actions.map((action) => (
                                      <label
                                        key={action.key}
                                        className="flex items-center gap-1.5 cursor-pointer"
                                      >
                                        <input
                                          type="checkbox"
                                          className="h-3.5 w-3.5 accent-indigo-600"
                                          checked={current.includes(action.key)}
                                          onChange={() =>
                                            togglePermission(selected, action.key)
                                          }
                                        />
                                        <span className="text-xs text-gray-600">
                                          {action.label}
                                        </span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Permissions;
