const request = require("supertest");
const sinon = require("sinon");
const bcrypt = require("bcryptjs");
const app = require("../index"); // or wherever your Express app is exported
const userModel = require("../models/userModel");
const transporter = require("../mail");

describe("Auth Controller - Signup, Login, Verify", () => {
  afterEach(() => {
    sinon.restore(); // restore all stubs
  });

  // -------------------------------
  // Signup Tests
  // -------------------------------
  describe("POST /auth/signup", () => {
    it("should return 400 if username/email/password is missing", async () => {
      const res = await request(app).post("/auth/signup").send({});
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/Username, email, and password/);
    });

    it("should return 409 if username is already taken", async () => {
      sinon.stub(userModel, "findUserByUsername").resolves({ id: 1 });

      const res = await request(app).post("/auth/signup").send({
        username: "testuser",
        email: "test@example.com",
        password: "123456",
      });

      expect(res.statusCode).toBe(409);
      expect(res.body.error).toBe("Username is already taken.");
    });

    it("should return 409 if email is already registered", async () => {
      sinon.stub(userModel, "findUserByUsername").resolves(null);
      sinon.stub(userModel, "findUserByEmail").resolves({ id: 1 });

      const res = await request(app).post("/auth/signup").send({
        username: "testuser",
        email: "test@example.com",
        password: "123456",
      });

      expect(res.statusCode).toBe(409);
      expect(res.body.error).toBe("Email is already registered.");
    });

    it("should return 201 if signup is successful", async () => {
      sinon.stub(userModel, "findUserByUsername").resolves(null);
      sinon.stub(userModel, "findUserByEmail").resolves(null);
      sinon.stub(bcrypt, "hash").resolves("hashedPassword");
      sinon.stub(userModel, "createUser").resolves({
        id: 101,
        username: "testuser",
        email: "test@example.com",
      });
      sinon.stub(transporter, "sendMail").resolves({
        accepted: ["test@example.com"],
      });

      const res = await request(app).post("/auth/signup").send({
        username: "testuser",
        email: "test@example.com",
        password: "123456",
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.message).toMatch(/User created, Verify email now/i);


    });
  });
});
