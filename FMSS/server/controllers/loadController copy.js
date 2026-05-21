// const Load = require("../models/Load");
// const User = require("../models/User");
// const FleetOwner = require("../models/FleetOwner");
// const { sendEmail } = require("../utils/mailer");

// // @desc    Get all loads (with simple filtering)
// // @route   GET /api/loads
// // @access  Private
// // const getLoads = async (req, res) => {
// //   try {
// //     const query = {};

// //     // Client only sees their loads
// //     if (req.user.role === 'client') {
// //       query.creatorId = req.user._id;
// //     }

// //     // Fleet owner sees only VERIFIED loads with OPEN or UPCOMING bidding
// //     if (req.user.role === 'fleetOwner') {
// //       query.status = 'VERIFIED';
// //       if (req.query.bidStatus) {
// //         query.bidStatus = req.query.bidStatus;
// //       } else {
// //         query.bidStatus = { $in: ['OPEN', 'UPCOMING'] };
// //       }
// //     }

// //     // Status filters for staff/admin
// //     if (req.query.status && req.user.role !== 'fleetOwner') query.status = req.query.status;
// //     if (req.query.bidStatus && req.user.role !== 'fleetOwner') query.bidStatus = req.query.bidStatus;

// //     const loads = await Load.find(query).sort({ createdAt: -1 });
// //     res.json(loads);
// //   } catch (error) {
// //     res.status(500).json({ message: error.message });
// //   }
// // };

// const getLoads = async (req, res) => {
//   try {
//     const query = {};

//     // Client restriction
//     if (req.user.role === "client") {
//       query.creatorId = req.user._id;
//     }

//     // Fleet owner restriction
//     if (req.user.role === "fleetOwner") {
//       query.status = "VERIFIED";
//       query.bidStatus = req.query.bidStatus
//         ? req.query.bidStatus
//         : { $in: ["OPEN", "UPCOMING"] };
//     }

//     // ✅ Existing filters
//     if (req.query.status && req.user.role !== "fleetOwner") {
//       query.status = req.query.status;
//     }

//     if (req.query.bidStatus && req.user.role !== "fleetOwner") {
//       query.bidStatus = req.query.bidStatus;
//     }

//     // ✅ 🔥 ADD THIS (MAIN FIX)
//  if (req.query.transportStatus && req.query.transportStatus.trim() !== "All") {
//   query.transportStatus = req.query.transportStatus;
// }

//     const loads = await Load.find(query).sort({ createdAt: -1 });

//     res.json(loads);
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };

// // @desc    Get single load by loadId
// // @route   GET /api/loads/:loadId
// // @access  Private
// const getLoadById = async (req, res) => {
//   try {
//     const load = await Load.findOne({ loadId: req.params.loadId });
//     if (!load) {
//       return res.status(404).json({ message: "Load not found" });
//     }
//     res.json(load);
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };

// // @desc    Create a new load
// // @route   POST /api/loads
// // @access  Private (Client/Staff)
// // const createLoad = async (req, res) => {
// //   try {
// //     const Address = require("../models/Address");
// //     let { customer, pickup, drop, newPickup, newDrop, ...otherData } = req.body;

// //     if (customer) {
// //       const findCustomer = await User.findById(customer);
// //       if(!findCustomer){
// //         return res.status(400).json({message:"Customer not exist", success:false})
// //       }
// //     }

// //     // Process new pickup address if provided
// //     if (newPickup) {
// //       const addr = await Address.create({ ...newPickup });
// //       pickup = { addressId: addr._id, address: addr.street, city: addr.city, state: addr.state, zip: addr.zip };
// //     }

// //     // Process new drop address if provided
// //     if (newDrop) {
// //       const addr = await Address.create({ ...newDrop });
// //       drop = { addressId: addr._id, address: addr.street, city: addr.city, state: addr.state, zip: addr.zip };
// //     }

// //     const newLoad = {
// //       ...otherData,
// //       customer,
// //       customerName,
// //       pickup,
// //       drop,
// //       createdBy: req.user.role,
// //       creatorId: req.user._id,
// //       status: req.user.role === 'staff' ? 'VERIFIED' : 'PENDING_VERIFICATION'
// //     };

