const bcrypt = require("bcryptjs");
const userModel = require("../models/userModel");
const logger = require("../utils/logger");

const getUserInfo = async (req, res) => {
  const userId = req.user.userId;
  try {
    const getUser = await userModel.findUserByUserId(userId);

    if (!getUser) {
      logger.warn({ userId }, "User not found");
      return res.status(404).json({ error: "User not found" });
    }
    logger.info({ userId }, "Fetched user info successfully");
    res.status(200).json(getUser);
  } catch (err) {
    logger.error({ err, userId }, "Error fetching user info");
    res.status(500).json({ error: "Internal server error." });
  }
}

/**
 * Update user profile (username and/or email)
 */
const updateProfile = async (req, res) => {
  const userId = req.user.userId;
  const { username, email } = req.body;

  try {
    // Validate input
    if (!username && !email) {
      return res.status(400).json({ error: "Username or email is required." });
    }

    // Check for duplicate username
    if (username) {
      const existingUsername = await userModel.findUserByUsername(username);
      if (existingUsername) {
        // Check if it's not the current user's username
        const currentUser = await userModel.findUserByUserId(userId);
        if (currentUser && currentUser.username !== username) {
          return res.status(409).json({ error: "Username is already taken." });
        }
      }
      await userModel.updateUsername(userId, username);
      logger.info({ userId, username }, "Username updated");
    }

    // Check for duplicate email
    if (email) {
      const existingEmail = await userModel.findUserByEmail(email);
      if (existingEmail) {
        // Check if it's not the current user's email
        const currentUser = await userModel.findUserByUserId(userId);
        if (currentUser && currentUser.email !== email) {
          return res.status(409).json({ error: "Email is already registered." });
        }
      }
      await userModel.updateEmail(userId, email);
      logger.info({ userId, email }, "Email updated");
    }

    res.status(200).json({ message: "Profile updated successfully." });
  } catch (err) {
    logger.error({ err, userId }, "Error updating profile");
    res.status(500).json({ error: "Internal server error." });
  }
};

/**
 * Update user password
 */
const updatePassword = async (req, res) => {
  const userId = req.user.userId;
  const { currentPassword, newPassword } = req.body;

  try {
    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new password are required." });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters." });
    }

    // Verify current password
    const storedHash = await userModel.getUserPasswordHash(userId);
    if (!storedHash) {
      return res.status(404).json({ error: "User not found." });
    }

    const isMatch = await bcrypt.compare(currentPassword, storedHash);
    if (!isMatch) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }

    // Hash and save new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await userModel.updatePassword(userId, hashedPassword);

    logger.info({ userId }, "Password updated successfully");
    res.status(200).json({ message: "Password updated successfully." });
  } catch (err) {
    logger.error({ err, userId }, "Error updating password");
    res.status(500).json({ error: "Internal server error." });
  }
};

/**
 * Update profile picture
 */
const updateProfilePicture = async (req, res) => {
  const userId = req.user.userId;
  const { profilePicture } = req.body;

  try {
    if (!profilePicture) {
      return res.status(400).json({ error: "Profile picture is required." });
    }

    await userModel.updateProfilePicture(userId, profilePicture);

    logger.info({ userId }, "Profile picture updated");
    res.status(200).json({ message: "Profile picture updated successfully." });
  } catch (err) {
    logger.error({ err, userId }, "Error updating profile picture");
    res.status(500).json({ error: "Internal server error." });
  }
};

module.exports = {
  getUserInfo,
  updateProfile,
  updatePassword,
  updateProfilePicture,
};
