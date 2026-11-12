require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const connectDB = require("./config/db");
const leaveRoutes = require("./routes/leaveRoutes");

const app = express();
const PORT = process.env.PORT || 5050;

// Allow requests from GitHub Pages
app.use(cors({
    origin: "https://deepika-s-08.github.io"
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use("/api", leaveRoutes);

async function startServer() {
    try {
        await connectDB();
        app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Website URL: http://localhost:${PORT}`);
});     
    } catch (error) {
        console.error("Failed to start server:", error.message);
        process.exit(1);
    }
}

startServer();
