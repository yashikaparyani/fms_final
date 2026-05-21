import { setupWorker } from "msw/browser";
import { authHandlers } from "./handlers/auth.handlers";
import { loadHandlers } from "./handlers/load.handlers";
import { fleetOwnerHandlers } from "./handlers/fleetOwner.handlers";
import { biddingHandlers } from "./handlers/bidding.handlers";

export const worker = setupWorker(...authHandlers,...loadHandlers,...fleetOwnerHandlers,...biddingHandlers);