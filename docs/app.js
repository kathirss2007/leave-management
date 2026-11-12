
let userId = null;
let authToken = null;
let currentRole = null;

// Local backend for development and Render backend for GitHub Pages
const API_URL =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
        ? window.location.origin
        : "https://leave-management-1-2w2y.onrender.com";

// ================= COMMON FUNCTIONS =================

function showMessage(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) element.innerText = message;
}

function showElement(id) {
    const element = document.getElementById(id);
    if (element) element.style.display = "block";
}

function hideElement(id) {
    const element = document.getElementById(id);
    if (element) element.style.display = "none";
}

function getAuthHeaders() {
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`
    };
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function formatDate(date) {
    if (!date) return "-";

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) return "-";

    return parsed.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

// ================= FORM NAVIGATION =================

function showRegistrationForm() {
    hideElement("login-section");
    showElement("registration-section");
    showMessage("registration-response", "");
}

function showLoginForm() {
    hideElement("registration-section");
    showElement("login-section");
}

// ================= STUDENT REGISTRATION =================

async function registerUser(event) {
    event.preventDefault();

    const username = document.getElementById("username").value.trim();
    const email = document.getElementById("reg-email").value.trim();
    const password = document.getElementById("reg-password").value;
    const rollNumber = document.getElementById("roll-number").value.trim();

    if (!username || !email || !password || !rollNumber) {
        showMessage(
            "registration-response",
            "Please fill in all required fields."
        );
        return;
    }

    if (password.length < 6) {
        showMessage(
            "registration-response",
            "Password must contain at least 6 characters."
        );
        return;
    }

    const registerButton = document.querySelector(
        '#registration-form button[type="submit"]'
    );

    if (registerButton) {
        registerButton.disabled = true;
        registerButton.innerText = "Registering...";
    }

    try {
        const response = await fetch(`${API_URL}/api/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                username,
                email,
                password,
                rollNumber
            })
        });

        const data = await response.json();

        if (!response.ok) {
            showMessage(
                "registration-response",
                data.message || "Registration failed."
            );
            return;
        }

        document.getElementById("registration-form").reset();
        document.getElementById("email").value = email;

        showMessage(
            "registration-response",
            "Student registration successful! Please login."
        );

        showLoginForm();

    } catch (error) {
        console.error("Registration error:", error);

        showMessage(
            "registration-response",
            "Cannot connect to server."
        );
    } finally {
        if (registerButton) {
            registerButton.disabled = false;
            registerButton.innerText = "Register";
        }
    }
}

// ================= LOGIN =================

async function loginUser(event) {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (!email || !password) {
        showMessage(
            "response-message",
            "Please enter email and password."
        );
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            showMessage(
                "response-message",
                data.message || "Login failed."
            );
            return;
        }

        if (!data.token || !data.userId || !data.role) {
            showMessage(
                "response-message",
                "Login response is incomplete. Check backend."
            );
            return;
        }

        if (!["student", "staff", "admin"].includes(data.role)) {
            showMessage(
                "response-message",
                "Invalid account role."
            );
            return;
        }

        userId = data.userId;
        authToken = data.token;
        currentRole = data.role;

        hideElement("login-section");
        hideElement("registration-section");
        showElement("logout-button");

        // ================= STUDENT LOGIN =================

        if (currentRole === "student") {

            hideElement("staff-dashboard-section");

            showElement("balance-section");
            showElement("apply-leave-section");
            showElement("leave-history-section");

            document.getElementById("username-display").innerText =
                data.username || "";

            document.getElementById("roll-number-display").innerText =
                data.rollNumber || "";

            document.getElementById("casual-leave-display").innerText =
                data.casualLeave ?? 10;

            document.getElementById("medical-leave-display").innerText =
                data.medicalLeave ?? 10;

            await refreshLeaveBalance();
            await loadLeaveHistory();

            showMessage(
                "response-message",
                "Student login successful."
            );
        }

        // ================= STAFF / ADMIN LOGIN =================

        else {

            hideElement("balance-section");
            hideElement("apply-leave-section");
            hideElement("leave-history-section");

            showElement("staff-dashboard-section");

            document.getElementById("staff-username-display").innerText =
                data.username || "";

            await loadStaffDashboard();

            showMessage(
                "response-message",
                "Staff login successful."
            );
        }

    } catch (error) {
        console.error("Login error:", error);

        showMessage(
            "response-message",
            "Cannot connect to server."
        );
    }
}

// ================= LOGOUT =================

