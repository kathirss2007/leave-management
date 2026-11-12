
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const User = require("../models/user");
const Leave = require("../models/leave");

// ================= TOKEN FUNCTIONS =================

function createToken(user) {
    const secret = process.env.AUTH_SECRET;

    if (!secret) {
        throw new Error("AUTH_SECRET is missing in .env");
    }

    const payload = {
        id: user._id.toString(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000
    };

    const encodedPayload = Buffer
        .from(JSON.stringify(payload))
        .toString("base64url");

    const signature = crypto
        .createHmac("sha256", secret)
        .update(encodedPayload)
        .digest("base64url");

    return `${encodedPayload}.${signature}`;
}

function verifyToken(token) {
    const secret = process.env.AUTH_SECRET;

    if (!secret || typeof token !== "string") {
        return null;
    }

    const parts = token.split(".");

    if (parts.length !== 2) {
        return null;
    }

    const [encodedPayload, receivedSignature] = parts;

    const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(encodedPayload)
        .digest("base64url");

    const received = Buffer.from(receivedSignature);
    const expected = Buffer.from(expectedSignature);

    if (
        received.length !== expected.length ||
        !crypto.timingSafeEqual(received, expected)
    ) {
        return null;
    }

    try {
        const payload = JSON.parse(
            Buffer.from(encodedPayload, "base64url").toString()
        );

        if (!payload.id || Date.now() > payload.expiresAt) {
            return null;
        }

        return payload;
    } catch {
        return null;
    }
}

// ================= AUTHENTICATION =================

async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization || "";

        if (!authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                message: "Please log in first."
            });
        }

        const token = authHeader.slice(7);
        const payload = verifyToken(token);

        if (!payload || !mongoose.isValidObjectId(payload.id)) {
            return res.status(401).json({
                message: "Invalid or expired login session."
            });
        }

        const user = await User.findById(payload.id).select("-password");

        if (!user) {
            return res.status(401).json({
                message: "User account not found."
            });
        }

        req.user = user;
        next();

    } catch (error) {
        console.error("Authentication error:", error);

        return res.status(500).json({
            message: "Authentication failed."
        });
    }
}

// Staff and existing Admin accounts can review student requests.
function requireStaff(req, res, next) {
    if (!req.user || !["staff", "admin"].includes(req.user.role)) {
        return res.status(403).json({
            message: "Staff access only."
        });
    }

    next();
}

// ================= DATE FUNCTION =================

function calculateLeaveDays(startDate, endDate) {
    if (
        typeof startDate !== "string" ||
        typeof endDate !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
    ) {
        return null;
    }

    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);

    if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime()) ||
        start.toISOString().slice(0, 10) !== startDate ||
        end.toISOString().slice(0, 10) !== endDate ||
        end < start
    ) {
        return null;
    }

    return Math.floor((end - start) / 86400000) + 1;
}

// ================= STUDENT REGISTRATION =================

router.post("/register", async (req, res) => {
    try {
        const {
            username,
            email,
            password,
            rollNumber
        } = req.body || {};

        if (
            typeof username !== "string" ||
            typeof email !== "string" ||
            typeof password !== "string" ||
            typeof rollNumber !== "string" ||
            !username.trim() ||
            !email.trim() ||
            !password ||
            !rollNumber.trim()
        ) {
            return res.status(400).json({
                message: "Please fill in all required fields."
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                message: "Password must contain at least 6 characters."
            });
        }

        const cleanEmail = email.trim().toLowerCase();
        const cleanRollNumber = rollNumber.trim();

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(cleanEmail)) {
            return res.status(400).json({
                message: "Please enter a valid email address."
            });
        }

        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({
                message: "Database is not connected."
            });
        }

        const existingUser = await User.findOne({
            $or: [
                { email: cleanEmail },
                { rollNumber: cleanRollNumber }
            ]
        });

        if (existingUser) {
            return res.status(409).json({
                message: "Email or Register Number is already registered."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await User.create({
            username: username.trim(),
            email: cleanEmail,
            password: hashedPassword,
            rollNumber: cleanRollNumber,
            casualLeave: 10,
            medicalLeave: 10,
            role: "student"
        });

        return res.status(201).json({
            message: "Student registration successful! Please log in.",
            userId: newUser._id,
            username: newUser.username,
            email: newUser.email,
            rollNumber: newUser.rollNumber,
            casualLeave: newUser.casualLeave,
            medicalLeave: newUser.medicalLeave,
            role: newUser.role
        });

    } catch (error) {
        console.error("Registration error:", error);

        if (error.code === 11000) {
            return res.status(409).json({
                message: "Email or Register Number is already registered."
            });
        }

        return res.status(500).json({
            message: "Registration failed."
        });
    }
});

// ================= LOGIN =================

router.post("/login", async (req, res) => {
    try {
        const email =
            typeof req.body?.email === "string"
                ? req.body.email.trim().toLowerCase()
                : "";

        const password =
            typeof req.body?.password === "string"
                ? req.body.password
                : "";

        if (!email || !password) {
            return res.status(400).json({
                message: "Please enter your email and password."
            });
        }

        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({
                message: "Database is not connected."
            });
        }

        const user = await User.findOne({ email });

        if (!user || !user.password) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        const passwordMatches = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatches) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        const token = createToken(user);

        return res.json({
            message: "Login successful.",
            token,
            userId: user._id,
            username: user.username,
            email: user.email,
            rollNumber: user.rollNumber,
            casualLeave: user.casualLeave,
            medicalLeave: user.medicalLeave,
            role: user.role || "student"
        });

    } catch (error) {
        console.error("Login error:", error);

        return res.status(500).json({
            message: "Login failed. Check server configuration."
        });
    }
});

