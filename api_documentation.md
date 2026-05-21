# e-Prashikshan 2.0 (LMS) - Detailed API Documentation

This document outlines the REST APIs exposed by the Express.js backend. The APIs are secured using JWT-based authentication and Role-Based Access Control (RBAC).

---

## 1. Authentication Routes (`/api/auth`)
Handles user registration, login, two-factor authentication (OTP), password recovery, and email verification.

| Method | Endpoint | Description | Access Level |
|--------|----------|-------------|--------------|
| `POST` | `/register` | Register a new user | Public |
| `POST` | `/login` | Authenticate user & get token | Public |
| `POST` | `/login-secure` | Enhanced login with device trust/check | Public |
| `POST` | `/verify-otp` | Verify OTP for login | Public |
| `POST` | `/resend-otp` | Resend OTP to user | Public |
| `POST` | `/forgot-password` | Initiate password recovery | Public |
| `GET`  | `/verify-reset-token/:token` | Verify password reset token | Public |
| `POST` | `/reset-password` | Set new password using token | Public |
| `POST` | `/send-verification` | Send email verification link | Public (Rate Limited) |
| `GET`  | `/verify-email/:token` | Verify email with token | Public |
| `GET`  | `/verification-status` | Check if current user is verified | Authenticated |
| `POST` | `/resend-verification` | Resend verification email | Authenticated |
| `GET`  | `/devices` | Get trusted devices for the user | Authenticated |
| `DELETE`| `/devices` | Remove all trusted devices | Authenticated |
| `DELETE`| `/devices/:deviceId` | Remove a specific trusted device | Authenticated |
| `POST` | `/unlock-account/:userId`| Unlock a locked user account | Admin |

---

## 2. User Routes (`/api/users`)
Handles core user operations, including bulk imports and administrative actions.

| Method | Endpoint | Description | Access Level |
|--------|----------|-------------|--------------|
| `GET`  | `/me` | Get current user's core profile data | Authenticated |
| `GET`  | `/` | Get all users (with pagination/filters) | Admin |
| `POST` | `/` | Create a new user manually | Admin |
| `GET`  | `/:id` | Get specific user by ID | Admin |
| `PATCH`| `/:id` | Update specific user details | Admin |
| `DELETE`| `/:id` | Soft delete a user | Admin |
| `GET`  | `/stats` | Get system-wide user statistics | Admin |
| `POST` | `/:id/reset-password`| Force reset a user's password | Admin |
| `POST` | `/:id/unlock` | Manually unlock a user's account | Admin |
| `GET`  | `/csv-template` | Download CSV template for import | Admin |
| `GET`  | `/export` | Export users to CSV format | Admin |
| `POST` | `/bulk-import/preview`| Validate CSV without importing | Admin |
| `POST` | `/bulk-import/execute`| Execute validated CSV import | Admin |

---

## 3. Profile Routes (`/api/profile`)
Handles extended user profile data, avatars, skills, education, and preferences.

| Method | Endpoint | Description | Access Level |
|--------|----------|-------------|--------------|
| `GET`  | `/me` | Get the full extended profile | Authenticated |
| `PATCH`| `/me` | Update general profile details | Authenticated |
| `GET`  | `/me/preferences` | Get user preferences | Authenticated |
| `PATCH`| `/me/preferences` | Update user preferences | Authenticated |
| `PATCH`| `/me/avatar` | Update profile avatar image | Authenticated |
| `DELETE`| `/me/avatar` | Delete profile avatar image | Authenticated |
| `POST` | `/me/education` | Add an education record | Authenticated |
| `DELETE`| `/me/education/:index` | Remove an education record | Authenticated |
| `POST` | `/me/certifications` | Add a certification | Authenticated |
| `DELETE`| `/me/certifications/:index`| Remove a certification | Authenticated |
| `PATCH`| `/me/skills` | Update user skills | Authenticated |
| `GET`  | `/me/completion` | Get profile completion percentage | Authenticated |
| `GET`  | `/user/:userId` | View another user's public profile | Authenticated |

---

## 4. Course Routes (`/api/courses`)
Handles creation, updating, and fetching of courses.

| Method | Endpoint | Description | Access Level |
|--------|----------|-------------|--------------|
| `GET`  | `/` | Get all courses | Authenticated |
| `GET`  | `/:id` | Get specific course details | Authenticated |
| `POST` | `/` | Create a new course | Authenticated (Teacher/Admin) |
| `PUT`  | `/:id` | Update an existing course | Authenticated (Teacher/Admin) |
| `DELETE`| `/:id` | Delete an existing course | Authenticated (Teacher/Admin) |

---

## 5. Role Routes (`/api/roles`)
Handles the management of custom roles and permissions.

| Method | Endpoint | Description | Access Level |
|--------|----------|-------------|--------------|
| `GET`  | `/` | Get all system roles | Authenticated |
| `GET`  | `/:name` | Get specific role by name | Authenticated |
| `GET`  | `/permissions/list` | Get all available permissions | Authenticated |
| `POST` | `/seed` | Seed default roles & permissions | Admin |
| `POST` | `/` | Create a custom role | Admin |
| `PATCH`| `/:name` | Update a custom role | Admin |
| `DELETE`| `/:name` | Delete a custom role | Admin |
| `POST` | `/permissions` | Create a custom permission | Admin |
| `PATCH`| `/permissions/:key` | Update a custom permission | Admin |
| `DELETE`| `/permissions/:key` | Delete a custom permission | Admin |

---

## 6. RBAC (Role-Based Access Control) Routes (`/api/rbac`)
Handles the assignment of roles to users contextually.

| Method | Endpoint | Description | Access Level |
|--------|----------|-------------|--------------|
| `GET`  | `/roles` | Get available roles & permissions | Authenticated |
| `GET`  | `/effective` | Get effective role in context | Authenticated |
| `POST` | `/check-permission` | Verify if user has a permission | Authenticated |
| `GET`  | `/assignments` | Get all role assignments | Admin / Manager |
| `POST` | `/assignments` | Assign a role to a user | Admin / Manager |
| `GET`  | `/assignments/user/:userId`| Get assignments for specific user | Admin / Manager |
| `GET`  | `/users-with-role` | Get users having a specific role | Admin / Manager |
| `PATCH`| `/assignments/:id` | Update a role assignment | Admin / Manager |
| `DELETE`| `/assignments/:id` | Revoke a role assignment | Admin / Manager |

---

## 7. Audit Routes (`/api/audit`)
Handles system-wide activity logging and compliance tracking.

| Method | Endpoint | Description | Access Level |
|--------|----------|-------------|--------------|
| `GET`  | `/logs` | Get audit logs with filters | Admin |
| `GET`  | `/stats` | Get audit statistics | Admin |
| `GET`  | `/user/:userId` | Get activity logs for a user | Admin |
| `GET`  | `/security` | Get security-related events | Admin |
| `GET`  | `/actions` | Get available tracked action types | Admin |

---
**Note:** The base URLs mentioned in the endpoints above are relative to the backend API base address (e.g., `http://localhost:5000/api` or `https://api.domain.com/api`).