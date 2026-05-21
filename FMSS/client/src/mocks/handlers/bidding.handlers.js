
import { http, HttpResponse } from "msw";
import { v4 as uuid } from "uuid";
import { loads } from "../db";

export const biddingHandlers = [

    http.get("/api/load/:id", ({ params }) => {
        const load = loads.find(l => l.id === params.id);

        if (!load) {
            return HttpResponse.json(
                { message: "Load not found" },
                { status: 404 }
            );
        }

        return HttpResponse.json(load);
    }),

    http.post("/api/bid", async ({ request }) => {
        const body = await request.json();
        const { loadId, fleetOwnerId, fleetOwnerName, amount } = body;

        const loadIndex = loads.findIndex(l => l.id === loadId);

        if (loadIndex === -1) {
            return HttpResponse.json(
                { message: "Load not found" },
                { status: 404 }
            );
        }

        if (loads[loadIndex].bidStatus !== 'OPEN') {
            return HttpResponse.json(
                { message: "Bidding is not open for this load" },
                { status: 400 }
            );
        }

        const newBid = {
            id: uuid(),
            fleetOwnerId,
            fleetOwnerName,
            amount,
            submittedAt: new Date().toISOString()
        };

        if (!loads[loadIndex].bids) {
            loads[loadIndex].bids = [];
        }

        loads[loadIndex].bids.push(newBid);

        return HttpResponse.json({
            message: "Bid placed successfully",
            bid: newBid
        }, { status: 201 });
    }),

    http.get("/api/load/:id/bids", ({ params }) => {
        const load = loads.find(l => l.id === params.id);

        if (!load) {
            return HttpResponse.json(
                { message: "Load not found" },
                { status: 404 }
            );
        }

        return HttpResponse.json(load.bids || []);
    })
];