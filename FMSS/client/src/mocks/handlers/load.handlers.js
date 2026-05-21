import { http, HttpResponse } from "msw";
import { loads } from "../db";
import { v4 as uuid } from "uuid";

export const loadHandlers = [

  // Create Load
  http.post("/api/load", async ({ request }) => {
    const body = await request.json();

    const newLoad = {
      id: uuid(),
      ...body,
      status: "PENDING_VERIFICATION",
      date: new Date().toISOString().slice(0,10)
    };

    loads.push(newLoad);

    return HttpResponse.json(newLoad);
  }),

  // Get Pending Loads
  http.get("/api/load/pending", () => {
    const pending = loads.filter(
      (l) => l.status === "PENDING_VERIFICATION"
    );

    return HttpResponse.json(pending);
  }),

  // Get Verified Loads
  http.get("/api/load/bidding", () => {
    const verified = loads.filter(
      (l) => l.status === "VERIFIED"
    );

    return HttpResponse.json(verified);
  }),

  // Verify Load
  http.put("/api/load/verify/:id", ({ params }) => {
    const load = loads.find((l) => l.id === params.id);

    if (load) {
      load.status = "VERIFIED";
    }

    return HttpResponse.json(load);
  }),
];