// mocks/handlers/fleetOwnerHandlers.js
import { http, HttpResponse } from "msw";
import { v4 as uuid } from "uuid";
import { fleetOwners as dbFleetOwners } from "../db";

// In-memory store (you can add this to your db.js)
let fleetOwners = [...dbFleetOwners];

export const fleetOwnerHandlers = [
  // Create Fleet Owner (Staff)
  http.post("/api/fleet-owner", async ({ request }) => {
    const body = await request.json();

    const newFleetOwner = {
      id: uuid(),
      ...body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "ACTIVE"
    };

    fleetOwners.push(newFleetOwner);

    return HttpResponse.json({
      message: "Fleet owner created successfully",
      fleetOwner: newFleetOwner
    });
  }),

  // Get All Fleet Owners
  http.get("/api/fleet-owners", () => {

    return HttpResponse.json(fleetOwners);
  }),

  // Get Single Fleet Owner
  http.get("/api/fleet-owners/:id", ({ params }) => {
    const fleetOwner = fleetOwners.find(fo => fo.id === params.id);
    
    if (!fleetOwner) {
      return HttpResponse.json(
        { message: "Fleet owner not found" },
        { status: 404 }
      );
    }

    return HttpResponse.json(fleetOwner);
  }),

  // Update Fleet Owner
  http.put("/api/fleet-owners/:id", async ({ params, request }) => {
    const body = await request.json();
    const index = fleetOwners.findIndex(fo => fo.id === params.id);
    
    if (index === -1) {
      return HttpResponse.json(
        { message: "Fleet owner not found" },
        { status: 404 }
      );
    }

    fleetOwners[index] = {
      ...fleetOwners[index],
      ...body,
      updatedAt: new Date().toISOString()
    };

    return HttpResponse.json({
      message: "Fleet owner updated successfully",
      fleetOwner: fleetOwners[index]
    });
  }),

  // Delete Fleet Owner (Soft delete or hard delete)
  http.delete("/api/fleet-owners/:id", ({ params }) => {
    const index = fleetOwners.findIndex(fo => fo.id === params.id);
    
    if (index === -1) {
      return HttpResponse.json(
        { message: "Fleet owner not found" },
        { status: 404 }
      );
    }

    // Soft delete by marking as inactive
    fleetOwners[index] = {
      ...fleetOwners[index],
      active: false,
      status: "INACTIVE",
      updatedAt: new Date().toISOString()
    };

    return HttpResponse.json({
      message: "Fleet owner deactivated successfully"
    });
  })
];