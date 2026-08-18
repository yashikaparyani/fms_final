// What figure a carrier is shown for a load.
//
// A load carries several rates and they take turns being the right one. The
// vendor rate is correct until somebody bids; after that the carrier is looking
// at their own bid, then at whatever it was negotiated to, then at the amount it
// was awarded at. Reading them in the wrong order is what left a carrier who won
// a load at 1,150 still seeing the 900 it was posted at.

const mongoose = require("mongoose");
const { carrierPayoutFor } = require("../utils/carrierAccount");

const ME = new mongoose.Types.ObjectId();
const SOMEONE_ELSE = new mongoose.Types.ObjectId();

describe("carrierPayoutFor", () => {
  it("shows the posted rate while nothing has been bid", () => {
    expect(carrierPayoutFor({ vendorRate: 900 }, ME)).toEqual({
      amount: 900,
      source: "OFFERED",
    });
  });

  it("shows their own bid once it stands", () => {
    expect(
      carrierPayoutFor({ vendorRate: 900 }, ME, { amount: 1050 }),
    ).toEqual({ amount: 1050, source: "BID" });
  });

  it("shows the offer on the table ahead of their own bid", () => {
    // The office has come back with a number and is waiting on an answer, so
    // that is the figure the carrier is being asked about.
    expect(
      carrierPayoutFor({ vendorRate: 900 }, ME, {
        amount: 1050,
        negotiation: { status: "PENDING", amount: 1150 },
      }),
    ).toEqual({ amount: 1150, source: "NEGOTIATING" });
  });

  it("shows the settled amount once the load is awarded to them", () => {
    expect(
      carrierPayoutFor(
        {
          vendorRate: 900,
          winningBid: { fleetOwnerId: ME, amount: 1150 },
        },
        ME,
        { amount: 1050 },
      ),
    ).toEqual({ amount: 1150, source: "AWARDED" });
  });

  it("does not show them a load awarded to somebody else as theirs", () => {
    // Their own bid still stands as their number; the winner's amount is not
    // theirs to see.
    expect(
      carrierPayoutFor(
        {
          vendorRate: 900,
          winningBid: { fleetOwnerId: SOMEONE_ELSE, amount: 1150 },
        },
        ME,
        { amount: 1050 },
      ),
    ).toEqual({ amount: 1050, source: "BID" });
  });

  it("prefers their own leg rate on a load split between carriers", () => {
    // One vendor rate cannot describe two carriers, so the leg wins.
    expect(
      carrierPayoutFor(
        {
          vendorRate: 1300,
          assignments: [
            { fleetOwnerId: ME, carrierRate: 400 },
            { fleetOwnerId: SOMEONE_ELSE, carrierRate: 900 },
          ],
        },
        ME,
      ),
    ).toEqual({ amount: 400, source: "LEG_RATE" });
  });

  it("says so plainly when no rate has been set at all", () => {
    // Better than a zero, which reads as "you are paid nothing".
    expect(carrierPayoutFor({}, ME)).toEqual({ amount: null, source: "NOT_SET" });
  });
});
