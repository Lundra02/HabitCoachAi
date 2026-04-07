# 🌿 HabitCoachAI

HabitCoachAI is a full-stack web application built using the MERN stack (MongoDB, Express, Vanilla JS, Node.js). It provides users with a platform to track their daily habits with an integrated, highly curated AI Chat Assistant (powered by llmapi.ai) to act as a 24/7 accountability partner.

## 🚀 Tech Stack
- **Backend Environment:** Node.js, Express.js
- **Database:** MongoDB (Mongoose ODMs)
- **Frontend:** Vanilla HTML5, CSS3, JavaScript
- **Authentication:** JWT (JSON Web Tokens) & bcryptjs
- **External APIs:** [llmapi.ai](https://llmapi.ai/) integration via `axios`

## ✨ Features
1. **User Authentication:** 
   - Secure login and registration.
   - Passwords securely hashed with bcrypt.
   - Endpoint protections verified securely over HTTP Bearer headers.
   
2. **Habit Tracking (CRUD):** 
   - Users can create, read, complete, and delete habits.
   - Complete Data Isolation: Users can only see and interact with their own data using targeted User IDs.

3. **AI Chat Partner:** 
   - Hardened `POST /api/chat` router handling frontend LLM requests cleanly.
   - Integrated with llmapi.ai (`gpt-4o-mini`) using `axios` implementation.
   - Built-in `AbortController` timeouts for gracefully handling AI API outages or timeouts.

## 🛠️ Local Setup & Installation

### 1. Requirements
- Node.js (v18+)
- MongoDB (Running locally on `27017` or via MongoDB Atlas)

### 2. Install Dependencies
Clone the repository and install the NPM packages.
```bash
git clone https://github.com/Lundra02/HabitCoachAi.git
cd HabitCoachAi
npm install
```

### 3. Environment Config (.env)
Create a `.env` file at the root of the project with the following configuration:
```env
# MongoDB Connection String (Atlas URI or Localhost)
MONGO_URI=mongodb://localhost:27017/habitcoach

# JWT Secret Key for token signing
JWT_SECRET=super_secret_key_change_me_in_production

# Live llmapi.ai Access Key
AI_API_KEY=your_llmapi_key_here

# (Optional) Restrict backend access to a specific frontend URL
FRONTEND_URL=http://localhost:3000
```

### 4. Run the Server
Launch the application.
```bash
npm run dev
# OR
node habitCooach.js
```
The application will execute on `http://localhost:3000`.

## 🌐 API Reference

### Auth Routes
- `POST /api/register` : Creates a new user in the DB.
- `POST /api/login` : Authenticates a user and returns a Web Token.

### Habit Routes (Protected)
- `GET /api/habits` : Return a list of all habits isolated for the active user.
- `POST /api/habits` : Create a single habit. Ensure `{ title, description }` are established.
- `PUT /api/habits/:id` : Edits a habit (e.g. marking it as pending or completed).
- `DELETE /api/habits/:id` : Safely removes a habit instance.

### Chat Routes (Protected)
- `POST /api/chat` : Resolves an AI API conversation array based on `{ prompt }`. Handles timeouts automatically mapped down to `10000ms`.

## 📦 Deployment Instructions

1. **Database:** Create a managed MongoDB Atlas Cluster. Retrieve your connection string.
2. **Platform:** Connect your repository to a Node.js-compatible host environment (e.g., Render, Railway, or Heroku).
3. **Environment Tokens:** Provide the Environmental fields `.env` to your hosting platform's Dashboard settings. Make sure `JWT_SECRET` is generated randomly strings.
4. **Boot Command:** Target `node habitCooach.js` as the project's start command.
5. **CORS Configuration:** Our codebase scales flawlessly with disjointed hosting. Ensure `process.env.FRONTEND_URL` targets the URL where your front end lives (Netlify/Vercel) to tightly secure Origin requests.

---
*Built securely. Migrated exclusively to llmapi.ai.*