// //     const load = await Load.create(newLoad);
// //     res.status(201).json(load);
// //   } catch (error) {
// //     res.status(400).json({ message: error.message });
// //   }
// // };

// const createLoad = async (req, res) => {
//   try {
//     const {
//       customer,
//       refNo,
//       deliveryType,
//       singleType,

//       truckType,
//       material,
//       amount,
//       lastFreeDate,
//       orderBillDate,

//       containerType,
//       commodity,
//       bookingNo,
//       shippingLine,
//       containerNo,
//       pickupNo,
//       sealNo,

//       hazmat,
//       chassisRent,
//       railContainer,

//       accChargesEmail,
//       podEmail,
//       deliveryEmail,
//       billingEmail,

//       description,
//       remarks,

//       status,
//     } = req.body;

//     // ✅ Validate customer
//     let customerName = "";
//     if (customer) {
//       const findCustomer = await User.findById(customer);
//       if (!findCustomer) {
//         return res.status(400).json({
//           message: "Customer does not exist",
//           success: false,
//         });
//       }
//       customerName = `${findCustomer.firstName} ${findCustomer.lastName}`;
//     } else {
//       return res.status(400).json({
//         message: "Customer is required",
//         success: false,
//       });
//     }

//     // 🚫 Pickup/Drop validation — will come in next step
//     // if (!pickup || !pickup.addressId) {
//     //   return res.status(400).json({ message: "Pickup address required" });
//     // }
//     // if (!drop || !drop.addressId) {
//     //   return res.status(400).json({ message: "Drop address required" });
//     // }

//     const newLoad = {
//       customer,
//       customerName,
//       refNo,
//       deliveryType,
//       singleType,

//       // 🚫 pickup,
//       // 🚫 drop,

//       truckType,
//       material,
//       amount,
//       lastFreeDate,
//       orderBillDate,

//       containerType,
//       commodity,
//       bookingNo,
//       shippingLine,
//       containerNo,
//       pickupNo,
//       sealNo,

//       hazmat,
//       chassisRent,
//       railContainer,

//       accChargesEmail,
//       podEmail,
//       deliveryEmail,
//       billingEmail,

//       description,
//       remarks,
//       status:
//         status ||
//         (req.user.role === "staff" ? "VERIFIED" : "PENDING_VERIFICATION"),
//       transportStatus: "LOAD_PLANNER",

//       createdBy: req.user.role,
//       creatorId: req.user._id,
//     };

//     const load = await Load.create(newLoad);

//     res.status(201).json({
//       success: true,
//       message: "Load created successfully",
//       data: load,
//     });
//   } catch (error) {
//     res.status(400).json({
//       message: error.message,
//       success: false,
//     });
//   }
// };

// // @desc    Update load status (Verify, Reject)
// // @route   PUT /api/loads/:loadId/status
// // @access  Private (Staff/Admin)
// const updateLoadStatus = async (req, res) => {
//   try {
//     const { status } = req.body;
//     const load = await Load.findOneAndUpdate(
//       { loadId: req.params.loadId },
//       { status },
//       { new: true, runValidators: true },
//     );

//     if (!load) {
//       return res.status(404).json({ message: "Load not found" });
//     }

//     // If status changed to REQUIRES_CHANGES, notify the client
//     if (status === "REQUIRES_CHANGES" && load.creatorId) {
//       const client = await User.findById(load.creatorId);
//       if (client) {
//         await sendEmail({
//           to: client.email,
//           subject: `Updates Required for Load ${load.loadId}`,
//           html: `<p>Hello ${client.firstName},</p>
//                   <p>Your load <strong>${load.loadId}</strong> requires some changes before it can be verified.</p>
//                   <p>Please log in to your dashboard to review and submit the changes.</p>`,
//         });
//       }
//     }

//     res.json(load);
//   } catch (error) {
//     res.status(400).json({ message: error.message });
//   }
// };

