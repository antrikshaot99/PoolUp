# PoolUp - University Carpooling Service

PoolUp is a dynamic web application designed to connect students from the same university for safe, affordable, and convenient carpooling. This platform allows users to offer rides, book seats in available carpools, and communicate in real-time, fostering a connected campus community.

---

## ✨ Key Features

- **User Authentication**: Secure registration and login system for students and a dedicated admin role.
- **Offer & Book Rides**: Logged-in users can create carpool offers, detailing their car, route, time, and price. Other students can browse and book available seats.
- **Dynamic Dashboard**: Central hub for users to view all available carpool offers. Drivers can see who has booked their ride, and passengers can cancel their bookings.
- **Admin Management**: Special admin view allows monitoring and deleting any carpool offer.
- **Real-Time Chat**: WebSocket-powered chat for direct coordination between passengers and drivers.
- **Interactive UI**: Modern, futuristic front-end with a purple/blue theme, "glassmorphism" cards, subtle animations, and fully responsive design.

---

## 💻 Technology Stack

- **Backend**: Node.js, Express.js  
- **Database**: MongoDB with Mongoose  
- **Templating Engine**: EJS with EJS-Layouts  
- **Authentication**: JSON Web Tokens (JWT) stored in cookies  
- **Real-Time Communication**: WebSockets (`ws` library)  
- **Front-End**: HTML5, CSS3 (internal stylesheets)  

---

## 🚀 Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-username/poolup.git

cd poolup

# 2. Install NPM packages
npm install

# 3. Create a .env file in the root directory and add environment variables

# Replace placeholders with your actual values

echo "PORT=3000

MONGO_URI=your_mongodb_connection_string

JWT_SECRET=a_very_secret_key_for_jwt

ADMIN_EMAIL=admin@yourcollege.edu

ADMIN_PASSWORD=your_secure_admin_password" > .env

# 4. Run the application
node server.js
