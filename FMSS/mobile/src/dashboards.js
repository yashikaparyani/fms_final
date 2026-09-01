/**
 * Role home screens.
 *
 * Each of the four portals — driver, carrier, shipper, broker — gets its own
 * dashboard with its own accent colour, following the reference design: one
 * dominant call to action, a colour-coded tile grid beneath it, then the live
 * numbers and the shortest list that is worth reading on a phone.
 *
 * Every count here is real. They come from `GET /api/stats`, which is already
 * role-aware server-side, so no dashboard invents a number it cannot back up.
 */

import React, { useMemo } from "react";
import { RefreshControl, Text, View } from "react-native";

import { colors, palette, radius, spacing, type } from "./theme";
import {
  ActionTile,
  AppHeader,
  BigAction,
  Body,
  EmptyState,
  HeaderChip,
  ListRow,
  SectionCard,
  StatStrip,
  Tag,
  TileGrid,
} from "./ui";

const firstName = (user) => {
  const source = user?.name || user?.fullName || user?.email || "there";
  return String(source).split(/[\s@.]/)[0].replace(/^./, (c) => c.toUpperCase());
};

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
};

const stopLabel = (stop) =>
  [stop?.city, stop?.state].filter(Boolean).join(", ") || "—";

const money = (value) =>
  value == null || value === ""
    ? "—"
    : `$${Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/** Shared scroll body with pull-to-refresh wired to the caller's loader. */
const refresher = (refreshing, onRefresh, tint) => ({
  refreshControl: (
    <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={tint} colors={[tint]} />
  ),
});

/* -------------------------------------------------------------------------- */
/* Driver                                                                      */
/* -------------------------------------------------------------------------- */

export function DriverHome({
  session,
  theme,
  stats,
  loads = [],
  unread,
  refreshing,
  onRefresh,
  onBell,
  onOpen,
  compliance,
}) {
  const user = session?.user;
  const nextLoad = loads[0];
  const origin = nextLoad?.pickup || nextLoad?.pickups?.[0];
  const destination = nextLoad?.drop || nextLoad?.drops?.[0];
  const active = stats?.activeTrips ?? loads.length;
  const blocked = compliance && !compliance.canUpdateLoads;

  return (
    <>
      <AppHeader
        theme={theme}
        eyebrow={greeting()}
        title={`${firstName(user)} 👋`}
        onBell={onBell}
        unread={unread}
      >
        <View style={row}>
          <HeaderChip icon="pin" label={user?.locationName || "On the road"} />
          <Tag label={blocked ? "Action needed" : "On Duty"} solid color={blocked ? colors.warning : palette.green[500]} />
        </View>
      </AppHeader>

      <Body {...refresher(refreshing, onRefresh, theme.accent)}>
        {blocked ? (
          <ListRow
            icon="warning"
            iconColor={colors.warning}
            title="Action needed before you can update loads"
            subtitle={compliance.message}
            onPress={() => onOpen("licence")}
            last
          />
        ) : null}

        <BigAction
          icon="loads"
          title="My Loads"
          subtitle={`${active} active ${active === 1 ? "load" : "loads"}`}
          color={theme.accent}
          onPress={() => onOpen("assigned")}
        />

        <TileGrid columns={2}>
          <ActionTile
            icon="track"
            title="Live Tracking"
            subtitle="Share your location"
            color={colors.primary}
            onPress={() => onOpen("track")}
          />
          <ActionTile
            icon="camera"
            title="Upload POD"
            subtitle="Proof of delivery"
            color={colors.fuel}
            onPress={() => onOpen("assigned")}
          />
          <ActionTile
            icon="licence"
            title="My Licence"
            subtitle="Keep it current"
            color={colors.parking}
            onPress={() => onOpen("licence")}
          />
          <ActionTile
            icon="bell"
            title="Alerts"
            subtitle={unread > 0 ? `${unread} unread` : "All caught up"}
            color={colors.roadside}
            badge={unread > 0 ? unread : null}
            onPress={onBell}
          />
          <ActionTile
            icon="history"
            title="Trip History"
            subtitle={`${stats?.completedTrips ?? 0} completed`}
            color={colors.tires}
            onPress={() => onOpen("over")}
          />
          <ActionTile
            icon="more"
            title="More"
            subtitle="Account & help"
            color={colors.more}
            onPress={() => onOpen("more")}
          />
        </TileGrid>

        <StatStrip
          stats={[
            { label: "Active", value: active, color: theme.accent },
            { label: "Completed", value: stats?.completedTrips ?? 0 },
            { label: "Alerts", value: unread ?? 0, color: unread > 0 ? colors.danger : undefined },
          ]}
        />

        <SectionCard title="Next stop" actionLabel="All loads" onAction={() => onOpen("assigned")} padded={false}>
          {nextLoad ? (
            <ListRow
              icon="pin"
              iconColor={theme.accent}
              title={`${stopLabel(origin)} → ${stopLabel(destination)}`}
              subtitle={nextLoad.loadId}
              meta={nextLoad.truckType || undefined}
              onPress={() => onOpen("assigned")}
              last
            />
          ) : (
            <EmptyState
              icon="loads"
              title="No assigned loads"
              subtitle="New assignments will appear here."
            />
          )}
        </SectionCard>
      </Body>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Carrier — owner-operator / trucking company                                 */
/* -------------------------------------------------------------------------- */

export function CarrierHome({
  session,
  theme,
  stats,
  loads = [],
  available = [],
  unread,
  refreshing,
  onRefresh,
  onBell,
  onOpen,
}) {
  const user = session?.user;

  return (
    <>
      <AppHeader
        theme={theme}
        eyebrow="Welcome back"
        title={firstName(user)}
        subtitle={user?.email}
        onBell={onBell}
        unread={unread}
      >
        {/* The fleet's standing at a glance, in the header where the reference
            puts the truck card — same role, less vertical cost. */}
        <View style={{ marginTop: spacing.md }}>
          <StatStrip
            tone="dark"
            stats={[
              { label: "Active trips", value: stats?.activeTrips ?? 0 },
              { label: "Open bids", value: stats?.pendingBids ?? 0 },
              { label: "Won", value: stats?.wonBids ?? 0 },
              { label: "Delivered", value: stats?.completedTrips ?? 0 },
            ]}
          />
        </View>
      </AppHeader>

      <Body {...refresher(refreshing, onRefresh, theme.accent)}>
        <BigAction
          icon="search"
          title="Find Loads"
          subtitle={`${stats?.availableLoads ?? 0} open for bidding`}
          color={theme.accent}
          onPress={() => onOpen("available")}
        />
        <BigAction
          icon="bid"
          title="My Bids"
          subtitle={`${stats?.pendingBids ?? 0} awaiting decision`}
          color={colors.success}
          onPress={() => onOpen("myBids")}
        />

        <TileGrid columns={3}>
          <ActionTile
            icon="truck"
            title="Assigned"
            subtitle={`${stats?.activeTrips ?? 0} running`}
            color={colors.primary}
            onPress={() => onOpen("assigned")}
          />
          <ActionTile
            icon="check"
            title="Completed"
            subtitle={`${stats?.completedTrips ?? 0} done`}
            color={colors.success}
            onPress={() => onOpen("over")}
          />
          <ActionTile
            icon="doc"
            title="Documents"
            subtitle="Agreements"
            color={colors.fuel}
            onPress={() => onOpen("documents")}
          />
          <ActionTile
            icon="doc"
            title="Insurance"
            subtitle="Your cover"
            color={colors.primary}
            onPress={() => onOpen("insurance")}
          />
          <ActionTile
            icon="drivers"
            title="Drivers"
            subtitle="Your team"
            color={colors.parking}
            onPress={() => onOpen("drivers")}
          />
          <ActionTile
            icon="bell"
            title="Alerts"
            subtitle={unread > 0 ? `${unread} unread` : "Clear"}
            color={colors.roadside}
            badge={unread > 0 ? unread : null}
            onPress={onBell}
          />
          <ActionTile
            icon="more"
            title="More"
            subtitle="Account"
            color={colors.more}
            onPress={() => onOpen("more")}
          />
        </TileGrid>

        <SectionCard
          title="Loads open for bidding"
          actionLabel="See all"
          onAction={() => onOpen("available")}
          padded={false}
        >
          {available.length ? (
            available.slice(0, 4).map((load, i, arr) => {
              const origin = load.pickup || load.pickups?.[0];
              const destination = load.drop || load.drops?.[0];
              return (
                <ListRow
                  key={load._id || load.loadId}
                  icon="loads"
                  iconColor={theme.accent}
                  title={`${stopLabel(origin)} → ${stopLabel(destination)}`}
                  subtitle={`${load.loadId}${load.truckType ? ` · ${load.truckType}` : ""}`}
                  meta={money(load.vendorRate ?? load.amount)}
                  actionLabel="Bid"
                  actionColor={theme.accent}
                  onAction={() => onOpen("available")}
                  last={i === arr.length - 1}
                />
              );
            })
          ) : (
            <EmptyState
              icon="bid"
              title="Nothing open right now"
              subtitle="New loads post throughout the day — pull to refresh."
            />
          )}
        </SectionCard>

        <SectionCard title="Your active trips" actionLabel="All" onAction={() => onOpen("assigned")} padded={false}>
          {loads.length ? (
            loads.slice(0, 3).map((load, i, arr) => (
              <ListRow
                key={load._id || load.loadId}
                icon="truck"
                iconColor={colors.success}
                title={load.loadId}
                subtitle={`${stopLabel(load.pickup || load.pickups?.[0])} → ${stopLabel(
                  load.drop || load.drops?.[0],
                )}`}
                meta={load.transportStatus?.replace(/_/g, " ")}
                onPress={() => onOpen("assigned")}
                last={i === arr.length - 1}
              />
            ))
          ) : (
            <EmptyState icon="truck" title="No active trips" subtitle="Win a bid to get moving." />
          )}
        </SectionCard>
      </Body>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Shipper — customer                                                          */
/* -------------------------------------------------------------------------- */

export function ShipperHome({
  session,
  theme,
  stats,
  unread,
  refreshing,
  onRefresh,
  onBell,
  onOpen,
}) {
  const recent = stats?.recentLoads || [];

  return (
    <>
      <AppHeader
        theme={theme}
        eyebrow="Ship with"
        title="S Line Transport"
        subtitle={session?.user?.email}
        onBell={onBell}
        unread={unread}
      >
        <View style={{ marginTop: spacing.md }}>
          <StatStrip
            tone="dark"
            stats={[
              { label: "Total loads", value: stats?.totalLoads ?? 0 },
              { label: "In bidding", value: stats?.activeBidding ?? 0 },
              { label: "Verified", value: stats?.verifiedLoads ?? 0 },
            ]}
          />
        </View>
      </AppHeader>

      <Body {...refresher(refreshing, onRefresh, theme.accent)}>
        <BigAction
          icon="post"
          title="Post Shipment"
          subtitle="Get instant quotes"
          color={colors.success}
          onPress={() => onOpen("postLoad")}
        />

        <SectionCard padded={false}>
          <ListRow
            icon="quote"
            iconColor={colors.primary}
            title="Get Quotes"
            subtitle={`${stats?.activeBidding ?? 0} loads receiving bids`}
            onPress={() => onOpen("quotes")}
          />
          <ListRow
            icon="track"
            iconColor={colors.info}
            title="Track Shipment"
            subtitle="Real-time location"
            onPress={() => onOpen("track")}
          />
          <ListRow
            icon="doc"
            iconColor={colors.fuel}
            title="Documents"
            subtitle="BOL, POD, invoices"
            onPress={() => onOpen("documents")}
          />
          <ListRow
            icon="money"
            iconColor={colors.parking}
            title="Payments"
            subtitle="Settlements and invoices"
            onPress={() => onOpen("payments")}
          />
          <ListRow
            icon="history"
            iconColor={colors.more}
            title="Shipment History"
            subtitle={`${stats?.totalLoads ?? 0} all time`}
            onPress={() => onOpen("history")}
            last
          />
        </SectionCard>

        {stats?.requiresChanges > 0 ? (
          <SectionCard padded={false}>
            <ListRow
              icon="warning"
              iconColor={colors.warning}
              title={`${stats.requiresChanges} loads need changes`}
              subtitle="Review and resubmit to keep them moving"
              onPress={() => onOpen("history")}
              last
            />
          </SectionCard>
        ) : null}

        <SectionCard title="Recent shipments" actionLabel="All" onAction={() => onOpen("history")} padded={false}>
          {recent.length ? (
            recent.slice(0, 5).map((load, i, arr) => (
              <ListRow
                key={load._id || load.loadId}
                icon="shipments"
                iconColor={theme.accent}
                title={`${stopLabel(load.pickup)} → ${stopLabel(load.drop)}`}
                subtitle={load.loadId}
                meta={load.status?.replace(/_/g, " ")}
                onPress={() => onOpen("history")}
                last={i === arr.length - 1}
              />
            ))
          ) : (
            <EmptyState
              icon="shipments"
              title="No shipments yet"
              subtitle="Post your first load to get quotes from carriers."
            />
          )}
        </SectionCard>
      </Body>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Broker — staff and admin                                                    */
/* -------------------------------------------------------------------------- */

export function BrokerHome({
  session,
  theme,
  stats,
  unread,
  refreshing,
  onRefresh,
  onBell,
  onOpen,
}) {
  const pending = stats?.recentPendingLoads || [];

  // Transport-status counts, ordered the way a dispatcher scans them.
  const pipeline = useMemo(
    () =>
      [
        { label: "New", value: stats?.newLoads, color: colors.primary },
        { label: "Assigned", value: stats?.assignedLoads, color: colors.info },
        { label: "Picked up", value: stats?.pickedupLoads, color: colors.fuel },
        { label: "In transit", value: stats?.enrouteLoads, color: colors.parking },
        { label: "Delivered", value: stats?.deliveredLoads, color: colors.success },
      ].filter((item) => item.value != null),
    [stats],
  );

  return (
    <>
      <AppHeader
        theme={theme}
        eyebrow="Broker dashboard"
        title="S Line Transport"
        subtitle={session?.user?.email}
        onBell={onBell}
        unread={unread}
      >
        <View style={{ marginTop: spacing.md }}>
          <StatStrip
            tone="dark"
            stats={[
              { label: "Active loads", value: stats?.totalLoads ?? 0 },
              { label: "In bidding", value: stats?.activeBidding ?? 0 },
              { label: "Carriers", value: stats?.totalFleetOwners ?? 0 },
              { label: "Customers", value: stats?.totalCustomers ?? 0 },
            ]}
          />
        </View>
      </AppHeader>

      <Body {...refresher(refreshing, onRefresh, theme.accent)}>
        <BigAction
          icon="search"
          title="Find Trucks"
          subtitle={`${stats?.totalFleetOwners ?? 0} carriers on the board`}
          color={theme.accent}
          onPress={() => onOpen("carriers")}
        />

        <TileGrid columns={3}>
          <ActionTile
            icon="warning"
            title="Pending"
            subtitle={`${stats?.pendingLoads ?? 0} to verify`}
            color={colors.warning}
            badge={stats?.pendingLoads || null}
            onPress={() => onOpen("pending")}
          />
          <ActionTile
            icon="bid"
            title="Live Bids"
            subtitle={`${stats?.activeBidding ?? 0} open`}
            color={colors.primary}
            onPress={() => onOpen("bidding")}
          />
          <ActionTile
            icon="truck"
            title="In Transit"
            subtitle={`${stats?.enrouteLoads ?? 0} moving`}
            color={colors.parking}
            onPress={() => onOpen("loads")}
          />
          <ActionTile
            icon="clock"
            title="LFD Today"
            subtitle={`${stats?.lfdTodayLoads ?? 0} due`}
            color={colors.roadside}
            onPress={() => onOpen("loads")}
          />
          <ActionTile
            icon="doc"
            title="Paperwork"
            subtitle={`${stats?.paperworkPending ?? 0} pending`}
            color={colors.fuel}
            onPress={() => onOpen("loads")}
          />
          <ActionTile
            icon="more"
            title="More"
            subtitle="Reports & admin"
            color={colors.more}
            onPress={() => onOpen("more")}
          />
        </TileGrid>

        {pipeline.length ? (
          <SectionCard title="Transport pipeline">
            <View style={pipelineWrap}>
              {pipeline.map((step) => (
                <View key={step.label} style={pipelineItem}>
                  <View style={[pipelineDot, { backgroundColor: step.color }]} />
                  <Text style={pipelineValue}>{step.value}</Text>
                  <Text style={pipelineLabel} numberOfLines={1}>
                    {step.label}
                  </Text>
                </View>
              ))}
            </View>
          </SectionCard>
        ) : null}

        <SectionCard
          title="Waiting on verification"
          actionLabel="All"
          onAction={() => onOpen("pending")}
          padded={false}
        >
          {pending.length ? (
            pending.slice(0, 5).map((load, i, arr) => (
              <ListRow
                key={load._id || load.loadId}
                icon="warning"
                iconColor={colors.warning}
                title={`${stopLabel(load.pickup)} → ${stopLabel(load.drop)}`}
                subtitle={`${load.loadId}${load.customerName ? ` · ${load.customerName}` : ""}`}
                meta={money(load.amount)}
                actionLabel="Review"
                actionColor={theme.accent}
                onAction={() => onOpen("pending")}
                last={i === arr.length - 1}
              />
            ))
          ) : (
            <EmptyState icon="check" title="Queue is clear" subtitle="Nothing waiting on verification." />
          )}
        </SectionCard>
      </Body>
    </>
  );
}

/* -------------------------------------------------------------------------- */

const row = {
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  marginTop: spacing.md,
};

const pipelineWrap = { flexDirection: "row", justifyContent: "space-between" };
const pipelineItem = { alignItems: "center", flex: 1, gap: 3 };
const pipelineDot = { width: 8, height: 8, borderRadius: radius.pill };
const pipelineValue = { ...type.h2, color: colors.text };
const pipelineLabel = { ...type.caption, color: colors.muted, fontWeight: "500" };

/** Picks the home screen for a role. */
export const homeForRole = (role) => {
  if (role === "driver") return DriverHome;
  if (role === "client") return ShipperHome;
  if (role === "staff" || role === "admin") return BrokerHome;
  return CarrierHome;
};