// // @desc    Update bidding status (Open, Close)
// // @route   PUT /api/loads/:loadId/bidding
// // @access  Private (Staff/Admin)
// const updateBiddingStatus = async (req, res) => {
//   try {
//     const { bidStatus, bidStartTime, bidEndTime } = req.body;
//     const update = { bidStatus };

//     if (bidStartTime) update.bidStartTime = bidStartTime;
//     if (bidEndTime) update.bidEndTime = bidEndTime;

//     const load = await Load.findOneAndUpdate(
//       { loadId: req.params.loadId },
//       update,
//       { new: true, runValidators: true },
//     );

//     if (!load) {
//       return res.status(404).json({ message: "Load not found" });
//     }

//     // Notify enrolled bidders if bidding is now open
//     if (bidStatus === "OPEN") {
//       const fleetOwners = await FleetOwner.find({ status: "ACTIVE" }).populate(
//         "userId",
//       );
//       for (const owner of fleetOwners) {
//         const email =
//           owner.contactPersons?.find((c) => c.isPrimary)?.email ||
//           owner.contactPersons?.[0]?.email;
//         if (email) {
//           await sendEmail({
//             to: email,
//             subject: `FMS - Bidding Now Open for Load ${load.loadId}`,
//             html: `
//               <h3>New Bidding Opportunity!</h3>
//               <p>Bidding is now open for Load <strong>${load.loadId}</strong>.</p>
//               <p><strong>Route:</strong> ${load.pickup.city}, ${load.pickup.state} → ${load.drop.city}, ${load.drop.state}</p>
//               <p><strong>Truck Type:</strong> ${load.truckType}</p>
//               <p><strong>Material:</strong> ${load.material}</p>
//               <p><strong>Bidding Ends:</strong> ${bidEndTime ? new Date(bidEndTime).toLocaleString() : "TBD"}</p>
//               <br/>
//               <p>Login to the FMS portal to place your bid.</p>
//             `,
//           });
//         }
//       }
//     }

//     res.json(load);
//   } catch (error) {
//     res.status(400).json({ message: error.message });
//   }
// };

// // @desc    Update load by client (for resubmission after changes requested)
// // @route   PUT /api/loads/:loadId
// // @access  Private (Client - only their own loads)
// // const updateLoad = async (req, res) => {
// //   try {
// //     const load = await Load.findOne({ loadId: req.params.loadId });

// //     if (!load) {
// //       return res.status(404).json({ message: "Load not found" });
// //     }

// //     // Clients can only update their own loads that require changes
// //     if (req.user.role === "client") {
// //       if (load.creatorId?.toString() !== req.user._id.toString()) {
// //         return res
// //           .status(403)
// //           .json({ message: "Not authorized to update this load" });
// //       }
// //       if (load.status !== "REQUIRES_CHANGES" && load.status !== "DRAFT") {
// //         return res
// //           .status(400)
// //           .json({
// //             message: "Can only edit loads in DRAFT or REQUIRES_CHANGES status",
// //           });
// //       }
// //     }

// //     // Update allowed fields
// //     const allowedFields = [
// //       "customer",
// //       "pickup",
// //       "drop",
// //       "truckType",
// //       "material",
// //       "amount",
// //       "date",
// //     ];
// //     for (const field of allowedFields) {
// //       if (req.body[field] !== undefined) {
// //         load[field] = req.body[field];
// //       }
// //     }

// //     // If client is resubmitting, change status back to PENDING_VERIFICATION
// //     if (req.user.role === "client" && load.status === "REQUIRES_CHANGES") {
// //       load.status = "PENDING_VERIFICATION";
// //     }

// //     // If status is provided by staff/admin
// //     if (
// //       req.body.status &&
// //       (req.user.role === "staff" || req.user.role === "admin")
// //     ) {
// //       load.status = req.body.status;
// //     }

// //     await load.save();
// //     res.json(load);
// //   } catch (error) {
// //     res.status(400).json({ message: error.message });
// //   }
// // };

// const updateLoad = async (req, res) => {
//   try {
//     const load = await Load.findOne({ loadId: req.params.loadId });