// ================= GET LEAVE BALANCE =================

router.get(
    "/leave-balance/:id",
    authenticate,
    async (req, res) => {
        try {
            const userId = req.params.id;

            if (!mongoose.isValidObjectId(userId)) {
                return res.status(400).json({
                    message: "Invalid user ID."
                });
            }

            if (
                req.user.role === "student" &&
                req.user._id.toString() !== userId
            ) {
                return res.status(403).json({
                    message: "You cannot view another student's balance."
                });
            }

            const user = await User.findById(userId);

            if (!user) {
                return res.status(404).json({
                    message: "User not found."
                });
            }

            return res.json({
                casualLeave: user.casualLeave,
                medicalLeave: user.medicalLeave
            });

        } catch (error) {
            console.error("Leave balance error:", error);

            return res.status(500).json({
                message: "Could not fetch leave balance."
            });
        }
    }
);

// ================= STUDENT APPLY FOR LEAVE =================

async function applyLeave(req, res) {
    try {
        const userId = req.params.id;

        const type = req.body?.type || req.body?.leaveType;

        const {
            startDate,
            endDate,
            reason
        } = req.body || {};

        if (!mongoose.isValidObjectId(userId)) {
            return res.status(400).json({
                message: "Invalid student ID."
            });
        }

        if (req.user.role !== "student") {
            return res.status(403).json({
                message: "Only students can apply for leave."
            });
        }

        if (req.user._id.toString() !== userId) {
            return res.status(403).json({
                message: "You can apply leave only for your account."
            });
        }

        if (!["casual", "medical"].includes(type)) {
            return res.status(400).json({
                message: "Invalid leave type."
            });
        }

        if (typeof reason !== "string" || !reason.trim()) {
            return res.status(400).json({
                message: "Please enter the leave reason."
            });
        }

        const days = calculateLeaveDays(startDate, endDate);

        if (!days) {
            return res.status(400).json({
                message: "Please enter valid start and end dates."
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                message: "Student not found."
            });
        }

        const balanceField =
            type === "casual" ? "casualLeave" : "medicalLeave";

        // Reserve the days of pending applications.
        // Do not deduct the balance until Staff approves.
        const pendingRequests = await Leave.aggregate([
            {
                $match: {
                    user: user._id,
                    leaveType: type,
                    status: "Pending"
                }
            },
            {
                $group: {
                    _id: null,
                    totalDays: { $sum: "$days" }
                }
            }
        ]);

        const pendingDays = pendingRequests[0]?.totalDays || 0;
        const availableBalance = user[balanceField] - pendingDays;

        if (days > availableBalance) {
            return res.status(400).json({
                message: `Insufficient ${type} leave balance. Available after pending requests: ${Math.max(0, availableBalance)} days.`
            });
        }

        const leave = await Leave.create({
            user: userId,
            leaveType: type,
            startDate: new Date(`${startDate}T00:00:00.000Z`),
            endDate: new Date(`${endDate}T00:00:00.000Z`),
            days,
            reason: reason.trim(),
            status: "Pending",
            reviewedAt: null
        });

        return res.status(201).json({
            message: "Leave request submitted successfully. Waiting for Staff approval.",
            leave
        });

    } catch (error) {
        console.error("Apply leave error:", error);

        return res.status(500).json({
            message: "Leave application failed."
        });
    }
}