function logoutUser() {
    userId = null;
    authToken = null;
    currentRole = null;

    hideElement("balance-section");
    hideElement("apply-leave-section");
    hideElement("leave-history-section");
    hideElement("staff-dashboard-section");
    hideElement("logout-button");

    showElement("login-section");
    hideElement("registration-section");

    document.getElementById("login-form")?.reset();
    document.getElementById("registration-form")?.reset();
    document.getElementById("leave-form")?.reset();

    document.getElementById("username-display").innerText = "";
    document.getElementById("roll-number-display").innerText = "";
    document.getElementById("staff-username-display").innerText = "";

    document.getElementById("casual-leave-display").innerText = "10";
    document.getElementById("medical-leave-display").innerText = "10";

    document.getElementById("leave-history-body").innerHTML = `
        <tr><td colspan="7">No leave requests found.</td></tr>
    `;

    document.getElementById("staff-students-body").innerHTML = `
        <tr><td colspan="5">No student details found.</td></tr>
    `;

    document.getElementById("staff-leaves-body").innerHTML = `
        <tr><td colspan="10">No leave requests found.</td></tr>
    `;

    showMessage("response-message", "");
}

// ================= REFRESH STUDENT BALANCE =================

async function refreshLeaveBalance() {
    if (!userId || !authToken || currentRole !== "student") {
        return;
    }

    try {
        const response = await fetch(
            `${API_URL}/api/leave-balance/${userId}`,
            {
                headers: getAuthHeaders()
            }
        );

        const data = await response.json();

        if (!response.ok) {
            showMessage(
                "response-message",
                data.message || "Could not get leave balance."
            );
            return;
        }

        document.getElementById("casual-leave-display").innerText =
            data.casualLeave;

        document.getElementById("medical-leave-display").innerText =
            data.medicalLeave;

    } catch (error) {
        console.error("Balance error:", error);
        showMessage("response-message", "Could not refresh leave balance.");
    }
}

// ================= STUDENT APPLY FOR LEAVE =================

async function applyLeave(event) {
    event.preventDefault();

    if (!userId || !authToken || currentRole !== "student") {
        showMessage(
            "response-message",
            "Please login with a Student account."
        );
        return;
    }

    const type = document.getElementById("leave-type").value;
    const startDate = document.getElementById("leave-start-date").value;
    const endDate = document.getElementById("leave-end-date").value;
    const reason = document.getElementById("leave-reason").value.trim();

    if (!startDate || !endDate || !reason) {
        showMessage(
            "response-message",
            "Please fill in all leave details."
        );
        return;
    }

    if (endDate < startDate) {
        showMessage(
            "response-message",
            "End date cannot be before start date."
        );
        return;
    }

    const submitButton = document.querySelector(
        '#leave-form button[type="submit"]'
    );

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.innerText = "Submitting...";
    }

    try {
        const response = await fetch(
            `${API_URL}/api/apply-leave/${userId}`,
            {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    type,
                    startDate,
                    endDate,
                    reason
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            showMessage(
                "response-message",
                data.message || "Leave application failed."
            );
            return;
        }

        document.getElementById("leave-form").reset();

        showMessage(
            "response-message",
            "Leave request submitted successfully. Waiting for Staff approval."
        );

        await loadLeaveHistory();

    } catch (error) {
        console.error("Apply leave error:", error);

        showMessage(
            "response-message",
            "Cannot connect to server."
        );
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerText = "Submit Leave Request";
        }
    }
}

// ================= STUDENT LEAVE HISTORY =================