//     if (!load) {
//       return res.status(404).json({ message: "Load not found" });
//     }

//     // Authorization
//     if (req.user.role === "client") {
//       if (load.creatorId?.toString() !== req.user._id.toString()) {
//         return res.status(403).json({ message: "Not authorized" });
//       }

//       if (!["REQUIRES_CHANGES", "DRAFT"].includes(load.status)) {
//         return res.status(400).json({
//           message: "Can only edit DRAFT or REQUIRES_CHANGES",
//         });
//       }
//     }

//     // Allowed fields
//     const allowedFields = [
//       "customer",
//       "pickup",
//       "drop",
//       "truckType",
//       "material",
//       "amount",
//       "date",
//       "transportStatus",
//     ];

//     for (const field of allowedFields) {
//       if (req.body[field] !== undefined) {
//         load[field] = req.body[field];
//       }
//     }

//     // ✅ 🔥 MAIN LOGIC: Address added check
// // ✅ Fixed — checks what's on the document after save, not just what arrived in this request
// if (req.body.pickup) {
//   load.pickup = { ...req.body.pickup, pickupDate: req.body.pickup.pickupDate };
// }
// if (req.body.drop) {
//   load.drop = { ...req.body.drop, deliveryDate: req.body.drop.deliveryDate };
// }

// // Set adressAdded=true once drop has been saved (both exist on the document)
// const pickupDone = load.pickup?.city && load.pickup?.address;
// const dropDone = load.drop?.city && load.drop?.address;
// if (pickupDone && dropDone) {
//   load.adressAdded = true;
// }

//         // Move to Load Planner stage
//         load.transportStatus = "NEW_LOAD";

//         // Optional: move to verification
//         if (req.user.role === "client") {
//           load.status = "PENDING_VERIFICATION";
//         }
      
    

//     // Staff/Admin can update status manually
//     if (
//       req.body.status &&
//       ["staff", "admin"].includes(req.user.role)
//     ) {
//       load.status = req.body.status;
//     }

//     await load.save();

//     res.json(load);
//   } catch (error) {
//     res.status(400).json({ message: error.message });
//   }
// };

// // @desc    Schedule bidding for a load
// // @route   POST /api/loads/:loadId/schedule
// // @access  Private (Staff/Admin)
// const scheduleBidding = async (req, res) => {
//   try {
//     const { bidStartTime, bidEndTime } = req.body;

//     if (!bidStartTime || !bidEndTime) {
//       return res
//         .status(400)
//         .json({ message: "Both bidStartTime and bidEndTime are required" });
//     }

//     const load = await Load.findOne({ loadId: req.params.loadId });

//     if (!load) {
//       return res.status(404).json({ message: "Load not found" });
//     }

//     if (load.status !== "VERIFIED") {
//       return res
//         .status(400)
//         .json({ message: "Load must be verified before scheduling bidding" });
//     }

//     load.bidStartTime = new Date(bidStartTime);
//     load.bidEndTime = new Date(bidEndTime);

//     // Set status based on current time
//     const now = new Date();
//     if (new Date(bidStartTime) <= now) {
//       load.bidStatus = "OPEN";
//     } else {
//       load.bidStatus = "UPCOMING";
//     }

//     await load.save();

//     // Notify fleet owners about the scheduled bidding
//     const fleetOwners = await FleetOwner.find({ status: "ACTIVE" });
//     for (const owner of fleetOwners) {
//       const email =
//         owner.contactPersons?.find((c) => c.isPrimary)?.email ||
//         owner.contactPersons?.[0]?.email;
//       if (email) {
//         await sendEmail({
//           to: email,
//           subject: `FMS - New Bidding Scheduled: Load ${load.loadId}`,
//           html: `
//             <h3>New Bidding Opportunity!</h3>
//             <p>A new load is available for bidding.</p>
//             <p><strong>Load ID:</strong> ${load.loadId}</p>
//             <p><strong>Route:</strong> ${load.pickup.city}, ${load.pickup.state} → ${load.drop.city}, ${load.drop.state}</p>
//             <p><strong>Truck Type:</strong> ${load.truckType}</p>
//             <p><strong>Material:</strong> ${load.material}</p>
//             <p><strong>Bidding Starts:</strong> ${new Date(bidStartTime).toLocaleString()}</p>
//             <p><strong>Bidding Ends:</strong> ${new Date(bidEndTime).toLocaleString()}</p>
//             <br/>
//             <p>Login to the FMS portal to place your bid.</p>
//           `,
//         });
//       }
//     }

