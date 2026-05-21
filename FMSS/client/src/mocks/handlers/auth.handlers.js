 import { http, HttpResponse } from "msw";
import { users, otpStore, resetTokens } from "../db";
import { v4 as uuid } from "uuid";


export const authHandlers = [

  // 🔹 LOGIN
http.post("/api/login", async ({ request }) => {
  const { email, password } = await request.json();

  const user = users.find(
    (u) => u.email === email && u.password === password
  );

  if (!user) {
    return HttpResponse.json(
      { message: "Invalid credentials" },
      { status: 401 }
    );
  }

  if (!user.isVerified) {
    return HttpResponse.json(
      { message: "Email not verified" },
      { status: 403 }
    );
  }

  return HttpResponse.json({
    api_token: "mock-token-12345",
    user,
  });
}),


  // 🔹 VERIFY EMAIL
  http.post("/api/verify-email", async ({ request }) => {
    const { email, otp } = await request.json();

    if (otpStore[email] !== otp) {
      return HttpResponse.json(
        { message: "Invalid OTP" },
        { status: 400 }
      );
    }

    const user = users.find((u) => u.email === email);
    if (user) user.isVerified = true;

    delete otpStore[email];

    return HttpResponse.json({ message: "Email verified" });
  }),



  // 🔹 FORGOT PASSWORD
  http.post("/api/forgot-password", async ({ request }) => {
    const { email } = await request.json();

    const user = users.find((u) => u.email === email);
    if (!user) {
      return HttpResponse.json(
        { message: "User not found" },
        { status: 404 }
      );
    }

    const resetToken = uuid();
    resetTokens[email] = resetToken;

    console.log("Reset Token:", resetToken);

    return HttpResponse.json({
      message: "Reset link sent",
      resetToken, 
    });
  }),

  // 🔹 RESET PASSWORD
  http.post("/api/reset-password", async ({ request }) => {
    const { email, token, newPassword } = await request.json();

    if (resetTokens[email] !== token) {
      return HttpResponse.json(
        { message: "Invalid token" },
        { status: 400 }
      );
    }

    const user = users.find((u) => u.email === email);
    if (user) user.password = newPassword;

    delete resetTokens[email];

    return HttpResponse.json({ message: "Password updated" });
  }),

  
  // 🔹 CUSTOMER SELF REGISTER
  http.post("/api/register", async ({ request }) => {
    const body = await request.json();

    const existing = users.find((u) => u.email === body.email);
    if (existing) {
      return HttpResponse.json(
        { message: "Email already exists" },
        { status: 400 }
      );
    }

    const newUser = {
      id: uuid(),
      ...body,
      role: "client",
      isVerified: false,
    };

    users.push(newUser);

    // Generate OTP
    const otp = "1234";
    otpStore[body.email] = otp;

    console.log("OTP:", otp);

    return HttpResponse.json({
      message: "Registered successfully. Verify email.",
    });
  }),

    // 🔹 STAFF CREATES VENDOR OR CUSTOMER
  http.post("/api/staff/create-user", async ({ request }) => {
    const body = await request.json();

    const newUser = {
      id: uuid(),
      ...body,
      isVerified: true,
    };

    users.push(newUser);

    return HttpResponse.json({ message: "User created by staff" });
  }),

  // 🔹 GET ALL CUSTOMERS
http.get("/api/customer", () => {
  const customers = users.filter((u) => u.role === "client");
  return HttpResponse.json(customers);
}),
];