async function loadLeaveHistory() {
    if (!userId || !authToken || currentRole !== "student") {
        return;
    }

    try {
        const response = await fetch(
            `${API_URL}/api/my-leaves/${userId}`,
            {
                headers: getAuthHeaders()
            }
        );

        const leaves = await response.json();

        if (!response.ok) {
            showMessage(
                "response-message",
                leaves.message || "Could not load leave history."
            );
            return;
        }

        const tableBody = document.getElementById("leave-history-body");

        if (!tableBody) return;

        if (!leaves.length) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7">No leave requests found.</td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = leaves.map(leave => `
            <tr>
                <td>${escapeHTML(leave.leaveType)}</td>
                <td>${formatDate(leave.startDate)}</td>
                <td>${formatDate(leave.endDate)}</td>
                <td>${escapeHTML(leave.days)}</td>
                <td>${escapeHTML(leave.reason)}</td>
                <td>${escapeHTML(leave.status)}</td>
                <td>${formatDate(leave.reviewedAt)}</td>
            </tr>
        `).join("");

    } catch (error) {
        console.error("Leave history error:", error);
        showMessage("response-message", "Could not load leave history.");
    }
}

// ================= STAFF DASHBOARD =================

async function loadStaffDashboard() {
    if (
        !authToken ||
        !["staff", "admin"].includes(currentRole)
    ) {
        return;
    }

    try {
        const response = await fetch(
            `${API_URL}/api/staff/dashboard`,
            {
                headers: getAuthHeaders()
            }
        );

        const data = await response.json();

        if (!response.ok) {
            showMessage(
                "response-message",
                data.message || "Could not load Staff dashboard."
            );
            return;
        }

        document.getElementById("total-students").innerText =
            data.stats.totalStudents ?? 0;

        document.getElementById("pending-count").innerText =
            data.stats.pending ?? 0;

        document.getElementById("approved-count").innerText =
            data.stats.approved ?? 0;

        document.getElementById("rejected-count").innerText =
            data.stats.rejected ?? 0;

        renderStudentList(data.students || []);
        renderStaffLeaveRequests(data.leaves || []);

    } catch (error) {
        console.error("Staff dashboard error:", error);
        showMessage("response-message", "Could not load Staff dashboard.");
    }
}

// ================= STUDENT DETAILS =================

function renderStudentList(students) {
    const tableBody = document.getElementById("staff-students-body");

    if (!tableBody) return;

    if (!students.length) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5">No student details found.</td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = students.map(student => `
        <tr>
            <td>${escapeHTML(student.username)}</td>
            <td>${escapeHTML(student.email)}</td>
            <td>${escapeHTML(student.rollNumber)}</td>
            <td>${escapeHTML(student.casualLeave)}</td>
            <td>${escapeHTML(student.medicalLeave)}</td>
        </tr>
    `).join("");
}

// ================= STAFF LEAVE REQUESTS =================

function renderStaffLeaveRequests(leaves) {
    const tableBody = document.getElementById("staff-leaves-body");

    if (!tableBody) return;

    if (!leaves.length) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="10">No leave requests found.</td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = leaves.map(leave => {
        const student = leave.user || {};
        const pending = leave.status === "Pending";

        return `
            <tr>
                <td>${escapeHTML(student.username || "Unknown")}</td>
                <td>${escapeHTML(student.rollNumber || "-")}</td>
                <td>${escapeHTML(leave.leaveType)}</td>
                <td>${formatDate(leave.startDate)}</td>
                <td>${formatDate(leave.endDate)}</td>
                <td>${escapeHTML(leave.days)}</td>
                <td>${escapeHTML(leave.reason)}</td>
                <td>${escapeHTML(leave.status)}</td>
                <td>${formatDate(leave.reviewedAt)}</td>
                <td>
                    ${
                        pending
                        ? `
                            <div class="action-buttons">

                                <button type="button"
                                    class="btn approve-btn"
                                    data-leave-id="${escapeHTML(leave._id)}"
                                    data-status="Approved">
                                    Approve
                                </button>

                                <button type="button"
                                    class="btn reject-btn"
                                    data-leave-id="${escapeHTML(leave._id)}"
                                    data-status="Rejected">
                                    Reject
                                </button>

                            </div>
                        `
                        : "-"
                    }
                </td>
            </tr>
        `;
    }).join("");
}

// ================= STAFF APPROVE / REJECT =================

async function updateLeaveStatus(leaveId, status) {
    if (
        !authToken ||
        !["staff", "admin"].includes(currentRole)
    ) {
        showMessage("response-message", "Staff access only.");
        return;
    }

    const confirmed = confirm(
        `Are you sure you want to ${status.toLowerCase()} this leave request?`
    );

    if (!confirmed) return;

    try {
        const response = await fetch(
            `${API_URL}/api/staff/leaves/${leaveId}/status`,
            {
                method: "PATCH",
                headers: getAuthHeaders(),
                body: JSON.stringify({ status })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            showMessage(
                "response-message",
                data.message || "Could not update leave status."
            );
            return;
        }

        showMessage(
            "response-message",
            data.message || "Leave status updated successfully."
        );

        await loadStaffDashboard();

    } catch (error) {
        console.error("Leave approval error:", error);
        showMessage("response-message", "Cannot connect to server.");
    }
}

// ================= EVENT LISTENERS =================

document.addEventListener("DOMContentLoaded", function () {

    document.getElementById("registration-form")
        ?.addEventListener("submit", registerUser);

    document.getElementById("login-form")
        ?.addEventListener("submit", loginUser);

    document.getElementById("show-registration")
        ?.addEventListener("click", showRegistrationForm);

    document.getElementById("show-login")
        ?.addEventListener("click", showLoginForm);

    document.getElementById("refresh-balance")
        ?.addEventListener("click", refreshLeaveBalance);

    document.getElementById("logout-button")
        ?.addEventListener("click", logoutUser);

    document.getElementById("leave-form")
        ?.addEventListener("submit", applyLeave);

    document.getElementById("refresh-staff")
        ?.addEventListener("click", loadStaffDashboard);

    // Approve / Reject buttons
    document.getElementById("staff-leaves-body")
        ?.addEventListener("click", function (event) {

            const button = event.target.closest(
                "button[data-leave-id]"
            );

            if (!button) return;

            updateLeaveStatus(
                button.dataset.leaveId,
                button.dataset.status
            );
        });

});
