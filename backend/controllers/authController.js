const bcrypt = require("bcryptjs");
const userModel = require("../models/userModel");
const generateToken = require("../utils/jwt");

// for node mailer
const crypto = require("crypto");
const transporter = require("../mail");

// for pino logger
const logger = require("../utils/logger");

const signup = async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res
      .status(400)
      .json({ error: "Username, email, and password are required." });
  }

  try {
    const existingUsername = await userModel.findUserByUsername(username);
    if (existingUsername) {
      return res.status(409).json({ error: "Username is already taken." });
    }

    const existingEmail = await userModel.findUserByEmail(email);
    if (existingEmail) {
      return res.status(409).json({ error: "Email is already registered." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const token = crypto.randomBytes(32).toString("hex");

    const newUser = await userModel.createUser(
      username,
      email,
      hashedPassword,
      token
    );

    // Send verification email
    const verificationUrl = `https://notesbackend-ewd6eagpbufcc9b3.uaenorth-01.azurewebsites.net/auth/verify/${token}`;


    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Verify your email",
      html: `
  <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif; background-color: #f9f9f9; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
    <h2 style="color: #333; text-align: center;">Welcome to Note Taker Prototype! </h2>
    <p style="font-size: 16px; color: #555;">
      Thank you for signing up! Please verify your email address to activate your account.
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${verificationUrl}" style="padding: 12px 24px; background-color: #FFBF00; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
        Verify Email
      </a>
    </div>
    <p style="font-size: 14px; color: #999;">
      If the button above doesn't work, copy and paste this link into your browser:
    </p>
    <p style="word-break: break-all; font-size: 14px; color: #555;">
      <a href="${verificationUrl}" style="color: #0066cc;">${verificationUrl}</a>
    </p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 40px 0;">
    <p style="font-size: 12px; color: #999; text-align: center;">
      This email was sent by Note Taker Prototype. If you did not sign up, you can ignore this email.
    </p>
  </div>
`,
    };

    await transporter.sendMail(mailOptions);

    logger.info({ userId: newUser.id, email }, "New user signed up and verification email sent");


    res.status(201).json({
      message: "User created, Verify email now",
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Signup error");
    res.status(500).json({ error: "Internal server error" });
  }
};
const verifyEmail = async (req, res) => {
  const { token } = req.params;

  const user = await userModel.findUserByVerificationToken(token);

  if (!user) {
    return res.status(400).json({ error: "Invalid or expired token." });
  }

  await userModel.markUserAsVerified(user.id);

  logger.info({ userId: user.id }, "Email verified successfully");

  res.send("<h2>Email verified successfully! You can now log in.</h2>");
};


const login = async (req, res) => {
  const { usernameOrEmail, password } = req.body;

  // 1. Basic validation
  if (!usernameOrEmail || !password) {
    return res
      .status(400)
      .json({ error: "Username/email and password are required." });
  }

  // 2. Find user
  const user = await userModel.findUserByUsernameOrEmail(usernameOrEmail);
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials." });
  }

  if (!user.is_verified) {
    return res.status(403).json({ error: "Email not verified." });
  }

  // 3. Compare password
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    return res.status(401).json({ error: "Wrong Password" });
  }

  await userModel.updateLastLogin(user.id);

  const token = generateToken(user.id);

  logger.info({ userId: user.id }, "Login successful");

  // 4. Login success
  res.status(200).json({
    message: "Login successful",
    token: token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
  });
};

module.exports = {
  signup,
  login,
  verifyEmail
};