//     res.json(load);
//   } catch (error) {
//     res.status(400).json({ message: error.message });
//   }
// };

// const updateTransportStatus = async (req, res) => {
//   try {
//     const { transportStatus, note } = req.body;

//     const load = await Load.findOne({ loadId: req.params.loadId });

//     if (!load) {
//       return res.status(404).json({ message: "Load not found" });
//     }

//     // ✅ Only push if status actually changed
//     if (load.transportStatus !== transportStatus) {
//       load.transportStatus = transportStatus;

//       load.transportStatusHistory.push({
//         status: transportStatus,
//         changedAt: new Date(),
//         changedBy: req.user._id,
//         note: note || "",
//       });
//     }

//     await load.save();

//     res.json({
//       success: true,
//       message: "Transport status updated",
//       data: load,
//     });
//   } catch (error) {
//     res.status(400).json({
//       message: error.message,
//       success: false,
//     });
//   }
// };

// // @desc    Upload document for a load
// // @route   POST /api/loads/:loadId/documents
// // @access  Private
// const uploadDocument = async (req, res) => {
//   try {
//     const { documentType } = req.body;
//     if (!req.file) {
//       return res.status(400).json({ message: "No file uploaded" });
//     }
//     if (!documentType) {
//       return res.status(400).json({ message: "Document type is required" });
//     }

//     const load = await Load.findOne({ loadId: req.params.loadId });
//     if (!load) return res.status(404).json({ message: "Load not found" });

//     load.documents.push({
//       documentType,
//       fileName: req.file.originalname,
//       filePath: req.file.path,
//       dateReceived: new Date(),
//     });

//     await load.save();
//     res.json({ success: true, message: "Document uploaded", data: load.documents });
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };


// const deleteDocument = async (req, res) => {
//   try {
//     const load = await Load.findOne({ loadId: req.params.loadId });
//     if (!load) return res.status(404).json({ message: "Load not found" });

//     load.documents = load.documents.filter(
//       (doc) => doc._id.toString() !== req.params.docId
//     );
//     await load.save();
//     res.json({ success: true, message: "Document deleted" });
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };

// const assignFleetOwner = async (req, res) => {
//   try {
//     const { fleetOwnerId, fleetOwnerName } = req.body;

//     if (!fleetOwnerId || !fleetOwnerName) {
//       return res.status(400).json({ message: "fleetOwnerId and fleetOwnerName are required" });
//     }

//     const load = await Load.findOneAndUpdate(
//       { loadId: req.params.loadId },
//       {
//         $set: {
//           "status": "ASSIGNED",
//           "assignedFleetOwner.fleetOwnerId": fleetOwnerId,
//           "assignedFleetOwner.fleetOwnerName": fleetOwnerName,
//           "assignedFleetOwner.assignedAt": new Date(),
//           transportStatus: "ASSIGNED",
//         },
//       },
//       { returnDocument: "after" }   // ← fixes deprecation warning too
//     );

//     if (!load) return res.status(404).json({ message: "Load not found" });

//     console.log("Saved assignedFleetOwner:", load.assignedFleetOwner); // remove after confirming

//     res.json(load);
//   } catch (err) {
//     res.status(400).json({ message: err.message });
//   }
// };

// module.exports = {
//   getLoads,
//   getLoadById,
//   createLoad,
//   updateLoad,
//   updateLoadStatus,
//   updateBiddingStatus,
//   scheduleBidding,
//   updateTransportStatus,
//   uploadDocument,
//   deleteDocument,
//   assignFleetOwner,
// };
