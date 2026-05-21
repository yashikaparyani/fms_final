const User = require("../models/User");
const jwt = require("jsonwebtoken");
const { sendEmail } = require("../utils/mailer");

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || "fallback_secret", {
    expiresIn: "30d",
  });
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { firstName, lastName, email, password, role, permissions } = req.body;

    // Default to client if no role provided
    const userRole = role || "client";

    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      role: userRole,
      permissions: permissions || [],
      isVerified: true, // Auto-verify for now, in prod might require email verification
    });

    if (user) {

      // If the creator of the user isn't the user themselves (e.g., Staff created Customer)
      // We send them an email with their credentials.
      // In a real app, we check if req.user exists and has 'staff' or 'admin' role.
      // For demo, we just attempt to send an email welcoming them.
      await sendEmail({
        to: user.email,
        subject: "Welcome to FMS - Your Credentials",
        html: `<h3>Welcome ${user.firstName}!</h3>
               <p>Your account has been created successfully.</p>
               <p><strong>Email:</strong> ${user.email}</p>
               <p><strong>Password:</strong> ${password}</p>
               <p>Please log in and change your password immediately.</p>`
      });

      res.status(201).json({
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          permissions: user.permissions,
          isVerified: user.isVerified,
        },
        api_token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ message: "Invalid user data" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");

    if (user && (await user.matchPassword(password))) {
      res.json({
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          permissions: user.permissions,
          isVerified: user.isVerified,
        },
        api_token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: "Invalid email or password" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
       return res.status(404).json({ message: "User not found" });
    }

    res.json({
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      isVerified: user.isVerified,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
};
