import React from "react";
import { useSelector } from "react-redux";
import { firstNameOf } from "../utils/displayName";

/**
 * The coloured band at the top of a dashboard — the web counterpart of the
 * mobile `AppHeader`.
 *
 * It paints itself with `--role-accent` / `--role-from` / `--role-to`, which
 * RoleTheme sets from the signed-in role, so the same component gives the
 * driver a green header and the broker a red one without a conditional here.
 *
 * `stats` renders the inline figure strip from the reference dashboards; pass
 * `[{ label, value }]` and omit it when there is nothing worth stating twice.
 * `actions` is anything trailing — a button, a filter.
 */
const DashboardHeader = ({ title, subtitle, stats = [], actions, children }) => {
  const user = useSelector((state) => state.auth.user);
  // Not `user.firstName` — that is "N/A" on accounts staff created without a
  // contact name, and greeting somebody by a placeholder is worse than not
  // greeting them at all. firstNameOf falls through to the company name and
  // then the email, and returns "" only when there is genuinely nothing.
  const firstName = firstNameOf(user);

  return (
    <div className="role-gradient rounded-card shadow-card text-white overflow-hidden">
      <div className="px-6 py-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {firstName ? (
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/70">
              Welcome back, {firstName}
            </p>
          ) : null}
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight mt-0.5">
            {title}
          </h1>
          {subtitle ? (
            <p className="text-xs md:text-sm font-medium text-white/75 mt-1 max-w-prose">
              {subtitle}
            </p>
          ) : null}
        </div>

        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>

      {stats.length ? (
        <div className="px-6 pb-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl bg-white/12 backdrop-blur-sm px-3 py-2.5 text-center"
            >
              <p className="text-lg font-extrabold tabular-nums leading-none">
                {stat.value ?? 0}
              </p>
              <p className="text-[11px] font-medium text-white/75 mt-1 truncate">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {children}
    </div>
  );
};

export default DashboardHeader;