router.post(
    "/apply-leave/:id",
    authenticate,
    applyLeave
);

router.post(
    "/leave/:id",
    authenticate,
    applyLeave
);

// ================= STUDENT LEAVE HISTORY =================

router.get(
    "/my-leaves/:id",
    authenticate,
    async (req, res) => {
        try {
            const userId = req.params.id;

            if (!mongoose.isValidObjectId(userId)) {
                return res.status(400).json({
                    message: "Invalid student ID."
                });
            }

            if (
                req.user.role === "student" &&
                req.user._id.toString() !== userId
            ) {
                return res.status(403).json({
                    message: "You cannot view another student's leave history."
                });
            }

            const leaves = await Leave.find({ user: userId })
                .sort({ createdAt: -1 });

            return res.json(leaves);

        } catch (error) {
            console.error("Leave history error:", error);

            return res.status(500).json({
                message: "Could not fetch leave history."
            });
        }
    }
);

// ================= STAFF DASHBOARD =================

async function loadStaffDashboard(req, res) {
    try {
        const [
            totalStudents,
            pending,
            approved,
            rejected,
            students,
            leaves
        ] = await Promise.all([
            User.countDocuments({ role: "student" }),

            Leave.countDocuments({ status: "Pending" }),

            Leave.countDocuments({ status: "Approved" }),

            Leave.countDocuments({ status: "Rejected" }),

            User.find({ role: "student" })
                .select("-password")
                .sort({ createdAt: -1 }),

            Leave.find()
                .populate("user", "username email rollNumber")
                .sort({ createdAt: -1 })
        ]);

        return res.json({
            stats: {
                totalStudents,
                pending,
                approved,
                rejected
            },
            students,
            leaves
        });

    } catch (error) {
        console.error("Staff dashboard error:", error);

        return res.status(500).json({
            message: "Could not load Staff dashboard."
        });
    }
}

// Staff dashboard
router.get(
    "/staff/dashboard",
    authenticate,
    requireStaff,
    loadStaffDashboard
);

// Old dashboard URL retained for compatibility
router.get(
    "/admin/dashboard",
    authenticate,
    requireStaff,
    loadStaffDashboard
);

// ================= STAFF APPROVE / REJECT =================

async function updateLeaveStatus(req, res) {
    const { status } = req.body || {};

    if (!["Approved", "Rejected"].includes(status)) {
        return res.status(400).json({
            message: "Status must be Approved or Rejected."
        });
    }

    if (!mongoose.isValidObjectId(req.params.leaveId)) {
        return res.status(400).json({
            message: "Invalid leave request ID."
        });
    }

    let session;

    try {
        session = await mongoose.startSession();

        let updatedLeave = null;

        await session.withTransaction(async () => {
            const leave = await Leave.findById(
                req.params.leaveId
            ).session(session);

            if (!leave) {
                const error = new Error("Leave request not found.");
                error.statusCode = 404;
                throw error;
            }

            if (leave.status !== "Pending") {
                const error = new Error(
                    "This leave request has already been reviewed."
                );
                error.statusCode = 409;
                throw error;
            }

            // Deduct balance only if Staff approves.
            if (status === "Approved") {
                const balanceField =
                    leave.leaveType === "casual"
                        ? "casualLeave"
                        : "medicalLeave";

                const updatedUser = await User.findOneAndUpdate(
                    {
                        _id: leave.user,
                        [balanceField]: { $gte: leave.days }
                    },
                    {
                        $inc: { [balanceField]: -leave.days }
                    },
                    {
                        new: true,
                        session
                    }
                );

                if (!updatedUser) {
                    const error = new Error(
                        "Insufficient leave balance. Request cannot be approved."
                    );
                    error.statusCode = 400;
                    throw error;
                }
            }

            leave.status = status;
            leave.reviewedAt = new Date();

            await leave.save({ session });

            updatedLeave = leave;
        });

        return res.json({
            message: `Leave request ${status.toLowerCase()} successfully.`,
            leave: updatedLeave
        });

    } catch (error) {
        console.error("Leave review error:", error);

        return res.status(error.statusCode || 500).json({
            message: error.message || "Could not update leave status."
        });

    } finally {
        if (session) {
            await session.endSession();
        }
    }
}

// New Staff approval URL
router.patch(
    "/staff/leaves/:leaveId/status",
    authenticate,
    requireStaff,
    updateLeaveStatus
);

// Old Admin approval URL retained for compatibility
router.patch(
    "/admin/leaves/:leaveId/status",
    authenticate,
    requireStaff,
    updateLeaveStatus
);

module.exports = router;
