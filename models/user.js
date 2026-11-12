
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        trim: true
    },

    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },

    password: {
        type: String,
        required: true
    },

    rollNumber: {
        type: String,
        required: true,
        trim: true
    },

    casualLeave: {
        type: Number,
        default: 10,
        min: 0
    },

    medicalLeave: {
        type: Number,
        default: 10,
        min: 0
    },

    role: {
        type: String,
        enum: ["student", "staff", "admin"],
        default: "student"
    }

}, {
    timestamps: true
});

const User = mongoose.model("User", UserSchema);

module.exports = User;
